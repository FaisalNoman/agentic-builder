// Scan installed Claude Code plugins for build-domain subagents (P6b).
//
// The repo's registry.json indexes the local agents/ personas (source:"repo",
// dispatched via persona-injection into general-purpose). This script adds the
// OTHER pool: real plugin agents (e.g. voltagent-*) that Claude can dispatch
// natively as a `subagent_type`. It emits ONLY build-domain agents
// (engineering/testing/design/product) — the agentic-builder scope guard — each
// tagged source:"plugin" with the `subagent_type` id the Agent tool needs.
//
// AGENTS ONLY — a plugin agent is exactly what the plugin's manifest
// (.claude-plugin/plugin.json) lists under `agents`. Skill / command / hook
// files share the same name+description frontmatter but are NOT dispatchable as
// a subagent_type, so we trust the manifest, never a blind file walk.
//
// Runtime, not committed: the plugin set + cache paths + pinned versions are
// machine-specific, so the skill runs this live at dispatch and merges the
// result with registry.json in memory. Always matches what is installed.
//
// Zero dependencies. Prints JSON to stdout:  node agents/scan-plugins.mjs
//   { schema, generated, count, source:"plugin", agents:[ {name, subagent_type,
//     plugin, domain, description} ] }
//
// Env: CLAUDE_PLUGINS_DIR overrides ~/.claude/plugins (for tests / alt homes).

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const BUILD_DOMAINS = new Set(["engineering", "testing", "design", "product"]);

// Plugins that are business/research/content — never build work. Excluded whole.
const EXCLUDE_PLUGINS = new Set(["voltagent-biz", "voltagent-research"]);

// Whole-plugin default build domain. A per-agent keyword hit (below) can still
// refine one of these (e.g. a ui-designer inside an engineering plugin → design).
const PLUGIN_DOMAIN = {
  "voltagent-core-dev": "engineering",
  "voltagent-lang": "engineering",
  "voltagent-dev-exp": "engineering",
  "voltagent-qa-sec": "testing",
};

// Build-domain signal WORDS (matched as whole tokens, not substrings — so
// "codes" in a medical-coding blurb never reads as "code"). The domain with the
// most token hits wins. Generous enough that future build plugins classify with
// no code change; non-build agents (healthcare, finance, seo, admin…) hit none
// and drop out.
const DOMAIN_SIGNALS = {
  engineering: new Set([
    "api", "backend", "frontend", "fullstack", "microservice", "microservices",
    "server", "database", "sql", "devops", "sre", "infrastructure", "firmware",
    "embedded", "blockchain", "smart", "contract", "contracts", "solidity",
    "mobile", "electron", "graphql", "websocket", "compiler", "runtime",
    "developer", "engineer", "engineering", "architect", "refactor",
    "refactoring", "performance", "security", "debug", "debugger", "debugging",
    "dependency", "dependencies", "cli", "sdk", "deploy", "deployment",
    "kubernetes", "docker", "rust", "python", "java", "typescript",
    "javascript", "golang", "php", "swift", "kotlin", "elixir", "ruby", "rails",
    "django", "fastapi", "node", "react", "vue", "angular", "nextjs", "laravel",
    "spring", "dotnet", "game", "gameplay", "rendering", "multiplayer",
    "fintech", "payment", "payments", "iot", "documenter", "tooling",
  ]),
  testing: new Set([
    "test", "tests", "testing", "qa", "accessibility", "chaos", "e2e",
    "automation", "coverage", "penetration", "regression", "validator",
  ]),
  design: new Set([
    "design", "designer", "ui", "ux", "visual", "brand", "layout", "component",
    "figma", "css", "styling", "typography", "interface",
  ]),
  product: new Set([
    "product", "roadmap", "backlog", "sprint", "prioritization", "requirements",
  ]),
};

function tokenize(s) {
  return (s || "").toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
}

function pluginsRoot() {
  return process.env.CLAUDE_PLUGINS_DIR || path.join(os.homedir(), ".claude", "plugins");
}

// Reuse the registry builder's single-line frontmatter parser (same file format).
function parseFrontmatter(text) {
  if (!text.startsWith("---")) return null;
  const end = text.indexOf("\n---", 3);
  if (end === -1) return null;
  const out = {};
  for (const line of text.slice(3, end).split("\n")) {
    const i = line.indexOf(":");
    if (i === -1) continue;
    const key = line.slice(0, i).trim();
    if (!key) continue;
    let val = line.slice(i + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

// Best build domain for an agent by whole-token overlap, or null if no signal.
function keywordDomain(tokens) {
  const set = new Set(tokens);
  let best = null, bestN = 0;
  for (const [domain, words] of Object.entries(DOMAIN_SIGNALS)) {
    let n = 0;
    for (const t of set) if (words.has(t)) n++;
    if (n > bestN) { bestN = n; best = domain; }
  }
  return best;
}

// Final build domain for a plugin agent, or null to exclude.
//   - Known build plugin (PLUGIN_DOMAIN): name+description decides, falling back
//     to the plugin's default domain — every agent in it is build work.
//   - Other plugin (e.g. voltagent-domains, a grab bag): the build signal must
//     be in the NAME, not just the blurb. Drops admin / risk / compliance /
//     healthcare agents that merely mention an API or a framework in passing.
function classify(plugin, fm) {
  if (EXCLUDE_PLUGINS.has(plugin)) return null;
  const def = PLUGIN_DOMAIN[plugin];
  if (def) return keywordDomain(tokenize(fm.name + " " + (fm.description || ""))) || def;
  return keywordDomain(tokenize(fm.name));
}

// Resolve a plugin's agent files from its manifest `agents` field. Entries may
// be file paths (./foo.md) or directories; anything else is ignored. Returns
// absolute .md paths. No manifest / no agents field → [] (it's a skills plugin).
function manifestAgentFiles(installPath) {
  let manifest;
  for (const rel of [".claude-plugin/plugin.json", "plugin.json"]) {
    try { manifest = JSON.parse(fs.readFileSync(path.join(installPath, rel), "utf8")); break; } catch {}
  }
  if (!manifest || !manifest.agents) return [];
  const list = Array.isArray(manifest.agents) ? manifest.agents : [manifest.agents];
  const files = [];
  for (const entry of list) {
    if (typeof entry !== "string") continue;
    const abs = path.resolve(installPath, entry);
    let stat;
    try { stat = fs.statSync(abs); } catch { continue; }
    if (stat.isDirectory()) {
      try {
        for (const e of fs.readdirSync(abs, { withFileTypes: true }))
          if (e.isFile() && e.name.endsWith(".md")) files.push(path.join(abs, e.name));
      } catch {}
    } else if (abs.endsWith(".md")) {
      files.push(abs);
    }
  }
  return files;
}

function scan() {
  const root = pluginsRoot();
  let installed;
  try {
    installed = JSON.parse(fs.readFileSync(path.join(root, "installed_plugins.json"), "utf8"));
  } catch {
    return { schema: 1, generated: null, source: "plugin", count: 0, agents: [], note: "no installed_plugins.json" };
  }
  const table = installed.plugins || {};
  const agents = [];
  const seen = new Set();
  for (const [key, records] of Object.entries(table)) {
    if (!Array.isArray(records) || records.length === 0) continue;
    const plugin = key.split("@")[0];
    if (EXCLUDE_PLUGINS.has(plugin)) continue;
    const rec = records[records.length - 1];      // newest install record
    if (!rec || !rec.installPath) continue;
    // Manifest is the only source of truth for what is an agent (not a skill).
    const files = manifestAgentFiles(rec.installPath);
    for (const file of files) {
      let text;
      try { text = fs.readFileSync(file, "utf8"); } catch { continue; }
      const fm = parseFrontmatter(text);
      if (!fm || !fm.name) continue;
      const domain = classify(plugin, fm);
      if (!domain || !BUILD_DOMAINS.has(domain)) continue;
      const subagent_type = `${plugin}:${fm.name}`;
      if (seen.has(subagent_type)) continue;
      seen.add(subagent_type);
      agents.push({
        name: fm.name,
        subagent_type,
        plugin,
        domain,
        description: fm.description || "",
      });
    }
  }
  agents.sort((a, b) => (a.domain + a.subagent_type).localeCompare(b.domain + b.subagent_type));
  return {
    schema: 1,
    generated: process.env.AB_REGISTRY_STAMP || null,
    source: "plugin",
    count: agents.length,
    agents,
  };
}

process.stdout.write(JSON.stringify(scan(), null, 2) + "\n");
