import { rg_getUserTags, rg_invalidateCache, rg_verifyCache } from "~/redgifs";
import type { Route } from "./+types/api.redgifs-tags";

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const username = url.searchParams.get("username");
  const action = url.searchParams.get("action");
  const originalUrl = url.searchParams.get("url");

  if (action) {
    if (action === "verify") {
      return await rg_verifyCache(originalUrl || "");
    }
    if (action === "purge") {
      return await rg_invalidateCache(originalUrl || "");
    }
  }

  if (!username) {
    return Response.json({ error: "Username is required" }, { status: 400 });
  }

  try {
    const data = await rg_getUserTags(username);
    return Response.json(data);
  } catch (error) {
    console.error("Error fetching RedGifs tags:", error);
    const errorMsg = error instanceof Error ? error.message : String(error);
    return Response.json({ error: errorMsg, tags: [] }, { status: 500 });
  }
}
