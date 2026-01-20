const express = require("express");
const path = require("node:path");

const { port, db_path, static_root } = require("./config");
const { open_db } = require("./db/connection");
const { ensure_schema } = require("./db/schema");
const { create_repo } = require("./db/profile_repo");
const { create_healthz_router } = require("./routes/healthz");
const { create_profiles_router } = require("./routes/profiles");

const create_app = () => {
  const app = express();

  // Basic dev-friendly CORS
  app.use((req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    if (req.method === "OPTIONS") {
      res.status(204).end();
      return;
    }
    next();
  });

  app.use(express.json({ limit: "4mb" }));

  const db = open_db({ db_path });
  ensure_schema(db);
  const repo = create_repo({ db });

  app.use("/api", create_healthz_router());
  app.use("/api", create_profiles_router({ repo }));

  // Serve the prototype UI (Phase 2)
  app.use("/", express.static(static_root, { extensions: ["html"] }));

  app.get("/", (_req, res) => {
    res.sendFile(path.join(static_root, "index.html"));
  });

  return app;
};

const app = create_app();
app.listen(port, "127.0.0.1", () => {
  console.log(`identity_service listening on http://localhost:${port}`);
  console.log(`db: ${db_path}`);
  console.log(`ui: ${static_root}`);
});

