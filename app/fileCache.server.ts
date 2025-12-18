import { Database } from "bun:sqlite";
import { createHash } from "crypto";
import { stat, readFile, mkdir } from "fs/promises";
import path from "path";
import { getVideoDurationInSeconds } from "get-video-duration";
import { existsSync } from "fs";

interface FileRecord {
  id?: number;
  path: string;
  hash: string;
  size: number;
  mtime: number;
  duration: number | null;
  directory: string;
  filename: string;
  thumbnail_path: string | null;
}

interface HistoryEntry {
  id?: number;
  type: "directory" | "user";
  value: string;
  platform?: string;
  service?: string;
  last_used: number;
  use_count: number;
}

interface Playlist {
  id?: number;
  name: string;
  description?: string;
  created_at: number;
  updated_at: number;
}

interface PlaylistItem {
  id?: number;
  playlist_id: number;
  media_url: string;
  order_index: number;
  added_at: number;
  thumbnail_path?: string | null;
}

class FileCache {
  private db: Database;

  constructor(dbPath: string = "./file-cache.db") {
    this.db = new Database(dbPath);
    this.initDatabase();
  }

  private initDatabase() {
    // Create files table with indices for fast lookups
    this.db.run(`
      CREATE TABLE IF NOT EXISTS files (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        path TEXT NOT NULL UNIQUE,
        hash TEXT NOT NULL,
        size INTEGER NOT NULL,
        mtime INTEGER NOT NULL,
        duration REAL,
        directory TEXT NOT NULL,
        filename TEXT NOT NULL,
        thumbnail_path TEXT,
        created_at INTEGER DEFAULT (strftime('%s', 'now'))
      )
    `);

    // Create index on hash for duplicate detection
    this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_hash ON files(hash)
    `);

    // Create index on directory for fast directory queries
    this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_directory ON files(directory)
    `);

    // Add thumbnail_path column if it doesn't exist (for existing databases)
    try {
      this.db.run(`ALTER TABLE files ADD COLUMN thumbnail_path TEXT`);
    } catch {
      // Column already exists
    }

    // Create history table for tracking recently used directories and users
    this.db.run(`
      CREATE TABLE IF NOT EXISTS history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT NOT NULL,
        value TEXT NOT NULL,
        platform TEXT,
        service TEXT,
        last_used INTEGER DEFAULT (strftime('%s', 'now')),
        use_count INTEGER DEFAULT 1,
        UNIQUE(type, value, platform, service)
      )
    `);

    // Create index on type for fast lookups
    this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_history_type ON history(type)
    `);

    // Create playlists table
    this.db.run(`
      CREATE TABLE IF NOT EXISTS playlists (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        description TEXT,
        created_at INTEGER DEFAULT (strftime('%s', 'now')),
        updated_at INTEGER DEFAULT (strftime('%s', 'now'))
      )
    `);

    // Create playlist_items table
    this.db.run(`
      CREATE TABLE IF NOT EXISTS playlist_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        playlist_id INTEGER NOT NULL,
        media_url TEXT NOT NULL,
        order_index INTEGER NOT NULL,
        added_at INTEGER DEFAULT (strftime('%s', 'now')),
        thumbnail_path TEXT,
        FOREIGN KEY (playlist_id) REFERENCES playlists(id) ON DELETE CASCADE,
        UNIQUE(playlist_id, media_url)
      )
    `);

    // Add thumbnail_path column if it doesn't exist (for existing databases)
    try {
      this.db.run(`ALTER TABLE playlist_items ADD COLUMN thumbnail_path TEXT`);
    } catch {
      // Column already exists
    }

    // Create indices for fast playlist queries
    this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_playlist_items_playlist_id ON playlist_items(playlist_id)
    `);

    this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_playlist_items_order ON playlist_items(playlist_id, order_index)
    `);

    console.log("File cache database initialized");
  }

  /**
   * Hash a video file using ffmpeg (hashes video stream only, ignoring metadata)
   * For non-video files, use MD5 on the entire file
   */
  private async hashFile(filePath: string): Promise<string> {
    const ext = path.extname(filePath).toLowerCase();
    const videoExtensions = [".mp4", ".webm", ".mov", ".avi", ".mkv", ".m4v", ".3gp", ".flv", ".ogv"];

    // Use ffmpeg for video files
    if (videoExtensions.includes(ext)) {
      try {
        const proc = Bun.spawn([
          "ffmpeg",
          "-i", filePath,
          "-map", "0:v",
          "-codec", "copy",
          "-f", "md5",
          "-"
        ], {
          stdout: "pipe",
          stderr: "pipe",
        });

        const output = await new Response(proc.stdout).text();
        await proc.exited;

        // Parse MD5 output (format: "MD5=abc123...")
        const match = output.match(/MD5=([a-f0-9]+)/i);
        if (match && match[1]) {
          return match[1];
        }

        // Fallback if ffmpeg output parsing fails
        console.warn(`Could not parse ffmpeg hash for ${path.basename(filePath)}, using file hash`);
      } catch (err) {
        console.warn(`ffmpeg hashing failed for ${path.basename(filePath)}, using file hash:`, err);
      }
    }

    // Fallback: Hash entire file for images or if ffmpeg fails
    const hash = createHash("md5");
    const file = Bun.file(filePath);
    const stream = file.stream();

    for await (const chunk of stream) {
      hash.update(chunk);
    }

    return hash.digest("hex");
  }

  /**
   * Generate a thumbnail for a video file using ffmpeg
   */
  private async generateThumbnail(filePath: string, hash: string): Promise<string | null> {
    const ext = path.extname(filePath).toLowerCase();
    const videoExtensions = [".mp4", ".webm", ".mov", ".avi", ".mkv", ".m4v", ".3gp", ".flv", ".ogv"];

    if (!videoExtensions.includes(ext)) {
      return null; // Not a video file
    }

    try {
      // Create thumbnails directory if it doesn't exist
      const thumbnailDir = path.resolve("./public/thumbnails");
      if (!existsSync(thumbnailDir)) {
        await mkdir(thumbnailDir, { recursive: true });
      }

      // Use hash for thumbnail filename to avoid duplicates
      const thumbnailPath = path.join(thumbnailDir, `${hash}.jpg`);

      // Skip if thumbnail already exists
      if (existsSync(thumbnailPath)) {
        return `/thumbnails/${hash}.jpg`;
      }

      // Generate thumbnail at 5 second mark (or 10% through video, whichever is less)
      const proc = Bun.spawn([
        "ffmpeg",
        "-i", filePath,
        "-ss", "5",
        "-vframes", "1",
        "-vf", "scale=320:-1",
        "-q:v", "2",
        thumbnailPath
      ], {
        stdout: "pipe",
        stderr: "pipe",
      });

      await proc.exited;

      if (proc.exitCode === 0 && existsSync(thumbnailPath)) {
        return `/thumbnails/${hash}.jpg`;
      } else {
        const res = Bun.spawn([
          "ffmpeg",
          "-i", filePath,
          "-ss", "2",
          "-vframes", "1",
          "-vf", "scale=320:-1",
          "-q:v", "2",
          thumbnailPath
        ], {
          stdout: "pipe",
          stderr: "pipe",
        });
        await res.exited;
        if (res.exitCode !== 0 && !existsSync(thumbnailPath)) {
          await Bun.spawn([
            "ffmpeg",
            "-i", filePath,
            "-ss", "1",
            "-vframes", "1",
            "-vf", "scale=320:-1",
            "-q:v", "2",
            thumbnailPath
          ], {
            stdout: "pipe",
            stderr: "pipe",
          }).exited;
        }
      }

      return null;
    } catch (err) {
      console.warn(`Failed to generate thumbnail for ${path.basename(filePath)}:`, err);
      return null;
    }
  }

  /**
   * Get cached record without processing (fast lookup)
   * Returns null if not in cache or file has changed
   */
  getCachedRecord(filePath: string): FileRecord | null {
    const normalizedPath = path.resolve(filePath);
    const query = this.db.query<FileRecord, [string]>(
      "SELECT * FROM files WHERE path = ?"
    );
    return query.get(normalizedPath) || null;
  }

  /**
   * Get or create a file record, only rehashing if file changed
   */
  async getOrCreateFileRecord(filePath: string): Promise<FileRecord> {
    const normalizedPath = path.resolve(filePath);
    const stats = await stat(normalizedPath);
    const mtimeMs = Math.floor(stats.mtimeMs);

    // Check if file exists in cache
    const query = this.db.query<FileRecord, [string]>(
      "SELECT * FROM files WHERE path = ?"
    );
    const existing = query.get(normalizedPath);

    // If file hasn't changed, check if we need to generate a missing thumbnail
    if (existing && existing.mtime === mtimeMs && existing.size === stats.size) {
      // Generate thumbnail if missing
      if (!existing.thumbnail_path) {
        const thumbnailPath = await this.generateThumbnail(normalizedPath, existing.hash);
        if (thumbnailPath) {
          this.db.run(
            `UPDATE files SET thumbnail_path = ? WHERE path = ?`,
            [thumbnailPath, normalizedPath]
          );
          existing.thumbnail_path = thumbnailPath;
        }
      }
      return existing;
    }

    // File is new or changed - hash it
    console.log(`Hashing file: ${path.basename(normalizedPath)}`);
    const hash = await this.hashFile(normalizedPath);

    // Get duration for videos
    let duration: number | null = null;
    const ext = path.extname(normalizedPath).toLowerCase();
    const videoExtensions = [".mp4", ".webm", ".mov", ".avi", ".mkv"];

    if (videoExtensions.includes(ext)) {
      try {
        duration = await getVideoDurationInSeconds(normalizedPath);
      } catch (err) {
        console.warn(`Could not get duration for ${path.basename(normalizedPath)}`);
      }
    }

    // Generate thumbnail for videos
    const thumbnailPath = await this.generateThumbnail(normalizedPath, hash);

    const record: FileRecord = {
      path: normalizedPath,
      hash,
      size: stats.size,
      mtime: mtimeMs,
      duration,
      directory: path.dirname(normalizedPath),
      filename: path.basename(normalizedPath),
      thumbnail_path: thumbnailPath,
    };

    // Insert or update record
    if (existing) {
      this.db.run(
        `UPDATE files SET hash = ?, size = ?, mtime = ?, duration = ?, thumbnail_path = ? WHERE path = ?`,
        [hash, stats.size, mtimeMs, duration, thumbnailPath, normalizedPath]
      );
      record.id = existing.id;
    } else {
      const insert = this.db.run(
        `INSERT INTO files (path, hash, size, mtime, duration, directory, filename, thumbnail_path)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [normalizedPath, hash, stats.size, mtimeMs, duration, record.directory, record.filename, thumbnailPath]
      );
      record.id = Number(insert.lastInsertRowid);
    }

    return record;
  }

  /**
   * Get all files in a directory from cache (if unchanged)
   */
  async getDirectoryFiles(directory: string): Promise<FileRecord[]> {
    const normalizedDir = path.resolve(directory);
    const query = this.db.query<FileRecord, [string]>(
      "SELECT * FROM files WHERE directory = ? ORDER BY filename"
    );
    return query.all(normalizedDir);
  }

  /**
   * Find duplicate files by hash
   */
  findDuplicates(): Map<string, FileRecord[]> {
    const query = this.db.query<{ hash: string; count: number }, []>(
      "SELECT hash, COUNT(*) as count FROM files GROUP BY hash HAVING count > 1"
    );
    const duplicateHashes = query.all();

    const duplicates = new Map<string, FileRecord[]>();

    for (const { hash } of duplicateHashes) {
      const fileQuery = this.db.query<FileRecord, [string]>(
        "SELECT * FROM files WHERE hash = ?"
      );
      const files = fileQuery.all(hash);
      duplicates.set(hash, files);
    }

    return duplicates;
  }

  /**
   * Remove duplicate files from a list, keeping only the first occurrence
   */
  deduplicateFiles(files: FileRecord[]): FileRecord[] {
    const seen = new Set<string>();
    return files.filter(file => {
      if (seen.has(file.hash)) {
        return false;
      }
      seen.add(file.hash);
      return true;
    });
  }

  /**
   * Clean up records for files that no longer exist
   */
  async cleanupMissingFiles(): Promise<number> {
    const allFiles = this.db.query<FileRecord, []>("SELECT * FROM files").all();
    const deleted: number[] = [];

    for (const file of allFiles) {
      try {
        await stat(file.path);
      } catch {
        // File doesn't exist
        deleted.push(file.id!);
      }
    }

    if (deleted.length > 0) {
      const placeholders = deleted.map(() => "?").join(",");
      this.db.run(`DELETE FROM files WHERE id IN (${placeholders})`, deleted);
      console.log(`Cleaned up ${deleted.length} missing files from cache`);
    }

    return deleted.length;
  }

  /**
   * Get cache statistics
   */
  getStats() {
    const totalQuery = this.db.query<{ count: number }, []>(
      "SELECT COUNT(*) as count FROM files"
    );
    const duplicateQuery = this.db.query<{ count: number }, []>(
      "SELECT COUNT(DISTINCT hash) as count FROM files WHERE hash IN (SELECT hash FROM files GROUP BY hash HAVING COUNT(*) > 1)"
    );

    return {
      totalFiles: totalQuery.get()?.count || 0,
      duplicateFiles: duplicateQuery.get()?.count || 0,
    };
  }

  // ============ History Methods ============

  /**
   * Add or update a directory in history
   */
  addDirectoryToHistory(directoryPath: string): void {
    const normalizedPath = path.resolve(directoryPath);
    this.db.run(
      `INSERT INTO history (type, value, last_used, use_count)
       VALUES ('directory', ?, strftime('%s', 'now'), 1)
       ON CONFLICT(type, value, platform, service) DO UPDATE SET
         last_used = strftime('%s', 'now'),
         use_count = use_count + 1`,
      [normalizedPath]
    );
  }

  /**
   * Add or update a user in history
   */
  addUserToHistory(userId: string, platform: string, service: string): void {
    this.db.run(
      `INSERT INTO history (type, value, platform, service, last_used, use_count)
       VALUES ('user', ?, ?, ?, strftime('%s', 'now'), 1)
       ON CONFLICT(type, value, platform, service) DO UPDATE SET
         last_used = strftime('%s', 'now'),
         use_count = use_count + 1`,
      [userId, platform, service]
    );
  }

  /**
   * Add or update a RedGifs search in history
   */
  addRedgifsToHistory(username: string, tags: string, order: string): void {
    // Create a unique value combining username and tags
    const value = username || `tags:${tags}`;
    this.db.run(
      `INSERT INTO history (type, value, platform, service, last_used, use_count)
       VALUES ('redgifs', ?, ?, ?, strftime('%s', 'now'), 1)
       ON CONFLICT(type, value, platform, service) DO UPDATE SET
         last_used = strftime('%s', 'now'),
         use_count = use_count + 1`,
      [value, tags || null, order || 'latest']
    );
  }

  /**
   * Add or update a Bunkr album in history
   */
  addBunkrToHistory(albumUrl: string): void {
    this.db.run(
      `INSERT INTO history (type, value, last_used, use_count)
       VALUES ('bunkr', ?, strftime('%s', 'now'), 1)
       ON CONFLICT(type, value, platform, service) DO UPDATE SET
         last_used = strftime('%s', 'now'),
         use_count = use_count + 1`,
      [albumUrl]
    );
  }

  /**
   * Get recent directories from history
   */
  getRecentDirectories(limit: number = 10): HistoryEntry[] {
    const query = this.db.query<HistoryEntry, [number]>(
      `SELECT * FROM history
       WHERE type = 'directory'
       ORDER BY last_used DESC
       LIMIT ?`
    );
    return query.all(limit);
  }

  /**
   * Get recent users from history
   */
  getRecentUsers(limit: number = 10, platform?: string, service?: string): HistoryEntry[] {
    if (platform && service) {
      const query = this.db.query<HistoryEntry, [string, string, number]>(
        `SELECT * FROM history
         WHERE type = 'user' AND platform = ? AND service = ?
         ORDER BY last_used DESC
         LIMIT ?`
      );
      return query.all(platform, service, limit);
    } else if (platform) {
      const query = this.db.query<HistoryEntry, [string, number]>(
        `SELECT * FROM history
         WHERE type = 'user' AND platform = ?
         ORDER BY last_used DESC
         LIMIT ?`
      );
      return query.all(platform, limit);
    } else {
      const query = this.db.query<HistoryEntry, [number]>(
        `SELECT * FROM history
         WHERE type = 'user'
         ORDER BY last_used DESC
         LIMIT ?`
      );
      return query.all(limit);
    }
  }

  /**
   * Get recent RedGifs searches from history
   */
  getRecentRedgifs(limit: number = 10): HistoryEntry[] {
    const query = this.db.query<HistoryEntry, [number]>(
      `SELECT * FROM history
       WHERE type = 'redgifs'
       ORDER BY last_used DESC
       LIMIT ?`
    );
    return query.all(limit);
  }

  /**
   * Get recent Bunkr albums from history
   */
  getRecentBunkr(limit: number = 10): HistoryEntry[] {
    const query = this.db.query<HistoryEntry, [number]>(
      `SELECT * FROM history
       WHERE type = 'bunkr'
       ORDER BY last_used DESC
       LIMIT ?`
    );
    return query.all(limit);
  }

  /**
   * Get all history entries
   */
  getAllHistory(): { directories: HistoryEntry[]; users: HistoryEntry[]; redgifs: HistoryEntry[]; bunkr: HistoryEntry[] } {
    return {
      directories: this.getRecentDirectories(50),
      users: this.getRecentUsers(50),
      redgifs: this.getRecentRedgifs(50),
      bunkr: this.getRecentBunkr(50),
    };
  }

  /**
   * Delete a history entry
   */
  deleteHistoryEntry(id: number): void {
    this.db.run(`DELETE FROM history WHERE id = ?`, [id]);
  }

  /**
   * Clear all history
   */
  clearHistory(type?: "directory" | "user"): void {
    if (type) {
      this.db.run(`DELETE FROM history WHERE type = ?`, [type]);
    } else {
      this.db.run(`DELETE FROM history`);
    }
  }

  // ============ Playlist Methods ============

  /**
   * Create a new playlist
   */
  createPlaylist(name: string, description?: string): Playlist {
    const insert = this.db.run(
      `INSERT INTO playlists (name, description)
       VALUES (?, ?)`,
      [name, description || null]
    );

    return {
      id: Number(insert.lastInsertRowid),
      name,
      description,
      created_at: Math.floor(Date.now() / 1000),
      updated_at: Math.floor(Date.now() / 1000),
    };
  }

  /**
   * Get all playlists
   */
  getAllPlaylists(): Playlist[] {
    const query = this.db.query<Playlist, []>(
      `SELECT * FROM playlists ORDER BY updated_at DESC`
    );
    return query.all();
  }

  /**
   * Get a playlist by ID
   */
  getPlaylist(id: number): Playlist | null {
    const query = this.db.query<Playlist, [number]>(
      `SELECT * FROM playlists WHERE id = ?`
    );
    return query.get(id) || null;
  }

  /**
   * Get a playlist by name
   */
  getPlaylistByName(name: string): Playlist | null {
    const query = this.db.query<Playlist, [string]>(
      `SELECT * FROM playlists WHERE name = ?`
    );
    return query.get(name) || null;
  }

  /**
   * Update playlist name and/or description
   */
  updatePlaylist(id: number, name?: string, description?: string): void {
    const playlist = this.getPlaylist(id);
    if (!playlist) throw new Error("Playlist not found");

    const updates: string[] = [];
    const values: any[] = [];

    if (name !== undefined) {
      updates.push("name = ?");
      values.push(name);
    }
    if (description !== undefined) {
      updates.push("description = ?");
      values.push(description);
    }

    if (updates.length > 0) {
      updates.push("updated_at = strftime('%s', 'now')");
      values.push(id);

      this.db.run(
        `UPDATE playlists SET ${updates.join(", ")} WHERE id = ?`,
        values
      );
    }
  }

  /**
   * Delete a playlist and all its items
   */
  deletePlaylist(id: number): void {
    this.db.run(`DELETE FROM playlists WHERE id = ?`, [id]);
    // CASCADE will automatically delete playlist_items
  }

  /**
   * Generate thumbnail for a video URL (works with both local and proxy URLs)
   */
  private async generatePlaylistThumbnail(mediaUrl: string): Promise<string | null> {
    try {
      console.log(`[THUMBNAIL] Starting thumbnail generation for: ${mediaUrl}`);

      // Parse the URL to extract the actual file path or remote URL
      let filePath: string | null = null;

      if (mediaUrl.includes("/proxy/local-media?path=")) {
        console.log(`[THUMBNAIL] Detected local file proxy URL`);
        // Local file via proxy
        const url = new URL(mediaUrl, "http://localhost");
        const pathParam = url.searchParams.get("path");
        if (pathParam) {
          filePath = decodeURIComponent(pathParam);
          console.log(`[THUMBNAIL] Extracted local file path: ${filePath}`);
        }
      } else if (mediaUrl.includes("/proxy/media?url=")) {
        console.log(`[THUMBNAIL] Detected remote media proxy URL`);
        // Remote file via proxy - try to get RedGifs thumbnail
        const url = new URL(mediaUrl, "http://localhost");
        const remoteUrl = url.searchParams.get("url");
        console.log(`[THUMBNAIL] Extracted remote URL: ${remoteUrl}`);

        if (remoteUrl) {
          // Check if it's a RedGifs URL
          if (remoteUrl.includes("redgifs.com") || remoteUrl.includes("redgifs")) {
            console.log(`[THUMBNAIL] Detected RedGifs URL, fetching thumbnail from API`);
            const thumbnail = await this.getRedGifsThumbnail(remoteUrl);
            console.log(`[THUMBNAIL] RedGifs thumbnail result: ${thumbnail}`);
            return thumbnail;
          } else {
            console.log(`[THUMBNAIL] Non-RedGifs remote URL, skipping thumbnail`);
          }
        }

        // Other remote URLs - can't generate thumbnail
        return null;
      } else {
        console.log(`[THUMBNAIL] Detected direct file path`);
        // Direct file path
        filePath = mediaUrl;
      }

      if (!filePath) {
        console.log(`[THUMBNAIL] No file path extracted, returning null`);
        return null;
      }

      if (!existsSync(filePath)) {
        console.log(`[THUMBNAIL] File does not exist: ${filePath}`);
        return null;
      }

      console.log(`[THUMBNAIL] Checking cache for: ${filePath}`);
      // Check if we already have a cached file record with thumbnail
      const cached = this.getCachedRecord(filePath);
      if (cached?.thumbnail_path) {
        console.log(`[THUMBNAIL] Found cached thumbnail: ${cached.thumbnail_path}`);
        return cached.thumbnail_path;
      }

      console.log(`[THUMBNAIL] No cached thumbnail, generating new one`);
      // Generate new thumbnail using existing file record system
      const record = await this.getOrCreateFileRecord(filePath);
      console.log(`[THUMBNAIL] Generated thumbnail: ${record.thumbnail_path}`);
      return record.thumbnail_path;
    } catch (error) {
      console.error("[THUMBNAIL] Failed to generate playlist thumbnail:", error);
      return null;
    }
  }

  /**
   * Get thumbnail URL from RedGifs API
   */
  private async getRedGifsThumbnail(videoUrl: string): Promise<string | null> {
    try {
      console.log(`Getting RedGifs thumbnail for: ${videoUrl}`);

      // Extract gif ID from RedGifs URL
      // Format: https://thumbs2.redgifs.com/.../{id}.mp4 or similar
      const match = videoUrl.match(/\/([a-zA-Z0-9-_]+)\.(mp4|webm)/);
      if (!match) {
        console.warn("Could not extract RedGifs ID from URL:", videoUrl);
        return null;
      }

      const gifId = match[1].toLowerCase(); // RedGifs API uses lowercase IDs
      console.log(`Extracted RedGifs ID: ${gifId}`);

      // Call RedGifs backend to get gif info
      const redgifsBaseUrl = process.env.REDGIFS_API_URL || "http://localhost:8000";
      const apiUrl = `${redgifsBaseUrl}/api/gif/${gifId}`;
      console.log(`Calling RedGifs API: ${apiUrl}`);

      const response = await fetch(apiUrl);

      if (!response.ok) {
        console.warn(`RedGifs API error for ${gifId}:`, response.status, response.statusText);
        const errorText = await response.text();
        console.warn(`Error response: ${errorText}`);
        return null;
      }

      const data = await response.json();
      console.log(`RedGifs API response:`, data);

      // Get poster (better quality) or thumbnail URL
      const directUrl = data.urls?.poster || data.urls?.thumbnail || null;

      if (!directUrl) {
        console.warn("No thumbnail URL found in RedGifs API response");
        return null;
      }

      // Proxy the thumbnail through NSRI's /proxy/media endpoint (same as video URLs)
      const proxiedUrl = `/proxy/media?url=${encodeURIComponent(directUrl)}`;
      console.log(`RedGifs proxied thumbnail URL: ${proxiedUrl}`);
      return proxiedUrl;
    } catch (error) {
      console.warn("Failed to get RedGifs thumbnail:", error);
      return null;
    }
  }

  /**
   * Add a media item to a playlist
   */
  async addToPlaylist(playlistId: number, mediaUrl: string): Promise<void> {
    // Get the current max order_index for this playlist
    const maxQuery = this.db.query<{ max_order: number | null }, [number]>(
      `SELECT MAX(order_index) as max_order FROM playlist_items WHERE playlist_id = ?`
    );
    const result = maxQuery.get(playlistId);
    const nextOrder = (result?.max_order ?? -1) + 1;

    // Generate thumbnail for the video
    console.log(`Generating thumbnail for: ${mediaUrl}`);
    const thumbnailPath = await this.generatePlaylistThumbnail(mediaUrl);
    console.log(`Generated thumbnail path: ${thumbnailPath}`);

    // Insert the item with thumbnail
    this.db.run(
      `INSERT OR IGNORE INTO playlist_items (playlist_id, media_url, order_index, thumbnail_path)
       VALUES (?, ?, ?, ?)`,
      [playlistId, mediaUrl, nextOrder, thumbnailPath]
    );

    console.log(`Added to playlist ${playlistId}: ${mediaUrl} with thumbnail ${thumbnailPath}`);

    // Update playlist's updated_at timestamp
    this.db.run(
      `UPDATE playlists SET updated_at = strftime('%s', 'now') WHERE id = ?`,
      [playlistId]
    );
  }

  /**
   * Get all items in a playlist, ordered by order_index
   */
  getPlaylistItems(playlistId: number): PlaylistItem[] {
    const query = this.db.query<PlaylistItem, [number]>(
      `SELECT * FROM playlist_items WHERE playlist_id = ? ORDER BY order_index ASC`
    );
    return query.all(playlistId);
  }

  /**
   * Remove an item from a playlist
   */
  removeFromPlaylist(playlistId: number, mediaUrl: string): void {
    // Get the order_index of the item being removed
    const itemQuery = this.db.query<PlaylistItem, [number, string]>(
      `SELECT * FROM playlist_items WHERE playlist_id = ? AND media_url = ?`
    );
    const item = itemQuery.get(playlistId, mediaUrl);

    if (item) {
      // Delete the item
      this.db.run(
        `DELETE FROM playlist_items WHERE playlist_id = ? AND media_url = ?`,
        [playlistId, mediaUrl]
      );

      // Reorder remaining items to fill the gap
      this.db.run(
        `UPDATE playlist_items
         SET order_index = order_index - 1
         WHERE playlist_id = ? AND order_index > ?`,
        [playlistId, item.order_index]
      );

      // Update playlist's updated_at timestamp
      this.db.run(
        `UPDATE playlists SET updated_at = strftime('%s', 'now') WHERE id = ?`,
        [playlistId]
      );
    }
  }

  /**
   * Reorder a playlist item
   */
  reorderPlaylistItem(playlistId: number, mediaUrl: string, newIndex: number): void {
    // Get current item
    const itemQuery = this.db.query<PlaylistItem, [number, string]>(
      `SELECT * FROM playlist_items WHERE playlist_id = ? AND media_url = ?`
    );
    const item = itemQuery.get(playlistId, mediaUrl);

    if (!item) return;

    const oldIndex = item.order_index;

    if (oldIndex === newIndex) return;

    // Move items in between
    if (oldIndex < newIndex) {
      // Moving down: shift items up
      this.db.run(
        `UPDATE playlist_items
         SET order_index = order_index - 1
         WHERE playlist_id = ? AND order_index > ? AND order_index <= ?`,
        [playlistId, oldIndex, newIndex]
      );
    } else {
      // Moving up: shift items down
      this.db.run(
        `UPDATE playlist_items
         SET order_index = order_index + 1
         WHERE playlist_id = ? AND order_index >= ? AND order_index < ?`,
        [playlistId, newIndex, oldIndex]
      );
    }

    // Update the moved item
    this.db.run(
      `UPDATE playlist_items SET order_index = ? WHERE playlist_id = ? AND media_url = ?`,
      [newIndex, playlistId, mediaUrl]
    );

    // Update playlist's updated_at timestamp
    this.db.run(
      `UPDATE playlists SET updated_at = strftime('%s', 'now') WHERE id = ?`,
      [playlistId]
    );
  }

  /**
   * Check if a media URL exists in a playlist
   */
  isInPlaylist(playlistId: number, mediaUrl: string): boolean {
    const query = this.db.query<{ count: number }, [number, string]>(
      `SELECT COUNT(*) as count FROM playlist_items WHERE playlist_id = ? AND media_url = ?`
    );
    const result = query.get(playlistId, mediaUrl);
    return (result?.count ?? 0) > 0;
  }

  /**
   * Regenerate thumbnails for all playlist items missing thumbnails
   */
  async regenerateMissingThumbnails(): Promise<number> {
    const query = this.db.query<PlaylistItem, []>(
      `SELECT * FROM playlist_items WHERE thumbnail_path IS NULL OR thumbnail_path = ''`
    );
    const itemsNeedingThumbnails = query.all();

    console.log(`Found ${itemsNeedingThumbnails.length} playlist items missing thumbnails`);

    let regenerated = 0;
    for (const item of itemsNeedingThumbnails) {
      console.log(`Regenerating thumbnail for: ${item.media_url}`);
      const thumbnailPath = await this.generatePlaylistThumbnail(item.media_url);

      if (thumbnailPath) {
        this.db.run(
          `UPDATE playlist_items SET thumbnail_path = ? WHERE id = ?`,
          [thumbnailPath, item.id]
        );
        regenerated++;
        console.log(`Updated thumbnail for item ${item.id}: ${thumbnailPath}`);
      }
    }

    console.log(`Regenerated ${regenerated} thumbnails`);
    return regenerated;
  }

  /**
   * Close database connection
   */
  close() {
    this.db.close();
  }
}

// Singleton instance
let cacheInstance: FileCache | null = null;

export function getFileCache(): FileCache {
  if (!cacheInstance) {
    cacheInstance = new FileCache();
  }
  return cacheInstance;
}

export { FileCache };
export type { FileRecord, HistoryEntry, Playlist, PlaylistItem };
