import type { Route } from "./+types/proxy.local-media";
import { createReadStream } from "fs";
import { stat } from "fs/promises";
import path from "path";

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const filePath = url.searchParams.get("path");

  if (!filePath) {
    throw new Response("Missing path parameter", { status: 400 });
  }

  try {
    // Decode and normalize the path to handle special characters and mixed slashes
    const decodedPath = decodeURIComponent(filePath);
    const normalizedPath = path.resolve(decodedPath);

    console.log(`Serving local media: ${normalizedPath}`);

    // Check if file exists and is a file
    const stats = await stat(normalizedPath);
    if (!stats.isFile()) {
      throw new Response("Path is not a file", { status: 400 });
    }

    // Determine content type based on file extension
    const ext = path.extname(normalizedPath).toLowerCase();
    const contentTypes: Record<string, string> = {
      ".mp4": "video/mp4",
      ".webm": "video/webm",
      ".mov": "video/quicktime",
      ".avi": "video/x-msvideo",
      ".mkv": "video/x-matroska",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".png": "image/png",
      ".gif": "image/gif",
      ".webp": "image/webp",
    };

    const contentType = contentTypes[ext] || "application/octet-stream";
    const fileSize = stats.size;

    // Handle range requests for video seeking
    const range = request.headers.get("range");

    if (range) {
      // Parse range header (e.g., "bytes=0-1023")
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunkSize = end - start + 1;

      // Create stream for the requested range with highWaterMark to limit buffering
      const fileStream = createReadStream(normalizedPath, {
        start,
        end,
        highWaterMark: 64 * 1024 // 64KB chunks to reduce memory usage
      });
      let isCancelled = false;

      // Convert Node.js ReadableStream to Web ReadableStream with backpressure
      const webStream = new ReadableStream({
        start(controller) {
          fileStream.on("data", (chunk) => {
            if (isCancelled) return;

            // Pause stream to apply backpressure
            fileStream.pause();
            controller.enqueue(Uint8Array.from(typeof chunk === 'string' ? new TextEncoder().encode(chunk) : chunk));
          });

          fileStream.on("end", () => {
            if (!isCancelled) {
              controller.close();
            }
          });

          fileStream.on("error", (error) => {
            if (!isCancelled) {
              controller.error(error);
            }
            fileStream.destroy();
          });
        },

        pull(controller) {
          // Resume reading when browser is ready for more data
          if (!isCancelled && !fileStream.destroyed) {
            fileStream.resume();
          }
        },

        cancel(reason) {
          isCancelled = true;
          console.log(`Stream cancelled for ${normalizedPath}: ${reason}`);
          fileStream.pause();
          fileStream.destroy();
          fileStream.removeAllListeners();
        },
      });

      // Return 206 Partial Content
      return new Response(webStream, {
        status: 206,
        headers: {
          "Content-Type": contentType,
          "Content-Length": chunkSize.toString(),
          "Content-Range": `bytes ${start}-${end}/${fileSize}`,
          "Accept-Ranges": "bytes",
          "Cache-Control": "public, max-age=31536000",
        },
      });
    }

    // No range request - stream entire file with highWaterMark to limit buffering
    const fileStream = createReadStream(normalizedPath, {
      highWaterMark: 64 * 1024 // 64KB chunks to reduce memory usage
    });
    let isCancelled = false;

    // Convert Node.js ReadableStream to Web ReadableStream with backpressure
    const webStream = new ReadableStream({
      start(controller) {
        fileStream.on("data", (chunk) => {
          if (isCancelled) return;

          // Pause stream to apply backpressure
          fileStream.pause();
          controller.enqueue(Uint8Array.from(typeof chunk === 'string' ? new TextEncoder().encode(chunk) : chunk));
        });

        fileStream.on("end", () => {
          if (!isCancelled) {
            controller.close();
          }
        });

        fileStream.on("error", (error) => {
          if (!isCancelled) {
            controller.error(error);
          }
          fileStream.destroy();
        });
      },

      pull(controller) {
        // Resume reading when browser is ready for more data
        if (!isCancelled && !fileStream.destroyed) {
          fileStream.resume();
        }
      },

      cancel(reason) {
        isCancelled = true;
        console.log(`Stream cancelled for ${normalizedPath}: ${reason}`);
        fileStream.pause();
        fileStream.destroy();
        fileStream.removeAllListeners();
      },
    });

    return new Response(webStream, {
      headers: {
        "Content-Type": contentType,
        "Content-Length": fileSize.toString(),
        "Accept-Ranges": "bytes",
        "Cache-Control": "public, max-age=31536000",
      },
    });
  } catch (error) {
    console.error("Error serving local media:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Response(errorMessage, { status: 500 });
  }
}
