import {
  createCookie,
  createCookieSessionStorage,
  type Cookie,
} from "react-router";
import { readFile } from "fs/promises";
import { CookieJar, type Cookies } from "netscape-cookies-parser";
type SessionData = {
  userId: string;
};

type SessionFlashData = {
  error: string;
};

let parsedCookies: Cookies[] = [];
let browserCookies: any[] = [];

try {
  const cookieFile = await readFile("./coomer.st_cookies.txt", "utf-8");
  const jar = new CookieJar(cookieFile);
  parsedCookies = jar.parse() as Cookies[];
  console.log(`Loaded ${parsedCookies.length} cookies from file`);

  // Create cookies for setting in browser (with localhost domain)
  browserCookies = parsedCookies.map((c) =>
    createCookie(c.name, {
      ...c,
      expires: new Date(c.expires * 1000),
      domain: "localhost",
      path: c.path,
      secure: false, // Disable secure for localhost
    }),
  );
} catch (error) {
  console.error("Failed to load cookies file:", error);
  // Continue with empty cookies - the app should still work without them
  parsedCookies = [];
  browserCookies = [];
}

const sessionCookie = parsedCookies.find((c) => c.name.includes("session"));

const { getSession, commitSession, destroySession } =
  createCookieSessionStorage<SessionData, SessionFlashData>({
    cookie: sessionCookie
      ? createCookie(sessionCookie.name, {
          path: sessionCookie.path,
          expires: new Date(sessionCookie.expires * 1000),
          secure: sessionCookie.secure,
          httpOnly: true,
          sameSite: "lax",
        })
      : createCookie("fallback-session", {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: "lax",
          maxAge: 60 * 60 * 24 * 30, // 30 days
        }),
  });
export {
  getSession,
  commitSession,
  destroySession,
  browserCookies,
  parsedCookies,
};
