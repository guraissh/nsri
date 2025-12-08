import { useState, useEffect } from "react";
import { useNavigate, useLoaderData } from "react-router";
import type { Route } from "./+types/home";
import { FolderBrowser } from "~/FolderBrowser";
import { X, Clock } from "lucide-react";

interface HistoryEntry {
  id: number;
  type: "directory" | "user";
  value: string;
  platform?: string;
  service?: string;
  last_used: number;
  use_count: number;
}

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

  // History state
  const [recentDirectories, setRecentDirectories] = useState<HistoryEntry[]>([]);
  const [recentUsers, setRecentUsers] = useState<HistoryEntry[]>([]);

  // Load history on mount
  useEffect(() => {
    fetch("/api/history")
      .then((res) => res.json())
      .then((data) => {
        setRecentDirectories(data.directories || []);
        setRecentUsers(data.users || []);
      })
      .catch((err) => console.error("Failed to load history:", err));
  }, []);

  // Save to history helper
  const saveToHistory = async (type: "directory" | "user", value: string, platform?: string, service?: string) => {
    try {
      await fetch("/api/history", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, value, platform, service }),
      });
      // Refresh history
      const res = await fetch("/api/history");
      const data = await res.json();
      setRecentDirectories(data.directories || []);
      setRecentUsers(data.users || []);
    } catch (err) {
      console.error("Failed to save history:", err);
    }
  };

  // Delete history entry
  const deleteHistoryEntry = async (id: number) => {
    try {
      await fetch("/api/history", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      setRecentDirectories((prev) => prev.filter((e) => e.id !== id));
      setRecentUsers((prev) => prev.filter((e) => e.id !== id));
    } catch (err) {
      console.error("Failed to delete history:", err);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    console.log("Form Data:", formData);
    if (formData.sourceType === "local") {
      // Save directory to history (fire and forget, don't block navigation)
      fetch("/api/history", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "directory", value: formData.directoryPath }),
      }).catch((err) => console.error("Failed to save history:", err));

      // For local directory source
      const params = new URLSearchParams({
        sourceType: "local",
        directoryPath: formData.directoryPath,
        limit: formData.limit,
        sortBy: formData.sortBy,
      });
      navigate(`/media?${params.toString()}`);
    } else {
      // Save user to history (fire and forget, don't block navigation)
      fetch("/api/history", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "user",
          value: formData.userId,
          platform: formData.platform,
          service: formData.serviceName
        }),
      }).catch((err) => console.error("Failed to save history:", err));

      // For API source
      const baseDomain =
        formData.platform === "kemono"
          ? "https://kemono.cr"
          : "https://coomer.st";
      const baseApiPath = "/api/v1";

      const params = new URLSearchParams({
        ...formData,
        baseDomain,
        baseApiPath,
      });
      navigate(`/media?${params.toString()}`);
    }
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  // Directory browser functions
  const handleOpenBrowser = () => {
    setShowDirectoryBrowser(true);
  };

  const handleSelectDirectory = (path: string) => {
    setFormData({
      ...formData,
      directoryPath: path,
    });
    setShowDirectoryBrowser(false);
  };

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <h1 className="text-3xl font-bold mb-6 text-gray-900 dark:text-white">
        Media Stream Configuration
      </h1>

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
                Set a custom starting directory for the browser (e.g., /mnt,
                C:\Videos)
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
                <option value="coomer">Coomer (https://coomer.st)</option>
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

      {/* Recent History */}
      {(recentDirectories.length > 0 || recentUsers.length > 0) && (
        <div className="mt-8 space-y-6">
          {/* Recent Directories */}
          {recentDirectories.length > 0 && (
            <div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                <Clock size={18} />
                Recent Directories
              </h2>
              <div className="space-y-2">
                {recentDirectories.map((entry) => (
                  <div
                    key={entry.id}
                    className="flex items-center gap-2 p-2 bg-gray-100 dark:bg-gray-800 rounded-md group"
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setFormData({
                          ...formData,
                          sourceType: "local",
                          directoryPath: entry.value,
                        });
                      }}
                      className="flex-1 text-left text-sm text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 truncate"
                      title={entry.value}
                    >
                      {entry.value}
                    </button>
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      {entry.use_count}x
                    </span>
                    <button
                      type="button"
                      onClick={() => deleteHistoryEntry(entry.id)}
                      className="p-1 text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                      title="Remove from history"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recent Users */}
          {recentUsers.length > 0 && (
            <div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                <Clock size={18} />
                Recent Users
              </h2>
              <div className="space-y-2">
                {recentUsers.map((entry) => (
                  <div
                    key={entry.id}
                    className="flex items-center gap-2 p-2 bg-gray-100 dark:bg-gray-800 rounded-md group"
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setFormData({
                          ...formData,
                          sourceType: "api",
                          platform: entry.platform || "coomer",
                          serviceName: entry.service || "onlyfans",
                          userId: entry.value,
                        });
                      }}
                      className="flex-1 text-left text-sm text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400"
                    >
                      <span className="font-medium">{entry.value}</span>
                      <span className="text-xs text-gray-500 dark:text-gray-400 ml-2">
                        ({entry.platform}/{entry.service})
                      </span>
                    </button>
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      {entry.use_count}x
                    </span>
                    <button
                      type="button"
                      onClick={() => deleteHistoryEntry(entry.id)}
                      className="p-1 text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                      title="Remove from history"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Directory Browser Modal */}
      {showDirectoryBrowser && (
        <div
          className="fixed inset-0 bg-black bg-opacity-95 z-50 overflow-y-auto"
          onClick={() => setShowDirectoryBrowser(false)}
        >
          <div onClick={(e) => e.stopPropagation()}>
            <FolderBrowser
              onSelectPath={handleSelectDirectory}
              initialPath={browserStartPath || formData.directoryPath}
            />
          </div>
        </div>
      )}
    </div>
  );
}
