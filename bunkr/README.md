# Bunkr Album Scraper - Backend

FastAPI backend for scraping Bunkr albums and extracting media URLs.

## Features

- Scrapes Bunkr albums to extract all media URLs
- SQLite caching (24-hour cache duration)
- CORS proxy for media files
- Automatic redirect handling
- Request/response logging

## Setup

1. Create virtual environment and install dependencies:
```bash
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

2. Start the server:
```bash
./start.sh
# OR
source venv/bin/activate
python main.py
```

Server will run on `http://0.0.0.0:8001`

## API Endpoints

### GET /api/album

Scrape a Bunkr album and return all media URLs.

**Parameters:**
- `url` (query, required): Bunkr album URL

**Response:**
```json
{
  "album_url": "https://bunkr.si/a/abc123",
  "total_items": 42,
  "media": [
    {
      "url": "https://cdn.bunkr.si/...",
      "type": "video",
      "thumbnail": "https://...",
      "filename": "video.mp4"
    }
  ]
}
```

**Example:**
```bash
curl "http://localhost:8001/api/album?url=https://bunkr.si/a/abc123"
```

### GET /proxy

Proxy media files to bypass CORS restrictions.

**Parameters:**
- `url` (query, required): Media URL to proxy

**Example:**
```bash
curl "http://localhost:8001/proxy?url=https://cdn.bunkr.si/video.mp4"
```

## Integration with NSRI

The NSRI frontend automatically connects to this backend on `http://localhost:8001`.

Make sure the Bunkr backend is running before using Bunkr albums in NSRI.

## Cache

- Cache database: `./cache.db`
- Cache duration: 24 hours
- Expired entries are cleaned up on startup

## Logging

All requests and responses are logged with timing information:
- INFO: Request/response details
- DEBUG: Query parameters, client info
- ERROR: Failures and exceptions

## Technology

- FastAPI: Web framework
- httpx: HTTP client for scraping
- BeautifulSoup4: HTML parsing
- SQLite: Response caching
- uvicorn: ASGI server
