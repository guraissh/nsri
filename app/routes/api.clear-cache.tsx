import type { Route } from "./+types/api.clear-cache";
import * as RedgifsClient from "~/lib/redgifs.client";
import * as BunkrClient from "~/lib/bunkr.client";

export async function action({ request }: Route.ActionArgs) {
  const url = new URL(request.url);
  const backend = url.searchParams.get("backend");

  if (!backend || (backend !== "redgifs" && backend !== "bunkr")) {
    return Response.json({ error: "Backend parameter required (redgifs or bunkr)" }, { status: 400 });
  }

  try {
    const result = backend === "redgifs"
      ? await RedgifsClient.clearAllCache()
      : await BunkrClient.clearAllCache();

    return Response.json(result);
  } catch (error) {
    console.error("Error clearing cache:", error);
    const errorMsg = error instanceof Error ? error.message : String(error);
    return Response.json({ error: errorMsg }, { status: 500 });
  }
}
