/**
 * Bunkr Backend Client
 * Handles all communication with the Bunkr backend service
 */

const getBaseUrl = () => {
  return process.env.BUNKR_API_URL || "http://localhost:8001";
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

export interface BunkrAlbumResponse {
  total_items: number;
  media: Array<{
    url: string;
    type: string;
    name?: string;
  }>;
}

/**
 * Get cache statistics
 */
export async function getCacheStats(): Promise<CacheStats | null> {
  const baseUrl = getBaseUrl();
  try {
    const response = await fetch(`${baseUrl}/cache-stats`);
    if (!response.ok) {
      return null;
    }
    return await response.json();
  } catch (error) {
    console.error("Error fetching Bunkr cache stats:", error);
    return null;
  }
}

/**
 * Clear all cached videos
 */
export async function clearAllCache(): Promise<ClearCacheResult> {
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
 * Get album media from Bunkr
 */
export async function getAlbum(albumUrl: string): Promise<BunkrAlbumResponse> {
  const baseUrl = getBaseUrl();
  const response = await fetch(
    `${baseUrl}/api/album?url=${encodeURIComponent(albumUrl)}`
  );

  if (!response.ok) {
    throw new Error(`Bunkr backend error: ${response.status} ${response.statusText}`);
  }

  return await response.json();
}
