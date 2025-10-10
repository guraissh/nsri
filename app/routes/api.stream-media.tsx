import type { Route } from "./+types/api.stream-media";
import { getAllUserMedia } from "~/api.server";
import { getSession, commitSession, parsedCookies } from "~/sessions.server";

export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") {
    throw new Response("Method not allowed", { status: 405 });
  }

  const params = await request.json();
  const { baseDomain, baseApiPath, serviceName, userId, from, to, limit } = params;

  console.log('Fetching all media with params:', { baseDomain, baseApiPath, serviceName, userId, from, to, limit });

  try {
    // Get session and set up cookies
    const session = await getSession(request.headers.get("Cookie"));
    session.set("userId", userId);

    // Fetch all media URLs at once
    const mediaUrls = await getAllUserMedia(
      baseDomain,
      baseApiPath,
      serviceName,
      userId,
      from,
      to,
      limit
    );

    console.log(`Found ${mediaUrls.length} media URLs`);

    // Create headers with cookies
    const headers = new Headers({
      "Content-Type": "application/json",
    });

    // Set the session cookie
    headers.append("Set-Cookie", await commitSession(session));

    // Set additional cookies from the parsed cookie file (with localhost domain)
    for (const cookie of parsedCookies) {
      const cookieString = `${cookie.name}=${cookie.value}; Domain=localhost; Path=${cookie.path}; ${cookie.expires ? `Expires=${new Date(cookie.expires * 1000).toUTCString()};` : ''}`;
      headers.append("Set-Cookie", cookieString);
    }

    return Response.json({ mediaUrls }, { headers });
  } catch (error) {
    console.error("Error fetching media:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return Response.json({ error: errorMessage }, { status: 500 });
  }
}
