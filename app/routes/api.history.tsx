import type { Route } from "./+types/api.history";
import { getFileCache } from "~/fileCache.server";

export async function loader({ request }: Route.LoaderArgs) {
  const cache = getFileCache();
  const history = cache.getAllHistory();
  return Response.json(history);
}

export async function action({ request }: Route.ActionArgs) {
  const cache = getFileCache();

  if (request.method === "POST") {
    const body = await request.json();
    const { type, value, platform, service, username, tags, order } = body;

    if (type === "directory" && value) {
      cache.addDirectoryToHistory(value);
      return Response.json({ success: true });
    } else if (type === "user" && value && platform && service) {
      cache.addUserToHistory(value, platform, service);
      return Response.json({ success: true });
    } else if (type === "redgifs" && (username || tags)) {
      cache.addRedgifsToHistory(username || "", tags || "", order || "latest");
      return Response.json({ success: true });
    } else if (type === "bunkr" && value) {
      cache.addBunkrToHistory(value);
      return Response.json({ success: true });
    }

    return Response.json({ error: "Invalid request" }, { status: 400 });
  }

  if (request.method === "DELETE") {
    const body = await request.json();
    const { id, clearAll, clearType } = body;

    if (clearAll) {
      cache.clearHistory(clearType);
      return Response.json({ success: true });
    } else if (id) {
      cache.deleteHistoryEntry(id);
      return Response.json({ success: true });
    }

    return Response.json({ error: "Invalid request" }, { status: 400 });
  }

  return Response.json({ error: "Method not allowed" }, { status: 405 });
}
