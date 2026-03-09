# Dual-Agent Architecture: Navigator (Sonnet) + Specialist (Opus)

## Goal

Split VisionAgent into two models working together. A fast cheap model (Sonnet) handles all navigation. A slow powerful model (Opus) handles captures and stuck recovery. This makes navigation 3-4x faster and cuts API costs dramatically.

## Architecture Overview

```
Sonnet (Navigator) — runs every turn
  ↓ sees post modal/story viewer → "handoff"
Opus (Specialist) — takes over, handles capture + carousels/stories end-to-end
  ↓ done → returns control
Sonnet (Navigator) — resumes

Sonnet (Navigator) — stuck for 3+ turns
  ↓ "escalate"
Opus (Specialist) — figures out recovery, takes 1-2 actions
  ↓ recovered → returns control
Sonnet (Navigator) — resumes
```

## Changes Required

### 1. Update modelConfig.ts

Add a specialist model alongside the existing navigation model:

```typescript
export const ModelConfig = {
    // Navigation — fast model, handles scrolling, clicking, dismissing popups
    navigation: process.env.KOWALSKI_NAV_MODEL || 'claude-sonnet-4-5-20241022',

    // Specialist — powerful model, handles captures, carousels, stuck recovery
    specialist: process.env.KOWALSKI_SPECIALIST_MODEL || 'claude-opus-4-6',

    // ... keep vision, tagging, digest, analysis as-is
};
```

### 2. Update VisionAction interface in VisionAgent.ts

Add `handoff` and `escalate` to the action type:

```typescript
interface VisionAction {
    thinking: string;
    action: 'click' | 'scroll' | 'type' | 'press' | 'hover' | 'capture' | 'wait' | 'done' | 'newtab' | 'closetab' | 'handoff' | 'escalate';
    // ... rest stays the same
}
```

### 3. Create two system prompts

#### 3a. Navigator prompt (new file: `src/main/prompts/navigator-agent.md`)

This is a STRIPPED DOWN version of vision-agent.md. Copy vision-agent.md and make these changes:

- Keep: ELEMENT LABELS, HOW TO ACT EACH TURN, ACTIONS (all except `capture`), MISSION, REFERENCE IMAGES section, HOW INSTAGRAM WORKS, SAFETY rules, SELF-CORRECTION, UNEXPECTED UI, MEMORY, OUTPUT FORMAT
- Remove: `capture(x1,y1,x2,y2)` from the actions list. The navigator never captures.
- Remove: All "WHAT TO CAPTURE" content. The navigator doesn't evaluate content.
- Remove: `record` references.
- Remove: "source" field documentation (navigator doesn't use it).
- Add `handoff` action: `handoff          Signal that you've reached a capture-ready state (post modal or story viewer). The specialist agent will take over to handle captures.`
- Add `escalate` action: `escalate         You are stuck and cannot figure out what to do. A more powerful agent will look at your screen and help recover.`
- Change the SELF-CORRECTION section: instead of "If STUCK_COUNT reaches 5, click Home to reset", change to "If STUCK_COUNT reaches 3, use escalate to get help from the specialist agent."
- Add to MISSION: "You are the navigator. Your job is to move through Instagram efficiently. When you reach content worth capturing (a post modal is open, a story viewer is active), use handoff — do NOT try to capture yourself. You will get control back after the specialist finishes."
- Add this instruction: "After a handoff, you will receive a message saying what the specialist did (e.g. 'Specialist captured 3 carousel slides, press Escape to continue'). Follow its instructions."
- Keep the `phase` field. Keep the `memory` field.

#### 3b. Specialist prompt (new file: `src/main/prompts/specialist-agent.md`)

This is a FOCUSED prompt for the capture and recovery specialist. Write it from scratch:

```markdown
You are a specialist agent for Instagram content capture. You are called in two situations:

1. CAPTURE MODE: The navigator agent has reached a post modal or story viewer and needs you to capture the content.
2. RESCUE MODE: The navigator agent is stuck and needs you to figure out what's on screen and recover.

ELEMENT LABELS
[copy the element labels section from vision-agent.md]

ACTIONS (pick one per turn):
  click(n)         Click element [n].
  scroll(dir)      Scroll "up" or "down".
  press(key)       Press a key: Escape, Enter, ArrowRight, ArrowLeft.
  hover(n)         Move mouse to element [n] without clicking.
  capture(x1, y1, x2, y2)  Capture a cropped region. (x1,y1) = top-left, (x2,y2) = bottom-right in screenshot pixel coordinates. The screenshot is {{SCREENSHOT_WIDTH}}x{{SCREENSHOT_HEIGHT}} pixels.
  wait(seconds)    Wait 1-5 seconds.
  done             You are finished. Return control to the navigator.

CAPTURE MODE
When called for a capture, you will see a screenshot of a post modal, story viewer, or search result post. Your job:

1. VERIFY you are in a capture-ready state (post modal with dark overlay, or story viewer with dark background).
2. If viewing a STORY: click the pause button first, then capture the center story content. Exclude dark overlay and side previews.
3. If viewing a POST MODAL: capture the LEFT side only (image + caption). Exclude the comments panel on the right.
4. After capturing, check for CAROUSEL indicators (right arrow on the post image, dot indicators below). If it's a carousel:
   - Use hover(n) on the post image to reveal the arrow
   - Click the right arrow to advance
   - Capture each slide
   - Repeat until no more right arrow appears
5. If viewing STORIES: after capturing the current story, click the right arrow to advance to the next story. Pause it, capture it, repeat until you reach the last story.
6. When you've captured everything in the current post/story sequence, use done.

Always provide accurate crop coordinates. For post modals, crop to just the left panel. For stories, crop to just the center story content.

RESCUE MODE
When called for rescue, the navigator is stuck. Look at the screenshot and figure out:
- What state is Instagram in? (feed, modal, story viewer, search, error page, unexpected popup, login page)
- What is blocking progress?
- Take 1-3 actions to recover to a known good state (home feed or the state the navigator was trying to reach)
- If you see a login page, use abort("SESSION_EXPIRED")
- When recovered, use done with a message explaining what you did.

SAFETY — HARD RULES
[copy safety rules from vision-agent.md]

OUTPUT FORMAT (JSON):
{
  "thinking": "your reasoning",
  "action": "capture",
  "x": 100,
  "y": 50,
  "x2": 600,
  "y2": 800,
  "source": "feed",
  "memory": "notes"
}

The "source" field is required on every capture. Set it to:
- "feed" — a post from the home feed
- "story" — a story frame
- "carousel" — an additional carousel slide
- "search" — a post from search results or account profile

When using done, include a "result" field describing what you accomplished:
{
  "thinking": "Captured 3 carousel slides, nothing more to capture here",
  "action": "done",
  "result": "Captured 3 carousel slides from feed post. Navigator should press Escape to close modal."
}
```

### 4. Update VisionAgent.ts — Dual Model Loop

This is the biggest code change. Modify the `run()` method and `callLLM()` to support both models:

**Add a new property:**
```typescript
private specialistModel: string;
private activeModel: 'navigator' | 'specialist' = 'navigator';
```

**In constructor:**
```typescript
this.model = ModelConfig.navigation;       // Sonnet for navigation
this.specialistModel = ModelConfig.specialist; // Opus for captures/rescue
```

**Import both prompts:**
```typescript
import navigatorPrompt from '../prompts/navigator-agent.md';
import specialistPrompt from '../prompts/specialist-agent.md';
```

**Modify getSystemPrompt() to return the right prompt based on active model:**
```typescript
private getSystemPrompt(): string {
    const prompt = this.activeModel === 'navigator' ? navigatorPrompt : specialistPrompt;
    return prompt
        .replace('{{SCREENSHOT_WIDTH}}', String(this.screenshotWidth))
        .replace('{{SCREENSHOT_HEIGHT}}', String(this.screenshotHeight));
}
```

**Modify callLLM() to use the right model:**
```typescript
const requestBody = {
    model: this.activeModel === 'navigator' ? this.model : this.specialistModel,
    system: systemPrompt,
    messages,
    max_tokens: this.activeModel === 'navigator' ? 2048 : 16000,
    // Only enable extended thinking for specialist (Opus)
    ...(this.activeModel === 'specialist' ? {
        thinking: { type: 'enabled', budget_tokens: 10000 }
    } : {})
};
```

NOTE: Sonnet does NOT get extended thinking (it doesn't support it the same way and doesn't need it for navigation). Only Opus gets thinking tokens.

**Modify the main run() loop to handle handoff and escalate:**

After executing the action (line ~253), add handling for handoff and escalate:

```typescript
// Handle handoff — switch to specialist for captures
if (decision.action === 'handoff') {
    console.log('  🔄 Handoff to specialist (Opus) for capture');
    this.collector.appendLog('🔄 Handoff to specialist (Opus) for capture');
    const specialistResult = await this.runSpecialist('capture');
    // Feed the specialist's result back to the navigator on the next turn
    this.lastSpecialistResult = specialistResult;
    continue; // Next iteration will be navigator again with specialist context
}

// Handle escalate — switch to specialist for rescue
if (decision.action === 'escalate') {
    console.log('  🆘 Escalating to specialist (Opus) for rescue');
    this.collector.appendLog('🆘 Escalating to specialist (Opus) for rescue');
    const specialistResult = await this.runSpecialist('rescue');
    this.lastSpecialistResult = specialistResult;
    continue;
}
```

**Add the specialist sub-loop method:**

```typescript
private async runSpecialist(mode: 'capture' | 'rescue'): Promise<string> {
    this.activeModel = 'specialist';
    let specialistTurns = 0;
    const maxTurns = mode === 'capture' ? 20 : 5; // Capture can take many turns (carousels), rescue should be quick
    let resultMessage = '';

    while (specialistTurns < maxTurns) {
        specialistTurns++;

        // Take screenshot
        const rawScreenshot = await this.captureScreenshot();
        if (!rawScreenshot) { await this.delay(500); continue; }

        const { buffer: screenshot, elements } = await labelElements(
            this.page, rawScreenshot,
            this.screenshotWidth, this.screenshotHeight,
            this.viewportWidth, this.viewportHeight
        );
        this.currentElements = elements;

        // Call specialist model
        const decision = await this.callLLM(screenshot, this.config.maxDurationMs - (Date.now() - this.startTime));
        this.decisionCount++;

        console.log(`  🎯 [Specialist ${specialistTurns}] action=${decision.action} | ${decision.thinking.slice(0, 80)}`);
        this.collector.appendLog(`🎯 [Specialist ${specialistTurns}] ${this.formatAction(decision)} | ${decision.thinking.slice(0, 80)}`);

        // Specialist says done — return to navigator
        if (decision.action === 'done') {
            resultMessage = (decision as any).result || decision.thinking;
            break;
        }

        // Handle abort (session expired detected by specialist)
        if (decision.action === 'abort' as any) {
            // Propagate session expiry up
            this.stopped = true;
            resultMessage = `ABORT: ${(decision as any).reason || 'unrecoverable state'}`;
            break;
        }

        // Execute the action normally
        const result = await this.executeAction(decision);

        // Track last action for context
        this.lastAction = decision;
        this.actionHistory.push({ action: this.formatAction(decision), result });

        // Log
        this.collector.appendLog(`  → ${result}`);
        if (decision.memory) {
            this.collector.appendLog(`  📝 Memory: ${decision.memory}`);
            this.lastMemory = decision.memory;
        }
    }

    if (!resultMessage && specialistTurns >= maxTurns) {
        resultMessage = `Specialist timed out after ${maxTurns} turns in ${mode} mode.`;
    }

    // Switch back to navigator
    this.activeModel = 'navigator';
    console.log(`  🔄 Returning to navigator. Specialist result: ${resultMessage.slice(0, 100)}`);
    this.collector.appendLog(`🔄 Specialist done: ${resultMessage.slice(0, 100)}`);

    return resultMessage;
}
```

**Add lastSpecialistResult to buildUserPrompt():**

Add a new property:
```typescript
private lastSpecialistResult: string = '';
```

In `buildUserPrompt()`, after the last action section, add:
```typescript
if (this.lastSpecialistResult) {
    parts.push(`\nSPECIALIST RESULT: ${this.lastSpecialistResult}`);
    parts.push('The specialist has finished. Continue navigating based on its result.');
    this.lastSpecialistResult = ''; // Clear after sending
}
```

### 5. Reference images — only navigator gets them

Reference images are about navigation workflows, so only the navigator needs them. The specialist works with what it sees on screen.

In `callLLM()`, only inject reference images when `this.activeModel === 'navigator'`:

```typescript
// Only inject reference images for navigator (specialist works from current screenshot)
if (this.activeModel === 'navigator') {
    const phase = this.lastDeclaredPhase;
    if (phase && !this.sentPhases.has(phase)) {
        // ... existing reference image injection code
    }
}
```

### 6. Action history — cap it

While you're in here, cap the action history in `buildUserPrompt()` to the last 8 entries:

```typescript
if (this.actionHistory.length > 0) {
    parts.push('\nRECENT HISTORY:');
    const recent = this.actionHistory.slice(-8);
    recent.forEach((entry, i) => {
        parts.push(`${i + 1}. ${entry.action} → ${entry.result}`);
    });
}
```

### 7. Prompt caching for navigator

Since the navigator prompt is sent on every turn (hundreds of times), enable prompt caching. Change the system field in the request body:

```typescript
const requestBody = {
    model: ...,
    system: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
    messages,
    ...
};
```

Add the beta header:
```typescript
headers: {
    'Content-Type': 'application/json',
    'x-api-key': this.config.apiKey,
    'anthropic-version': '2023-06-01',
    'anthropic-beta': 'prompt-caching-2024-07-31'
}
```

This makes the navigator prompt cached after the first call — subsequent calls pay ~10% for the system prompt portion.

## What NOT to Change

- GhostMouse, HumanScroll, ScreenshotCollector — untouched
- SchedulerService — untouched (it still just calls VisionAgent.run())
- InstagramScraper — untouched
- BrowserManager — untouched
- Element labeling — untouched
- The action execution methods (executeClick, executeScroll, etc.) — untouched
- The existing vision-agent.md — can be kept as a reference but is replaced by the two new prompts

## Testing

1. Run a debug session (Cmd+Shift+H). Watch the logs:
   - Navigator turns should show the Sonnet model name and be fast (2-3s)
   - When a post modal opens, you should see "🔄 Handoff to specialist"
   - Specialist turns should show Opus and handle the capture
   - "🔄 Returning to navigator" when specialist is done

2. Test carousel: open a carousel post, verify specialist captures all slides before returning control.

3. Test stuck recovery: if navigator gets confused, verify it escalates to Opus after STUCK_COUNT reaches 3.

4. Test notification popup: should be handled by Sonnet (navigator) directly without needing Opus.
