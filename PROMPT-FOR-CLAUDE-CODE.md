# Add Agency to VisionAgent

## Goal
Make VisionAgent resilient to unexpected UI states (popups, notifications, overlays, login gates, etc.) and add self-correction so it can recover from failed actions — without hardcoding every possible Instagram state into the system prompt.

## Philosophy
Right now the system prompt tries to enumerate every Instagram state the agent might encounter. That's fragile — the agent got stuck on a notifications popup because it wasn't mentioned. Instead, teach the agent HOW TO THINK about unexpected situations, not WHAT every situation looks like.

## Changes Required

### 1. Update vision-agent.md — Add General Resilience (NOT more hardcoded states)

Add a new section called "UNEXPECTED UI" right after the SELF-CORRECTION section. This should teach the agent a general principle:

```
UNEXPECTED UI
If you see ANYTHING blocking the normal Instagram view that is not part of your current flow (popups, notifications, permission dialogs, cookie banners, "Turn on Notifications" prompts, login gates, overlay modals, app install banners, or any UI you don't recognize):
1. Do NOT panic or give up.
2. Look for a dismiss button: X, "Not Now", "Cancel", "Close", "Skip", or similar. Find its label number and click it.
3. If no dismiss button is visible, try press("Escape") to close the overlay.
4. If Escape doesn't work, try clicking outside the overlay (click on any visible feed content behind it).
5. If nothing works after 3 attempts, click Home (Instagram logo) as a full reset.
6. NEVER click "Turn On", "Allow", "Enable", "Accept" on notification/permission prompts — always dismiss them.

You are a general-purpose visual agent. You can see the screen. If something unexpected appears, use your vision to find the way to dismiss it and get back on track. You do not need to be told about every possible popup — just dismiss anything that's in your way.
```

### 2. Update vision-agent.md — Add Reflection Step to "HOW TO ACT EACH TURN"

Change the current 4-step process to 5 steps. Insert a new Step 1 at the beginning:

Current:
```
Step 1. VERIFY — Compare your current screenshot to the reference images...
Step 2. IDENTIFY — Based on the reference image for your current step...
Step 3. FIND — Look at the screenshot labels...
Step 4. ACT — Use the label number...
```

New:
```
Step 1. REFLECT — Compare your current screenshot to what you EXPECTED to see after your last action. Did your action work? If not, note what went wrong in your memory and adjust your approach. If you see something unexpected (a popup, overlay, or error), handle it before continuing your flow.
Step 2. VERIFY — Compare your current screenshot to the reference images for your current phase. Which step of the flow are you at? Does what you see match the expected state? If your screen doesn't match ANY step in the reference flow, check if something unexpected is blocking the view (see UNEXPECTED UI).
Step 3. IDENTIFY — Based on the reference image for your current step, decide what element to interact with.
Step 4. FIND — Look at the screenshot labels and the LABELED ELEMENTS text list. Find the numbered label on or near that element.
Step 5. ACT — Use the label number: click(n), hover(n), or newtab(n).
```

### 3. Update VisionAgent.ts — Add Action Verification

In the `run()` method, after executing an action and before the next LLM call, add a brief verification step. This doesn't require another API call — it's just about giving the model better context:

In the user prompt that gets sent with each screenshot, add the previous action and its result. Something like:

```typescript
// In the user prompt construction, add previous action context:
const previousContext = this.lastAction
  ? `\nYOUR LAST ACTION: ${JSON.stringify(this.lastAction)}\nDid it work? Compare what you see now to what you expected.`
  : '';

const userPrompt = `${labeledElementsText}${previousContext}\n\nRemaining time: ${remainingMinutes} minutes. Captures so far: ${captureCount}.`;
```

Add a `lastAction` property to VisionAgent to track this:
```typescript
private lastAction: VisionAction | null = null;
```

Set it after each action execution:
```typescript
this.lastAction = decision;
```

### 4. Update VisionAgent.ts — Add Extended Thinking (optional but recommended)

Since you're on Anthropic, enable extended thinking so the model can reason longer before committing to an action. In `callLLM()`, add to the request body:

```typescript
const requestBody = {
    model: this.model,
    system: systemPrompt,
    messages: [...],
    max_tokens: 16000,  // Increase from 2048 to allow for thinking tokens
    thinking: {
        type: "enabled",
        budget_tokens: 10000  // Let it think for up to 10K tokens
    }
};
```

Then update the response parsing to extract the text block (not the thinking block):
```typescript
const contentBlocks = data.content as Array<{ type: string; text?: string }>;
const textBlock = contentBlocks?.find(b => b.type === 'text');  // Skip 'thinking' blocks
const parsed = JSON.parse(textBlock.text) as VisionAction;
```

NOTE: Extended thinking costs more tokens per call. You can start with `budget_tokens: 4000` and increase if the model needs more reasoning space. The thinking tokens are included in the response but not visible to the user — they just help the model reason better.

### 5. Update vision-agent.md — Improve Memory Usage

Change the MEMORY section to be more structured:

```
MEMORY
You have a "memory" field in your response. Use it as a scratchpad. Your notes from the previous turn appear as "YOUR NOTES". Structure your notes like this:

STATE: [what state you're in: feed / stories / search / unexpected_ui]
STEP: [which step of the current flow you're at]
CAPTURES: [count and brief list of what you've captured]
LAST_RESULT: [did your last action succeed? what happened?]
PLAN: [your next 2-3 planned actions]
STUCK_COUNT: [how many turns without progress — reset to 0 when you make progress]

If STUCK_COUNT reaches 3, change strategy entirely. If it reaches 5, click Home to reset.
```

## What NOT to Change

- Do NOT change the action format (click(n), scroll(dir), etc.) — it works fine
- Do NOT change the JSON output format
- Do NOT change how reference images are loaded or sent
- Do NOT change SchedulerService, InstagramScraper, or any other service
- Do NOT add new action types
- Do NOT create new files or split the prompt into multiple files (keep vision-agent.md as one file for now)

## Testing

After making these changes, run a debug session (Cmd+Shift+H) and intentionally trigger a notifications popup (you can do this by browsing until Instagram shows one). The agent should dismiss it on its own without getting stuck.

Also test: what happens when the agent's click doesn't work (modal doesn't open)? The REFLECT step + previous action context should help it recognize the failure and try again.
