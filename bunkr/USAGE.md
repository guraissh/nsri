# Using Bunkr Album Scraper with NSRI

## Quick Start

### 1. Start the Bunkr Backend

```bash
cd /home/dietpi/bunkr
./start.sh
```

The backend will run on `http://localhost:8001`

### 2. Start NSRI

```bash
cd /home/dietpi/nsri
bun run dev
```

NSRI will run on `http://localhost:5173`

### 3. Use Bunkr Albums in NSRI

1. Open NSRI in your browser (`http://localhost:5173`)
2. Select **"Bunkr Album"** from the source type dropdown
3. Paste a Bunkr album URL (e.g., `https://bunkr.si/a/abc123`)
4. Click **"Stream Media"**

The app will:
- Fetch the album from the Bunkr backend
- Extract all media URLs
- Display them in the vertical video player

## Supported Bunkr URLs

- `https://bunkr.si/a/album_id`
- `https://bunkrr.su/a/album_id`
- `https://bunkr.la/a/album_id`

## How It Works

```
NSRI Frontend
    ↓
    ↓ GET /api/stream-media (POST)
    ↓
NSRI Backend (api.server.ts)
    ↓ getBunkrMedia()
    ↓
    ↓ HTTP GET /api/album?url=...
    ↓
Bunkr Backend (Python FastAPI)
    ↓ Scrapes album page
    ↓ Extracts media URLs
    ↓
    ← Returns JSON with media list
    ↑
NSRI Backend
    ↓ Converts to proxied URLs
    ↓
    ← Returns to frontend
    ↑
NSRI Frontend
    ↓ Displays in video player
    ↓ Requests media via /proxy/bunkr-media
    ↓
NSRI Proxy Route
    ↓ Forwards to Bunkr backend proxy
    ↓
Bunkr Backend Proxy
    ↓ Fetches from CDN
    ← Streams media back
```

## Caching

The Bunkr backend caches album data for 24 hours to:
- Reduce load on Bunkr servers
- Speed up repeated requests
- Avoid rate limiting

Cache is stored in `/home/dietpi/bunkr/cache.db`

## Troubleshooting

### Backend not connecting
- Ensure the Bunkr backend is running on port 8001
- Check logs for errors: `cd /home/dietpi/bunkr && source venv/bin/activate && python main.py`

### No media found
- Verify the album URL is correct
- Check backend logs for scraping errors
- Some albums may have anti-scraping measures

### Media not loading
- Check that the Bunkr backend proxy is working
- Try accessing the backend directly: `curl "http://localhost:8001/api/album?url=..."`
- Check browser console for CORS errors

## Development

To modify the scraper logic:
1. Edit `/home/dietpi/bunkr/main.py`
2. Restart the backend: `./start.sh`
3. Clear cache if needed: `rm cache.db`

The scraper uses BeautifulSoup to parse HTML and extract media links. The scraping logic is in the `scrape_bunkr_album()` function.
