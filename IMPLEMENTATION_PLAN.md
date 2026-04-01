# Kowalski Multi-Agent Architecture — Implementation Plan

## Current State

A single `Scroller` (VisionAgent) handles all browsing: stories, feed, carousels, stuck recovery. It carries a 116-line system prompt covering both activities on every LLM turn. A separate filter agent runs async on raw screenshots, and post-processing (digest, analysis) runs after the session.

## Target Architecture

**Rename `Kowalski` → `Kowalski`.** This is the master agent — the single entry point that owns the full pipeline. Rename the file from `Kowalski.ts` to `Kowalski.ts` and the class from `Kowalski` to `Kowalski`.

```
┌─────────────────────────────────────────────────────┐
│  Kowalski (formerly InstagramScraper)         │
│  No LLM calls — pure coordination logic              │
│                                                      │
│  1. Launch browser, validate session                 │
│  2. Run Phase 1: Stories                             │
│  3. Run Phase 2: Feed                               │
│  4. Run Phase 3: Digest                             │
│  5. Return final digest to UI                       │
└──────────┬──────────────┬──────────────┬────────────┘
           │              │              │
     ┌─────▼─────┐  ┌────▼─────┐  ┌────▼──────┐
     │  Phase 1   │  │  Phase 2  │  │  Phase 3   │
     │            │  │           │  │            │
     │ Stories    │  │ Feed      │  │ Digest     │
     │ Agent      │  │ Agent     │  │ Agent      │
     │ (Haiku)    │  │ (Sonnet)  │  │ (Sonnet)   │
     │     +      │  │     +     │  │            │
     │ Filter     │  │ Filter    │  │ Reads both │
     │ Instance 1 │  │ Instance 2│  │ filter sets│
     └────────────┘  └───────────┘  └────────────┘
```

### Phase 1 — Stories Agent + Filter

**Agent:** `StoriesAgent` — bounded, mechanical, cheap.

**Model:** Haiku. Stories navigation is a tight loop (advance right, advance right, escape) that doesn't require strong reasoning.

**Prompt scope:** Only story-related capabilities and instructions. No feed knowledge, no carousel logic, no post-opening strategy. Roughly 30-40 lines vs the current 116.

**Exit conditions:**
- Stories end naturally (Instagram returns to feed)
- Hard time cap of 3 minutes (configurable)
- Stuck counter hits threshold → press Escape, click Home

**Filter Instance 1:** Runs async in parallel. Processes `raw/stories/` screenshots. Writes `done.marker` when stories agent finishes.

**Output directory:** `raw/stories/`

### Phase 2 — Feed Agent + Filter

**Agent:** `FeedAgent` — the complex browsing agent.

**Model:** Sonnet. Feed browsing requires reasoning about which elements are timestamp links, how to handle carousels, when to scroll, how to dismiss unexpected UI.

**Prompt scope:** Only feed-related capabilities and instructions. No story navigation, no story avatar detection. Roughly 60-70 lines.

**Entry state:** Page is on the home feed (stories agent left it there). Stories are marked as viewed. Cursor is in the content area.

**Exit conditions:**
- Time budget exhausted (total session budget minus stories phase duration)
- LLM calls `done`
- External stop signal (Cmd+Shift+K)

**Filter Instance 2:** Runs async in parallel. Processes `raw/feed/` screenshots. Writes `done.marker` when feed agent finishes.

**Output directory:** `raw/feed/`

### Phase 3 — Digest Agent

**Agent:** Existing `DigestGeneration` / `AnalysisGenerator` — runs once after both browsing phases complete.

**Model:** Sonnet (or Opus via env override if quality matters).

**Input:** Filtered screenshots from both `raw/stories/` and `raw/feed/`, merged with `Source: story` and `Source: feed` tags already in place.

**Output:** The final `AnalysisObject` rendered in GazetteScreen.

---

## Implementation Steps

### Step 1 — Split the system prompt

Separate `navigator-agent.md` into three files:

| File | Contents | Lines (est.) |
|------|----------|-------------|
| `capabilities.md` | Action definitions (click, scroll, type, press, hover, wait, newtab, closetab, done), output JSON format, element label explanation, memory format | ~35 |
| `stories-instructions.md` | Stories mission, strategy (click leftmost avatar, advance with ArrowRight, escape when done), exit conditions, stories-specific unexpected UI handling | ~30 |
| `feed-instructions.md` | Feed mission, strategy (open via timestamp → view carousel → escape → scroll), safety rules, self-correction, feed-specific Instagram domain knowledge | ~55 |

The capabilities file is the stable, cached layer. The instruction files are where iteration happens.

### Step 2 — Create StoriesAgent class

New file: `src/main/services/StoriesAgent.ts`

Minimal fork of the current `Scroller` with these differences:
- Uses `capabilities.md` + `stories-instructions.md` as system prompt
- Model defaults to Haiku (new `ModelConfig.stories` slot)
- Hard time cap (default 3 minutes, configurable)
- Writes raw screenshots to `raw/stories/`
- No reference images needed (stories UI is simple)
- Smaller `max_tokens` (512 is plenty for story navigation)

Shares the same core loop: screenshot → label → LLM → action → repeat.

### Step 3 — Create FeedAgent class

New file: `src/main/services/FeedAgent.ts`

Fork of `Scroller` with these differences:
- Uses `capabilities.md` + `feed-instructions.md` as system prompt
- Model stays Sonnet
- Gets remaining time budget (total minus stories duration)
- Writes raw screenshots to `raw/feed/`
- Reference images included (feed navigation is more complex)
- Pre-positions mouse in feed area on first turn

### Step 4 — Extract shared base class

Both `StoriesAgent` and `FeedAgent` share ~80% of the `Scroller` code (screenshot capture, LLM calling, action execution, debug screenshot saving, JSON parsing). Extract a `BaseVisionAgent` class:

```
BaseVisionAgent (abstract)
├── captureScreenshot()
├── callLLM()
├── executeAction() + all action handlers
├── saveDebugScreenshot()
├── parseJsonResponse()
├── run() — the main loop
│
├── abstract getSystemPrompt(): string
├── abstract getMaxDuration(): number
├── abstract getRawDir(): string
│
StoriesAgent extends BaseVisionAgent
FeedAgent extends BaseVisionAgent
```

### Step 5 — Update Kowalski orchestration

Modify `browseWithAINavigation()`:

```typescript
// Phase 1: Stories
const storiesRawDir = path.join(outputDir, 'raw', 'stories');
const storiesAgent = new StoriesAgent(page, ghost, scroll, collector, {
    apiKey: this.apiKey,
    maxDurationMs: Math.min(3 * 60 * 1000, targetDurationMs * 0.15),
    rawDir: storiesRawDir,
});
const storiesResult = await storiesAgent.run();

// Phase 2: Feed (remaining budget)
const elapsed = Date.now() - startTime;
const feedRawDir = path.join(outputDir, 'raw', 'feed');
const feedAgent = new FeedAgent(page, ghost, scroll, collector, {
    apiKey: this.apiKey,
    maxDurationMs: targetDurationMs - elapsed,
    rawDir: feedRawDir,
    sessionMemoryDigest,
});
const feedResult = await feedAgent.run();

// Phase 3: Digest
// (existing digest pipeline reads from both raw directories)
```

### Step 6 — Update filter agent to handle split directories

The filter agent currently watches a single `raw/` directory. Update it to either:
- (a) Accept a directory path and run two instances (one per phase), or
- (b) Watch both `raw/stories/` and `raw/feed/` and tag outputs with source

Option (a) is cleaner — two independent filter instances, each paired with its agent.

### Step 7 — Add ModelConfig.stories slot

```typescript
export const ModelConfig = {
    stories: process.env.KOWALSKI_STORIES_MODEL || 'claude-haiku-3-5-20241022',
    navigation: process.env.KOWALSKI_NAV_MODEL || 'claude-sonnet-4-6',
    // ... rest unchanged
};
```

---

## Cost Impact Estimate

| Component | Before | After |
|-----------|--------|-------|
| Stories navigation (per turn) | Sonnet + 116-line prompt + reference images | Haiku + 65-line prompt + no reference images |
| Feed navigation (per turn) | Sonnet + 116-line prompt | Sonnet + 90-line prompt |
| Stories turns per session | ~10-15 (embedded in single agent) | ~10-15 (dedicated, much cheaper per turn) |
| Feed turns per session | ~40-50 (embedded in single agent) | ~40-50 (slightly cheaper per turn) |
| Prompt cache hit rate | Low (monolith prompt changes often) | High (capabilities layer is stable) |

**Estimated per-session cost reduction from this change alone: 20-30%** on top of the model downgrades already applied.

