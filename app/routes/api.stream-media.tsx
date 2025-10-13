import type { Route } from "./+types/api.stream-media";
import { getAllUserMedia, getMediaFromDirectory } from "~/api.server";
import { getSession, commitSession, parsedCookies } from "~/sessions.server";

export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") {
    throw new Response("Method not allowed", { status: 405 });
  }

  const params = await request.json();
  const { sourceType, directoryPath, sortBy, baseDomain, baseApiPath, serviceName, userId, from, to, limit } = params;

  console.log('Fetching media with params:', params);

  try {
    let mediaUrls: string[];
    const headers = new Headers({
      "Content-Type": "application/json",
    });

    if (sourceType === "local") {
      // Fetch media from local directory
      console.log(`Fetching media from local directory: ${directoryPath}`);
      mediaUrls = await getMediaFromDirectory(directoryPath, limit, sortBy);
    } else {
      console.log(`Fetching media from api: ${baseDomain}, userId: ${userId}`);

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
        limit
      );

      // Set the session cookie
      headers.append("Set-Cookie", await commitSession(session));

      // Set additional cookies from the parsed cookie file (with localhost domain)
      for (const cookie of parsedCookies) {
        const cookieString = `${cookie.name}=${cookie.value}; Domain=localhost; Path=${cookie.path}; ${cookie.expires ? `Expires=${new Date(cookie.expires * 1000).toUTCString()};` : ''}`;
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

