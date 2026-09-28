# GhostPrint

> See who is watching you watch the web.

A Manifest V3 browser extension that exposes, in real time, which third parties are
profiling you on the page you are currently viewing.

**Everything runs locally.** Through Phase 2 the extension makes no network requests at
all — a CI check (`npm run check:egress`) fails the build if any network primitive
appears in the shipped bundle.

## Status

Phase 0 (foundations) — see [ROADMAP.md](ROADMAP.md) for the full plan and current task.

## Development

```bash
npm install
npm run build        # -> dist/
```

Load `dist/` via `chrome://extensions` → Developer mode → **Load unpacked**.

| Script | Purpose |
|---|---|
| `npm run build` | Two-pass build: extension pages + SW, then content scripts as IIFE |
| `npm run dev` | Rebuild on change (reload the extension manually) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint, including injection-sink and CSP rules |
| `npm test` | Vitest unit tests |
| `npm run test:e2e` | Playwright, loads the real extension into Chromium |
| `npm run check:egress` | Asserts `dist/` contains no network primitives |

## Layout

See [ROADMAP.md](ROADMAP.md) §1 for the target architecture and the engineering
constraints that all code must satisfy.

## Docs

- [ROADMAP.md](ROADMAP.md) — phased plan, task IDs, success criteria
- [docs/ADR-001-build-tooling.md](docs/ADR-001-build-tooling.md) — why plain Vite
- [docs/PERMISSIONS.md](docs/PERMISSIONS.md) — Web Store permission justifications

## License

MIT
