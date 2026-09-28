# ADR-001: Build tooling

**Status:** Accepted · 2026-09-28 · Supersedes nothing
**Related:** ROADMAP `P0-01`

## Context

The roadmap offered Vite + `@crxjs/vite-plugin` or WXT. Both were evaluated against
three requirements: (a) the directory layout defined in ROADMAP §1 must be preserved,
(b) MV3 output must be deterministic and auditable for the zero-egress CI check, and
(c) no third-party plugin should sit on the critical path of a Chrome Web Store release.

## Decision

Use **plain Vite with two build passes and no extension-specific plugin.**

- `vite.config.ts` — extension pages (`popup`, `options`) and the MV3 service worker,
  emitted as ES modules. `src/public/` is the static root, so `manifest.json` is copied
  verbatim to `dist/manifest.json`.
- `vite.content.config.ts` — content scripts, emitted as a single-file **IIFE** with
  `emptyOutDir: false`. Chrome cannot load ES modules as content scripts, so this pass
  cannot be merged into the first.

## Consequences

**Positive**
- `manifest.json` is hand-authored and reviewable — what is written is what ships, which
  matters for Web Store permission review.
- `dist/` layout is flat and predictable, so `tools/check-egress.mjs` can scan it reliably.
- No dependency on a plugin's MV3 support lagging a Chrome release.

**Negative**
- Manifest paths are maintained by hand; a rename in `src/` requires a manifest edit.
  Mitigated by the e2e smoke suite, which fails if any entry point fails to load.
- Two build invocations instead of one. Acceptable: combined build is well under a second.

## Revisit when

A content script needs dynamic `import()`, or the number of entry points exceeds roughly
a dozen. At that point re-evaluate WXT.
