import type { Route } from "./+types/api.redgifs-tags";

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const username = url.searchParams.get("username");

  if (!username) {
    return Response.json({ error: "Username is required" }, { status: 400 });
  }

  try {
    const redgifsBaseUrl = process.env.REDGIFS_API_URL || "http://localhost:8000";
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
