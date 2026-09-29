# Permission justifications

Chrome Web Store review requires a justification for every permission. These strings are
the canonical source; copy them verbatim into the developer dashboard at submission time
(ROADMAP `P2-08`). Keep them in sync with `src/public/manifest.json` and `docs/PRIVACY.md`.

| Permission | Justification |
|---|---|
| `host_permissions: <all_urls>` | GhostPrint's core function is to show the user which third parties are tracking them on the page they are currently viewing. Tracking can occur on any site, so detection must be available on any site the user visits. No page content is read, and nothing is transmitted off the device. |
| `webRequest` | Used in observe-only (non-blocking) mode to count outbound third-party requests per tab. This is the only API that reports requests as they occur; `declarativeNetRequest` can block requests but cannot report them outside of unpacked developer builds. Only the registrable domain of each request is retained, never the full URL. |
| `declarativeNetRequest` | Used to attach the Global Privacy Control (`Sec-GPC: 1`) header when the user enables that setting, and for optional user-initiated tracker blocking. |
| `declarativeNetRequestFeedback` | Development and debugging only, to verify rule matching in unpacked builds. |
| `webNavigation` | Detects navigation commits, including single-page-app route changes, so the per-tab tracker count resets at the correct moment rather than accumulating across pages. |
| `tabs` | Associates intercepted requests with the tab that caused them and renders the per-tab count on the toolbar badge. The URL is used only to derive the first-party domain for same-party comparison. |
| `storage` | Stores user settings and locally aggregated tracker counts. All data stays on the device. |
| `alarms` | Schedules local housekeeping: pruning aggregate history past the retention window and generating the weekly summary. |
| `notifications` | Used only when the user opts in to one local notification that the weekly privacy report is ready. No browsing details appear in the notification. |

## Permissions deliberately NOT requested

- `<all_urls>` content script `all_frames` — top frame only, to limit injection surface.
- `cookies`, `history`, `bookmarks`, `downloads`, `clipboardRead`, `scripting` — not needed.
- `identity` — GhostPrint has no accounts through Phase 2.
