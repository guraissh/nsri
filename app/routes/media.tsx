import { useState, useEffect, useRef, useCallback } from "react";
import { useLoaderData, useNavigate } from "react-router";
import "@vidstack/react/player/styles/default/theme.css";
import "@vidstack/react/player/styles/default/layouts/video.css";
import type { Route } from "./+types/media";
import { ArrowUpDown, Download, Folder, Volume2, VolumeX, Maximize, Minimize, Plus, List } from "lucide-react";
import { VerticalFeed, type VideoItem } from "~/VerticalFeed";
import { FolderBrowser } from "~/FolderBrowser";
import { PlaylistViewer } from "~/PlaylistViewer";
import type { PlaylistItem } from "~/fileCache.server";

interface MediaItem {
	url: string;
	type: "video" | "image";
	id: string;
	hasError?: boolean;
}

export async function loader({ request }: Route.LoaderArgs) {
	const url = new URL(request.url);
	const params = {
		baseDomain: url.searchParams.get("baseDomain") || "",
		baseApiPath: url.searchParams.get("baseApiPath") || "",
		serviceName: url.searchParams.get("serviceName") || "",
		userId: url.searchParams.get("userId") || "",
		from: parseInt(url.searchParams.get("from") || "0"),
		to: parseInt(url.searchParams.get("to") || "0"),
		limit: parseInt(url.searchParams.get("limit") || "-1"),
		lookahead: url.searchParams.get("lookahead") || "",
		directoryPath: url.searchParams.get("directoryPath") || "",
		sourceType: url.searchParams.get("sourceType") || "api",
		sortBy: url.searchParams.get("sortBy") || "none",
		// RedGifs params
		rgUsername: url.searchParams.get("rgUsername") || "",
		rgTags: url.searchParams.get("rgTags") || "",
		rgOrder: url.searchParams.get("rgOrder") || "latest",
		rgPage: url.searchParams.get("rgPage") || "1",
		rgCount: url.searchParams.get("rgCount") || "80",
		// Playlist params
		playlistId: url.searchParams.get("playlistId") || "",
		// Bunkr params
		bunkrAlbumUrl: url.searchParams.get("bunkrAlbumUrl") || "",
	};

	return params;
}

const getMediaType = (url: string): "video" | "image" => {
	const videoExtensions = [
		".mp4",
		".webm",
		".mov",
		".avi",
		".mkv",
		".m4v",
		".3gp",
		".flv",
		".ogv",
	];
	const imageExtensions = [
		".jpg",
		".jpeg",
		".png",
		".gif",
		".webp",
		".bmp",
		".svg",
		".tiff",
	];

	const lowerUrl = url.toLowerCase();

	if (videoExtensions.some((ext) => lowerUrl.includes(ext))) {
		return "video";
	}
	if (imageExtensions.some((ext) => lowerUrl.includes(ext))) {
		return "image";
	}

	// Try to determine from URL structure
	if (
		lowerUrl.includes("video") ||
		lowerUrl.includes(".m3u8") ||
		lowerUrl.includes("stream")
	) {
		return "video";
	}

	// Default to image for unknown types (safer fallback)
	return "image";
};

export default function Media() {
	const params = useLoaderData<typeof loader>();
	const [allMediaItems, setAllMediaItems] = useState<MediaItem[]>([]);

	const [isLoading, setIsLoading] = useState(true);
	const containerRef = useRef<HTMLDivElement>(null);
	const [currentIndex, setCurrentIndex] = useState(0);

	const [videos, setVideos] = useState<VideoItem[]>([]);
	const navigate = useNavigate();
	const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);
	const pendingIndexRef = useRef<number | null>(null);
	const [showFolderBrowser, setShowFolderBrowser] = useState(false);
	const [isMuted, setIsMuted] = useState(true); // Track audio state across all videos
	const [isFullscreen, setIsFullscreen] = useState(false);
	const [showOverlay, setShowOverlay] = useState(true);
	const overlayTimeoutRef = useRef<NodeJS.Timeout | null>(null);
	const [showPlaylistModal, setShowPlaylistModal] = useState(false);
	const [playlists, setPlaylists] = useState<Array<{ id: number; name: string }>>([]);
	const [showNewPlaylistForm, setShowNewPlaylistForm] = useState(false);
	const [newPlaylistName, setNewPlaylistName] = useState("");
	const [currentVideoUrl, setCurrentVideoUrl] = useState("");
	const [showPlaylistViewer, setShowPlaylistViewer] = useState(false);
	const [playlistItems, setPlaylistItems] = useState<PlaylistItem[]>([]);
	const [playlistName, setPlaylistName] = useState("");

	// Initialize videos array when media items are loaded
	useEffect(() => {
		if (allMediaItems.length === 0) return;

		// Only set src for videos within range of current index (1 before, 2 ahead)
		const loadStart = Math.max(0, currentIndex - 1);
		const loadEnd = Math.min(allMediaItems.length, currentIndex + 3);

		setVideos(
			allMediaItems.map((item, idx) => {
				const shouldLoad = idx >= loadStart && idx < loadEnd;
				return {
					id: item.id,
					src: shouldLoad ? item.url : "",
					controls: true,
					autoPlay: idx === currentIndex,
					muted: isMuted,
					playsInline: true,
					preload: idx === currentIndex ? "metadata" : "none",
				};
			}),
		);
		// Only re-run when allMediaItems changes (initial load) or muted state changes
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [allMediaItems, isMuted]);

	// Update video sources when currentIndex changes (without recreating array)
	useEffect(() => {
		if (videos.length === 0) return;

		const loadStart = Math.max(0, currentIndex - 1);
		const loadEnd = Math.min(videos.length, currentIndex + 3);

		// Directly update video element sources instead of recreating state
		const videoElements = document.querySelectorAll('video[data-video-index]');
		videoElements.forEach((video, idx) => {
			const videoEl = video as HTMLVideoElement;
			const shouldLoad = idx >= loadStart && idx < loadEnd;
			const targetSrc = shouldLoad ? allMediaItems[idx]?.url || "" : "";

			if (videoEl.src !== targetSrc && targetSrc) {
				// Load new video
				videoEl.src = targetSrc;
				videoEl.load();
			} else if (!shouldLoad && videoEl.src) {
				// Unload distant video to save memory
				videoEl.pause();
				videoEl.removeAttribute('src');
				videoEl.load();
			}
		});
	}, [currentIndex, videos.length, allMediaItems]);

	// Update muted state on all video elements when isMuted changes
	useEffect(() => {
		const videoElements = document.querySelectorAll('video');
		videoElements.forEach(video => {
			video.muted = isMuted;
		});
	}, [isMuted]);

	// Auto-hide overlay after inactivity
	const resetOverlayTimeout = useCallback(() => {
		setShowOverlay(true);
		if (overlayTimeoutRef.current) {
			clearTimeout(overlayTimeoutRef.current);
		}
		overlayTimeoutRef.current = setTimeout(() => {
			setShowOverlay(false);
		}, 3000); // Hide after 3 seconds of inactivity
	}, []);

	// Show overlay on user interaction
	useEffect(() => {
		const handleInteraction = () => {
			resetOverlayTimeout();
		};

		// Listen for touch/mouse/scroll events
		window.addEventListener("touchstart", handleInteraction);
		window.addEventListener("mousemove", handleInteraction);
		window.addEventListener("scroll", handleInteraction, true);

		// Start the initial timeout
		resetOverlayTimeout();

		return () => {
			window.removeEventListener("touchstart", handleInteraction);
			window.removeEventListener("mousemove", handleInteraction);
			window.removeEventListener("scroll", handleInteraction, true);
			if (overlayTimeoutRef.current) {
				clearTimeout(overlayTimeoutRef.current);
			}
		};
	}, [resetOverlayTimeout]);

	// Clean up video resources when component unmounts or tab is hidden
	useEffect(() => {
		const handleVisibilityChange = () => {
			if (document.hidden) {
				// Tab is hidden - pause all videos and clear buffers
				console.log("Tab hidden, cleaning up video resources");
				const videoElements = document.querySelectorAll("video");
				videoElements.forEach((video) => {
					video.pause();
					// Remove src to free memory
					const currentSrc = video.src;
					video.removeAttribute("src");
					video.load(); // This frees the buffer
					// Store src for potential restoration
					video.dataset.pausedSrc = currentSrc;
				});
			}
		};

		const handleBeforeUnload = () => {
			// Clean up before page unload
			const videoElements = document.querySelectorAll("video");
			videoElements.forEach((video) => {
				video.pause();
				video.removeAttribute("src");
				video.load();
			});
		};

		document.addEventListener("visibilitychange", handleVisibilityChange);
		window.addEventListener("beforeunload", handleBeforeUnload);

		return () => {
			document.removeEventListener("visibilitychange", handleVisibilityChange);
			window.removeEventListener("beforeunload", handleBeforeUnload);

			// Cleanup scroll debounce timeout
			if (scrollTimeoutRef.current) {
				clearTimeout(scrollTimeoutRef.current);
			}

			// Cleanup on component unmount
			const videoElements = document.querySelectorAll("video");
			videoElements.forEach((video) => {
				video.pause();
				video.removeAttribute("src");
				video.load();
			});
		};
	}, []);

	// Auto-start media stream on mount
	useEffect(() => {
		startMediaStream();
	}, []); // eslint-disable-line react-hooks/exhaustive-deps

	// Load playlist data if source is playlist
	useEffect(() => {
		if (params.sourceType === "playlist" && params.playlistId) {
			fetch(`/api/playlists?id=${params.playlistId}`)
				.then((res) => res.json())
				.then((data) => {
					setPlaylistItems(data.items || []);
					setPlaylistName(data.playlist?.name || "Playlist");
				})
				.catch((err) => console.error("Failed to load playlist data:", err));
		}
	}, [params.sourceType, params.playlistId]);

	const startMediaStream = async () => {
		setIsLoading(true);
		setVideos([]);
		setAllMediaItems([]);
		setCurrentIndex(0);

		try {
			console.log("Fetching media with params:", params);

			const response = await fetch("/api/stream-media", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify(params),
			});

			console.log("Response status:", response.status, response.statusText);

			if (!response.ok) {
				throw new Error(`HTTP ${response.status}: ${response.statusText}`);
			}

			const data = await response.json();

			if (data.error) {
				throw new Error(data.error);
			}

			console.log(`Received ${data.mediaUrls.length} media URLs`);

			// Convert URLs to MediaItem objects - filter to videos only
			const allItems: MediaItem[] = data.mediaUrls
				.map((url: string, index: number) => ({
					url,
					type: getMediaType(url),
					id: `${Date.now()}-${index}`,
				}))
				.filter((item: MediaItem) => item.type === "video");

			console.log("Fetched video items:", allItems.length);

			// Store all video items, the useEffect will handle loading the first 4
			setAllMediaItems(allItems);
		} catch (error) {
			console.error("Error fetching media:", error);
		} finally {
			setIsLoading(false);
		}
	};

	const handleEndReached = () => {
		console.log("End reached");
	};

	const handleItemVisible = useCallback((_: VideoItem, index: number) => {
		console.log(`Item visible at index: ${index}`);

		// Debounce index updates to prevent rapid changes during fast scrolling
		if (scrollTimeoutRef.current) {
			clearTimeout(scrollTimeoutRef.current);
		}
		pendingIndexRef.current = index;

		scrollTimeoutRef.current = setTimeout(() => {
			if (pendingIndexRef.current !== null) {
				setCurrentIndex(pendingIndexRef.current);
				pendingIndexRef.current = null;
			}
		}, 150); // Wait for scroll to settle
	}, []);

	const handleItemHidden = useCallback(
		(_: VideoItem, index: number) => {
			console.log(`Item hidden at index: ${index}`);
			// Memory management is handled by setting empty src on distant videos
		},
		[],
	);

	const handleClearCache = async (item: VideoItem, index: number) => {
		const src = item.src;
		if (!src || !(src.includes('/proxy/bunkr-media') || src.includes('/proxy/media'))) {
			alert('This video is not cached');
			return;
		}

		try {
			const url = new URL(src, "http://localhost");
			const originalUrl = url.searchParams.get('url');
			if (!originalUrl) {
				alert('Could not determine original URL');
				return;
			}

			// Call invalidate-cache endpoint
			const response = await fetch(`/api/redgifs-tags?action=purge&url=${encodeURIComponent(originalUrl)}`, {
			});

			if (response.ok) {
				alert('Cache cleared for this video. It will be re-downloaded on next play.');
				// Reload the video by resetting its src
				setVideos(prev => {
					const newVideos = [...prev];
					newVideos[index] = { ...newVideos[index], src: '' };
					// Restore src after a brief delay to trigger reload
					setTimeout(() => {
						setVideos(prev2 => {
							const newerVideos = [...prev2];
							newerVideos[index] = { ...newerVideos[index], src: item.src };
							return newerVideos;
						});
					}, 100);
					return newVideos;
				});
			} else {
				alert('Failed to clear cache');
			}
		} catch (error) {
			console.error('Error clearing cache:', error);
			alert('Error clearing cache');
		}
	};

	const handleDownload = (item: VideoItem) => {
		const link = document.createElement("a");
		link.href = item.src;

		// Extract filename from URL - handle both direct URLs and proxy URLs with path param
		let filename = "video";
		try {
			const url = new URL(item.src, window.location.origin);
			const pathParam = url.searchParams.get("path");
			if (pathParam) {
				// Local file via proxy - extract filename from path parameter
				filename = pathParam.split("/").pop() || "video";
			} else {
				// Direct URL - extract filename from pathname
				filename = url.pathname.split("/").pop() || "video";
			}
		} catch {
			// Fallback for malformed URLs
			filename = item.src.split("/").pop() || "video";
		}

		link.download = filename;
		document.body.appendChild(link);
		link.click();
		document.body.removeChild(link);
	};

	const handleFullscreenToggle = async () => {
		try {
			if (!isFullscreen) {
				// Enter fullscreen
				const elem = document.documentElement;

				// Try different fullscreen methods for cross-browser compatibility
				if (elem.requestFullscreen) {
					await elem.requestFullscreen();
				} else if ((elem as any).webkitRequestFullscreen) {
					// Safari
					await (elem as any).webkitRequestFullscreen();
				} else if ((elem as any).mozRequestFullScreen) {
					// Firefox
					await (elem as any).mozRequestFullScreen();
				} else if ((elem as any).msRequestFullscreen) {
					// IE11
					await (elem as any).msRequestFullscreen();
				}

				// On iOS Safari, try to make the video element fullscreen
				const videoElement = document.querySelector('video');
				if (videoElement && (videoElement as any).webkitEnterFullscreen) {
					(videoElement as any).webkitEnterFullscreen();
				}

				setIsFullscreen(true);
			} else {
				// Exit fullscreen
				if (document.exitFullscreen) {
					await document.exitFullscreen();
				} else if ((document as any).webkitExitFullscreen) {
					await (document as any).webkitExitFullscreen();
				} else if ((document as any).mozCancelFullScreen) {
					await (document as any).mozCancelFullScreen();
				} else if ((document as any).msExitFullscreen) {
					await (document as any).msExitFullscreen();
				}

				setIsFullscreen(false);
			}
		} catch (error) {
			console.error('Fullscreen toggle error:', error);
		}
	};

	// Listen for fullscreen changes to update state
	useEffect(() => {
		const handleFullscreenChange = () => {
			const isCurrentlyFullscreen = !!(
				document.fullscreenElement ||
				(document as any).webkitFullscreenElement ||
				(document as any).mozFullScreenElement ||
				(document as any).msFullscreenElement
			);
			setIsFullscreen(isCurrentlyFullscreen);
		};

		document.addEventListener('fullscreenchange', handleFullscreenChange);
		document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
		document.addEventListener('mozfullscreenchange', handleFullscreenChange);
		document.addEventListener('MSFullscreenChange', handleFullscreenChange);

		return () => {
			document.removeEventListener('fullscreenchange', handleFullscreenChange);
			document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
			document.removeEventListener('mozfullscreenchange', handleFullscreenChange);
			document.removeEventListener('MSFullscreenChange', handleFullscreenChange);
		};
	}, []);

	// Show loading state while fetching media
	if (isLoading && videos.length === 0) {
		return (
			<div className="min-h-screen bg-black flex flex-col items-center justify-center p-4">
				<div className="text-white text-xl">Loading media...</div>
			</div>
		);
	}

	const handleCycleSortOrder = () => {
		const searchParams = new URLSearchParams(window.location.search);

		if (params.sourceType === "redgifs") {
			// RedGifs-specific sorting
			const currentOrder = params.rgOrder;
			let nextOrder = "latest";

			if (currentOrder === "latest") {
				nextOrder = "top";
			} else if (currentOrder === "top") {
				nextOrder = "top28";
			} else if (currentOrder === "top28") {
				nextOrder = "duration-desc";
			} else if (currentOrder === "duration-desc") {
				nextOrder = "duration-asc";
			} else if (currentOrder === "duration-asc") {
				nextOrder = "latest";
			}

			searchParams.set("rgOrder", nextOrder);
		} else {
			// Local directory sorting
			const currentSort = params.sortBy;
			let nextSort = "duration-desc";

			if (currentSort === "duration-desc") {
				nextSort = "duration-asc";
			} else if (currentSort === "duration-asc") {
				nextSort = "none";
			}

			searchParams.set("sortBy", nextSort);
		}

		// Use window.location to force a full page reload with new sort
		window.location.href = `/media?${searchParams.toString()}`;
	};

	const getSortLabel = () => {
		if (params.sourceType === "redgifs") {
			// RedGifs sorting labels
			switch (params.rgOrder) {
				case "latest":
					return "Latest";
				case "trending":
					return "Trending";
				case "top":
					return "Top All";
				case "top28":
					return "Top Week";
				case "duration-desc":
					return "Longest";
				case "duration-asc":
					return "Shortest";
				default:
					return "Latest";
			}
		} else {
			// Local directory sorting labels
			switch (params.sortBy) {
				case "duration-desc":
					return "Longest";
				case "duration-asc":
					return "Shortest";
				case "none":
				default:
					return "Default";
			}
		}
	};

	const handleSelectFolder = (path: string) => {
		setShowFolderBrowser(false);
		// Navigate to media page with new directory path using full page reload
		const searchParams = new URLSearchParams();
		searchParams.set("sourceType", "local");
		searchParams.set("directoryPath", path);
		// Preserve sort setting if it exists
		if (params.sortBy) {
			searchParams.set("sortBy", params.sortBy);
		}
		window.location.href = `/media?${searchParams.toString()}`;
	};

	const handleJumpToVideo = (index: number) => {
		// Scroll to the video at the specified index
		const container = containerRef.current;
		if (container) {
			const videoHeight = window.innerHeight;
			container.scrollTo({
				top: index * videoHeight,
				behavior: "smooth",
			});
		}
		setCurrentIndex(index);
	};

	const fetchPlaylists = async () => {
		try {
			const response = await fetch("/api/playlists");
			const data = await response.json();
			setPlaylists(data.playlists || []);
		} catch (error) {
			console.error("Error fetching playlists:", error);
		}
	};

	const handleAddToPlaylist = (videoUrl: string) => {
		setCurrentVideoUrl(videoUrl);
		setShowPlaylistModal(true);
		fetchPlaylists();
	};

	const handleCreatePlaylist = async () => {
		if (!newPlaylistName.trim()) return;

		try {
			const response = await fetch("/api/playlists", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					action: "create",
					name: newPlaylistName.trim(),
				}),
			});

			if (response.ok) {
				const data = await response.json();
				// Add video to newly created playlist
				await addVideoToPlaylist(data.playlist.id);
				setNewPlaylistName("");
				setShowNewPlaylistForm(false);
				setShowPlaylistModal(false);
			}
		} catch (error) {
			console.error("Error creating playlist:", error);
		}
	};

	const addVideoToPlaylist = async (playlistId: number) => {
		try {
			console.log("Adding to playlist:", { playlistId, mediaUrl: currentVideoUrl });

			if (!currentVideoUrl) {
				console.error("No video URL set!");
				alert("Error: No video URL");
				return;
			}

			const response = await fetch("/api/playlists", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					action: "add",
					playlistId: playlistId.toString(),
					mediaUrl: currentVideoUrl,
				}),
			});

			if (response.ok) {
				setShowPlaylistModal(false);
				// Show success feedback
				alert("Added to playlist!");
			} else {
				const error = await response.json();
				console.error("API error:", error);
				alert(`Error: ${error.error || "Failed to add to playlist"}`);
			}
		} catch (error) {
			console.error("Error adding to playlist:", error);
			alert("Error adding to playlist");
		}
	};

	const renderVideoOverlay = (item: VideoItem, index: number) => {
		// Use the current playing video's URL from allMediaItems
		const actualMediaUrl = allMediaItems[currentIndex]?.url || item.src;

		return (
			<div
				style={{
					position: "absolute",
					right: "8px",
					// Position above video controls (typically ~50px) plus safe area
					bottom: "calc(80px + env(safe-area-inset-bottom, 0px))",
					display: "flex",
					flexDirection: "column",
					alignItems: "center",
					gap: "6px",
					zIndex: 10,
					// Limit height to prevent covering top of screen, account for controls at bottom
					maxHeight: "calc(100% - 110px)",
					overflowY: "auto",
					overflowX: "hidden",
					opacity: showOverlay ? 1 : 0,
					transition: "opacity 0.3s ease-in-out",
					pointerEvents: showOverlay ? "auto" : "none",
				}}
			>
				{/* Folder Browser Button */}
				{params.sourceType === "local" && (
					<div
						style={{
							background: "rgba(0, 0, 0, 0.6)",
							borderRadius: "10px",
							padding: "6px",
							backdropFilter: "blur(4px)",
						}}
					>
						<button
							onClick={(e) => {
								e.stopPropagation();
								setShowFolderBrowser(true);
							}}
							style={{
								background: "none",
								border: "none",
								cursor: "pointer",
								padding: "6px",
								display: "flex",
								flexDirection: "column",
								alignItems: "center",
								gap: "2px",
							}}
						>
							<Folder size={22} color="white" />
							<span
								style={{ color: "white", fontSize: "10px", fontWeight: "500" }}
							>
								Browse
							</span>
						</button>
					</div>
				)}

				{/* Sort Button */}
				<div
					style={{
						background: "rgba(0, 0, 0, 0.6)",
						borderRadius: "10px",
						padding: "6px",
						backdropFilter: "blur(4px)",
					}}
				>
					<button
						onClick={(e) => {
							e.stopPropagation();
							handleCycleSortOrder();
						}}
						style={{
							background: "none",
							border: "none",
							cursor: "pointer",
							padding: "6px",
							display: "flex",
							flexDirection: "column",
							alignItems: "center",
							gap: "2px",
						}}
					>
						<ArrowUpDown size={22} color="white" />
						<span
							style={{ color: "white", fontSize: "10px", fontWeight: "500" }}
						>
							{getSortLabel()}
						</span>
					</button>
				</div>

				{/* Download Button */}
				<div
					style={{
						background: "rgba(0, 0, 0, 0.6)",
						borderRadius: "10px",
						padding: "6px",
						backdropFilter: "blur(4px)",
					}}
				>
					<button
						onClick={(e) => {
							e.stopPropagation();
							handleDownload(item);
						}}
						style={{
							background: "none",
							border: "none",
							cursor: "pointer",
							padding: "6px",
							display: "flex",
							flexDirection: "column",
							alignItems: "center",
							gap: "2px",
						}}
					>
						<Download size={22} color="white" />
						<span
							style={{ color: "white", fontSize: "10px", fontWeight: "500" }}
						>
							Save
						</span>
					</button>
				</div>

				{/* Audio Toggle Button */}
				<div
					style={{
						background: "rgba(0, 0, 0, 0.6)",
						borderRadius: "10px",
						padding: "6px",
						backdropFilter: "blur(4px)",
					}}
				>
					<button
						onClick={(e) => {
							e.stopPropagation();
							setIsMuted(!isMuted);
						}}
						style={{
							background: "none",
							border: "none",
							cursor: "pointer",
							padding: "6px",
							display: "flex",
							flexDirection: "column",
							alignItems: "center",
							gap: "2px",
						}}
					>
						{isMuted ? (
							<VolumeX size={22} color="white" />
						) : (
							<Volume2 size={22} color="white" />
						)}
						<span
							style={{ color: "white", fontSize: "10px", fontWeight: "500" }}
						>
							{isMuted ? "Sound" : "Mute"}
						</span>
					</button>
				</div>

				{/* Fullscreen Toggle Button */}
				<div
					style={{
						background: "rgba(0, 0, 0, 0.6)",
						borderRadius: "10px",
						padding: "6px",
						backdropFilter: "blur(4px)",
					}}
				>
					<button
						onClick={(e) => {
							e.stopPropagation();
							handleFullscreenToggle();
						}}
						style={{
							background: "none",
							border: "none",
							cursor: "pointer",
							padding: "6px",
							display: "flex",
							flexDirection: "column",
							alignItems: "center",
							gap: "2px",
						}}
					>
						{isFullscreen ? (
							<Minimize size={22} color="white" />
						) : (
							<Maximize size={22} color="white" />
						)}
						<span
							style={{ color: "white", fontSize: "10px", fontWeight: "500" }}
						>
							{isFullscreen ? "Exit" : "Full"}
						</span>
					</button>
				</div>

				{/* Add to Playlist Button */}
				<div
					style={{
						background: "rgba(0, 0, 0, 0.6)",
						borderRadius: "10px",
						padding: "6px",
						backdropFilter: "blur(4px)",
					}}
				>
					<button
						onClick={(e) => {
							e.stopPropagation();
							handleAddToPlaylist(actualMediaUrl);
						}}
						style={{
							background: "none",
							border: "none",
							cursor: "pointer",
							padding: "6px",
							display: "flex",
							flexDirection: "column",
							alignItems: "center",
							gap: "2px",
						}}
					>
						<Plus size={22} color="white" />
						<span
							style={{ color: "white", fontSize: "10px", fontWeight: "500" }}
						>
							Add
						</span>
					</button>
				</div>

				{/* View Playlist Button (only show when playing a playlist) */}
				{params.sourceType === "playlist" && playlistItems.length > 0 && (
					<div
						style={{
							background: "rgba(0, 0, 0, 0.6)",
							borderRadius: "10px",
							padding: "6px",
							backdropFilter: "blur(4px)",
						}}
					>
						<button
							onClick={(e) => {
								e.stopPropagation();
								setShowPlaylistViewer(true);
							}}
							style={{
								background: "none",
								border: "none",
								cursor: "pointer",
								padding: "6px",
								display: "flex",
								flexDirection: "column",
								alignItems: "center",
								gap: "2px",
							}}
						>
							<List size={22} color="white" />
							<span
								style={{ color: "white", fontSize: "10px", fontWeight: "500" }}
							>
								Queue
							</span>
						</button>
					</div>
				)}
			</div>
		);
	};

	return (
		<>
			<div
				style={{
					height: "100dvh",
					width: "100vw",
					maxHeight: "-webkit-fill-available",
					overflow: "hidden",
				}}
				className="w-full"
			>
				<VerticalFeed
					items={videos}
					onEndReached={handleEndReached}
					onItemVisible={handleItemVisible}
					onItemHidden={handleItemHidden}
					onClearCache={handleClearCache}
					style={{
						maxHeight: "100dvh",
						height: "100%",
					}}
					renderItemOverlay={renderVideoOverlay}
					noCover={true}
				/>
			</div>

			{/* Folder Browser Modal */}
			{showFolderBrowser && (
				<div
					style={{
						position: "fixed",
						top: 0,
						left: 0,
						right: 0,
						bottom: 0,
						backgroundColor: "rgba(0, 0, 0, 0.95)",
						zIndex: 9999,
						overflowY: "auto",
					}}
					onClick={() => setShowFolderBrowser(false)}
				>
					<div onClick={(e) => e.stopPropagation()}>
						<FolderBrowser
							onSelectPath={handleSelectFolder}
							initialPath={params.directoryPath}
						/>
					</div>
				</div>
			)}

			{/* Playlist Viewer Modal */}
			{showPlaylistViewer && (
				<PlaylistViewer
					items={playlistItems}
					currentIndex={currentIndex}
					onJumpToVideo={handleJumpToVideo}
					onClose={() => setShowPlaylistViewer(false)}
					playlistName={playlistName}
				/>
			)}

			{/* Playlist Modal */}
			{showPlaylistModal && (
				<div
					style={{
						position: "fixed",
						top: 0,
						left: 0,
						right: 0,
						bottom: 0,
						backgroundColor: "rgba(0, 0, 0, 0.8)",
						zIndex: 9999,
						display: "flex",
						alignItems: "center",
						justifyContent: "center",
						padding: "20px",
					}}
					onClick={() => setShowPlaylistModal(false)}
				>
					<div
						style={{
							backgroundColor: "#1a1a1a",
							borderRadius: "12px",
							padding: "24px",
							maxWidth: "400px",
							width: "100%",
							maxHeight: "80vh",
							overflowY: "auto",
						}}
						onClick={(e) => e.stopPropagation()}
					>
						<h2 style={{ color: "white", marginBottom: "16px", fontSize: "20px", fontWeight: "600" }}>
							Add to Playlist
						</h2>

						{!showNewPlaylistForm ? (
							<>
								{playlists.length > 0 && (
									<div style={{ marginBottom: "16px" }}>
										{playlists.map((playlist) => (
											<button
												key={playlist.id}
												onClick={() => addVideoToPlaylist(playlist.id)}
												style={{
													width: "100%",
													padding: "12px",
													marginBottom: "8px",
													backgroundColor: "#2a2a2a",
													color: "white",
													border: "none",
													borderRadius: "8px",
													cursor: "pointer",
													textAlign: "left",
													fontSize: "14px",
												}}
											>
												{playlist.name}
											</button>
										))}
									</div>
								)}

								<button
									onClick={() => setShowNewPlaylistForm(true)}
									style={{
										width: "100%",
										padding: "12px",
										backgroundColor: "#3b82f6",
										color: "white",
										border: "none",
										borderRadius: "8px",
										cursor: "pointer",
										display: "flex",
										alignItems: "center",
										justifyContent: "center",
										gap: "8px",
										fontSize: "14px",
										fontWeight: "500",
									}}
								>
									<Plus size={18} />
									Create New Playlist
								</button>
							</>
						) : (
							<div>
								<input
									type="text"
									value={newPlaylistName}
									onChange={(e) => setNewPlaylistName(e.target.value)}
									placeholder="Playlist name"
									style={{
										width: "100%",
										padding: "12px",
										marginBottom: "12px",
										backgroundColor: "#2a2a2a",
										color: "white",
										border: "1px solid #444",
										borderRadius: "8px",
										fontSize: "14px",
									}}
									autoFocus
									onKeyPress={(e) => {
										if (e.key === "Enter") {
											handleCreatePlaylist();
										}
									}}
								/>
								<div style={{ display: "flex", gap: "8px" }}>
									<button
										onClick={handleCreatePlaylist}
										style={{
											flex: 1,
											padding: "12px",
											backgroundColor: "#3b82f6",
											color: "white",
											border: "none",
											borderRadius: "8px",
											cursor: "pointer",
											fontSize: "14px",
											fontWeight: "500",
										}}
									>
										Create
									</button>
									<button
										onClick={() => {
											setShowNewPlaylistForm(false);
											setNewPlaylistName("");
										}}
										style={{
											flex: 1,
											padding: "12px",
											backgroundColor: "#444",
											color: "white",
											border: "none",
											borderRadius: "8px",
											cursor: "pointer",
											fontSize: "14px",
										}}
									>
										Cancel
									</button>
								</div>
							</div>
						)}
					</div>
				</div>
			)}
		</>
	);
}
