import { useState, useEffect, useRef, useCallback } from "react";
import { useLoaderData } from "react-router";
import '@vidstack/react/player/styles/default/theme.css';
import '@vidstack/react/player/styles/default/layouts/video.css';
import type { Route } from "./+types/media";
import { VerticalFeed, type VideoItem } from "react-vertical-feed";
import { Heart } from 'lucide-react';

interface MediaItem {
	url: string;
	type: 'video' | 'image';
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

const getMediaType = (url: string): 'video' | 'image' => {
	const videoExtensions = ['.mp4', '.webm', '.mov', '.avi', '.mkv', '.m4v', '.3gp', '.flv', '.ogv'];
	const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg', '.tiff'];

	const lowerUrl = url.toLowerCase();

	if (videoExtensions.some(ext => lowerUrl.includes(ext))) {
		return 'video';
	}
	if (imageExtensions.some(ext => lowerUrl.includes(ext))) {
		return 'image';
	}

	// Try to determine from URL structure
	if (lowerUrl.includes('video') || lowerUrl.includes('.m3u8') || lowerUrl.includes('stream')) {
		return 'video';
	}

	// Default to image for unknown types (safer fallback)
	return 'image';
};


export default function Media() {
	const params = useLoaderData<typeof loader>();
	const [allMediaItems, setAllMediaItems] = useState<MediaItem[]>([]);

	const [isLoading, setIsLoading] = useState(false);
	const [hasStarted, setHasStarted] = useState(false);
	const containerRef = useRef<HTMLDivElement>(null);
	const [currentIndex, setCurrentIndex] = useState(0);

	const [videoStates, setVideoStates] = useState<Record<number, { liked: boolean }>>({});
	const [videos, setVideos] = useState<VideoItem[]>([]);


	// Load more videos as user scrolls
	useEffect(() => {
		if (allMediaItems.length === 0) return;

		// Load current video + 3 ahead
		const endIndex = Math.min(currentIndex + 4, allMediaItems.length);
		console.log(`Updating videos for current index: ${currentIndex}, loading up to index: ${endIndex} out of ${allMediaItems.length}`);
		const itemsToLoad = allMediaItems.slice(0, endIndex);
		setVideos(itemsToLoad.map((item) => ({
			id: item.id,
			src: item.url,
			controls: true,
			autoPlay: true,
			muted: true,
			playsInline: true,
		})));
	}, [currentIndex, allMediaItems]);

	const markMediaAsError = useCallback((index: number) => {
		setVideos(prev => prev.map((item, i) =>
			i === index ? { ...item, hasError: true } : item
		));
	}, []);

	const startMediaStream = async () => {
		setIsLoading(true);
		setVideos([]);
		setAllMediaItems([]);
		setHasStarted(true);
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
					id: `${Date.now()}-${index}`
				}))
				.filter((item: MediaItem) => item.type === 'video');

			console.log("Fetched video items:", allItems.length);

			// Store all video items, the useEffect will handle loading the first 4
			setAllMediaItems(allItems);

		} catch (error) {
			console.error("Error fetching media:", error);
		} finally {
			setIsLoading(false);
		}
	};



	if (!hasStarted) {
		return (
			<div className="min-h-screen bg-black flex flex-col items-center justify-center p-4">
				<div className="max-w-md w-full space-y-6 text-center">
					<h1 className="text-3xl font-bold text-white mb-6">TikTok-like Media Viewer</h1>

					<div className="bg-gray-900 p-4 rounded-lg text-left">
						<h2 className="text-lg font-semibold mb-2 text-white">Parameters:</h2>
						<div className="space-y-1 text-gray-300 text-sm">
							<p><strong>Domain:</strong> {params.baseDomain}</p>
							<p><strong>Service:</strong> {params.serviceName}</p>
							<p><strong>User ID:</strong> {params.userId}</p>
							<p><strong>Range:</strong> {params.from} - {params.to}</p>
							<p><strong>Limit:</strong> {params.limit}</p>
						</div>
					</div>

					<button
						onClick={startMediaStream}
						disabled={isLoading}
						className="w-full bg-pink-600 text-white py-3 px-6 rounded-full font-semibold hover:bg-pink-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
					>
						{isLoading ? "Loading Media..." : "Load All Media"}
					</button>
				</div>
			</div>
		);
	}


	const handleEndReached = () => {
		console.log('End reached');
	};



	const handleItemVisible = (_: VideoItem, index: number) => {
		console.log('Item visible at index:', index);
		setCurrentIndex(index);
	};

	const renderVideoOverlay = (item: VideoItem, index: number) => {
		const { liked = false } = videoStates[index] || {};
		return (
			<div
				style={{
					position: 'absolute',
					right: '20px',
					bottom: '100px',
					display: 'flex',
					flexDirection: 'column',
					alignItems: 'center',
					gap: '20px',
					zIndex: 10,
				}}
			>
				<div
					style={{
						background: 'rgba(0, 0, 0, 0.5)',
						borderRadius: '12px',
						padding: '8px',
						backdropFilter: 'blur(4px)',
					}}
				>
					<button
						onClick={e => {
							e.stopPropagation();
							setVideoStates(prev => ({
								...prev,
								[index]: { liked: !prev[index]?.liked },
							}));
						}}
						style={{
							background: 'none',
							border: 'none',
							cursor: 'pointer',
							padding: '8px',
							display: 'flex',
							flexDirection: 'column',
							alignItems: 'center',
							gap: '4px',
						}}
					>
						<Heart
							size={32}
							fill={liked ? '#ff2d55' : 'none'}
							color={liked ? '#ff2d55' : 'white'}
						/>
						<span style={{ color: 'white', fontSize: '14px' }}>{liked ? 'Liked' : 'Like'}</span>
					</button>
				</div>
			</div>
		);
	};

	return (
		<div style={{ height: '100vh', width: '100vw' }} className="w-full h-screen">
			<VerticalFeed
				items={videos}
				onEndReached={handleEndReached}
				onItemVisible={handleItemVisible}
				className="h-100vh"
				style={{ maxHeight: '100dvh' }}
				renderItemOverlay={renderVideoOverlay}
				noCover={true}
			/>
		</div>
	);
}

