# agentic-builder

<img width="1280" height="640" alt="og-card" src="https://github.com/user-attachments/assets/de6b8a5f-8320-468a-9ddd-fb5287fc30a1" />


https://github.com/user-attachments/assets/21f1a509-97ba-4af7-82f1-bc1f840367a1

**Autonomous in-session SDLC orchestrator for Claude Code.** Give it a prompt; it turns it into
tested, working software using a parallel agent swarm — no API key, no separate program. It runs
entirely inside your Claude Code session on the subscription you're already logged into.

## What it does

- **Global dependency-graph scheduler** — every task whose dependencies are met runs at once (up to a
  concurrency cap), across the whole project. No sprint barriers; "milestones" are gate/review/commit
  nodes that block only their own cluster, so the agent fleet stays saturated.
- **Three auto-detected modes** — GREENFIELD (build from scratch), FEATURE (add to an existing
  codebase), SURGICAL (diagnose + fix a bug).
- **Design-system routing** — for UI projects it interviews for product/industry/aesthetic, routes to
  the best installed design skill (prefers `ui-ux-pro-max`), writes a token contract, and validates a
  wireframe with you before any code.
- **TDD discipline** — interfaces locked → failing tests → implementation → bounded fix loops.
- **Two-stage code review** — spec compliance, then code quality, per milestone.
- **Live dashboard** — a zero-dependency local page showing every agent in real time, with:
  - dark / light theme toggle,
  - a **Plan tab** rendering the live dependency-graph flowchart (status-colored, arrows, gates),
  - **interactive approvals** — the plan and questions appear on the dashboard with buttons (CLI stays
    as the fallback),
  - an accurate phase-weighted progress bar and a verbose toggle.
- **Runtime file-ownership guard** — tasks declare the paths they write; the scheduler never runs two
  agents that would touch the same file (dispatch-time conflict gate, shown live on the dashboard).
- **Cost control** — per-role model tiering (cheap workers) plus optional token/USD soft caps that warn
  at 80% and pause for approval at 100%, measured from the real session transcript.
- **Cross-session memory** — `.agentic-builder/memory.json` carries prior decisions and fixes forward so
  the next run starts warm.
- **Session replay** — an append-only event log feeds a Replay tab you can scrub to reconstruct any past
  moment of a run.
- **Unattended / CI mode** — run the same in-session engine with no human in the loop; results land in
  `plan/state/RESULT.json` (still no API key, no separate program).

## Install

Add this repo as a plugin marketplace, then install:

```
/plugin marketplace add FaisalNoman/agentic-builder
/plugin install agentic-builder@agentic-builder
```

(Or point `/plugin marketplace add` at the repo's Git URL.) Requires Node.js on PATH (used by the
dashboard) — no npm install, no credentials.

## Use

Just describe what you want — the bundled hook nudges Claude Code to pick this orchestrator for any
build / fix / feature request:

```
Build a small habit-tracker web app with a localStorage store, a stats bar, and a dark/light toggle.
```

Or invoke it explicitly any time:

```
/agentic-builder Build me a URL-shortener API with tests.
```

It will interview you (only as needed), show a plan for approval on the dashboard, then build —
opening the live dashboard automatically so you can watch the swarm.

## What's in the box

```
.claude-plugin/plugin.json        plugin manifest
.claude-plugin/marketplace.json   marketplace entry (single-plugin repo)
hooks/hooks.json                  UserPromptSubmit hook registration
hooks/route.mjs                   nudges build/fix prompts to this skill
skills/agentic-builder/SKILL.md   the orchestrator
skills/agentic-builder/references/  phase prompts, scheduler, schemas, protocols
skills/agentic-builder/template/dashboard/  the live dashboard (server + page + answer bridge)
```

## Notes

- **In-session only.** This plugin needs no API key. An optional standalone headless/CI runner
  ("Engine B") exists in development but is intentionally not bundled here.
- The dashboard binds to `localhost` on an auto-selected free port (base 4317).

## License

MIT — see [LICENSE](./LICENSE).
