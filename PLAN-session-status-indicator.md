# Implementation Plan: Dynamic Instagram Session Status Indicator

## Problem Statement
The Session Status Indicator in Personal Settings (`src/pages/settings/PersonalSettings.tsx`) currently shows a hardcoded "Session Active" with a green dot, regardless of the actual Instagram login state. This misleads users who may have an expired or invalid session.

## Goal
Make the indicator dynamic:
- **Green dot + "Session Active"**: When Instagram cookies exist and the session is valid
- **Red dot + "Session Inactive"**: When no session exists or it's expired

---

## Implementation Steps

### Step 1: Add IPC Handler in Main Process
**File**: `src/main/main.ts`

Add a new IPC handler that checks if Instagram session cookies exist:

```typescript
ipcMain.handle('check-instagram-session', async () => {
  try {
    const userDataPath = app.getPath('userData');
    const persistentContextPath = path.join(userDataPath, 'kowalski_browser');
    const cookiesPath = path.join(persistentContextPath, 'Default', 'Cookies');

    // Check if the persistent browser profile exists with cookies
    if (!fs.existsSync(cookiesPath)) {
      return { isActive: false, reason: 'no_profile' };
    }

    // For a more robust check, we could also verify session.json
    const sessionPath = path.join(userDataPath, 'session.json');
    if (fs.existsSync(sessionPath)) {
      const sessionData = JSON.parse(fs.readFileSync(sessionPath, 'utf-8'));
      // Check for Instagram session cookies (sessionid is the key indicator)
      const hasSessionId = sessionData.cookies?.some(
        (c: any) => c.name === 'sessionid' && c.domain?.includes('instagram')
      );
      return { isActive: hasSessionId, reason: hasSessionId ? 'valid_session' : 'no_session_cookie' };
    }

    // Profile exists but no session.json - might still be valid from persistent context
    // Conservative: assume active if profile exists (user logged in via overlay)
    return { isActive: true, reason: 'profile_exists' };
  } catch (e) {
    console.error('❌ Error checking Instagram session:', e);
    return { isActive: false, reason: 'error' };
  }
});
```

### Step 2: Expose API in Preload Script
**File**: `src/preload/preload.cts`

Add to the `api` object:

```typescript
checkInstagramSession: () => ipcRenderer.invoke('check-instagram-session'),
```

### Step 3: Update React Component
**File**: `src/pages/settings/PersonalSettings.tsx`

Replace the hardcoded status with dynamic state:

```tsx
// Add state at the top of the component
const [sessionStatus, setSessionStatus] = useState<{isActive: boolean; reason?: string} | null>(null);
const [isCheckingSession, setIsCheckingSession] = useState(true);

// Add useEffect to check session on mount
useEffect(() => {
  const checkSession = async () => {
    try {
      setIsCheckingSession(true);
      // @ts-ignore
      const status = await window.api.checkInstagramSession();
      setSessionStatus(status);
    } catch (e) {
      console.error('Failed to check session:', e);
      setSessionStatus({ isActive: false, reason: 'error' });
    } finally {
      setIsCheckingSession(false);
    }
  };

  checkSession();
}, []);

// Update the JSX (lines ~119-144)
<div className="flex items-center justify-between">
  <span className="text-xs font-mono uppercase tracking-wider text-ink/60">Session Status</span>
  <div className="flex items-center gap-2">
    {isCheckingSession ? (
      <>
        <div className="w-2 h-2 rounded-full bg-ink/30 animate-pulse" />
        <span className="text-xs font-mono text-ink/40">Checking...</span>
      </>
    ) : (
      <>
        <div className={`w-2 h-2 rounded-full ${sessionStatus?.isActive ? 'bg-green-500' : 'bg-red-500'}`} />
        <span className="text-xs font-mono text-ink/60">
          {sessionStatus?.isActive ? 'Session Active' : 'Session Inactive'}
        </span>
      </>
    )}
  </div>
</div>
```

---

## File Changes Summary

| File | Change Type | Description |
|------|-------------|-------------|
| `src/main/main.ts` | Add Handler | New `check-instagram-session` IPC handler (~15 lines) |
| `src/preload/preload.cts` | Add API | Expose `checkInstagramSession` method (1 line) |
| `src/pages/settings/PersonalSettings.tsx` | Modify | Add state, useEffect, update JSX (~25 lines) |

---

## Testing Plan

1. **No Session State**:
   - Run "Reset All (Dev)"
   - Open Settings → Should show red dot / "Session Inactive"

2. **Active Session State**:
   - Complete Instagram login flow
   - Open Settings → Should show green dot / "Session Active"

3. **Loading State**:
   - On Settings open, briefly shows "Checking..." with pulsing dot

---

## Edge Cases Considered

- **Profile exists but session expired**: Currently assumes active if profile exists. Could enhance later with actual Instagram API ping.
- **Error during check**: Falls back to "Session Inactive" to prompt re-login.
- **Race condition**: Uses loading state to prevent flash of incorrect status.

---

## Future Enhancements (Out of Scope)

1. **Deep Validation**: Actually ping Instagram to verify session validity
2. **Auto-Refresh**: Periodically re-check session status
3. **Session Expiry Warning**: Notify user before session expires
