import { useState, useEffect } from "react";
import { useNavigate, useLoaderData } from "react-router";
import type { Route } from "./+types/home";
import { FolderBrowser } from "~/FolderBrowser";
import { PlaylistManager } from "~/PlaylistManager";
import { X, Clock, Folder, ListVideo, Edit2, Check, Globe, Trash2 } from "lucide-react";

interface HistoryEntry {
  id: number;
  type: "directory" | "user" | "redgifs" | "bunkr";
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
    // RedGifs fields
    rgUsername: "",
    rgTags: "",
    rgOrder: "latest",
    rgPage: "1",
    rgCount: "200",
    // Playlist fields
    playlistId: "",
    // Bunkr fields
    bunkrAlbumUrl: "",
  });

  // Directory browser state
  const [showDirectoryBrowser, setShowDirectoryBrowser] = useState(false);
  const [browserStartPath, setBrowserStartPath] = useState("");

  // History state
  const [recentDirectories, setRecentDirectories] = useState<HistoryEntry[]>([]);
  const [recentUsers, setRecentUsers] = useState<HistoryEntry[]>([]);
  const [recentRedgifs, setRecentRedgifs] = useState<HistoryEntry[]>([]);
  const [recentBunkr, setRecentBunkr] = useState<HistoryEntry[]>([]);
  const [showAllDirectories, setShowAllDirectories] = useState(false);
  const [showAllUsers, setShowAllUsers] = useState(false);
  const [showAllRedgifs, setShowAllRedgifs] = useState(false);
  const [showAllBunkr, setShowAllBunkr] = useState(false);

  // Playlist state
  const [playlists, setPlaylists] = useState<Array<{ id: number; name: string; description?: string; videoCount?: number }>>([]);
  const [showPlaylistManager, setShowPlaylistManager] = useState(false);
  const [editingPlaylist, setEditingPlaylist] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");

  // RedGifs tags state
  const [availableTags, setAvailableTags] = useState<string[]>([]);
  const [loadingTags, setLoadingTags] = useState(false);
  const [showTagDropdown, setShowTagDropdown] = useState(false);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [excludedTags, setExcludedTags] = useState<string[]>([]);
  const [tagMode, setTagMode] = useState<'include' | 'exclude'>('include');
  const [videoTags, setVideoTags] = useState<Record<string, string[]>>({});
  const [allTagCounts, setAllTagCounts] = useState<Record<string, number>>({});
  const [filteredTagCounts, setFilteredTagCounts] = useState<Record<string, number>>({});

  // Cache management state
  const [bunkrCacheStats, setBunkrCacheStats] = useState<any>(null);
  const [redgifsCacheStats, setRedgifsCacheStats] = useState<any>(null);
  const [loadingCacheStats, setLoadingCacheStats] = useState(false);

  // Load history on mount and set default source
  useEffect(() => {
    fetch("/api/history")
      .then((res) => res.json())
      .then((data) => {
        const directories = data.directories || [];
        const users = data.users || [];
        const redgifs = data.redgifs || [];
        const bunkr = data.bunkr || [];

        setRecentDirectories(directories);
        setRecentUsers(users);
        setRecentRedgifs(redgifs);
        setRecentBunkr(bunkr);

        // Find the most recent entry across all history types
        const allHistory = [
          ...directories.map(d => ({ ...d, sourceType: "local" })),
          ...users.map(u => ({ ...u, sourceType: "api" })),
          ...redgifs.map(r => ({ ...r, sourceType: "redgifs" })),
          ...bunkr.map(b => ({ ...b, sourceType: "bunkr" })),
        ].sort((a, b) => b.last_used - a.last_used);

        // Prepopulate from the most recent history entry
        if (allHistory.length > 0) {
          const mostRecent = allHistory[0];
          if (mostRecent.sourceType === "local") {
            setFormData(prev => ({
              ...prev,
              sourceType: "local",
              directoryPath: mostRecent.value,
            }));
          } else if (mostRecent.sourceType === "api") {
            setFormData(prev => ({
              ...prev,
              sourceType: "api",
              platform: mostRecent.platform || "coomer",
              serviceName: mostRecent.service || "onlyfans",
              userId: mostRecent.value,
            }));
          } else if (mostRecent.sourceType === "redgifs") {
            const parts = mostRecent.value.split(":");
            setFormData(prev => ({
              ...prev,
              sourceType: "redgifs",
              rgUsername: parts[0] || "",
              rgTags: parts[1] || "",
              rgOrder: parts[2] || "latest",
            }));
          } else if (mostRecent.sourceType === "bunkr") {
            setFormData(prev => ({
              ...prev,
              sourceType: "bunkr",
              bunkrAlbumUrl: mostRecent.value,
            }));
          }
        }
      })
      .catch((err) => console.error("Failed to load history:", err));
  }, []);

  // Load playlists on mount
  useEffect(() => {
    fetch("/api/playlists")
      .then((res) => res.json())
      .then((data) => {
        setPlaylists(data.playlists || []);
      })
      .catch((err) => console.error("Failed to load playlists:", err));
  }, []);

  // Fetch RedGifs tags when username changes
  useEffect(() => {
    if (formData.rgUsername && formData.sourceType === "redgifs") {
      setLoadingTags(true);

      fetch(`/api/redgifs-tags?username=${encodeURIComponent(formData.rgUsername)}`)
        .then((res) => res.json())
        .then((data) => {
          setAvailableTags(data.tags || []);
          setVideoTags(data.video_tags || {});
          setAllTagCounts(data.tag_counts || {});
          setFilteredTagCounts(data.tag_counts || {});
          setLoadingTags(false);
        })
        .catch((err) => {
          console.error("Failed to load tags:", err);
          setAvailableTags([]);
          setVideoTags({});
          setAllTagCounts({});
          setFilteredTagCounts({});
          setLoadingTags(false);
        });
    } else {
      setAvailableTags([]);
      setVideoTags({});
      setAllTagCounts({});
      setFilteredTagCounts({});
    }
  }, [formData.rgUsername, formData.sourceType]);


  // Sync selectedTags with formData.rgTags
  useEffect(() => {
    if (formData.rgTags) {
      setSelectedTags(formData.rgTags.split(",").map(t => t.trim()).filter(t => t.length > 0));
    } else {
      setSelectedTags([]);
    }
  }, [formData.rgTags]);

  // Recalculate filtered tags when selected/excluded tags change
  useEffect(() => {
    if (Object.keys(videoTags).length === 0) {
      return; // No data yet
    }

    if (selectedTags.length === 0 && excludedTags.length === 0) {
      // No filters, show all tags
      setFilteredTagCounts(allTagCounts);
      return;
    }

    // Find videos that have ALL selected tags AND NONE of the excluded tags
    const matchingVideos = Object.entries(videoTags).filter(([videoId, tags]) => {
      const hasAllIncluded = selectedTags.length === 0 || selectedTags.every(selectedTag => tags.includes(selectedTag));
      const hasNoneExcluded = excludedTags.length === 0 || !excludedTags.some(excludedTag => tags.includes(excludedTag));
      return hasAllIncluded && hasNoneExcluded;
    });

    // Count tags from matching videos only
    const newTagCounts: Record<string, number> = {};
    matchingVideos.forEach(([videoId, tags]) => {
      tags.forEach(tag => {
        // Don't count already selected or excluded tags
        if (!selectedTags.includes(tag) && !excludedTags.includes(tag)) {
          newTagCounts[tag] = (newTagCounts[tag] || 0) + 1;
        }
      });
    });

    // Sort by count (descending) then alphabetically
    const sorted = Object.entries(newTagCounts)
      .sort((a, b) => b[1] - a[1] || a[0].toLowerCase().localeCompare(b[0].toLowerCase()));

    const sortedCounts: Record<string, number> = {};
    sorted.forEach(([tag, count]) => {
      sortedCounts[tag] = count;
    });

    setFilteredTagCounts(sortedCounts);
  }, [selectedTags, excludedTags, videoTags, allTagCounts]);

  // Close tag dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.tag-dropdown-container')) {
        setShowTagDropdown(false);
      }
    };

    if (showTagDropdown) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [showTagDropdown]);

  // Fetch cache stats on mount
  useEffect(() => {
    fetchCacheStats();
  }, []);

  const fetchCacheStats = async () => {
    setLoadingCacheStats(true);
    try {
      const [bunkr, rg] = await Promise.all([
        fetch('http://localhost:8001/cache-stats').then(r => r.json()).catch(() => null),
        fetch('http://localhost:8000/cache-stats').then(r => r.json()).catch(() => null)
      ]);
      setBunkrCacheStats(bunkr);
      setRedgifsCacheStats(rg);
    } catch (error) {
      console.error('Error fetching cache stats:', error);
    } finally {
      setLoadingCacheStats(false);
    }
  };

  const clearBunkrCache = async () => {
    if (!confirm('Are you sure you want to clear all Bunkr cached videos?')) {
      return;
    }
    try {
      const response = await fetch('http://localhost:8001/clear-all-cache', {
        method: 'POST'
      });
      if (response.ok) {
        const result = await response.json();
        alert(`Cleared ${result.files_deleted} files, freed ${result.mb_freed} MB`);
        fetchCacheStats();
      } else {
        alert('Failed to clear cache');
      }
    } catch (error) {
      console.error('Error clearing Bunkr cache:', error);
      alert('Error clearing cache');
    }
  };

  const clearRedgifsCache = async () => {
    if (!confirm('Are you sure you want to clear all RedGifs cached videos?')) {
      return;
    }
    try {
      const response = await fetch('http://localhost:8000/clear-all-cache', {
        method: 'POST'
      });
      if (response.ok) {
        const result = await response.json();
        alert(`Cleared ${result.files_deleted} files, freed ${result.mb_freed} MB`);
        fetchCacheStats();
      } else {
        alert('Failed to clear cache');
      }
    } catch (error) {
      console.error('Error clearing RedGifs cache:', error);
      alert('Error clearing cache');
    }
  };

  // Helper function to prepopulate form from latest history entry
  const prepopulateFromHistory = (sourceType: string) => {
    if (sourceType === "local" && recentDirectories.length > 0) {
      const latest = recentDirectories[0];
      setFormData({
        ...formData,
        sourceType: "local",
        directoryPath: latest.value,
      });
    } else if (sourceType === "api" && recentUsers.length > 0) {
      const latest = recentUsers[0];
      setFormData({
        ...formData,
        sourceType: "api",
        platform: latest.platform || "coomer",
        serviceName: latest.service || "onlyfans",
        userId: latest.value,
      });
    } else if (sourceType === "redgifs" && recentRedgifs.length > 0) {
      const latest = recentRedgifs[0];
      // Parse the value field which contains "username:tags:order" format
      const parts = latest.value.split(":");
      setFormData({
        ...formData,
        sourceType: "redgifs",
        rgUsername: parts[0] || "",
        rgTags: parts[1] || "",
        rgOrder: parts[2] || "latest",
      });
    } else if (sourceType === "bunkr" && recentBunkr.length > 0) {
      const latest = recentBunkr[0];
      setFormData({
        ...formData,
        sourceType: "bunkr",
        bunkrAlbumUrl: latest.value,
      });
    } else {
      // No history, just change source type
      setFormData({ ...formData, sourceType });
    }
  };

  // Save to history helper
  const saveToHistory = async (
    type: "directory" | "user" | "redgifs" | "bunkr",
    value: string,
    platform?: string,
    service?: string,
    username?: string,
    tags?: string,
    order?: string
  ) => {
    try {
      await fetch("/api/history", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, value, platform, service, username, tags, order }),
      });
      // Refresh history
      const res = await fetch("/api/history");
      const data = await res.json();
      setRecentDirectories(data.directories || []);
      setRecentUsers(data.users || []);
      setRecentRedgifs(data.redgifs || []);
      setRecentBunkr(data.bunkr || []);
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
      setRecentRedgifs((prev) => prev.filter((e) => e.id !== id));
      setRecentBunkr((prev) => prev.filter((e) => e.id !== id));
    } catch (err) {
      console.error("Failed to delete history:", err);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    console.log("Form Data:", formData);
    if (formData.sourceType === "playlist") {
      // For playlist source
      const params = new URLSearchParams({
        sourceType: "playlist",
        playlistId: formData.playlistId,
      });
      navigate(`/media?${params.toString()}`);
    } else if (formData.sourceType === "local") {
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
    } else if (formData.sourceType === "redgifs") {
      // Save RedGifs search to history (fire and forget, don't block navigation)
      fetch("/api/history", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "redgifs",
          username: formData.rgUsername,
          tags: formData.rgTags,
          order: formData.rgOrder,
        }),
      }).catch((err) => console.error("Failed to save history:", err));

      // For RedGifs source
      const params = new URLSearchParams({
        sourceType: "redgifs",
        rgUsername: formData.rgUsername,
        rgTags: formData.rgTags,
        rgOrder: formData.rgOrder,
        rgPage: formData.rgPage,
        rgCount: formData.rgCount,
        limit: formData.limit,
      });
      navigate(`/media?${params.toString()}`);
    } else if (formData.sourceType === "bunkr") {
      // Save Bunkr to history (fire and forget, don't block navigation)
      fetch("/api/history", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "bunkr",
          value: formData.bunkrAlbumUrl,
        }),
      }).catch((err) => console.error("Failed to save history:", err));

      // For Bunkr source
      const params = new URLSearchParams({
        sourceType: "bunkr",
        bunkrAlbumUrl: formData.bunkrAlbumUrl,
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

  // Playlist editing handlers
  const startEditingPlaylist = (playlist: { id: number; name: string; description?: string }) => {
    setEditingPlaylist(playlist.id);
    setEditName(playlist.name);
    setEditDescription(playlist.description || "");
  };

  const cancelEditingPlaylist = () => {
    setEditingPlaylist(null);
    setEditName("");
    setEditDescription("");
  };

  const savePlaylistEdits = async (playlistId: number) => {
    try {
      const response = await fetch("/api/playlists", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update",
          playlistId,
          name: editName,
          description: editDescription,
        }),
      });

      if (response.ok) {
        // Reload playlists
        const playlistsResponse = await fetch("/api/playlists");
        const data = await playlistsResponse.json();
        setPlaylists(data.playlists || []);
        cancelEditingPlaylist();
      } else {
        console.error("Failed to update playlist");
      }
    } catch (error) {
      console.error("Error updating playlist:", error);
    }
  };

  // RedGifs tag selection handlers
  const toggleTag = (tag: string) => {
    if (tagMode === 'include') {
      const newSelectedTags = selectedTags.includes(tag)
        ? selectedTags.filter(t => t !== tag)
        : [...selectedTags, tag];

      setSelectedTags(newSelectedTags);
      setFormData({
        ...formData,
        rgTags: newSelectedTags.join(","),
      });
    } else {
      const newExcludedTags = excludedTags.includes(tag)
        ? excludedTags.filter(t => t !== tag)
        : [...excludedTags, tag];

      setExcludedTags(newExcludedTags);
    }
  };

  const clearAllTags = () => {
    if (tagMode === 'include') {
      setSelectedTags([]);
      setFormData({
        ...formData,
        rgTags: "",
      });
    } else {
      setExcludedTags([]);
    }
  };

  const clearAllIncludedTags = () => {
    setSelectedTags([]);
    setFormData({
      ...formData,
      rgTags: "",
    });
  };

  const clearAllExcludedTags = () => {
    setExcludedTags([]);
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

      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
            Select Source
          </label>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {/* Kemono/Coomer */}
            <button
              type="button"
              onClick={() => prepopulateFromHistory("api")}
              className={`relative p-6 rounded-lg border-2 transition-all hover:scale-105 ${formData.sourceType === "api"
                ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20"
                : "border-gray-300 dark:border-gray-600 hover:border-blue-400"
                }`}
            >
              <div className="flex flex-col items-center gap-2">
                <img
                  src="https://code.coomer.su/logo.png?v=1674177859000"
                  alt="Kemono/Coomer"
                  className="w-16 h-16 object-contain"
                />
                <span className="text-sm font-medium text-gray-900 dark:text-white">
                  Kemono
                </span>
              </div>
              {formData.sourceType === "api" && (
                <div className="absolute top-2 right-2 w-4 h-4 bg-blue-500 rounded-full" />
              )}
            </button>

            {/* RedGifs */}
            <button
              type="button"
              onClick={() => prepopulateFromHistory("redgifs")}
              className={`relative p-6 rounded-lg border-2 transition-all hover:scale-105 ${formData.sourceType === "redgifs"
                ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20"
                : "border-gray-300 dark:border-gray-600 hover:border-blue-400"
                }`}
            >
              <div className="flex flex-col items-center gap-2">
                <img
                  src="https://avatars.githubusercontent.com/u/64160480?s=280&v=4"
                  alt="RedGifs"
                  className="w-16 h-16 object-contain rounded-lg"
                />
                <span className="text-sm font-medium text-gray-900 dark:text-white">
                  RedGifs
                </span>
              </div>
              {formData.sourceType === "redgifs" && (
                <div className="absolute top-2 right-2 w-4 h-4 bg-blue-500 rounded-full" />
              )}
            </button>

            {/* Local Directory */}
            <button
              type="button"
              onClick={() => prepopulateFromHistory("local")}
              className={`relative p-6 rounded-lg border-2 transition-all hover:scale-105 ${formData.sourceType === "local"
                ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20"
                : "border-gray-300 dark:border-gray-600 hover:border-blue-400"
                }`}
            >
              <div className="flex flex-col items-center gap-2">
                <Folder className="w-16 h-16 text-gray-700 dark:text-gray-300" strokeWidth={1.5} />
                <span className="text-sm font-medium text-gray-900 dark:text-white">
                  Local Files
                </span>
              </div>
              {formData.sourceType === "local" && (
                <div className="absolute top-2 right-2 w-4 h-4 bg-blue-500 rounded-full" />
              )}
            </button>

            {/* Playlist */}
            <button
              type="button"
              onClick={() => setFormData({ ...formData, sourceType: "playlist" })}
              className={`relative p-6 rounded-lg border-2 transition-all hover:scale-105 ${formData.sourceType === "playlist"
                ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20"
                : "border-gray-300 dark:border-gray-600 hover:border-blue-400"
                }`}
            >
              <div className="flex flex-col items-center gap-2">
                <ListVideo className="w-16 h-16 text-gray-700 dark:text-gray-300" strokeWidth={1.5} />
                <span className="text-sm font-medium text-gray-900 dark:text-white">
                  Playlist
                </span>
              </div>
              {formData.sourceType === "playlist" && (
                <div className="absolute top-2 right-2 w-4 h-4 bg-blue-500 rounded-full" />
              )}
            </button>

            {/* Bunkr */}
            <button
              type="button"
              onClick={() => prepopulateFromHistory("bunkr")}
              className={`relative p-6 rounded-lg border-2 transition-all hover:scale-105 ${formData.sourceType === "bunkr"
                ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20"
                : "border-gray-300 dark:border-gray-600 hover:border-blue-400"
                }`}
            >
              <div className="flex flex-col items-center gap-2">
                <Globe className="w-16 h-16 text-gray-700 dark:text-gray-300" strokeWidth={1.5} />
                <span className="text-sm font-medium text-gray-900 dark:text-white">
                  Bunkr
                </span>
              </div>
              {formData.sourceType === "bunkr" && (
                <div className="absolute top-2 right-2 w-4 h-4 bg-blue-500 rounded-full" />
              )}
            </button>
          </div>
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
        ) : formData.sourceType === "playlist" ? (
          <>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                Select Playlist
              </label>

              {playlists.length === 0 ? (
                <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                  No playlists yet. Create one using the button below.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
                  {playlists.map((playlist) => (
                    <div
                      key={playlist.id}
                      className={`p-4 rounded-lg border-2 transition-all ${formData.playlistId === String(playlist.id)
                          ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20"
                          : "border-gray-300 dark:border-gray-600"
                        }`}
                    >
                      {editingPlaylist === playlist.id ? (
                        // Edit mode
                        <div className="space-y-3">
                          <input
                            type="text"
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            className="w-full px-2 py-1 text-sm font-semibold bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded text-gray-900 dark:text-white"
                            placeholder="Playlist name"
                          />
                          <textarea
                            value={editDescription}
                            onChange={(e) => setEditDescription(e.target.value)}
                            className="w-full px-2 py-1 text-sm bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded text-gray-600 dark:text-gray-400 resize-none"
                            placeholder="Description (optional)"
                            rows={2}
                          />
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => savePlaylistEdits(playlist.id)}
                              className="flex-1 px-3 py-1.5 bg-blue-500 text-white rounded text-sm hover:bg-blue-600 flex items-center justify-center gap-1"
                            >
                              <Check size={14} />
                              Save
                            </button>
                            <button
                              type="button"
                              onClick={cancelEditingPlaylist}
                              className="px-3 py-1.5 bg-gray-500 text-white rounded text-sm hover:bg-gray-600"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        // View mode
                        <button
                          type="button"
                          onClick={() => setFormData({ ...formData, playlistId: String(playlist.id) })}
                          className="w-full text-left"
                        >
                          <div className="flex items-start justify-between mb-2">
                            <h3 className="font-semibold text-gray-900 dark:text-white truncate flex-1">
                              {playlist.name}
                            </h3>
                            <div className="flex items-center gap-2 ml-2 flex-shrink-0">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  startEditingPlaylist(playlist);
                                }}
                                className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded"
                              >
                                <Edit2 size={14} className="text-gray-600 dark:text-gray-400" />
                              </button>
                              {formData.playlistId === String(playlist.id) && (
                                <div className="w-4 h-4 bg-blue-500 rounded-full" />
                              )}
                            </div>
                          </div>
                          {playlist.description && (
                            <p className="text-sm text-gray-600 dark:text-gray-400 mb-2 line-clamp-2">
                              {playlist.description}
                            </p>
                          )}
                          <div className="flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400">
                            <ListVideo size={14} />
                            <span>{playlist.videoCount || 0} video{playlist.videoCount !== 1 ? 's' : ''}</span>
                          </div>
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setShowPlaylistManager(true)}
                className="flex-1 px-4 py-2 bg-gray-600 dark:bg-gray-700 text-white rounded-md hover:bg-gray-700 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-500"
              >
                Manage Playlists
              </button>
            </div>
          </>
        ) : formData.sourceType === "redgifs" ? (
          <>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Username
              </label>
              <input
                type="text"
                name="rgUsername"
                value={formData.rgUsername}
                onChange={handleChange}
                placeholder="Enter RedGifs username"
                className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500"
              />
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Leave empty to search by tags only
              </p>
            </div>

            <div className="relative tag-dropdown-container">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Tags (optional)
              </label>

              {/* Selected tags display */}
              <div
                onClick={() => formData.rgUsername && setShowTagDropdown(!showTagDropdown)}
                className={`min-h-[42px] w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md focus-within:ring-2 focus-within:ring-blue-500 text-gray-900 dark:text-white cursor-pointer ${!formData.rgUsername ? 'opacity-50 cursor-not-allowed' : ''
                  }`}
              >
                {selectedTags.length > 0 || excludedTags.length > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {/* Include tags (green) */}
                    {selectedTags.map(tag => (
                      <span
                        key={tag}
                        className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200 rounded text-sm"
                      >
                        +{tag}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedTags(selectedTags.filter(t => t !== tag));
                            setFormData({
                              ...formData,
                              rgTags: selectedTags.filter(t => t !== tag).join(","),
                            });
                          }}
                          className="hover:text-green-600 dark:hover:text-green-400"
                        >
                          <X size={14} />
                        </button>
                      </span>
                    ))}
                    {/* Exclude tags (red) */}
                    {excludedTags.map(tag => (
                      <span
                        key={tag}
                        className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200 rounded text-sm"
                      >
                        -{tag}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setExcludedTags(excludedTags.filter(t => t !== tag));
                          }}
                          className="hover:text-red-600 dark:hover:text-red-400"
                        >
                          <X size={14} />
                        </button>
                      </span>
                    ))}
                  </div>
                ) : (
                  <span className="text-gray-400 dark:text-gray-500">
                    {formData.rgUsername ? 'Click to select tags...' : 'Enter username first'}
                  </span>
                )}
              </div>

              {/* Tag dropdown */}
              {showTagDropdown && formData.rgUsername && (
                <div className="absolute z-10 mt-1 w-full bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md shadow-lg max-h-60 overflow-y-auto">
                  {loadingTags ? (
                    <div className="p-4 text-center text-gray-500 dark:text-gray-400">
                      Loading tags...
                    </div>
                  ) : Object.keys(filteredTagCounts).length === 0 ? (
                    <div className="p-4 text-center text-gray-500 dark:text-gray-400">
                      {selectedTags.length > 0
                        ? "No matching tags found. Try removing some filters."
                        : "No tags found for this user"}
                    </div>
                  ) : (
                    <>
                      {/* Mode toggle and stats */}
                      <div className="sticky top-0 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 p-2 space-y-2">
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => setTagMode('include')}
                            className={`flex-1 px-3 py-1.5 rounded text-sm font-medium transition-colors ${tagMode === 'include'
                                ? 'bg-green-500 text-white'
                                : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
                              }`}
                          >
                            + Include ({selectedTags.length})
                          </button>
                          <button
                            type="button"
                            onClick={() => setTagMode('exclude')}
                            className={`flex-1 px-3 py-1.5 rounded text-sm font-medium transition-colors ${tagMode === 'exclude'
                                ? 'bg-red-500 text-white'
                                : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
                              }`}
                          >
                            - Exclude ({excludedTags.length})
                          </button>
                        </div>
                        <div className="flex justify-between items-center text-sm">
                          <span className="text-gray-600 dark:text-gray-400">
                            {selectedTags.length + excludedTags.length > 0 && (
                              <span>
                                {Object.values(filteredTagCounts).reduce((a, b) => Math.max(a, b), 0)} videos match
                              </span>
                            )}
                          </span>
                          {(tagMode === 'include' && selectedTags.length > 0) || (tagMode === 'exclude' && excludedTags.length > 0) ? (
                            <button
                              type="button"
                              onClick={clearAllTags}
                              className="text-blue-600 dark:text-blue-400 hover:underline"
                            >
                              Clear {tagMode === 'include' ? 'included' : 'excluded'}
                            </button>
                          ) : null}
                        </div>
                      </div>
                      <div className="p-1">
                        {Object.entries(filteredTagCounts).map(([tag, count]) => {
                          const isChecked = tagMode === 'include' ? selectedTags.includes(tag) : excludedTags.includes(tag);
                          return (
                            <label
                              key={tag}
                              className={`flex items-center justify-between gap-2 px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded cursor-pointer ${isChecked
                                  ? tagMode === 'include'
                                    ? 'bg-green-50 dark:bg-green-900/20'
                                    : 'bg-red-50 dark:bg-red-900/20'
                                  : ''
                                }`}
                            >
                              <div className="flex items-center gap-2 flex-1 min-w-0">
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={() => toggleTag(tag)}
                                  className={`w-4 h-4 rounded focus:ring-blue-500 flex-shrink-0 ${tagMode === 'include' ? 'text-green-600' : 'text-red-600'
                                    }`}
                                />
                                <span className="text-sm text-gray-900 dark:text-white truncate">
                                  {tagMode === 'include' ? '+' : '-'}{tag}
                                </span>
                              </div>
                              <span className="text-xs text-gray-500 dark:text-gray-400 bg-gray-200 dark:bg-gray-700 px-2 py-0.5 rounded flex-shrink-0">
                                {count}
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    </>
                  )}
                </div>
              )}

              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                {formData.rgUsername
                  ? `Select tags from ${formData.rgUsername}'s content`
                  : 'Enter username to load available tags'}
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Sort Order
              </label>
              <select
                name="rgOrder"
                value={formData.rgOrder}
                onChange={handleChange}
                className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-white"
              >
                <option value="latest">Latest</option>
                <option value="trending">Trending</option>
                <option value="top">Top (All Time)</option>
                <option value="top28">Top (Last 28 Days)</option>
                <option value="duration-desc">Duration (Longest)</option>
                <option value="duration-asc">Duration (Shortest)</option>
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Page
                </label>
                <input
                  type="number"
                  name="rgPage"
                  value={formData.rgPage}
                  onChange={handleChange}
                  min="1"
                  className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Count per page
                </label>
                <input
                  type="number"
                  name="rgCount"
                  value={formData.rgCount}
                  onChange={handleChange}
                  min="50"
                  step="50"
                  className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-white"
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Counts over 100 will fetch from multiple pages
                </p>
              </div>
            </div>
          </>
        ) : formData.sourceType === "bunkr" ? (
          <>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Album URL
              </label>
              <input
                type="text"
                name="bunkrAlbumUrl"
                value={formData.bunkrAlbumUrl}
                onChange={handleChange}
                placeholder="https://bunkr.is/a/..."
                className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500"
                required
              />
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Enter the full URL of the Bunkr album
              </p>
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

      {/* Cache Management */}
      <div className="mt-8">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
          <Trash2 size={18} />
          Cache Management
        </h2>

        {loadingCacheStats ? (
          <div className="text-center py-4 text-gray-500 dark:text-gray-400">
            Loading cache statistics...
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Bunkr Cache */}
            <div className="p-4 bg-gray-100 dark:bg-gray-800 rounded-lg">
              <h3 className="font-semibold text-gray-900 dark:text-white mb-3">Bunkr Cache</h3>
              {bunkrCacheStats ? (
                <>
                  <div className="space-y-2 text-sm text-gray-700 dark:text-gray-300 mb-4">
                    <div className="flex justify-between">
                      <span>Total Files:</span>
                      <span className="font-medium">{bunkrCacheStats.total_files}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Verified:</span>
                      <span className="font-medium text-green-600 dark:text-green-400">{bunkrCacheStats.verified_files}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Unverified:</span>
                      <span className="font-medium text-yellow-600 dark:text-yellow-400">{bunkrCacheStats.unverified_files}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Size Used:</span>
                      <span className="font-medium">{bunkrCacheStats.total_mb} MB / {bunkrCacheStats.max_cache_mb} MB</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Max File Size:</span>
                      <span className="font-medium">{bunkrCacheStats.max_file_mb} MB</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={clearBunkrCache}
                    className="w-full px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500"
                  >
                    Clear Bunkr Cache
                  </button>
                </>
              ) : (
                <div className="text-sm text-gray-500 dark:text-gray-400">
                  Unable to connect to Bunkr backend
                </div>
              )}
            </div>

            {/* RedGifs Cache */}
            <div className="p-4 bg-gray-100 dark:bg-gray-800 rounded-lg">
              <h3 className="font-semibold text-gray-900 dark:text-white mb-3">RedGifs Cache</h3>
              {redgifsCacheStats ? (
                <>
                  <div className="space-y-2 text-sm text-gray-700 dark:text-gray-300 mb-4">
                    <div className="flex justify-between">
                      <span>Total Files:</span>
                      <span className="font-medium">{redgifsCacheStats.total_files}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Verified:</span>
                      <span className="font-medium text-green-600 dark:text-green-400">{redgifsCacheStats.verified_files}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Unverified:</span>
                      <span className="font-medium text-yellow-600 dark:text-yellow-400">{redgifsCacheStats.unverified_files}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Size Used:</span>
                      <span className="font-medium">{redgifsCacheStats.total_mb} MB / {redgifsCacheStats.max_cache_mb} MB</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Max File Size:</span>
                      <span className="font-medium">{redgifsCacheStats.max_file_mb} MB</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={clearRedgifsCache}
                    className="w-full px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500"
                  >
                    Clear RedGifs Cache
                  </button>
                </>
              ) : (
                <div className="text-sm text-gray-500 dark:text-gray-400">
                  Unable to connect to RedGifs backend
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Recent History */}
      {(formData.sourceType === "local" && recentDirectories.length > 0) && (
        <div className="mt-8">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
            <Clock size={18} />
            Recent Directories
          </h2>
          <div className="space-y-2">
            {(showAllDirectories ? recentDirectories : recentDirectories.slice(0, 5)).map((entry) => (
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
          {recentDirectories.length > 5 && (
            <button
              type="button"
              onClick={() => setShowAllDirectories(!showAllDirectories)}
              className="mt-2 text-sm text-blue-600 dark:text-blue-400 hover:underline"
            >
              {showAllDirectories ? "Show less" : `Show ${recentDirectories.length - 5} more`}
            </button>
          )}
        </div>
      )}

      {formData.sourceType === "api" && recentUsers.length > 0 && (
        <div className="mt-8">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
            <Clock size={18} />
            Recent Users
          </h2>
          <div className="space-y-2">
            {(showAllUsers ? recentUsers : recentUsers.slice(0, 5)).map((entry) => (
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
          {recentUsers.length > 5 && (
            <button
              type="button"
              onClick={() => setShowAllUsers(!showAllUsers)}
              className="mt-2 text-sm text-blue-600 dark:text-blue-400 hover:underline"
            >
              {showAllUsers ? "Show less" : `Show ${recentUsers.length - 5} more`}
            </button>
          )}
        </div>
      )}

      {formData.sourceType === "redgifs" && recentRedgifs.length > 0 && (
        <div className="mt-8">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
            <Clock size={18} />
            Recent RedGifs Searches
          </h2>
          <div className="space-y-2">
            {(showAllRedgifs ? recentRedgifs : recentRedgifs.slice(0, 5)).map((entry) => {
              const isTagSearch = entry.value.startsWith("tags:");
              const displayValue = isTagSearch ? entry.value.substring(5) : entry.value;
              const tags = entry.platform || "";
              const order = entry.service || "latest";

              return (
                <div
                  key={entry.id}
                  className="flex items-center gap-2 p-2 bg-gray-100 dark:bg-gray-800 rounded-md group"
                >
                  <button
                    type="button"
                    onClick={() => {
                      setFormData({
                        ...formData,
                        sourceType: "redgifs",
                        rgUsername: isTagSearch ? "" : displayValue,
                        rgTags: isTagSearch ? displayValue : tags,
                        rgOrder: order,
                      });
                    }}
                    className="flex-1 text-left text-sm text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400"
                  >
                    <span className="font-medium">{displayValue}</span>
                    {tags && !isTagSearch && (
                      <span className="text-xs text-gray-500 dark:text-gray-400 ml-2">
                        (tags: {tags})
                      </span>
                    )}
                    <span className="text-xs text-gray-500 dark:text-gray-400 ml-2">
                      [{order}]
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
              );
            })}
          </div>
          {recentRedgifs.length > 5 && (
            <button
              type="button"
              onClick={() => setShowAllRedgifs(!showAllRedgifs)}
              className="mt-2 text-sm text-blue-600 dark:text-blue-400 hover:underline"
            >
              {showAllRedgifs ? "Show less" : `Show ${recentRedgifs.length - 5} more`}
            </button>
          )}
        </div>
      )}

      {formData.sourceType === "bunkr" && recentBunkr.length > 0 && (
        <div className="mt-8">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
            <Clock size={18} />
            Recent Bunkr Albums
          </h2>
          <div className="space-y-2">
            {(showAllBunkr ? recentBunkr : recentBunkr.slice(0, 5)).map((entry) => (
              <div
                key={entry.id}
                className="flex items-center gap-2 p-2 bg-gray-100 dark:bg-gray-800 rounded-md group"
              >
                <button
                  type="button"
                  onClick={() => {
                    setFormData({
                      ...formData,
                      sourceType: "bunkr",
                      bunkrAlbumUrl: entry.value,
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
          {recentBunkr.length > 5 && (
            <button
              type="button"
              onClick={() => setShowAllBunkr(!showAllBunkr)}
              className="mt-2 text-sm text-blue-600 dark:text-blue-400 hover:underline"
            >
              {showAllBunkr ? "Show less" : `Show ${recentBunkr.length - 5} more`}
            </button>
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

      {/* Playlist Manager Modal */}
      {showPlaylistManager && formData.playlistId && (
        <PlaylistManager
          playlistId={formData.playlistId}
          onClose={() => setShowPlaylistManager(false)}
          onUpdate={() => {
            // Reload playlists
            fetch("/api/playlists")
              .then((res) => res.json())
              .then((data) => setPlaylists(data.playlists || []))
              .catch((err) => console.error("Failed to reload playlists:", err));
          }}
        />
      )}
    </div>
  );
}
