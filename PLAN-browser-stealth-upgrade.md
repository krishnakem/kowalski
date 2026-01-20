# Browser Stealth Upgrade Plan

## Goal
Stop Instagram from flagging the bot as a "New Device" or "Suspicious Login" by making the browser fingerprint indistinguishable from a real Chrome browser on the user's machine.

## Root Cause Analysis

Instagram is detecting the browser as suspicious even on fresh onboarding due to **fingerprint mismatches**:

### 1. User-Agent vs Chrome Version Mismatch (CRITICAL)
- **Current User-Agent claims:** Chrome/120.0.0.0
- **Actual Playwright Chromium:** chromium-1200 (which is Chrome ~131)
- Instagram checks if the reported Chrome version matches actual browser capabilities

### 2. Missing Sec-CH-UA Client Hints
Modern Chrome automatically sends:
```
Sec-CH-UA: "Chromium";v="131", "Not A(Brand";v="24"
Sec-CH-UA-Platform: "macOS"
Sec-CH-UA-Mobile: ?0
```
The hardcoded User-Agent says Chrome 120, but browser sends Chrome 131 client hints. **Mismatch = suspicious.**

### 3. Stealth Plugin Using Default Configuration
The default `StealthPlugin()` doesn't enable all evasions. Critical ones may be off:
- `chrome.runtime` mocking
- `navigator.plugins` consistency
- `WebGL vendor/renderer` masking

### 4. Missing Locale/Timezone Consistency
Browser doesn't explicitly set:
- `locale` (defaults to system, may differ from User-Agent claims)
- `timezoneId` (Instagram checks if timezone matches IP geolocation)

### 5. Switch Account Flow Bug
`clear-instagram-session` IPC handler doesn't call `BrowserManager.clearData()`, causing potential cookie/fingerprint conflicts.

---

## Implementation Plan

### Phase 1: Fix User-Agent & Client Hints Alignment

**File:** `src/main/services/BrowserManager.ts`
**Line:** 92

Update User-Agent to match Playwright's actual Chromium version:

```typescript
// OLD (mismatched - line 92)
userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',

// NEW (aligned with chromium-1200 = Chrome 131)
userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
```

---

### Phase 2: Configure Stealth Plugin with All Evasions

**File:** `src/main/services/BrowserManager.ts`
**Lines:** 5-9

Replace default stealth plugin initialization with explicit configuration:

```typescript
// OLD (lines 5-9)
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
chromium.use(StealthPlugin());

// NEW
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

const stealth = StealthPlugin();
// Ensure all evasions are enabled
stealth.enabledEvasions.add('chrome.app');
stealth.enabledEvasions.add('chrome.csi');
stealth.enabledEvasions.add('chrome.loadTimes');
stealth.enabledEvasions.add('chrome.runtime');
stealth.enabledEvasions.add('iframe.contentWindow');
stealth.enabledEvasions.add('media.codecs');
stealth.enabledEvasions.add('navigator.hardwareConcurrency');
stealth.enabledEvasions.add('navigator.languages');
stealth.enabledEvasions.add('navigator.permissions');
stealth.enabledEvasions.add('navigator.plugins');
stealth.enabledEvasions.add('navigator.vendor');
stealth.enabledEvasions.add('navigator.webdriver');
stealth.enabledEvasions.add('sourceurl');
stealth.enabledEvasions.add('user-agent-override');
stealth.enabledEvasions.add('webgl.vendor');
stealth.enabledEvasions.add('window.outerdimensions');

chromium.use(stealth);
```

---

### Phase 3: Add Fingerprint Consistency Options

**File:** `src/main/services/BrowserManager.ts`
**Location:** Inside `launchPersistentContext()` options (after line 92)

Add explicit fingerprint properties:

```typescript
this.browserContext = await chromium.launchPersistentContext(persistentContextPath, {
    headless: config.headless,
    executablePath: executablePath || undefined,
    viewport: null,
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',

    // NEW: Fingerprint consistency
    locale: 'en-US',
    timezoneId: Intl.DateTimeFormat().resolvedOptions().timeZone, // Use system timezone
    colorScheme: 'light',
    deviceScaleFactor: 2, // Retina Mac

    // NEW: HTTP headers that Chrome normally sends
    extraHTTPHeaders: {
        'Accept-Language': 'en-US,en;q=0.9',
    },

    args: [
        '--disable-blink-features=AutomationControlled',
        '--disable-infobars',
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu',
        ...extraArgs
    ],
    acceptDownloads: true,
});
```

---

### Phase 4: Add WebGL Fingerprint Masking Script

**File:** `src/main/services/BrowserManager.ts`
**Location:** After context creation (after line 105), before cookie migration

Add init script to mask WebGL renderer (Instagram checks this):

```typescript
// NEW: Add after line 105, before cookie migration
// Mask WebGL fingerprint to match common Intel GPU
await this.browserContext.addInitScript(() => {
    // Override WebGL vendor/renderer to avoid fingerprint detection
    const getParameterProto = WebGLRenderingContext.prototype.getParameter;
    WebGLRenderingContext.prototype.getParameter = function(parameter: number) {
        // UNMASKED_VENDOR_WEBGL
        if (parameter === 37445) {
            return 'Intel Inc.';
        }
        // UNMASKED_RENDERER_WEBGL
        if (parameter === 37446) {
            return 'Intel Iris OpenGL Engine';
        }
        return getParameterProto.call(this, parameter);
    };

    // Also handle WebGL2
    const getParameterProto2 = WebGL2RenderingContext.prototype.getParameter;
    WebGL2RenderingContext.prototype.getParameter = function(parameter: number) {
        if (parameter === 37445) {
            return 'Intel Inc.';
        }
        if (parameter === 37446) {
            return 'Intel Iris OpenGL Engine';
        }
        return getParameterProto2.call(this, parameter);
    };
});
```

---

### Phase 5: Fix Switch Account Flow

**File:** `src/main/main.ts`
**Location:** Find the `clear-instagram-session` IPC handler

Add `BrowserManager.clearData()` call:

```typescript
// Find this handler and update it:
ipcMain.handle('clear-instagram-session', async () => {
    // Existing code to clear session.json and partitions...

    // NEW: Also wipe the persistent browser profile
    await BrowserManager.getInstance().clearData();

    // ... rest of existing code
});
```

---

## Summary of Changes

| File | Location | Change |
|------|----------|--------|
| `BrowserManager.ts` | Lines 5-9 | Configure StealthPlugin with all evasions enabled |
| `BrowserManager.ts` | Line 92 | Update User-Agent from Chrome/120 to Chrome/131 |
| `BrowserManager.ts` | Lines 88-105 | Add `locale`, `timezoneId`, `colorScheme`, `deviceScaleFactor`, `extraHTTPHeaders` |
| `BrowserManager.ts` | After line 105 | Add `addInitScript()` for WebGL fingerprint masking |
| `main.ts` | `clear-instagram-session` handler | Add `BrowserManager.clearData()` call |

---

## How This Affects User Flows

### Fresh Onboarding (First Login)
| Before | After |
|--------|-------|
| Browser launches with Chrome/120 UA but Chrome/131 capabilities | Browser launches with aligned Chrome/131 UA and capabilities |
| Instagram sees fingerprint mismatch | Instagram sees consistent, realistic fingerprint |
| "New Device" notification triggered | No suspicious activity flag |
| User logs in, session saves | User logs in, session saves |

### Switch Account
| Before | After |
|--------|-------|
| `clearData()` not called, old profile data persists | `clearData()` wipes `kowalski_browser/` completely |
| New login may conflict with old cookies | Fresh profile, clean slate |
| Same fingerprint inconsistencies | Consistent fingerprint on new session |

### Scheduled Scraper Wake-up
| Before | After |
|--------|-------|
| Scraper inherits mismatched fingerprint | Scraper has consistent fingerprint |
| Potential session invalidation | Session recognized as "same device" |

---

## Universal Fix Confirmation

All browser launches go through `BrowserManager.launch()`:

| Scenario | Method Chain | Uses Fixed `launch()` |
|----------|--------------|----------------------|
| Fresh install | `login()` → `launch()` | ✅ |
| Switch account | `clearData()` → `login()` → `launch()` | ✅ |
| Scheduled scrape | Direct `launch()` | ✅ |
| App restart | `launch()` (reuses persistent context) | ✅ |

The fix is applied once in `launch()` and benefits all scenarios.

---

## Testing Checklist

After implementation, verify:

- [ ] Fresh install → Connect Instagram → No "New Device" notification
- [ ] Close app → Reopen → Still logged in (session persists)
- [ ] Switch Account → Connect different account → No "New Device" notification
- [ ] Headless scraper runs → No session invalidation
- [ ] Check browser console for any automation detection errors
- [ ] Verify `navigator.webdriver` returns `undefined` (not `true`)
