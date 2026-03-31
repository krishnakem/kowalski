# Scheduled Wake: macOS `pmset` Implementation Plan

**Goal:** Use macOS `pmset schedule wake` so the Mac wakes from sleep before the Baker runs, ensuring digests are generated even when the laptop lid is closed.

**Problem:** The current "Insomnia Mode" (`caffeinate`) prevents sleep while the app is running *and* the Mac is on AC power. But if the user closes the lid or the Mac enters deep sleep, `caffeinate` has no effect — the Baker misses its window and the user wakes up to no digest.

`pmset schedule wake` is an OS-level RTC alarm that wakes the hardware regardless of lid state.

---

## What Already Exists

The codebase already handles several wake/sleep concerns. Here is what is in place:

### 1. `caffeinate` Insomnia Mode — DONE
**File:** `src/main/services/SchedulerService.ts`, lines 193–227

The `SchedulerService` spawns `caffeinate -i -s -w <pid>` when the Mac is on AC power, and kills it on battery. This prevents idle sleep while the app is running and plugged in.

- `enableInsomnia()` (line 204): spawns `caffeinate` with `-i` (prevent idle sleep), `-s` (prevent system sleep), `-w` (tied to Kowalski PID)
- `disableInsomnia()` (line 220): kills the caffeinate process
- `handleInsomniaState()` (line 196): decides based on `powerMonitor.isOnBatteryPower()`

**Limitation:** Only works while the app is running. Does not wake a sleeping Mac.

### 2. `powerSaveBlocker` — DONE
**File:** `src/main/services/SchedulerService.ts`, line 139

On `initialize()`, the scheduler calls `powerSaveBlocker.start('prevent-app-suspension')`. This is an Electron API that tells macOS not to App Nap the process.

### 3. `powerMonitor` Resume Listener — DONE
**File:** `src/main/services/SchedulerService.ts`, lines 148–151

On `powerMonitor.on('resume')`, the scheduler restarts the heartbeat. This ensures that if the Mac does wake (from user action or any other reason), the scheduler immediately re-evaluates whether a Baker or Delivery run is needed.

### 4. AC/Battery Power Listeners — DONE
**File:** `src/main/services/SchedulerService.ts`, lines 163–173

`powerMonitor.on('on-ac')` and `powerMonitor.on('on-battery')` dynamically toggle Insomnia Mode, so battery drain is avoided when unplugged.

### 5. Wake Time Tracking — DONE
**File:** `src/main/services/SchedulerService.ts`, line 45 (`lastWakeTime`), line 135 (set on init)
**IPC:** `src/main/main.ts`, line 441 (`settings:get-wake-time`)
**Preload:** `src/preload/preload.cts`, line 25 (`getWakeTime`)
**UI hook:** `src/hooks/useSystemWakeTime.ts`
**UI consumer:** `src/components/screens/AgentActiveScreen.tsx`, line 29

The app tracks when it started/woke and exposes this to the renderer. The UI uses it to calculate the next analysis time and apply prep-time buffers.

### 6. Prep Buffer Logic — DONE
**File:** `src/main/services/SchedulerService.ts`, lines 363–381 (`canScheduleForToday`), lines 410–418 (Baker buffer check)
**UI mirror:** `src/lib/timeUtils.ts`, lines 54–86

If the machine just woke and a Baker slot is imminent, the scheduler skips rather than running on a cold boot with stale data. This prevents "burst" scenarios.

### 7. Auto-Launch on Login — DONE
**File:** `src/main/main.ts`, lines 30–34

`app.setLoginItemSettings({ openAtLogin: true })` ensures Kowalski starts when the user logs in. However, this only runs after macOS is booted and the user is logged in — it does not wake the machine.

### 8. Delivery Time Configuration UI — DONE
**File:** `src/pages/settings/ScheduleSettings.tsx`

Users can set morning time, evening time, and frequency (1x or 2x daily). No wake/sleep toggle exists in the UI.

### 9. `ActiveSchedule` Type — DONE
**File:** `src/types/schedule.ts`

```typescript
export interface ActiveSchedule {
    morningTime: string;   // e.g., "8:00 AM"
    eveningTime: string;   // e.g., "4:00 PM"
    digestFrequency: 1 | 2;
    activeDate: string;    // e.g., "2026-03-12"
}
```

### 10. Electron-Store Keys (current) — DONE
Derived from `SchedulerService.ts` and `main.ts` IPC handlers:

| Key | Type | Purpose |
|-----|------|---------|
| `settings.digestFrequency` | `1 \| 2` | Once or twice daily |
| `settings.morningTime` | `string` | Delivery time (e.g., "8:00 AM") |
| `settings.eveningTime` | `string` | Evening delivery time |
| `settings.lastBakeDate` | `ISO string` | When Baker last ran |
| `settings.lastDeliveryDate` | `ISO string` | When Delivery Boy last ran |
| `settings.analysisStatus` | `string` | `idle` / `pending_delivery` / `ready` |
| `settings.hasOnboarded` | `boolean` | Onboarding complete flag |
| `settings.userName` | `string` | Display name |
| `settings.location` | `string` | User location |
| `activeSchedule` | `ActiveSchedule` | Locked daily snapshot |
| `analyses` | `array` | Metadata for past analyses |

### 11. Baker Timing — DONE
**File:** `src/main/services/SchedulerService.ts`, lines 17–19

```
BAKER_LEAD_TIME_MS = 2 * 60 * 1000    // 2 minutes before delivery (TESTING value)
PREP_BUFFER_MS     = 15 * 1000         // 15 seconds buffer (TESTING value)
```

Production values should be ~2.5–3 hours for Baker lead time. The deterministic random offset (`getDeterministicBakeOffset`, lines 110–119) adds 0–30 minutes of jitter per day.

---

## What Does NOT Exist (NEW work required)

### No `pmset` integration — NEW
There is zero `pmset` usage anywhere in the codebase. The Mac cannot wake itself from sleep for scheduled Baker runs.

### No wake scheduling logic — NEW
No code calculates "when should the Mac wake up" based on the Baker's schedule. The Baker lead time and delivery time exist, but there is no code that translates these into a `pmset schedule wake` call.

### No wake toggle in Settings UI — NEW
`ScheduleSettings.tsx` has frequency and time selectors but no checkbox/toggle for "Wake Mac for scheduled analysis."

### No `pmset` permission handling — NEW
`pmset schedule wake` requires `sudo` (or a helper installed with root privileges). There is no privileged helper, no authorization flow, and no error handling for permission denial.

### No wake cleanup on quit — NEW
If the app schedules a `pmset wake` and then the user quits or changes their schedule, the old wake event needs to be cancelled. No cancellation logic exists.

---

## Implementation Plan

### Phase 1: Core `pmset` Wake Scheduling — NEW

**File: `src/main/services/WakeScheduler.ts`** (new file)

Create a dedicated service that:

1. Calculates the next required wake time from `ActiveSchedule` + `BAKER_LEAD_TIME_MS` + `getDeterministicBakeOffset()`
2. Shells out to `pmset schedule wake "MM/DD/YYYY HH:MM:SS"`
3. Tracks the currently scheduled wake so it can be cancelled/updated
4. Handles errors (no sudo, pmset not available, non-macOS)

```typescript
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export class WakeScheduler {
    private static instance: WakeScheduler;
    private scheduledWakeTime: Date | null = null;

    static getInstance(): WakeScheduler {
        if (!WakeScheduler.instance) {
            WakeScheduler.instance = new WakeScheduler();
        }
        return WakeScheduler.instance;
    }

    /**
     * Schedule a macOS RTC wake alarm.
     * pmset format: "MM/dd/yyyy HH:mm:ss"
     */
    async scheduleWake(wakeTime: Date): Promise<boolean> {
        if (process.platform !== 'darwin') return false;

        // Cancel any existing scheduled wake first
        await this.cancelWake();

        const formatted = this.formatPmsetDate(wakeTime);
        try {
            // pmset schedule wake requires root — use osascript for auth prompt
            await execAsync(
                `osascript -e 'do shell script "pmset schedule wake \\"${formatted}\\"" with administrator privileges'`
            );
            this.scheduledWakeTime = wakeTime;
            console.log(`⏰ pmset wake scheduled for ${formatted}`);
            return true;
        } catch (err: any) {
            console.error('⏰ Failed to schedule wake:', err.message);
            return false;
        }
    }

    /**
     * Cancel any Kowalski-scheduled wake events.
     */
    async cancelWake(): Promise<void> {
        if (!this.scheduledWakeTime || process.platform !== 'darwin') return;

        const formatted = this.formatPmsetDate(this.scheduledWakeTime);
        try {
            await execAsync(
                `osascript -e 'do shell script "pmset schedule cancel wake \\"${formatted}\\"" with administrator privileges'`
            );
            console.log(`⏰ pmset wake cancelled: ${formatted}`);
        } catch (err: any) {
            console.warn('⏰ Failed to cancel wake (may already be past):', err.message);
        }
        this.scheduledWakeTime = null;
    }

    private formatPmsetDate(date: Date): string {
        const mm = String(date.getMonth() + 1).padStart(2, '0');
        const dd = String(date.getDate()).padStart(2, '0');
        const yyyy = date.getFullYear();
        const HH = String(date.getHours()).padStart(2, '0');
        const MM = String(date.getMinutes()).padStart(2, '0');
        const ss = String(date.getSeconds()).padStart(2, '0');
        return `${mm}/${dd}/${yyyy} ${HH}:${MM}:${ss}`;
    }
}
```

**Key design decisions:**
- Uses `osascript ... with administrator privileges` to get a one-time auth prompt instead of requiring a LaunchDaemon or privileged helper. This is simpler but shows a macOS password dialog.
- Alternative: Install a `launchd` plist with root privileges during app setup for silent operation. This is Phase 3 territory.

### Phase 2: Integrate with SchedulerService — NEW

**File: `src/main/services/SchedulerService.ts`**

Add wake scheduling calls at these points:

| Trigger | Location | Action |
|---------|----------|--------|
| `ensureDailySnapshot()` creates/refreshes snapshot | Lines 235–289 | Call `WakeScheduler.scheduleWake()` for next Baker time |
| `settings:set` IPC handler hot-patches schedule | `main.ts` lines 346–373 | Recalculate and reschedule wake |
| `settings:patch` IPC handler | `main.ts` lines 376–403 | Recalculate and reschedule wake |
| `triggerBaker()` completes | Line 593 | Schedule wake for next slot (evening, or next day morning) |
| `stop()` / `before-quit` | Lines 121–131, `main.ts` line 253 | Call `WakeScheduler.cancelWake()` |

New method to add to `SchedulerService`:

```typescript
private async scheduleNextWake(activeSchedule: ActiveSchedule): Promise<void> {
    const now = new Date();
    const today = this.formatLocalDate(now);

    // Find the next Baker time that hasn't passed
    const slots: string[] = [activeSchedule.morningTime];
    if (activeSchedule.digestFrequency === 2) {
        slots.push(activeSchedule.eveningTime);
    }

    for (const slotTime of slots) {
        const deliveryTime = this.parseTimeString(slotTime, now);
        const offset = this.getDeterministicBakeOffset(today);
        const bakeTime = new Date(deliveryTime.getTime() - BAKER_LEAD_TIME_MS + offset);

        // Wake 5 minutes before bake time to allow boot + app launch
        const wakeTime = new Date(bakeTime.getTime() - 5 * 60 * 1000);

        if (wakeTime > now) {
            await WakeScheduler.getInstance().scheduleWake(wakeTime);
            return;
        }
    }

    // All today's slots have passed — schedule for tomorrow morning
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = this.formatLocalDate(tomorrow);
    const morningDelivery = this.parseTimeString(activeSchedule.morningTime, tomorrow);
    const offset = this.getDeterministicBakeOffset(tomorrowStr);
    const bakeTime = new Date(morningDelivery.getTime() - BAKER_LEAD_TIME_MS + offset);
    const wakeTime = new Date(bakeTime.getTime() - 5 * 60 * 1000);

    await WakeScheduler.getInstance().scheduleWake(wakeTime);
}
```

### Phase 3: Settings UI Toggle — NEW

**File: `src/pages/settings/ScheduleSettings.tsx`**

Add a toggle switch below the time selectors:

```tsx
{/* Wake for Scheduled Analysis (macOS only) */}
{process.platform === 'darwin' && (
  <div className="flex items-center justify-between py-3">
    <div className="space-y-1">
      <Label className="text-sm text-foreground font-sans">
        Wake Mac for Analysis
      </Label>
      <p className="text-xs text-foreground/60 font-sans">
        Wakes your Mac from sleep so digests are ready on time
      </p>
    </div>
    <Switch
      checked={settings.wakeForAnalysis ?? false}
      onCheckedChange={(checked) =>
        setSettings({ ...settings, wakeForAnalysis: checked })
      }
    />
  </div>
)}
```

**New setting key:** `settings.wakeForAnalysis` (`boolean`, default `false`)

### Phase 4: Electron-Store Schema Update — NEW

Add to `SchedulerSettings` interface in `SchedulerService.ts` (line 23):

```typescript
interface SchedulerSettings {
    // ... existing fields ...
    wakeForAnalysis?: boolean;  // NEW: enable pmset wake scheduling
}
```

Add to `ActiveSchedule` type in `src/types/schedule.ts` — **no change needed**. The wake scheduling is derived from the existing `ActiveSchedule` fields; no new type fields required.

### Phase 5: Permission UX — NEW

The `osascript` approach shows a macOS password dialog on first use. For a better UX:

1. When the user enables "Wake Mac for Analysis", immediately attempt a test `pmset schedule cancel wake "01/01/2000 00:00:00"` via osascript to trigger the auth prompt
2. If auth fails, show a toast: "macOS permission required to schedule wake alarms"
3. Store auth success in settings so we don't re-prompt unnecessarily (macOS caches the auth for the session)

**Alternative (future):** Ship a privileged LaunchDaemon helper (`com.kowalski.wake-helper.plist`) installed via `SMJobBless` or `ServiceManagement`. This allows silent `pmset` calls without repeated auth prompts. This is significantly more complex and should be a v2 enhancement.

---

## File Change Summary

| File | Status | Changes Needed |
|------|--------|----------------|
| `src/main/services/SchedulerService.ts` | **PARTIAL** — Has caffeinate, powerMonitor, baker timing. | Add `scheduleNextWake()` calls at snapshot creation, baker completion, and quit. Import `WakeScheduler`. |
| `src/main/services/WakeScheduler.ts` | **NEW** | Entire file: pmset schedule/cancel logic |
| `src/main/main.ts` | **PARTIAL** — Has IPC handlers, scheduler init, before-quit cleanup. | Add `WakeScheduler.cancelWake()` to `before-quit`. Add wake recalc in `settings:set` and `settings:patch` handlers. |
| `src/pages/settings/ScheduleSettings.tsx` | **PARTIAL** — Has time/frequency UI. | Add "Wake Mac for Analysis" toggle. |
| `src/types/schedule.ts` | **DONE** — No changes needed. | Wake time is derived from existing `ActiveSchedule` fields. |
| `src/main/services/SchedulerService.ts` (interface) | **PARTIAL** — `SchedulerSettings` exists. | Add `wakeForAnalysis?: boolean` field. |
| `src/preload/preload.cts` | **DONE** — Already exposes `getWakeTime`. | No changes needed for wake scheduling (pmset is main-process only). |

---

## Risk Assessment

| Risk | Mitigation |
|------|------------|
| `pmset` requires sudo | Use `osascript with administrator privileges` for auth prompt; degrade gracefully if denied |
| User changes schedule after wake is set | Cancel + reschedule in `settings:set` / `settings:patch` IPC handlers |
| Multiple wake events accumulate | Always cancel before scheduling; track `scheduledWakeTime` in memory |
| Mac wakes but Kowalski isn't running | `openAtLogin: true` (line 30-34 of main.ts) handles this — app auto-starts on login. But if Mac wakes to lock screen without auto-login, the app won't start until user logs in. Consider adding a LaunchDaemon (Phase 5 alt). |
| Non-macOS platforms | Guard all pmset calls with `process.platform !== 'darwin'` early return |
| Testing values vs production | `BAKER_LEAD_TIME_MS` is currently 2 min (testing). Wake scheduling must use the same constant so wake time is consistent with baker trigger time. |

---

## Testing Checklist

- [ ] Schedule a wake 2 minutes from now, close lid, verify Mac wakes
- [ ] Change delivery time in Settings → verify old wake cancelled, new one scheduled
- [ ] Disable "Wake Mac for Analysis" → verify wake cancelled
- [ ] Quit app → verify wake cancelled
- [ ] Deny macOS auth prompt → verify graceful degradation (toast, setting stays off)
- [ ] Run on battery → verify caffeinate is off but pmset wake still works (pmset wakes regardless of power state)
- [ ] Verify Baker runs after pmset wake + auto-login
