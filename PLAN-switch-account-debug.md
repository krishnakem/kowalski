# Implementation Plan: Fix "Switch Account" to Launch Fresh Chromium Instance

## Problem Summary

When clicking "Switch Account" in Personal Settings, the Chromium window opens with the **previous account still logged in** instead of showing a fresh login screen. Sometimes it shows a white screen. The expected behavior is to replicate the onboarding flow: launch a fresh Chromium browser instance with a clean session, prompting the user to log in.

---

## Root Cause Analysis

### Current Flow (Settings → Switch Account)

1. **[PersonalSettings.tsx:130-134]** - User clicks "Switch Account"
2. **`clearInstagramSession()`** is called which:
   - Deletes `session.json` (the cookie backup file)
   - Clears the Electron `SHARED_PARTITION` storage
3. **`setIsLoginOpen(true)`** opens the `InstagramConnectModal`
4. **[InstagramConnectModal.tsx:55]** calls `window.api.startLogin(bounds)`
5. **[BrowserManager.ts:196]** `login()` → `launch()` is called

### The Bug: Persistent Browser Context Not Cleared

The critical issue is in **[BrowserManager.ts:88-105]**:

```typescript
this.browserContext = await chromium.launchPersistentContext(persistentContextPath, {...})
```

The `clearInstagramSession()` IPC handler only clears:
- `session.json` file
- Electron's `SHARED_PARTITION` storage

**It does NOT clear the Playwright persistent browser context directory at `kowalski_browser/`**, which contains:
- Cookies
- LocalStorage
- IndexedDB
- All browser state including Instagram login session

When `BrowserManager.launch()` is called, it:
1. Closes any existing browser instance (line 35-38) ✓
2. Relaunches with the **same persistent profile directory** (line 42, 88) ✗

The persistent profile still contains the Instagram session cookies, so the user appears logged in immediately.

### Why Onboarding Works

Onboarding works because it's typically the first launch—the `kowalski_browser/` directory either doesn't exist or is fresh. After the user logs in once, subsequent "Switch Account" attempts reuse this now-populated persistent profile.

### The White Screen Issue

The white screen likely occurs because:
1. The `--app=https://www.instagram.com/accounts/login/` argument navigates to login
2. Instagram detects the user is already logged in
3. Instagram redirects to the feed/home page
4. The login detection selector `svg[aria-label="Home"]` fires immediately
5. The browser closes before rendering completes, leaving a flash/white screen

---

## Solution: Clear Persistent Browser Data Before Switch Account

### Required Changes

#### 1. Enhance `clear-instagram-session` IPC Handler

**File:** [src/main/main.ts:396-415](src/main/main.ts#L396-L415)

Add a call to `BrowserManager.getInstance().clearData()` to wipe the persistent browser profile:

```typescript
ipcMain.handle('clear-instagram-session', async () => {
  console.log('🧹 Clearing Instagram Session only...');
  try {
    // 1. Delete session.json
    const userDataPath = app.getPath('userData');
    const sessionPath = path.join(userDataPath, 'session.json');
    if (fs.existsSync(sessionPath)) {
      fs.unlinkSync(sessionPath);
    }

    // 2. Clear ONLY the Instagram View partition
    await session.fromPartition(SHARED_PARTITION).clearStorageData();

    // 3. NEW: Clear the Playwright persistent browser profile
    await BrowserManager.getInstance().clearData();

    return true;
  } catch (e) {
    console.error('Clear Instagram Session Error:', e);
    return false;
  }
});
```

This ensures the `kowalski_browser/` directory is wiped, so the next `login()` call creates a truly fresh browser instance.

#### 2. Alternative: Create a Dedicated `switchAccount` Method in BrowserManager

**File:** [src/main/services/BrowserManager.ts](src/main/services/BrowserManager.ts)

For cleaner separation, add a dedicated method that explicitly resets state before login:

```typescript
/**
 * Switches Instagram account by clearing all browser state and launching fresh login.
 */
public async switchAccount(bounds: Electron.Rectangle, mainWindow: BrowserWindow): Promise<boolean> {
    console.log('🔄 BrowserManager: Switching Account (Full Reset)...');

    // 1. Nuclear clear - wipe persistent profile
    await this.clearData();

    // 2. Launch fresh login overlay
    return this.login(bounds, mainWindow);
}
```

Then add a new IPC handler:

```typescript
ipcMain.handle('auth:switch-account', async (_event, bounds) => {
    if (!mainWindow) return false;
    return BrowserManager.getInstance().switchAccount(bounds, mainWindow);
});
```

And expose in preload:

```typescript
switchAccount: (bounds: any) => ipcRenderer.invoke('auth:switch-account', bounds),
```

#### 3. Update PersonalSettings to Use New Flow

**File:** [src/pages/settings/PersonalSettings.tsx:130-138](src/pages/settings/PersonalSettings.tsx#L130-L138)

If using the dedicated method (Option 2), update the onClick handler:

```typescript
onClick={async () => {
  try {
    // Clear session files (session.json + Electron partition)
    await (window as any).api.clearInstagramSession();
    toast.success("Logged out. Please sign in.");
    setIsLoginOpen(true); // Open Modal - it will call switchAccount instead of startLogin
  } catch (e) {
    toast.error("Failed to switch account");
  }
}}
```

Or modify `InstagramConnectModal` to accept a prop indicating "switch mode" vs "connect mode".

---

## Recommended Implementation Path

### Option A: Minimal Change (Recommended)

Modify only **[src/main/main.ts:396-415](src/main/main.ts#L396-L415)** to add `BrowserManager.getInstance().clearData()` call.

**Pros:**
- Single file change
- No new API surface
- Existing frontend code unchanged

**Cons:**
- Every "clear session" now wipes browser data (might be slower)

### Option B: Dedicated Switch Account Flow

Add `switchAccount()` method and IPC handler, update preload, and optionally update frontend.

**Pros:**
- Clean separation of concerns
- `clearInstagramSession` remains lightweight
- Explicit intent in code

**Cons:**
- More files to change
- New API to maintain

---

## Files to Modify

| File | Change |
|------|--------|
| [src/main/main.ts](src/main/main.ts) | Add `clearData()` call in `clear-instagram-session` handler |
| [src/main/services/BrowserManager.ts](src/main/services/BrowserManager.ts) | (Option B only) Add `switchAccount()` method |
| [src/preload/preload.cts](src/preload/preload.cts) | (Option B only) Expose `switchAccount` API |
| [src/pages/settings/PersonalSettings.tsx](src/pages/settings/PersonalSettings.tsx) | (Option B only) Use new API |
| [src/components/modals/InstagramConnectModal.tsx](src/components/modals/InstagramConnectModal.tsx) | (Option B only) Accept mode prop |

---

## Additional Issue: Modal Doesn't Close on Failure (White Screen)

### The Problem

When `startLogin()` returns `false` or throws an exception, the modal gets stuck on the transparent "connecting" phase:

**[InstagramConnectModal.tsx:62-70](src/components/modals/InstagramConnectModal.tsx#L62-L70):**
```typescript
} else {
    // Start Over / Error
    hasLaunchedRef.current = false; // Allow retry?
    // Maybe show error state  <-- NO ACTUAL ERROR HANDLING
}
```

There's no `setPhase("error")` or `onClose()` call, so the user sees a white/blank screen (the transparent modal backdrop with nothing behind it) and can't return to settings.

### Required Fix

Add proper error handling to close the modal or show an error state:

```typescript
} else {
    // Login failed or was cancelled
    console.log("Login returned false, closing modal");
    hasLaunchedRef.current = false;
    onClose(); // Return to settings page
}
```

And in the catch block:
```typescript
} catch (e) {
    console.error("Overlay Login Error:", e);
    hasLaunchedRef.current = false;
    onClose(); // Return to settings page on error
}
```

### Files to Modify (Updated)

| File | Change |
|------|--------|
| [src/main/main.ts](src/main/main.ts) | Add `clearData()` call in `clear-instagram-session` handler |
| [src/components/modals/InstagramConnectModal.tsx](src/components/modals/InstagramConnectModal.tsx) | Add `onClose()` calls in failure/error paths |

---

## Testing Plan

1. **Fresh Install Test:**
   - Launch app fresh (or reset)
   - Complete onboarding with Account A
   - Verify login works

2. **Switch Account Test:**
   - Go to Settings → Personal
   - Click "Switch Account"
   - Verify Chromium opens with Instagram login page (not logged in)
   - Log in with Account B
   - Verify success screen appears
   - Verify modal auto-closes

3. **No White Screen Test:**
   - Repeat switch account flow
   - Verify no white flash/blank screen

4. **Session Persistence Test:**
   - After switching to Account B, restart app
   - Verify Account B session persists (app doesn't require re-login)

---

## Summary

There are **two bugs** causing the issues:

1. **User appears logged in:** `clearInstagramSession()` doesn't clear the Playwright persistent browser context at `kowalski_browser/`. **Fix:** Call `BrowserManager.getInstance().clearData()` in the IPC handler.

2. **White screen / doesn't return to settings:** The `InstagramConnectModal` has no error handling when `startLogin()` returns `false` or throws. The modal gets stuck on a transparent "connecting" phase. **Fix:** Add `onClose()` calls in the failure and catch blocks.

Both fixes are required for the complete solution.
