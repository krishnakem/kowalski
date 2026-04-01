# Agent Loop Redesign — Intent, Prediction, Recovery & Self-Enriching Legend

Redesign the per-turn agent loop so each agent (StoriesAgent, FeedAgent) operates with explicit intent, predicts what should happen, compares against reality, and follows a pre-written recovery plan when things go wrong. Simultaneously, the agent enriches its own element legend over time — building functional descriptions of UI elements from its own reasoning, with zero extra LLM calls.

## Current Problems

1. **No explicit intent.** The agent picks an action but doesn't declare what it expects to happen. Next turn, the prompt says "Did it work?" but the agent has to re-derive what "working" would look like from scratch.

2. **No pre-planned recovery.** When an action fails, the agent has to figure out both what went wrong AND what to do about it in a single turn. It often skips the undo step — e.g., ending up on a profile page and scrolling there instead of navigating back to the feed first.

3. **No persistent learning.** The `memory.LEARNED` field exists but gets overwritten every turn. If the agent doesn't manually copy forward a lesson, it's lost. There's no accumulation.

4. **Bare element legend.** Elements show as `[5] a "" → /stories/someone/` with no functional description. The agent spends reasoning tokens figuring out what each element does every turn instead of building up that knowledge over time.

---

## New Response JSON Schema

```json
{
  "thinking": "Short reasoning about what I see and why I'm choosing this action",
  "action": "click",
  "element": 5,
  "intent": "open this user's story viewer",
  "expected_state": "dark fullscreen background, story content centered, progress bars at top, username overlay",
  "if_wrong": "press Escape to dismiss whatever opened, then try the next story avatar to the right",
  "memory": "WHAT: stories\nPLAN: advance through stories then escape\nSTUCK: 0",
  "element_notes": {
    "1": "home navigation — returns to main feed",
    "3": "story avatar with colored ring — opens story viewer",
    "5": "story avatar — opens story viewer",
    "8": "close/X button — dismisses current overlay"
  }
}
```

### New fields

| Field | Type | Purpose |
|-------|------|---------|
| `intent` | string | Plain language description of what the agent is trying to accomplish with this action |
| `expected_state` | string | What the screen should look like next turn if the action succeeds |
| `if_wrong` | string | Pre-written recovery plan — what to do if the expected state doesn't match reality |
| `element_notes` | object | Map of element ID → functional description for any elements the agent reasoned about this turn |

### Fields kept from current schema

| Field | Change |
|-------|--------|
| `thinking` | No change |
| `action` | No change |
| `element` | No change |
| `memory` | Simplified — remove LEARNED sub-field (replaced by `element_notes` and the persistent `learned` store). Keep WHAT, PLAN, STUCK. |

---

## New Per-Turn Prompt Structure

### What gets fed back to the agent each turn

```
SESSION: 3 min elapsed, 7 min remaining.
SCREENSHOTS: 12 raw screenshots saved

YOUR LAST ACTION: click element [5]
YOUR INTENT: open this user's story viewer
YOUR EXPECTED STATE: dark fullscreen background, story content centered, progress bars at top
YOUR RECOVERY PLAN: press Escape to dismiss whatever opened, then try the next story avatar to the right
RESULT: click executed at (450, 120)

Does the current screenshot match your expected state?
- If YES: continue with your plan.
- If NO: execute your recovery plan FIRST, then reassess.

RECENT HISTORY:
1. click([3]) → click executed at (200, 80)
2. press(Escape) → key pressed
3. scroll(down) → scrolled 400px

LABELED ELEMENTS:
[1] button "Close" — dismisses current overlay
[2] a "username" → /username
[3] a "" → /stories/someone/ — opens this user's story viewer
[4] a "2h" → /p/ABC123/ — opens post detail modal
[5] button — no known function yet
[6] svg

LEARNED (persistent):
- clicking post images plays video inline; use timestamp link to open post modal instead
- elements in the suggestions bar look like story avatars but open profile pages
- "Not Now" button dismisses notification prompt

YOUR NOTES (from last turn):
WHAT: stories
PLAN: advance through stories then escape
STUCK: 0

What do you do next?
```

Key differences from today:

1. **Intent, expected state, and recovery plan** are fed back verbatim from the agent's own previous response
2. **Element legend is enriched** — elements the agent has previously annotated get their functional descriptions appended
3. **LEARNED is a persistent list** maintained by the code, not the LLM's memory field — the agent can't accidentally forget lessons
4. **Recovery instruction is explicit** — "execute your recovery plan FIRST" forces the agent to undo before acting

---

## Self-Enriching Element Legend

### How it works

1. **Agent responds with `element_notes`.** Each turn, the agent includes functional descriptions for elements it reasoned about. Not all elements — just the ones it actively considered.

2. **Code stores notes in a fingerprint-keyed map.** The fingerprint is `tag|ariaLabel|hrefPattern`. For example:
   - `button|Close|` → "dismisses current overlay"
   - `a||/stories/` → "opens this user's story viewer"
   - `a||/p/` → "opens post detail modal"

   The href gets pattern-simplified: `/stories/someone123/` becomes `/stories/` so the annotation applies to all story avatar links, not just one specific user.

3. **Next turn, `buildUserPrompt` matches elements against the map.** When building the legend, each element's fingerprint is looked up. If a match exists, the description is appended:
   ```
   [3] a "" → /stories/someone/ — opens this user's story viewer
   ```
   If no match exists, it appears bare:
   ```
   [5] button — no known function yet
   ```

4. **Notes accumulate across turns.** By turn 5-6, most persistent UI elements have been annotated. New elements (from page transitions, modals opening, etc.) appear bare and get annotated on the next turn the agent encounters them.

5. **Notes get overwritten, not appended.** If the agent produces a new note for an element it already annotated, the new note replaces the old one. This is the self-correction mechanism — if the agent was wrong about what an element does, it updates the description after seeing the actual result.

### Fingerprint generation

```typescript
function elementFingerprint(el: LabeledElement): string {
    // Simplify href to a pattern: /stories/user123/ → /stories/
    const hrefPattern = el.href
        .replace(/\/stories\/[^/]+\/?.*/, '/stories/')
        .replace(/\/p\/[^/]+\/?.*/, '/p/')
        .replace(/\/reel\/[^/]+\/?.*/, '/reel/')
        .replace(/\/[^/]+\/?$/, '/');  // strip trailing username paths

    return `${el.tag}|${el.ariaLabel}|${hrefPattern}`;
}
```

### Storage

```typescript
// In BaseVisionAgent
protected elementKnowledge: Map<string, string> = new Map();

// After parsing LLM response each turn:
if (decision.element_notes) {
    for (const [idStr, description] of Object.entries(decision.element_notes)) {
        const id = parseInt(idStr, 10);
        const el = this.currentElements.get(id);
        if (el) {
            const fp = elementFingerprint(el);
            this.elementKnowledge.set(fp, description);
        }
    }
}

// When building legend in buildUserPrompt:
for (const [id, el] of this.currentElements) {
    const fp = elementFingerprint(el);
    const note = this.elementKnowledge.get(fp);
    const desc = el.text || el.ariaLabel || '';
    const descStr = desc ? ` "${desc.slice(0, 50)}"` : '';
    const href = el.href ? ` → ${el.href.slice(0, 40)}` : '';
    const noteStr = note ? ` — ${note}` : '';
    parts.push(`[${id}] ${el.tag}${descStr}${href}${noteStr}`);
}
```

---

## Persistent LEARNED Store

### Problem with current memory.LEARNED

The agent writes LEARNED notes in its memory scratchpad, but memory is a single string that gets overwritten every turn. If the agent forgets to copy a lesson forward, it's lost.

### Solution

Maintain a separate `learnedLessons: string[]` array in BaseVisionAgent. The agent doesn't write to LEARNED in memory anymore — instead, we extract lessons from the intent/expected_state/reality comparison.

### How lessons are generated

When the agent's previous `expected_state` doesn't match what it sees (detected by the agent saying something like "that didn't work" or "unexpected result" in its `thinking`, or by the agent executing its `if_wrong` recovery plan instead of continuing), the code captures a lesson:

```typescript
// After parsing the LLM response, check if it's executing recovery
const isRecovering = decision.thinking.toLowerCase().includes('recovery') ||
                     decision.thinking.toLowerCase().includes('didn\'t work') ||
                     decision.thinking.toLowerCase().includes('unexpected') ||
                     decision.thinking.toLowerCase().includes('wrong');

if (isRecovering && this.lastIntent) {
    const lesson = `Turn ${this.decisionCount}: intended "${this.lastIntent}" on [${this.lastAction?.element}] ` +
                   `but it failed. ${decision.thinking.slice(0, 100)}`;
    this.learnedLessons.push(lesson);
    // Cap at 10 lessons to avoid prompt bloat
    if (this.learnedLessons.length > 10) {
        this.learnedLessons.shift();
    }
}
```

Alternatively — and more reliably — let the agent explicitly report lessons. Add a `lesson` field to the response JSON:

```json
{
  "action": "press",
  "element": null,
  "key": "Escape",
  "intent": "dismiss the profile page that opened unexpectedly",
  "expected_state": "back on the home feed",
  "if_wrong": "click Home button in sidebar",
  "lesson": "the small circular images in the suggestions section are profile links, not story avatars — story avatars have colored gradient rings"
}
```

The `lesson` field is optional — the agent only includes it when something went wrong and it learned something. The code appends it to `learnedLessons[]` and feeds the full list back every turn under a `LEARNED (persistent):` section.

This way the agent can't accidentally forget — the code owns the list, not the LLM's memory field.

---

## Stories Agent: Skip Element Labeling

Stories navigation is mechanical enough that element labeling adds cost without proportional value. Most turns are just "press ArrowRight."

### Change

Add an abstract method to BaseVisionAgent:

```typescript
abstract shouldLabelElements(): boolean;
```

- `StoriesAgent.shouldLabelElements()` returns `false`
- `FeedAgent.shouldLabelElements()` returns `true`

When `shouldLabelElements()` is false, the main loop skips the `labelElements()` call entirely — no `page.evaluate()`, no Jimp processing, no badge drawing. The raw screenshot goes directly to the LLM. The legend section of the prompt is omitted. The agent operates purely on visual recognition.

StoriesAgent prompt changes:
- Remove all element-label references ("click element [n]")
- Use spatial instructions: "press ArrowRight to advance", "press Escape to exit", "if you see a dismiss button, describe its position and click it"
- For the rare case where the agent needs to click something (a link sticker, a poll, a dismiss button), it can use coordinates from the screenshot since it's a vision model

This eliminates the `page.evaluate()` DOM touch per turn for stories, reduces Haiku input tokens (no legend text, no badge visual noise), and speeds up each turn by ~100-200ms.

### FeedAgent stays the same

Feed navigation genuinely benefits from labeled elements — timestamp links, carousel arrows, close buttons are easier to identify with numbered badges and a text legend than from pure visual recognition.

---

## Updated System Prompt Changes

### Add to both agents' prompts

```markdown
INTENT-DRIVEN ACTIONS
Every action you take must include:
- intent: what you're trying to accomplish (plain language)
- expected_state: what the screen should look like after your action succeeds
- if_wrong: what you'll do if the screen doesn't match your expectation

Before acting each turn, check: does the current screen match your previous expected_state?
- If YES: your last action worked. Continue with your plan.
- If NO: execute your recovery plan (if_wrong) FIRST before doing anything new.

Do not skip the recovery step. If you ended up somewhere unexpected, you must undo that before trying something new.
```

### Add to FeedAgent prompt only

```markdown
ELEMENT NOTES
In your response, include an element_notes field describing what you think key elements do.
You don't need to annotate every element — just the ones you actively considered this turn.
Your notes from previous turns will appear next to elements in the LABELED ELEMENTS list.

If an element has no note yet, it will appear as:
  [5] button — no known function yet

After you annotate it, future turns will show:
  [5] button — dismisses notification prompt
```

### Add to both agents' prompts

```markdown
LESSONS
If something didn't work as expected, you can include a "lesson" field in your response.
Lessons are permanently stored and shown to you every turn under LEARNED.
Use this for discoveries like:
- "clicking images plays video inline, use timestamp links to open post modal"
- "the suggestions bar profile pics look like story avatars but open profiles"
- "'Not Now' dismisses the notification prompt"

Only include a lesson when you've genuinely discovered something new about how the UI works.
```

---

## Implementation Steps

### Step 1 — Update response JSON parsing

In `BaseVisionAgent.parseJsonResponse()`:
- Add `intent`, `expected_state`, `if_wrong` (strings, optional)
- Add `element_notes` (object, optional)
- Add `lesson` (string, optional)

Update the `VisionAction` type to include the new fields.

### Step 2 — Add state tracking to BaseVisionAgent

New instance variables:
```typescript
protected elementKnowledge: Map<string, string> = new Map();
protected learnedLessons: string[] = [];
protected lastIntent: string = '';
protected lastExpectedState: string = '';
protected lastRecoveryPlan: string = '';
```

After each LLM response:
- Store `decision.intent`, `decision.expected_state`, `decision.if_wrong` for next turn
- Process `decision.element_notes` into `elementKnowledge` map
- Append `decision.lesson` to `learnedLessons` if present (cap at 10)

### Step 3 — Update `buildUserPrompt()`

Feed back the agent's previous intent, expected state, and recovery plan. Include the comparison instruction. Append element notes to the legend. Add LEARNED section.

### Step 4 — Add `shouldLabelElements()` to BaseVisionAgent

Abstract method. StoriesAgent returns `false`, FeedAgent returns `true`. Main loop checks this before calling `labelElements()`.

### Step 5 — Update system prompts

Split `navigator-agent.md` into the planned `capabilities.md`, `stories-instructions.md`, and `feed-instructions.md`. Add the intent-driven actions section, element notes section (feed only), and lessons section to the appropriate prompt files.

### Step 6 — Drop reference images from StoriesAgent

StoriesAgent loads no reference images. FeedAgent keeps the Posts + goinghome images.

### Step 7 — Verify

1. Run a stories session — confirm no element labeling, Haiku handles ArrowRight/Escape loop, intent/expected_state flow works
2. Run a feed session — confirm element legend gets enriched over turns, recovery plans execute on failures
3. Check that learned lessons persist across turns (grep for LEARNED in prompt logs)
4. Check that element knowledge accumulates (compare turn 1 legend to turn 10 legend)
5. Verify token counts — stories turns should be significantly cheaper without legend + badges
6. Trigger a deliberate failure (e.g., block a click via CDP) and verify the agent follows its recovery plan

---

## Cost Impact

| Change | Impact |
|--------|--------|
| Skip element labeling for stories | -100-200ms latency per turn, -200-400 input tokens per turn (no legend text, no badge noise in image) |
| `element_notes` output | +50-100 output tokens per turn (feed only, first few turns — stabilizes as cache fills) |
| `intent` + `expected_state` + `if_wrong` output | +30-60 output tokens per turn |
| `lesson` output | +20-40 output tokens, occasional (only on failures) |
| Better recovery → fewer wasted turns | Net savings — fewer stuck loops, fewer accidental detours |

Net effect: slight increase in per-turn output tokens, but fewer total turns needed because the agent wastes less time stuck or lost. Stories sessions should be noticeably cheaper.

---

## Files Changed

| File | Action |
|------|--------|
| `src/main/services/BaseVisionAgent.ts` | Add intent/prediction/recovery state, elementKnowledge map, learnedLessons array, shouldLabelElements() abstract method, update buildUserPrompt(), update parseJsonResponse() |
| `src/main/services/StoriesAgent.ts` | Override shouldLabelElements() → false, load no reference images |
| `src/main/services/FeedAgent.ts` | Override shouldLabelElements() → true |
| `src/utils/elementLabeler.ts` | No changes |
| `src/main/prompts/capabilities.md` | New — shared action definitions, output JSON format with new fields |
| `src/main/prompts/stories-instructions.md` | New — stories-only mission, spatial instructions (no element labels) |
| `src/main/prompts/feed-instructions.md` | New — feed mission, element notes instructions, feed-specific strategy |
| `src/main/prompts/navigator-agent.md` | Delete after split is complete |
