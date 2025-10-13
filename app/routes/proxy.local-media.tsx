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
      '.mp4': 'video/mp4',
      '.webm': 'video/webm',
      '.mov': 'video/quicktime',
      '.avi': 'video/x-msvideo',
      '.mkv': 'video/x-matroska',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
    };

    const contentType = contentTypes[ext] || 'application/octet-stream';

    // Create a readable stream from the file
    const fileStream = createReadStream(normalizedPath);

    // Convert Node.js ReadableStream to Web ReadableStream
    const webStream = new ReadableStream({
      start(controller) {
        fileStream.on('data', (chunk: Buffer | string) => {
          controller.enqueue(typeof chunk === 'string' ? chunk :  new Uint8Array(chunk));
        });
        fileStream.on('end', () => {
          controller.close();
        });
        fileStream.on('error', (error) => {
          controller.error(error);
        });
      },
      cancel() {
        fileStream.destroy();
      }
    });

    return new Response(webStream, {
      headers: {
        "Content-Type": contentType,
        "Content-Length": stats.size.toString(),
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
