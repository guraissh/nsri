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
      }

      return null;
    } catch (err) {
      console.warn(`Failed to generate thumbnail for ${path.basename(filePath)}:`, err);
      return null;
    }
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

    // If file hasn't changed, return cached record
    if (existing && existing.mtime === mtimeMs && existing.size === stats.size) {
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
export type { FileRecord };
