import type { Route } from "./+types/api.redgifs-tags";

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const redgifsBaseUrl = process.env.REDGIFS_API_URL || "http://localhost:8000";
  const username = url.searchParams.get("username");
  const action = url.searchParams.get("action");
  const originalUrl = url.searchParams.get("url");
  if (action){
    if(action === "verify"){
      return await fetch(`${redgifsBaseUrl}/verify-cache?url=${originalUrl}`, {
         method: 'POST'
      });
    }
    if(action === "purge"){

	return await fetch(`${redgifsBaseUrl}/invalidate-cache?url=${originalUrl}`, {
		method: 'POST'
	});
    }
  }

  if (!username) {
    return Response.json({ error: "Username is required" }, { status: 400 });
  }

  try {
    const response = await fetch(`${redgifsBaseUrl}/api/user/${username}/tags`);

    if (!response.ok) {
      throw new Error(`RedGifs API error: ${response.status}`);
    }

    const data = await response.json();
    return Response.json(data);
  } catch (error) {
    console.error("Error fetching RedGifs tags:", error);
    const errorMsg = error instanceof Error ? error.message : String(error);
    return Response.json({ error: errorMsg, tags: [] }, { status: 500 });
  }
}
