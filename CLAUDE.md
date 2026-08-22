# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

"Kaizen Activity Tracker" — a local-first web app (IndexedDB, no backend) that tracks monthly Kaizen/IPS
submission counts per employee, with reporting (PDF, email summary/HTML, email banner image) and a
"Lotus Notes Bridge" that imports submission counts from a company Lotus Notes database instead of manual
entry. Deep history/rationale for past decisions lives in `context.md`; detailed architecture notes (written
for AI agents working on this repo) live in `agents.md` — read both when you need more than what's below.

## Commands

```
npm install              # first run / after package.json changes
npm run dev              # Vite dev server, http://localhost:5173/, hot reload on src/**/*.js
npm test                 # Vitest, runs tests/*.test.js once
npm run test:watch       # Vitest watch mode
npm run build            # production build -> dist/index.html (single self-contained file)
npm run preview          # serve the dist/ build locally
```

Run a single test file: `npx vitest run tests/notes-bridge.test.js`

There is no lint script configured.

CI (`.github/workflows/ci.yml`) runs `npm ci && npm run build && npm test` on every push/PR to `main`. There
is no deploy job yet.

## Architecture

### Multi-file, but originated as a single-file 9-module IIFE app

The project was migrated from a single `index.html` (once ~2,800 lines) to Vite + ES Modules when it grew
too long to maintain. The original 9-module design is preserved 1:1 — each module is now its own file under
`src/modules/`, exporting one `const` object with the same name/shape it had as an IIFE:

```
src/
├── main.js            — entry point (formerly APP_CORE): init(), all event handlers, CRUD orchestration
└── modules/
    ├── utils.js               — escHtml, storageAvailable, etc. (bare helpers, no namespace object)
    ├── app-config.js          — APP_CONFIG (incl. DEFAULT_DATA)
    ├── debug-module.js        — DEBUG_MODULE (console logging + in-memory log)
    ├── state-store.js         — STATE_STORE (reactive pub/sub + optimistic updates)
    ├── dom-cache.js           — buildDomCache() (bare function, not a namespace)
    ├── storage-engine.js      — STORAGE_ENGINE (IndexedDB)
    ├── gemini-ai-bridge.js    — GEMINI_AI_BRIDGE (OCR via Gemini Vision, employee name matching)
    ├── auth-provider.js       — AUTH_PROVIDER (Firebase Auth scaffold, disabled)
    ├── cloud-sync-manager.js  — CLOUD_SYNC_MANAGER (Firestore sync scaffold, disabled)
    ├── ui-renderer.js         — UI_RENDERER (all rendering, modals, PDF/email/banner generation)
    ├── notes-bridge.js        — parseKaizenCsv/parsePeriodFromDate/getPeriodFromRows (Lotus Notes CSV parsing)
    └── fs-sync.js             — File System Access API auto-sync for the Lotus Notes CSV (Chrome/Edge only)
```

`index.html` is markup/CSS/CDN `<script>` tags only — there is no JS logic in it. Third-party libraries
(Tailwind CDN, Chart.js, Lucide, html-to-image) are still loaded via pinned-version CDN `<script>` tags in
`index.html`, not npm imports; modules that use them declare `/* global Chart, lucide */` etc.

**Circular imports are intentional and safe**: `STATE_STORE ↔ CLOUD_SYNC_MANAGER ↔ UI_RENDERER` and
`STORAGE_ENGINE ↔ GEMINI_AI_BRIDGE` import each other. This works because every cross-reference happens
inside a function body, never at module top-level evaluation. Do not move a cross-module call to a file's
top level — that will break the build.

**`vite-plugin-singlefile` must stay in `vite.config.js`**: the "export standalone HTML" feature
(`handleExportHtmlClick` in `main.js`) works by inlining the whole app into one `dist/index.html` at build
time, then reading `document.documentElement.outerHTML` to embed data. Removing the plugin breaks that
export for anyone opening the file on another machine. When testing that feature, you must test against a
`npm run build && npm run preview` build (or the built `dist/index.html` directly) — `npm run dev` serves
modules unbundled and won't reveal the same bugs.

### Data model (IndexedDB, `kaizen_tracker_db`)

```js
sections   = { id, name }
employees  = { id, firstName, lastName, sectionId, annualTarget }
activities = { id, employeeId, year, month, count }  // id is an IndexedDB autoIncrement key, never exported
```

Object stores: `sections`, `employees`, `activities` (unique index `by_emp_year_month`), `settings`
(globalTarget/reportAuthor/geminiApiKeyEnc/Lotus-Notes-sync state), `cryptoKeys` (AES-GCM wrap key for the
Gemini API key). `STORAGE_ENGINE.migrateFromLocalStorage()` migrates old localStorage data once on first
load, only deleting the old data after a confirmed successful IndexedDB write.

The value actually used for target calculations is the single `STATE_STORE.get('globalTarget')` (entered in
the UI, normally 12) — the per-employee `annualTarget` field exists in the data but is **not** used in any
calculation. Don't wire it in unless the user explicitly asks for that behavior change.

### Lotus Notes Bridge

Replaces manual screenshot + Gemini OCR entry with two entry points that both end at
`saveExtractedActivities(extracted, year, month)` in `main.js` (matches names via
`GEMINI_AI_BRIDGE.matchEmployeeByName`, upserts into `activities`, persists via
`STATE_STORE.optimisticUpdate`). Don't fork this logic — change matching/save behavior in
`saveExtractedActivities` only:

1. **"นำเข้าจาก Lotus Notes (CSV)" button** (`handleNotesCsvImportClick`) — opens a modal that, if an
   Auto-Sync file handle is already stored, auto-loads the CSV and pre-fills year/month (via
   `FS_SYNC.readFileForModal()` + `notes-bridge.js`'s `getPeriodFromRows()`); otherwise falls back to manual
   drag-drop. Either way it still goes through the same review screen as OCR import
   (`showOcrReviewModal`, which only ever receives `{name, count}[]`) before saving.
2. **"Auto-Sync จาก Lotus Notes" button** (`handleSetupAutoSyncClick` → `FS_SYNC.setupAutoSync()`/`resumeSync()`)
   — grants one-time read access to a CSV file via `showOpenFilePicker()`, stores the
   `FileSystemFileHandle` in IndexedDB (`settings` key `notesCsvHandle`), and on every subsequent click
   (or silently on app load via `trySilentSync()`, if the browser still considers permission granted)
   re-checks `file.lastModified` against the last-synced timestamp and saves **immediately with no review
   step** if the file is newer.
   - `showOpenFilePicker()`/`requestPermission()` require a real user gesture. Calling them from `init()`
     (no gesture) only works via `queryPermission()` on an already-granted permission — if that permission
     has expired, the user must click the button again. This is intentional fallback behavior, not a bug.
   - A stored handle can go stale (e.g., the underlying file was recreated by something outside the
     browser's knowledge) and start throwing on `getFile()`; `FS_SYNC.resetAutoSync()` (wired to a small
     "เลือกไฟล์ Auto-Sync ใหม่" button) clears the stored handle *and* the dedup/sync-period state so the
     next pick starts clean.
   - The companion `tools/export-kaizen-from-notes.ps1` script (Lotus Notes COM automation) defaults its
     `-Year`/`-Month` and writes its output CSV to a path chosen to avoid OneDrive-synced folders (OneDrive's
     sync engine was observed to churn/invalidate files there, breaking the stored file handle). Don't
     default that output path back under `Documents`/`Desktop` on a machine where those are OneDrive
     Known-Folder-Move redirected.
   - This flow is hard to test via browser automation: `showOpenFilePicker()` requires a real user gesture,
     and CDP-driven clicks may or may not count as one depending on the browser. Verify manually in a real
     browser session.

## Conventions

1. **Escape all user-derived data with `escHtml()`** before interpolating into an HTML template literal
   (employee names, section names, free-text input, etc.). `escHtml` is a bare top-level helper shared by
   every module.
2. **Reuse existing `UI_RENDERER` helpers instead of recomputing stats/charts**: `buildStats(year, month)`
   (used by email summary/HTML, PDF report, email banner), `makePodiumSvg(stats)` (YTD podium SVG — keep the
   default PPE-styled character design if extending it; rank is conveyed via podium/medal/pose/label, not
   costume color), `makeMonthlyBarChartSvg(activities, year, month)` (hand-built SVG bar chart, deliberately
   not Chart.js, for reliable print/capture output).
3. **Modal system**: use `UI_RENDERER.showModal({title, body, actions}, trigger)` /
   `UI_RENDERER.closeModal(trigger)` (has focus trap + ARIA built in). If a modal attaches a
   `document`-level listener (e.g. paste), clean it up via the element's `_onClose` callback so it doesn't
   leak when the modal is closed with Escape.
4. **State is reactive pub/sub** — always read/write via `STATE_STORE.get(key)`/`STATE_STORE.set(key, value)`,
   never keep app state in a free-standing variable. Rendering is wired to `STATE_STORE.on(key, fn)` across 6
   keys (`sections`/`employees`/`activities`/`filterYear`/`filterSection`/`globalTarget`); you don't need to
   call render functions manually after a state mutation.
5. **All CRUD goes through `STATE_STORE.optimisticUpdate(key, next, persistFn)`** (sets state immediately,
   persists to IndexedDB, rolls back + shows an error toast automatically on failure). Never mutate an array
   in state in place — clone it first (`[...arr]`), otherwise rollback is a no-op because `prev` and the
   mutated array are the same reference.
6. **CDN dependency versions are pinned** (Tailwind `3.4.16`, Chart.js `4.4.7`, Lucide `1.28.0`, html-to-image
   `1.11.13`) — don't switch back to unpinned/`@latest` CDN URLs.
7. **Lucide icons**: any code that injects `data-lucide="..."` markup via `innerHTML` must call
   `lucide.createIcons()` afterward, except the 5 `UI_RENDERER` generator functions
   (`generateEmailSummary`/`generateEmailHtml`/`makePodiumSvg`/`generateReportHtml`/`generateEmailBannerContent`)
   whose output is rendered outside the live DOM (standalone/print/screenshot), where `createIcons()` has no
   effect.
8. **Email Banner** captures a hidden div in the main document (not an iframe — cross-iframe font/style
   resolution is unreliable) via `html-to-image`, then copies it to the clipboard as PNG
   (`navigator.clipboard.write`), falling back to a file download if the Clipboard API isn't available.
9. **Fonts**: Noto Sans Thai (app body) + Fraunces (`#main-header-title` only); Sarabun is kept for the
   Email Banner capture div and generated PDF/email/banner documents specifically — don't change those.
10. **Firebase scaffold is intentionally disabled**: `APP_CONFIG.features.cloudSyncEnabled`/`authEnabled` are
    both `false`. Don't enable them or add the Firebase SDK unless the user explicitly asks.
11. **All UI text is Thai.** Match the existing tone for any new user-facing strings.
12. **Chart.js is optional** — `renderDashboardChart()` checks `typeof Chart === 'undefined'` and skips the
    chart rather than crashing if the CDN failed to load. Follow this pattern for any new CDN dependency.

## Testing changes

- `npm test` covers `escHtml`, `GEMINI_AI_BRIDGE.matchEmployeeByName` (fuzzy matching, shared by OCR and the
  Lotus Notes CSV bridge), and `STORAGE_ENGINE.serializeForExport` (regression test for a real past
  `</script>`-escaping bug). Add tests only for similarly complex or previously-broken logic, not for
  coverage's sake.
- After JS changes, check the browser console for errors — routine `info`-level logs from
  `CLOUD_SYNC_MANAGER.pushChange`/`AUTH_PROVIDER.signInAnonymously` ("skipped — feature flag off") are
  expected and not a problem.
- Check DevTools → Application → IndexedDB → `kaizen_tracker_db` has all 5 stores with the expected row
  counts when verifying data-layer changes.
- Exercise the actual flow you changed end-to-end, e.g.: save an activity → table updates, and resubmitting
  the same employee/year/month updates in place rather than duplicating a row; import a JSON file with
  duplicate records → monthly totals still match; export PDF/email banner → open the preview and check
  podium/colors/numbers.
- Changes to `handleExportHtmlClick`/`serializeForExport` (the standalone-HTML export feature) must be
  tested against `npm run build && npm run preview`, not `npm run dev` — dev mode serves unbundled modules
  and won't surface the same bugs as the inlined production build.
