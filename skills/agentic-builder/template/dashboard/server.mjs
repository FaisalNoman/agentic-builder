// Agentic Builder agent-swarm dashboard — zero-dependency Node server.
// Serves index.html and streams plan/state/agents.json over SSE so the page
// updates live as the orchestrator spawns/finishes subagents.
//
// Run from anywhere:  node plan/dashboard/server.mjs [port]
// It locates plan/state/agents.json relative to its own directory (../state).
// Uses mtime polling (not fs.watch) for cross-platform reliability, and never
// crashes on a stray error.

import http from "node:http";
import net from "node:net";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const STATE = path.resolve(here, "..", "state", "agents.json");
const HTML = path.join(here, "index.html");
const args = process.argv.slice(2);
const PORT = Number(args.find((a) => /^\d+$/.test(a))) || 4317;
const NO_OPEN = args.includes("--no-open");

// Best-effort: open the default browser to the dashboard. Disable with --no-open.
function openBrowser(url) {
  if (NO_OPEN) {
    console.log(`  Auto-open suppressed (--no-open). Navigate to: ${url}`);
    return;
  }
  try {
    const cmd =
      process.platform === "win32" ? "cmd"
      : process.platform === "darwin" ? "open"
      : "xdg-open";
    const a =
      process.platform === "win32" ? ["/c", "start", "", url]
      : [url];
    const child = spawn(cmd, a, { detached: true, stdio: "ignore" });
    child.unref();
    child.on("error", (e) => {
      console.log(`  Auto-open failed (${e.message}). Open manually: ${url}`);
    });
  } catch (e) {
    console.log(`  Auto-open unavailable (${e?.message}). Open manually: ${url}`);
  }
}

process.on("uncaughtException", (e) => console.error("[dashboard] ignored:", e?.message));
process.on("unhandledRejection", (e) => console.error("[dashboard] ignored:", e));

function readState() {
  try {
    return fs.readFileSync(STATE, "utf8");
  } catch {
    return JSON.stringify({ project: "(waiting)", phase: "idle", agents: [], log: [], updated: "" });
  }
}

const clients = new Set();
function send(res, payload) {
  try { res.write(`data: ${payload.replace(/\n/g, " ")}\n\n`); } catch { clients.delete(res); }
}

// Poll the state file's mtime; broadcast to SSE clients only when it changes.
let lastMtime = 0;
setInterval(() => {
  let m = 0;
  try { m = fs.statSync(STATE).mtimeMs; } catch { /* not yet written */ }
  if (m !== lastMtime) {
    lastMtime = m;
    const payload = readState();
    for (const res of clients) send(res, payload);
  }
}, 500);

const server = http.createServer((req, res) => {
  try {
    if (req.url === "/events") {
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });
      send(res, readState());
      clients.add(res);
      const ka = setInterval(() => { try { res.write(": ka\n\n"); } catch {} }, 15000);
      req.on("close", () => { clearInterval(ka); clients.delete(res); });
      return;
    }
    if (req.url === "/state") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(readState());
      return;
    }
    // Reverse channel: the page POSTs the user's answer/approval here. We persist it
    // to plan/state/answers.json; the orchestrator's blocking wait-answer.mjs picks it up.
    if (req.url === "/answer" && req.method === "POST") {
      let body = "";
      req.on("data", (c) => { body += c; if (body.length > 1e6) req.destroy(); });
      req.on("end", () => {
        try {
          const incoming = JSON.parse(body || "{}"); // { id, value }
          const ANS = path.resolve(here, "..", "state", "answers.json");
          let store = {};
          try { store = JSON.parse(fs.readFileSync(ANS, "utf8")); } catch {}
          if (incoming && incoming.id) {
            store[incoming.id] = { value: incoming.value, at: new Date().toISOString() };
            fs.mkdirSync(path.dirname(ANS), { recursive: true });
            fs.writeFileSync(ANS, JSON.stringify(store, null, 2));
          }
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: true }));
        } catch (e) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: false, error: String(e?.message || e) }));
        }
      });
      return;
    }
    const buf = fs.readFileSync(HTML);
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(buf);
  } catch (e) {
    try { res.writeHead(500); res.end(String(e?.message || e)); } catch {}
  }
});

// Probe a single port with a throwaway socket: resolve true if it's free.
function isFree(port) {
  return new Promise((resolve) => {
    const t = net.createServer();
    t.once("error", () => resolve(false));
    t.once("listening", () => t.close(() => resolve(true)));
    t.listen(port, "0.0.0.0");
  });
}

// Find the first free port at/after the base, then listen the real server ONCE.
const MAX_TRIES = 100;
async function start() {
  let port = PORT;
  for (let i = 0; i < MAX_TRIES; i++) {
    if (await isFree(port)) break;
    console.error(`[dashboard] port ${port} in use — trying ${port + 1}`);
    port += 1;
  }
  server.on("error", (e) => console.error("[dashboard] server error:", e?.message));
  server.listen(port, () => {
    const url = `http://localhost:${port}`;
    console.log(`Agentic Builder swarm dashboard: ${url}  (watching ${STATE})`);
    try {
      fs.mkdirSync(path.dirname(STATE), { recursive: true });
      fs.writeFileSync(
        path.resolve(here, "..", "state", "dashboard.json"),
        JSON.stringify({ port, url, pid: process.pid }, null, 2),
      );
    } catch { /* best-effort */ }
    // Delay slightly so the server is fully accepting before the browser hits it.
    setTimeout(() => openBrowser(url), 300);
    console.log(`  Auto-opening browser… (run with --no-open to suppress)`);
  });
}
start();

// Keep the process alive even if something odd happens.
setInterval(() => {}, 1 << 30);
