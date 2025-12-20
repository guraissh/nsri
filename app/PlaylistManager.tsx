import { useState, useEffect } from "react";
import { X, GripVertical, Trash2 } from "lucide-react";
import type { PlaylistItem } from "./PlaylistViewer";

interface Playlist {
  id: number;
  name: string;
  description?: string;
}


interface PlaylistManagerProps {
  playlistId: string;
  onClose: () => void;
  onUpdate: () => void;
}

export function PlaylistManager({ playlistId, onClose, onUpdate }: PlaylistManagerProps) {
  const [playlist, setPlaylist] = useState<Playlist | null>(null);
  const [items, setItems] = useState<PlaylistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  useEffect(() => {
    if (playlistId) {
      loadPlaylist();
    }
  }, [playlistId]);

  const loadPlaylist = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/playlists?id=${playlistId}`);
      const data = await response.json();
      setPlaylist(data.playlist);
      setItems(data.items || []);
    } catch (error) {
      console.error("Error loading playlist:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveItem = async (mediaUrl: string) => {
    if (!playlist) return;

    try {
      const response = await fetch("/api/playlists", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          playlistId: playlist.id,
          mediaUrl,
        }),
      });

      if (response.ok) {
        await loadPlaylist();
        onUpdate();
      }
    } catch (error) {
      console.error("Error removing item:", error);
    }
  };

  const handleDragStart = (index: number) => {
    setDraggedIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index) return;

    // Visual feedback - update UI optimistically
    const newItems = [...items];
    const draggedItem = newItems[draggedIndex];
    newItems.splice(draggedIndex, 1);
    newItems.splice(index, 0, draggedItem);
    setItems(newItems);
    setDraggedIndex(index);
  };

  const handleDrop = async (e: React.DragEvent, newIndex: number) => {
    e.preventDefault();
    if (draggedIndex === null || !playlist) return;

    const draggedItem = items[draggedIndex];

    try {
      // Send reorder request to backend
      const response = await fetch("/api/playlists", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "reorder",
          playlistId: playlist.id,
          mediaUrl: draggedItem.media_url,
          newIndex,
        }),
      });

      if (response.ok) {
        await loadPlaylist();
        onUpdate();
      }
    } catch (error) {
      console.error("Error reordering item:", error);
      // Reload on error to get correct order from backend
      await loadPlaylist();
    } finally {
      setDraggedIndex(null);
    }
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
    // Reload to ensure correct order
    loadPlaylist();
  };

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-80 z-50 flex items-center justify-center">
        <div className="bg-gray-900 p-8 rounded-lg">
          <p className="text-white">Loading playlist...</p>
        </div>
      </div>
    );
  }

  if (!playlist) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-80 z-50 flex items-center justify-center">
        <div className="bg-gray-900 p-8 rounded-lg">
          <p className="text-white">Playlist not found</p>
          <button
            onClick={onClose}
            className="mt-4 px-4 py-2 bg-gray-700 text-white rounded hover:bg-gray-600"
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-80 z-50 overflow-y-auto">
      <div className="min-h-screen flex items-start justify-center p-4">
        <div className="bg-gray-900 rounded-lg w-full max-w-3xl my-8">
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-gray-700">
            <div>
              <h2 className="text-2xl font-bold text-white">{playlist.name}</h2>
              {playlist.description && (
                <p className="text-gray-400 mt-1">{playlist.description}</p>
              )}
              <p className="text-sm text-gray-500 mt-2">{items.length} videos</p>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-white transition-colors"
            >
              <X size={24} />
            </button>
          </div>

          {/* Items List */}
          <div className="p-6">
            {items.length === 0 ? (
              <div className="text-center py-12 text-gray-400">
                <p>This playlist is empty</p>
                <p className="text-sm mt-2">Add videos from the media player</p>
              </div>
            ) : (
              <div className="space-y-2">
                {items.map((item, index) => {
                  const urlParts = new URL(item.media_url, window.location.origin);
                  const pathParam = urlParts.searchParams.get("path");
                  const displayName = pathParam
                    ? decodeURIComponent(pathParam.split("/").pop() || "Video")
                    : `Video ${index + 1}`;

                  return (
                    <div
                      key={item.id}
                      draggable
                      onDragStart={() => handleDragStart(index)}
                      onDragOver={(e) => handleDragOver(e, index)}
                      onDrop={(e) => handleDrop(e, index)}
                      onDragEnd={handleDragEnd}
                      className={`flex items-center gap-3 p-3 bg-gray-800 rounded-lg hover:bg-gray-750 transition-colors cursor-move ${draggedIndex === index ? "opacity-50" : ""
                        }`}
                    >
                      <GripVertical size={20} className="text-gray-500 flex-shrink-0" />

                      {/* Thumbnail */}
                      {item.thumbnail_path ? (
                        <div className="w-24 h-16 flex-shrink-0 bg-gray-700 rounded overflow-hidden">
                          <img
                            src={item.thumbnail_path}
                            alt={displayName}
                            className="w-full h-full object-cover"
                          />
                        </div>
                      ) : (
                        <div className="w-24 h-16 flex-shrink-0 bg-gray-700 rounded flex items-center justify-center">
                          <span className="text-gray-500 text-xs">No preview</span>
                        </div>
                      )}

                      <div className="flex-1 min-w-0">
                        <p className="text-white text-sm font-medium truncate">{displayName}</p>
                        <p className="text-gray-500 text-xs mt-1">Position {index + 1}</p>
                      </div>
                      <button
                        onClick={() => handleRemoveItem(item.media_url)}
                        className="text-red-400 hover:text-red-300 transition-colors flex-shrink-0"
                        title="Remove from playlist"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="p-6 border-t border-gray-700">
            <button
              onClick={onClose}
              className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
