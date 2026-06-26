# agentic-builder — Build Roadmap

Derived from a gap analysis against Superpowers, Ruflo, and claude-swarm.
Items already shipped in the skill were excluded; only true gaps remain.

## Already shipped (do not rebuild)
- `systematic-debugging.md` — Superpowers-style 4-phase root cause, wired to Phase 7 fix-agent
- `branch-lifecycle.md` — worktrees + finishing-a-branch gate
- `code-review-protocol.md` — requesting + receiving + subagent-driven, two-stage
- `cache-policy.md` — per-run result cache
- Token KPI — auto-measured from transcript (`token-report.mjs`)

---

## P0 — Correctness: runtime file-ownership guard
**Gap:** conflict handled only at design time (`phases.md` "split if two tasks touch same file"). If decomposition misjudges, parallel agents clobber each other. No runtime guard.

**Build:**
- New `references/file-ownership.md`. Each task in `*-tasks.json` declares `writes: [globs]`.
- Scheduler dispatch loop: before filling slots, skip any ready node whose `writes` glob-overlaps an in-flight node's `writes`; keep it queued. Pure scheduling constraint — no OS locks.
- State: `plan/state/locks.json` = active write-claims, for dashboard viz.

**Effort:** M. **Accept:** two tasks writing the same path never run concurrently, proven by a conflict-injection test.

## P1 — Cost control
**Gap:** no model tiering (all agents same model); no budget cap. (Token measurement already done.)

**Build:**
- `agent-contracts.md` + registry: add `model` per role — Haiku for impl/worker, Sonnet/Opus for architect/review/plan. Pass via Agent tool `model` param.
- `references/budget.md` + Stage 0 preflight asks soft `max_tokens` / `max_usd`. Scheduler checks live measured total (`token-report.mjs`) each loop; on breach → pause, write approval prompt to dashboard (reuse existing modal).

**Effort:** S (tiering) + M (budget). **Accept:** large run shows ~3x worker cost drop; breach pauses for approval.

## P2 — Cross-session memory
**Gap:** cache is per-run only; every build starts cold.

**Build:**
- `.agentic-builder/memory.json` at project root (survives runs): per milestone — what built, what failed + fix, decisions, file map.
- Stage 0 loads it → injects "prior-run context" into architect/plan agents.
- No HNSW. Plain JSON + keyword filter. Optional chromadb if `caps.memory`.

**Effort:** M. **Accept:** 2nd run on same project references prior decisions, skips re-derivation.

## P3 — Session replay / audit
**Gap:** transcript exists but no run-scoped event log / replay.

**Build:** append-only `plan/state/events.jsonl` (agent start/done/blocked, gate, approval, cost tick). Dashboard "Replay" tab scrubs it. Cheap — orchestrator already has these transition points.

**Effort:** S–M. **Accept:** failed run reconstructable from JSONL.

## P4 — Reach (lower priority)
- **Headless/CI** — ship the unshipped "Engine B": `--headless` skips dashboard + interactive gates, auto-approves, exits nonzero on BLOCKED. Effort L.
- **Multi-harness** — abstract Claude-Code-specific bits (Agent tool, transcript path) behind a thin adapter so Codex/Gemini can host. Effort L. Defer until adoption.

## P5 — Distribution (highest ROI, ~zero code)
Submit to official Claude plugin marketplace. At low star count, discovery > features. Effort S, mostly packaging + PR.

---

## Suggested order
1. P0 file-ownership (correctness bug — first)
2. P5 marketplace (parallel, non-code, unblocks adoption)
3. P1 model tiering → budget
4. P2 memory
5. P3 replay
6. P4 when adoption justifies
