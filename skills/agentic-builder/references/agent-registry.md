# AB — Domain-agent registry & router (P6)

Routes a task to the best-fit specialist instead of always spawning a generic `general-purpose`
subagent. Two pools, picked from together (P6b):

1. **Repo personas** — `agents/registry.json`, source `"repo"`. Dispatched by **persona injection** into
   a `general-purpose` subagent (the Agent tool cannot load a repo `.md` as a `subagent_type`).
2. **Plugin agents** — real installed `subagent_type`s (e.g. `voltagent-core-dev:backend-developer`),
   source `"plugin"`, discovered at runtime by `agents/scan-plugins.mjs`. Dispatched **natively** via the
   Agent tool `subagent_type`.

The router scores BOTH pools and **the highest keyword score wins** regardless of source. Shared core
(registry + scanner + router); each skill applies it to its own domains.

## Scope split (hybrid — do not cross it)

- **agentic-builder may route ONLY build domains:** `engineering`, `testing`, `design`, `product`.
  These upgrade build nodes (architect/impl/review/UI) from generic to specialist while staying inside
  the SDLC. **Hard scope guard:** agentic-builder must NEVER select a `marketing` / `sales` / `paid-media`
  / `finance` / `support` / `academic` / `strategy` / etc. persona — those are not software-build work.
- **intelli-agent** (separate skill) consumes the SAME `registry.json` for the business/research/content
  domains. Out of scope for this skill; noted so both stay consistent.

`BUILD_DOMAINS = {engineering, testing, design, product}`.

## Registry build

`agents/build-registry.mjs` (zero-dep Node) scans `agents/<domain>/*.md`, reads each file's YAML
frontmatter, and writes `agents/registry.json`. Rebuild after adding/removing agent files:

```
node agents/build-registry.mjs
```

**Registry location (resolution order).** Look for `registry.json`, first hit wins: `agents/registry.json`
(standalone / co-located) → `../agents/registry.json` (suite bundle: a single shared `agents/` folder
sibling to the skill dirs, used by both agentic-builder and intelli-agent). Persona `.md` bodies live
beside it (the index's `path` values are relative to the `agents/` parent). None found → skip routing,
use `general-purpose`.

`registry.json` schema:
```json
{
  "schema": 1,
  "generated": null,
  "count": 192,
  "domains": ["academic","design","engineering","finance","..."],
  "agents": [
    { "name": "Backend Architect", "domain": "engineering",
      "description": "…", "emoji": "🏗️", "color": "#…",
      "path": "agents/engineering/engineering-backend-architect.md" }
  ]
}
```
Only metadata + the file `path` are indexed — the markdown persona body stays in the file and is loaded
lazily at dispatch (keeps the registry small). Files without a `name:` frontmatter (playbooks, READMEs,
the builder, the registry itself) are skipped.

## Plugin-agent scan (runtime, not committed)

`agents/scan-plugins.mjs` (zero-dep Node) discovers the **second pool** — real installed plugin agents —
and prints them as JSON to stdout. Run it live at dispatch and merge with `registry.json` in memory:

```
node agents/scan-plugins.mjs
```

Why runtime, not committed: the installed plugin set, cache paths, and pinned versions are
machine-specific. A committed snapshot goes stale the moment a plugin updates/uninstalls. Scanning live
always matches what is actually installed (and dispatchable) on this machine.

How it stays agents-only: an agent is **exactly** what a plugin's manifest (`.claude-plugin/plugin.json`)
lists under `agents`. Skill / command / hook files share the same `name:`+`description:` frontmatter but
are NOT dispatchable as a `subagent_type`, so the scanner trusts the manifest, never a blind file walk.

Scope + classification (same `BUILD_DOMAINS` guard):
- Plugins that are business/research/content (`voltagent-biz`, `voltagent-research`) are excluded whole.
- Known build plugins (`voltagent-core-dev`/`-lang`/`-dev-exp`/`-qa-sec`) map to a default build domain,
  refined by whole-token keyword hits (a `ui-designer` inside an engineering plugin → `design`).
- Other plugins (grab bags like `voltagent-domains`) require the build signal in the agent **name** — so
  `blockchain-developer`/`game-developer` are kept but `healthcare-admin`/`risk-manager` drop out.

Output schema (`source:"plugin"`):
```json
{ "schema": 1, "source": "plugin", "count": 81,
  "agents": [ { "name": "Backend Developer", "subagent_type": "voltagent-core-dev:backend-developer",
                "plugin": "voltagent-core-dev", "domain": "engineering", "description": "…" } ] }
```
Env `CLAUDE_PLUGINS_DIR` overrides `~/.claude/plugins` (tests / alt homes).

## Router

Given a task (its title, acceptance criteria, domain/module), pick the specialist from the **union of both
pools** — keyword overlap only, no embeddings (same approach as `memory.md`):

```
route(task, allowedDomains):
  repo   = registry.agents              # source:"repo"   (registry.json)
  plugin = scanPlugins().agents         # source:"plugin" (node agents/scan-plugins.mjs)
  cands  = [...repo, ...plugin].filter(a => allowedDomains.has(a.domain))
  kw     = tokenize(task.title + task.acceptance + task.module)   # lowercase, de-stopword
  score(a) = overlap(kw, tokenize(a.name + " " + a.description))
  best = argmax score over cands        # HIGHEST score wins, repo or plugin alike
  if score(best) >= THRESHOLD (default 2 shared tokens): return best
  else: return null                     # → fall back to general-purpose
```

- For **agentic-builder**, `allowedDomains = BUILD_DOMAINS` (the scope guard, enforced for BOTH pools).
- **Source is not a tiebreak** — whichever scores higher wins. True ties → prefer the more specific
  description (longer overlap), then `source:"repo"` (controlled JSON contract), then first by name.
- Pick ONE specialist per node (not a panel) to keep cost flat.

## Dispatch — mechanism depends on `source`

Both paths still pass the SAME task spec (read/produce/write-path) + `context_slice` output + the role's
OUTPUT CONTRACT (from `agent-contracts.md`), so the orchestrator parses one schema either way. Model
tiering still applies.

**`source:"repo"` → persona injection.** The Agent tool cannot load a repo `.md` as a `subagent_type`:

1. Read the chosen agent's file body (everything AFTER the frontmatter).
2. Spawn a `general-purpose` subagent whose prompt is:
   `<persona body>` + `\n\n---\n` + task spec + `context_slice` + OUTPUT CONTRACT.
3. The persona changes HOW the agent works; it does **not** change the JSON output contract.

**`source:"plugin"` → native subagent_type.** The plugin agent already *is* the persona — do NOT inject a
body. Spawn with the Agent tool `subagent_type: "<plugin:name>"` (e.g. `voltagent-core-dev:backend-developer`):

1. Prompt = task spec + `context_slice` + the **OUTPUT CONTRACT**, prepended with one line:
   "Return ONLY the JSON described below — it is your tool result, not a human message."
   (Plugin agents are autonomous and may have their own tools; the explicit contract keeps the schema.)
2. The plugin agent's own system prompt supplies the expertise. If it dies / returns off-schema, fall
   back to `general-purpose` for that node (see Degradation) — never block the build.

## Integration in agentic-builder (build nodes only)

At dispatch (scheduler `DISPATCH`), for each WORK node, before building its prompt:
- Map node → candidate domain: `architect`/`impl` backend → `engineering`; UI `impl` → `design`;
  `tdd` → `testing`; planning/scoping flavored nodes → `product`. `review` nodes →
  `engineering-code-reviewer`-style personas in `engineering`.
- `route()` over the union within `BUILD_DOMAINS`; on a hit, dispatch by `source` (persona-inject for
  repo, native `subagent_type` for plugin); on a miss/low-confidence, plain `general-purpose` as today
  (no regression).
- Record the chosen specialist on the dashboard card via the `persona` field (see below).

Examples: a backend `impl` → `engineering-backend-architect` (repo) **or** `voltagent-core-dev:backend-developer`
(plugin), whichever scores higher; a DB task → `engineering-database-architect`; a UI page →
`design-ui-designer`; a test node → a `testing` specialist; a `review` → `engineering-code-reviewer` or
`voltagent-qa-sec:code-reviewer`.

## Dashboard

Add a `persona` field to the agent's `agents.json` card: `{ "persona": { "name": "Backend Developer",
"emoji": "🏗️", "domain": "engineering", "source": "plugin" } }`. The board shows the specialist name +
emoji on the card; `source` lets it badge repo vs plugin. Plugin agents have no `emoji` in frontmatter →
use a default (🔌) or the domain's emoji. Absent `persona` → the card renders the plain role (today's look).

## Degradation / fallback

- `registry.json` missing → repo pool empty; route over plugin pool only.
- `scan-plugins.mjs` errors / Node absent / no plugins → plugin pool empty; route over repo pool only
  (exactly today's behaviour). Both pools empty → all nodes `general-purpose`.
- No candidate ≥ THRESHOLD → `general-purpose`.
- A node outside `BUILD_DOMAINS` → never routed by agentic-builder (scope guard); plain dispatch.
- Persona file unreadable / plugin agent dies or returns off-schema → drop the specialist, dispatch plain
  `general-purpose` for that node. Routing is best-effort and never blocks a build.

## Status

Shared core (`build-registry.mjs` + `registry.json` + `scan-plugins.mjs`) and the agentic-builder
build-domain router over BOTH pools (repo personas + plugin subagents, highest-score-wins) are the
P6/P6b deliverable here. intelli-agent's business-domain consumption is tracked in that skill's repo.
