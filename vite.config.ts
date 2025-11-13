import { reactRouter } from "@react-router/dev/vite";
import { reactRouterHonoServer } from "react-router-hono-server/dev"; // add this
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [
    reactRouterHonoServer({ runtime: "bun" }), // add this
    tailwindcss(),
    reactRouter(),
    tsconfigPaths(),
  ],
  ssr: {
    external: [
      "@vidstack/react",
      "@vidstack/react/player",
      "@vidstack/react/media",
    ],
  },
  server: { cors: true },
  logLevel: "info",
  build: { minify: false, sourcemap: "inline" },
});
