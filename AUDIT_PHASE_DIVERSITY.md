# Audit: Why the LLM Never Uses Stories or Search

**Date:** 2026-02-07
**Files Analyzed:**
- `src/main/services/NavigationLLM.ts` (system prompt, per-turn prompt, buildProgressAudit)
- `src/main/services/InstagramScraper.ts` (navigation loop, goal construction, phase tracking)
- `src/types/navigation.ts` (schema definitions)
- `src/main/services/SessionMemory.ts` (cross-session digest)

---

## Section 1: System Prompt Audit Findings

**Source:** `NavigationLLM.ts:72-250` — `getSystemPrompt()`

### 1.1 — Does the prompt explain what phases exist?

**Partially.** The system prompt mentions three modes but never uses the word "phase" and never explains the phase system:

| Term | Occurrences | Context |
|------|-------------|---------|
| "phase" | 0 | Not mentioned at all |
| "switchPhase" | 1 | Line 201: `switchPhase: "search" \| "stories" \| "feed"` in STRATEGIC DECISIONS — listed as a field, not explained |
| "stories" | 5 | Lines 76, 96, 142-143, 197, 201 — mentioned in passing |
| "search" | 6 | Lines 83, 158-164, 197, 201, 248 — search workflow described |
| "interest" | 1 | Line 248: `"User interests are SEARCH TOPICS ONLY"` — mentioned once, as a warning footnote |
| "explore" | 0 | Not mentioned as a phase |

**Critical finding:** The prompt has a `TIME ALLOCATION` section (lines 80-84) that is the ONLY place describing a multi-activity session:

```
TIME ALLOCATION (proportional to session length):
- ~40%: Feed posts (navigate into post detail pages to capture)
- 40-60%: Stories (capture every frame)
- 60-80%: Search topics, visit profiles, explore grid posts
- 80-100%: Wrap up remaining content, terminate
```

**Problem:** This describes a SEQUENTIAL timeline (first feed, then stories, then search, then wrap up) rather than a time budget (spend X% of time on each). The LLM reads "~40%: Feed posts" and interprets it as "spend the first 40% of the session on feed" — and since sessions often end before 40% is "done," it never moves on. The percentages are session progress markers, not time allocations.

### 1.2 — Does the prompt tell the LLM HOW to switch phases?

**Barely.** Line 201:
```
switchPhase: "search" | "stories" | "feed" — log what you're doing
```

This is tucked inside a compact `STRATEGIC DECISIONS` block with 5 other fields. "Log what you're doing" is confusing — it implies the field is for logging/observability, not for triggering an actual phase transition. The LLM has no reason to believe setting `switchPhase` causes the infrastructure to change its navigation context.

The response format example (lines 227-236) does NOT include `switchPhase`:
```json
{
  "reasoning": "Brief explanation",
  "action": "click",
  "params": { "id": 47, "expectedName": "16h" },
  "expectedOutcome": "Navigate to post detail page",
  "confidence": 0.9,
  "capture": { "shouldCapture": false },
  "strategic": { "captureNow": false, "lingerDuration": "short" },
  "memory": "Captured BR Giannis dunk post..."
}
```

**`switchPhase` is absent from the example output.** The LLM sees a complete example without it and concludes it's not needed.

### 1.3 — Does the prompt tell the LLM WHEN to switch phases?

**No.** There are zero guidelines about when to switch. No triggers like:
- "After 2-3 minutes on feed, switch to stories"
- "If user interests are specified, search for them"
- "When you've captured 5 feed posts, it's time for stories"
- "Balance your time across all three modes"

The TIME ALLOCATION section (1.1 above) is the closest, but it reads as sequential milestones, not switching triggers.

### 1.4 — Does the prompt surface user interests prominently?

**No.** User interests appear exactly ONCE in the system prompt, at the very bottom, as a warning:

```
⚠️ User interests are SEARCH TOPICS ONLY — feed and stories capture EVERYTHING regardless of topic.
```

This is line 248 of a 250-line prompt. It's a footnote, not a mission statement. The LLM sees this as "interests don't matter for what I'm doing" rather than "I should search for these topics."

**The word "michigan athletics" (or whatever the user's interests are) never appears in the system prompt at all** — interests are only in the per-turn context (see Section 2).

### 1.5 — Does the prompt explain how to use stories?

**Minimally.** Two brief mentions:

Line 76: `STORIES: capture EVERY frame (captureNow each frame, advance, repeat)`
Lines 142-143:
```
STORIES:
- Click story button → viewer opens → captureNow → advance (ArrowRight/click right) → captureNow → repeat
- Stories are ephemeral — capture EVERY frame.
```

**Missing:** How to FIND stories (click the colored-ring profile pictures at the top of the feed), what story bubbles look like in the accessibility tree, how to know when stories are exhausted (all dimmed), the story viewer's progress bars, how to close the story viewer (X button or swipe down). The instructions assume the LLM already knows Instagram's story UI.

### 1.6 — Does the prompt explain how to use search?

**Yes — this is actually well-documented.** Lines 160-164:
```
SEARCH WORKFLOW:
1. Click "Search" link in sidebar → type search term → WAIT for results
2. Results appear as LINKS (not buttons) with "username • follower count" pattern
3. CLICK a relevant link → navigates to profile
4. On profile: scroll to grid, click posts to open modals, capture
```

**Problem:** Good instructions exist but the LLM is never told to GO search. The SEARCH WORKFLOW is reference material ("if you decide to search, here's how") not a directive ("you should search for user interests").

### 1.7 — Are there instructions that DISCOURAGE switching?

**Yes — multiple.**

1. **EFFICIENT FEED BROWSING (lines 127-135):** An entire section dedicated to feed browsing rhythm, ending with:
   ```
   Do NOT scroll more than 2 times in a row without clicking a timestamp link.
   If you scroll 3+ times without clicking, you are wasting session time — STOP scrolling and click the nearest timestamp.
   ```
   This creates tunnel vision on the feed scroll-click-capture cycle.

2. **CAPTURE PACE (lines 124-125):**
   ```
   If you have scrolled past 3 or more posts without capturing any, you are being too passive.
   ```
   This pressures the LLM to capture feed posts constantly, leaving no natural "pause to consider switching" moment.

3. **The entire prompt structure is feed-centric.** Of the ~250 lines:
   - ~80 lines about feed browsing mechanics
   - ~15 lines about grid/modal browsing
   - ~4 lines about stories
   - ~5 lines about search
   - ~0 lines about when/why to switch between them

   The LLM infers priority from prompt real estate. Feed gets 80 lines; stories get 4.

4. **STAGNATION RECOVERY (line 197):** Contains `"feed→search"` as a recovery option, implying search is only for when the feed is broken — not a primary activity.

---

## Section 2: Per-Turn Context Audit Findings

**Source:** `NavigationLLM.ts:372-496` — `buildUserPrompt()`

### 2.1 — CURRENT GOAL line

The goal is constructed in `InstagramScraper.ts:947-963` via `getGoalForPhase()`:

```typescript
private getGoalForPhase(phase, userInterests, interestsSearched): NavigationGoal {
    const unsearched = userInterests.filter(i => !interestsSearched.includes(i));
    if (phase === 'search' && unsearched.length > 0) {
        return { type: 'search_interest', target: unsearched[0] };
    }
    return { type: 'general_browse', target: `Phase: ${phase}` };
}
```

**Critical finding:** The goal is ONLY set to `search_interest` when the current phase is already `search`. But the LLM starts in `feed` phase and never switches, so the goal is ALWAYS:

```
CURRENT GOAL: General browsing
```

The user's interests ("michigan athletics") never appear in the CURRENT GOAL line. The LLM has no mission to pursue.

### 2.2 — Where do user interests appear in the per-turn prompt?

They appear in ONE place, conditionally:

```typescript
${context.currentPhase === 'search' ? `SEARCH TOPICS: ${interestsStr}` : ''}
```

**This line is INVISIBLE unless the phase is already `search`.** The LLM is in `feed` phase, so it never sees `SEARCH TOPICS: michigan athletics`. It literally cannot know what to search for from the per-turn prompt alone.

The interests ARE passed in the context object (`context.userInterests`) but they're only rendered in the prompt when `currentPhase === 'search'`. This is a chicken-and-egg problem: the LLM needs to see interests to decide to search, but it only sees interests after it's already searching.

### 2.3 — SESSION MEMORY (from past sessions)

The session memory digest (from `SessionMemory.ts`) shows:
```
SESSION MEMORY (last 3 sessions):
- Interest productivity: "michigan athletics" avg 0.0 captures (low)
- Phase split: feed 100% time → 100% captures
- Avg session: 8.2 captures in 47 actions
```

**This REINFORCES the feed-only pattern.** The LLM sees "feed 100% time → 100% captures" and interprets it as "feed is working well — 100% of captures come from feed." There's no annotation like "this is suboptimal" or "try diversifying."

The interest productivity line says "michigan athletics avg 0.0 captures (low)" — but without a directive to improve this, the LLM just notes it and continues with what's working (feed).

### 2.4 — ACTIVITY HISTORY line

```
ACTIVITY HISTORY: feed: 180s, 5 items
```

Shows only feed activity. No comparison to expected diversity. The LLM sees this as confirming its current approach.

### 2.5 — Phase diversity awareness

**None.** There's no line showing:
- Time split across phases
- Expected vs. actual phase distribution
- A diversity score or nudge

### 2.6 — Time pressure

The time remaining IS shown: `Time: 120s elapsed, 780s remaining (of 900s total)`

But there's no connection between remaining time and unexplored modes. The LLM doesn't see "780s remaining — stories: 0%, search: 0%."

---

## Section 3: Strategic Schema Audit Findings

**Source:** `src/types/navigation.ts:325-342`

### 3.1 — `switchPhase` field

```typescript
export interface StrategicDecision {
    switchPhase?: 'search' | 'stories' | 'feed' | null;
    terminateSession?: boolean;
    captureNow?: boolean;
    lingerDuration?: 'short' | 'medium' | 'long';
    engageDepth?: 'quick' | 'moderate' | 'deep' | null;
    closeEngagement?: boolean;
    reason?: string;
}
```

`switchPhase` exists and accepts the right values. It's **optional** (the `?` means the LLM never has to set it). The infrastructure correctly handles it in `InstagramScraper.ts:592-614`.

### 3.2 — What does the LLM need to output to trigger a search?

The LLM needs to:
1. Set `strategic.switchPhase: "search"` in one turn (infrastructure updates `currentPhase`)
2. Click the "Search" link in the sidebar in the same or next turn
3. Type the search term
4. Browse results

**Problem:** This is a multi-turn sequence that's never demonstrated. The system prompt describes steps 2-4 (SEARCH WORKFLOW) but never connects step 1 (phase switch) to them. The LLM doesn't know that it MUST set `switchPhase: "search"` before the search workflow begins.

### 3.3 — No `searchQuery` field

There's no dedicated `searchQuery` field in StrategicDecision. The LLM must use the generic `type` action to enter search text. This is fine mechanically but means there's no explicit prompt asking "what do you want to search for?"

### 3.4 — No `currentPhase` in the response

The LLM doesn't report what phase it thinks it's in. It can only switch phases — it can't confirm its current understanding. This makes debugging difficult.

---

## Section 4: Specific Code Changes

### Fix 1: Make interests a first-class mission (HIGHEST IMPACT)

**File:** `NavigationLLM.ts:72-84` (system prompt, near top)

**Before:**
```
CORE GOAL: Build a thorough digest of the user's Instagram world by capturing posts and stories from their detail pages.
- FEED: capture posts by navigating to each post's detail page first...
- STORIES: capture EVERY frame...
- GRID: click thumbnails to open modals before capturing...
- Skip: ads/sponsored, "Suggested for you", loading states

TIME ALLOCATION (proportional to session length):
- ~40%: Feed posts (navigate into post detail pages to capture)
- 40-60%: Stories (capture every frame)
- 60-80%: Search topics, visit profiles, explore grid posts
- 80-100%: Wrap up remaining content, terminate
```

**After:**
```
CORE GOAL: Build a thorough digest of the user's Instagram world using ALL three browsing modes:
1. FEED BROWSING: Scroll the home feed, click timestamp links to open post detail pages, capture each post.
2. STORY WATCHING: Click story bubbles (profile pictures with colored rings at the top of the feed) to open the story viewer, capture every frame, advance with ArrowRight.
3. INTEREST SEARCH: Click the "Search" link in the sidebar, type interest keywords, browse results, visit profiles, capture posts from grids.

TIME BUDGET — aim for balanced coverage:
- ~40% of session time: Feed posts
- ~30% of session time: Stories
- ~30% of session time: Searching for user interests + exploring profiles
Do NOT spend the entire session on one activity. Switch modes regularly using switchPhase in your strategic output.
```

---

### Fix 2: Show interests EVERY turn, not just in search phase (CRITICAL)

**File:** `NavigationLLM.ts:468` (per-turn prompt)

**Before:**
```typescript
${context.currentPhase === 'search' ? `SEARCH TOPICS: ${interestsStr}` : ''}
```

**After:**
```typescript
USER INTERESTS: ${interestsStr}${context.currentPhase !== 'search' && context.userInterests.length > 0 ? ' (use Search to find content about these topics)' : ''}
```

This ensures the LLM ALWAYS sees what the user is interested in, with a nudge to search when not already searching.

---

### Fix 3: Make CURRENT GOAL interest-aware regardless of phase

**File:** `InstagramScraper.ts:947-963` — `getGoalForPhase()`

**Before:**
```typescript
private getGoalForPhase(phase, userInterests, interestsSearched): NavigationGoal {
    const unsearched = userInterests.filter(i => !interestsSearched.includes(i));
    if (phase === 'search' && unsearched.length > 0) {
        return { type: 'search_interest', target: unsearched[0] };
    }
    return { type: 'general_browse', target: `Phase: ${phase}` };
}
```

**After:**
```typescript
private getGoalForPhase(phase, userInterests, interestsSearched): NavigationGoal {
    const unsearched = userInterests.filter(i => !interestsSearched.includes(i));

    switch (phase) {
        case 'search':
            return {
                type: 'search_interest',
                target: unsearched.length > 0 ? unsearched[0] : userInterests[0] || 'trending content'
            };
        case 'stories':
            return { type: 'watch_stories' };
        case 'feed':
            return {
                type: 'browse_feed',
                target: userInterests.length > 0
                    ? `Feed browsing — also look for content about: ${userInterests.join(', ')}`
                    : undefined
            };
        default:
            return { type: 'general_browse' };
    }
}
```

---

### Fix 4: Add phase diversity line to per-turn prompt

**File:** `NavigationLLM.ts:476` (after ACTIVITY HISTORY line)

**Add after line 476:**
```typescript
// Phase diversity awareness
let phaseDiversityStr = '';
if (phaseHistory && phaseHistory.length > 0) {
    const totalMs = phaseHistory.reduce((sum, p) => sum + p.durationMs, 0) + (Date.now() - context.startTime - phaseHistory.reduce((sum, p) => sum + p.durationMs, 0));
    const feedPct = Math.round(((phaseHistory.filter(p => p.phase === 'feed').reduce((s, p) => s + p.durationMs, 0) + (context.currentPhase === 'feed' ? Date.now() - /* phaseStartTime would be needed */ 0 : 0)) / Math.max(totalMs, 1)) * 100);
    // Simplified: just use the phase history entries
    const phasePcts = new Map<string, number>();
    for (const p of [...phaseHistory, { phase: context.currentPhase, durationMs: Date.now() - context.startTime, itemsCollected: 0 }]) {
        phasePcts.set(p.phase, (phasePcts.get(p.phase) || 0) + p.durationMs);
    }
    const total = [...phasePcts.values()].reduce((a, b) => a + b, 0);
    const parts = [...phasePcts.entries()].map(([phase, ms]) => `${phase}=${Math.round(ms/total*100)}%`);
    phaseDiversityStr = `PHASE DIVERSITY: ${parts.join(' | ')} (aim for balance across feed, stories, search)`;
}
```

**Simpler approach — compute in `buildUserPrompt()` using context fields already available:**

**File:** `NavigationLLM.ts` — add inside `buildUserPrompt()`, after line 476

```typescript
// Phase diversity nudge
const phaseTimeMap = new Map<string, number>();
if (context.phaseHistory) {
    for (const p of context.phaseHistory) {
        phaseTimeMap.set(p.phase, (phaseTimeMap.get(p.phase) || 0) + p.durationMs);
    }
}
// Add current phase's elapsed time
const currentPhaseElapsed = context.phaseHistory && context.phaseHistory.length > 0
    ? elapsedSec * 1000 - [...phaseTimeMap.values()].reduce((a, b) => a + b, 0)
    : elapsedSec * 1000;
phaseTimeMap.set(context.currentPhase || 'feed', (phaseTimeMap.get(context.currentPhase || 'feed') || 0) + Math.max(0, currentPhaseElapsed));

const totalPhaseMs = [...phaseTimeMap.values()].reduce((a, b) => a + b, 1);
const phaseDiversity = [...phaseTimeMap.entries()]
    .map(([phase, ms]) => `${phase}=${Math.round(ms / totalPhaseMs * 100)}%`)
    .join(' | ');

// Check for missing phases
const allPhases = ['feed', 'stories', 'search'];
const missingPhases = allPhases.filter(p => !phaseTimeMap.has(p));
const diversityNote = missingPhases.length > 0
    ? ` — ${missingPhases.join(', ')} not yet visited`
    : '';
```

Then in the prompt template, add after `ACTIVITY HISTORY`:
```
PHASE DIVERSITY: ${phaseDiversity}${diversityNote}
```

This produces output like:
```
PHASE DIVERSITY: feed=100% — stories, search not yet visited
```

---

### Fix 5: Add `switchPhase` to the response format example

**File:** `NavigationLLM.ts:227-236` (OUTPUT FORMAT example)

**Before:**
```json
{
  "reasoning": "Brief explanation",
  "action": "click",
  "params": { "id": 47, "expectedName": "16h" },
  "expectedOutcome": "Navigate to post detail page",
  "confidence": 0.9,
  "capture": { "shouldCapture": false },
  "strategic": { "captureNow": false, "lingerDuration": "short" },
  "memory": "Captured BR Giannis dunk post. Saw persian_edits reel - skipped. Need to scroll past suggested users."
}
```

**After:**
```json
{
  "reasoning": "Brief explanation",
  "action": "click",
  "params": { "id": 47, "expectedName": "16h" },
  "expectedOutcome": "Navigate to post detail page",
  "confidence": 0.9,
  "capture": { "shouldCapture": false },
  "strategic": { "captureNow": false, "switchPhase": null, "lingerDuration": "short" },
  "memory": "Captured BR Giannis dunk post. Saw persian_edits reel - skipped. Need to scroll past suggested users."
}
```

And add a second example showing a phase switch:
```json
// Example: switching to stories
{
  "reasoning": "Spent 3 min on feed, 5 captures. Time to watch stories for variety.",
  "action": "click",
  "params": { "id": 12, "expectedName": "username's story" },
  "expectedOutcome": "Open story viewer",
  "confidence": 0.8,
  "capture": { "shouldCapture": false },
  "strategic": { "switchPhase": "stories" },
  "memory": "5 feed captures done. Switching to stories. Will search for michigan athletics after stories."
}
```

---

### Fix 6: Expand STORIES instructions in system prompt

**File:** `NavigationLLM.ts:142-143` (STORIES section)

**Before:**
```
STORIES:
- Click story button → viewer opens → captureNow → advance (ArrowRight/click right) → captureNow → repeat
- Stories are ephemeral — capture EVERY frame.
```

**After:**
```
STORIES:
How to find stories: At the top of the feed, you'll see circular profile pictures. Stories with a colored ring (gradient border) are unwatched. Click one to open the story viewer.
In the story viewer:
- You see one full-screen image/video at a time with progress bars at the top
- captureNow IMMEDIATELY (stories are ephemeral)
- Press ArrowRight to advance to the next frame
- captureNow each frame, then ArrowRight again
- When you reach the last frame, ArrowRight moves to the next person's stories
- To exit: press Escape or click the X button
- Stories are ephemeral — capture EVERY frame without exception
- Use switchPhase: "stories" when entering the story viewer
In the accessibility tree, story bubbles appear as buttons/links with username text inside a region near the top of the page (low Y position).
```

---

### Fix 7: Reframe TIME ALLOCATION as a budget, not a sequence

Already covered in Fix 1. The key change is from sequential milestones (`~40%: Feed posts`, `40-60%: Stories`) to parallel budget (`~40% of time: Feed`, `~30% of time: Stories`, `~30% of time: Search`).

---

### Fix 8: Add session memory interpretation note

**File:** `NavigationLLM.ts:487` (where session memory digest is injected)

**Before:**
```typescript
${context.sessionMemoryDigest ? `\nSESSION MEMORY (from past sessions):\n${context.sessionMemoryDigest}\n` : ''}
```

**After:**
```typescript
${context.sessionMemoryDigest ? `\nSESSION MEMORY (from past sessions):\n${context.sessionMemoryDigest}\nNote: If past sessions show 100% feed time, this means stories and search were UNDERUSED — diversify this session.\n` : ''}
```

---

### Fix 9: Remove feed-centric pressure from EFFICIENT FEED BROWSING

**File:** `NavigationLLM.ts:127-135`

**Before:**
```
EFFICIENT FEED BROWSING:
On the feed, follow this rhythm:
1. SCROLL to bring a fresh post into view
2. FIND the timestamp link...
3. CLICK the timestamp link...
4. CAPTURE → then leave
5. Repeat
Do NOT scroll more than 2 times in a row without clicking a timestamp link. Every scroll should be followed by a click.
If you scroll 3+ times without clicking, you are wasting session time — STOP scrolling and click the nearest timestamp.
```

**After:**
```
EFFICIENT FEED BROWSING (when in feed phase):
On the feed, follow this rhythm:
1. SCROLL to bring a fresh post into view
2. FIND the timestamp link...
3. CLICK the timestamp link...
4. CAPTURE → then leave
5. Repeat — OR switch to stories/search if you've been on feed long enough
Aim to click a timestamp within 1-2 scrolls. If you've captured 3-5 feed posts, consider switching to stories or search for variety.
```

---

### Fix 10: Remove "SEARCH TOPICS ONLY" warning or reframe it

**File:** `NavigationLLM.ts:248`

**Before:**
```
⚠️ User interests are SEARCH TOPICS ONLY — feed and stories capture EVERYTHING regardless of topic.
```

**After:**
```
⚠️ On feed and stories, capture everything interesting regardless of user interests. Use interests as SEARCH TOPICS to find specific content via the Search feature.
```

The original phrasing made interests feel unimportant. The reframe keeps the same rule but makes search feel like a valuable activity.

---

## Section 5: Risk Assessment

### Will these changes break existing feed browsing?

**No.** All changes add information and options — nothing removes the LLM's ability to browse the feed. Specific risks:

| Change | Risk | Mitigation |
|--------|------|------------|
| Fix 1: Time budget | LOW — LLM might rush through feed to switch early | The budget is "aim for" not "must achieve" |
| Fix 2: Show interests every turn | NONE — additive context | The nudge is parenthetical, not imperative |
| Fix 3: Interest-aware goals | LOW — goal text changes for feed phase | Feed goal still says "browse_feed", just adds interest mention |
| Fix 4: Phase diversity line | NONE — purely observational | LLM can choose to ignore |
| Fix 5: Example with switchPhase | NONE — additive | Original example still valid |
| Fix 6: Expanded stories instructions | LOW — more prompt tokens | ~100 extra tokens, well within budget |
| Fix 7: Already covered by Fix 1 | — | — |
| Fix 8: Session memory note | LOW — LLM might over-correct | Note is mild ("diversify this session") |
| Fix 9: Soften feed pressure | MEDIUM — LLM might capture fewer feed posts | Counterbalanced by still having feed browsing instructions |
| Fix 10: Reframe interests warning | NONE — same rule, different framing | — |

**Overall risk: LOW.** The biggest risk is Fix 9 (softening feed pressure) potentially reducing feed capture count. But the goal is a BALANCED session, not maximum feed captures. Monitor first session after changes and adjust if feed capture rate drops below 3/session.

### Token budget impact

The system prompt grows from ~250 lines to ~290 lines (~150 extra tokens). The per-turn prompt grows by ~30 tokens (phase diversity line, interests line). Total impact: ~180 tokens per LLM call, well within the 16384 max_tokens budget.

---

## Root Cause Summary

The LLM never switches phases because of **five compounding failures**:

1. **No mission to switch.** The prompt's CORE GOAL says "build a thorough digest" but the only concrete, actionable instructions are about feed browsing. Stories and search are reference sections, not directives.

2. **Interests are invisible.** User interests only appear in the per-turn prompt when the phase is already `search` — a chicken-and-egg bug. The LLM doesn't know WHAT to search for, so it never decides TO search.

3. **`switchPhase` is undocumented.** It's listed as a field with values but no explanation of what it does, when to use it, or that it's important. The example output omits it entirely.

4. **Feed pressure creates tunnel vision.** 80+ lines of feed-specific instructions, capture pace warnings, and scroll-click mandates leave no cognitive space for the LLM to consider alternatives.

5. **Session memory reinforces the pattern.** "Phase split: feed 100% time → 100% captures" reads as success, not as a problem to fix.

**The fix is not to add hardcoded phase timers** — it's to give the LLM the information it needs (interests, diversity metrics, switching instructions) and reduce the information that traps it (feed-only pressure, sequential time allocation, invisible interests).
