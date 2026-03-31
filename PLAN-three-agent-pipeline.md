# Implementation Plan: Three-Agent Async Pipeline

## Overview

Replace the current capture system (where the Specialist LLM decides when to capture, resulting in severe under-capture — 2 captures from 41 navigation turns) with a three-agent async pipeline where folders are the interface between stages.

```
Agent 1 (Navigator)          Agent 2 (Filter)           Agent 3 (Digest)
   browses Instagram            watches raw/               reads filtered/
   saves EVERY screenshot       LLM checks each image      writes summary
   to raw/                      saves good ones to
                                filtered/
```

Each agent is fully decoupled. Agent 1 doesn't know Agent 2 exists. Agent 2 doesn't know Agent 3 exists. They communicate through the filesystem.

---

## Step 1: Modify `VisionAction` interface in `src/main/services/VisionAgent.ts`

Remove capture-related fields from the `VisionAction` interface (lines 32-48).

**Before:**
```ts
interface VisionAction {
    thinking: string;
    action: 'click' | 'scroll' | 'type' | 'press' | 'hover' | 'capture' | 'wait' | 'done' | 'newtab' | 'closetab' | 'handoff' | 'escalate';
    element?: number;
    x?: number;        // Used for capture crop coordinates
    y?: number;
    x2?: number;       // Bottom-right x for capture crop region
    y2?: number;       // Bottom-right y for capture crop region
    direction?: 'up' | 'down';
    text?: string;
    key?: string;
    seconds?: number;
    memory?: string;
    phase?: 'posts' | 'search' | 'stories';
    source?: 'feed' | 'story' | 'carousel' | 'search';
    result?: string;
}
```

**After:**
```ts
interface VisionAction {
    thinking: string;
    action: 'click' | 'scroll' | 'type' | 'press' | 'hover' | 'wait' | 'done' | 'newtab' | 'closetab' | 'handoff' | 'escalate';
    element?: number;
    direction?: 'up' | 'down';
    text?: string;
    key?: string;
    seconds?: number;
    memory?: string;
    phase?: 'posts' | 'search' | 'stories';
    result?: string;
}
```

Removed: `'capture'` from action union, `x`, `y`, `x2`, `y2`, `source`.

---

## Step 2: Modify `VisionAgent` class in `src/main/services/VisionAgent.ts`

### 2a. Add raw screenshot directory and counter as class properties

Add these alongside the existing properties (around line 100):

```ts
private rawDir: string = '';
private rawCount: number = 0;
```

### 2b. Initialize rawDir at start of `run()` method

At the beginning of `run()` (after line 161 where the collector log starts), create the raw directory:

```ts
// Set up raw screenshot directory for the three-agent pipeline
const sessionOutputDir = this.collector.getOutputDir();
if (sessionOutputDir) {
    this.rawDir = path.join(sessionOutputDir, 'raw');
    if (!fs.existsSync(this.rawDir)) fs.mkdirSync(this.rawDir, { recursive: true });
}
```

### 2c. Add `saveRawScreenshot()` method

Add this new method in the VisionAgent class (near the other screenshot methods around line 436):

```ts
/**
 * Save a raw screenshot to the raw/ directory for the filter agent.
 * Every navigation screenshot gets saved — no filtering, no dedup.
 * The filter agent (Agent 2) handles quality decisions.
 */
private saveRawScreenshot(buffer: Buffer): void {
    if (!this.rawDir) return;
    this.rawCount++;
    const padded = this.rawCount.toString().padStart(3, '0');
    fs.writeFileSync(path.join(this.rawDir, `${padded}.jpg`), buffer);
    fs.writeFileSync(path.join(this.rawDir, `${padded}.json`), JSON.stringify({
        turn: this.decisionCount,
        phase: this.lastDeclaredPhase || 'unknown',
        timestamp: Date.now(),
        agent: this.activeModel
    }));
}
```

### 2d. Call `saveRawScreenshot()` in the Navigator loop

In `run()`, right after the `captureScreenshot()` call succeeds (line ~180), before `labelElements()`:

```ts
// 1. Take and resize screenshot
const rawScreenshot = await this.captureScreenshot();
if (!rawScreenshot) {
    await this.delay(500);
    continue;
}

// Save raw screenshot for filter agent (Agent 2)
this.saveRawScreenshot(rawScreenshot);

// 1b. Detect interactive elements and draw labels on screenshot
const { buffer: screenshot, elements } = await labelElements(/* ... */);
```

### 2e. Call `saveRawScreenshot()` in the Specialist loop

In `runSpecialist()`, right after the `captureScreenshot()` call succeeds (line ~345), before `labelElements()`:

```ts
// Take screenshot
const rawScreenshot = await this.captureScreenshot();
if (!rawScreenshot) { await this.delay(500); continue; }

// Save raw screenshot for filter agent (Agent 2)
this.saveRawScreenshot(rawScreenshot);

const { buffer: screenshot, elements } = await labelElements(/* ... */);
```

### 2f. Write done marker at end of `run()`

At the end of `run()`, right before the return statement (line ~318):

```ts
// Signal to the filter agent that navigation is complete
if (this.rawDir) {
    fs.writeFileSync(path.join(this.rawDir, 'done.marker'), JSON.stringify({
        totalScreenshots: this.rawCount,
        totalDecisions: this.decisionCount,
        timestamp: Date.now()
    }));
}
```

### 2g. Remove capture-related methods and code

**Delete these methods entirely:**
- `executeCapture()` (lines 522-563)
- `inferCaptureSource()` (lines 707-722)

**Remove from `executeAction()` switch statement (line 480):**
```ts
// DELETE this line:
case 'capture': return this.executeCapture(decision);
```

**Remove `captureCount` property** from the class (around line 100) and all references to it. The `VisionAgentResult` interface should get `captureCount` from `this.collector.getCaptureCount()` or just remove it since the collector is no longer the source of truth — the raw folder is.

Update `VisionAgentResult` to report `rawScreenshotCount` instead:

```ts
export interface VisionAgentResult {
    rawScreenshotCount: number;  // renamed from captureCount
    decisionCount: number;
    actionHistory: ActionHistoryEntry[];
}
```

And the return statement:
```ts
return {
    rawScreenshotCount: this.rawCount,
    decisionCount: this.decisionCount,
    actionHistory: [...this.actionHistory]
};
```

---

## Step 3: Modify Specialist prompt in `src/main/prompts/specialist-agent.md`

Replace the entire file. The specialist no longer captures — it navigates complex UI states (carousels, stories) and screenshots are collected automatically.

**New content:**

```markdown
You are a specialist agent for Instagram content navigation. You MUST respond with ONLY a valid JSON object — no prose, no explanation, no markdown. Every response must be a single JSON object starting with { and ending with }.

You are called in two situations:

1. CAPTURE MODE: The navigator agent has reached a post modal or story viewer. Your job is to navigate through all the content (carousel slides, story frames) so that screenshots are captured automatically on each turn.
2. RESCUE MODE: The navigator agent is stuck and needs you to figure out what's on screen and recover.

ELEMENT LABELS
- Interactive elements on the page are marked with numbered labels drawn on the screenshot.
- Each label is a small badge near the element it refers to, with a thin green border around the element.
- A text list of all labeled elements is also provided (tag, text, link info).
- To interact with an element, use its label number.

ACTIONS (pick one per turn):
  click(n)         Click element [n].
  scroll(dir)      Scroll "up" or "down".
  press(key)       Press a key: Escape, Enter, ArrowRight, ArrowLeft.
  hover(n)         Move mouse to element [n] without clicking.
  wait(seconds)    Wait 1-5 seconds.
  done             You are finished. Return control to the navigator.

CAPTURE MODE
When called for a capture, you will see a screenshot of a post modal, story viewer, or search result post. Screenshots are saved automatically every turn — your job is just to navigate through all the content:

1. VERIFY you are in a capture-ready state (post modal with dark overlay, or story viewer with dark background).
2. If viewing a STORY: click the pause button first (so the screenshot is clean), then wait 1 second.
3. Check for CAROUSEL indicators (right arrow on the post image, dot indicators below). If it's a carousel:
   - Use hover(n) on the post image to reveal the arrow
   - Click the right arrow to advance to the next slide
   - Wait 1 second (so the slide loads and a screenshot is taken)
   - Repeat until no more right arrow appears
4. If viewing STORIES: after the current story is paused and a turn has passed (screenshot taken), click the right arrow to advance to the next story. Pause it, wait. Repeat until you reach the last story or the story viewer closes.
5. When you've navigated through everything in the current post/story sequence, use done.

The key insight: you do NOT need to explicitly capture anything. Every turn takes a screenshot automatically. Your job is to make sure the screen shows the right content on each turn.

RESCUE MODE
When called for rescue, the navigator is stuck. Look at the screenshot and figure out:
- What state is Instagram in? (feed, modal, story viewer, search, error page, unexpected popup, login page)
- What is blocking progress?
- Take 1-3 actions to recover to a known good state (home feed or the state the navigator was trying to reach)
- When recovered, use done with a result message explaining what you did and what the navigator should do next.

SAFETY — HARD RULES
- NEVER click Like, Follow, Share, or Save buttons. These elements are excluded from the label list, but if you somehow see one, do NOT click it.
- NEVER type in comment boxes, reply fields, or direct message inputs.
- NEVER navigate to Messages, DMs, or Direct Inbox. If you end up there, press Escape or click Home immediately.
- NEVER navigate to Explore or Reels. If you end up there, click Home immediately.
- ONLY click Home or Search (magnifying glass) in the left sidebar. Ignore all other sidebar items.
- This is READ-ONLY browsing. Do not engage with content.

OUTPUT FORMAT (JSON):
{
  "thinking": "Post modal is open showing a landscape photo. I see carousel dots — I'll hover to reveal the arrow and advance.",
  "action": "hover",
  "element": 5,
  "memory": "Post modal open. Carousel detected, hovering to reveal right arrow."
}

When using done, include a "result" field describing what you accomplished and what the navigator should do next:
{
  "thinking": "Navigated through 3 carousel slides and the story sequence. All content has been shown.",
  "action": "done",
  "result": "Navigated 3 carousel slides from feed post. Navigator should press Escape to close modal and continue browsing."
}

For rescue done:
{
  "thinking": "Dismissed a notification popup by clicking Not Now. Feed is now visible.",
  "action": "done",
  "result": "Dismissed notification popup. Navigator can continue from the home feed."
}
```

---

## Step 4: Create `src/main/services/ScreenshotFilter.ts` (NEW FILE)

This is Agent 2 — the async filter that watches `raw/` and saves good screenshots to `filtered/`.

```ts
/**
 * ScreenshotFilter - Async LLM-Based Screenshot Filter (Agent 2)
 *
 * Watches the raw/ directory for new screenshots dumped by the Navigator (Agent 1).
 * For each new screenshot, calls an LLM to determine if it contains actual
 * Instagram content worth including in a digest.
 *
 * Saves accepted screenshots to filtered/ for the Digest Writer (Agent 3).
 *
 * Completely decoupled from Agent 1 and Agent 3 — communicates via filesystem only.
 */

import * as fs from 'fs';
import * as path from 'path';
import { ModelConfig } from '../../shared/modelConfig.js';
import { UsageService } from './UsageService.js';

interface FilterResult {
    keep: boolean;
    reason: string;
}

export interface FilterStats {
    processed: number;
    kept: number;
    rejected: number;
    tokensUsed: number;
}

export class ScreenshotFilter {
    private rawDir: string;
    private filteredDir: string;
    private apiKey: string;
    private interests: string[];
    private processed = new Set<string>();
    private running = false;
    private kept = 0;
    private rejected = 0;
    private tokensUsed = 0;
    private usageService: UsageService;

    constructor(rawDir: string, filteredDir: string, apiKey: string, interests: string[]) {
        this.rawDir = rawDir;
        this.filteredDir = filteredDir;
        this.apiKey = apiKey;
        this.interests = interests;
        this.usageService = UsageService.getInstance();

        if (!fs.existsSync(this.filteredDir)) {
            fs.mkdirSync(this.filteredDir, { recursive: true });
        }
    }

    /**
     * Start the async filter loop. Polls raw/ for new screenshots every 2 seconds.
     * Resolves when the Navigator writes done.marker and all remaining files are processed.
     */
    async start(): Promise<FilterStats> {
        this.running = true;
        console.log(`🔍 ScreenshotFilter: watching ${this.rawDir}`);

        while (this.running) {
            // Get all jpg files we haven't processed yet
            const files = fs.readdirSync(this.rawDir)
                .filter(f => f.endsWith('.jpg') && !this.processed.has(f))
                .sort(); // Process in order

            for (const file of files) {
                if (!this.running) break;
                await this.evaluateScreenshot(file);
                this.processed.add(file);
            }

            // Check if navigator is done
            if (fs.existsSync(path.join(this.rawDir, 'done.marker'))) {
                // Do one final sweep for any files that arrived after our last check
                const remaining = fs.readdirSync(this.rawDir)
                    .filter(f => f.endsWith('.jpg') && !this.processed.has(f))
                    .sort();
                for (const file of remaining) {
                    await this.evaluateScreenshot(file);
                    this.processed.add(file);
                }
                this.running = false;
                break;
            }

            // Poll interval
            await new Promise(resolve => setTimeout(resolve, 2000));
        }

        // Write our own done marker
        fs.writeFileSync(path.join(this.filteredDir, 'done.marker'), JSON.stringify({
            processed: this.processed.size,
            kept: this.kept,
            rejected: this.rejected,
            tokensUsed: this.tokensUsed,
            timestamp: Date.now()
        }));

        console.log(`🔍 ScreenshotFilter: done. ${this.kept} kept, ${this.rejected} rejected out of ${this.processed.size} processed.`);

        return {
            processed: this.processed.size,
            kept: this.kept,
            rejected: this.rejected,
            tokensUsed: this.tokensUsed
        };
    }

    /** Stop the filter loop early (e.g. user pressed Cmd+Shift+K). */
    stop(): void {
        this.running = false;
    }

    /**
     * Evaluate a single screenshot using LLM vision.
     * If it contains real content, copy it (and its sidecar JSON) to filtered/.
     */
    private async evaluateScreenshot(filename: string): Promise<void> {
        const filepath = path.join(this.rawDir, filename);
        const buffer = fs.readFileSync(filepath);
        const base64 = buffer.toString('base64');

        try {
            const result = await this.callFilterLLM(base64);

            if (result.keep) {
                // Copy image to filtered/
                fs.copyFileSync(filepath, path.join(this.filteredDir, filename));

                // Copy sidecar metadata if it exists
                const jsonFile = filename.replace('.jpg', '.json');
                const jsonPath = path.join(this.rawDir, jsonFile);
                if (fs.existsSync(jsonPath)) {
                    // Read existing sidecar data and add filter reason
                    const sidecar = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
                    sidecar.filterReason = result.reason;
                    fs.writeFileSync(
                        path.join(this.filteredDir, jsonFile),
                        JSON.stringify(sidecar)
                    );
                }

                this.kept++;
                console.log(`  🔍 ✅ ${filename}: KEEP — ${result.reason}`);
            } else {
                this.rejected++;
                console.log(`  🔍 ❌ ${filename}: REJECT — ${result.reason}`);
            }
        } catch (error) {
            // On error, keep the image (fail open — better to include than miss)
            console.warn(`  🔍 ⚠️ ${filename}: filter error, keeping by default —`, error);
            fs.copyFileSync(filepath, path.join(this.filteredDir, filename));
            const jsonFile = filename.replace('.jpg', '.json');
            const jsonPath = path.join(this.rawDir, jsonFile);
            if (fs.existsSync(jsonPath)) {
                fs.copyFileSync(jsonPath, path.join(this.filteredDir, jsonFile));
            }
            this.kept++;
        }
    }

    /**
     * Call the LLM to decide if a screenshot contains real content.
     * Uses Haiku for speed and low cost.
     */
    private async callFilterLLM(base64Image: string): Promise<FilterResult> {
        const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': this.apiKey,
                'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify({
                model: ModelConfig.tagging,  // Haiku — fast and cheap
                max_tokens: 100,
                messages: [{
                    role: 'user',
                    content: [
                        {
                            type: 'image',
                            source: {
                                type: 'base64',
                                media_type: 'image/jpeg',
                                data: base64Image
                            }
                        },
                        {
                            type: 'text',
                            text: `You are filtering Instagram browsing screenshots for a digest.

Does this screenshot contain actual Instagram content worth summarizing?

YES if: a post is clearly visible (image with caption), a story frame is showing full-screen, a post modal is open (dark overlay with content centered), a search result post is open, carousel content is displayed, a profile page with visible posts.

NO if: this is mid-navigation (home feed scrolling with no post focused), a loading/spinner screen, a search grid showing only tiny thumbnails, a settings/menu page, a login or error screen, mostly UI chrome (sidebar, top bar) with no content, a transitional state between pages, a duplicate of content that looks nearly identical to something you'd expect was just captured (same post, slightly different scroll).

User interests for context: ${this.interests.join(', ')}

Respond with ONLY a JSON object:
{"keep": true, "reason": "Post modal open showing a landscape photo with caption"}
or
{"keep": false, "reason": "Home feed mid-scroll, no post focused"}`
                        }
                    ]
                }]
            })
        });

        const data = await response.json() as any;

        // Track token usage
        if (data.usage) {
            this.tokensUsed += (data.usage.input_tokens || 0) + (data.usage.output_tokens || 0);
            this.usageService.trackUsage({
                inputTokens: data.usage.input_tokens || 0,
                outputTokens: data.usage.output_tokens || 0,
                cacheReadTokens: 0,
                cacheWriteTokens: 0,
                model: ModelConfig.tagging,
                phase: 'filter'
            });
        }

        // Parse response
        const text = data.content?.[0]?.text || '';
        try {
            // Extract JSON from response (handle markdown code blocks)
            const jsonMatch = text.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                return JSON.parse(jsonMatch[0]) as FilterResult;
            }
        } catch {
            // Fall through
        }

        // Default: keep (fail open)
        return { keep: true, reason: 'Failed to parse filter response, keeping by default' };
    }
}
```

---

## Step 5: Modify orchestration in `src/main/services/SchedulerService.ts`

### 5a. Add import

At the top of the file (around line 12):

```ts
import { ScreenshotFilter } from './ScreenshotFilter.js';
```

### 5b. Modify `triggerDebugRunScreenshotFirst()` (the debug run, around line 665)

This is the most important one to change since it's what you test with (Cmd+Shift+H).

Replace the section from "Browse Instagram" through "Generate digest" (approximately lines 707-743). The key changes are:

1. Start the filter agent BEFORE the navigator starts browsing
2. Wait for the filter agent AFTER browsing completes
3. Load filtered images from disk instead of using ImageTagger
4. Remove the ImageTagger step entirely

**Find this block (approximately lines 707-743):**
```ts
// 4. Browse Instagram and capture screenshots
console.log('🧪 Browsing Instagram (90 min max, stop with Cmd+Shift+K)...');
const scraper = new InstagramScraper(context, apiKey, true);
this.activeDebugScraper = scraper;
const session = await scraper.browseAndCapture(
    MAX_DURATION_MS / 60000,
    settings.interests || []
);
this.activeDebugScraper = null;
console.log(`🧪 Browsing complete: ${session.captureCount} screenshots captured`);

// 5. Close browser before generation
await browserManager.close();
context = null;

// 6. Warn if very few captures
if (session.captureCount < 3) {
    console.warn(`🧪 Very few captures (${session.captureCount}), digest quality may be low`);
}

// 6.5. Tag and select best images
console.log('🧪 Tagging captured images for smart selection...');
const tagger = new ImageTagger(apiKey, settings.interests || []);
const { tags, tokensUsed: taggingTokens } = await tagger.tagBatch(session.captures);
const selectCount = Math.min(50, session.captureCount);
const bestCaptures = tagger.selectBest(session.captures, tags, selectCount);
console.log(`🧪 Tagging used ${taggingTokens} tokens, selected ${bestCaptures.length} images`);

// 7. Generate digest from SELECTED screenshots
console.log('🧪 Generating digest from selected screenshots...');
const digestGenerator = new BatchDigestGenerator(apiKey);
const analysis = await digestGenerator.generateDigest(bestCaptures, {
    ...
});
```

**Replace with:**
```ts
// 4. Determine session directories for the three-agent pipeline
//    The scraper creates a ScreenshotCollector which sets up the session dir.
//    We need to get that path after scraper is created but before browsing starts.
const scraper = new InstagramScraper(context, apiKey, true);
this.activeDebugScraper = scraper;

// We need the session output directory. The collector creates it on construction.
// Access it through the scraper's collector after browseAndCapture sets it up.
// NOTE: browseAndCapture creates the collector internally, so we start browsing
// and the raw/ dir is created by VisionAgent.run(). The filter watches for it.

// Determine where the raw/ and filtered/ dirs will be
const debugScreenshotsDir = path.join(__dirname, '../../debug-screenshots');
const sessionTimestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const sessionDir = path.join(debugScreenshotsDir, `session_${sessionTimestamp}`);
const rawDir = path.join(sessionDir, 'raw');
const filteredDir = path.join(sessionDir, 'filtered');
fs.mkdirSync(rawDir, { recursive: true });
fs.mkdirSync(filteredDir, { recursive: true });

// 4a. Start Agent 2 (Filter) in the background — it polls raw/ for new screenshots
console.log('🧪 Starting screenshot filter agent (Agent 2)...');
const filter = new ScreenshotFilter(rawDir, filteredDir, apiKey, settings.interests || []);
const filterPromise = filter.start();

// 4b. Run Agent 1 (Navigator) — browses Instagram, dumps every screenshot to raw/
console.log('🧪 Browsing Instagram (90 min max, stop with Cmd+Shift+K)...');
const session = await scraper.browseAndCapture(
    MAX_DURATION_MS / 60000,
    settings.interests || []
);
this.activeDebugScraper = null;
console.log(`🧪 Browsing complete: ${session.rawScreenshotCount} raw screenshots saved`);

// 5. Close browser before generation
await browserManager.close();
context = null;

// 5a. Wait for Agent 2 (Filter) to finish processing remaining screenshots
console.log('🧪 Waiting for filter agent to finish...');
const filterStats = await filterPromise;
console.log(`🧪 Filter complete: ${filterStats.kept} kept, ${filterStats.rejected} rejected, ${filterStats.tokensUsed} tokens`);

// 6. Warn if very few filtered captures
if (filterStats.kept < 3) {
    console.warn(`🧪 Very few filtered captures (${filterStats.kept}), digest quality may be low`);
}

// 6.5. Load filtered images from disk (replaces ImageTagger)
console.log('🧪 Loading filtered screenshots...');
const filteredFiles = fs.readdirSync(filteredDir)
    .filter(f => f.endsWith('.jpg'))
    .sort();

const bestCaptures = filteredFiles.map((filename, index) => {
    const screenshot = fs.readFileSync(path.join(filteredDir, filename));
    // Read sidecar metadata if available
    const jsonFile = filename.replace('.jpg', '.json');
    const jsonPath = path.join(filteredDir, jsonFile);
    let source: 'feed' | 'story' | 'search' | 'profile' | 'carousel' = 'feed';
    let interest: string | undefined;
    if (fs.existsSync(jsonPath)) {
        try {
            const meta = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
            // Infer source from phase metadata
            if (meta.phase === 'Stories') source = 'story';
            else if (meta.phase === 'Search') source = 'search';
        } catch { /* ignore parse errors */ }
    }
    return {
        id: index + 1,
        screenshot,
        source,
        interest,
        timestamp: Date.now(),
        scrollPosition: 0
    };
});

console.log(`🧪 Loaded ${bestCaptures.length} filtered screenshots`);

// 7. Run Agent 3 (Digest Writer) — generate digest from filtered screenshots
console.log('🧪 Generating digest from filtered screenshots...');
const digestGenerator = new BatchDigestGenerator(apiKey);
const analysis = await digestGenerator.generateDigest(bestCaptures, {
    userName: settings.userName || 'User',
    interests: settings.interests || [],
    location: settings.location || ''
});
```

### 5c. Wire VisionAgent to use the correct rawDir

The VisionAgent needs to know where to save raw screenshots. Currently it gets a `ScreenshotCollector` which manages the session directory. There are two options:

**Option A (simpler):** Pass the `rawDir` path through to VisionAgent via the config. Add `rawDir?: string` to `VisionAgentConfig` and use it in `run()` instead of deriving from the collector's output dir.

**Option B (minimal change):** Have VisionAgent create its own `raw/` subfolder under the collector's session output dir (as described in Step 2b). This works because the collector already creates the session directory on construction.

Recommend Option A for cleaner separation. Update `VisionAgentConfig`:

```ts
export interface VisionAgentConfig {
    apiKey: string;
    maxDurationMs: number;
    userInterests: string[];
    debugMode?: boolean;
    sessionMemoryDigest?: string;
    rawDir?: string;  // NEW: directory for raw screenshot dumps
}
```

Then in `run()`:
```ts
if (this.config.rawDir) {
    this.rawDir = this.config.rawDir;
    if (!fs.existsSync(this.rawDir)) fs.mkdirSync(this.rawDir, { recursive: true });
}
```

And in `InstagramScraper.browseWithAINavigation()`, pass the rawDir through the config.

### 5d. Also update `triggerBakerScreenshotFirst()` (production path, around line 863)

Apply the same three-agent pattern as the debug run. The changes are identical in structure — start filter before browsing, wait for filter after, load filtered images, skip ImageTagger.

### 5e. Stop filter when user stops browsing (Cmd+Shift+K)

In the `stop()` / `stopDebugRun()` methods, also stop the filter:

```ts
// Store filter reference as class property
private activeFilter: ScreenshotFilter | null = null;

public stopDebugRun(): void {
    if (this.activeDebugScraper) {
        this.activeDebugScraper.stop();
    }
    if (this.activeFilter) {
        this.activeFilter.stop();
    }
}
```

---

## Step 6: Update `BrowsingSession` type in `src/types/instagram.ts`

Update to reflect new architecture:

```ts
export interface BrowsingSession {
    captures: CapturedPost[];     // Keep for backward compat (may be empty now)
    videos: CapturedVideo[];
    sessionDuration: number;
    rawScreenshotCount: number;   // NEW: replaces captureCount
    captureCount: number;         // DEPRECATED: keep for compat, will be 0
    videoCount: number;
    scrapedAt: string;
}
```

---

## Step 7: Simplify `ScreenshotCollector.ts`

The collector is no longer responsible for capture logic or dedup. It becomes a thin utility for:
- Session directory management (creating session folders, nav/ dir for debug screenshots)
- Session logging (appendLog, writeSessionLog)
- Providing getNavDir() for debug screenshot overlays

**Remove or deprecate:**
- `captureCurrentPost()` — no longer called
- All dedup state (`capturedHashes`, `capturedPositions`, `lastScrollPosition`, etc.)
- `computePerceptualHash()`, `isSimilarToExisting()`, `getScrollPosition()`
- `saveScreenshotToDisk()` — raw screenshots saved by VisionAgent now
- `getCaptures()`, `getCaptureCount()`, `getSourceBreakdown()`, `getMemoryUsage()`

**Keep:**
- Constructor (session dir creation)
- `getOutputDir()`
- `getNavDir()` (used by VisionAgent for debug overlay screenshots)
- `appendLog()` and session log methods

This can be done incrementally — leave the methods but stop calling them.

---

## Step 8: Update `InstagramScraper.ts`

Update `browseWithAINavigation()` return value to use `rawScreenshotCount`:

```ts
return {
    captures: [],  // No longer populated here — filter agent handles this
    videos: [],
    sessionDuration: Date.now() - startTime,
    rawScreenshotCount: result.rawScreenshotCount,
    captureCount: 0,  // Deprecated
    videoCount: 0,
    scrapedAt: new Date().toISOString()
};
```

---

## Files Changed Summary

| File | Action | Description |
|------|--------|-------------|
| `src/main/services/VisionAgent.ts` | MODIFY | Remove capture methods, add saveRawScreenshot(), write done.marker |
| `src/main/services/ScreenshotFilter.ts` | CREATE | New Agent 2 — async LLM filter watching raw/ |
| `src/main/services/ScreenshotCollector.ts` | SIMPLIFY | Strip dedup/capture logic, keep dir management + logging |
| `src/main/services/SchedulerService.ts` | MODIFY | Wire three-agent pipeline in both debug and production paths |
| `src/main/services/InstagramScraper.ts` | MODIFY | Update return type, pass rawDir config |
| `src/main/prompts/specialist-agent.md` | REPLACE | Remove capture action, simplify to navigation-only |
| `src/types/instagram.ts` | MODIFY | Update BrowsingSession type |
| `src/main/services/ImageTagger.ts` | NO CHANGE | No longer used, but leave in place for now |

## What Stays Exactly the Same

- `src/main/prompts/navigator-agent.md` — navigator prompt unchanged
- `src/main/services/BatchDigestGenerator.ts` — digest generation unchanged
- `src/main/services/GhostMouse.ts` — mouse physics unchanged
- `src/main/services/HumanScroll.ts` — scroll physics unchanged
- `src/main/services/SessionMemory.ts` — cross-session memory unchanged
- `src/utils/elementLabeler.ts` — element labeling unchanged
- All React UI components — unchanged

## Verification

After implementing, run a debug session (Cmd+Shift+H) and check:

1. `raw/` folder should have ~40-60 screenshots (one per navigation turn)
2. `filtered/` folder should have ~15-30 screenshots (actual content)
3. Console logs should show the filter running async alongside navigation
4. Filter logs should show sensible keep/reject decisions
5. The specialist should navigate carousels/stories without ever saying "capture"
6. `done.marker` files should appear in both raw/ and filtered/
7. Digest quality should be comparable or better than before (more content captured)
8. Cmd+Shift+K should stop both the navigator and the filter
