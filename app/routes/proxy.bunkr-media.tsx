import type { Route } from "./+types/proxy.bunkr-media";

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const mediaUrl = url.searchParams.get("url");

  if (!mediaUrl) {
    throw new Response("Missing url parameter", { status: 400 });
  }

  try {
    // Forward the request to the Bunkr backend proxy
    const bunkrBackendUrl = "http://localhost:8001";
    const proxyUrl = `${bunkrBackendUrl}/proxy?url=${encodeURIComponent(mediaUrl)}`;

    const response = await fetch(proxyUrl, {
      headers: {
        "User-Agent": request.headers.get("User-Agent") || "Mozilla/5.0",
      },
    });

    if (!response.ok) {
      throw new Response(`Failed to fetch media: ${response.statusText}`, {
        status: response.status,
      });
    }

    // Get the response body as a stream
    const body = response.body;
    if (!body) {
      throw new Response("No response body", { status: 500 });
    }

    // Forward the response with appropriate headers
    return new Response(body, {
      status: response.status,
      headers: {
        "Content-Type": response.headers.get("Content-Type") || "application/octet-stream",
        "Cache-Control": "public, max-age=86400",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (error) {
    console.error("Error proxying Bunkr media:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Response(`Proxy error: ${errorMessage}`, { status: 500 });
  }
}
