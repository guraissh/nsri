import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("media", "routes/media.tsx"),
  route("api/stream-media", "routes/api.stream-media.tsx"),
  route("proxy/media", "routes/proxy.media.tsx"),
] satisfies RouteConfig;
