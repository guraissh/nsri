import { KemonoClient, type Post, type KemonoService } from "@akomalabs/kemono";
import { parsedCookies } from "./sessions.server";
import { isObjEmpty } from "./utils";
import { promises as fs } from "fs";
import path from "path";
import { getVideoDurationInSeconds } from "get-video-duration";
import { getFileCache, type FileRecord } from "./fileCache.server";
import * as cheerio from "cheerio";
import RedgifsClient, { type RedgifsGifsResponse } from "~/redgifs.client";
import BunkrClient from "~/bunkr.client";

// Helper function to create cookie string from parsed cookies for session
const getCookieString = () => {
	return parsedCookies
		.map((cookie) => `${cookie.name}=${cookie.value}`)
		.join("; ");
};

// Helper function to extract session key from cookies
const getSessionKey = (baseUrl: string): string | undefined => {
	const sessionCookie = parsedCookies.find(
		(cookie) => new URL(baseUrl).hostname.includes(cookie.domain) && (cookie.name === "session" || cookie.name === "kemono_session"),

	);
	return sessionCookie?.value;
};

// Create kemono client instance
const createKemonoClient = (baseUrl: string) => {
	const sessionKey = getSessionKey(baseUrl);
	console.log('sessionKey', sessionKey)

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

			level: "debug",
		},
	});
};

// Get media from Bunkr album
export const getBunkrMedia = async (
	albumUrl: string,
): Promise<string[]> => {
	try {
		console.log(`Fetching Bunkr album from backend: ${albumUrl}`);

		const data = await BunkrClient.getAlbum(albumUrl);
		console.log(`Retrieved ${data.total_items} items from Bunkr album`);

		// Proxy the CDN URLs through our backend to add CORS headers
		const mediaUrls = data.media.map((item) => {
			const proxiedUrl = `/proxy/bunkr-media?url=${encodeURIComponent(item.url)}`;
			return proxiedUrl;
		});

		return mediaUrls;
	} catch (error) {
		console.error("Error fetching Bunkr album:", error);
		const errorMsg = error instanceof Error ? error.message : String(error);
		throw new Error(`Failed to fetch Bunkr album: ${errorMsg}`);
	}
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
		const baseUrl = new URL(
			base_api_path.trim(),
			base_domain.trim(),
		).toString();
		console.log({ baseUrl })
		const client = createKemonoClient(baseUrl);

		// Use the kemono client to get posts by creator
		const posts = await client.posts.getByCreator(
			service_name as KemonoService,
			userId,
		);

		// Apply pagination limits
		const startIndex = from * 50;
		const endIndex =
			to === -1 ? posts.length : Math.min(posts.length, (to + 1) * 50);
		const limitedPosts =
			limit === -1
				? posts.slice(startIndex, endIndex)
				: posts.slice(startIndex, startIndex + limit);

		console.log(
			`Retrieved ${limitedPosts.length} posts for user ${userId} from service ${service_name}`,
		);

		// Extract media URLs from posts
		for (const post of limitedPosts) {
			console.log(JSON.stringify(post))
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
						const attachmentUrl = makeFileLink(
							base_domain,
							attachment.path,
						).toString();
						const proxiedUrl = `/proxy/media?url=${encodeURIComponent(attachmentUrl)}`;
						mediaUrls.push(proxiedUrl);
					}
				}
			}
		}
	} catch (error) {
		console.error("Error collecting user media with kemono client:", error);

		// Fallback to original implementation if kemono client fails
		console.log("Falling back to original fetch implementation...");
		return await getAllUserMediaFallback(
			base_domain,
			base_api_path,
			service_name,
			userId,
			from,
			to,
			limit,
		);
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
			limit,
		)) {
			if (!post.page) continue;

			// Add file URL if exists
			if (!isObjEmpty(post.page.file)) {
				const fileUrl = makeFileLink(
					base_domain,
					post.page.file.path,
				).toString();
				const proxiedUrl = `/proxy/media?url=${encodeURIComponent(fileUrl)}`;
				mediaUrls.push(proxiedUrl);
			}

			// Add attachment URLs
			for (const attachment of post.page.attachments || []) {
				const attachmentUrl = makeFileLink(
					base_domain,
					attachment.path,
				).toString();
				const proxiedUrl = `/proxy/media?url=${encodeURIComponent(attachmentUrl)}`;
				mediaUrls.push(proxiedUrl);
			}
		}
	} catch (error) {
		console.error("Error collecting user media:", error);
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
	console.log(`GET: ${reqUrl.toString()}`);

	const cookieString = getCookieString();

	const res = await fetch(reqUrl, {
		headers: {
			Cookie: cookieString,
			Accept: "text/css",
		},
		redirect: "follow",
	});
	console.log(`path: ${path} status: ${res.status} ${res.statusText}`);
	return res;
};

const iterateUserPosts = async function*(
	base_domain: string,
	base_api_path: string,
	service_name: string,
	userId: string,
	from: number = 0,
	to: number = 0,
	limit: number = -1,
): AsyncGenerator<{ pageIndex: number; page: any }> {
	for (let i = from; to == -1 ? true : i <= to; i++) {
		if (limit == 0) break;

		const posts_res = await getUserPosts(
			base_domain,
			base_api_path,
			service_name,
			userId,
			50 * i,
		);

		if (posts_res.status === 400) {
			console.log(
				`Reached end of available pages at page ${i} (offset ${50 * i})`,
			);
			break;
		}

		if (posts_res.status === 404) {
			console.log(`404 not found at page ${i} (offset ${50 * i})`);
			if (i === from) {
				throw new Error(
					`404 not found on first request: ${posts_res.statusText}`,
				);
			}
			break;
		}

		if (!posts_res.ok) {
			console.log(
				`HTTP error ${posts_res.status} ${posts_res.statusText} at page ${i} (offset ${50 * i})`,
			);
			if (i === from) {
				throw new Error(
					`HTTP error on first request: ${posts_res.status} ${posts_res.statusText}`,
				);
			}
			break;
		}

		const body = await posts_res.text();
		try {
			const posts = JSON.parse(body);

			if (posts.length == 0) {
				console.log(`No more posts found at page ${i} (offset ${50 * i})`);
				break;
			}

			if (!isIterable(posts)) {
				console.log("Response is not iterable:", { posts });
				break;
			}

			for (const post of posts) {
				if (limit == 0) break;
				yield { pageIndex: i, page: post };
				if (limit != -1) --limit;
			}
		} catch (e) {
			console.log({ status: posts_res.statusText });
			console.log("Failed to parse JSON response:", { body });
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
	return typeof obj[Symbol.iterator] === "function";
}

// Get media from local directory with SQLite cache and deduplication
export const getMediaFromDirectory = async (
	directoryPath: string,
	limit: number = -1,
	sortBy: string = "none",
	removeDuplicates: boolean = true,
): Promise<string[]> => {
	const supportedExtensions = [
		".mp4",
		".webm",
		".mov",
		".avi",
		".mkv",
		".jpg",
		".jpeg",
		".png",
		".gif",
		".webp",
	];

	try {
		// Normalize the path to handle both forward and backward slashes
		const normalizedPath = path.resolve(directoryPath);
		console.log(`Scanning directory: ${normalizedPath}`);

		const cache = getFileCache();
		const files = await fs.readdir(normalizedPath);

		// Process all files - use cache for instant lookup, queue uncached for background
		const fileRecords: FileRecord[] = [];
		const filesToProcess: string[] = [];

		for (const file of files) {
			const ext = path.extname(file).toLowerCase();
			if (supportedExtensions.includes(ext)) {
				const filePath = path.join(normalizedPath, file);

				try {
					const stats = await fs.stat(filePath);
					if (stats.isFile()) {
						// Check cache first (instant, no processing)
						const cached = cache.getCachedRecord(filePath);
						if (cached) {
							fileRecords.push(cached);
						} else {
							// Not in cache - create a minimal record for now
							fileRecords.push({
								path: filePath,
								hash: "",
								size: stats.size,
								mtime: Math.floor(stats.mtimeMs),
								duration: null,
								directory: normalizedPath,
								filename: file,
								thumbnail_path: null,
							});
							filesToProcess.push(filePath);
						}
					}
				} catch (err) {
					console.warn(`Error processing file ${file}:`, err);
				}
			}
		}

		console.log(`Found ${fileRecords.length} files (${filesToProcess.length} uncached)`);

		// Process uncached files in background (don't await)
		if (filesToProcess.length > 0) {
			(async () => {
				for (const filePath of filesToProcess) {
					try {
						await cache.getOrCreateFileRecord(filePath);
					} catch (err) {
						console.warn(`Background processing error for ${filePath}:`, err);
					}
				}
				console.log(`Background processed ${filesToProcess.length} files`);
			})();
		}

		// Remove duplicates if requested (only works for cached files with hashes)
		let processedRecords = removeDuplicates
			? cache.deduplicateFiles(fileRecords)
			: fileRecords;

		if (removeDuplicates && processedRecords.length < fileRecords.length) {
			console.log(`Removed ${fileRecords.length - processedRecords.length} duplicate files`);
		}

		// Sort files based on sortBy parameter
		if (sortBy === "duration-desc") {
			processedRecords.sort((a, b) => (b.duration || 0) - (a.duration || 0));
			console.log("Sorted by duration (longest first)");
		} else if (sortBy === "duration-asc") {
			processedRecords.sort((a, b) => (a.duration || 0) - (b.duration || 0));
			console.log("Sorted by duration (shortest first)");
		} else {
			// Sort alphabetically by filename
			processedRecords.sort((a, b) => a.filename.localeCompare(b.filename));
		}

		// Apply limit and convert to URLs
		const limitedFiles =
			limit === -1 ? processedRecords : processedRecords.slice(0, limit);
		const mediaUrls = limitedFiles.map((file) => {
			const encodedPath = encodeURIComponent(file.path);
			return `/proxy/local-media?path=${encodedPath}`;
		});

		console.log(
			`Returning ${mediaUrls.length} media files from directory: ${normalizedPath}`,
		);

		return mediaUrls;
	} catch (error) {
		console.error("Error reading directory:", error);
		const errorMsg = error instanceof Error ? error.message : String(error);
		throw new Error(`Failed to read directory "${directoryPath}": ${errorMsg}`);
	}
};

// Get media from RedGifs API via the local backend
export const getRedgifsMedia = async (
	username?: string,
	tags?: string,
	order: string = "latest",
	page: number = 1,
	count: number = 80,
	limit: number = -1,
): Promise<string[]> => {
	const mediaUrls: string[] = [];

	try {
		// Normalize order parameter - backend expects "duration-desc" not "duration_desc"
		const normalizedOrder = order.replace(/_/g, "-");

		let data: RedgifsGifsResponse;

		if (username) {
			// Fetch user's gifs
			console.log(`Fetching RedGifs for user: ${username}, order: ${normalizedOrder}, page: ${page}, count: ${count}`);
			data = await RedgifsClient.getUserGifs(username, normalizedOrder, page, count);
		} else if (tags) {
			// Search by tags only
			console.log(`Searching RedGifs by tags: ${tags}`);
			data = await RedgifsClient.searchGifs(tags, normalizedOrder, page, count);
		} else {
			throw new Error("Either username or tags must be provided for RedGifs");
		}

		if (data.gifs && Array.isArray(data.gifs)) {
			let gifs = data.gifs;

			// Filter by tags if provided (only when fetching by username)
			if (username && tags) {
				const tagList = tags.split(",").map(t => t.trim().toLowerCase()).filter(t => t.length > 0);
				if (tagList.length > 0) {
					console.log(`Filtering by tags: ${tagList.join(", ")}`);
					gifs = gifs.filter(gif =>
						gif.tags && gif.tags.some(tag =>
							tagList.some(searchTag => tag.toLowerCase().includes(searchTag))
						)
					);
					console.log(`After tag filtering: ${gifs.length} gifs`);
				}
			}

			// Note: limit parameter is ignored for RedGifs - use count parameter instead
			// RedGifs backend handles pagination and multi-page fetching

			// Extract video URLs (prefer HD, fallback to SD)
			for (const gif of gifs) {
				const videoUrl = gif.urls.hd || gif.urls.sd;
				if (videoUrl) {
					// Proxy through our backend to avoid CORS issues
					const proxiedUrl = `/proxy/media?url=${encodeURIComponent(videoUrl)}`;
					mediaUrls.push(proxiedUrl);
				}
			}

			console.log(`Returning ${mediaUrls.length} RedGifs videos`);
		}

		return mediaUrls;
	} catch (error) {
		console.error("Error fetching RedGifs media:", error);
		const errorMsg = error instanceof Error ? error.message : String(error);
		throw new Error(`Failed to fetch RedGifs media: ${errorMsg}`);
	}
};
