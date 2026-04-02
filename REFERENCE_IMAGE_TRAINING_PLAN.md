# Reference Image Training Plan — Teaching Agents from Visual Examples

Make the agents actually internalize the hand-annotated reference images instead of just seeing them once on turn 1 and forgetting. The reference images are detailed step-by-step visual tutorials with color-coded annotations — they're the most valuable training material the agents have, and they're currently underutilized.

## What the Reference Images Teach

### Feed Images (`examples/feed/`)

| Image | What it teaches |
|-------|----------------|
| `posts1.jpg` | How to identify and click a timestamp link (red box around "13h") to open the post modal. Explicit instruction: "Click the timestamp in the red box (do not pay attention to how old the post is) to open the detailed post modal view." |
| `posts2.jpg` | What the post modal looks like. Red box around the post content (screenshot this). Orange box around "More posts from..." section (ignore this). Instruction: "Screenshot and save everything in the red box. Ignore everything in the orange box. Once you screenshot, go back to the feed." |
| `posts3.jpg` | How to handle carousel posts. Red box around the right arrow inside the modal. Instruction: "Some posts have multiple images. You can recognize them if they have the right arrow. Click the right arrow, screenshot the next image. Repeat until the right arrow is no longer seen." |
| `goinghome.jpg` | How to navigate home. Red box around the Instagram logo in the top-left. Instruction: "If you need to go home, click the Instagram logo in the top left corner." |

### Stories Images (`examples/stories/`)

| Image | What it teaches |
|-------|----------------|
| `stories1.jpg` | How to identify and click story avatars. Red circle around the first avatar with a colored gradient ring. Orange box around the story carousel row. Instruction: "Click the logo of the first account that has the pinkish orange boundary." |
| `stories2.jpg` | The full story viewer workflow. Blue box = pause button (do this first). Red box = story content (screenshot this). Orange box = right arrow (advance after screenshot). Pink boxes = side story previews (don't click these). Instruction: "Pause → screenshot → advance → repeat until last story. Do not skip any stories, you must screenshot everything." |
| `stories.end.jpg` | How to exit stories. Red box around the X button in top-right. Instruction: "When you reach the last story, click the X button. This will exit out of the story view and return you to the starting feed." |

## Current Problems

### 1. One-shot injection, no reinforcement

Reference images are sent once on turn 1 as a user message. The assistant response is a canned string:

```typescript
messages.push({
    role: 'assistant',
    content: `Understood. I'll follow the ${folder.toLowerCase()} workflow steps shown above.`
});
```

This wastes the assistant turn. The model doesn't demonstrate that it understood the images — it just says "understood." By turn 10-15, the reference images are deep in the context and the model may not actively recall the specific workflows.

### 2. No named anchors in the system prompt

The system prompt has a generic `REFERENCE IMAGES` section that explains color coding, but it doesn't reference the specific images by name. The agent can't think "this looks like the posts3 scenario" because it has no named handles for the scenarios.

### 3. Stories images are currently unused

`StoriesAgent.getReferenceImageFolder()` returns `null`, so the detailed stories workflow (pause → screenshot → advance → don't click pink elements) is never shown to the stories agent. The stories images only exist in the folder but are never loaded.

## Solution

### Part 1 — Replace the canned assistant response with a structured workflow summary

After injecting the reference images, the fake assistant response should demonstrate understanding by summarizing each image into concrete action steps. This is a hardcoded string per agent (not an LLM call) that acts as a "study guide" the model wrote after seeing the images.

**For FeedAgent:**

```typescript
const feedWorkflowSummary = `I've studied the reference images. Here's my workflow:

OPENING POSTS (from posts1):
- Find timestamp links (e.g. "13h", "2d", "7h") — these are the clickable text near the username
- Click the timestamp to open the post in a detail modal (dark overlay)
- Do NOT click the image or the username — only the timestamp link

POST MODAL (from posts2):
- The modal shows the post image on the left and caption/comments on the right
- Screenshot this view — this is the content I need to capture
- Ignore the "More posts from..." section below the modal (orange box area)
- Press Escape to close the modal and return to the feed

CAROUSELS (from posts3):
- Some posts have multiple images, indicated by a right arrow on the image and dot indicators below
- After opening the modal, if I see a right arrow: click it to advance to the next slide
- Screenshot each slide
- Repeat until the right arrow disappears (last slide)
- Then press Escape to return to feed

GOING HOME (from goinghome):
- If I get lost or need to reset, click the Instagram logo in the top-left corner of the sidebar
- This always returns me to the home feed`;
```

**For StoriesAgent:**

```typescript
const storiesWorkflowSummary = `I've studied the reference images. Here's my workflow:

OPENING STORIES (from stories1):
- Story avatars are the circular profile pictures at the top of the feed with colored gradient rings (pinkish-orange border)
- Click the LEFTMOST avatar with a gradient ring to start viewing stories
- The gradient ring distinguishes unwatched stories from regular profile pictures

VIEWING STORIES (from stories2):
- First: PAUSE the story by clicking the pause button (top area of story)
- Then: the main story content is in the center — each turn captures a screenshot automatically
- Advance to the next story frame by clicking the right arrow or pressing ArrowRight
- Do NOT click the small story previews on the sides (those are other users' stories and will break my sequence)
- Repeat: pause → let screenshot capture → advance → pause → let screenshot capture → advance

EXITING STORIES (from stories.end):
- When I reach the last story (no more frames to advance to), click the X button in the top-right corner
- This exits the story viewer and returns to the home feed
- Do not skip any stories — every frame must be screenshotted`;
```

These go into `callLLM()` where the current canned response is, replacing the generic "Understood" message.

### Part 2 — Add named scenario anchors to system prompts

Update each agent's system prompt to reference the specific images by name, so the agent can think in terms of recognized scenarios.

**Add to feed-instructions.md (or the feed section of navigator-agent.md):**

```markdown
WORKFLOW SCENARIOS
You were shown 4 reference images at the start of this session. Use them as your guide:

- "posts1 scenario" — You see the feed with posts. Find a timestamp link and click it.
- "posts2 scenario" — You see the post modal open. Screenshot the content, ignore related posts below, press Escape.
- "posts3 scenario" — You're in a modal and see carousel indicators. Advance through all slides, screenshot each one.
- "goinghome scenario" — You're lost or off-track. Click the Instagram logo in the top-left sidebar.

When deciding what to do, identify which scenario matches your current screen. If none match, you may be seeing unexpected UI — follow the UNEXPECTED UI recovery steps.
```

**Add to stories-instructions.md:**

```markdown
WORKFLOW SCENARIOS
You were shown 3 reference images at the start of this session. Use them as your guide:

- "stories1 scenario" — You see the feed with story avatars at the top. Click the leftmost avatar with a gradient ring.
- "stories2 scenario" — You're inside the story viewer. Pause, let the screenshot capture, then advance with ArrowRight.
- "stories.end scenario" — You've reached the last story. Click the X in the top-right to exit back to the feed.

When deciding what to do, identify which scenario matches your current screen.
```

### Part 3 — Enable stories reference images

Update `StoriesAgent.getReferenceImageFolder()` to return `'stories'` instead of `null`:

```typescript
protected getReferenceImageFolder(): string | null {
    return 'stories';
}
```

The stories images are too detailed and important to skip. The pause → screenshot → advance → don't-click-sides workflow can't be conveyed through text alone as reliably as the annotated images convey it.

### Part 4 — Mid-session scenario reminders

After every N turns (e.g., every 10 turns), inject a short text reminder into the user prompt that references the scenarios. This prevents drift without re-sending the full images.

In `buildUserPrompt()`:

```typescript
// Periodic workflow reminder (every 10 turns)
if (this.decisionCount > 0 && this.decisionCount % 10 === 0) {
    parts.push('\nREMINDER: Stay on workflow. Which reference image scenario matches what you see right now? Follow that scenario\'s steps.');
}
```

This is lightweight — one line of text — but it prompts the model to re-anchor to the reference images it saw earlier.

### Part 5 — Connect to the intent/prediction system (from AGENT_LOOP_PLAN)

The `intent` field from the agent loop plan should reference scenarios by name when applicable. This closes the loop between the reference images and the per-turn decision making:

```json
{
  "thinking": "I see the post modal is open with the image and caption visible. This is the posts2 scenario.",
  "action": "press",
  "key": "Escape",
  "intent": "posts2 scenario — I've captured the screenshot, now closing the modal to return to feed",
  "expected_state": "back on the home feed with posts visible, modal dismissed",
  "if_wrong": "press Escape again, or click the Instagram logo (goinghome scenario)"
}
```

To encourage this, add to the system prompt:

```markdown
When writing your "intent" field, reference the scenario name if one applies (e.g., "posts2 scenario — closing modal after screenshot"). This helps you stay on track.
```

## Implementation Steps

### Step 1 — Write the hardcoded workflow summaries

Create two constant strings: `FEED_WORKFLOW_SUMMARY` and `STORIES_WORKFLOW_SUMMARY`. These are the "fake assistant responses" that replace the current generic "Understood" message.

Place them in the agent subclasses or in separate files alongside the prompts:
- `src/main/prompts/feed-workflow-summary.md`
- `src/main/prompts/stories-workflow-summary.md`

Or inline them as constants in `FeedAgent.ts` and `StoriesAgent.ts`.

### Step 2 — Update callLLM() reference image injection

In `BaseVisionAgent.callLLM()`, replace lines 649-652:

```typescript
// BEFORE:
messages.push({
    role: 'assistant',
    content: `Understood. I'll follow the ${folder.toLowerCase()} workflow steps shown above.`
});

// AFTER:
const summary = this.getWorkflowSummary();
messages.push({
    role: 'assistant',
    content: summary || `Understood. I'll follow the ${folder.toLowerCase()} workflow steps shown above.`
});
```

Add an abstract or virtual method:

```typescript
protected getWorkflowSummary(): string | null {
    return null; // Override in subclasses
}
```

`FeedAgent` returns the feed summary, `StoriesAgent` returns the stories summary.

### Step 3 — Enable stories reference images

In `StoriesAgent.ts`:

```typescript
protected getReferenceImageFolder(): string | null {
    return 'stories';
}
```

### Step 4 — Add scenario anchors to system prompts

Update (or create) the system prompt files with the WORKFLOW SCENARIOS section. Each agent's `getSystemPrompt()` should include the appropriate scenario anchors.

### Step 5 — Add mid-session reminders

In `BaseVisionAgent.buildUserPrompt()`, add the periodic reminder every 10 turns. Keep it to one sentence.

### Step 6 — Update intent guidance in system prompts

Add the instruction to reference scenario names in the `intent` field (connects to AGENT_LOOP_PLAN).

### Step 7 — Verify

1. Run FeedAgent — check that the first assistant message contains the structured feed workflow summary (not "Understood")
2. Run StoriesAgent — check that stories reference images are now loaded and the stories workflow summary is in the first assistant message
3. Check turn 10, 20 — verify the scenario reminder appears in the user prompt
4. Review agent decisions — are they referencing scenario names in their `intent` or `thinking` fields?
5. Compare agent performance (turns wasted, stuck loops, wrong clicks) before vs after
6. Check token usage — the workflow summary adds ~200 tokens on turn 1 but should reduce wasted turns overall

## Files Changed

| File | Action |
|------|--------|
| `src/main/services/BaseVisionAgent.ts` | Add `getWorkflowSummary()` virtual method, update `callLLM()` to use it, add periodic reminder in `buildUserPrompt()` |
| `src/main/services/FeedAgent.ts` | Override `getWorkflowSummary()` with feed workflow summary |
| `src/main/services/StoriesAgent.ts` | Override `getWorkflowSummary()` with stories workflow summary, change `getReferenceImageFolder()` to return `'stories'` |
| `src/main/prompts/feed-instructions.md` | Add WORKFLOW SCENARIOS section with named anchors, add intent scenario guidance |
| `src/main/prompts/stories-instructions.md` | Add WORKFLOW SCENARIOS section with named anchors |
| `src/main/prompts/navigator-agent.md` | Update if still in use (or delete once split is complete) |

## Files NOT Changed

| File | Why |
|------|-----|
| `src/utils/elementLabeler.ts` | Labeling logic unchanged |
| Reference images in `examples/` | Images stay as-is — the annotations are already excellent |
| `src/main/services/ScreenshotCollector.ts` | No changes needed |

## Cost Impact

| Change | Tokens | Frequency |
|--------|--------|-----------|
| Workflow summary (replaces "Understood") | +200 tokens | Once per session (turn 1 only) |
| Scenario anchors in system prompt | +100 tokens | Every turn (cached after turn 1) |
| Mid-session reminder | +15 tokens | Every 10th turn |
| Stories reference images now loaded | +3 images (~140KB) | Once per session (turn 1 only) |

Net cost increase is minimal — ~300 tokens on turn 1, ~100 cached tokens per turn thereafter. The stories images add ~140KB on turn 1 but only for the stories agent (which uses Haiku, cheapest model). The expected return is fewer wasted turns from the agent forgetting or misapplying the workflow, which saves far more than the added prompt tokens.
