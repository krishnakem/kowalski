# Scheduling & Daemon Removal Plan

Replace the entire Baker/Delivery Boy scheduling system with a single "Run Now" button. No background daemon, no cron-like heartbeat, no insomnia mode, no timed triggers. User clicks a button, the pipeline runs, digest appears when done.

## What to REMOVE

### SchedulerService.ts — almost entirely

The core scheduling engine (~1,096 lines). Nearly all of it goes away.

| Feature | Lines (est.) | Purpose |
|---------|-------------|---------|
| Heartbeat loop (`setInterval` every 60s) | ~30 | Polling for schedule triggers |
| `checkSchedule()` | ~80 | Evaluates Baker/Delivery timing |
| `shouldTriggerBaker()` / `shouldTriggerDelivery()` | ~60 | Time-window logic |
| `triggerBaker()` / `triggerBakerScreenshotFirst()` | ~150 | Prep pipeline with timing |
| `triggerDelivery()` | ~40 | Delivers analysis at exact time |
| `archivePendingAnalysis()` | ~30 | Collision handling |
| Insomnia mode (`caffeinate` process) | ~60 | Prevents macOS sleep |
| Power monitor listeners (AC/battery) | ~30 | Toggles insomnia |
| `getDeterministicBakeOffset()` | ~15 | Randomized daily bake time |
| Active date locking / daily snapshot | ~40 | Per-day schedule snapshot |
| `formatLocalDate()` / `parseTimeString()` | ~30 | Schedule time parsing |
| `canScheduleForToday()` | ~20 | Morning slot viability check |
| `handleAnalysisError()` | ~40 | Error → retry scheduling |
| Baker/Delivery state tracking | ~50 | `lastBakeDate`, `lastDeliveryDate`, `analysisStatus` |

**KEEP from SchedulerService:**
- `triggerDebugRun()` / `triggerDebugRunScreenshotFirst()` — this IS the "run now" logic. Extract and simplify into a new `RunManager` or inline into IPC handlers.
- `stopDebugRun()` — the stop mechanism.
- The actual pipeline orchestration (calls to `Kowalski.browseAndCapture()`, filter pipeline, `AnalysisGenerator.generate()`) — this is the work, not the scheduling.

### main.ts — scheduling-related IPC handlers and daemon init

| Code | What it does |
|------|-------------|
| `SchedulerService.getInstance().initialize()` (deferred 2s) | Starts the background daemon |
| `app.setLoginItemSettings({ openAtLogin: true })` | Auto-launch on boot |
| `ipcMain.handle('settings:get-active-schedule')` | Fetches locked daily snapshot |
| `ipcMain.handle('settings:get-wake-time')` | Returns app startup time |
| Hot-patch logic in `settings:set` / `settings:patch` | Updates activeSchedule on change |
| `SchedulerService.getInstance().stop()` on `will-quit` | Stops daemon on quit |
| `SchedulerService.getInstance().setMainWindow(mainWindow)` | Shares window ref |
| `schedule-updated` event emission | Notifies renderer of schedule changes |

**KEEP from main.ts:**
- `Cmd+Shift+H` shortcut → wire to new "run now" handler
- `Cmd+Shift+K` shortcut → wire to stop handler
- All non-scheduling IPC (auth, settings get/set, session validation, data wipe)

### React Components

| File | What to remove |
|------|---------------|
| `src/pages/settings/ScheduleSettings.tsx` | **Delete entire file.** Frequency toggle, morning/evening time pickers. |
| `src/components/screens/ZeroStateScreen.tsx` | **Remove Step 3 ("The Routine").** Keep name entry, API key, Instagram login. The onboarding goes from 4 steps to 3. |
| `src/components/screens/AgentActiveScreen.tsx` | **Rewrite.** Remove `useDailySnapshot`, `useSystemWakeTime`, `getNextAnalysisTime()`, daily snapshot logic. Replace with a "Run Now" button + status display (idle / running / done). |
| `src/components/ui/DebugRunTimer.tsx` | **Keep but rename.** This becomes the main run timer (not "debug"). Remove "debug" naming. |

### Hooks — delete

| File | Why |
|------|-----|
| `src/hooks/useDailySnapshot.ts` | Fetches schedule snapshot — no schedule anymore |
| `src/hooks/useSystemWakeTime.ts` | Used for buffer calculations — no buffers anymore |

### Utilities — delete or gut

| File | Action |
|------|--------|
| `src/lib/timeUtils.ts` | Delete `getNextAnalysisTime()` (~120 lines). Keep `getTimeOfDayGreeting()` if used elsewhere. |
| `src/utils/timeValidation.ts` | **Delete entire file.** Morning/evening validation logic. |
| `src/lib/constants.ts` | Remove `TIME_OPTIONS`, `MORNING_TIME_OPTIONS`, `EVENING_TIME_OPTIONS`. Keep any non-schedule constants. |

### Types — delete

| File | Action |
|------|--------|
| `src/types/schedule.ts` | **Delete entire file.** `ActiveSchedule` interface no longer needed. |

### Preload bridge — remove schedule channels

From `src/preload/preload.cts`, remove:
- `settings.getActiveSchedule()`
- `settings.getWakeTime()`
- `settings.onScheduleUpdated(callback)`

Keep:
- `settings.onDebugRunStarted()` → rename to `settings.onRunStarted()`
- `settings.onDebugRunComplete()` → rename to `settings.onRunComplete()`
- `settings.onAnalysisReady(callback)`
- `settings.onAnalysisError(callback)`
- `settings.onSessionExpired()`, `onRateLimited()`, `onInsufficientContent()`

### Settings stored in electron-store — clean up

Remove these keys from stored settings (or just stop reading them):
- `morningTime`
- `eveningTime`
- `digestFrequency`
- `lastBakeDate`
- `lastDeliveryDate`
- `analysisStatus` (or repurpose as simple `'idle' | 'running' | 'done'`)
- `activeDate`
- `activeSchedule`

---

## What to BUILD

### New: `RunManager` service

A simple class that replaces SchedulerService. No timers, no polling, no daemon. Just imperative "run the pipeline."

```
RunManager
├── startRun(options?: { headless?: boolean })
│   → validates session
│   → launches browser
│   → runs StoriesAgent → FeedAgent pipeline
│   → runs filter pipeline
│   → runs digest generation
│   → emits 'run-complete' with analysis
│   → emits 'run-error' on failure
│
├── stopRun()
│   → stops active agent
│
├── getStatus(): 'idle' | 'running'
│
└── Events:
    ├── 'run-started' → { startTime }
    ├── 'run-complete' → { analysis }
    └── 'run-error' → { error }
```

This is essentially the body of `triggerDebugRunScreenshotFirst()` extracted into its own class without any scheduling wrapper.

### New: "Run Now" button in AgentActiveScreen

Replace the "next analysis" countdown with a simple button:

```
┌─────────────────────────────┐
│                             │
│       [🔍 Run Now]          │  ← idle state
│                             │
│   Last run: 2 hours ago     │
│                             │
└─────────────────────────────┘

┌─────────────────────────────┐
│                             │
│   🔍 Browsing: 4:32         │  ← running state (reuse DebugRunTimer)
│                             │
│       [Stop]                │
│                             │
└─────────────────────────────┘

┌─────────────────────────────┐
│                             │
│   ✅ Digest ready            │  ← done state
│                             │
│   [View Digest] [Run Again] │
│                             │
└─────────────────────────────┘
```

### New IPC handlers in main.ts

```typescript
ipcMain.handle('run:start', async () => {
    await RunManager.getInstance().startRun();
});

ipcMain.handle('run:stop', async () => {
    RunManager.getInstance().stopRun();
});

ipcMain.handle('run:status', () => {
    return RunManager.getInstance().getStatus();
});
```

Wire `Cmd+Shift+H` to `run:start` and `Cmd+Shift+K` to `run:stop`.

### Updated onboarding (ZeroStateScreen)

Remove Step 3 entirely. The flow becomes:

1. **Name** — "What should I call you?"
2. **API Key** — Anthropic API key entry
3. **Instagram Login** — Login via overlay browser
4. **Done** — "You're all set. Click Run to get your first digest."

---

## Implementation Steps

### Step 1 — Create RunManager

New file: `src/main/services/RunManager.ts`

Extract the pipeline logic from `SchedulerService.triggerDebugRunScreenshotFirst()` into a clean class. The pipeline is roughly:

1. Validate Instagram session
2. Launch browser (headless by default, visible with Cmd+Shift+H)
3. Call `Kowalski.browseAndCapture()`
4. Run filter pipeline on raw screenshots
5. Run `AnalysisGenerator.generate()` or `DigestGeneration` on filtered output
6. Emit result to renderer via `mainWindow.webContents.send()`
7. Archive previous analysis if exists

Strip out: bake offset timing, delivery windows, insomnia mode, power monitoring, active date locking, double-delivery prevention.

### Step 2 — Wire IPC handlers

In `main.ts`:
- Add `run:start`, `run:stop`, `run:status` handlers
- Remove all `settings:get-active-schedule`, `settings:get-wake-time` handlers
- Remove `SchedulerService.getInstance().initialize()` deferred init
- Remove `app.setLoginItemSettings({ openAtLogin: true })` (user can re-enable manually if wanted)
- Remove insomnia/power monitor setup
- Keep `Cmd+Shift+H` → `RunManager.getInstance().startRun()`
- Keep `Cmd+Shift+K` → `RunManager.getInstance().stopRun()`

### Step 3 — Update preload bridge

In `src/preload/preload.cts`:
- Remove `getActiveSchedule`, `getWakeTime`, `onScheduleUpdated`
- Rename `onDebugRunStarted` → `onRunStarted`
- Rename `onDebugRunComplete` → `onRunComplete`
- Add `run.start()`, `run.stop()`, `run.getStatus()` IPC invoke wrappers

### Step 4 — Rewrite AgentActiveScreen

Replace schedule-driven UI with button-driven UI:
- Remove `useDailySnapshot`, `useSystemWakeTime` imports
- Remove `getNextAnalysisTime()` calculations
- Add state machine: `idle` → `running` → `done`
- "Run Now" button calls `window.api.run.start()`
- Running state shows countdown timer (reuse DebugRunTimer logic)
- Done state shows "View Digest" / "Run Again" buttons

### Step 5 — Simplify ZeroStateScreen

Remove Step 3 ("The Routine"):
- Delete frequency selection cards
- Delete morning/evening time pickers
- Delete `TIME_OPTIONS`, `MORNING_TIME_OPTIONS`, `EVENING_TIME_OPTIONS` usage
- Update step count from 4 to 3
- Final step says "Click Run to get your first digest" instead of showing a schedule

### Step 6 — Delete dead files

| Action | Files |
|--------|-------|
| Delete | `src/pages/settings/ScheduleSettings.tsx` |
| Delete | `src/hooks/useDailySnapshot.ts` |
| Delete | `src/hooks/useSystemWakeTime.ts` |
| Delete | `src/utils/timeValidation.ts` |
| Delete | `src/types/schedule.ts` |
| Gut | `src/lib/timeUtils.ts` (keep `getTimeOfDayGreeting` only) |
| Gut | `src/lib/constants.ts` (remove time option arrays) |

### Step 7 — Delete or gut SchedulerService

Either delete `SchedulerService.ts` entirely (if RunManager fully replaces it), or gut it down to just the debug run methods if other code still references it. Prefer deletion — cleaner.

### Step 8 — Update Settings page

Remove the "Schedule" tab/section from the Settings page. The settings page should only show: API key, personal info, interests, and maybe a "Run Settings" section (headless vs visible, session duration).

### Step 9 — Clean up electron-store schema

Remove schedule-related keys from the default settings and any stored settings type definitions. Add a simple `lastRunDate` timestamp if you want "Last run: X ago" display.

### Step 10 — Verify

1. `npx tsc --noEmit` — clean compile
2. App launches without background daemon starting
3. "Run Now" button triggers the full pipeline
4. Cmd+Shift+H triggers a run
5. Cmd+Shift+K stops a running session
6. Digest appears in GazetteScreen when pipeline completes
7. No `setInterval`, `caffeinate`, or `powerMonitor` references remain

---

## Files Changed Summary

| File | Action |
|------|--------|
| `src/main/services/RunManager.ts` | **NEW** — pipeline runner |
| `src/main/services/SchedulerService.ts` | **DELETE** |
| `src/main/main.ts` | Remove scheduling init, add run IPC handlers |
| `src/preload/preload.cts` | Remove schedule channels, add run channels |
| `src/components/screens/AgentActiveScreen.tsx` | Rewrite — button-driven UI |
| `src/components/screens/ZeroStateScreen.tsx` | Remove Step 3 |
| `src/components/ui/DebugRunTimer.tsx` | Rename to RunTimer, keep logic |
| `src/pages/settings/ScheduleSettings.tsx` | **DELETE** |
| `src/hooks/useDailySnapshot.ts` | **DELETE** |
| `src/hooks/useSystemWakeTime.ts` | **DELETE** |
| `src/utils/timeValidation.ts` | **DELETE** |
| `src/types/schedule.ts` | **DELETE** |
| `src/lib/timeUtils.ts` | Gut (keep greeting only) |
| `src/lib/constants.ts` | Remove time options |
| `src/vite-env.d.ts` | Update window.api types |

## Files NOT Changed

| File | Why |
|------|-----|
| `src/main/services/Kowalski.ts` | Pipeline orchestration stays the same |
| `src/main/services/StoriesAgent.ts` | Agent logic unchanged |
| `src/main/services/FeedAgent.ts` | Agent logic unchanged |
| `src/main/services/BrowserManager.ts` | Browser management unchanged |
| `src/main/services/AnalysisGenerator.ts` | Digest generation unchanged |
| `src/main/services/Filterer.ts` | Filter pipeline unchanged |
| `src/components/screens/GazetteScreen.tsx` | Digest display unchanged |
