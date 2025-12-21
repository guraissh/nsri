/**
 * RedGifs Backend Client
 * Handles all communication with the RedGifs backend service
 */

const getBaseUrl = () => {
	return process.env['REDGIFS_API_URL'] || "http://localhost:8000";
};

export interface CacheStats {
	total_files: number;
	verified_files: number;
	unverified_files: number;
	total_bytes: number;
	total_mb: number;
	max_cache_mb: number;
	max_file_mb: number;
}

export interface ClearCacheResult {
	status: string;
	files_deleted: number;
	bytes_freed: number;
	mb_freed: number;
}

export interface UserTagsResponse {
	tags: string[];
	video_tags: Record<string, string[]>;
	tag_counts: Record<string, number>;
}

export interface RedgifsGif {
	id: string;
	urls: {
		hd?: string;
		sd?: string;
	};
	tags?: string[];
	duration?: number;
	width?: number;
	height?: number;
}

export interface RedgifsGifsResponse {
	gifs: RedgifsGif[];
	total?: number;
	page?: number;
}

/**
 * Get tags for a specific RedGifs user
 */
export async function rg_getUserTags(username: string): Promise<UserTagsResponse> {
	const baseUrl = getBaseUrl();
	const response = await fetch(`${baseUrl}/api/user/${username}/tags`);

	if (!response.ok) {
		throw new Error(`RedGifs API error: ${response.status}`);
	}

	return await response.json();
}

/**
 * Verify a cached video
 */
export async function rg_verifyCache(url: string): Promise<Response> {
	const baseUrl = getBaseUrl();
	return await fetch(`${baseUrl}/verify-cache?url=${url}`, {
		method: 'POST'
	});
}

/**
 * Invalidate (purge) a cached video
 */
export async function rg_invalidateCache(url: string): Promise<Response> {
	const baseUrl = getBaseUrl();
	return await fetch(`${baseUrl}/invalidate-cache?url=${url}`, {
		method: 'POST'
	});
}

/**
 * Get cache statistics
 */
export async function rg_getCacheStats(): Promise<CacheStats | null> {
	const baseUrl = getBaseUrl();
	try {
		const response = await fetch(`${baseUrl}/cache-stats`);
		if (!response.ok) {
			return null;
		}
		return await response.json();
	} catch (error) {
		console.error("Error fetching RedGifs cache stats:", error);
		return null;
	}
}

/**
 * Clear all cached videos
 */
export async function rg_clearAllCache(): Promise<ClearCacheResult> {
	const baseUrl = getBaseUrl();
	const response = await fetch(`${baseUrl}/clear-all-cache`, {
		method: 'POST'
	});

	if (!response.ok) {
		throw new Error(`Clear cache error: ${response.status}`);
	}

	return await response.json();
}

/**
 * Get gifs for a specific user
 */
export async function rg_getUserGifs(
	username: string,
	order: string = "latest",
	page: number = 1,
	count: number = 80
): Promise<RedgifsGifsResponse> {
	const baseUrl = getBaseUrl();
	const url = new URL(`${baseUrl}/api/user/${username}/gifs`);
	url.searchParams.set("page", page.toString());
	url.searchParams.set("count", count.toString());
	url.searchParams.set("order", order);

	const response = await fetch(url.toString());

	if (!response.ok) {
		throw new Error(`RedGifs API error: ${response.status} ${response.statusText}`);
	}

	return await response.json();
}

/**
 * Search gifs by tags
 */
export async function rg_searchGifs(
	tags: string,
	order: string = "latest",
	page: number = 1,
	count: number = 80
): Promise<RedgifsGifsResponse> {
	const baseUrl = getBaseUrl();
	const url = new URL(`${baseUrl}/api/search`);
	url.searchParams.set("q", tags);
	url.searchParams.set("page", page.toString());
	url.searchParams.set("count", count.toString());
	url.searchParams.set("order", order);

	const response = await fetch(url.toString());

	if (!response.ok) {
		throw new Error(`RedGifs API error: ${response.status} ${response.statusText}`);
	}

	return await response.json();
}


