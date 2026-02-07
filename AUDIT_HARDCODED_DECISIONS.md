# Codebase Audit: Hardcoded Decision Logic

**Date:** 2026-02-07
**Scope:** All files in `src/`
**Principle:** Dumb infrastructure pipes + LLM brain. Infrastructure executes mechanics; the LLM makes ALL decisions.

---

## Executive Summary

| Category | Findings | Critical | Action Items |
|----------|----------|----------|--------------|
| 1. Element Targeting / CSS Selectors | 14 | 3 | Replace DOM selectors with tree-based detection |
| 2. Capture Rules / Gating | 8 | 0 | All mechanical dedup — no changes needed |
| 3. Warning Injection / Progress Overrides | 10 | 1 | Remove forced auto-recovery; rephrase imperative warnings |
| 4. Phase / State Machine Logic | 0 | 0 | Exemplary — no changes needed |
| 5. Timing / Delays | 68 | 0 | Reduce reading pause defaults; expand linger options |
| 6. Content Relevance / Interest Matching | 3 | 1 | Remove hardcoded `isLowSaliencyContent()` filter |
| 7. Loop / Stuck Detection | 2 | 2 | Remove forced recovery; remove fallback Escape forcing |
| 8. Navigation Strategies | 3 | 1 | Fix runtime bug; review auto-recovery policy |

**Total unique action items:** ~20 distinct changes across 8 files
**Critical issues:** 5 (1 runtime bug, 1 forced auto-recovery system, 1 content filter, 2 DOM selector chains)

---

## Category 1: Hardcoded Element Targeting / CSS Selectors

### 1.1 — Login Verification Aria-Label Selector
- **File:** `src/main/main.ts:463`
- **Code:** `await page.waitForSelector('svg[aria-label="Home"]', { timeout: 10000 });`
- **What:** Waits for Instagram Home SVG to verify login
- **Risk:** Detectable by anti-bot; breaks if Instagram changes aria-label
- **Classification:** **SIMPLIFY** — Replace with tree-based check (CDP tree will show "Home" link after login) or URL-based redirect check

### 1.2 — Overlay Detection Multi-Selector Chain
- **File:** `src/main/services/ContentReadiness.ts:430-439`
- **Code:** `querySelectorAll('h1, h2, [role="heading"]')`, `.closest('div[role="dialog"]')`, `.querySelector('[aria-label="Close"]')`
- **What:** Detects overlay dialogs and finds close button via DOM selectors
- **Risk:** Multi-selector chain is detectable; fragile to HTML structure changes
- **Classification:** **REMOVE** — Move overlay detection to accessibility tree analysis. A11yNavigator already detects dialogs.

### 1.3 — Dialog Detection with Role Selectors
- **File:** `src/main/services/ContentReadiness.ts:463-468`
- **Code:** `querySelectorAll('[role="dialog"], [aria-modal="true"]')`, `.querySelector('[aria-label="Close"]')`
- **What:** Finds dialog overlays and close buttons
- **Risk:** Same as 1.2 — DOM queries with role/aria attributes are detectable
- **Classification:** **REMOVE** — Use tree-based dialog detection (already exists in A11yNavigator)

### 1.4 — Click Verification DOM Signature
- **File:** `src/main/services/NavigationExecutor.ts:697-702`
- **Code:** `querySelectorAll('[role="dialog"]').length`, `querySelectorAll('article').length`, `window.scrollY`
- **What:** Creates before/after DOM signature to verify clicks caused state changes
- **Risk:** Querying DOM element counts by role is a bot fingerprint
- **Classification:** **SIMPLIFY** — Replace `article` and `dialog` counts with tree-based state comparison (tree hash before/after click)

### 1.5 — Type Action Input Validation
- **File:** `src/main/services/NavigationExecutor.ts:364-372`
- **Code:** `el.getAttribute('role')`, `el.getAttribute('aria-label')`, `el.getAttribute('contenteditable')`
- **What:** Checks if focused element is a text input before typing
- **Risk:** Aria attribute reads on active element; medium detectability
- **Classification:** **SIMPLIFY** — Validate via tree (check if the focused node has role=textbox/searchbox/combobox in the cached tree)

### 1.6–1.7 — Video State Detection (2 locations)
- **Files:** `src/main/services/ScreenshotCollector.ts:607`, `src/main/services/ContentReadiness.ts:383`
- **Code:** `document.querySelector('video')`
- **What:** Checks if video element is playing/buffering
- **Risk:** Low (generic HTML element, not Instagram-specific)
- **Classification:** **KEEP** — Generic `<video>` query is acceptable; no Instagram-specific selector

### 1.8–1.14 — Generic Browser API Queries (7 locations)
- **Files:** NavigationExecutor.ts, GhostMouse.ts, ScreenshotCollector.ts, ContentReadiness.ts
- **Code:** `window.innerHeight`, `window.scrollY`, `document.images`, `document.getAnimations()`
- **Classification:** **KEEP** — Generic browser APIs, not Instagram-specific selectors

---

## Category 2: Hardcoded Capture Rules / Gating

**Assessment: All KEEP — Well-architected capture system**

The capture pipeline has 6 gating mechanisms, all of which are mechanical dedup:

| # | Mechanism | File | Classification |
|---|-----------|------|----------------|
| 2.1 | Memory limit (200 captures max) | ScreenshotCollector.ts:102 | **KEEP** — OOM prevention |
| 2.2 | Position bucket dedup | ScreenshotCollector.ts:120-132 | **KEEP** — Prevents duplicate viewport captures |
| 2.3 | Feed scroll delta (100px min) | ScreenshotCollector.ts:134-139 | **KEEP** — Prevents scroll jitter captures (feed-only, same-page) |
| 2.4 | Post ID dedup (carousel-exempt) | ScreenshotCollector.ts:113-118 | **KEEP** — Prevents same-post recapture |
| 2.5 | Perceptual hash dedup | ScreenshotCollector.ts:149-154 | **KEEP** — Image similarity catch-all |
| 2.6 | LLM capture signal routing (priority cascade) | InstagramScraper.ts:656-792 | **KEEP** — Routes LLM's `captureNow`/`shouldCapture` signals to correct capture method |

**No hardcoded rules block the LLM's capture intent.** All gates are infrastructure (memory safety) or mechanical dedup (duplicate detection). The LLM controls capture timing via `captureNow` and `shouldCapture`.

---

## Category 3: Hardcoded Progress Audit / Warning Injection

### 3.1 — CRITICAL: Forced Auto-Recovery After 3 Warnings
- **File:** `src/main/services/InstagramScraper.ts:847-896`
- **Code:**
  ```typescript
  if (consecutiveLoopWarnings >= 3) {
      // FORCES one of: press(Escape), page.goBack(), page.goto(home)
      // WITHOUT LLM decision
  }
  ```
- **What:** After 3 consecutive loop warnings, system overrides LLM with hardcoded recovery actions
- **Impact:** LLM loses autonomy; carousel exploration gets interrupted; legitimate waiting/retrying gets punished
- **Classification:** **REMOVE** — Delete the entire forced recovery block (lines 847-896). Keep warning injection so LLM can self-recover.

### 3.2 — Auto-Recovery Threat Disclosure
- **File:** `src/main/services/NavigationLLM.ts:495-497`
- **Code:** `"NOTE: Auto-recovery will take over on the next action if the loop continues."`
- **What:** Tells LLM that forced actions will execute, creating coercive pressure
- **Classification:** **REMOVE** — If forced recovery (3.1) is removed, this becomes unnecessary

### 3.3 — 9 Imperative Progress Warnings
- **File:** `src/main/services/NavigationLLM.ts:274-373` (`buildProgressAudit()`)
- **What:** Injects up to 9 diagnostic warnings into LLM prompt using imperative language

| Warning | Trigger | Current Language | Problem |
|---------|---------|-----------------|---------|
| CAPTURE LOOP | 2+ consecutive waits | "STOP waiting — send back() NOW" | Commands specific action |
| LAST CAPTURE REJECTED | Capture failed | "Do NOT send captureNow again" | Prohibits LLM judgment |
| LOW CAPTURE RATE | <0.5 captures/min after 60s | "You should have ~X+" | Sets expectation, not fact |
| STAGNANT | 5+ actions same URL | "Break the pattern" | Directive, not observation |
| CLICK FAILURES | 2+ failed clicks on feed | "SCROLL DOWN...Do NOT use back()" | Commands + prohibits |
| DANGEROUS BACK | back() on feed | "NEVER use back() on the feed" | Absolute prohibition |
| SCROLL LOOP | 4+ scrolls, 0 clicks in 8 actions | "STOP scrolling" | Commands specific action |
| ESCAPE NOT WORKING | 2+ consecutive Escapes | "Escape cannot close it" | Helpful observation (OK) |

- **Classification:** **CONVERT TO CONTEXT** — Rephrase all warnings from imperatives to neutral observations. Example: "STOP waiting — send back() NOW" → "3 consecutive wait actions detected. No page state change observed." Let the LLM decide the response.

### 3.4 — Loop Warning Counter Persistence
- **File:** `src/main/services/InstagramScraper.ts:383-398`
- **What:** `consecutiveLoopWarnings` counter increments each turn loop is detected, persists across turns
- **Classification:** **SIMPLIFY** — Keep counter for context (LLM should know "warned 3 times") but remove it as trigger for forced recovery

---

## Category 4: Hardcoded Phase / State Machine Logic

**Assessment: EXEMPLARY — No changes needed**

- All phase transitions are LLM-controlled via `decision.strategic.switchPhase`
- `shouldTransitionPhase()` and `getNextPhase()` were intentionally removed (documented at InstagramScraper.ts:1012-1013)
- No timer-based phase switches, minimum/maximum phase durations, or forced phase changes
- Only hard stop is global session timeout (`maxDurationMs`) — appropriate safety measure
- Phase tracking is observational only (metrics, source tagging)

---

## Category 5: Hardcoded Timing / Delays

**68 instances found. 22 KEEP (mechanical). 46 REMOVE/SIMPLIFY (behavioral).**

### 5.1 — HIGH PRIORITY: Reading Pause on Every Scroll
- **Files:** `src/main/services/HumanScroll.ts:124` and `:454`
- **Code:** `readingPauseMs = [2000, 5000]` (scroll), `readingPauseMs = [2000 * multiplier, 4000 * multiplier]` (scrollWithIntent)
- **What:** Forces 2-5 second pause after EVERY scroll. 10 scrolls = 20-50 seconds wasted per session.
- **Classification:** **SIMPLIFY** — Reduce default to `[500, 1000]`. Let LLM control extended pauses via `lingerDuration`.

### 5.2 — MEDIUM PRIORITY: Return-to-Home Delay
- **File:** `src/main/services/InstagramScraper.ts:126`
- **Code:** `await this.humanDelay(2000, 3000);`
- **What:** 2-3s delay after navigating home. Not mechanically necessary.
- **Classification:** **REMOVE** — Reduce to 200-400ms for DOM settle, or remove entirely.

### 5.3 — LOW PRIORITY: Linger Duration Fixed Options
- **File:** `src/main/services/NavigationExecutor.ts:54-59`
- **Code:** `{ short: 1000, medium: 3000, long: 6000, xlong: 12000 }`
- **What:** LLM constrained to 4 predefined engagement durations
- **Classification:** **SIMPLIFY** — Accept numeric values in addition to string presets (let LLM specify 2500ms, 4000ms, etc.)

### 5.4 — LOW PRIORITY: Per-Character Typing Delay
- **File:** `src/main/services/NavigationExecutor.ts:395`
- **Code:** `await this.humanDelay(50, 150);` per keystroke
- **Classification:** **KEEP** — Minor impact (~1-2s per search). Acceptable for human-like typing.

### 5.5–5.68 — Mechanical Waits (63 locations)
- SPA hydration waits, click verification polling, scroll settling, Bezier curve delays, hover timing
- **Classification:** **KEEP** — All mechanically necessary. Well-designed with session multiplier variance.

**Estimated session time savings from Priority 1+2: 20-50 seconds per 15-minute session (~10% efficiency gain)**

---

## Category 6: Hardcoded Content Relevance / Interest Matching

### 6.1 — CRITICAL: Hardcoded Saliency Filter
- **File:** `src/main/services/AnalysisGenerator.ts:171-218`
- **Code:**
  ```typescript
  private isLowSaliencyContent(caption, imageDesc, username): boolean {
      // Hardcoded intro patterns: 'meet the class', 'welcome to the class', etc.
      // Hardcoded ad patterns: 'shop now', 'limited time', 'use code', etc.
      // Empty content check
  }
  ```
- **Called at:** Lines 100 and 128 (removes posts BEFORE LLM sees them)
- **What:** Pre-filters posts using 20+ hardcoded keyword patterns. LLM never knows these posts existed.
- **Impact:** User interested in "organizational updates" loses "meet our new team member" posts. User following a brand loses relevant promotions.
- **Classification:** **REMOVE** — Delete `isLowSaliencyContent()` entirely. The LLM's analysis prompt already instructs it to skip low-value content, WITH access to user interests for context.

### 6.2 — Ad Filtering in ImageTagger & BatchDigestGenerator
- **Files:** `src/main/services/ImageTagger.ts:162, 213-227`, `src/main/services/BatchDigestGenerator.ts:193-208`
- **What:** ImageTagger tags ads then `selectBest()` removes ALL ads. BatchDigestGenerator prompt says "COMPLETELY SKIP" all ads.
- **Classification:** **CONVERT TO CONTEXT** — Soften to interest-aware filtering. Change "COMPLETELY SKIP ads" to "Skip ads UNLESS they match user interests." Pass `isAd` tag forward rather than filtering.

### 6.3 — Engagement Level Estimation, Content Stats, Phase Tracking
- **Classification:** **KEEP** — All informational context signals for LLM awareness, not content filters.

---

## Category 7: Hardcoded Loop / Stuck Detection

### 7.1 — CRITICAL: Auto-Recovery Override (Same as 3.1)
- **File:** `src/main/services/InstagramScraper.ts:847-896`
- **Classification:** **REMOVE** — See Category 3.1

### 7.2 — CRITICAL: Fallback Decision Forces Escape
- **File:** `src/main/services/NavigationLLM.ts:1075-1087`
- **Code:**
  ```typescript
  const recentFailures = recent.filter(a => !a.success).length;
  if (recentFailures >= 3) {
      return { action: 'press', params: { key: 'Escape' }, confidence: 0.2 };
  }
  ```
- **What:** When LLM can't decide (fallback path), forces Escape if 3+ recent failures. Bypasses LLM.
- **Classification:** **REMOVE** — Delete lines 1075-1087. Let fallback always scroll (safe default). LLM sees the result and decides next.

### 7.3 — Loop Detection Engine (5 checks)
- **File:** `src/main/services/NavigationExecutor.ts:627-665` (`isInLoop()`)
- **What:** Detects 5 stuck patterns (scroll stagnation, no-change actions, click failures, wait loops, repetitive failures)
- **Classification:** **KEEP** — Detection is purely informational. The problem is what happens AFTER detection (forced recovery). Keep the detection, remove the forced response.

### 7.4 — Recovery Action Escalation Matrix
- **File:** `src/main/services/NavigationExecutor.ts:670-679` (`getRecoveryAction()`)
- **What:** Maps severity → suggested action (mild→Escape, moderate→back, severe→home)
- **Classification:** **KEEP** — Harmless lookup table. Only problematic when used by forced recovery (7.1). Can be repurposed as "suggested action" in LLM context.

---

## Category 8: Hardcoded Navigation Strategies

### 8.1 — CRITICAL: Runtime Bug — Undefined Variable
- **File:** `src/main/services/InstagramScraper.ts:801`
- **Code:** `lastCaptureAttemptUrl = postActionUrl;` — `postActionUrl` is never defined
- **What:** Crash when capture is filtered as duplicate. Should be `currentUrl`.
- **Classification:** **FIX** — Change `postActionUrl` to `currentUrl`. Trivial 1-line fix.

### 8.2 — Auto-Recovery Navigation Bypass (Same as 3.1/7.1)
- **Classification:** **REMOVE** — See Category 3.1

### 8.3 — 55+ URL-Based Inference Dependencies
- **What:** URL pattern matching (`/p/`, `/reel/`, `/stories/`, feed root checks) used across 5 files for page detection, post ID extraction, capture source assignment
- **Classification:** **CONVERT TO CONTEXT** — Already cataloged in `AUDIT_URL_REMOVAL.md`. Replace with tree-based `PageDetector` and `PostIdentifier` utilities. Separate refactoring effort.

### 8.4 — Memory Doc Incorrect About Carousel
- **What:** MEMORY.md states "Carousel exploration is PROGRAMMATIC — `exploreCarouselSlides()` runs automatically." No such method exists. Carousel is fully LLM-controlled.
- **Classification:** **FIX** — Update MEMORY.md

---

## Top 10 Highest-Impact Changes

Ranked by damage to agent performance:

### 1. Remove Forced Auto-Recovery System
**Files:** InstagramScraper.ts:847-896
**Impact:** CRITICAL — This is the single biggest architecture violation. Forces navigation (back, Escape, goto home) after 3 loop warnings, overriding LLM judgment. Interrupts carousel exploration, content loading waits, and any legitimate repetitive strategy.
**Action:** Delete the entire `if (consecutiveLoopWarnings >= 3)` block.

### 2. Remove Hardcoded Content Filter (`isLowSaliencyContent`)
**Files:** AnalysisGenerator.ts:100, 128, 171-218
**Impact:** CRITICAL — Silently removes posts before LLM analysis. 20+ hardcoded keyword patterns filter "intro" and "ad" posts without consulting user interests. A user following Nike loses Nike sale posts.
**Action:** Delete the function and both call sites.

### 3. Convert 9 Imperative Warnings to Neutral Context
**Files:** NavigationLLM.ts:274-373 (`buildProgressAudit`)
**Impact:** HIGH — "STOP", "NEVER", "Do NOT" language overrides LLM reasoning with rigid rules. LLM complies to avoid perceived punishment rather than reasoning about the situation.
**Action:** Rephrase all 9 warnings as neutral observations. "3 consecutive wait actions. No state change detected." instead of "STOP waiting — send back() NOW."

### 4. Fix Runtime Bug (postActionUrl undefined)
**Files:** InstagramScraper.ts:801
**Impact:** HIGH — Crashes the session whenever a capture is filtered as duplicate. Silent until it happens, then catastrophic.
**Action:** Change `postActionUrl` to `currentUrl`.

### 5. Reduce Scroll Reading Pause Default
**Files:** HumanScroll.ts:124, 454
**Impact:** HIGH — 2-5 second hardcoded pause after EVERY scroll wastes 20-50 seconds per session (~10% of a 15-minute session). LLM has no control over this timing.
**Action:** Reduce default to `[500, 1000]`. Let LLM extend via `lingerDuration`.

### 6. Remove Fallback Escape Forcing
**Files:** NavigationLLM.ts:1075-1087
**Impact:** MEDIUM — When fallback triggers and 3+ recent failures exist, forces Escape press instead of safe scroll. Can dismiss dialogs LLM was intentionally interacting with.
**Action:** Delete the failure-count-triggered Escape. Keep scroll as universal fallback.

### 7. Replace DOM Selectors in ContentReadiness
**Files:** ContentReadiness.ts:430-468
**Impact:** MEDIUM — Two multi-selector chains (`querySelectorAll('[role="dialog"]')`, `querySelector('[aria-label="Close"]')`) for overlay detection are detectable by anti-bot systems and fragile.
**Action:** Move overlay detection to accessibility tree analysis.

### 8. Replace DOM Signature in Click Verification
**Files:** NavigationExecutor.ts:697-702
**Impact:** MEDIUM — `getQuickDOMSignature()` queries `[role="dialog"]` and `article` counts. Detectable anti-bot fingerprint.
**Action:** Replace with tree-based state comparison.

### 9. Soften Ad Filtering in Digest Pipeline
**Files:** ImageTagger.ts:162, BatchDigestGenerator.ts:193-208
**Impact:** MEDIUM — "COMPLETELY SKIP" all ads regardless of user interests. Users following brands lose relevant content.
**Action:** Change to "Skip ads UNLESS they match user interests."

### 10. Remove Auto-Recovery Threat from LLM Context
**Files:** NavigationLLM.ts:495-497
**Impact:** LOW-MEDIUM — "Auto-recovery will take over" creates coercive pressure on LLM decision-making.
**Action:** Delete (becomes unnecessary once forced recovery is removed).

---

## Summary By File

| File | Total Issues | Critical | Key Changes |
|------|-------------|----------|-------------|
| `InstagramScraper.ts` | 5 | 2 | Remove auto-recovery (847-896), fix undefined var (801) |
| `NavigationLLM.ts` | 4 | 1 | Rephrase warnings (274-373), remove fallback Escape (1075-1087), remove threat (495-497) |
| `ContentReadiness.ts` | 3 | 0 | Replace DOM selectors with tree-based detection (430-468) |
| `NavigationExecutor.ts` | 2 | 0 | Replace DOM signature (697-702), replace input validation (364-372) |
| `AnalysisGenerator.ts` | 1 | 1 | Delete isLowSaliencyContent() (171-218) |
| `HumanScroll.ts` | 2 | 0 | Reduce reading pause default (124, 454) |
| `ImageTagger.ts` | 1 | 0 | Soften ad filtering (162) |
| `BatchDigestGenerator.ts` | 1 | 0 | Soften ad skip instruction (193-208) |
| `main.ts` | 1 | 0 | Replace aria-label login check (463) |

---

## What's Already Right

These areas are clean and correctly follow the LLM-brain architecture:

- **Phase transitions** — Fully LLM-controlled, auto-transitions intentionally removed
- **Capture intent** — LLM decides via `captureNow`/`shouldCapture`, infrastructure just executes
- **Carousel exploration** — Fully LLM-driven (ArrowRight + captureNow per slide)
- **Session termination** — LLM sets `terminateSession: true`
- **Engagement depth** — LLM controls via `engageDepth` and `lingerDuration`
- **Capture dedup pipeline** — Pure mechanical dedup, no decision gating
- **Loop detection** — Good informational detection (5 checks), just needs the forced-response removed
- **Physics layer** — GhostMouse and HumanScroll have excellent anti-detection timing with session variance
