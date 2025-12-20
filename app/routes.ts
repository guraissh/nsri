import { type RouteConfig, index, route } from "@react-router/dev/routes";
import { readdirSync } from "fs";
import { join } from "path";

// Automatically discover all route files from the routes directory
const routesDir = join(__dirname, "routes");
const routeFiles = readdirSync(routesDir).filter(file => file.endsWith(".tsx"));

// Generate routes configuration
const routes: RouteConfig = routeFiles.map(file => {
  const fileName = file.replace(".tsx", "");

  // Special case for home.tsx - make it the index route
  if (fileName === "home") {
    return index("routes/home.tsx");
  }

  // Convert dot notation to slash notation (e.g., "api.cache-stats" -> "api/cache-stats")
  const routePath = fileName.replace(/\./g, "/");

  return route(routePath, `routes/${file}`);
});

export default routes;
