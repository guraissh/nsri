// app/server.ts
import { createHonoServer } from "react-router-hono-server/node";
import { serveStatic } from "@hono/node-server/serve-static";

export default createHonoServer({
  configure(server) {
    // Serve thumbnail images from public/thumbnails
    server.use(
      "/thumbnails/*",
      serveStatic({
        root: "./public",
        rewriteRequestPath: (path) => path,
      })
    );
  },
});
