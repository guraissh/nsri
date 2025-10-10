import type { Route } from "./+types/proxy.media";
import { parsedCookies } from "~/sessions.server";

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const mediaUrl = url.searchParams.get("url");

  if (!mediaUrl) {
    throw new Response("Missing media URL", { status: 400 });
  }

  try {
    console.log("Proxying media request for:", mediaUrl);

    // Create cookie string from parsed cookies
    const cookieString = parsedCookies.map(cookie => `${cookie.name}=${cookie.value}`).join('; ');

    // Fetch the media file with authentication cookies
    const mediaResponse = await fetch(mediaUrl, {
      headers: {
        'Cookie': cookieString,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': new URL(mediaUrl).origin,
      },
    });

    if (!mediaResponse.ok) {
      throw new Response(`Failed to fetch media: ${mediaResponse.status}`, { 
        status: mediaResponse.status 
      });
    }

    // Get the content type from the original response
    const contentType = mediaResponse.headers.get("content-type") || "application/octet-stream";
    const contentLength = mediaResponse.headers.get("content-length");

    // Create response headers
    const headers = new Headers({
      "Content-Type": contentType,
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
      "Access-Control-Allow-Headers": "Range, Content-Range, Content-Length",
      "Accept-Ranges": "bytes",
    });

    if (contentLength) {
      headers.set("Content-Length", contentLength);
    }

    // Handle range requests for video streaming
    const rangeHeader = request.headers.get("range");
    if (rangeHeader && mediaResponse.body) {
      // For range requests, we need to re-fetch with the range header
      const rangeResponse = await fetch(mediaUrl, {
        headers: {
          'Cookie': cookieString,
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Referer': new URL(mediaUrl).origin,
          'Range': rangeHeader,
        },
      });

      if (rangeResponse.status === 206) {
        const rangeHeaders = new Headers(headers);
        rangeHeaders.set("Content-Range", rangeResponse.headers.get("content-range") || "");
        rangeHeaders.set("Content-Length", rangeResponse.headers.get("content-length") || "");
        
        return new Response(rangeResponse.body, {
          status: 206,
          headers: rangeHeaders,
        });
      }
    }

    return new Response(mediaResponse.body, {
      headers,
    });

  } catch (error) {
    console.error("Error proxying media:", error);
    throw new Response("Failed to proxy media", { status: 500 });
  }
}