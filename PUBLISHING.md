# Publishing & distribution

`agentic-builder` is packaged as a **Claude Code plugin** and ships its own marketplace manifest, so it
can be installed two ways and submitted to a third-party marketplace listing.

## This repo is already a marketplace

Users install directly from the repo — no central listing required:

```
/plugin marketplace add FaisalNoman/agentic-builder
/plugin install agentic-builder@agentic-builder
```

Packaging that makes this work (keep these in sync on every release):
- `.claude-plugin/plugin.json` — plugin manifest (name, `version`, description, keywords, `hooks`).
- `.claude-plugin/marketplace.json` — marketplace manifest listing the plugin with `source: "./"`.
- `hooks/hooks.json` — the `UserPromptSubmit` routing hook.
- `skills/agentic-builder/` — the skill (SKILL.md + references + dashboard template).

## Release checklist (do every version bump)

1. Bump `version` in `.claude-plugin/plugin.json` (SemVer).
2. Add a dated section to `CHANGELOG.md` describing Added / Changed / Fixed.
3. Update `.claude-plugin/plugin.json` `description` + `keywords` if capabilities changed.
4. Update `README.md` "What it does" if user-facing features changed.
5. Verify the dashboard still runs: `node --check skills/agentic-builder/template/dashboard/server.mjs`
   and `node --check ... token-report.mjs`.
6. Sanity-check the manifests parse: `node -e "JSON.parse(require('fs').readFileSync('.claude-plugin/plugin.json'))"`
   (and likewise for `marketplace.json`).
7. Tag the release: `git tag v0.3.0 && git push --tags`.

## Submitting to a public / official marketplace

Listing on a curated marketplace (e.g. the official Claude plugin marketplace or a community index such
as `awesome-claude-code` / `awesome-skills`) is an **external PR**, not a code change here. Checklist:

1. Confirm `LICENSE` (MIT) and a clear `README.md` with a demo/GIF and the install commands.
2. Ensure `plugin.json` `name` is unique and stable, `author` is set, and `description` is one tight sentence.
3. Pin a tagged release (step 7 above) so the listing references an immutable ref.
4. Open the marketplace's submission PR/issue with: repo URL, one-line pitch, category (orchestrator /
   SDLC / agents), and the install snippet.
5. Disclose requirements: Node.js on PATH; runs in-session under Claude Code; no API key.

## Notes

- The plugin ships the **in-session orchestrator only**. There is intentionally no bundled standalone
  ("Engine B") runner — keep the install free of credentials and external processes.
- Unattended/CI runs use the same in-session engine driven non-interactively
  (see `skills/agentic-builder/references/unattended-mode.md`); they do not need a separate program.
