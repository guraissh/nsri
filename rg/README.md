# RedGifs Viewer

An alternative frontend for browsing RedGifs content with advanced sorting and filtering capabilities. Built with FastAPI and vanilla JavaScript, this web application provides a clean, responsive interface for viewing user gifs with the ability to sort by views, likes, and duration.

## Features

- **User Profile Browsing**: Search for any RedGifs user and view their profile information
- **Advanced Sorting**:
  - API-level sorting: Latest, Trending, Top (All Time), Top Week, Top Month
  - Client-side sorting: Most/Least Views, Most/Least Likes, Longest/Shortest, Newest/Oldest
- **Responsive Design**: Works seamlessly on both desktop and mobile devices
- **Video Player**: Full-screen modal video player with metadata display
- **Pagination**: Load more results as you browse
- **Statistics**: View counts, likes, duration, and audio indicators for each gif
- **Clean UI**: Modern dark theme with smooth animations

## Screenshots

The interface includes:
- Search bar for finding users
- User profile cards with stats (gifs, views, followers)
- Grid layout of thumbnails with overlays showing views/likes
- Modal video player with tags and download options
- Dual sorting system (API + client-side)

## Prerequisites

- Python 3.8 or higher
- pip (Python package manager)

## Installation

1. **Clone or download this repository**

2. **Install dependencies**:
   ```bash
   pip install -r requirements.txt
   ```

## Usage

1. **Start the server**:
   ```bash
   python main.py
   ```

   Or using uvicorn directly:
   ```bash
   uvicorn main:app --reload --host 0.0.0.0 --port 8000
   ```

2. **Open your browser** and navigate to:
   ```
   http://localhost:8000
   ```

3. **Search for a user** by entering their username in the search bar

4. **Sort results** using the dropdown menus:
   - **API Sort**: Changes what data is fetched from RedGifs (requires reload)
   - **Client Sort**: Re-sorts already loaded data instantly

5. **Click on any gif** to open it in the full-screen video player

## API Endpoints

The backend provides the following REST API endpoints:

### `GET /api/user/{username}`
Get user profile information
- **Response**: User object with stats and profile details

### `GET /api/user/{username}/gifs`
Get gifs from a specific user
- **Query Parameters**:
  - `page` (default: 1): Page number
  - `count` (default: 80): Results to return (automatically fetches from multiple pages if > 100)
  - `order` (default: latest): trending, latest, top, top28, duration-desc, duration-asc
- **Response**: Paginated list of gifs with creator info
- **Note**: Counts > 100 will automatically fetch from multiple RedGifs API pages and combine results

### `GET /api/search`
Search for gifs by keyword/tag
- **Query Parameters**:
  - `q` (required): Search query
  - `page`, `count`, `order`: Same as above
- **Response**: Search results with matching gifs
- **Note**: Counts > 100 will automatically fetch from multiple RedGifs API pages and combine results

### `GET /api/trending`
Get current trending gifs
- **Response**: List of top 10 trending gifs

## Project Structure

```
redgifs-viewer/
├── main.py              # FastAPI backend server
├── requirements.txt     # Python dependencies
├── README.md           # This file
└── static/
    └── index.html      # Frontend single-page application
```

## How It Works

1. **Backend (main.py)**:
   - FastAPI server that wraps the `redgifs` Python library
   - Authenticates with RedGifs API using temporary tokens
   - Provides RESTful endpoints for the frontend
   - Converts Python objects to JSON responses

2. **Frontend (index.html)**:
   - Vanilla JavaScript SPA (no framework needed)
   - Tailwind CSS for responsive styling
   - Fetches data from backend API
   - Implements dual sorting system:
     - API sorting fetches differently ordered data
     - Client sorting reorganizes loaded data without refetching

## Sorting Explained

### API Sort (Server-side)
Determines which gifs are fetched from RedGifs:
- **Latest**: Most recently uploaded
- **Trending**: Currently popular
- **Top**: Highest rated all-time
- **Top Week**: Best from last 7 days
- **Top Month**: Best from last 28 days
- **Duration (Longest)**: Sorted by video length (longest first) - client-side
- **Duration (Shortest)**: Sorted by video length (shortest first) - client-side

### Client Sort (Browser-side - Frontend Only)
Re-organizes already loaded gifs without refetching (only available in the web UI):
- **Default**: Maintains API sort order
- **Views**: Sort by view count (high/low)
- **Likes**: Sort by like count (high/low)
- **Duration**: Sort by video length (long/short)
- **Date**: Sort by upload date (new/old)

**Note**: The duration sorting options (`duration-desc`, `duration-asc`) are now available directly in the API and can be used when making requests. These fetch the latest gifs and then sort them by duration on the backend before returning results.

## Technologies Used

- **Backend**:
  - FastAPI - Modern Python web framework
  - Uvicorn - ASGI server
  - redgifs - Python wrapper for RedGifs API

- **Frontend**:
  - Vanilla JavaScript (ES6+)
  - Tailwind CSS - Utility-first CSS framework
  - HTML5 Video API

## Notes

- The application requires internet access to fetch data from RedGifs
- Videos are streamed directly from RedGifs CDN
- Authentication is handled automatically via temporary tokens
- No user data is stored or tracked by this application

## Troubleshooting

**Issue**: "Module not found" error
- **Solution**: Make sure you've installed dependencies: `pip install -r requirements.txt`

**Issue**: Can't find user
- **Solution**: Verify the username is correct and the user exists on RedGifs

**Issue**: Videos not loading
- **Solution**: Check your internet connection and ensure RedGifs is accessible

**Issue**: Port 8000 already in use
- **Solution**: Change the port by running: `uvicorn main:app --port 8001`

## License

This project is provided as-is for educational purposes. RedGifs and all related content are property of their respective owners.

## Credits

Built using the excellent [redgifs Python library](https://github.com/scrazzz/redgifs) by scrazzz.
