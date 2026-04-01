# Debug Screenshot Rework — Per-Turn Folders with Full Context

Rework debug screenshot saving so each turn gets its own folder containing the labeled screenshot, the raw screenshot, and a metadata JSON file with the full agent state for that turn. Save everything to `~/Downloads/kowalski-debug/` so it's easy to browse in Finder.

## Current State

Debug screenshots go to `debug-screenshots/session_<timestamp>/nav/`:
```
nav/
├── turn_001_click.jpg      ← labeled screenshot with red crosshair on clicked element
├── turn_002_scroll.jpg
├── turn_003_press.jpg
└── ...
```

Problems:
- **No raw screenshot saved alongside the labeled one.** You can see the badges but not the clean image.
- **No metadata.** The decision JSON, element map, intent, expected state, recovery plan — none of this is persisted. If you want to debug why the agent clicked element [12], you only have the visual.
- **Buried in the project directory.** `debug-screenshots/` lives inside the app source tree, not somewhere easy to browse.

## New Structure

```
~/Downloads/kowalski-debug/
└── session_2026-04-01T14-30-00/
    ├── stories/
    │   ├── turn_001_click/
    │   │   ├── labeled.jpg          ← screenshot with element badges + red crosshair
    │   │   ├── raw.jpg              ← clean screenshot, no overlays
    │   │   └── metadata.json        ← full turn state (see schema below)
    │   ├── turn_002_press/
    │   │   ├── labeled.jpg
    │   │   ├── raw.jpg
    │   │   └── metadata.json
    │   └── ...
    ├── feed/
    │   ├── turn_001_scroll/
    │   │   ├── labeled.jpg
    │   │   ├── raw.jpg
    │   │   └── metadata.json
    │   └── ...
    └── session_log.md               ← existing session log, unchanged
```

Each turn gets its own folder named `turn_<NNN>_<action>`. Inside: three files, always the same names. Easy to click through in Finder — open a turn folder, see the labeled image, the raw image side by side, and the metadata for full context.

Organized by agent phase (`stories/` vs `feed/`) so you can see each agent's progression separately.

## Metadata Schema

```json
{
  "turn": 3,
  "agent": "FeedAgent",
  "timestamp": "2026-04-01T14:32:15.123Z",
  "elapsed_ms": 135000,
  "remaining_ms": 465000,

  "decision": {
    "thinking": "I see a post with timestamp '6h'. Clicking to open the post modal.",
    "action": "click",
    "element": 15,
    "intent": "open post detail modal",
    "expected_state": "dark overlay with full post image centered, caption and comments on right",
    "if_wrong": "press Escape, then try a different timestamp link",
    "memory": "WHAT: feed\nPLAN: open post, advance carousel, escape\nSTUCK: 0",
    "lesson": null
  },

  "elements": [
    {
      "id": 1,
      "tag": "a",
      "text": "Home",
      "ariaLabel": "Home",
      "href": "/",
      "role": "link",
      "x": 12,
      "y": 200,
      "width": 50,
      "height": 24,
      "note": "navigates to home feed"
    },
    {
      "id": 15,
      "tag": "a",
      "text": "6h",
      "ariaLabel": "",
      "href": "/p/ABC123/",
      "role": "link",
      "x": 450,
      "y": 380,
      "width": 22,
      "height": 18,
      "note": "opens post detail modal"
    }
  ],

  "clicked_element": {
    "id": 15,
    "center_x": 461,
    "center_y": 389
  },

  "action_history": [
    "click([3] story avatar) → click executed at (200, 80)",
    "press(ArrowRight) → key pressed",
    "press(Escape) → key pressed"
  ],

  "learned_lessons": [
    "clicking post images plays video inline; use timestamp links instead"
  ],

  "element_knowledge_snapshot": {
    "a|Home|/": "navigates to home feed",
    "button|Close|": "dismisses current overlay",
    "a||/p/": "opens post detail modal"
  },

  "tokens": {
    "input": 3420,
    "output": 185,
    "cache_read": 2800,
    "cache_creation": 0
  }
}
```

This gives you everything needed to fully replay or debug any turn: what the agent saw (labeled + raw images), what it decided (decision), what it knew about the elements (elements with notes), what it had learned so far (lessons + knowledge), and what it cost (tokens).

## Implementation Steps

### Step 1 — Configure output to Downloads

In `ScreenshotCollector.ts`, change the default `saveToDirectory` to use the system Downloads folder:

```typescript
import { app } from 'electron';
import path from 'path';

// In collector config or InstagramScraper where it passes the config:
const debugRoot = path.join(app.getPath('downloads'), 'kowalski-debug');
```

Update `InstagramScraper.ts` (soon `Kowalski.ts`) where the collector is instantiated:

```typescript
// Replace:
saveToDirectory: path.join(__dirname, '../../debug-screenshots')

// With:
saveToDirectory: path.join(app.getPath('downloads'), 'kowalski-debug')
```

The session subfolder naming stays the same: `session_2026-04-01T14-30-00`.

### Step 2 — Add agent-phase subdirectory

In `ScreenshotCollector`, add a method to get the per-agent debug directory:

```typescript
getAgentDebugDir(agentName: string): string | null {
    if (!this.outputDir) return null;
    // agentName will be 'stories' or 'feed'
    const agentDir = path.join(this.outputDir, agentName.toLowerCase());
    if (!fs.existsSync(agentDir)) fs.mkdirSync(agentDir, { recursive: true });
    return agentDir;
}
```

BaseVisionAgent calls this with its agent name instead of `getNavDir()`.

### Step 3 — Rework `saveDebugScreenshot()` in BaseVisionAgent

The method currently:
1. Gets the nav dir
2. Draws a red crosshair on the labeled screenshot
3. Saves a single JPEG

New version:
1. Gets the agent-specific debug dir (e.g., `session_*/feed/`)
2. Creates a turn folder: `turn_001_click/`
3. Saves `labeled.jpg` — the labeled screenshot with red crosshair (existing logic)
4. Saves `raw.jpg` — the raw screenshot from that turn (needs to be passed in)
5. Saves `metadata.json` — full turn state

```typescript
protected async saveDebugScreenshot(
    labeledScreenshot: Buffer,
    rawScreenshot: Buffer,
    decision: VisionAction
): Promise<void> {
    const agentDebugDir = this.collector.getAgentDebugDir(this.getAgentName());
    if (!agentDebugDir) return;

    try {
        // Create turn folder
        const turnName = `turn_${String(this.decisionCount).padStart(3, '0')}_${decision.action}`;
        const turnDir = path.join(agentDebugDir, turnName);
        fs.mkdirSync(turnDir, { recursive: true });

        // 1. Save labeled screenshot with crosshair
        const image = await Jimp.read(Buffer.from(labeledScreenshot));
        // ... existing red crosshair drawing logic ...
        const labeledBuffer = await image.getBuffer('image/jpeg', { quality: 85 });
        fs.writeFileSync(path.join(turnDir, 'labeled.jpg'), labeledBuffer);

        // 2. Save raw screenshot
        fs.writeFileSync(path.join(turnDir, 'raw.jpg'), rawScreenshot);

        // 3. Save metadata
        const metadata = {
            turn: this.decisionCount,
            agent: this.getAgentName(),
            timestamp: new Date().toISOString(),
            elapsed_ms: Date.now() - this.startTime,
            remaining_ms: this.config.maxDurationMs - (Date.now() - this.startTime),

            decision: {
                thinking: decision.thinking,
                action: decision.action,
                element: decision.element,
                intent: decision.intent || null,
                expected_state: decision.expected_state || null,
                if_wrong: decision.if_wrong || null,
                memory: decision.memory || null,
                lesson: decision.lesson || null,
            },

            elements: Array.from(this.currentElements.values()).map(el => ({
                ...el,
                note: this.elementKnowledge.get(elementFingerprint(el)) || null
            })),

            clicked_element: decision.element !== undefined
                ? (() => {
                    const el = this.currentElements.get(decision.element);
                    return el ? { id: el.id, center_x: el.x + el.width / 2, center_y: el.y + el.height / 2 } : null;
                })()
                : null,

            action_history: this.actionHistory.slice(-8).map(h => `${h.action} → ${h.result}`),

            learned_lessons: [...this.learnedLessons],

            element_knowledge_snapshot: Object.fromEntries(this.elementKnowledge),

            tokens: this.lastTokenUsage ? {
                input: this.lastTokenUsage.promptTokens,
                output: this.lastTokenUsage.completionTokens,
            } : null,
        };

        fs.writeFileSync(
            path.join(turnDir, 'metadata.json'),
            JSON.stringify(metadata, null, 2)
        );

    } catch (err) {
        console.warn(`  ⚠️ Debug screenshot save failed:`, err);
    }
}
```

### Step 4 — Pass raw screenshot through to saveDebugScreenshot

The main loop currently has:

```typescript
const rawScreenshot = await this.captureScreenshot();
this.saveRawScreenshot(rawScreenshot);
const { buffer: screenshot, elements } = await labelElements(...);
await this.saveDebugScreenshot(screenshot, decision);
```

Update to pass both buffers:

```typescript
const rawScreenshot = await this.captureScreenshot();
this.saveRawScreenshot(rawScreenshot);
const { buffer: labeledScreenshot, elements } = await labelElements(...);
// ... LLM call, action execution ...
await this.saveDebugScreenshot(labeledScreenshot, rawScreenshot, decision);
```

Store `rawScreenshot` as an instance variable (e.g., `this.lastRawScreenshot`) so it's available after the LLM call and action execution:

```typescript
this.lastRawScreenshot = rawScreenshot;
// ... later ...
await this.saveDebugScreenshot(labeledScreenshot, this.lastRawScreenshot, decision);
```

### Step 5 — Handle StoriesAgent (no labeling)

When `shouldLabelElements()` returns false (StoriesAgent), there's no labeled screenshot — the raw screenshot goes directly to the LLM. In this case:
- `labeled.jpg` and `raw.jpg` are the same image (or skip `labeled.jpg` entirely)
- `metadata.json` has an empty `elements` array
- The turn folder still gets created with the same naming convention

### Step 6 — Remove old nav/ directory logic

- Delete `getNavDir()` from ScreenshotCollector (replaced by `getAgentDebugDir()`)
- Remove the old flat file saving from `saveDebugScreenshot`
- Remove the old `debug-screenshots/` path from `.gitignore` if present, add `kowalski-debug/` to Downloads-related notes

### Step 7 — Verify

1. Run a session — check `~/Downloads/kowalski-debug/session_<timestamp>/` exists
2. Verify `stories/` and `feed/` subdirectories are created
3. Open a turn folder — confirm `labeled.jpg`, `raw.jpg`, `metadata.json` all present
4. Verify metadata JSON is valid and contains full element map with notes
5. Verify labeled.jpg has the green badges + red crosshair
6. Verify raw.jpg is the clean screenshot without any overlays
7. Check disk usage — ensure per-session folder size is reasonable (expect ~2-5MB per turn, ~100-300MB per full session)

## Files Changed

| File | Action |
|------|--------|
| `src/main/services/BaseVisionAgent.ts` | Rework `saveDebugScreenshot()`, add `lastRawScreenshot` instance var, update main loop to pass raw buffer |
| `src/main/services/ScreenshotCollector.ts` | Add `getAgentDebugDir()`, remove `getNavDir()` |
| `src/main/services/InstagramScraper.ts` | Change `saveToDirectory` to `~/Downloads/kowalski-debug/` |
| `src/main/services/Scroller.ts` | Update if still referencing `getNavDir()` (or delete this file if no longer used) |

## Files NOT Changed

| File | Why |
|------|-----|
| `src/utils/elementLabeler.ts` | Labeling logic unchanged |
| `src/main/services/StoriesAgent.ts` | Inherits from BaseVisionAgent, no override needed |
| `src/main/services/FeedAgent.ts` | Inherits from BaseVisionAgent, no override needed |
