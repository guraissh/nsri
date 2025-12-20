import type { Route } from "./+types/api.cache-stats";
import RedgifsClient from "~/redgifs.client";
import BunkrClient from "~/bunkr.client";

export async function loader({ request }: Route.LoaderArgs) {
	const url = new URL(request.url);
	const backend = url.searchParams.get("backend");

	try {
		if (backend === "redgifs") {
			const stats = await RedgifsClient.getCacheStats();
			if (!stats) {
				return Response.json({ error: "Failed to fetch RedGifs cache stats" }, { status: 500 });
			}
			return Response.json(stats);
		} else if (backend === "bunkr") {
			const stats = await BunkrClient.getCacheStats();
			if (!stats) {
				return Response.json({ error: "Failed to fetch Bunkr cache stats" }, { status: 500 });
			}
			return Response.json(stats);
		} else {
			// Get stats from both backends
			const [redgifsStats, bunkrStats] = await Promise.all([
				RedgifsClient.getCacheStats(),
				BunkrClient.getCacheStats()
			]);

			return Response.json({
				redgifs: redgifsStats,
				bunkr: bunkrStats
			});
		}
	} catch (error) {
		console.error("Error fetching cache stats:", error);
		const errorMsg = error instanceof Error ? error.message : String(error);
		return Response.json({ error: errorMsg }, { status: 500 });
	}
}
