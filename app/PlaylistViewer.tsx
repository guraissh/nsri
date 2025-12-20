import { X } from "lucide-react";

export interface PlaylistItem {
  id?: number;
  playlist_id: number;
  media_url: string;
  order_index: number;
  added_at?: number;
  thumbnail_path?: string | null;
}

interface PlaylistViewerProps {
  items: PlaylistItem[];
  currentIndex: number;
  onJumpToVideo: (index: number) => void;
  onClose: () => void;
  playlistName?: string;
}

export function PlaylistViewer({
  items,
  currentIndex,
  onJumpToVideo,
  onClose,
  playlistName = "Playlist",
}: PlaylistViewerProps) {
  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-90 z-50 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="min-h-screen flex items-start justify-center p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-gray-900 rounded-lg w-full max-w-4xl my-8">
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-gray-700">
            <div>
              <h2 className="text-2xl font-bold text-white">{playlistName}</h2>
              <p className="text-sm text-gray-500 mt-1">
                {items.length} videos • Currently playing: {currentIndex + 1}
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-white transition-colors"
            >
              <X size={24} />
            </button>
          </div>

          {/* Videos Grid */}
          <div className="p-6">
            {items.length === 0 ? (
              <div className="text-center py-12 text-gray-400">
                <p>This playlist is empty</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {items.map((item, index) => {
                  const urlParts = new URL(item.media_url, window.location.origin);
                  const pathParam = urlParts.searchParams.get("path");
                  const displayName = pathParam
                    ? decodeURIComponent(pathParam.split("/").pop() || "Video")
                    : `Video ${index + 1}`;

                  const isCurrentVideo = index === currentIndex;

                  return (
                    <button
                      key={item.id}
                      onClick={() => {
                        onJumpToVideo(index);
                        onClose();
                      }}
                      className={`relative group rounded-lg overflow-hidden transition-all ${isCurrentVideo
                          ? "ring-4 ring-blue-500 scale-105"
                          : "hover:scale-105 hover:ring-2 hover:ring-gray-400"
                        }`}
                    >
                      {/* Thumbnail */}
                      {item.thumbnail_path ? (
                        <div className="aspect-video bg-gray-800">
                          <img
                            src={item.thumbnail_path}
                            alt={displayName}
                            className="w-full h-full object-cover"
                          />
                        </div>
                      ) : (
                        <div className="aspect-video bg-gray-800 flex items-center justify-center">
                          <span className="text-gray-500 text-xs">No preview</span>
                        </div>
                      )}

                      {/* Overlay */}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />

                      {/* Info */}
                      <div className="absolute bottom-0 left-0 right-0 p-3">
                        <p className="text-white text-sm font-medium truncate drop-shadow-lg">
                          {displayName}
                        </p>
                        <p className="text-gray-300 text-xs mt-1 drop-shadow-lg">
                          {index + 1} of {items.length}
                        </p>
                      </div>

                      {/* Current video indicator */}
                      {isCurrentVideo && (
                        <div className="absolute top-2 right-2 bg-blue-500 text-white text-xs font-bold px-2 py-1 rounded">
                          PLAYING
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
