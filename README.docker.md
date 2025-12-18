# NSRI Docker Setup

Complete Docker setup for NSRI Media Viewer with Bunkr and RedGifs backends.

## Quick Start

### 1. Prerequisites

- Docker Engine 20.10+
- Docker Compose 2.0+

### 2. Configuration (Optional)

Create a `.env` file to customize settings:

```bash
cp .env.example .env
# Edit .env to set your local media path
```

### 3. Build and Start

```bash
# Build and start all services
docker-compose up -d

# View logs
docker-compose logs -f

# View logs for specific service
docker-compose logs -f nsri
```

### 4. Access the Application

- **NSRI Frontend**: http://localhost:3000
- **Bunkr API**: http://localhost:8001
- **RedGifs API**: http://localhost:8000

## Services

### NSRI Frontend
- **Port**: 3000
- **Container**: nsri-frontend
- **Volumes**:
  - `nsri-thumbnails` - Video thumbnails cache
  - `nsri-cache` - File metadata cache
  - Local media directory (configurable via `.env`)

### Bunkr Backend
- **Port**: 8001
- **Container**: nsri-bunkr
- **Volumes**:
  - `bunkr-downloads` - Cached videos (≤50MB)
  - `bunkr-cache` - API response cache

### RedGifs Backend
- **Port**: 8000
- **Container**: nsri-redgifs
- **Volumes**:
  - `redgifs-downloads` - Cached videos (≤50MB)
  - `redgifs-cache` - API response cache

## Common Commands

### Start Services
```bash
docker-compose up -d
```

### Stop Services
```bash
docker-compose down
```

### Restart Services
```bash
docker-compose restart
```

### Rebuild After Code Changes
```bash
docker-compose up -d --build
```

### View Logs
```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f nsri
docker-compose logs -f bunkr
docker-compose logs -f redgifs
```

### Clean Up Everything
```bash
# Stop and remove containers, networks
docker-compose down

# Also remove volumes (WARNING: deletes all cached data)
docker-compose down -v
```

## Volume Management

### List Volumes
```bash
docker volume ls | grep nsri
```

### Inspect Volume
```bash
docker volume inspect nsri_bunkr-downloads
```

### Backup Volume
```bash
# Backup Bunkr downloads
docker run --rm -v nsri_bunkr-downloads:/data -v $(pwd):/backup alpine tar czf /backup/bunkr-downloads-backup.tar.gz -C /data .
```

### Restore Volume
```bash
# Restore Bunkr downloads
docker run --rm -v nsri_bunkr-downloads:/data -v $(pwd):/backup alpine tar xzf /backup/bunkr-downloads-backup.tar.gz -C /data
```

## Troubleshooting

### Check Service Health
```bash
docker-compose ps
```

### Restart a Specific Service
```bash
docker-compose restart nsri
```

### Access Service Shell
```bash
# NSRI
docker-compose exec nsri sh

# Bunkr
docker-compose exec bunkr bash

# RedGifs
docker-compose exec redgifs bash
```

### Check Resource Usage
```bash
docker stats
```

### Clear All Caches
```bash
# Stop services
docker-compose down

# Remove cache volumes
docker volume rm nsri_bunkr-cache nsri_redgifs-cache nsri_nsri-cache

# Restart
docker-compose up -d
```

## Performance Tuning

### Adjust Cache Sizes

Edit the backend Python files before building:

**bunkr/main.py** or **rg/main.py**:
```python
MAX_CACHE_SIZE_GB = 10  # Increase/decrease cache size
MAX_FILE_SIZE_MB = 50   # Change max cached file size
```

Then rebuild:
```bash
docker-compose up -d --build
```

### Resource Limits

Add to `docker-compose.yml` under each service:

```yaml
services:
  bunkr:
    # ... existing config ...
    deploy:
      resources:
        limits:
          cpus: '2'
          memory: 2G
        reservations:
          memory: 512M
```

## Development Mode

For development with hot reload:

```bash
# Frontend only (assumes backends are running)
cd /home/dietpi/nsri
bun run dev

# Or use docker-compose with mounted source
docker-compose -f docker-compose.dev.yml up
```

## Production Deployment

### Using Reverse Proxy

Example nginx config:

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    location /api/bunkr {
        proxy_pass http://localhost:8001;
        proxy_set_header Host $host;
    }

    location /api/redgifs {
        proxy_pass http://localhost:8000;
        proxy_set_header Host $host;
    }
}
```

### Environment Variables

Set in `.env` for production:

```bash
NODE_ENV=production
LOCAL_MEDIA_PATH=/mnt/media
```

## Architecture

```
┌─────────────────┐
│   Browser       │
└────────┬────────┘
         │ :3000
         ▼
┌─────────────────┐
│  NSRI Frontend  │
│   (Bun/React)   │
└────┬────────┬───┘
     │ :8001  │ :8000
     ▼        ▼
┌─────────┐ ┌──────────┐
│ Bunkr   │ │ RedGifs  │
│ Backend │ │ Backend  │
│(Python) │ │ (Python) │
└─────────┘ └──────────┘
     │           │
     ▼           ▼
  [Cache]    [Cache]
  [Videos]   [Videos]
```

## Cache Behavior

### On-Demand Caching
- Videos are cached when first played
- Only videos ≤50MB are cached
- Maximum total cache: 10GB per backend
- LRU eviction when cache is full

### Verification Flow
1. Video plays successfully → marked as verified
2. Video fails to play → removed from cache
3. Only verified videos are served from cache

## Monitoring

### Check Cache Size
```bash
# Bunkr cache
docker-compose exec bunkr du -sh /app/downloads

# RedGifs cache
docker-compose exec redgifs du -sh /app/downloads
```

### View Cache Statistics
```bash
# Bunkr
docker-compose exec bunkr sqlite3 /app/data/cache.db "SELECT COUNT(*), SUM(size_bytes)/1024/1024 as total_mb FROM downloads WHERE verified=1"

# RedGifs
docker-compose exec redgifs sqlite3 /app/data/cache.db "SELECT COUNT(*), SUM(size_bytes)/1024/1024 as total_mb FROM downloads WHERE verified=1"
```

## Support

For issues or questions, check the main CLAUDE.md documentation or create an issue.
