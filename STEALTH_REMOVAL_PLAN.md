# Stealth Movement Removal Plan

Strip all human-simulation physics from mouse movement and scrolling. Replace with direct Playwright calls. Keep all non-movement stealth (browser fingerprinting, CDP queries, stealth init scripts).

## What to REMOVE (movement stealth)

### GhostMouse.ts — the entire physics layer

| Feature | What it does | Replace with |
|---------|-------------|--------------|
| Bezier curve trajectories | Moves mouse along a curved path with control points | `page.mouse.move(x, y)` |
| Variable velocity points | Generates points along curve with easing | Nothing — single move call |
| Micro-jitter (2-layer) | Adds hand tremor noise to each point | Nothing |
| Overshoot and correction | Moves past target then back | Nothing |
| Pre-click hover delay | Waits 30-80ms before clicking | Nothing |
| Hold duration | Waits 40-90ms between mousedown/mouseup | Nothing — use `page.mouse.click()` |
| Post-click pause | Waits 50-120ms after click | Nothing |
| Hover jitter loop | Micro-movements during hover duration | `page.mouse.move(x, y)` + simple wait |
| Gaussian click offset | Randomizes click position within element | Click element center directly |
| Role-based timing | Varies hover duration by element type | Nothing |
| `bezier-js` dependency | npm package for Bezier math | Can be removed from package.json |

### HumanScroll.ts — the scroll physics layer

| Feature | What it does | Replace with |
|---------|-------------|--------------|
| `smoothScrollWithEasing` | 8-12 wheel events with cubic ease-out curve | Single `page.mouse.wheel(0, distance)` |
| `preciseScroll` | 12-18 wheel events with easing for centering | Single `page.mouse.wheel(0, distance)` |
| `quickScroll` | 5 wheel events with randomized delays | Single `page.mouse.wheel(0, distance)` |
| `microAdjust` | Overshoot + correction on 10% of scrolls | Nothing |
| Distance variability | ±30% randomization on scroll distance | Scroll exact requested distance |
| Variable inter-step delays | 5-15ms random delay between wheel events | Nothing — one wheel call |
| Variable centering tolerance | 8-12% randomized tolerance for "close enough" | Fixed tolerance (e.g. 50px) |

## What to KEEP

### BrowserManager.ts — all of it stays

- `navigator.webdriver = false` override
- `chrome.runtime` mock
- `navigator.plugins` mock
- `navigator.languages` override
- `navigator.permissions.query` patch
- WebGL fingerprint randomization (GPU profiles)
- Dynamic user agent generation (ChromiumVersionHelper)
- Persistent browser context with stealth args (`--disable-blink-features=AutomationControlled`)
- Window size randomization per session
- Timezone/locale consistency

### HumanScroll.ts — CDP helpers stay

- `cdpEvaluate()` — undetectable JS execution via CDP Runtime.evaluate
- `getScrollPosition()` / `getScrollPositionX()` — reads `window.scrollY` via CDP
- `isNearBottom()` — bottom detection via CDP
- `getViewportInfo()` — viewport dimensions via CDP
- `getNodeBoundingBoxByCDP()` — element position via CDP DOM.getBoxModel
- `scrollToElementByCDP()` — element centering logic (but with simple scroll instead of `preciseScroll`)
- `scrollToElementCentered()` — verify + retry centering (but with simple scroll)
- `checkElementCenterOffset()` — offset measurement
- Scroll failure detection (`actualDelta === 0` check in `scrollWithIntent`)

### elementLabeler.ts — stays (server-side labeling, no DOM injection)

---

## Implementation Steps

### Step 1 — Simplify GhostMouse

Gut the internals. Keep the public API signatures identical so Scroller.ts and InstagramScraper.ts don't need changes.

**Public methods to keep (same signatures, simple bodies):**

```
moveTo(target: Point)
  → page.mouse.move(target.x, target.y)
  → update this.currentPosition

click(target: Point)
  → page.mouse.click(target.x, target.y)

clickPoint(x: number, y: number)
  → page.mouse.click(x, y)

hover(target: Point, durationMs?: number)
  → page.mouse.move(target.x, target.y)
  → await delay(durationMs)

clickElement(boundingBox: BoundingBox)
  → calculate center: { x: box.x + box.width/2, y: box.y + box.height/2 }
  → page.mouse.click(center.x, center.y)

hoverElement(boundingBox: BoundingBox, durationMs?: number)
  → calculate center
  → page.mouse.move(center.x, center.y)
  → await delay(durationMs)

clickWithRole(target: Point, role?: string)
  → page.mouse.click(target.x, target.y)
  (ignore role — it only affected timing)

clickElementWithRole(boundingBox: BoundingBox, role?: string)
  → calculate center
  → page.mouse.click(center.x, center.y)

setPage(page: Page)
  → same as current

getHoverDurationForRole(role: string)
  → can return 0 or a fixed small value
  (only used by clickWithRole, which is simplified)
```

**Delete entirely:**
- `generateBezierControlPoints()`
- `generateVariableVelocityPoints()`
- `easeInOutCinematic()`
- `addJitter()`
- `overshootAndCorrect()`
- `gaussianRandom()`
- `getRandomizedCenterBias()`
- `microDelay()`
- `randomInRange()`
- `getViewportWidth()` (no longer needed for proportional jitter)
- `BezierControlPoints` interface
- `import { Bezier } from 'bezier-js'`

### Step 2 — Simplify HumanScroll

Keep the CDP query infrastructure and scroll failure detection. Replace multi-step wheel physics with single calls.

**Methods to simplify:**

```
scrollWithIntent(config)
  → KEEP: viewport height lookup via CDP
  → KEEP: scroll position before/after measurement
  → KEEP: scrollFailed detection
  → REMOVE: variability, microAdjustProb, smoothScrollWithEasing
  → REPLACE with: page.mouse.wheel(0, baseDistance)

scrollHorizontalWithIntent(config)
  → Same pattern: single page.mouse.wheel(distance, 0)
  → KEEP: failure detection

scroll(config)
  → Single page.mouse.wheel(0, distance)

scrollToElementByCDP(backendNodeId)
  → KEEP CDP bounding box lookup
  → REPLACE preciseScroll with: page.mouse.wheel(0, scrollNeeded)

scrollToElementCentered(backendNodeId, maxRetries)
  → KEEP retry loop and offset measurement
  → REPLACE preciseScroll with: page.mouse.wheel(0, offset)
  → REPLACE variable tolerance with: fixed 50px

scrollToTop()
  → Single page.mouse.wheel(0, -currentScroll)

quickScroll(distance)
  → Single page.mouse.wheel(0, distance)

preciseScroll(distance)
  → Single page.mouse.wheel(0, distance)
```

**Delete entirely:**
- `smoothScrollWithEasing()`
- `microAdjust()`
- `randomInRange()`

### Step 3 — Fix the scroll positioning bug

After simplifying, add mouse positioning before scroll in `Scroller.ts executeScroll()`:

```
// Before calling scroll.scrollWithIntent():
// Move mouse to a random point in the feed area so wheel events
// land on the scrollable content.
const feedX = this.viewportWidth * (0.35 + Math.random() * 0.30);
const feedY = this.viewportHeight * (0.25 + Math.random() * 0.50);
await this.page.mouse.move(feedX, feedY);
```

This is the actual scroll fix — with simplified movement, it's just one `page.mouse.move()` call instead of going through GhostMouse's Bezier pipeline.

### Step 4 — Remove bezier-js dependency

```bash
npm uninstall bezier-js
```

Also remove `@types/bezier-js` if it exists in devDependencies.

### Step 5 — Clean up types

In `src/types/instagram.ts`, the following types can be simplified or removed:

- `MovementConfig` — no longer used (GhostMouse ignores config params)
- `ScrollConfig.variability` — no longer used
- `ScrollConfig.microAdjustProb` — no longer used
- `ContentType` — still returned by scrollWithIntent but always `'mixed'`, consider removing

Don't delete them yet if other code references them — just note they're dead code for later cleanup.

### Step 6 — Verify

1. `npx tsc --noEmit` — confirm clean compile
2. Run a short session (2-3 minutes) and check logs:
   - `📜 SCROLL: Target=Xpx, Actual=Xpx` — actual should be non-zero
   - `🖱️ click:` — clicks should hit the right elements
   - No `scrollFailed` entries (unless actually at page bottom)

---

## Files Changed

| File | Change |
|------|--------|
| `src/main/services/GhostMouse.ts` | Gut internals, keep public API, direct Playwright calls |
| `src/main/services/HumanScroll.ts` | Replace multi-step physics with single wheel calls, keep CDP helpers |
| `src/main/services/Scroller.ts` | Add `page.mouse.move()` before scroll in `executeScroll()` |
| `src/types/instagram.ts` | Mark dead types (optional cleanup) |
| `package.json` | Remove `bezier-js` dependency |

## Files NOT Changed

| File | Why |
|------|-----|
| `src/main/services/BrowserManager.ts` | All stealth here is browser-level, not movement |
| `src/main/services/InstagramScraper.ts` | Calls `ghost.hover()` which still works (simplified) |
| `src/main/prompts/navigator-agent.md` | Agent prompt doesn't reference movement physics |
| `src/utils/elementLabeler.ts` | Server-side screenshot labeling, no movement |
