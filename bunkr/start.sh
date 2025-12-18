#!/bin/bash
# Bunkr Album Scraper - Startup Script

cd "$(dirname "$0")"

echo "Starting Bunkr Album Scraper backend..."
echo "Listening on http://0.0.0.0:8001"
echo ""
echo "Endpoints:"
echo "  GET /api/album?url=<album_url> - Scrape Bunkr album"
echo "  GET /proxy?url=<media_url>    - Proxy media files"
echo ""

source venv/bin/activate
python main.py
