import type { Route } from "./+types/api.playlists";
import { getFileCache } from "~/fileCache.server";

export async function loader({ request }: Route.LoaderArgs) {
  const cache = getFileCache();
  const url = new URL(request.url);
  const playlistId = url.searchParams.get("id");

  if (playlistId) {
    // Get specific playlist with its items
    const playlist = cache.getPlaylist(parseInt(playlistId));
    if (!playlist) {
      return Response.json({ error: "Playlist not found" }, { status: 404 });
    }
    const items = cache.getPlaylistItems(parseInt(playlistId));
    return Response.json({ playlist, items });
  } else {
    // Get all playlists with video counts
    const playlists = cache.getAllPlaylists();
    const playlistsWithCounts = playlists.map(playlist => {
      const items = cache.getPlaylistItems(playlist.id!);
      return {
        ...playlist,
        videoCount: items.length
      };
    });
    return Response.json({ playlists: playlistsWithCounts });
  }
}

export async function action({ request }: Route.ActionArgs) {
  const cache = getFileCache();
  const body = await request.json();

  try {
    if (request.method === "POST") {
      const { action, playlistId, name, description, mediaUrl } = body;

      if (action === "create") {
        // Create new playlist
        if (!name) {
          return Response.json({ error: "Name is required" }, { status: 400 });
        }
        const playlist = cache.createPlaylist(name, description);
        return Response.json({ success: true, playlist });
      } else if (action === "add") {
        // Add item to playlist
        if (playlistId === undefined || playlistId === null || !mediaUrl) {
          console.error("Missing required fields:", { playlistId, mediaUrl });
          return Response.json({
            error: "Playlist ID and media URL are required",
            received: { playlistId, mediaUrl }
          }, { status: 400 });
        }
        const id = typeof playlistId === 'string' ? parseInt(playlistId) : playlistId;
        await cache.addToPlaylist(id, mediaUrl);
        return Response.json({ success: true });
      } else {
        return Response.json({ error: "Invalid action" }, { status: 400 });
      }
    }

    if (request.method === "PUT") {
      const { action, playlistId, name, description, mediaUrl, newIndex } = body;

      if (action === "update") {
        // Update playlist metadata
        if (!playlistId) {
          return Response.json({ error: "Playlist ID is required" }, { status: 400 });
        }
        cache.updatePlaylist(parseInt(playlistId), name, description);
        return Response.json({ success: true });
      } else if (action === "reorder") {
        // Reorder playlist item
        if (!playlistId || !mediaUrl || newIndex === undefined) {
          return Response.json({ error: "Playlist ID, media URL, and new index are required" }, { status: 400 });
        }
        cache.reorderPlaylistItem(parseInt(playlistId), mediaUrl, newIndex);
        return Response.json({ success: true });
      } else {
        return Response.json({ error: "Invalid action" }, { status: 400 });
      }
    }

    if (request.method === "DELETE") {
      const { playlistId, mediaUrl } = body;

      if (mediaUrl) {
        // Remove item from playlist
        if (!playlistId) {
          return Response.json({ error: "Playlist ID is required" }, { status: 400 });
        }
        cache.removeFromPlaylist(parseInt(playlistId), mediaUrl);
        return Response.json({ success: true });
      } else if (playlistId) {
        // Delete entire playlist
        cache.deletePlaylist(parseInt(playlistId));
        return Response.json({ success: true });
      } else {
        return Response.json({ error: "Playlist ID or media URL is required" }, { status: 400 });
      }
    }

    return Response.json({ error: "Method not allowed" }, { status: 405 });
  } catch (error) {
    console.error("Playlist API error:", error);
    const errorMsg = error instanceof Error ? error.message : String(error);
    return Response.json({ error: errorMsg }, { status: 500 });
  }
}
