# Full Codebase Audit: Primitive Actions vs. LLM Intelligence

> **Principle:** Code provides **arms and legs** (click, scroll, type, screenshot, capture, read tree). The LLM provides **the brain** (what to click, when to scroll, what to capture, how to navigate).

---

## 1. Per-File Inventory

---

### 1.1 `src/main/services/A11yNavigator.ts`

**The biggest file (~2300 lines). Core CDP/tree infrastructure is sound; bloat is in the interpretation layer that duplicates what the LLM can now see.**

#### KEEP (Primitive Actions)

| Lines | What It Does | Why Keep |
|-------|-------------|----------|
| 109-143 | `withSession()` — CDP session lifecycle | Pure infrastructure, no interpretation |
| 516-528 | `getScrollPosition()` — current scrollY via CDP | Raw data, used by scrolling logic |
| 533-549 | `getViewportInfo()` — viewport dimensions via CDP | Purely geometric |
| 628-642 | `getAccessibilityTree()` — raw CDP `Accessibility.getFullAXTree` | Core primitive, undetectable |
| 648-651 | `refetchBoundingBox()` — fresh bounding box after action | Primitive for post-action verification |
| 658-683 | `getNodeBoundingBox()` — `CDP DOM.getBoxModel` wrapper | Low-level CDP call |
| 688-701 | `findMatchingNodes()` — filter nodes by role/name | Pure filtering, no interpretation |
| 710-750 | `findElement()` — find element by role+pattern, return with bbox | Primitive lookup |
| 758-803 | `findStoryCircles()` — find buttons/links with "story" pattern | Pattern matching, returns raw list |
| 814-886 | `findPostElementsAtomic()` — find all articles atomically | Atomic CDP operation, no semantic interpretation |
| 896-920 | `findPostContentBounds()` — article closest to viewport center | Geometric calculation only |
| 943-983 | `findAllButtons()` — all button elements with bboxes | Raw discovery |
| 996-1001 | `INTERACTIVE_ROLES` — static list of roles | Screen reader vocabulary |
| 1014-1054 | `buildAccessibilityTree()` — build parent/child from CDP flat list | Tree construction infrastructure |
| 1069-1076 | `getCachedTree()` — caching with 500ms TTL | Performance optimization |
| 1081-1084 | `invalidateTreeCache()` — cache invalidation after state changes | Infrastructure |
| 1145-1163 | `getParentContainerChain()` — walk up tree for container names | Pure tree traversal, returns raw data |
| 1174-1181 | `isDescendantOf()` — parent-chain walk for hierarchy | Pure tree traversal |
| 1192-1202 | `findAncestorByRole()` — walk up to find ancestor matching roles | Pure tree traversal |
| 1217-1279 | `getDescendantElements()` — interactive descendants of a container | Scoped search, returns raw elements |
| 1354-1400 | `getAllInteractiveElements()` — screen-reader-style discovery | Pure discovery, no hardcoded patterns |
| 1406-1423 | `extractElementState()` — parse properties array | Pure parsing |
| 1429-1432 | `filterByRole()` — filter discovered elements by role | Pure filtering |
| 1438-1441 | `filterByNamePattern()` — filter by regex | Pure filtering |
| 1447-1457 | `filterByRegion()` — filter by bounding box region | Pure spatial filtering |
| 1463-1484 | `dumpInteractiveElements()` — debug output | Debugging aid |
| 1546-1574 | `getFirstElementWithBoundingBox()` — helper | Utility |
| 1647-1675 | `getCarouselSlideIndicator()` — "Slide 2 of 5" pattern | Tree-only data (not visible in 512px screenshot), unambiguous pattern match |
| 1917-1975 | `findCarouselControls()` — find next/prev buttons spatially | Wrapper around findEdgeButton; primarily spatial |
| 1983-2016 | `findPostCaption()` — extract caption text from tree | Pattern matching on node names/roles |
| 2024-2089 | `findMoreButton()` — find "more"/"see more" button | Pattern matching on button names |
| 2095-2141 | `findElementsByName()` — find elements by name pattern | Raw discovery with filtering |
| 2275-2297 | `findSearchButton()` — find search link/button | Pattern-based lookup |

#### MOVE TO PROMPT (LLM Should Decide)

- **Lines 146-169** `getContentState()` — returns `{ hasStories, hasPosts, currentView }`
  - WHY: **INTERPRETATION.** `currentView` is inferred from tree heuristics. With screenshot+tree, LLM can see the UI directly and determine if it's on feed, story, profile, post_detail, explore, or login.
  - MIGRATION: Remove function. Send LLM raw screenshot + tree + URL. Prompt instructs: "Determine your current location from container patterns (articles = feed, dialog+article = post modal, tablist = profile, etc.) and URL."

- **Lines 180-199** `detectCurrentViewFromTree()` — heuristic tree-to-view mapping
  - WHY: **INTERPRETATION.** Reads signals and returns semantic view label. This is exactly what the LLM should do by looking at the tree + screenshot.
  - MIGRATION: Remove function. LLM infers view from raw data.

- **Lines 210-306** `collectViewSignals()` — scans tree for semantic signals
  - WHY: **INTERPRETATION OF INTERPRETATION.** Translates tree patterns into semantic signals.
  - MIGRATION: Rename to `extractRawTreeSignals()`. Return raw counts/flags WITHOUT interpretation:
    ```typescript
    { dialogCount, articleInDialogCount, hasTablist, profileTabCount,
      followButtonsShallow, followerStatsShallow, loginInputCount,
      pauseButtonsShallow, storyButtonCount, gridLinkCount }
    ```

- **Lines 316-339** `detectCurrentViewFromURL()` — URL pattern matching to views
  - WHY: **INTERPRETATION.** LLM receives URL in context and can apply same logic.
  - MIGRATION: Remove. LLM receives URL and infers view.

- **Lines 350-395** `detectEngagementLevel()` — returns engagement context
  - WHY: **INTERPRETATION.** Similar to getContentState but more specific.
  - MIGRATION: Remove. LLM infers engagement level from screenshot + tree.

- **Lines 401-416** `getProfileUsernameFromTree()` — extracts heading name
  - WHY: **SEMI-INTERPRETATION.** Heuristic filtering (skip "Suggestions for you").
  - MIGRATION: Return all shallow headings without filtering; let LLM pick.

- **Lines 423-481** `extractPostEngagementMetrics()` — like count, comment count, etc.
  - WHY: **REDUNDANT WITH VISION.** LLM can see engagement counts in screenshot.
  - MIGRATION: Remove entirely.

- **Lines 488-510** `shouldStopBrowsing()` — time limit or duplicate loop heuristic
  - WHY: **POLICY, not primitive.** Hardcodes termination logic. LLM should decide when to stop.
  - MIGRATION: Remove. NavigationContext includes `sessionStartTime` and `totalDurationMs`. LLM decides.

- **Lines 555-565** `isInStoryViewer()` — boolean: are we viewing a story?
  - WHY: **INTERPRETATION.** Used internally in `findEdgeButton`. LLM should pass context.
  - MIGRATION: Remove as public API. Pass mode explicitly from LLM.

- **Lines 571-586** `getProfileUsername()` — returns username or null
  - WHY: **INTERPRETATION.** LLM sees profile page and can read username from heading.
  - MIGRATION: Remove.

- **Lines 592-603** `isOnFeed()` — boolean: are we on feed?
  - WHY: **INTERPRETATION.** LLM infers from screenshot + tree.
  - MIGRATION: Remove.

- **Lines 609-617** `isOnExplore()` — boolean: are we on explore?
  - WHY: **INTERPRETATION.**
  - MIGRATION: Remove.

- **Lines 1501-1537** `detectVideoContent()` — returns `{ isVideo, hasAudio }`
  - WHY: **INTERPRETATION.** LLM can see video player in screenshot.
  - MIGRATION: Remove.

- **Lines 2147-2158** `detectStoriesPresent()` — boolean: story elements exist?
  - WHY: **INTERPRETATION.** LLM sees story tray in screenshot.
  - MIGRATION: Remove.

- **Lines 2164-2180** `detectPostsPresent()` — boolean: post elements exist?
  - WHY: **INTERPRETATION.** LLM can see engagement buttons in screenshot.
  - MIGRATION: Remove.

- **Lines 2194-2227** `detectAdContent()` — returns `{ isAd, reason }`
  - WHY: **INTERPRETATION.** LLM sees "Sponsored" badge in screenshot.
  - MIGRATION: Remove.

- **Lines 2233-2254** `getEnhancedContentState()` — redundant variant of getContentState
  - WHY: **INTERPRETATION.** Redundant.
  - MIGRATION: Remove.

- **Lines 2264-2267** `isOnSearchPage()` — URL check for /explore or /search
  - WHY: **MINIMAL INTERPRETATION.** LLM can do this.
  - MIGRATION: Remove.

#### REMOVE (Dead/Redundant with Vision)

- **Lines 423-481** `extractPostEngagementMetrics()` — engagement numbers visible in screenshot. Fully redundant with vision.
- **Lines 2147-2158** `detectStoriesPresent()` — LLM infers from tree + screenshot.
- **Lines 2164-2180** `detectPostsPresent()` — LLM infers from tree + screenshot.
- **Lines 2233-2254** `getEnhancedContentState()` — redundant with getContentState.

#### REFACTOR (Simplify But Keep)

- **Lines 1095-1139** `buildTreeSummaryForLLM()` — returns containers/inputs/landmarks
  - CHANGE: Good direction but too filtered. Enhance to `buildFullTreeContextForLLM()` returning all elements (not just filtered subset), with role, name, state. Include in NavigationContext each turn.

- **Lines 1288-1310** `findContainerForElement()` — find semantic container for an element
  - CHANGE: Remove hardcoded `containerRoles`; accept container roles as parameter so LLM can specify.

- **Lines 1318-1339** `findStoryViewerContainer()` — find story viewer modal
  - CHANGE: Remove; keep as optional helper if LLM explicitly asks "find the story container."

- **Lines 1582-1639** `findHighlights()` — find story highlight buttons on profile
  - CHANGE: Rename to `findSmallButtons()`. Remove Instagram-specific logic. Return all buttons 1-15% of viewport width. Let LLM decide if they're highlights.

- **Lines 1699-1908** `findEdgeButton()` — complex spatial search with multiple strategies
  - CHANGE: Currently has hardcoded story vs carousel branching (lines 1829-1904), calling `isInStoryViewer()` internally (line 1731). Remove the branching. Accept explicit `mode: 'story' | 'carousel'` parameter from LLM instead of detecting internally.

---

### 1.2 `src/main/services/NavigationLLM.ts`

**~1500 lines. The 743-line system prompt is ~60% prescriptive decision rules, ~30% context, ~10% primitive descriptions. Inverted priorities.**

#### KEEP (Primitive Actions)

| Lines | What It Does | Why Keep |
|-------|-------------|----------|
| 53-65 | Constructor — API key, model config, session jitter | Infrastructure |
| 1169-1237 | `decideAction()` — main decision loop entry point | Pure orchestration: calls LLM, validates, logs |
| 1242-1313 | `callLLM()` — OpenAI API call with multimodal support | Primitive infrastructure |
| 1323-1331 | Action type validation — whitelist of valid actions | Input sanitization |
| 1347-1361 | **Forbidden element blocking** — like, share, save, follow | **CRITICAL SAFETY.** Read-only mode constraint. Must stay in code. |
| 1365-1403 | **Type action safety** — blocks messaging/comment contexts | **CRITICAL SAFETY.** Prevents sending DMs/comments. Must stay in code. |
| 1405-1414 | Scroll params normalization | Parameter normalization |
| 1416-1432 | Press key validation — whitelist | Safety constraint |
| 1434-1446 | Hover target validation | Input validation |
| 1449-1452 | Wait params clamping (1-5s) | Physical constraint |
| 1458-1530 | `fallbackDecision()` — escalating strategies when LLM fails | Degraded mode safety |

#### MOVE TO PROMPT (LLM Should Decide)

- **Lines 94-99** Session strategy & phase allocation in system prompt
  - WHY: Prescribes exact TIME ALLOCATION percentages (40% feed, 40-60% stories, 60-80% search, 80-100% wrap up). LLM should allocate time based on content quality and remaining budget.
  - MIGRATION: Replace with: "Allocate time flexibly. Priorities: feed (always available), stories (ephemeral), then searches (targeted). Check SESSION STATUS for remaining time."

- **Lines 227-250** Capture rules by content type (ads, sponsored, recency thresholds)
  - WHY: Hard threshold rules on recency (2+ weeks = "STALE — skip"). LLM should reason about recency vs. relevance.
  - MIGRATION: Soften to: "Recent content (< 3 days) is fresher. Older content (2+ weeks) is stale for searches. Prioritize relevance over recency."

- **Lines 480-490** Content engagement depth rules (quick/moderate/deep)
  - WHY: Prescribes exact durations per content type. LLM should decide based on content quality and time remaining.
  - MIGRATION: Keep definitions ("quick=5-10s, moderate=10-20s") but let LLM choose which to apply.

- **Lines 337-384** Stagnation recovery — 9 scenarios with explicit fixes
  - WHY: **EXTREMELY PRESCRIPTIVE.** Tells LLM "If stuck in capture loop, send back() immediately." LLM should discover recovery strategies.
  - MIGRATION: Reduce to: "Stagnation = 5+ actions with no state change. Break the pattern with a different action type."

- **Lines 390-541** Content collection — 4-step feed rhythm, 3-step grid rhythm
  - WHY: **COMPLETELY PRESCRIPTIVE.** Encodes exact click sequences. LLM should discover these patterns from seeing the page.
  - MIGRATION: Replace with context: "Feed posts contain timestamp links (e.g. '16h', '2d') inside article containers. Grid posts are thumbnail links. Click links to navigate to full content."

#### REMOVE (Dead/Redundant with Vision)

- **Line 956** `View: ${context.view}` in CURRENT STATE section of user prompt
  - WHY: LLM has full tree + screenshot. Telling it "you are on the feed" is redundant.

- **Lines 865-885** Goal description prose formatting
  - WHY: Informational but redundant — LLM can infer "I'm searching for X" from URL + tree.

#### REFACTOR (Simplify But Keep)

- **Lines 751-840** Progress audit / loop detection
  - CHANGE: Keep detection logic (good). Reduce prescriptive messages from "SCROLL DOWN to bring a FRESH post into view" to observational "Last 2 clicks produced no state change. Tree unchanged."

- **Lines 71-743** System prompt (673 effective lines)
  - CHANGE: **Reduce from ~743 to ~350-400 lines.** Current split: 60% prescriptive, 30% context, 10% primitives. Target: 30% guidance (softened), 50% context, 20% primitives. Remove exact workflows; keep structural context about how Instagram's UI is organized.

- **Lines 1106-1160** `groupElementsByContainer()` — groups elements by container + contentPreview
  - CHANGE: Good structure but includes redundant engagement numbers (visible in screenshot). Keep semantic hints and hashtags, remove like/comment counts.

- **Lines 1338-1344** Click target not found → silent downgrade to scroll
  - CHANGE: Return error instead of silent downgrade. Let LLM retry with valid ID.

---

### 1.3 `src/main/services/NavigationExecutor.ts`

**~760 lines. Currently 85% primitive actions, 15% decision logic that belongs in the prompt.**

#### KEEP (Primitive Actions)

| Lines | What It Does | Why Keep |
|-------|-------------|----------|
| 103-134 | `execute()` dispatch | Pure routing, no decisions |
| 141-246 | `executeClick()` — click via GhostMouse + state change polling | Mechanical execution + defensive verification |
| 260-312 | `executeScroll()` core — routes to HumanScroll | Mechanical scroll execution |
| 379-439 | `executeType()` — input focus check + character-delay typing | Mechanical with defensive validation |
| 444-465 | `executePress()` — literal key press | Zero decision logic |
| 470-490 | `executeWait()` — mechanical delay with session variance | LLM decides duration |
| 495-545 | `executeHover()` core — GhostMouse hover | Needed for carousel arrows |
| 550-574 | `executeBack()` — browser back + SPA hydration delays | Pure infrastructure |
| 593-616 | `executeClear()` — platform-aware select-all + delete | Purely mechanical |
| 734-738 | `humanDelay()` — session variance multiplier | Anti-detection infrastructure |
| 745-756 | `getQuickDOMSignature()` — dialog/article/scrollY hash | Mechanical state-change detection |

#### MOVE TO PROMPT (LLM Should Decide)

- **Lines 156-167** Name verification in `executeClick()`
  - WHY: Application-level verification happening too late. LLM should verify BEFORE outputting the click ID.
  - MIGRATION: Remove. Add to prompt: "Always verify element name matches your expectation BEFORE outputting the click ID."

- **Lines 509-520** Name verification in `executeHover()` — same pattern
  - MIGRATION: Same as click.

- **Lines 199-218** Link retry logic — wait 1200-1800ms and retry once on no_change_detected
  - WHY: **Recovery policy.** Encodes knowledge of Instagram SPA React hydration timing. LLM should decide whether to retry.
  - MIGRATION: Return failure immediately. Add to prompt: "If click fails with no_change_detected, wait 1-2s and try a different element."

- **Lines 258, 273, 282, 341** Dialog detection — `detectActiveDialog()` queries DOM for dialogs, tags scrolls as "scrolled_in_dialog"
  - WHY: Executor is doing tree interpretation. LLM should know if a dialog is open from the accessibility tree.
  - MIGRATION: Remove. Add to prompt: "If you see [role=dialog] in the tree, you're in a modal. Scroll affects the modal, not the main feed."

#### REMOVE (Dead/Redundant with Vision)

- None identified. All removal candidates are in MOVE section.

#### REFACTOR (Simplify But Keep)

- **Lines 291-309** Scroll direction/amount translation — maps 'small'/'medium'/'large' to viewport %
  - CHANGE: **Long-term:** Change ScrollParams to `distance: number` (signed, negative=up). Add viewport height to NavigationContext. LLM calculates distance directly. **Short-term:** Keep current mapping but document the px values in the prompt.

- **Lines 317-333** Scroll result computation (newInteractive, disappeared)
  - CHANGE: Move diff computation into `HumanScroll.scrollWithIntent()`. Executor becomes passthrough for ScrollResult.

- **Lines 677-715** `isInLoop()` severity scoring — 5 heuristics
  - CHANGE: Consolidate to 3 core signals: scroll stagnation (3+ scrolls same scrollY → SEVERE), click failures (3+ failed → MODERATE), repeated waits on same URL (3+ → MODERATE). Remove noisy checks.

- **Lines 720-729** `getRecoveryAction()` — maps severity to hardcoded actions
  - CHANGE: Return only `{ severity, reason }`. Let NavigationLLM decide recovery action.

---

### 1.4 `src/main/services/InstagramScraper.ts`

**The orchestration layer. Core architecture is sound — clean main loop with no LLM overrides. Issues are secondary: code organization and prompt/code boundary clarity.**

#### KEEP (Primitive Actions)

| Lines | What It Does | Why Keep |
|-------|-------------|----------|
| 102-108 | Entry point — delegates to `browseWithAINavigation()` | Correct delegation |
| 117-126 | `returnToHome()` — URL-based navigation | Infrastructure |
| 131-134 | `humanDelay()` — timing utility | Pure utility |
| 150-164 | `clickWithGaze()` — human-like click via GhostMouse | Primitive click execution |
| 172-179 | `scrollWithIntent()` — wraps HumanScroll | Primitive scroll execution |
| 205-229 | Layer initialization (GhostMouse, A11yNavigator, etc.) | Infrastructure setup |
| 240-305 | Loop setup & cleanup | Session lifecycle |
| 396-402 | Tree & element retrieval | State-reading primitives |
| 404-418 | Screenshot capture & resize for LLM | Technical infrastructure |
| 510-559 | Debug overlay updates | Debugging tool |
| 561-592 | Strategic decision handling (phase switches, termination) | LLM drives these; code records |
| 595-607 | Decision execution via NavigationExecutor | Primitive delegation |
| 637-640 | Story counting | State metric |
| 661-675 | Source detection (feed/story/search/profile) | Infrastructure categorization |
| 785-793 | Post-capture logging | Recording metrics |
| 795-798 | Linger execution (LLM signals `lingerDuration`) | LLM-driven |
| 802-870 | Engagement state sync from accessibility tree | State synchronization |
| 938-943 | Action delay between loop iterations | Anti-detection timing |
| 946-970 | Phase history & session logging | Metrics |
| 972-998 | Session memory save | Persistence |
| 1001-1009 | `estimateEngagementLevel()` | Metric calculation |
| 1012-1018 | `extractPostIdFromUrl()` | URL parsing utility |

#### MOVE TO PROMPT (LLM Should Decide)

- **Lines 625-633** Post view tracking & engagement metrics — hardcoded URL patterns (`/p/`, `/reel/`, `/stories/`) to count engagement
  - WHY: Instagram-specific domain logic. LLM should decide what counts as "post viewed."
  - MIGRATION: Remove tracking logic. Pass `totalPostsSeen`, `uniquePosts` as read-only context.

- **Lines 642-650** Profile navigation deduplication — auto-marks interest as "searched" when landing on profile
  - WHY: Hidden business rule. LLM should track its own progress.
  - MIGRATION: Remove. Add to prompt: "Track which search topics you've explored. Once you visit a profile for a topic, consider it explored."

#### REMOVE (Dead/Redundant)

- **Lines 1025-1053** `getGoalForPhase()` — underdeveloped, takes `phase` parameter but doesn't use it
  - WHY: Called once to populate `context.currentGoal`. Function is vestigial.
  - MIGRATION: Remove or redesign to actually use the `phase` parameter.

#### REFACTOR (Simplify But Keep)

- **Lines 371-377** Time limit check
  - CHANGE: Extract to `hasTimeRemaining()` helper method.

- **Lines 379-394** Loop status & warning injection
  - CHANGE: Extract to `checkAndReportLoopStatus()` method.

- **Lines 420-471** NavigationContext assembly — single massive object
  - CHANGE: Extract sub-builders: `buildSessionContext()`, `buildStrategicContext()`, `buildEngagementContext()`.

- **Lines 683-783** Capture priority logic — three-tier fallback (targetId → viewport → article)
  - CHANGE: Extract to `executeCaptureIntent()` method for readability.

- **Lines 878-936** Auto-recovery logic — code overrides LLM after 3+ loop warnings
  - CHANGE: Move to NavigationExecutor as `executeAutoRecovery()`. Currently mixes execution logic with orchestration.

**Key Finding: Capture is fully LLM-driven.** `shouldCapture = decision.capture?.shouldCapture || decision.strategic?.captureNow` — no hardcoded capture rules. Correct design.

**Key Finding: Phases are LLM-driven.** `decision.strategic?.switchPhase` triggers phase transitions. Code only records transitions. Correct design.

---

### 1.5 `src/main/services/HumanScroll.ts`

**~570 lines. Excellent anti-detection implementation. One boundary violation: `scrollWithIntent()` makes content-aware decisions that should be LLM-driven.**

#### KEEP (Primitive Actions)

| Lines | What It Does | Why Keep |
|-------|-------------|----------|
| 116-144 | `scroll()` — human-like scroll with easing + micro-adjustments | Pure physics simulation |
| 152-175 | `smoothScrollWithEasing()` — wheel events with easing curves | Motor behavior |
| 184-195 | `microAdjust()` — overshoot/correct behavior | Human-like micro-motor pattern |
| 204-240 | `scrollToElementByCDP()` — scroll element into view | Mechanical execution via CDP |
| 252-314 | `scrollToElementCentered()` — centering with tolerance | Pure geometry + retry logic |
| 346-355 | `quickScroll()` — fast navigation scroll | Mechanical primitive |
| 364-385 | `preciseScroll()` — easing-based exact scroll | Motor control |
| 391-421 | Helpers: `scrollToTop()`, `getScrollPosition()`, `isNearBottom()`, `getViewportInfo()` | Pure CDP information retrieval |

#### MOVE TO PROMPT (LLM Should Decide)

- **Lines 446-480** `getScrollParamsForContent()` — returns scroll distance/pause based on content type
  - WHY: **Content-aware intelligence.** Decides "how much to scroll based on what's on screen." Encodes reading behavior assumptions ("text needs smaller scrolls") that should be LLM decisions.
  - MIGRATION: Remove entirely. LLM decides via ScrollParams amount. Add to prompt: "For text-heavy content, use 'small' scrolls. For image-heavy feeds, use 'medium' to 'large'."

- **Lines 494-567** `scrollWithIntent()` — the core boundary violation
  - WHY: Calls `analyzeContentDensity()` to classify content, then adjusts scroll parameters based on content type. This is a **cognitive decision about reading behavior**, not a motor control decision.
  - MIGRATION: Decouple into:
    1. **Primitive `scroll(config)`** — takes explicit distance + pause from caller. Just does physics.
    2. **LLM Decision** — in prompt, LLM assesses content density and picks amount accordingly.
    3. **Executor** (already does this) — converts amount to pixels via SCROLL_PROPORTIONS.

**Anti-detection is NOT compromised by this refactor.** Variable velocities, session randomization, easing curves, micro-adjustments, reading pauses — all stay in the primitive `scroll()` method. Only the content-aware *distance decision* moves to the LLM.

#### REMOVE

- None. All methods serve a purpose.

#### REFACTOR

- **Lines 494-567** `scrollWithIntent()` — simplify to accept explicit distance/pause from caller without internal content analysis.

---

### 1.6 `src/main/services/BrowserManager.ts`

**Pure infrastructure. No changes needed.**

#### KEEP (Everything)

| Lines | What It Does | Why Keep |
|-------|-------------|----------|
| 64-257 | `launch()` — browser init with stealth, fingerprinting, cookies | Infrastructure setup |
| 262-273 | `close()` — cleanup | Resource management |
| 279-300 | `clearData()` — session reset | Administrative |
| 305-379 | `login()` — login flow with human-in-loop | Mechanical interaction |
| 457-487 | `generateWindowSize()` — randomization for fingerprinting | Anti-detection |
| 501-565 | `waitForLoginSuccessViaCDP()` / `checkLoginStateViaCDP()` | Binary state query |

#### MOVE / REMOVE / REFACTOR

- None.

---

### 1.7 `src/types/navigation.ts`

#### KEEP (Raw Observations)

- `NavigationContext.url` — raw URL
- `NavigationContext.scrollPosition` — raw scroll Y
- `NavigationElement.role`, `name`, `position` — raw a11y tree data
- `ActionRecord.timestamp`, `params`, `verified` — raw action execution data
- `ScrollResult` — all fields are raw measurements
- `NavigationLLMConfig` — configuration, no behavior encoding
- `NavigationLoopConfig` — configuration

#### MOVE TO PROMPT (Computed Interpretations)

- `ContentState.hasStories` — **computed inference.** LLM should infer from tree (presence of story buttons).
- `ContentState.hasPosts` — **computed inference.** LLM should infer from tree (article elements).
- `EngagementState.carouselState.fullyExplored` — **decision**, not observation. Should be tracked by LLM.
- `EngagementState.deeplyExploredPostUrls` — **session memory**, better in a SessionMemory service.

#### REFACTOR

- **`ContentState`** — simplify:
  ```typescript
  // BEFORE:
  ContentState { hasStories: boolean; hasPosts: boolean; currentView: string; }
  // AFTER:
  ContentState { currentView: string; }  // hasStories/hasPosts removed
  ```
- `BrowsingPhase` type (`'search' | 'stories' | 'feed' | 'complete'`) — keep as lightweight enum for phase tracking.

---

### 1.8 `src/main/services/ScreenshotCollector.ts`

#### KEEP (Mechanical Capture)

| Lines | What It Does | Why Keep |
|-------|-------------|----------|
| 204-312 | `captureFocusedElement()` — cropped screenshot of element | Mechanical geometry |
| 317-363 | Getter methods + `clear()` | Data management |
| Hash computation | `computeImageHash()` — perceptual hash for dedup | Pure computation |
| Disk I/O | Screenshot storage | Mechanical |

#### MOVE TO PROMPT (LLM Should Decide)

- **Lines 99-192** `captureCurrentPost()` — embedded decision logic:
  - Lines 101-117: memory limit check (decides whether to capture)
  - Lines 109-117: postId deduplication (decides "already captured this")
  - Lines 119-131: position-based dedup (decides "haven't scrolled far enough")
  - Lines 133-138: scroll delta check
  - WHY: Conflates mechanical (take screenshot) with intelligent (is this worth capturing?). LLM should decide "capture this" or "skip (duplicate)."
  - MIGRATION: Simplify to: take screenshot + hash, store if hash is new. LLM manages postId/position dedup via NavigationContext tracking.

- **Lines 376-485** `captureVideoFrames()` — embedded timing decision (`minTimeAdvance` check)
  - WHY: **Timing decision** that should be LLM-driven.
  - MIGRATION: Accept frame schedule from LLM. Collector just follows orders.

#### REFACTOR

- Rename `captureCurrentPost()` → `captureViewport()` (it captures the viewport, not necessarily a "post").
- Extract dedup into `DeduplicationService`:
  - Hash dedup stays in collector (mechanical)
  - PostId/position dedup moves to LLM context (intelligent)

---

### 1.9 `src/types/instagram.ts`

#### KEEP

- `CapturedPost` — screenshot buffer + metadata (facts)
- `BoundingBox`, `Point` — geometry (facts)
- `ElementState` — ARIA state (facts)
- `ScrollConfig` — configuration

#### REFACTOR

- `ContentDensity.type` (`'text-heavy' | 'image-heavy' | 'mixed'`) — this is a **classification**, not a raw measurement. Keep counts (`textCount`, `imageCount`, `textRatio`). Remove `type` field or compute on-demand.

---

## 2. Architecture Diagram

### Current Flow (with interpretation layers)

```
[Browser Page]
    |
    v CDP
[Accessibility Tree (raw)]
    |
    v A11yNavigator INTERPRETATION LAYER
    |   detectCurrentViewFromTree()  <-- heuristic view classification
    |   detectEngagementLevel()      <-- heuristic engagement assessment
    |   getContentState()            <-- computed hasStories/hasPosts
    |   extractPostEngagementMetrics() <-- metric extraction
    |   collectViewSignals()         <-- semantic signal interpretation
    |
    v NavigationLLM PROMPT LAYER
    |   buildUserPrompt()            <-- injects computed "View: feed"
    |   getSystemPrompt()            <-- 743 lines of prescriptive rules
    |   groupElementsByContainer()   <-- editorial groupings
    |   progressAudit()              <-- prescriptive warnings ("SCROLL DOWN")
    |
    v [GPT-4o-mini]
    |
    v NavigationLLM VALIDATION LAYER
    |   validateDecision()           <-- safety nets (KEEP) + silent downgrades
    |
    v NavigationExecutor EXECUTION LAYER
    |   executeClick()               <-- includes name verification (MOVE)
    |   executeScroll()              <-- includes dialog detection (MOVE)
    |   link retry logic             <-- includes SPA timing knowledge (MOVE)
    |
    v HumanScroll ADAPTATION LAYER
    |   scrollWithIntent()           <-- re-analyzes content density (VIOLATION)
    |   getScrollParamsForContent()  <-- overrides LLM scroll decisions
    |
    v [Browser Page]
```

### Target Flow (clean primitive/brain separation)

```
[Browser Page]
    |
    v CDP
[Accessibility Tree (raw)] + [Screenshot (raw)]
    |
    v MINIMAL FORMATTING (no interpretation)
    |   buildFullTreeContextForLLM() — IDs, roles, names, bboxes
    |   extractRawTreeSignals()      — raw counts only
    |   No view detection, no engagement assessment
    |
    v [LLM] — full vision + tree + URL + session state
    |   Decides: what to do, when to capture, how far to scroll
    |   Safety nets remain in code: forbidden elements, type blocking
    |
    v ACTION JSON
    |
    v NavigationExecutor — dumb arms and legs
    |   click(id, bbox)              — physics click + state verification
    |   scroll(distance)             — physics scroll (no content analysis)
    |   type(text)                   — character-delay typing
    |   press(key)                   — literal keypress
    |   wait(seconds)                — delay
    |   back()                       — browser back + hydration wait
    |
    v [Browser Page → loop back to top]
```

### Interpretation Code to Remove (sits between layers)

| Layer | Current Interpretation | Target |
|-------|----------------------|--------|
| A11yNavigator | 15+ `detect*/is*/should*` functions | Raw tree + signals only |
| NavigationLLM.buildUserPrompt | Injects `View: feed`, goal descriptions | Raw URL + tree + metrics |
| NavigationLLM.getSystemPrompt | 743 lines with exact workflows | ~400 lines with context + soft guidance |
| NavigationLLM.progressAudit | "SCROLL DOWN to bring FRESH post" | "Last 2 clicks: no state change" |
| NavigationExecutor | Name verification, dialog detection, link retry | Pure mechanical execution |
| HumanScroll.scrollWithIntent | Content density → scroll distance | Accept distance from caller |
| ScreenshotCollector | postId/position dedup decisions | Hash dedup only; LLM manages the rest |

---

## 3. Migration Priority List

| Priority | File | Change | Impact | Risk | Effort |
|----------|------|--------|--------|------|--------|
| 1 | NavigationLLM | Reduce system prompt from 743→400 lines; remove prescriptive workflows | **High** — less token cost, more LLM autonomy, better generalization | **Low** — prompt changes are easily reversible | Medium |
| 2 | NavigationLLM | Stop injecting computed `View:` / goal descriptions in buildUserPrompt | **High** — LLM reasons from raw data, not pre-chewed interpretations | **Low** — just remove fields | Small |
| 3 | NavigationLLM | Change progressAudit from prescriptive ("SCROLL DOWN") to observational ("no state change") | **High** — LLM discovers solutions instead of following orders | **Low** — wording change | Small |
| 4 | A11yNavigator | Remove 15+ detect/is/should interpretation functions | **High** — eliminates interpretation layer, reduces file by ~500 lines | **Medium** — must verify nothing downstream breaks | Medium |
| 5 | HumanScroll | Remove content-aware scroll decisions from scrollWithIntent() | **Medium** — clean separation of brain vs arms | **Low** — anti-detection physics unchanged | Small |
| 6 | NavigationExecutor | Remove name verification, dialog detection, link retry | **Medium** — executor becomes purely mechanical | **Medium** — link retry removal needs prompt compensation | Medium |
| 7 | NavigationExecutor | Return `{ severity, reason }` from loop detection, not hardcoded recovery actions | **Medium** — LLM decides recovery strategy | **Low** — only affects recovery path | Small |
| 8 | ScreenshotCollector | Simplify captureCurrentPost() to hash-only dedup | **Medium** — cleaner capture pipeline | **Medium** — must ensure LLM tracks postId dedup | Medium |
| 9 | InstagramScraper | Move auto-recovery (lines 878-936) to NavigationExecutor | **Low** — code organization | **Low** — pure refactor | Small |
| 10 | InstagramScraper | Extract context builders, capture intent method | **Low** — readability | **Low** — pure refactor | Small |
| 11 | navigation.ts | Remove hasStories/hasPosts from ContentState | **Low** — type cleanup | **Low** — must update consumers | Small |
| 12 | NavigationExecutor | Change ScrollParams from `amount: string` to `distance: number` | **Medium** — LLM reasons in pixels | **Medium** — API change across files | Large |

---

## 4. System Prompt Implications

### 4.1 Things the Current Prompt Already Handles (Code Was Redundant)

These code functions can be deleted immediately — the system prompt already teaches the LLM the same things:

| Code Function | Prompt Already Says |
|--------------|-------------------|
| `detectCurrentViewFromTree()` | Lines 104-122: "WEB UI REASONING" teaches LLM to infer page context from tree patterns |
| `detectCurrentViewFromURL()` | Lines 199-200: "DYNAMIC PAGE AWARENESS — infer from tree context" + URL is in context |
| `isOnFeed()` / `isOnExplore()` | Lines 111-116: "Many article containers = content feed, grid of images = gallery" |
| `detectAdContent()` | Line 79: "The ONLY content to skip: ads/sponsored posts" |
| `detectStoriesPresent()` | Lines 126-127: "Stories region near top = story circles to watch" |
| `detectPostsPresent()` | Lines 127-128: "article container = parts of a post" |
| `extractPostEngagementMetrics()` | LLM can see engagement in screenshot; tree includes button names with counts |
| `shouldStopBrowsing()` | Lines 100-102: "YOU CONTROL... when to terminate" + session status provided |

### 4.2 Things That Need NEW Prompt Sections

| New Section | What It Replaces | Draft Content |
|------------|-----------------|---------------|
| **SCROLL BEHAVIOR** | `HumanScroll.getScrollParamsForContent()` + `scrollWithIntent()` | "Analyze content density from the tree. Text-heavy (many caption nodes): use 'small'. Image-heavy (many articles, few text): use 'medium' or 'large'. Ads/sparse: use 'large'. The code applies human-like physics to whatever distance you choose." |
| **CLICK RECOVERY** | `NavigationExecutor` link retry logic (lines 199-218) | "If a click fails with 'no_change_detected', the page may not have finished loading. Wait 1-2 seconds, then try a DIFFERENT element in the same article (e.g., a different link). Do NOT retry the exact same click." |
| **DIALOG AWARENESS** | `NavigationExecutor.detectActiveDialog()` | "If you see [role=dialog] in the accessibility tree, you're inside a modal. Scroll actions will scroll the modal content, not the main page. To return to the main page, close the dialog (press Escape or click Close)." |
| **DEDUPLICATION** | `ScreenshotCollector` postId/position dedup | "The capture system filters exact duplicate images automatically. Your job is to avoid capturing the SAME post twice — track which post URLs you've already captured and skip them." |
| **INTEREST TRACKING** | `InstagramScraper` lines 642-650 | "Track which search topics you've explored. When you visit a profile that matches a search topic, consider that topic explored. Report explored topics in your reasoning." |

### 4.3 Things Where the Current Prompt Needs MODIFICATION

| Current Section | Problem | Modified Version |
|----------------|---------|-----------------|
| **TIME ALLOCATION (lines 94-98)** | Hardcoded percentages (40%/60%/80%) contradict "LLM full control" | "Allocate time flexibly based on content quality. Priority order: 1) Feed posts (always available), 2) Stories (ephemeral, expire in 24h), 3) Searches (targeted content). Check SESSION STATUS for remaining time and adjust." |
| **CAPTURE PACING (lines 88-92)** | "Capture EVERY post... on almost every scroll action" is micromanagement | "Capture aggressively — the goal is a complete digest. If you've scrolled 3+ times without capturing, you're likely missing content." (softer) |
| **STAGNATION RECOVERY (lines 337-384)** | 9 scenarios with explicit fixes are prescriptive | "If your last 3+ actions produced no state change, you're stuck. Try: a different element, a different page section, or navigate away and come back. Use your judgment." |
| **CONTENT COLLECTION 4-STEP RHYTHM (lines 390-541)** | Exact click sequences encoded as checklist | "Feed posts: click a LINK inside the article to open the detail page. Timestamp links (e.g., '16h', '2d') are the most reliable. Grid posts: click thumbnails to open modals. Capture the detail view, not the thumbnail/card." |
| **CRITICAL REMINDERS (lines 730-743)** | 13 numbered rules reinforce prescriptive behavior | Reduce to 5 core reminders: 1) Capture often, 2) Links navigate/buttons don't, 3) Don't click forbidden elements, 4) Track time, 5) Terminate when done |

---

## 5. Risk Assessment

### Risk #1: View Detection Removal → Navigation Failures

**What moves:** `detectCurrentViewFromTree()`, `collectViewSignals()`, `getContentState()` — all removed from A11yNavigator.

**Risk:** The LLM misidentifies the current page (e.g., thinks a post modal is the main feed) and makes wrong decisions (scrolling when it should capture, pressing Back when it should press Escape).

**Severity:** HIGH — incorrect view detection cascades into incorrect actions for the entire session.

**Why it's a risk specifically:**
- The current heuristics are highly tuned (dialog+article-in-dialog=post_detail, depth checks for profile detection, etc.)
- Vision at 512px resolution may not show subtle differences (e.g., thin dialog borders)
- Instagram changes layouts periodically

**Mitigation:**
1. **Keep `extractRawTreeSignals()` as a helper** — return raw counts (dialog count, article-in-dialog count, tablist presence) in NavigationContext. LLM gets these signals alongside the screenshot.
2. **Add a thin safety check** — if LLM's action seems inconsistent with obvious tree signals (e.g., LLM says "scroll feed" but tree has 0 articles and a dialog), log a warning. Don't override, just log.
3. **Prompt reinforcement** — the system prompt's "WEB UI REASONING" section (lines 104-122) already teaches view inference. Strengthen it with the specific signal patterns: "dialog + article inside dialog = you're viewing a post in a modal overlay."

### Risk #2: Scroll Decision Delegation → Anti-Detection Regression

**What moves:** `scrollWithIntent()` no longer analyzes content density. LLM decides scroll amount via `'small'/'medium'/'large'`.

**Risk:** LLM scrolls uniformly (e.g., always 'medium') creating a detectable bot pattern. Humans scroll variably based on content — short scrolls on text, long scrolls past ads. A uniform pattern could trigger Instagram's behavioral fingerprinting.

**Severity:** MEDIUM — behavioral fingerprinting is a secondary detection vector (CDP stealth is primary defense), but this adds risk.

**Why it's a risk specifically:**
- LLMs are known to be "predictably random" — they may settle into patterns
- Content density analysis in HumanScroll is sophisticated (text ratio → distance mapping with per-session variance)
- The LLM only sees a compressed 512px screenshot; content density assessment may be imprecise

**Mitigation:**
1. **Keep physics-layer variance in code** — even if LLM says 'medium', the code applies ±30% random variation, easing curves, micro-adjustments, and session-level timing multipliers. This already exists in `HumanScroll.scroll()` and is NOT removed.
2. **Add prompt guidance** — "Vary your scroll amounts. Don't always use 'medium'. Mix small, medium, and large scrolls naturally. Scroll less past text-heavy content, more past images."
3. **Monitor in production** — log LLM scroll decisions and check distribution. If >70% are 'medium', the prompt needs tuning.

### Risk #3: Capture Dedup Removal → Data Quality Drop

**What moves:** `ScreenshotCollector` postId/position dedup logic moves to LLM management. Only hash dedup stays in code.

**Risk:** LLM fails to track captured postIds and captures the same post multiple times (wasting storage, inflating counts, degrading digest quality). Or worse, LLM over-skips and misses content.

**Severity:** MEDIUM — data quality degrades but session doesn't break.

**Why it's a risk specifically:**
- LLM context window is limited; tracking many postIds in prompt may be unreliable
- Instagram's SPA reuses URLs for different views (carousel slides share same URL)
- Current code-level dedup handles edge cases (position-based, scroll-delta-based, carousel exemptions)

**Mitigation:**
1. **Keep hash dedup in code** — identical screenshots are always rejected. This catches true duplicates regardless of LLM tracking.
2. **Keep lightweight postId dedup in code** — maintain a `Set<string>` of captured postIds in ScreenshotCollector. When LLM signals capture, check postId first. This is mechanical (set lookup), not a decision.
3. **Remove only the position/scroll-delta heuristics** — these are the interpretation-heavy parts. Hash + postId dedup together catch 95%+ of duplicates mechanically.
4. **Add to NavigationContext** — `recentCaptures: string[]` (last 10 postIds). LLM sees what it recently captured and avoids re-requesting.

---

## Summary

### By the Numbers

| Category | Functions/Sections | Action |
|----------|-------------------|--------|
| **KEEP** | ~45 functions across all files | No changes needed |
| **MOVE TO PROMPT** | ~25 functions/sections | Delete code, add/modify prompt sections |
| **REMOVE** | ~8 functions | Delete entirely (redundant with vision) |
| **REFACTOR** | ~15 functions/sections | Simplify but keep |

### Code Reduction Estimate

| File | Current Lines | After Audit | Reduction |
|------|-------------|-------------|-----------|
| A11yNavigator.ts | ~2300 | ~1600 | -700 (30%) |
| NavigationLLM.ts | ~1500 | ~1100 | -400 (27%) |
| NavigationExecutor.ts | ~760 | ~650 | -110 (14%) |
| InstagramScraper.ts | ~1050 | ~950 | -100 (10%) |
| HumanScroll.ts | ~570 | ~450 | -120 (21%) |
| ScreenshotCollector.ts | ~500 | ~400 | -100 (20%) |
| **Total** | **~6680** | **~5150** | **-1530 (23%)** |

### Architecture Score

| Aspect | Current | After Audit |
|--------|---------|-------------|
| A11yNavigator: primitives vs interpretation | 60/40 | 90/10 |
| NavigationLLM: context vs prescription | 30/70 | 60/40 |
| NavigationExecutor: mechanical vs decision | 85/15 | 95/5 |
| InstagramScraper: orchestration vs logic | 80/20 | 90/10 |
| HumanScroll: physics vs intelligence | 70/30 | 95/5 |
| **Overall brain/arms separation** | **65%** | **90%** |
