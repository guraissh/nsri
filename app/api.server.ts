import { KemonoClient, type Post, type KemonoService } from '@akomalabs/kemono';
import { parsedCookies } from "./sessions.server";
import { isObjEmpty } from "./utils";
import { promises as fs } from 'fs';
import path from 'path';
import { getVideoDurationInSeconds } from 'get-video-duration';

// Helper function to create cookie string from parsed cookies for session
const getCookieString = () => {
  return parsedCookies.map(cookie => `${cookie.name}=${cookie.value}`).join('; ');
};

// Helper function to extract session key from cookies
const getSessionKey = (): string | undefined => {
  const sessionCookie = parsedCookies.find(cookie =>
    cookie.name === 'session' || cookie.name === 'kemono_session'
  );
  return sessionCookie?.value;
};

// Create kemono client instance
const createKemonoClient = (baseUrl: string) => {
  const sessionKey = getSessionKey();

  return new KemonoClient({
    baseUrl: baseUrl as any,
    sessionKey,
    cache: {
      enabled: true,
      ttl: 300, // 5 minutes
    },
    rateLimit: {
      maxRequests: 50,
      windowMs: 60000, // 1 minute
    },
    logging: {
      enabled: true,
      level: 'info',
    },
  });
};

export const getAllUserMedia = async (
  base_domain: string,
  base_api_path: string,
  service_name: string,
  userId: string,
  from: number = 0,
  to: number = 0,
  limit: number = -1,
): Promise<string[]> => {
  const mediaUrls: string[] = [];

  try {
    // Construct the base URL for the kemono client
    const baseUrl = new URL(base_api_path.trim(), base_domain.trim()).toString();
    const client = createKemonoClient(baseUrl);

    // Use the kemono client to get posts by creator
    const posts = await client.posts.getByCreator(
      service_name as KemonoService,
      userId
    );

    // Apply pagination limits
    const startIndex = from * 50;
    const endIndex = to === -1 ? posts.length : Math.min(posts.length, (to + 1) * 50);
    const limitedPosts = limit === -1 ? posts.slice(startIndex, endIndex) : posts.slice(startIndex, startIndex + limit);

    console.log(`Retrieved ${limitedPosts.length} posts for user ${userId} from service ${service_name}`);

    // Extract media URLs from posts
    for (const post of limitedPosts) {
      // Add file URL if exists
      if (post.file && !isObjEmpty(post.file)) {
        const fileUrl = makeFileLink(base_domain, post.file.path).toString();
        const proxiedUrl = `/proxy/media?url=${encodeURIComponent(fileUrl)}`;
        mediaUrls.push(proxiedUrl);
      }

      // Add attachment URLs
      if (post.attachments && Array.isArray(post.attachments)) {
        for (const attachment of post.attachments) {
          if (attachment.path) {
            const attachmentUrl = makeFileLink(base_domain, attachment.path).toString();
            const proxiedUrl = `/proxy/media?url=${encodeURIComponent(attachmentUrl)}`;
            mediaUrls.push(proxiedUrl);
          }
        }
      }
    }
  } catch (error) {
    console.error('Error collecting user media with kemono client:', error);

    // Fallback to original implementation if kemono client fails
    console.log('Falling back to original fetch implementation...');
    return await getAllUserMediaFallback(base_domain, base_api_path, service_name, userId, from, to, limit);
  }

  return mediaUrls;
};

// Fallback implementation using original fetch logic
const getAllUserMediaFallback = async (
  base_domain: string,
  base_api_path: string,
  service_name: string,
  userId: string,
  from: number = 0,
  to: number = 0,
  limit: number = -1,
): Promise<string[]> => {
  const mediaUrls: string[] = [];

  try {
    for await (const post of iterateUserPosts(
      base_domain,
      base_api_path,
      service_name,
      userId,
      from,
      to,
      limit
    )) {
      if (!post.page) continue;

      // Add file URL if exists
      if (!isObjEmpty(post.page.file)) {
        const fileUrl = makeFileLink(base_domain, post.page.file.path).toString();
        const proxiedUrl = `/proxy/media?url=${encodeURIComponent(fileUrl)}`;
        mediaUrls.push(proxiedUrl);
      }

      // Add attachment URLs
      for (const attachment of post.page.attachments || []) {
        const attachmentUrl = makeFileLink(base_domain, attachment.path).toString();
        const proxiedUrl = `/proxy/media?url=${encodeURIComponent(attachmentUrl)}`;
        mediaUrls.push(proxiedUrl);
      }
    }
  } catch (error) {
    console.error('Error collecting user media:', error);
  }

  return mediaUrls;
};

// Keep original functions for fallback
const getUserPosts = async (
  base_domain: string,
  base_api_path: string,
  serviceId: string,
  userId: string,
  offset: number = 0,
) => {
  const reqUrl = new URL(base_api_path.trim(), base_domain.trim());

  if (reqUrl.pathname.charAt(reqUrl.pathname.length - 1) != "/") {
    reqUrl.pathname += "/";
  }
  const path = `${serviceId.trim()}/user/${userId.trim()}/posts`;
  reqUrl.pathname += path;
  reqUrl.searchParams.append("o", offset.toString());
  console.log(`GET: ${reqUrl.toString()}`)

  const cookieString = getCookieString();

  const res = await fetch(reqUrl, {
    headers: {
      'Cookie': cookieString,
      'Accept': 'text/css'
    },
    redirect: 'follow'
  });
  console.log(`path: ${path} status: ${res.status} ${res.statusText}`)
  return res
};

const iterateUserPosts = async function* (
  base_domain: string,
  base_api_path: string,
  service_name: string,
  userId: string,
  from: number = 0,
  to: number = 0,
  limit: number = -1,
): AsyncGenerator<{ pageIndex: number; page: any }> {
  for (let i = from; (to == -1 ? true : i <= to); i++) {
    if (limit == 0) break;

    const posts_res = await getUserPosts(
      base_domain,
      base_api_path,
      service_name,
      userId,
      50 * i,
    );

    if (posts_res.status === 400) {
      console.log(`Reached end of available pages at page ${i} (offset ${50 * i})`);
      break;
    }

    if (posts_res.status === 404) {
      console.log(`404 not found at page ${i} (offset ${50 * i})`);
      if (i === from) {
        throw new Error(`404 not found on first request: ${posts_res.statusText}`);
      }
      break;
    }

    if (!posts_res.ok) {
      console.log(`HTTP error ${posts_res.status} ${posts_res.statusText} at page ${i} (offset ${50 * i})`);
      if (i === from) {
        throw new Error(`HTTP error on first request: ${posts_res.status} ${posts_res.statusText}`);
      }
      break;
    }

    const body = await posts_res.text();
    try {
      const posts = JSON.parse(body)

      if (posts.length == 0) {
        console.log(`No more posts found at page ${i} (offset ${50 * i})`);
        break;
      }

      if (!isIterable(posts)) {
        console.log('Response is not iterable:', { posts })
        break;
      }

      for (const post of posts) {
        if (limit == 0) break;
        yield { pageIndex: i, page: post };
        if (limit != -1) --limit;
      }
    } catch (e) {
      console.log({ status: posts_res.statusText })
      console.log('Failed to parse JSON response:', { body })
      break;
    }
  }
};

export const makeFileLink = (base_domain: string, path: string) => {
  if (path.slice(0, 5) != "/data") path = "/data" + path;
  const reqUrl = new URL(path, base_domain);
  return reqUrl;
};

function isIterable(obj: any): boolean {
  if (obj == null) {
    return false;
  }
  return typeof obj[Symbol.iterator] === 'function';
}

// Get media from local directory
export const getMediaFromDirectory = async (
  directoryPath: string,
  limit: number = -1,
  sortBy: string = 'none'
): Promise<string[]> => {
  const supportedExtensions = ['.mp4', '.webm', '.mov', '.avi', '.mkv', '.jpg', '.jpeg', '.png', '.gif', '.webp'];
  const videoExtensions = ['.mp4', '.webm', '.mov', '.avi', '.mkv'];

  try {
    // Normalize the path to handle both forward and backward slashes
    const normalizedPath = path.resolve(directoryPath);
    console.log(`Normalized directory path: ${normalizedPath}`);

    const files = await fs.readdir(normalizedPath);

    // Collect files with metadata
    interface FileWithMetadata {
      filePath: string;
      fileName: string;
      duration?: number;
    }

    const filesWithMetadata: FileWithMetadata[] = [];

    for (const file of files) {
      const ext = path.extname(file).toLowerCase();
      if (supportedExtensions.includes(ext)) {
        const filePath = path.join(normalizedPath, file);
        const stats = await fs.stat(filePath);

        if (stats.isFile()) {
          const fileData: FileWithMetadata = {
            filePath,
            fileName: file,
          };

          // Get duration for video files if we need to sort by duration
          if (sortBy.startsWith('duration') && videoExtensions.includes(ext)) {
            try {
              const duration = await getVideoDurationInSeconds(filePath);
              fileData.duration = duration;
              console.log(`${file}: ${duration.toFixed(2)}s`);
            } catch (err) {
              console.warn(`Could not get duration for ${file}:`, err);
              fileData.duration = 0; // Default to 0 if duration can't be determined
            }
          }

          filesWithMetadata.push(fileData);
        }
      }
    }

    // Sort files based on sortBy parameter
    if (sortBy === 'duration-desc') {
      filesWithMetadata.sort((a, b) => (b.duration || 0) - (a.duration || 0));
      console.log('Sorted by duration (longest first)');
    } else if (sortBy === 'duration-asc') {
      filesWithMetadata.sort((a, b) => (a.duration || 0) - (b.duration || 0));
      console.log('Sorted by duration (shortest first)');
    }
    // If sortBy is 'none', keep original order (alphabetical from readdir)

    // Apply limit and convert to URLs
    const limitedFiles = limit === -1 ? filesWithMetadata : filesWithMetadata.slice(0, limit);
    const mediaUrls = limitedFiles.map(file => {
      const encodedPath = encodeURIComponent(file.filePath);
      return `/proxy/local-media?path=${encodedPath}`;
    });

    console.log(`Found ${mediaUrls.length} media files in directory: ${normalizedPath}`);

    return mediaUrls;
  } catch (error) {
    console.error('Error reading directory:', error);
    const errorMsg = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to read directory "${directoryPath}": ${errorMsg}`);
  }
};

