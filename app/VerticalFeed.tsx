import React, {
  useRef,
  useEffect,
  useCallback,
  useMemo,
  useState,
} from "react";

export interface VideoItem {
  preload: string | undefined;
  src: string;
  id?: string;
  metadata?: Record<string, unknown>;
  controls?: boolean;
  autoPlay?: boolean;
  muted?: boolean;
  playsInline?: boolean;
}

export interface VerticalFeedProps {
  items: VideoItem[];
  onEndReached?: () => void;
  loadingComponent?: React.ReactNode;
  errorComponent?: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  onItemVisible?: (item: VideoItem, index: number) => void;
  onItemHidden?: (item: VideoItem, index: number) => void;
  onItemClick?: (item: VideoItem, index: number) => void;
  threshold?: number;
  scrollBehavior?: ScrollBehavior;
  renderItemOverlay?: (item: VideoItem, index: number) => React.ReactNode;
  videoStyles?: React.CSSProperties;
  noCover?: boolean;
  onClearCache?: (item: VideoItem, index: number) => void;
}

export const VerticalFeed = ({
  items,
  onEndReached,
  loadingComponent,
  errorComponent,
  className,
  style,
  onItemVisible,
  onItemHidden,
  onItemClick,
  threshold = 0.75,
  scrollBehavior = "smooth",
  renderItemOverlay,
  videoStyles,
  noCover,
  onClearCache,
}: VerticalFeedProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [loadingStates, setLoadingStates] = useState<Record<number, boolean>>(
    {},
  );
  const [errorStates, setErrorStates] = useState<Record<number, boolean>>({});
  const retryCountsRef = useRef<Record<number, number>>({});
  const retryTimeoutsRef = useRef<Record<number, NodeJS.Timeout>>({});

  const handleMediaLoad = useCallback((index: number, videoElement: HTMLVideoElement) => {
    setLoadingStates((prev) => ({ ...prev, [index]: false }));
    setErrorStates((prev) => ({ ...prev, [index]: false }));
    // Reset retry count on successful load
    retryCountsRef.current[index] = 0;

    // Verify cache for proxied videos
    const src = videoElement.src;
    if (src && (src.includes('/proxy/bunkr-media') || src.includes('/proxy/media'))) {
      // Extract the original URL from proxy parameter
      try {
        const url = new URL(src);
        const originalUrl = url.searchParams.get('url');
        if (originalUrl) {
          // Determine backend URL
          const backendUrl = src.includes('/proxy/bunkr-media')
            ? 'http://localhost:8001'
            : 'http://localhost:8000';

          // Call verify-cache endpoint (fire and forget)
          fetch(`/api/redgifs-tags?action=verify&url=${encodeURIComponent(originalUrl)}`, {
          }).catch(() => {}); // Ignore errors
        }
      } catch (e) {
        // Ignore URL parsing errors
      }
    }
  }, []);

  const retryVideo = useCallback((index: number, videoElement: HTMLVideoElement) => {
    const maxRetries = 3;
    const currentRetries = retryCountsRef.current[index] || 0;

    if (currentRetries >= maxRetries) {
      console.error(`Max retries (${maxRetries}) reached for video ${index}`);
      setErrorStates((prev) => ({ ...prev, [index]: true }));
      setLoadingStates((prev) => ({ ...prev, [index]: false }));
      return;
    }

    // Exponential backoff: 1s, 2s, 4s
    const retryDelay = Math.pow(2, currentRetries) * 1000;
    retryCountsRef.current[index] = currentRetries + 1;

    console.log(`Retrying video ${index} (attempt ${currentRetries + 1}/${maxRetries}) after ${retryDelay}ms`);

    // Clear any existing retry timeout
    if (retryTimeoutsRef.current[index]) {
      clearTimeout(retryTimeoutsRef.current[index]);
    }

    retryTimeoutsRef.current[index] = setTimeout(() => {
      const item = items[index];
      if (item?.src) {
        videoElement.src = item.src;
        videoElement.load();
      }
      delete retryTimeoutsRef.current[index];
    }, retryDelay);
  }, [items]);

  const handleMediaError = useCallback((index: number, event: React.SyntheticEvent<HTMLVideoElement>) => {
    const videoElement = event.currentTarget;
    const error = videoElement.error;

    // Log error details
    if (error) {
      const errorMessages: Record<number, string> = {
        1: 'MEDIA_ERR_ABORTED',
        2: 'MEDIA_ERR_NETWORK',
        3: 'MEDIA_ERR_DECODE',
        4: 'MEDIA_ERR_SRC_NOT_SUPPORTED',
      };
      console.error(`Video ${index} error: ${errorMessages[error.code] || 'UNKNOWN'} (${error.code})`);

      // Invalidate cache for decode errors (corrupted cached files)
      if (error.code === 3) {
        const src = videoElement.src;
        if (src && (src.includes('/proxy/bunkr-media') || src.includes('/proxy/media'))) {
          try {
            const url = new URL(src);
            const originalUrl = url.searchParams.get('url');
            if (originalUrl) {
              const backendUrl = src.includes('/proxy/bunkr-media')
                ? 'http://localhost:8001'
                : 'http://localhost:8000';

		  fetch(`/api/redgifs-tags?action=purge&url=${encodeURIComponent(originalUrl)}`, {
		  }).catch(() => {}); // Ignore errors
              // Call invalidate-cache endpoint
            }
          } catch (e) {
            // Ignore URL parsing errors
          }
        }
      }
    }

    // Only retry on network errors or source not supported (which can be transient)
    // Don't retry on decode errors as they're unlikely to succeed
    if (!error || error.code === 2 || error.code === 4) {
      retryVideo(index, videoElement);
    } else {
      setErrorStates((prev) => ({ ...prev, [index]: true }));
      setLoadingStates((prev) => ({ ...prev, [index]: false }));
    }
  }, [retryVideo]);

  // Track which indices are currently visible
  const visibleIndicesRef = useRef<Set<number>>(new Set());

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const index = parseInt(
            entry.target.getAttribute("data-index") || "0",
            10,
          );
          const item = items[index];
          const video = entry.target.querySelector("video") as HTMLVideoElement;

          if (entry.isIntersecting) {
            visibleIndicesRef.current.add(index);

            if (video) {
              // Restore src if it was cleared
              if (!video.src && item?.src) {
                video.src = item.src;
                video.load();
              }
              // Only play if video has a source
              if (video.src) {
                video.play().catch((error) => {
                  console.error("Error playing video:", error);
                });
              }
            }
            onItemVisible?.(item, index);
          } else {
            visibleIndicesRef.current.delete(index);

            if (video) {
              video.pause();
            }
            onItemHidden?.(item, index);
          }
        });
      },
      {
        threshold,
      },
    );

    const mediaElements =
      containerRef.current?.querySelectorAll("[data-index]") || [];
    mediaElements.forEach((media) => observer.observe(media));

    return () => {
      // Clean up all retry timeouts
      Object.values(retryTimeoutsRef.current).forEach((timeout) => {
        clearTimeout(timeout);
      });
      retryTimeoutsRef.current = {};

      // Clean up all video buffers before disconnecting observer
      const videoElements =
        containerRef.current?.querySelectorAll("video") || [];
      videoElements.forEach((video) => {
        video.pause();
        video.removeAttribute("src");
        video.load();
      });
      observer.disconnect();
    };
  }, [items, onItemVisible, onItemHidden, threshold]);

  const handleScroll = useCallback(() => {
    if (!containerRef.current || !onEndReached) return;
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    if (scrollTop + clientHeight >= scrollHeight - 100) {
      onEndReached();
    }
  }, [onEndReached]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!containerRef.current) return;

      const { scrollTop, clientHeight } = containerRef.current;
      const scrollAmount = clientHeight;

      if (!containerRef.current.scrollTo) return;

      switch (e.key) {
        case "ArrowDown":
          containerRef.current.scrollTo({
            top: scrollTop + scrollAmount,
            behavior: scrollBehavior,
          });
          break;
        case "ArrowUp":
          containerRef.current.scrollTo({
            top: scrollTop - scrollAmount,
            behavior: scrollBehavior,
          });
          break;
      }
    },
    [scrollBehavior],
  );

  const defaultRenderItem = useCallback(
    (item: VideoItem, index: number) => {
      const isLoading = loadingStates[index] ?? true;
      const hasError = errorStates[index] ?? false;

      return (
        <div
          key={item.id || index}
          data-index={index}
          onClick={() => onItemClick?.(item, index)}
          style={{
            height: "100dvh",
            maxHeight: "-webkit-fill-available",
            scrollSnapAlign: "start",
            position: "relative",
            cursor: onItemClick ? "pointer" : "default",
            overflow: "hidden",
          }}
          role="region"
          aria-label={`video ${index + 1}`}
        >
          {isLoading && loadingComponent}
          {hasError && errorComponent}
          <video
            data-video-index={index}
            src={item.src}
            muted={item.muted ?? true}
            playsInline={item.playsInline ?? true}
            controls={item.controls ?? false}
            autoPlay={item.autoPlay ?? true}
            onLoadedData={(e) => handleMediaLoad(index, e.currentTarget)}
            onCanPlay={(e) => {
              // Auto-play when video is ready and visible
              if (visibleIndicesRef.current.has(index)) {
                (e.target as HTMLVideoElement).play().catch(() => {});
              }
            }}
            onError={(e) => handleMediaError(index, e)}
            onStalled={(e) => {
              console.warn(`Video ${index} stalled, attempting reload...`);
              const videoElement = e.currentTarget;
              retryVideo(index, videoElement);
            }}
            preload={
              item.preload ? (item.preload as string | undefined) : undefined
            }
            style={{
              width: "100%",
              height: "100%",
              maxHeight: "100%",
              objectFit: noCover ? "contain" : "cover",
              display: isLoading || hasError ? "none" : "block",
              // Ensure controls are visible in landscape by adding safe area padding
              paddingBottom: "env(safe-area-inset-bottom, 0px)",
              boxSizing: "border-box",
              ...videoStyles,
            }}
          />
          {renderItemOverlay && renderItemOverlay(item, index)}
          {onClearCache && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onClearCache(item, index);
              }}
              className="absolute bottom-20 right-4 bg-red-600 hover:bg-red-700 text-white p-3 rounded-full shadow-lg transition-colors z-10"
              title="Clear cache for this video"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M3 6h18" />
                <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                <line x1="10" x2="10" y1="11" y2="17" />
                <line x1="14" x2="14" y1="11" y2="17" />
              </svg>
            </button>
          )}
        </div>
      );
    },
    [
      loadingStates,
      errorStates,
      loadingComponent,
      errorComponent,
      handleMediaLoad,
      handleMediaError,
      retryVideo,
      onItemClick,
      renderItemOverlay,
      videoStyles,
      noCover,
      onClearCache,
    ],
  );

  const mediaElements = useMemo(
    () => items.map((item, index) => defaultRenderItem(item, index)),
    [items, defaultRenderItem],
  );

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      onKeyDown={handleKeyDown}
      tabIndex={0}
      role="feed"
      aria-label="Vertical video feed"
      className={className}
      style={{
        height: "100dvh",
        maxHeight: "-webkit-fill-available",
        overflowY: "scroll",
        scrollSnapType: "y mandatory",
        outline: "none",
        WebkitOverflowScrolling: "touch",
        ...style,
      }}
    >
      {mediaElements}
    </div>
  );
};
