import type { Route } from "./+types/api.stream-media";
import { getAllUserMedia, getMediaFromDirectory, getRedgifsMedia, getBunkrMedia } from "~/api.server";
import { getSession, commitSession, parsedCookies } from "~/sessions.server";
import { getFileCache } from "~/fileCache.server";

export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") {
    throw new Response("Method not allowed", { status: 405 });
  }

  const params = await request.json();
  const {
    sourceType,
    directoryPath,
    sortBy,
    baseDomain,
    baseApiPath,
    serviceName,
    userId,
    from,
    to,
    limit,
    // RedGifs params
    rgUsername,
    rgTags,
    rgOrder,
    rgPage,
    rgCount,
    // Playlist params
    playlistId,
    // Bunkr params
    bunkrAlbumUrl,
  } = params;

  console.log("Fetching media with params:", params);

  try {
    let mediaUrls: string[];
    const headers = new Headers({
      "Content-Type": "application/json",
    });

    if (sourceType === "playlist") {
      // Fetch media from playlist
      console.log(`Fetching media from playlist: ${playlistId}`);
      const cache = getFileCache();
      const items = cache.getPlaylistItems(parseInt(playlistId));
      mediaUrls = items.map(item => item.media_url);
    } else if (sourceType === "local") {
      // Fetch media from local directory
      console.log(`Fetching media from local directory: ${directoryPath}`);
      mediaUrls = await getMediaFromDirectory(directoryPath, limit, sortBy);
    } else if (sourceType === "redgifs") {
      // Fetch media from RedGifs
      console.log(`Fetching media from RedGifs: username=${rgUsername}, tags=${rgTags}, order=${rgOrder}`);
      mediaUrls = await getRedgifsMedia(
        rgUsername || undefined,
        rgTags || undefined,
        rgOrder || "latest",
        parseInt(rgPage || "1"),
        parseInt(rgCount || "80"),
        parseInt(limit || "-1"),
      );
    } else if (sourceType === "bunkr") {
      // Fetch media from Bunkr
      console.log(`Fetching media from Bunkr: ${bunkrAlbumUrl}`);
      mediaUrls = await getBunkrMedia(bunkrAlbumUrl);
    } else {
      console.log(`Fetching media from api: ${baseDomain} ${baseApiPath} ${serviceName}, userId: ${userId}`);

      // Get session and set up cookies for API source
      const session = await getSession(request.headers.get("Cookie"));
      session.set("userId", userId);

      // Fetch all media URLs from API
      mediaUrls = await getAllUserMedia(
        baseDomain,
        baseApiPath,
        serviceName,
        userId,
        from,
        to,
        limit,
      );

      // Set the session cookie
      headers.append("Set-Cookie", await commitSession(session));

      // Set additional cookies from the parsed cookie file (with localhost domain)
      for (const cookie of parsedCookies) {
        const cookieString = `${cookie.name}=${cookie.value}; Domain=localhost; Path=${cookie.path}; ${cookie.expires ? `Expires=${new Date(cookie.expires * 1000).toUTCString()};` : ""}`;
        headers.append("Set-Cookie", cookieString);
      }
    }

    console.log(`Found ${mediaUrls.length} media URLs`);

    return Response.json({ mediaUrls }, { headers });
  } catch (error) {
    console.error("Error fetching media:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return Response.json({ error: errorMessage }, { status: 500 });
  }
}
