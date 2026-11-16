const http = require("http");
const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");

const PORT = process.env.PORT || 3000;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: true,
  max: 3,
  idleTimeoutMillis: 30000,
});

const PUB = path.join(__dirname, "public");
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".png": "image/png",
  ".webmanifest": "application/manifest+json",
  ".js": "text/javascript; charset=utf-8",
};
const CODE = /^[A-Z2-9]{5}-[A-Z2-9]{5}$/;
const MAX_BODY = 1024 * 1024;

async function init() {
  await pool.query(
    "CREATE TABLE IF NOT EXISTS progress (code text PRIMARY KEY, data text NOT NULL, upd bigint NOT NULL DEFAULT 0, updated_at timestamptz NOT NULL DEFAULT now())"
  );
}

function send(res, status, body, type = "application/json; charset=utf-8", extra = {}) {
  res.writeHead(status, { "Content-Type": type, "Cache-Control": "no-store", ...extra });
  res.end(typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (c) => {
      size += c.length;
      if (size > MAX_BODY) { reject(new Error("too_large")); req.destroy(); return; }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://x");
    const m = url.pathname.match(/^\/api\/p\/([^/]+)$/);
    if (m) {
      const code = decodeURIComponent(m[1]).toUpperCase();
      if (!CODE.test(code)) return send(res, 400, { error: "bad_code" });
      if (req.method === "GET") {
        const r = await pool.query("SELECT data, upd FROM progress WHERE code=$1", [code]);
        if (!r.rows.length) return send(res, 404, { error: "not_found" });
        return send(res, 200, { data: r.rows[0].data, upd: Number(r.rows[0].upd) });
      }
      if (req.method === "PUT" || req.method === "POST") {
        let body;
        try { body = JSON.parse(await readBody(req)); } catch (e) { return send(res, 400, { error: "bad_body" }); }
        if (typeof body.data !== "string" || !Number.isFinite(Number(body.upd))) return send(res, 400, { error: "bad_body" });
        const r = await pool.query(
          `INSERT INTO progress (code, data, upd) VALUES ($1,$2,$3)
           ON CONFLICT (code) DO UPDATE SET data=EXCLUDED.data, upd=EXCLUDED.upd, updated_at=now()
           WHERE progress.upd < EXCLUDED.upd
           RETURNING upd`,
          [code, body.data, Math.floor(Number(body.upd))]
        );
        return send(res, 200, { ok: true, stored: r.rows.length > 0 });
      }
      return send(res, 405, { error: "method" });
    }
    if (url.pathname === "/healthz") return send(res, 200, { ok: true });

    let file = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
    file = path.normalize(file).replace(/^(\.\.[/\\])+/, "");
    const full = path.join(PUB, file);
    if (!full.startsWith(PUB) || !fs.existsSync(full) || fs.statSync(full).isDirectory()) {
      return send(res, 404, "Nicht gefunden", "text/plain; charset=utf-8");
    }
    const ext = path.extname(full);
    const cache = ext === ".png" ? "public, max-age=604800" : "no-cache";
    res.writeHead(200, { "Content-Type": TYPES[ext] || "application/octet-stream", "Cache-Control": cache });
    fs.createReadStream(full).pipe(res);
  } catch (e) {
    console.error(e);
    send(res, 500, { error: "server" });
  }
});

init()
  .catch((e) => console.error("DB init failed", e.message))
  .finally(() => server.listen(PORT, () => console.log("Kanji-Pfad läuft auf Port " + PORT)));
