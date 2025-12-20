"""
Bunkr Album Scraper - FastAPI Backend
Extracts media URLs from Bunkr albums
"""

import asyncio
import logging
import time
import sqlite3
import json
import re
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional, List
from urllib.parse import urlparse, urljoin

import httpx
from bs4 import BeautifulSoup
from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from playwright.async_api import async_playwright

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)
logger = logging.getLogger(__name__)

# SQLite Cache Configuration
CACHE_DB_PATH = Path("cache.db")
CACHE_DURATION_HOURS = 24  # Cache for 24 hours

# Video Download Cache Configuration
DOWNLOADS_DIR = Path("downloads")
DOWNLOADS_DIR.mkdir(exist_ok=True)
MAX_CACHE_SIZE_GB = 10  # Maximum cache size in GB
MAX_FILE_SIZE_MB = 50  # Only cache files smaller than this
MAX_CACHE_SIZE_BYTES = MAX_CACHE_SIZE_GB * 1024 * 1024 * 1024
MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024


def init_cache_db():
    """Initialize the SQLite cache database"""
    conn = sqlite3.connect(CACHE_DB_PATH)
    cursor = conn.cursor()

    # Create cache table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS api_cache (
            cache_key TEXT PRIMARY KEY,
            response_data TEXT NOT NULL,
            created_at TIMESTAMP NOT NULL,
            expires_at TIMESTAMP NOT NULL
        )
    """)

    # Create index on expires_at for faster cleanup
    cursor.execute("""
        CREATE INDEX IF NOT EXISTS idx_expires_at ON api_cache(expires_at)
    """)

    # Create downloads table for cached video files
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS downloads (
            url TEXT PRIMARY KEY,
            filename TEXT NOT NULL,
            size_bytes INTEGER NOT NULL,
            created_at TIMESTAMP NOT NULL,
            last_accessed TIMESTAMP NOT NULL,
            verified INTEGER DEFAULT 0
        )
    """)

    # Create index on last_accessed for LRU eviction
    cursor.execute("""
        CREATE INDEX IF NOT EXISTS idx_last_accessed ON downloads(last_accessed)
    """)

    conn.commit()
    conn.close()
    logger.info(f"Cache database initialized at {CACHE_DB_PATH}")


def get_from_cache(cache_key: str) -> Optional[dict]:
    """Retrieve data from cache if valid"""
    try:
        conn = sqlite3.connect(CACHE_DB_PATH)
        cursor = conn.cursor()

        cursor.execute("""
            SELECT response_data, expires_at
            FROM api_cache
            WHERE cache_key = ?
        """, (cache_key,))

        result = cursor.fetchone()
        conn.close()

        if result:
            response_data, expires_at = result
            expires_datetime = datetime.fromisoformat(expires_at)

            # Check if cache is still valid
            if datetime.now() < expires_datetime:
                logger.info(f"Cache HIT: {cache_key}")
                return json.loads(response_data)
            else:
                logger.info(f"Cache EXPIRED: {cache_key}")
                # Delete expired entry
                delete_from_cache(cache_key)
        else:
            logger.info(f"Cache MISS: {cache_key}")

        return None
    except Exception as e:
        logger.error(f"Cache retrieval error: {str(e)}")
        return None


def save_to_cache(cache_key: str, response_data: dict, duration_hours: int = CACHE_DURATION_HOURS):
    """Save data to cache"""
    try:
        conn = sqlite3.connect(CACHE_DB_PATH)
        cursor = conn.cursor()

        created_at = datetime.now()
        expires_at = created_at + timedelta(hours=duration_hours)

        cursor.execute("""
            INSERT OR REPLACE INTO api_cache (cache_key, response_data, created_at, expires_at)
            VALUES (?, ?, ?, ?)
        """, (
            cache_key,
            json.dumps(response_data),
            created_at.isoformat(),
            expires_at.isoformat()
        ))

        conn.commit()
        conn.close()
        logger.info(f"Cache SAVE: {cache_key} (expires in {duration_hours}h)")
    except Exception as e:
        logger.error(f"Cache save error: {str(e)}")


def delete_from_cache(cache_key: str):
    """Delete specific cache entry"""
    try:
        conn = sqlite3.connect(CACHE_DB_PATH)
        cursor = conn.cursor()
        cursor.execute("DELETE FROM api_cache WHERE cache_key = ?", (cache_key,))
        conn.commit()
        conn.close()
    except Exception as e:
        logger.error(f"Cache delete error: {str(e)}")


def cleanup_expired_cache():
    """Remove all expired cache entries"""
    try:
        conn = sqlite3.connect(CACHE_DB_PATH)
        cursor = conn.cursor()

        cursor.execute("""
            DELETE FROM api_cache
            WHERE expires_at < ?
        """, (datetime.now().isoformat(),))

        deleted_count = cursor.rowcount
        conn.commit()
        conn.close()

        if deleted_count > 0:
            logger.info(f"Cleaned up {deleted_count} expired cache entries")
    except Exception as e:
        logger.error(f"Cache cleanup error: {str(e)}")


def get_cache_size() -> int:
    """Get total size of download cache in bytes"""
    try:
        conn = sqlite3.connect(CACHE_DB_PATH)
        cursor = conn.cursor()
        cursor.execute("SELECT COALESCE(SUM(size_bytes), 0) FROM downloads")
        total_size = cursor.fetchone()[0]
        conn.close()
        return total_size
    except Exception as e:
        logger.error(f"Error getting cache size: {str(e)}")
        return 0


def evict_lru_downloads(bytes_needed: int):
    """Evict least recently used downloads to make space"""
    try:
        conn = sqlite3.connect(CACHE_DB_PATH)
        cursor = conn.cursor()

        # Get LRU downloads until we have enough space
        cursor.execute("""
            SELECT url, filename, size_bytes
            FROM downloads
            ORDER BY last_accessed ASC
        """)

        freed_space = 0
        for url, filename, size_bytes in cursor.fetchall():
            if freed_space >= bytes_needed:
                break

            # Delete file
            file_path = DOWNLOADS_DIR / filename
            try:
                if file_path.exists():
                    file_path.unlink()
                    logger.info(f"Evicted cached file: {filename} ({size_bytes / 1024 / 1024:.2f} MB)")

                # Remove from database
                cursor.execute("DELETE FROM downloads WHERE url = ?", (url,))
                freed_space += size_bytes
            except Exception as e:
                logger.error(f"Error evicting file {filename}: {str(e)}")

        conn.commit()
        conn.close()

        if freed_space > 0:
            logger.info(f"Evicted {freed_space / 1024 / 1024:.2f} MB from cache")
    except Exception as e:
        logger.error(f"Error during LRU eviction: {str(e)}")


async def download_and_cache(url: str, client: httpx.AsyncClient) -> Optional[str]:
    """Download a file and cache it locally if it's small enough"""
    try:
        # Check if already cached
        conn = sqlite3.connect(CACHE_DB_PATH)
        cursor = conn.cursor()
        cursor.execute("SELECT filename FROM downloads WHERE url = ?", (url,))
        result = cursor.fetchone()

        if result:
            filename = result[0]
            # Update last_accessed
            cursor.execute(
                "UPDATE downloads SET last_accessed = ? WHERE url = ?",
                (datetime.now().isoformat(), url)
            )
            conn.commit()
            conn.close()

            file_path = DOWNLOADS_DIR / filename
            if file_path.exists():
                logger.info(f"Using cached file: {filename}")
                return f"/downloads/{filename}"

        conn.close()

        # Check file size with HEAD request
        try:
            head_response = await client.head(url, follow_redirects=True, timeout=10.0)
            content_length = head_response.headers.get("content-length")

            if not content_length:
                logger.debug(f"No content-length header for {url}, skipping cache")
                return None

            file_size = int(content_length)

            if file_size > MAX_FILE_SIZE_BYTES:
                logger.debug(f"File too large ({file_size / 1024 / 1024:.2f} MB), skipping cache")
                return None

            logger.info(f"File size: {file_size / 1024 / 1024:.2f} MB, downloading...")
        except Exception as e:
            logger.debug(f"Error checking file size: {str(e)}, skipping cache")
            return None

        # Check if we have enough space
        current_size = get_cache_size()
        if current_size + file_size > MAX_CACHE_SIZE_BYTES:
            # Try to evict enough space
            bytes_needed = (current_size + file_size) - MAX_CACHE_SIZE_BYTES
            logger.info(f"Cache full, evicting {bytes_needed / 1024 / 1024:.2f} MB...")
            evict_lru_downloads(bytes_needed)

        # Download the file
        response = await client.get(url, follow_redirects=True, timeout=60.0)
        response.raise_for_status()

        # Generate filename from URL
        import hashlib
        url_hash = hashlib.md5(url.encode()).hexdigest()[:12]
        extension = url.split('?')[0].split('.')[-1].lower()
        if extension not in ['mp4', 'webm', 'mov', 'avi', 'mkv', 'jpg', 'jpeg', 'png', 'gif', 'webp']:
            extension = 'mp4'  # Default to mp4
        filename = f"{url_hash}.{extension}"
        file_path = DOWNLOADS_DIR / filename

        # Save file
        with open(file_path, 'wb') as f:
            f.write(response.content)

        # Add to database
        conn = sqlite3.connect(CACHE_DB_PATH)
        cursor = conn.cursor()
        now = datetime.now().isoformat()
        cursor.execute("""
            INSERT OR REPLACE INTO downloads (url, filename, size_bytes, created_at, last_accessed)
            VALUES (?, ?, ?, ?, ?)
        """, (url, filename, file_size, now, now))
        conn.commit()
        conn.close()

        logger.info(f"Cached file: {filename} ({file_size / 1024 / 1024:.2f} MB)")
        return f"/downloads/{filename}"

    except Exception as e:
        logger.error(f"Error downloading file: {str(e)}")
        return None


# Initialize cache on startup
init_cache_db()
cleanup_expired_cache()

app = FastAPI(title="Bunkr Album Scraper")


# Request logging middleware
@app.middleware("http")
async def log_requests(request: Request, call_next):
    start_time = time.time()

    # Log request details
    logger.info(f"Request: {request.method} {request.url.path}")
    logger.debug(f"Query params: {dict(request.query_params)}")
    logger.debug(f"Client: {request.client.host if request.client else 'Unknown'}")

    try:
        response = await call_next(request)

        # Log response
        process_time = (time.time() - start_time) * 1000
        logger.info(
            f"Response: {request.method} {request.url.path} - "
            f"Status: {response.status_code} - "
            f"Time: {process_time:.2f}ms"
        )

        return response
    except Exception as e:
        process_time = (time.time() - start_time) * 1000
        logger.error(
            f"Request failed: {request.method} {request.url.path} - "
            f"Time: {process_time:.2f}ms - "
            f"Error: {str(e)}"
        )
        raise HTTPException(status_code=500, detail=str(e))


# Enable CORS for development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def extract_album_id_from_url(url: str) -> str:
    """Extract album ID from Bunkr URL"""
    # Examples:
    # https://bunkr.si/a/album_id
    # https://bunkrr.su/a/album_id
    # https://bunkr.la/a/album_id
    match = re.search(r'/a/([a-zA-Z0-9_-]+)', url)
    if match:
        return match.group(1)

    # If no match, assume the entire URL is the album ID
    return url


async def scrape_file_page(client: httpx.AsyncClient, file_url: str, base_domain: str) -> Optional[str]:
    """Scrape an individual file page to get the actual CDN URL"""
    try:
        response = await client.get(file_url)
        response.raise_for_status()

        soup = BeautifulSoup(response.text, 'html.parser')

        # Look for download button link to download page
        download_button = soup.find('a', string=re.compile(r'Download', re.I))
        if not download_button:
            # Try finding by class
            download_button = soup.find('a', href=re.compile(r'https?://get\.[^/]*bunkr'))

        if download_button and download_button.get('href'):
            download_page_url = download_button.get('href')
            logger.debug(f"Found download page URL: {download_page_url}")

            # Use Playwright to execute JavaScript and get actual CDN URL
            cdn_url = await get_cdn_url_with_playwright(download_page_url)
            if cdn_url:
                return cdn_url

        logger.warning(f"Could not find CDN URL on file page: {file_url}")
        return None
    except Exception as e:
        logger.error(f"Error scraping file page {file_url}: {str(e)}")
        return None


async def get_cdn_url_with_playwright(download_page_url: str) -> Optional[str]:
    """Use Playwright to execute JavaScript and get the actual CDN URL"""
    try:
        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True)
            context = await browser.new_context()
            page = await context.new_page()

            cdn_url = None

            # Intercept all requests/responses
            async def handle_request(request):
                nonlocal cdn_url
                url = request.url
                # Ignore ads and tracking URLs
                if any(x in url.lower() for x in ['ad.', '/ad/', 'adraw', 'twinrdengine', 'mndx1']):
                    return
                # Look for CDN URLs in outgoing requests (must be from bunkr domains or media CDNs)
                if re.search(r'(cdn|media-files|stream|fs-)\d*\.(bunkr|bunkrr)', url, re.I):
                    if re.search(r'\.(mp4|webm|mov|avi|mkv|jpg|jpeg|png|gif|webp)', url, re.I):
                        logger.debug(f"Intercepted request to CDN: {url}")
                        cdn_url = url

            async def handle_response(response):
                nonlocal cdn_url
                url = response.url
                # Ignore ads and tracking URLs
                if any(x in url.lower() for x in ['ad.', '/ad/', 'adraw', 'twinrdengine', 'mndx1', 'icon_']):
                    return
                # Look for media file URLs in responses or redirects (must be from bunkr domains)
                if re.search(r'\.(mp4|webm|mov|avi|mkv|jpg|jpeg|png|gif|webp)(\?|$)', url, re.I):
                    if 'bunkr' in url.lower() or re.search(r'(cdn|media-files|stream|fs-)\d*\.', url, re.I):
                        logger.debug(f"Intercepted response from CDN: {url}")
                        cdn_url = url

            page.on('request', handle_request)
            page.on('response', handle_response)

            # Navigate to download page
            await page.goto(download_page_url, wait_until='domcontentloaded', timeout=15000)

            # Wait for button and try to click it
            try:
                download_btn = await page.wait_for_selector('a#download-btn', timeout=5000)
                if download_btn:
                    # Wait a moment for JS to execute
                    await page.wait_for_timeout(1000)

                    # Get the href
                    href = await download_btn.get_attribute('href')
                    logger.debug(f"Download button href: {href}")

                    if href and href != '#':
                        if re.search(r'\.(mp4|webm|mov|avi|mkv|jpg|jpeg|png|gif|webp)', href, re.I):
                            cdn_url = href
                        elif href.startswith('http'):
                            cdn_url = href

                    # Try clicking to trigger any navigation/download
                    if not cdn_url:
                        try:
                            await download_btn.click(timeout=3000)
                            await page.wait_for_timeout(1000)
                        except:
                            pass
            except Exception as e:
                logger.debug(f"Button interaction error: {str(e)}")

            await browser.close()

            if cdn_url:
                return cdn_url
            else:
                logger.warning(f"Playwright could not find CDN URL on: {download_page_url}")
                return None

    except Exception as e:
        logger.error(f"Playwright error for {download_page_url}: {str(e)}")
        return None


async def scrape_bunkr_album(album_url: str) -> List[dict]:
    """Scrape a Bunkr album and extract all media URLs"""
    logger.info(f"Scraping Bunkr album: {album_url}")

    media_items = []

    try:
        async with httpx.AsyncClient(
            follow_redirects=True,
            timeout=30.0,
            headers={
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
                "Accept-Language": "en-US,en;q=0.5",
                "Referer": "https://bunkr.si/",
            }
        ) as client:
            # Fetch the album page
            response = await client.get(album_url)
            response.raise_for_status()

            # Parse HTML
            soup = BeautifulSoup(response.text, 'html.parser')

            # Extract base domain from album URL
            parsed_url = urlparse(album_url)
            base_domain = f"{parsed_url.scheme}://{parsed_url.netloc}"

            # Find all links to file pages (pattern: /f/{fileId})
            file_links = soup.find_all('a', href=re.compile(r'^/f/[a-zA-Z0-9]+$'))
            logger.info(f"Found {len(file_links)} file links in album")

            # Extract file page URLs
            file_urls = []
            for link in file_links:
                href = link.get('href')
                if href:
                    # Construct full file page URL
                    file_page_url = f"{base_domain}{href}"
                    file_urls.append(file_page_url)
                    logger.debug(f"Found file link: {href} -> {file_page_url}")

            logger.info(f"Extracted {len(file_urls)} file page URLs")

            # Visit each file page to get actual CDN URL
            for file_url in file_urls:
                cdn_url = await scrape_file_page(client, file_url, base_domain)
                if cdn_url:
                    # Determine media type
                    media_type = 'unknown'
                    if re.search(r'\.(mp4|webm|mov|avi|mkv)$', cdn_url, re.I):
                        media_type = 'video'
                    elif re.search(r'\.(jpg|jpeg|png|gif|webp)$', cdn_url, re.I):
                        media_type = 'image'

                    media_items.append({
                        'url': cdn_url,
                        'type': media_type,
                        'thumbnail': None,
                        'filename': cdn_url.split('/')[-1] if '/' in cdn_url else cdn_url,
                        'file_page': file_url
                    })

                # Small delay to avoid rate limiting
                await asyncio.sleep(0.1)

            logger.info(f"Extracted {len(media_items)} media items from album")
            return media_items

    except httpx.HTTPError as e:
        logger.error(f"HTTP error while scraping album: {str(e)}")
        raise HTTPException(status_code=502, detail=f"Failed to fetch album: {str(e)}")
    except Exception as e:
        logger.error(f"Error scraping album: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to scrape album: {str(e)}")


@app.get("/")
async def root():
    """API root"""
    return {
        "service": "Bunkr Album Scraper",
        "version": "1.0.0",
        "endpoints": {
            "/api/album": "Scrape Bunkr album by URL (query param: url)"
        }
    }


@app.get("/api/album")
async def get_album(url: str = Query(..., description="Bunkr album URL")):
    """Scrape a Bunkr album and return all media URLs"""
    try:
        # Create cache key from URL
        cache_key = f"album:{url}"

        # Try to get from cache first
        cached_response = get_from_cache(cache_key)
        if cached_response:
            return cached_response

        # Cache miss - scrape the album
        media_items = await scrape_bunkr_album(url)

        response_data = {
            "album_url": url,
            "total_items": len(media_items),
            "media": media_items
        }

        # Save to cache
        save_to_cache(cache_key, response_data)

        return response_data

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to process album: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/proxy")
async def proxy_media(url: str = Query(..., description="URL to proxy")):
    """Proxy media files from Bunkr to bypass CORS restrictions

    Downloads and caches small files on-demand, serves from cache if available
    """
    try:
        # Check if file is cached and verified
        conn = sqlite3.connect(CACHE_DB_PATH)
        cursor = conn.cursor()
        cursor.execute("SELECT filename, verified FROM downloads WHERE url = ?", (url,))
        result = cursor.fetchone()

        if result:
            filename, verified = result
            file_path = DOWNLOADS_DIR / filename

            if file_path.exists() and verified:
                # Update last_accessed
                cursor.execute(
                    "UPDATE downloads SET last_accessed = ? WHERE url = ?",
                    (datetime.now().isoformat(), url)
                )
                conn.commit()
                conn.close()

                logger.info(f"Serving cached file: {filename}")
                return FileResponse(
                    file_path,
                    headers={
                        "Cache-Control": "public, max-age=86400",
                        "Access-Control-Allow-Origin": "*"
                    }
                )

        conn.close()

        # Not cached or not verified - download and cache if small enough
        async with httpx.AsyncClient() as client:
            # Try to download and cache
            cached_path = await download_and_cache(url, client)

            if cached_path:
                # File was cached, serve from cache
                filename = cached_path.split('/')[-1]
                file_path = DOWNLOADS_DIR / filename
                logger.info(f"Serving newly cached file: {filename}")
                return FileResponse(
                    file_path,
                    headers={
                        "Cache-Control": "public, max-age=86400",
                        "Access-Control-Allow-Origin": "*"
                    }
                )

            # File too large or cache failed, proxy from CDN
            response = await client.get(
                url,
                headers={
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                    "Referer": "https://bunkr.si/"
                },
                follow_redirects=True,
                timeout=30.0
            )
            response.raise_for_status()

            # Determine content type
            content_type = response.headers.get("content-type", "application/octet-stream")

            return StreamingResponse(
                iter([response.content]),
                media_type=content_type,
                headers={
                    "Cache-Control": "public, max-age=86400",
                    "Access-Control-Allow-Origin": "*"
                }
            )
    except httpx.HTTPError as e:
        logger.error(f"Failed to proxy URL {url}: {str(e)}")
        raise HTTPException(status_code=502, detail=f"Failed to fetch media: {str(e)}")
    except Exception as e:
        logger.error(f"Unexpected error proxying URL {url}: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/verify-cache")
async def verify_cache(url: str = Query(..., description="URL to verify")):
    """Mark a cached file as successfully streamed"""
    try:
        conn = sqlite3.connect(CACHE_DB_PATH)
        cursor = conn.cursor()
        cursor.execute("UPDATE downloads SET verified = 1 WHERE url = ?", (url,))
        conn.commit()
        conn.close()
        logger.info(f"Verified cache for URL: {url}")
        return {"status": "verified"}
    except Exception as e:
        logger.error(f"Error verifying cache: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/invalidate-cache")
async def invalidate_cache(url: str = Query(..., description="URL to invalidate")):
    """Remove a file from cache due to playback error"""
    try:
        conn = sqlite3.connect(CACHE_DB_PATH)
        cursor = conn.cursor()
        cursor.execute("SELECT filename FROM downloads WHERE url = ?", (url,))
        result = cursor.fetchone()

        if result:
            filename = result[0]
            file_path = DOWNLOADS_DIR / filename

            # Delete file
            try:
                if file_path.exists():
                    file_path.unlink()
                    logger.info(f"Deleted failed cache file: {filename}")
            except Exception as e:
                logger.error(f"Error deleting file: {str(e)}")

            # Remove from database
            cursor.execute("DELETE FROM downloads WHERE url = ?", (url,))
            conn.commit()

        conn.close()
        logger.info(f"Invalidated cache for URL: {url}")
        return {"status": "invalidated"}
    except Exception as e:
        logger.error(f"Error invalidating cache: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/clear-all-cache")
async def clear_all_cache():
    """Clear all cached videos and reset database"""
    try:
        conn = sqlite3.connect(CACHE_DB_PATH)
        cursor = conn.cursor()

        # Get all cached files
        cursor.execute("SELECT filename FROM downloads")
        files = cursor.fetchall()

        deleted_count = 0
        freed_bytes = 0

        # Delete all files
        for (filename,) in files:
            file_path = DOWNLOADS_DIR / filename
            try:
                if file_path.exists():
                    file_size = file_path.stat().st_size
                    file_path.unlink()
                    deleted_count += 1
                    freed_bytes += file_size
                    logger.debug(f"Deleted cache file: {filename}")
            except Exception as e:
                logger.error(f"Error deleting file {filename}: {str(e)}")

        # Clear downloads table
        cursor.execute("DELETE FROM downloads")
        conn.commit()
        conn.close()

        logger.info(f"Cleared all cache: {deleted_count} files, {freed_bytes / 1024 / 1024:.2f} MB freed")
        return {
            "status": "cleared",
            "files_deleted": deleted_count,
            "bytes_freed": freed_bytes,
            "mb_freed": round(freed_bytes / 1024 / 1024, 2)
        }
    except Exception as e:
        logger.error(f"Error clearing all cache: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/cache-stats")
async def get_cache_stats():
    """Get cache statistics"""
    try:
        conn = sqlite3.connect(CACHE_DB_PATH)
        cursor = conn.cursor()

        # Get total stats
        cursor.execute("""
            SELECT
                COUNT(*) as total_files,
                SUM(size_bytes) as total_bytes,
                COUNT(CASE WHEN verified = 1 THEN 1 END) as verified_files
            FROM downloads
        """)
        total_files, total_bytes, verified_files = cursor.fetchone()

        conn.close()

        return {
            "total_files": total_files or 0,
            "verified_files": verified_files or 0,
            "unverified_files": (total_files or 0) - (verified_files or 0),
            "total_bytes": total_bytes or 0,
            "total_mb": round((total_bytes or 0) / 1024 / 1024, 2),
            "max_cache_mb": MAX_CACHE_SIZE_GB * 1024,
            "max_file_mb": MAX_FILE_SIZE_MB
        }
    except Exception as e:
        logger.error(f"Error getting cache stats: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


# Mount downloads directory for serving cached files
app.mount("/downloads", StaticFiles(directory=str(DOWNLOADS_DIR)), name="downloads")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)
