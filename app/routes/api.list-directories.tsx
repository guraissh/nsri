import type { Route } from "./+types/api.list-directories";
import { promises as fs } from "fs";
import path from "path";
import os from "os";
import { getFileCache } from "~/fileCache.server";

export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") {
    throw new Response("Method not allowed", { status: 405 });
  }

  try {
    const { currentPath, includeFiles = false } = await request.json();

    // Determine the starting path
    let targetPath: string;

    if (!currentPath || currentPath === "") {
      // Start at user's home directory
      targetPath = os.homedir();
    } else {
      targetPath = currentPath;
    }

    // Normalize and resolve the path
    const normalizedPath = path.resolve(targetPath);

    console.log(`Listing directories in: ${normalizedPath}`);

    // Read directory contents
    const entries = await fs.readdir(normalizedPath, { withFileTypes: true });

    // Filter to only directories and sort alphabetically
    const directories = entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => ({
        name: entry.name,
        path: path.join(normalizedPath, entry.name),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    // Optionally include video files with thumbnails
    let files: Array<{
      name: string;
      path: string;
      thumbnail: string | null;
      duration: number | null;
    }> = [];

    if (includeFiles) {
      const supportedExtensions = [".mp4", ".webm", ".mov", ".avi", ".mkv"];
      const cache = getFileCache();

      for (const entry of entries) {
        if (entry.isFile()) {
          const ext = path.extname(entry.name).toLowerCase();
          if (supportedExtensions.includes(ext)) {
            const filePath = path.join(normalizedPath, entry.name);
            try {
              const record = await cache.getOrCreateFileRecord(filePath);
              files.push({
                name: entry.name,
                path: filePath,
                thumbnail: record.thumbnail_path,
                duration: record.duration,
              });
            } catch (err) {
              console.warn(`Error processing file ${entry.name}:`, err);
            }
          }
        }
      }

      // Sort files alphabetically
      files.sort((a, b) => a.name.localeCompare(b.name));
    }

    // Get parent directory (null if at root)
    const parentPath = path.dirname(normalizedPath);
    const hasParent = normalizedPath !== parentPath;

    // Get available drives on Windows
    let drives: string[] = [];
    if (process.platform === "win32") {
      // On Windows, list common drive letters
      const possibleDrives = ["C:", "D:", "E:", "F:", "G:", "H:"];
      for (const drive of possibleDrives) {
        try {
          await fs.access(drive + "\\");
          drives.push(drive + "\\");
        } catch {
          // Drive doesn't exist, skip
        }
      }
    }

    return Response.json({
      currentPath: normalizedPath,
      parentPath: hasParent ? parentPath : null,
      directories,
      files,
      platform: process.platform,
      drives,
    });
  } catch (error) {
    console.error("Error listing directories:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);

    // If permission denied, return a helpful message
    if (errorMessage.includes("EACCES") || errorMessage.includes("EPERM")) {
      return Response.json(
        {
          error: "Permission denied to access this directory",
          currentPath: "",
          directories: [],
          drives: [],
        },
        { status: 403 },
      );
    }

    return Response.json(
      {
        error: errorMessage,
        currentPath: "",
        directories: [],
        drives: [],
      },
      { status: 500 },
    );
  }
}
