import { useState, useEffect } from "react";
import { Folder, ArrowUp, Play, Clock } from "lucide-react";

interface Directory {
  name: string;
  path: string;
}

interface VideoFile {
  name: string;
  path: string;
  thumbnail: string | null;
  duration: number | null;
}

interface DirectoryData {
  currentPath: string;
  parentPath: string | null;
  directories: Directory[];
  files: VideoFile[];
  platform: string;
  drives: string[];
}

interface FolderBrowserProps {
  onSelectPath: (path: string) => void;
  initialPath?: string;
}

export function FolderBrowser({ onSelectPath, initialPath }: FolderBrowserProps) {
  const [currentPath, setCurrentPath] = useState(initialPath || "");
  const [data, setData] = useState<DirectoryData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showFiles, setShowFiles] = useState(true);

  const loadDirectory = async (path: string, includeFiles = false) => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/list-directories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPath: path, includeFiles }),
      });

      if (!response.ok) {
        throw new Error("Failed to load directory");
      }

      const result = await response.json();
      setData(result);
      setCurrentPath(result.currentPath);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadDirectory(currentPath, true);
  }, []);

  const handleNavigateToDirectory = (path: string) => {
    loadDirectory(path, showFiles);
  };

  const handleToggleFiles = () => {
    const newShowFiles = !showFiles;
    setShowFiles(newShowFiles);
    loadDirectory(currentPath, newShowFiles);
  };

  const formatDuration = (seconds: number | null) => {
    if (!seconds) return "";
    const minutes = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${minutes}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold mb-4">Folder Browser</h1>
          {/* Current Path */}
          <div className="bg-gray-800 p-4 rounded-lg mb-4">


            <div className="flex items-center justify-between">
              {data?.parentPath && (
                <button
                  onClick={() => handleNavigateToDirectory(data.parentPath!)}
                  className="mr-4 p-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors"
                  title="Go to parent directory"
                >
                  <ArrowUp size={20} />
                </button>
              )}

              <div className="flex-1">
                <p className="text-sm text-gray-400 mb-1">Current Directory</p>
                <p className="font-mono text-sm break-all">{currentPath || "Home"}</p>
              </div>
            </div>
          </div>

          {/* Controls */}
          <div className="flex gap-4">
            <button
              onClick={handleToggleFiles}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
            >
              {showFiles ? "Hide Video Previews" : "Show Video Previews"}
            </button>
            <button
              onClick={() => onSelectPath(currentPath)}
              className="px-4 py-2 bg-green-600 hover:bg-green-700 rounded-lg transition-colors"
            >
              Load Videos from This Folder
            </button>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-900/50 border border-red-500 rounded-lg p-4 mb-6">
            <p className="text-red-200">{error}</p>
          </div>
        )}

        {/* Loading */}
        {isLoading && (
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-white"></div>
            <p className="mt-4 text-gray-400">Loading...</p>
          </div>
        )}

        {/* Content */}
        {!isLoading && data && (
          <div>
            {/* Directories */}
            {data.directories.length > 0 && (
              <div className="mb-8">
                <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                  <Folder size={20} />
                  Directories ({data.directories.length})
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {data.directories.map((dir) => (
                    <button
                      key={dir.path}
                      onClick={() => handleNavigateToDirectory(dir.path)}
                      className="flex items-center gap-3 p-4 bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors text-left"
                    >
                      <Folder size={20} className="text-blue-400 flex-shrink-0" />
                      <span className="truncate">{dir.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Video Files with Thumbnails */}
            {showFiles && data.files.length > 0 && (
              <div>
                <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                  <Play size={20} />
                  Videos ({data.files.length})
                </h2>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                  {data.files.map((file) => (
                    <div
                      key={file.path}
                      className="bg-gray-800 rounded-lg overflow-hidden hover:ring-2 hover:ring-blue-500 transition-all"
                    >
                      {/* Thumbnail */}
                      <div className="relative aspect-video bg-gray-700">
                        {file.thumbnail ? (
                          <img
                            src={file.thumbnail}
                            alt={file.name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <Play size={32} className="text-gray-500" />
                          </div>
                        )}
                        {file.duration && (
                          <div className="absolute bottom-2 right-2 bg-black/75 px-2 py-1 rounded text-xs flex items-center gap-1">
                            <Clock size={12} />
                            {formatDuration(file.duration)}
                          </div>
                        )}
                      </div>
                      {/* Filename */}
                      <div className="p-2">
                        <p className="text-sm truncate" title={file.name}>
                          {file.name}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Empty State */}
            {data.directories.length === 0 && (!showFiles || data.files.length === 0) && (
              <div className="text-center py-12 text-gray-400">
                <p>No {showFiles ? "directories or videos" : "directories"} found in this folder</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
