# PLAN: Clean Transition from "Connection Established" to "Agent Active"

## Problem Statement

After successful Instagram login, there's a brief flash where the "Connect Instagram" card is visible between the "Connection Established" success screen and the "Agent Active" screen.

---

## Root Cause Analysis

### Current Timeline (Problematic)

```
T+0ms:     User logs in successfully
T+0ms:     instagramPhase = "success"
T+0ms:     "Connection Established" screen displays
           ↓
T+2500ms:  Timer fires in ZeroStateScreen.tsx (line 261-266)
T+2500ms:  patchSettings({ hasOnboarded: true, analysisStatus: "working" })
T+2500ms:  onContinue() → handleContinue() in Index.tsx
T+2500ms:  setCurrentScreen("agent") ← PARENT CHANGES IMMEDIATELY
T+2500ms:  setTimeout(() => setDialogOpen(false), 50) ← SCHEDULES DIALOG CLOSE
           ↓
T+2500-2550ms: RACE CONDITION WINDOW
           - Parent has switched to AgentActiveScreen
           - ZeroStateScreen still mounted (AnimatePresence exit animation)
           - Dialog still open (dialogOpen = true for 50ms more)
           - Dialog renders OVER the new screen
           - User sees flash of Instagram card
           ↓
T+2550ms:  setDialogOpen(false) finally executes
T+2550ms:  Dialog closes
```

### The Problem

In [ZeroStateScreen.tsx:261-266](src/components/screens/ZeroStateScreen.tsx#L261-L266):

```typescript
const timer = setTimeout(() => {
    patchSettings({ hasOnboarded: true, analysisStatus: "working" });
    onContinue();  // Parent immediately switches to agent screen
    setTimeout(() => setDialogOpen(false), 50);  // Dialog closes 50ms LATER
}, 2500);
```

The dialog closure is scheduled 50ms AFTER the parent navigation, causing the dialog to briefly render over the new screen.

---

## Solution

### Strategy: Close Dialog BEFORE Parent Navigation

The fix is simple: reverse the order of operations so the dialog fades out first, then the parent navigates.

### Implementation

**File:** `src/components/screens/ZeroStateScreen.tsx`

**Change:** Lines 257-269

#### Before (Current Code)

```typescript
// EFFECT 1.5: Auto-proceed after success screen displays for 2.5 seconds
useEffect(() => {
    if (instagramPhase !== "success") return;

    const timer = setTimeout(() => {
        console.log("⏰ Auto-proceeding from Connection Established screen...");
        patchSettings({ hasOnboarded: true, analysisStatus: "working" });
        onContinue();
        setTimeout(() => setDialogOpen(false), 50);
    }, 2500);

    return () => clearTimeout(timer);
}, [instagramPhase, patchSettings, onContinue]);
```

#### After (Fixed Code)

```typescript
// EFFECT 1.5: Auto-proceed after success screen displays for 2.5 seconds
useEffect(() => {
    if (instagramPhase !== "success") return;

    const timer = setTimeout(() => {
        console.log("⏰ Auto-proceeding from Connection Established screen...");

        // Step 1: Close dialog FIRST (triggers fade-out animation)
        setDialogOpen(false);

        // Step 2: Wait for dialog fade-out, then navigate
        setTimeout(() => {
            patchSettings({ hasOnboarded: true, analysisStatus: "working" });
            onContinue();
        }, 300);  // 300ms for smooth fade-out

    }, 2500);

    return () => clearTimeout(timer);
}, [instagramPhase, patchSettings, onContinue]);
```

### New Timeline (Fixed)

```
T+0ms:     User logs in successfully
T+0ms:     instagramPhase = "success"
T+0ms:     "Connection Established" screen displays
           ↓
T+2500ms:  Timer fires
T+2500ms:  setDialogOpen(false) ← DIALOG CLOSES FIRST
T+2500ms:  Dialog begins fade-out animation
           ↓
T+2800ms:  Inner setTimeout fires (300ms later)
T+2800ms:  patchSettings({ hasOnboarded: true, analysisStatus: "working" })
T+2800ms:  onContinue() → handleContinue() → setCurrentScreen("agent")
T+2800ms:  Parent transitions to AgentActiveScreen
           ↓
           Clean transition - no flash!
```

---

## Visual Flow

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│    "Connection Established"                                 │
│         ✓ Checkmark                                         │
│    "Secure session captured"                                │
│                                                             │
│         [2.5 seconds displayed]                             │
│                                                             │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼ setDialogOpen(false)
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│    Dialog fades out (opacity 1 → 0)                         │
│                                                             │
│         [300ms fade animation]                              │
│                                                             │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼ onContinue()
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│             AgentActiveScreen                               │
│                                                             │
│         "Kowalski is monitoring..."                         │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Implementation Checklist

- [ ] Update `useEffect` in ZeroStateScreen.tsx (lines 257-269)
- [ ] Test the transition flow manually
- [ ] Verify no flash of Connect Instagram card

---

## Files to Modify

| File | Change |
|------|--------|
| [src/components/screens/ZeroStateScreen.tsx](src/components/screens/ZeroStateScreen.tsx) | Reorder dialog close and navigation in auto-proceed effect |

---

## Testing Plan

1. **Fresh Onboarding Test**
   - Clear app data / reset session
   - Go through onboarding flow
   - At Instagram step, click "Connect Account"
   - Log in to Instagram
   - Watch the transition from "Connection Established" to "Agent Active"
   - Verify: No flash of Connect Instagram card

2. **Timing Verification**
   - "Connection Established" should display for full 2.5 seconds
   - Smooth fade-out of dialog
   - Clean appearance of Agent Active screen

---

## Risk Assessment

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Animation timing too short | Low | 300ms is standard fade duration, can adjust if needed |
| Settings not persisted before navigation | Low | `patchSettings` is synchronous to local state; IPC persistence is async but doesn't affect UI |
| Dialog doesn't have fade animation | Low | Radix Dialog has built-in exit animations via AnimatePresence |

---

## Alternative Considered (Not Recommended)

**Option B: Use a "transitioning" state**

```typescript
const [isTransitioning, setIsTransitioning] = useState(false);

// In effect:
setIsTransitioning(true);
setTimeout(() => {
    setDialogOpen(false);
    patchSettings(...);
    onContinue();
}, 300);

// In render:
{!isTransitioning && instagramPhase === "connecting" && <ConnectCard />}
```

This adds unnecessary state complexity. The simpler solution (close dialog first) is preferred.
