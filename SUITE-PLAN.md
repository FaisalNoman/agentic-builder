# Suite plan — bundle + chain agentic-builder × intelli-agent

Planning doc (no code). Goal: one suite where a mixed prompt (build software **and** do SEO/marketing/
sales/research) runs the SDLC half through **agentic-builder**, then hands off to **intelli-agent**,
which takes control, starts its dashboard, and finishes the business/research half — as one continuous
experience.

## Why bundle

- Both are same-architecture sibling skills (SKILL.md + references + global-DAG scheduler + the SAME
  dashboard + a registry + memory). High duplication → natural to unify.
- The business half (SEO/marketing/sales) almost always **depends on the built product**, so chaining
  build → grow is the natural order.
- Shared registry + shared memory = the marketing/sales agents actually know what was built.

## Structure — options

**Option 1 — Conductor skill (do first).** New folder `agentic-suite/` holding `agentic-builder/`,
`intelli-agent/`, and a thin `conductor` skill. Conductor: classify the prompt → SDLC portion + business
portion → run A → hand off → run B. Both skills stay internally untouched. Lowest risk, ships chaining
fast.

**Option 2 — Shared core, thin frontends (target).** Extract the duplicated parts — DAG scheduler,
dashboard, registry, memory, events log, unattended/harness adapters — into one `core/` lib. A and B
become thin domain frontends. Most work; kills divergence; unlocks the unified dashboard.

**Option 3 — Native handoff phase (skip).** agentic-builder's Phase 9 directly invokes intelli-agent.
Tight coupling, hard to evolve separately.

→ Sequence: **1 now, 2 later.**

## Handoff contract (the glue)

agentic-builder writes `HANDOFF.json` at Phase 9; intelli-agent reads it as its product brief so it does
**not** re-interview:
```
{ product, what_built, stack, features[], run_urls[], file_map[], decisions[],
  memory_ref: ".agentic-builder/memory.json", pending_business_tasks[] }
```
intelli-agent grounds SEO/marketing/sales in the real app (real pages/features), not a blank slate.

## Dashboard — the UX decision

1. **Sequential takeover (v1).** A's board shows "SDLC complete → handing off"; B opens its own (port
   4318). Simple; two boards.
2. **Unified board (target).** One shared dashboard server + one `events.jsonl` + one `agents.json`
   across both phases. Two super-milestones: **BUILD** (agentic-builder) → **GROW** (intelli-agent). One
   continuous timeline + one Replay. Best feel; needs Option 2's shared core.
3. Single board, two tabs.

→ Ship 1, move to 2.

## Chaining semantics

- Default **sequential** A→B (business depends on the product).
- v2: cross-engine DAG — independent business nodes (market research, competitor scan) run in parallel
  with the build; product-dependent nodes (on-page SEO, sales proposal) wait for BUILD.

## Prompt splitting

Conductor classifier up front: SDLC verbs (build/fix/extend) → engine A; research/content/strategy/
marketing/sales/SEO → engine B. Reuse A's mode detection + B's domain detector. Ambiguous → ask once.

## Share memory + registry

Bundle → **one** `memory.json` + **one** `agents/registry.json`. Then B's marketing agent knows what A
built and routing is consistent across both. Strong argument for Option 2.

## Cautions

- Namespace state per engine (`plan/state/build/` vs `plan/state/grow/`) to avoid clobbering.
- Handoff brief prevents a double interview.
- Two dashboards = port contention → unify early.
- Two skills' schemas drift → shared core fixes it.
- Keep the conductor THIN (split + sequence + handoff only).

## Phasing

1. **Conductor skill + HANDOFF.json** — chaining works, both skills untouched, sequential dashboards.
2. **Unified dashboard** — one board, BUILD→GROW timeline, shared events/memory.
3. **Extract shared core** — scheduler/registry/memory/dashboard/unattended/harness → `core/`; skills
   become frontends.

## Prerequisites (must land before the bundle pays off)

- **agentic-builder P0–P6** — done (PRs #1, #2).
- **intelli-agent P0–P6 parity** — in progress (registry consumer + file-ownership + budget + cross-
  session memory + replay + unattended/harness). Required so both engines share schemas, the registry,
  and one memory format. Until then, chaining works but the shared-core/unified-dashboard payoff can't.

Naming: `agentic-suite` (BUILD→GROW) or `ship-and-grow`. One marketplace entry for the suite.
