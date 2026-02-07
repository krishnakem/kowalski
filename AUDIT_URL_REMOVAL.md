# Audit: URL-Based Navigation Logic Removal

## Executive Summary

Kowalski's navigation agent relies on URL pattern matching in **~55 locations** across **7 files** to determine page state, track captures, detect navigation success, and assign content source labels. This is fragile and bot-like — a human looks at the screen, not the URL bar.

The agent already receives a **screenshot + full accessibility tree** every turn. This audit catalogs every URL dependency and proposes a replacement using only vision + tree signals.

**Exception:** Onboarding/login flows (`BrowserManager.ts`) and settings account-switch keep their URL logic unchanged.

---

## Part 1: Every URL Usage, Categorized

### Category A: Page Type Detection via URL

These use URL patterns to answer "Where am I?" — the most impactful to replace.

| # | File | Line | Code | Purpose |
|---|------|------|------|---------|
| A1 | `InstagramScraper.ts` | 642 | `currentUrl.includes('/p/') \|\| currentUrl.includes('/reel/')` | Detect post detail page for metrics |
| A2 | `InstagramScraper.ts` | 643 | `currentUrl.includes('/stories/')` | Detect story viewer for metrics |
| A3 | `InstagramScraper.ts` | 669 | `postActionUrl.includes('/p/') \|\| postActionUrl.includes('/reel/')` | Detect if click navigated to post (Bug A capture-on-click) |
| A4 | `InstagramScraper.ts` | 120 | `url === 'https://www.instagram.com/' \|\| url.startsWith(...)` | Detect feed root for `returnToHome()` |
| A5 | `InstagramScraper.ts` | 865 | Same pattern | Detect feed root in auto-recovery to avoid back() |
| A6 | `NavigationLLM.ts` | 324 | `context.url === 'https://www.instagram.com/'` | Detect feed for warning heuristics (click failures, scroll loop, back danger) |
| A7 | `NavigationLLM.ts` | 100 | System prompt: "When the URL contains /p/ or /reel/" | Tell LLM to use URL for page detection |
| A8 | `NavigationLLM.ts` | 176 | System prompt: "/p/ or /reel/ in URL" | Tell LLM about standalone page vs dialog |
| A9 | `NavigationLLM.ts` | 250 | System prompt: "On a post detail page (/p/ or /reel/ in URL)?" | Tell LLM to capture immediately on post pages |

**Proposed replacement:** A `PageDetector` utility that reads the accessibility tree and returns page type based on structural signatures. The LLM system prompt should describe page types by what's visible (Like/Comment/Share buttons, story progress bars, article siblings), not by URL.

---

### Category B: Post ID Extraction from URL

These parse the URL to get a post's unique ID for deduplication and embed rendering.

| # | File | Line | Code | Purpose |
|---|------|------|------|---------|
| B1 | `ScreenshotCollector.ts` | 508-511 | `url.match(/\/p\/([A-Za-z0-9_-]+)\//)` | Extract post ID for dedup |
| B2 | `ScreenshotCollector.ts` | 111 | `this.extractPostId()` | Post ID dedup in `captureCurrentPost()` |
| B3 | `ScreenshotCollector.ts` | 273 | `this.extractPostId()` | Post ID dedup in `captureFocusedElement()` |
| B4 | `ScreenshotCollector.ts` | 382 | `this.extractPostId()` | Video ID for frame capture |
| B5 | `ScreenshotCollector.ts` | 454 | `postId: this.extractPostId()` | Metadata in `captureFullViewport()` |
| B6 | `InstagramScraper.ts` | 648 | `this.extractPostIdFromUrl(currentUrl)` | Unique post tracking for metrics |
| B7 | `InstagramScraper.ts` | 990-992 | `url.match(/\/(p\|reel)\/([A-Za-z0-9_-]+)/)` | Extract post ID from URL |

**Proposed replacement:** A `PostIdentifier` utility that builds a post fingerprint from the accessibility tree: `{owner, engagement_count, timestamp}`. For embed rendering, the `postId` field can remain as an **optional enrichment** extracted from the URL when available, but dedup logic should use the tree-based fingerprint instead.

---

### Category C: Capture Source Assignment via URL

These use URL patterns to tag captures with a source label for dedup behavior.

| # | File | Line | Code | Purpose |
|---|------|------|------|---------|
| C1 | `InstagramScraper.ts` | 679 | `postActionUrl.includes('/stories/')` | Tag as 'story' source |
| C2 | `InstagramScraper.ts` | 681 | `postActionUrl.includes('/explore') \|\| postActionUrl.includes('search')` | Tag as 'search' source |
| C3 | `InstagramScraper.ts` | 654 | `postActionUrl.includes('/stories/')` | Track story watching metric |

**Proposed replacement:** Use the `PageDetector` output to determine source. If tree says `story_viewer` → source='story'. If tree says `explore_grid` → source='search'. The LLM's current phase also provides strong signal.

---

### Category D: URL Change for Navigation Verification

These compare before/after URLs to determine if a click "worked."

| # | File | Line | Code | Purpose |
|---|------|------|------|---------|
| D1 | `NavigationExecutor.ts` | 161 | `preClickUrl = this.page.url()` | Capture pre-click URL |
| D2 | `NavigationExecutor.ts` | 172 | `postClickUrl = this.page.url()` | Compare to detect navigation |
| D3 | `NavigationExecutor.ts` | 173-174 | `preClickUrl !== postClickUrl → 'url_changed'` | Classify as URL change |
| D4 | `NavigationExecutor.ts` | 192-194 | Same pattern in retry loop | Retry classification |

**Proposed replacement:** URL comparison is actually **reasonable** for click verification — it's a fast, reliable signal that's part of the browser API, not a bot pattern. The DOM signature check (`dom_changed`) already serves as a secondary signal. **Keep URL comparison for click verification but add tree-fingerprint comparison as a third signal.** This is low priority for removal because it's infrastructure, not agent behavior.

---

### Category E: Position-Based Dedup Using URL Path

These use the URL path to scope scroll-position dedup buckets per page.

| # | File | Line | Code | Purpose |
|---|------|------|------|---------|
| E1 | `ScreenshotCollector.ts` | 123-124 | `const urlPath = new URL(currentUrl).pathname` | URL path for position bucket key |
| E2 | `ScreenshotCollector.ts` | 128 | `positionKey = \`${urlPath}:${positionBucket}\`` | Scope dedup by page |
| E3 | `ScreenshotCollector.ts` | 135 | `currentUrl === this.lastCaptureUrl` | Same-page check for scroll delta |
| E4 | `ScreenshotCollector.ts` | 178 | `this.lastCaptureUrl = currentUrl` | Track last capture page |

**Proposed replacement:** Replace URL path with page-type + context identifier from the tree. E.g., `feed:bucket42`, `post_detail:bucket0`, `story_viewer:bucket0`. The `PageDetector` output provides the page context without URL parsing.

---

### Category F: URL in LLM Context (Informational)

These pass the URL to the LLM as informational context — the LLM sees it but shouldn't use it for decisions.

| # | File | Line | Code | Purpose |
|---|------|------|------|---------|
| F1 | `InstagramScraper.ts` | 436 | `url: currentUrl` | URL in NavigationContext |
| F2 | `InstagramScraper.ts` | 437 | `view: currentUrl` | View field in context |
| F3 | `NavigationLLM.ts` | 480 | `- URL: ${context.url}` | Show URL in LLM prompt |
| F4 | `InstagramScraper.ts` | 409 | Log line with URL | Debug logging |
| F5 | `NavigationExecutor.ts` | 254+ | `url: this.page.url()` in action history | URL in recent actions |

**Proposed replacement:** Remove URL from the LLM prompt (F3). Keep URL in NavigationContext and action history for **debug logging only** — never reference it in LLM prompts or decision logic. Add a `pageType` field to NavigationContext that comes from `PageDetector`.

---

### Category G: URL for Navigation & Login (KEEP)

These are infrastructure/onboarding uses that **should remain unchanged**.

| # | File | Line | Code | Purpose |
|---|------|------|------|---------|
| G1 | `InstagramScraper.ts` | 123 | `page.goto('https://www.instagram.com/')` | Initial navigation |
| G2 | `InstagramScraper.ts` | 251 | `page.goto('https://www.instagram.com/')` | Session start navigation |
| G3 | `InstagramScraper.ts` | 897 | `page.goto('https://www.instagram.com/')` | Recovery: navigate home |
| G4 | `InstagramScraper.ts` | 260 | `pageUrl.includes('/accounts/login')` | Login detection |
| G5 | `BrowserManager.ts` | 95 | App URL for Chromium | Launch URL |
| G6 | `BrowserManager.ts` | 407-423 | Login/challenge/suspended detection | Onboarding flow |
| G7 | `BrowserManager.ts` | 506-515 | Instagram domain check | Login verification |
| G8 | `main.ts` | 460 | `page.goto('https://www.instagram.com/')` | Initial page load |
| G9 | `main.ts` | 529 | Cookie query for instagram.com | Session management |
| G10 | `SchedulerService.ts` | 744,925 | `https://www.instagram.com/p/${postId}/` | Permalink for digest display |

**No changes needed.** These are either initial navigation, login/onboarding, or display-only permalink construction.

---

### Category H: URL References in System Prompt (LLM Instructions)

These teach the LLM to use URLs, which is the opposite of what we want.

| # | File | Line | Code | Purpose |
|---|------|------|------|---------|
| H1 | `NavigationLLM.ts` | 100 | "When the URL contains /p/ or /reel/" | Teach URL-based page detection |
| H2 | `NavigationLLM.ts` | 176 | "/p/ or /reel/ in URL" | Standalone page identification |
| H3 | `NavigationLLM.ts` | 250 | "On a post detail page (/p/ or /reel/ in URL)?" | Capture trigger hint |

**Proposed replacement:** Rewrite these instructions to describe page types by their visual/tree signatures:
- "You are on a post detail page when you see a single post with Like/Comment/Share/Save buttons, a username, caption text, and a timestamp — NOT when you see multiple article siblings (that's the feed)."
- "You are in the story viewer when you see progress bars at the top, a close (X) button, and the author's username prominently."

---

## Part 2: Implementation Plan

### Priority 1: Create `PageDetector` utility (HIGH IMPACT)
**File:** `src/shared/pageDetector.ts`
**Effort:** Medium (1-2 hours)

Creates a function `detectPageType(tree: AXTree): PageType` that returns one of: `feed`, `post_detail`, `story_viewer`, `explore`, `profile`, `reels`, `search_results`, `unknown`.

Detection signatures:
- **feed**: Multiple `article` siblings, story tray at top, repeating Like/Comment/Share groups
- **post_detail**: Single article or dialog containing article, with Like/Comment/Share/Save, timestamp, username, caption, comment textbox
- **story_viewer**: Progress bars, close button, "Next"/"Previous", author name, no article containers
- **explore**: Grid of image thumbnails, search bar prominent
- **profile**: Tablist with Posts/Reels/Tagged tabs, profile header with follower counts
- **search_results**: Search input focused/filled, result listings

### Priority 2: Create `PostIdentifier` utility (HIGH IMPACT)
**File:** `src/shared/postIdentifier.ts`
**Effort:** Small (30-60 min)

Extracts a post identity from the tree: `{ owner: string, timestamp: string, likeCount: string, commentCount: string, captionSnippet: string }`. Creates a fingerprint string like `"bleacherreport|57.2K|3h"` for dedup.

### Priority 3: Rewrite LLM system prompt — remove URL references (HIGH IMPACT, LOW EFFORT)
**Files:** `NavigationLLM.ts` lines 100, 176, 250
**Effort:** Small (30 min)
**Addresses:** H1, H2, H3

Replace URL-based page descriptions with tree-signature descriptions. The LLM should understand page types from what it sees in the screenshot and tree, not from URLs.

### Priority 4: Replace page detection in `InstagramScraper.ts` (HIGH IMPACT)
**Files:** `InstagramScraper.ts` lines 642-643, 669, 120, 865
**Effort:** Medium (1 hour)
**Addresses:** A1, A2, A3, A4, A5

Replace `currentUrl.includes('/p/')` calls with `PageDetector.detect(tree)`. The tree is already fetched each turn (`await this.navigator.getNavigationElements()`), so the `PageDetector` can run on the same cached tree.

### Priority 5: Replace page detection in `NavigationLLM.ts` warnings (MEDIUM IMPACT)
**Files:** `NavigationLLM.ts` line 324
**Effort:** Small (30 min)
**Addresses:** A6

Replace `isFeedUrl` check with a `pageType` field on NavigationContext (populated by PageDetector in the main loop).

### Priority 6: Replace capture source assignment (MEDIUM IMPACT)
**Files:** `InstagramScraper.ts` lines 679-682
**Effort:** Small (30 min)
**Addresses:** C1, C2, C3

Use the `PageDetector` output to assign source. `story_viewer → 'story'`, `explore/search_results → 'search'`, etc.

### Priority 7: Replace URL-based post ID dedup with tree fingerprints (MEDIUM IMPACT)
**Files:** `ScreenshotCollector.ts` lines 111, 273, 382, 454, 508-511
**Effort:** Medium (1-2 hours)
**Addresses:** B1-B7

Replace `extractPostId()` (URL regex) with `PostIdentifier.fingerprint(tree)`. Keep `postId` as optional metadata for embed rendering (extracted from URL when available), but dedup uses the tree fingerprint.

### Priority 8: Replace URL-path position dedup with page-type scoping (LOW IMPACT)
**Files:** `ScreenshotCollector.ts` lines 123-128, 135, 178
**Effort:** Small (30 min)
**Addresses:** E1-E4

Replace `urlPath` in position keys with `pageType` from PageDetector. E.g., `feed:42` instead of `/:42`.

### Priority 9: Remove URL from LLM prompt context (LOW IMPACT)
**Files:** `NavigationLLM.ts` line 480, `InstagramScraper.ts` lines 436-437
**Effort:** Small (15 min)
**Addresses:** F1-F3

Remove the `- URL: ${context.url}` line from the LLM prompt. Keep URL in the NavigationContext object for debug logging, but don't show it to the LLM.

### Priority 10: Add `pageType` to NavigationContext (ENABLES ALL ABOVE)
**Files:** `types/navigation.ts`, `InstagramScraper.ts`
**Effort:** Small (15 min)

Add `pageType: PageType` field to `NavigationContext`. Populate it in the main loop from `PageDetector.detect(tree)`.

### No change needed:
- **Click verification** (Category D): URL comparison in NavigationExecutor is a fast, reliable infrastructure signal. Not bot-like — the browser gives us this for free. Keep it, enhance with tree-diff as secondary signal.
- **Login/onboarding** (Category G): All URL-based login detection, page.goto(), and domain checks remain.
- **Permalink construction** (Category G): SchedulerService building `instagram.com/p/{postId}/` for display remains.
- **Action history URLs** (Category F partial): URLs in action history entries are useful for debug logs but should not be shown to the LLM in the prompt.

---

## Part 3: Recommended Execution Order

```
Phase A (Foundation — do first):
  P10: Add pageType to NavigationContext
  P1:  Create PageDetector utility
  P2:  Create PostIdentifier utility

Phase B (High-impact swaps — immediate behavior improvement):
  P3:  Rewrite LLM system prompt (remove URL references)
  P4:  Replace page detection in InstagramScraper
  P5:  Replace page detection in NavigationLLM warnings
  P6:  Replace capture source assignment
  P9:  Remove URL from LLM prompt

Phase C (Dedup infrastructure — cleaner but less visible):
  P7:  Replace URL-based post ID dedup with tree fingerprints
  P8:  Replace URL-path position dedup
```

**Total estimated effort:** 5-8 hours across all phases.
