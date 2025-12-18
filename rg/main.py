"""
RedGifs Viewer - FastAPI Backend
A simple alternative frontend for browsing RedGifs content
"""

import asyncio
import math
import aiohttp
from redgifs.aio import API
import logging
import traceback
import time
import sqlite3
import json
from datetime import datetime, timedelta
from pathlib import Path
from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, InstanceOf
from typing import Optional, List
from enum import Enum
import redgifs
from redgifs.enums import Order, MediaType
from redgifs.errors import HTTPException as RedgifsHTTPException
import httpx
from redgifs.models import CreatorResult

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


async def download_and_cache(url: str) -> Optional[str]:
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
        async with httpx.AsyncClient() as client:
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
            if extension not in ['mp4', 'webm', 'mov', 'avi', 'mkv']:
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

app = FastAPI(title="RedGifs Viewer")

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
    except RedgifsHTTPException as e:
        process_time = (time.time() - start_time) * 1000
        logger.error(
            f"Request failed: {request.method} {request.url.path} - "
            f"Time: {process_time:.2f}ms - "
            f"RedGifs Error: {str(e)}"
        )
        raise HTTPException(e.status, e.message)
    except Exception as e:
        process_time = (time.time() - start_time) * 1000
        logger.error(
            f"Request failed: {request.method} {request.url.path} - "
            f"Time: {process_time:.2f}ms - "
            f"Error: {str(e)}"
        )
        raise HTTPException(status_code=400, detail=e)

# Enable CORS for development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
async_api: Optional[API] = None


async def get_api_async() -> API:
    """Get or create the RedGifs API instance"""
    global async_api
    if async_api is None:
        try:
            logger.info("Initializing RedGifs API client...")
            async_api = API()
            logger.info("Logging in to RedGifs API...")
            await async_api.login()
            logger.info("Successfully logged in to RedGifs API")
        except Exception as e:
            logger.error(f"Failed to initialize RedGifs API: {str(e)}")
            logger.error(f"Traceback: {traceback.format_exc()}")
            raise
    return async_api


# Global API instance
api: Optional[redgifs.API] = None


def get_api() -> redgifs.API:
    """Get or create the RedGifs API instance"""
    global api
    if api is None:
        try:
            logger.info("Initializing RedGifs API client...")
            api = redgifs.API()
            logger.info("Logging in to RedGifs API...")
            api.login()
            logger.info("Successfully logged in to RedGifs API")
        except Exception as e:
            logger.error(f"Failed to initialize RedGifs API: {str(e)}")
            logger.error(f"Traceback: {traceback.format_exc()}")
            raise
    return api


class SortOrder(str, Enum):
    trending = "trending"
    latest = "latest"
    top = "top"
    top28 = "top28"
    duration_desc = "duration-desc"
    duration_asc = "duration-asc"


def order_to_enum(order: SortOrder) -> Order:
    """Convert SortOrder string to redgifs Order enum"""
    # Duration sorting is done client-side, so use LATEST as base order
    if order in [SortOrder.duration_desc, SortOrder.duration_asc]:
        return Order.LATEST

    mapping = {
        SortOrder.trending: Order.TRENDING,
        SortOrder.latest: Order.LATEST,
        SortOrder.top: Order.TOP,
        SortOrder.top28: Order.TOP28,
    }
    return mapping.get(order, Order.LATEST)


async def gif_to_dict_async(gif) -> dict:
    """Convert a GIF object to a dictionary with optional caching"""
    # Try to cache SD quality videos (they're usually smaller)
    cached_sd = None
    if gif.urls and gif.urls.sd:
        cached_sd = await download_and_cache(gif.urls.sd)

    return {
        "id": gif.id,
        "create_date": gif.create_date.isoformat() if gif.create_date else None,
        "has_audio": gif.has_audio,
        "width": gif.width,
        "height": gif.height,
        "likes": gif.likes,
        "tags": gif.tags,
        "verified": gif.verified,
        "views": gif.views or 0,
        "duration": gif.duration,
        "published": gif.published,
        "username": gif.username,
        "avg_color": gif.avg_color,
        "urls": {
            "sd": gif.urls.sd,
            "hd": gif.urls.hd,
            "poster": gif.urls.poster,
            "thumbnail": gif.urls.thumbnail,
            "vthumbnail": gif.urls.vthumbnail,
            "web_url": gif.urls.web_url,
            "cached_sd": cached_sd,  # Local cached path if available
        }
    }


def gif_to_dict(gif) -> dict:
    """Convert a GIF object to a dictionary (sync version)"""
    return {
        "id": gif.id,
        "create_date": gif.create_date.isoformat() if gif.create_date else None,
        "has_audio": gif.has_audio,
        "width": gif.width,
        "height": gif.height,
        "likes": gif.likes,
        "tags": gif.tags,
        "verified": gif.verified,
        "views": gif.views or 0,
        "duration": gif.duration,
        "published": gif.published,
        "username": gif.username,
        "avg_color": gif.avg_color,
        "urls": {
            "sd": gif.urls.sd,
            "hd": gif.urls.hd,
            "poster": gif.urls.poster,
            "thumbnail": gif.urls.thumbnail,
            "vthumbnail": gif.urls.vthumbnail,
            "web_url": gif.urls.web_url,
        }
    }


def user_to_dict(user: redgifs.User) -> dict:
    """Convert a User object to a dictionary"""
    return {
        "username": user,
        "name": user.name,
        "description": user.description,
        "followers": user.followers,
        "following": user.following,
        "gifs": user.gifs,
        "published_gifs": user.published_gifs,
        "verified": user.verified,
        "views": user.views,
        "profile_image_url": user.profile_image_url,
        "url": user.url,
        "poster": user.poster,
        "thumbnail": user.thumbnail,
    }


@ app.get("/")
async def root():
    """Serve the main HTML page"""
    return FileResponse("static/index.html")


@ app.get("/api/user/{username}")
async def get_user(username: str):
    """Get user profile information"""
    cache_key = f"user_profile:{username}"
    try:
        # Create cache key
        # Try to get from cache first
        cached_response = get_from_cache(cache_key)
        if cached_response:
            return cached_response

        # Cache miss - fetch from API
        rg: redgifs.API = get_api()
        user: CreatorResult = rg.search_user(username)
        response_data = user_to_dict(user.creator)

        # Save to cache
        save_to_cache(cache_key, response_data)

        return response_data
    except RedgifsHTTPException as e:

        rg = get_api()
        rg.login()

        user = rg.search_user(username)
        response_data = user_to_dict(user.creator)

        # Save to cache
        save_to_cache(cache_key, response_data)

        return response_data
    except Exception as e:
        raise HTTPException(status_code=404, detail=f"User not found: {str(e)}")


@ app.get("/api/user/{username}/tags")
async def get_user_tags(username: str):
    """Get all videos with their tags and tag statistics"""
    try:
        # Create cache key
        cache_key = f"user_tags:{username}"

        # Try to get from cache first
        cached_response = get_from_cache(cache_key)
        if cached_response:
            return cached_response

        rg = await get_api_async()

        # Fetch recent gifs to extract tags (get first 100 to have good coverage)
        await asyncio.sleep(3)
        result = await rg.search_creator(
            username,
            page=1,
            count=100,
            order=Order.TOP,
            type=MediaType.GIF
        )

        # Build video-to-tags mapping and count tag occurrences
        video_tags = {}  # { video_id: [tags] }
        tag_counts = {}  # { tag: count }

        for gif in result.gifs:
            if gif.tags:
                video_tags[gif.id] = gif.tags
                for tag in gif.tags:
                    tag_counts[tag] = tag_counts.get(tag, 0) + 1

        if result.pages > 1:
            for i in range(result.page, min(result.pages+1, 5)):
                await asyncio.sleep(0.5*i)
                res = await rg.search_creator(
                    username,
                    page=i,
                    count=100,
                    order=Order.TOP,
                    type=MediaType.GIF
                )

                for gif in res.gifs:
                    if gif.tags:
                        video_tags[gif.id] = gif.tags
                        for tag in gif.tags:
                            tag_counts[tag] = tag_counts.get(tag, 0) + 1

        # Sort tags by count (descending) then alphabetically
        sorted_tags = sorted(
            tag_counts.items(),
            key=lambda x: (-x[1], x[0].lower())
        )

        response_data = {
            "video_tags": video_tags,  # Mapping of video ID -> list of tags
            "tag_counts": {tag: count for tag, count in sorted_tags},  # Tag -> count mapping
            "tags": [tag for tag, _ in sorted_tags]  # Sorted list of tags
        }

        # Save to cache (tags don't change often, cache for 24 hours)
        save_to_cache(cache_key, response_data)

        return response_data
    except Exception as e:
        logger.error(f"Failed to get tags for user {username}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch user tags: {str(e)}")


@ app.get("/api/user/{username}/gifs")
async def get_user_gifs(
    username: str,
    page: int = Query(1, ge=1),
    count: int = Query(80, ge=1),
    order: SortOrder = Query(SortOrder.latest),
):
    """Get gifs from a specific user with pagination.

    Supports counts > 100 by fetching from multiple pages automatically.
    """
    try:
        # Create cache key from request parameters
        cache_key = f"user_gifs:{username}:{page}:{count}:{order}"

        # Try to get from cache first
        cached_response = get_from_cache(cache_key)
        if cached_response:
            return cached_response

        rg = get_api()

        # If count > 100, we need to fetch multiple pages
        # RedGifs API max is 100 per request
        max_per_request = 100
        all_gifs = []
        total_pages = 0
        total_count = 0
        creator_info = None

        if count <= max_per_request:
            # Simple case: single request
            result = rg.search_creator(
                username,
                page=page,
                count=count,
                order=order_to_enum(order),
                type=MediaType.GIF
            )
            all_gifs = [gif_to_dict(g) for g in result.gifs]
            total_pages = result.pages
            total_count = result.total
            creator_info = user_to_dict(result.creator) if result.creator else None
        else:
            # Complex case: fetch multiple pages
            items_needed = count
            current_page = page

            logger.info(f"Fetching {count} items requires multiple pages (max {max_per_request} per page)")

            while items_needed > 0:
                fetch_count = min(items_needed, max_per_request)

                logger.info(f"Fetching page {current_page} with {fetch_count} items")

                result = rg.search_creator(
                    username,
                    page=current_page,
                    count=fetch_count,
                    order=order_to_enum(order),
                    type=MediaType.GIF
                )

                if not result.gifs:
                    logger.info(f"No more gifs available at page {current_page}")
                    break

                # Add gifs to our list
                all_gifs.extend([gif_to_dict(g) for g in result.gifs])

                # Store metadata from first request
                if current_page == page:
                    total_pages = result.pages
                    total_count = result.total
                    creator_info = user_to_dict(result.creator) if result.creator else None

                items_needed -= len(result.gifs)
                current_page += 1

                # Safety check: if we got very few results, we've likely reached the end
                # Allow for some variance in API results (e.g., 99 instead of 100)
                if len(result.gifs) < 50:  # Changed from fetch_count to a reasonable threshold
                    logger.info(f"Got only {len(result.gifs)} items, likely at end of results")
                    break

            logger.info(f"Fetched total of {len(all_gifs)} gifs across {current_page - page} pages")

        # Apply client-side sorting for duration
        if order == SortOrder.duration_desc:
            all_gifs.sort(key=lambda g: g.get("duration") or 0, reverse=True)
            logger.info(f"Sorted {len(all_gifs)} gifs by duration (longest first)")
        elif order == SortOrder.duration_asc:
            all_gifs.sort(key=lambda g: g.get("duration") or 0)
            logger.info(f"Sorted {len(all_gifs)} gifs by duration (shortest first)")

        response_data = {
            "page": page,
            "pages": total_pages,
            "total": total_count,
            "gifs": all_gifs,
            "creator": creator_info,
        }

        # Save to cache
        save_to_cache(cache_key, response_data)

        return response_data
    except Exception as e:
        api = None
        api = get_api()

        raise HTTPException(status_code=500, detail=str(e))


@ app.get("/api/search")
async def search_gifs(
    q: str = Query(..., min_length=1),
    page: int = Query(1, ge=1),
    count: int = Query(80, ge=1),
    order: SortOrder = Query(SortOrder.trending),
):
    """Search for gifs by tag/keyword.

    Supports counts > 100 by fetching from multiple pages automatically.
    """
    try:
        # Create cache key from request parameters
        cache_key = f"search:{q}:{page}:{count}:{order}"

        # Try to get from cache first
        cached_response = get_from_cache(cache_key)
        if cached_response:
            return cached_response

        rg = get_api()

        # If count > 100, we need to fetch multiple pages
        # RedGifs API max is 100 per request
        max_per_request = 100
        all_gifs = []
        total_pages = 0
        total_count = 0
        searched_for = q
        tags_list = []

        if count <= max_per_request:
            # Simple case: single request
            result = rg.search(
                q,
                page=page,
                count=count,
                order=order_to_enum(order),
            )
            all_gifs = [gif_to_dict(g) for g in result.gifs] if result.gifs else []
            total_pages = result.pages
            total_count = result.total
            searched_for = result.searched_for
            tags_list = result.tags
        else:
            # Complex case: fetch multiple pages
            items_needed = count
            current_page = page

            logger.info(f"Fetching {count} items requires multiple pages (max {max_per_request} per page)")

            while items_needed > 0:
                fetch_count = min(items_needed, max_per_request)

                logger.info(f"Fetching search page {current_page} with {fetch_count} items")

                result = rg.search(
                    q,
                    page=current_page,
                    count=fetch_count,
                    order=order_to_enum(order),
                )

                if not result.gifs:
                    logger.info(f"No more search results available at page {current_page}")
                    break

                # Add gifs to our list
                all_gifs.extend([gif_to_dict(g) for g in result.gifs])

                # Store metadata from first request
                if current_page == page:
                    total_pages = result.pages
                    total_count = result.total
                    searched_for = result.searched_for
                    tags_list = result.tags

                items_needed -= len(result.gifs)
                current_page += 1

                # Safety check: if we got very few results, we've likely reached the end
                # Allow for some variance in API results (e.g., 99 instead of 100)
                if len(result.gifs) < 50:  # Changed from fetch_count to a reasonable threshold
                    logger.info(f"Got only {len(result.gifs)} search results, likely at end of results")
                    break

            logger.info(f"Fetched total of {len(all_gifs)} search results across {current_page - page} pages")

        # Apply client-side sorting for duration
        if order == SortOrder.duration_desc:
            all_gifs.sort(key=lambda g: g.get("duration") or 0, reverse=True)
            logger.info(f"Sorted {len(all_gifs)} search results by duration (longest first)")
        elif order == SortOrder.duration_asc:
            all_gifs.sort(key=lambda g: g.get("duration") or 0)
            logger.info(f"Sorted {len(all_gifs)} search results by duration (shortest first)")

        response_data = {
            "searched_for": searched_for,
            "page": page,
            "pages": total_pages,
            "total": total_count,
            "gifs": all_gifs,
            "tags": tags_list,
        }

        # Save to cache
        save_to_cache(cache_key, response_data)

        return response_data
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@ app.get("/api/gif/{gif_id}")
async def get_gif(gif_id: str):
    """Get a single gif by ID"""
    try:
        # Create cache key
        cache_key = f"gif:{gif_id}"

        # Try to get from cache first
        cached_response = get_from_cache(cache_key)
        if cached_response:
            return cached_response

        # Cache miss - fetch from API
        rg = get_api()
        gif = rg.get_gif(gif_id)

        if not gif:
            raise HTTPException(status_code=404, detail=f"Gif {gif_id} not found")

        response_data = gif_to_dict(gif)

        # Save to cache
        save_to_cache(cache_key, response_data)

        return response_data
    except RedgifsHTTPException as e:
        if e.status == 404:
            raise HTTPException(status_code=404, detail=f"Gif {gif_id} not found")
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@ app.get("/api/trending")
async def get_trending():
    """Get trending gifs"""
    try:
        # Create cache key
        cache_key = "trending:gifs"

        # Try to get from cache first (shorter cache time for trending)
        cached_response = get_from_cache(cache_key)
        if cached_response:
            return cached_response

        # Cache miss - fetch from API
        rg = get_api()
        gifs = rg.get_trending_gifs()

        response_data = {
            "gifs": [gif_to_dict(g) for g in gifs]
        }

        # Save to cache with shorter duration (1 hour for trending content)
        save_to_cache(cache_key, response_data, duration_hours=1)

        return response_data
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@ app.get("/proxy")
async def proxy_media(url: str = Query(..., description="URL to proxy")):
    """Proxy media files from RedGifs to bypass CORB/ORB restrictions

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
                from fastapi.responses import FileResponse
                return FileResponse(
                    file_path,
                    headers={
                        "Cache-Control": "public, max-age=86400",
                        "Access-Control-Allow-Origin": "*"
                    }
                )

        conn.close()

        # Not cached or not verified - download and cache if small enough
        cached_path = await download_and_cache(url)

        if cached_path:
            # File was cached, serve from cache
            filename = cached_path.split('/')[-1]
            file_path = DOWNLOADS_DIR / filename
            logger.info(f"Serving newly cached file: {filename}")
            from fastapi.responses import FileResponse
            return FileResponse(
                file_path,
                headers={
                    "Cache-Control": "public, max-age=86400",
                    "Access-Control-Allow-Origin": "*"
                }
            )

        # File too large or cache failed, proxy from CDN
        async with httpx.AsyncClient() as client:
            response = await client.get(
                url,
                headers={
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                    "Referer": "https://www.redgifs.com/"
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


# Mount downloads directory for serving cached files
app.mount("/downloads", StaticFiles(directory=str(DOWNLOADS_DIR)), name="downloads")

# Mount static files
app.mount("/static", StaticFiles(directory="static"), name="static")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
