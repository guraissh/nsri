import { useState, useEffect, useRef, useCallback } from "react";
import { useLoaderData, useNavigate } from "react-router";
import "@vidstack/react/player/styles/default/theme.css";
import "@vidstack/react/player/styles/default/layouts/video.css";
import type { Route } from "./+types/media";
import { ArrowUpDown, Download, Folder, Volume2, VolumeX, Maximize, Minimize } from "lucide-react";
import { VerticalFeed, type VideoItem } from "~/VerticalFeed";
import { FolderBrowser } from "~/FolderBrowser";

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
    const currentSort = params.sortBy;
    let nextSort = "duration-desc";

    if (currentSort === "duration-desc") {
      nextSort = "duration-asc";
    } else if (currentSort === "duration-asc") {
      nextSort = "none";
    }

    // Navigate to the same page with updated sort parameter and reload
    const searchParams = new URLSearchParams(window.location.search);
    searchParams.set("sortBy", nextSort);
    // Use window.location to force a full page reload with new sort
    window.location.href = `/media?${searchParams.toString()}`;
  };

  const getSortLabel = () => {
    switch (params.sortBy) {
      case "duration-desc":
        return "Longest";
      case "duration-asc":
        return "Shortest";
      case "none":
      default:
        return "Default";
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

  const renderVideoOverlay = (item: VideoItem, index: number) => {
    return (
      <div
        style={{
          position: "absolute",
          right: "8px",
          // Position above video controls (typically ~50px) plus safe area
          bottom: "calc(50px + env(safe-area-inset-bottom, 0px))",
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
    </>
  );
}
