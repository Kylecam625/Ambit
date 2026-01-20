import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const port = Number.parseInt(process.env.PORT || "5175", 10);
const root_dir = __dirname;

const content_type_by_ext = new Map([
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".svg", "image/svg+xml"],
]);

const to_safe_path = (raw_path) => {
  const decoded = decodeURIComponent(raw_path);
  const without_query = decoded.split("?")[0] || "/";
  const normalized = path.posix.normalize(without_query);
  const no_leading = normalized.replace(/^(\.\.(\/|\\|$))+/, "");
  return no_leading.startsWith("/") ? no_leading : `/${no_leading}`;
};

const server = http.createServer(async (req, res) => {
  try {
    const method = req.method || "GET";
    if (method !== "GET" && method !== "HEAD") {
      res.writeHead(405, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Method Not Allowed");
      return;
    }

    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
    const safe_path = to_safe_path(url.pathname);
    const file_path =
      safe_path === "/"
        ? path.join(root_dir, "index.html")
        : path.join(root_dir, safe_path);

    const stat = await fs.stat(file_path).catch(() => null);
    if (!stat || !stat.isFile()) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Not Found");
      return;
    }

    const ext = path.extname(file_path).toLowerCase();
    const content_type = content_type_by_ext.get(ext) || "application/octet-stream";

    res.setHeader("Content-Type", content_type);
    res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
    res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");

    if (method === "HEAD") {
      res.writeHead(200);
      res.end();
      return;
    }

    const data = await fs.readFile(file_path);
    res.writeHead(200);
    res.end(data);
  } catch (error) {
    res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
    res.end(error instanceof Error ? error.message : "Internal Server Error");
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`identity_prototype running at http://localhost:${port}`);
});

