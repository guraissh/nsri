import { useState } from "react";
import { useNavigate } from "react-router";
import type { Route } from "./+types/home";

export function meta({ }: Route.MetaArgs) {
  return [
    { title: "Media Stream Configuration" },
    { name: "description", content: "Configure and stream media content" },
  ];
}

export default function Home() {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    sourceType: "api",
    directoryPath: "",
    sortBy: "none",
    platform: "coomer",
    serviceName: "onlyfans",
    userId: "piripremium",
    from: "0",
    to: "15",
    limit: "-1",
    lookahead: "",
  });

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

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <h1 className="text-3xl font-bold mb-6">Media Stream Configuration</h1>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Source Type
          </label>
          <select
            name="sourceType"
            value={formData.sourceType}
            onChange={handleChange}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            required
          >
            <option value="api">API (Kemono/Coomer)</option>
            <option value="local">Local Directory</option>
          </select>
        </div>

        {formData.sourceType === "local" ? (
          <>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Directory Path
              </label>
              <input
                type="text"
                name="directoryPath"
                value={formData.directoryPath}
                onChange={handleChange}
                placeholder="C:/Users/username/Videos or C:\Users\username\Videos"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
              <p className="text-xs text-gray-500 mt-1">
                Supports paths with spaces and special characters
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Sort By
              </label>
              <select
                name="sortBy"
                value={formData.sortBy}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
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
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Platform
              </label>
              <select
                name="platform"
                value={formData.platform}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              >
                <option value="coomer">Coomer (https://coomer.su)</option>
                <option value="kemono">Kemono (https://kemono.cr)</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Service Name
              </label>
              <select
                name="serviceName"
                value={formData.serviceName}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              >
                <option value="onlyfans">OnlyFans</option>
                <option value="patreon">Patreon</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                User ID
              </label>
              <input
                type="text"
                name="userId"
                value={formData.userId}
                onChange={handleChange}
                placeholder="12345"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  From Page
                </label>
                <input
                  type="number"
                  name="from"
                  value={formData.from}
                  onChange={handleChange}
                  min="0"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  To Page
                </label>
                <input
                  type="number"
                  name="to"
                  value={formData.to}
                  onChange={handleChange}
                  min="0"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Lookahead (optional)
              </label>
              <input
                type="text"
                name="lookahead"
                value={formData.lookahead}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </>
        )}

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Limit (-1 for no limit)
          </label>
          <input
            type="number"
            name="limit"
            value={formData.limit}
            onChange={handleChange}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <button
          type="submit"
          className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
        >
          Start Media Stream
        </button>
      </form>
    </div>
  );
}
