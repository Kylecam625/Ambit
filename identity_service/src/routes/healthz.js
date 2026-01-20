const express = require("express");
const { now_iso } = require("../lib/utils");

const create_healthz_router = () => {
  const router = express.Router();

  router.get("/healthz", (_req, res) => {
    res.json({ ok: true, service: "identity_service", time: now_iso() });
  });

  return router;
};

module.exports = { create_healthz_router };

