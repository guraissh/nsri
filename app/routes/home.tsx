import { useState, useEffect } from "react";
import { useNavigate, useLoaderData } from "react-router";
import type { Route } from "./+types/home";

export function meta({ }: Route.MetaArgs) {
  return [
    { title: "Media Stream Configuration" },
    { name: "description", content: "Configure and stream media content" },
  ];
}

export async function loader({ request }: Route.LoaderArgs) {
  // Get ROOT_DIR from environment variable
  const rootDir = process.env.ROOT_DIR || "";
  return { rootDir };
}

interface Directory {
  name: string;
  path: string;
}

interface DirectoryListResponse {
  currentPath: string;
  parentPath: string | null;
  directories: Directory[];
  drives: string[];
  platform: string;
  error?: string;
}

export default function Home() {
  const navigate = useNavigate();
  const { rootDir } = useLoaderData<typeof loader>();

  const [formData, setFormData] = useState({
    sourceType: "local",
    directoryPath: rootDir,
    sortBy: "duration-desc",
    platform: "coomer",
    serviceName: "onlyfans",
    userId: "piripremium",
    from: "0",
    to: "15",
    limit: "-1",
    lookahead: "",
  });

  // Directory browser state
  const [showDirectoryBrowser, setShowDirectoryBrowser] = useState(false);
  const [browserStartPath, setBrowserStartPath] = useState("");
  const [browserData, setBrowserData] = useState<DirectoryListResponse>({
    currentPath: "",
    parentPath: null,
    directories: [],
    drives: [],
    platform: "",
  });
  const [browserLoading, setBrowserLoading] = useState(false);
  const [browserError, setBrowserError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    console.log("Form Data:", formData);
    if (formData.sourceType === "local") {
      // For local directory source
      const params = new URLSearchParams({
        sourceType: "local",
        directoryPath: formData.directoryPath,
        limit: formData.limit,
        sortBy: formData.sortBy,
      });
      navigate(`/media?${params.toString()}`);
    } else {
      // For API source
      const baseDomain = formData.platform === "kemono" ? "https://kemono.cr" : "https://coomer.su";
      const baseApiPath = "/api/v1";

      const params = new URLSearchParams({
        ...formData,
        baseDomain,
        baseApiPath,
      });
      navigate(`/media?${params.toString()}`);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  // Directory browser functions
  const fetchDirectories = async (path: string = "") => {
    setBrowserLoading(true);
    setBrowserError(null);

    try {
      const response = await fetch("/api/list-directories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPath: path }),
      });

      const data: DirectoryListResponse = await response.json();

      if (data.error) {
        setBrowserError(data.error);
      } else {
        setBrowserData(data);
      }
    } catch (error) {
      console.error("Error fetching directories:", error);
      setBrowserError("Failed to fetch directories");
    } finally {
      setBrowserLoading(false);
    }
  };

  const handleOpenBrowser = () => {
    setShowDirectoryBrowser(true);
    // Use browserStartPath if set, otherwise try formData.directoryPath, otherwise empty (home dir)
    const startPath = browserStartPath || formData.directoryPath || "";
    fetchDirectories(startPath);
  };

  const handleCloseBrowser = () => {
    setShowDirectoryBrowser(false);
  };

  const handleNavigateToDirectory = (path: string) => {
    fetchDirectories(path);
  };

  const handleSelectDirectory = () => {
    setFormData({
      ...formData,
      directoryPath: browserData.currentPath,
    });
    setShowDirectoryBrowser(false);
  };

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <h1 className="text-3xl font-bold mb-6 text-gray-900 dark:text-white">Media Stream Configuration</h1>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Source Type
          </label>
          <select
            name="sourceType"
            value={formData.sourceType}
            onChange={handleChange}
            className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-white"
            required
          >
            <option value="api">API (Kemono/Coomer)</option>
            <option value="local">Local Directory</option>
          </select>
        </div>

        {formData.sourceType === "local" ? (
          <>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Directory Path
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  name="directoryPath"
                  value={formData.directoryPath}
                  onChange={handleChange}
                  placeholder="Select a directory..."
                  className="flex-1 px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500"
                  required
                  readOnly
                />
                <button
                  type="button"
                  onClick={handleOpenBrowser}
                  className="px-4 py-2 bg-gray-600 dark:bg-gray-700 text-white rounded-md hover:bg-gray-700 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-500"
                >
                  Browse...
                </button>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Click "Browse..." to select a directory
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Browser Start Path (optional)
              </label>
              <input
                type="text"
                value={browserStartPath}
                onChange={(e) => setBrowserStartPath(e.target.value)}
                placeholder="Leave empty to start at home directory"
                className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500"
              />
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Set a custom starting directory for the browser (e.g., /mnt, C:\Videos)
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Sort By
              </label>
              <select
                name="sortBy"
                value={formData.sortBy}
                onChange={handleChange}
                className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-white"
              >
                <option value="none">Default (filename)</option>
                <option value="duration-desc">Duration (longest first)</option>
                <option value="duration-asc">Duration (shortest first)</option>
              </select>
            </div>
          </>
        ) : (
          <>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Platform
              </label>
              <select
                name="platform"
                value={formData.platform}
                onChange={handleChange}
                className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-white"
                required
              >
                <option value="coomer">Coomer (https://coomer.su)</option>
                <option value="kemono">Kemono (https://kemono.cr)</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Service Name
              </label>
              <select
                name="serviceName"
                value={formData.serviceName}
                onChange={handleChange}
                className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-white"
                required
              >
                <option value="onlyfans">OnlyFans</option>
                <option value="patreon">Patreon</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                User ID
              </label>
              <input
                type="text"
                name="userId"
                value={formData.userId}
                onChange={handleChange}
                placeholder="12345"
                className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  From Page
                </label>
                <input
                  type="number"
                  name="from"
                  value={formData.from}
                  onChange={handleChange}
                  min="0"
                  className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  To Page
                </label>
                <input
                  type="number"
                  name="to"
                  value={formData.to}
                  onChange={handleChange}
                  min="0"
                  className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-white"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Lookahead (optional)
              </label>
              <input
                type="text"
                name="lookahead"
                value={formData.lookahead}
                onChange={handleChange}
                className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500"
              />
            </div>
          </>
        )}

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Limit (-1 for no limit)
          </label>
          <input
            type="number"
            name="limit"
            value={formData.limit}
            onChange={handleChange}
            className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-white"
          />
        </div>

        <button
          type="submit"
          className="w-full bg-blue-600 dark:bg-blue-700 text-white py-2 px-4 rounded-md hover:bg-blue-700 dark:hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900"
        >
          Start Media Stream
        </button>
      </form>

      {/* Directory Browser Modal */}
      {showDirectoryBrowser && (
        <div className="fixed inset-0 bg-black bg-opacity-50 dark:bg-opacity-70 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">Select Directory</h2>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-6">
              {browserLoading ? (
                <div className="text-center py-8 text-gray-900 dark:text-white">Loading...</div>
              ) : browserError ? (
                <div className="text-red-600 dark:text-red-400 py-4">{browserError}</div>
              ) : (
                <>
                  {/* Current Path */}
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Current Path:
                    </label>
                    <div className="px-3 py-2 bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md text-sm font-mono break-all text-gray-900 dark:text-white">
                      {browserData.currentPath || "(Home Directory)"}
                    </div>
                  </div>

                  {/* Drives (Windows only) */}
                  {browserData.drives && browserData.drives.length > 0 && (
                    <div className="mb-4">
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Drives:
                      </label>
                      <div className="flex flex-wrap gap-2">
                        {browserData.drives.map((drive) => (
                          <button
                            key={drive}
                            type="button"
                            onClick={() => handleNavigateToDirectory(drive)}
                            className="px-3 py-1 bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-200 rounded hover:bg-blue-200 dark:hover:bg-blue-800 text-sm font-medium"
                          >
                            {drive}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Parent Directory Button */}
                  {browserData.parentPath && (
                    <button
                      type="button"
                      onClick={() => handleNavigateToDirectory(browserData.parentPath!)}
                      className="w-full mb-2 px-4 py-2 text-left bg-gray-50 dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 border border-gray-300 dark:border-gray-600 rounded-md flex items-center gap-2 text-gray-900 dark:text-white"
                    >
                      <span>↑</span>
                      <span>.. (Parent Directory)</span>
                    </button>
                  )}

                  {/* Directory List */}
                  <div className="space-y-1">
                    {browserData.directories.length === 0 ? (
                      <div className="text-gray-500 dark:text-gray-400 py-4 text-center">
                        No subdirectories found
                      </div>
                    ) : (
                      browserData.directories.map((dir) => (
                        <button
                          key={dir.path}
                          type="button"
                          onClick={() => handleNavigateToDirectory(dir.path)}
                          className="w-full px-4 py-2 text-left hover:bg-gray-50 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-md flex items-center gap-2 text-gray-900 dark:text-white"
                        >
                          <span>📁</span>
                          <span className="truncate">{dir.name}</span>
                        </button>
                      ))
                    )}
                  </div>
                </>
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-2">
              <button
                type="button"
                onClick={handleCloseBrowser}
                className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-md hover:bg-gray-300 dark:hover:bg-gray-600"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSelectDirectory}
                disabled={!browserData.currentPath}
                className="px-4 py-2 bg-blue-600 dark:bg-blue-700 text-white rounded-md hover:bg-blue-700 dark:hover:bg-blue-600 disabled:bg-gray-400 dark:disabled:bg-gray-600 disabled:cursor-not-allowed"
              >
                Select This Directory
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

