/**
 * VisionAgent - Pure Vision-Based Instagram Browsing Agent
 *
 * Replaces the accessibility tree + LLM dual-input system with a single
 * vision-only loop. The LLM sees a screenshot and outputs raw x,y coordinates
 * for clicks, just like a human looking at a screen and tapping.
 *
 * Core loop: screenshot → LLM → action (click/scroll/type/press/capture) → repeat
 *
 * No element IDs, no tree parsing, no DOM signatures, no semantic hints.
 */

import { Page } from 'playwright';
import { Jimp } from 'jimp';
import { GhostMouse } from './GhostMouse.js';
import { HumanScroll } from './HumanScroll.js';
import { ScreenshotCollector } from './ScreenshotCollector.js';
import { ModelConfig } from '../../shared/modelConfig.js';
import type { BrowsingPhase } from '../../types/navigation.js';
import type { CaptureSource } from '../../types/instagram.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** LLM response schema — the complete output format. */
interface VisionAction {
    thinking: string;
    action: 'click' | 'scroll' | 'type' | 'press' | 'hover' | 'capture' | 'wait' | 'done';
    x?: number;
    y?: number;
    direction?: 'up' | 'down';
    text?: string;
    key?: string;
    seconds?: number;
    memory?: string;
}

interface ActionHistoryEntry {
    action: string;
    result: string;
}

export interface VisionAgentConfig {
    apiKey: string;
    maxDurationMs: number;
    userInterests: string[];
    debugMode?: boolean;
    sessionMemoryDigest?: string;
}

export interface VisionAgentResult {
    captureCount: number;
    decisionCount: number;
    actionHistory: ActionHistoryEntry[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SCREENSHOT_WIDTH = 1280;
const MAX_ACTION_HISTORY = 10;

// ---------------------------------------------------------------------------
// VisionAgent
// ---------------------------------------------------------------------------

export class VisionAgent {
    private page: Page;
    private ghost: GhostMouse;
    private scroll: HumanScroll;
    private collector: ScreenshotCollector;
    private config: VisionAgentConfig;

    // Screenshot dimensions (updated after each resize)
    private screenshotWidth: number = SCREENSHOT_WIDTH;
    private screenshotHeight: number = 0;

    // Viewport dimensions (set once at run() start)
    private viewportWidth: number = 0;
    private viewportHeight: number = 0;

    // LLM state
    private model: string;
    private lastMemory: string = '';
    private actionHistory: ActionHistoryEntry[] = [];
    private decisionCount: number = 0;

    // Session state
    private captureCount: number = 0;
    private startTime: number = 0;

    constructor(
        page: Page,
        ghost: GhostMouse,
        scroll: HumanScroll,
        collector: ScreenshotCollector,
        config: VisionAgentConfig
    ) {
        this.page = page;
        this.ghost = ghost;
        this.scroll = scroll;
        this.collector = collector;
        this.config = config;
        this.model = ModelConfig.navigation;
    }

    // -----------------------------------------------------------------------
    // Main Loop
    // -----------------------------------------------------------------------

    async run(): Promise<VisionAgentResult> {
        this.startTime = Date.now();
        const vp = this.page.viewportSize();
        this.viewportWidth = vp?.width || 1080;
        this.viewportHeight = vp?.height || 1920;

        console.log(`\n👁️  VisionAgent starting (viewport: ${this.viewportWidth}x${this.viewportHeight}, model: ${this.model})`);

        while (true) {
            const elapsed = Date.now() - this.startTime;
            const remaining = this.config.maxDurationMs - elapsed;
            if (remaining <= 0) {
                console.log('⏱️  VisionAgent: time limit reached');
                break;
            }

            // 1. Take and resize screenshot
            const screenshot = await this.captureScreenshot();
            if (!screenshot) {
                await this.delay(500);
                continue;
            }

            // 2. Call LLM
            const decision = await this.callLLM(screenshot, remaining);
            this.decisionCount++;

            console.log(`  🧠 [${this.decisionCount}] action=${decision.action} | ${decision.thinking.slice(0, 80)}`);

            // 3. Handle "done" — LLM terminates session
            if (decision.action === 'done') {
                console.log(`✅ VisionAgent: LLM ended session — ${decision.thinking}`);
                break;
            }

            // 4. Persist memory scratchpad
            if (decision.memory) {
                this.lastMemory = decision.memory;
            }

            // 5. Execute action
            const result = await this.executeAction(decision);
            console.log(`     → ${result}`);

            // 6. Record to history
            this.actionHistory.push({
                action: this.formatAction(decision),
                result
            });
            if (this.actionHistory.length > MAX_ACTION_HISTORY) {
                this.actionHistory.shift();
            }

            // 7. Log to session file
            this.collector.appendLog(`[${this.decisionCount}] ${this.formatAction(decision)} → ${result}`);

            // 8. Inter-action delay (300-1000ms, human-like variation)
            await this.delay(300 + Math.random() * 700);
        }

        console.log(`\n👁️  VisionAgent finished: ${this.captureCount} captures, ${this.decisionCount} decisions\n`);

        return {
            captureCount: this.captureCount,
            decisionCount: this.decisionCount,
            actionHistory: [...this.actionHistory]
        };
    }

    // -----------------------------------------------------------------------
    // Screenshot Capture & Resize
    // -----------------------------------------------------------------------

    private async captureScreenshot(): Promise<Buffer | null> {
        try {
            const raw = await this.page.screenshot({ type: 'jpeg', quality: 80, fullPage: false });
            const image = await Jimp.read(Buffer.from(raw));
            const origW = image.width;
            const origH = image.height;
            if (origW > SCREENSHOT_WIDTH) {
                image.resize({ w: SCREENSHOT_WIDTH });
            }
            this.screenshotWidth = image.width;
            this.screenshotHeight = image.height;
            const buffer = await image.getBuffer('image/jpeg', { quality: 80 });
            console.log(`  📸 Screenshot: ${origW}x${origH} → ${this.screenshotWidth}x${this.screenshotHeight} (${Math.round(buffer.length / 1024)}KB)`);
            return buffer;
        } catch (err) {
            console.warn('  ⚠️ Screenshot failed:', err);
            return null;
        }
    }

    // -----------------------------------------------------------------------
    // Coordinate Scaling
    // -----------------------------------------------------------------------

    private scaleToViewport(x: number, y: number): { x: number; y: number } {
        const scaledX = (x / this.screenshotWidth) * this.viewportWidth;
        const scaledY = (y / this.screenshotHeight) * this.viewportHeight;
        return {
            x: Math.max(0, Math.min(this.viewportWidth, scaledX)),
            y: Math.max(0, Math.min(this.viewportHeight, scaledY))
        };
    }

    // -----------------------------------------------------------------------
    // Action Execution
    // -----------------------------------------------------------------------

    private async executeAction(decision: VisionAction): Promise<string> {
        switch (decision.action) {
            case 'click': return this.executeClick(decision);
            case 'scroll': return this.executeScroll(decision);
            case 'capture': return this.executeCapture();
            case 'type': return this.executeType(decision);
            case 'press': return this.executePress(decision);
            case 'hover': return this.executeHover(decision);
            case 'wait': return this.executeWait(decision);
            default: return `unknown action: ${decision.action}`;
        }
    }

    private async executeClick(d: VisionAction): Promise<string> {
        if (d.x === undefined || d.y === undefined) return 'missing coordinates';

        const preUrl = this.page.url();
        const preHash = await this.quickScreenshotHash();

        const { x, y } = this.scaleToViewport(d.x, d.y);
        await this.ghost.clickPoint(x, y);

        // Poll for state change (5 x 400ms = 2s max)
        for (let i = 0; i < 5; i++) {
            await this.delay(400);
            const postUrl = this.page.url();
            if (postUrl !== preUrl) {
                // Wait for SPA hydration after URL change
                await this.page.waitForLoadState('networkidle', { timeout: 3000 }).catch(() => {});
                await this.delay(800 + Math.random() * 400);
                return `url changed to ${postUrl}`;
            }
            const postHash = await this.quickScreenshotHash();
            if (postHash !== preHash) return 'page changed';
        }
        return 'no change';
    }

    private async executeScroll(d: VisionAction): Promise<string> {
        const direction = d.direction || 'down';
        const baseDistance = direction === 'up'
            ? -Math.round(this.viewportHeight * 0.4)
            : Math.round(this.viewportHeight * 0.4);

        const result = await this.scroll.scrollWithIntent({ baseDistance });
        if (result.scrollFailed) return 'scroll failed';
        return `scrolled ${direction} ${Math.abs(result.actualDelta)}px`;
    }

    private async executeCapture(): Promise<string> {
        const source = this.inferCaptureSource();
        const fingerprint = this.extractUrlFingerprint();

        const captured = await this.collector.captureCurrentPost(
            source,
            undefined,
            fingerprint || undefined
        );

        if (captured) {
            this.captureCount++;
            return `captured #${this.captureCount} (source=${source})`;
        }
        return 'capture rejected (duplicate)';
    }

    private async executeType(d: VisionAction): Promise<string> {
        if (!d.text) return 'no text provided';

        // SAFETY GUARDRAIL: check focused input context
        const context = await this.getFocusedInputContext();
        if (context === 'comment' || context === 'message') {
            console.warn(`  🚫 BLOCKED: typing in ${context} context`);
            return `BLOCKED: cannot type in ${context} field`;
        }

        // Type character by character with human-like delays
        for (const char of d.text) {
            await this.page.keyboard.type(char);
            await this.delay(50 + Math.random() * 100);
        }
        return `typed "${d.text.slice(0, 30)}"`;
    }

    private async executePress(d: VisionAction): Promise<string> {
        if (!d.key) return 'no key provided';
        await this.page.keyboard.press(d.key);
        await this.delay(200 + Math.random() * 300);
        return `pressed ${d.key}`;
    }

    private async executeHover(d: VisionAction): Promise<string> {
        if (d.x === undefined || d.y === undefined) return 'missing coordinates';
        const { x, y } = this.scaleToViewport(d.x, d.y);
        await this.ghost.moveTo({ x, y });
        return `hovered at (${Math.round(x)}, ${Math.round(y)})`;
    }

    private async executeWait(d: VisionAction): Promise<string> {
        const seconds = Math.max(1, Math.min(5, d.seconds || 2));
        await this.delay(seconds * 1000);
        return `waited ${seconds}s`;
    }

    // -----------------------------------------------------------------------
    // Click Verification — Perceptual Hash
    // -----------------------------------------------------------------------

    private async quickScreenshotHash(): Promise<string> {
        try {
            const raw = await this.page.screenshot({ type: 'jpeg', quality: 30, fullPage: false });
            const image = await Jimp.read(raw);
            image.resize({ w: 8, h: 8 });
            image.greyscale();

            // Compute average hash (same algorithm as ScreenshotCollector)
            const pixels: number[] = [];
            for (let py = 0; py < 8; py++) {
                for (let px = 0; px < 8; px++) {
                    pixels.push((image.getPixelColor(px, py) >> 24) & 0xFF);
                }
            }
            const mean = pixels.reduce((a, b) => a + b, 0) / 64;
            let hash = '';
            for (let i = 0; i < 64; i += 4) {
                const nibble = [0, 1, 2, 3]
                    .map(j => pixels[i + j] > mean ? '1' : '0')
                    .join('');
                hash += parseInt(nibble, 2).toString(16);
            }
            return hash;
        } catch {
            return '';
        }
    }

    // -----------------------------------------------------------------------
    // URL-Based Fingerprint & Source Inference
    // -----------------------------------------------------------------------

    private extractUrlFingerprint(): string | null {
        const url = this.page.url();
        const match = url.match(/\/(p|reel)\/([A-Za-z0-9_-]+)/);
        return match ? match[2] : null;
    }

    private inferCaptureSource(): CaptureSource {
        const url = this.page.url();

        // Story viewer
        if (url.includes('/stories/')) return 'story';

        // Carousel: last action was ArrowRight on a post detail page
        if (this.actionHistory.length > 0) {
            const last = this.actionHistory[this.actionHistory.length - 1];
            if (last.action === 'press(ArrowRight)' && this.extractUrlFingerprint()) {
                return 'carousel';
            }
        }

        // Search context: if recent actions include typing (search query)
        if (url.includes('/explore/')) return 'search';
        for (let i = this.actionHistory.length - 1; i >= Math.max(0, this.actionHistory.length - 5); i--) {
            if (this.actionHistory[i].action.startsWith('type(')) return 'search';
        }

        return 'feed';
    }

    // -----------------------------------------------------------------------
    // Safety Guardrail — Input Context Detection
    // -----------------------------------------------------------------------

    private async getFocusedInputContext(): Promise<'search' | 'comment' | 'message' | 'unknown'> {
        try {
            return await this.page.evaluate(() => {
                const el = document.activeElement;
                if (!el) return 'unknown';

                let node: Element | null = el;
                while (node) {
                    const label = (node.getAttribute('aria-label') || '').toLowerCase();
                    const placeholder = (node.getAttribute('placeholder') || '').toLowerCase();
                    const role = (node.getAttribute('role') || '').toLowerCase();

                    if (label.includes('search') || placeholder.includes('search') || role === 'search') return 'search';
                    if (label.includes('comment') || label.includes('reply') || placeholder.includes('comment')) return 'comment';
                    if (label.includes('message') || label.includes('direct') || label.includes('chat') || placeholder.includes('message')) return 'message';

                    node = node.parentElement;
                }
                return 'unknown';
            }) as 'search' | 'comment' | 'message' | 'unknown';
        } catch {
            return 'unknown';
        }
    }

    // -----------------------------------------------------------------------
    // LLM Integration
    // -----------------------------------------------------------------------

    private async callLLM(screenshot: Buffer, remainingMs: number): Promise<VisionAction> {
        const systemPrompt = this.getSystemPrompt();
        const userPrompt = this.buildUserPrompt(remainingMs);
        const visionDetail = process.env.KOWALSKI_VISION_DETAIL || 'high';

        const requestBody = {
            model: this.model,
            messages: [
                { role: 'system', content: systemPrompt },
                {
                    role: 'user',
                    content: [
                        {
                            type: 'image_url',
                            image_url: {
                                url: `data:image/jpeg;base64,${screenshot.toString('base64')}`,
                                detail: visionDetail
                            }
                        },
                        { type: 'text', text: userPrompt }
                    ]
                }
            ],
            response_format: { type: 'json_object' },
            max_completion_tokens: 2048
        };

        // Attempt LLM call with one retry on JSON failure
        for (let attempt = 0; attempt < 2; attempt++) {
            try {
                const response = await fetch('https://api.openai.com/v1/chat/completions', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${this.config.apiKey}`
                    },
                    body: JSON.stringify(requestBody)
                });

                if (!response.ok) {
                    const errText = await response.text();
                    console.warn(`  ⚠️ LLM API error (${response.status}): ${errText.slice(0, 200)}`);
                    break; // Don't retry API errors
                }

                const data = await response.json() as Record<string, unknown>;

                // Log token usage
                const usage = data.usage as { prompt_tokens?: number; completion_tokens?: number } | undefined;
                if (usage) {
                    console.log(`  🧠 Tokens: ${usage.prompt_tokens} in, ${usage.completion_tokens} out (vision:${visionDetail})`);
                }

                const choices = data.choices as Array<{ message?: { content?: string } }> | undefined;
                const content = choices?.[0]?.message?.content;
                if (!content || typeof content !== 'string') {
                    console.warn(`  ⚠️ Empty LLM response (attempt ${attempt + 1})`);
                    if (attempt === 0) { await this.delay(500); continue; }
                    break;
                }

                const parsed = JSON.parse(content) as VisionAction;
                return parsed;

            } catch (err) {
                console.warn(`  ⚠️ LLM call/parse error (attempt ${attempt + 1}):`, err);
                if (attempt === 0) { await this.delay(500); continue; }
            }
        }

        // Fallback: scroll down and continue
        console.warn('  ⚠️ LLM fallback: scrolling down');
        return { thinking: 'LLM error fallback', action: 'scroll', direction: 'down' };
    }

    // -----------------------------------------------------------------------
    // System Prompt
    // -----------------------------------------------------------------------

    private getSystemPrompt(): string {
        return `You are an autonomous Instagram browsing agent. You see a screenshot of the Instagram app each turn and decide what to do next.

COORDINATE SYSTEM
- The screenshot is ${this.screenshotWidth}x${this.screenshotHeight} pixels.
- (0,0) is top-left. x increases rightward, y increases downward.
- For click/hover, give x,y coordinates pointing at the CENTER of your target.

ACTIONS (pick one per turn):

  click(x, y)     Click at position (x,y). Use for opening posts, tapping stories, buttons, navigation.
  scroll(dir)     Scroll "up" or "down".
  type(text)      Type text into the focused input. ONLY use for Search. Never for comments or DMs.
  press(key)      Press a key: Escape, Enter, ArrowRight, ArrowLeft, Backspace, Tab.
  hover(x, y)     Move mouse to (x,y) without clicking. Use to reveal hover-triggered UI (carousel arrows).
  capture         Capture the current screen for the content digest.
  wait(seconds)   Wait 1-5 seconds for content to load.
  done            End the browsing session.

MISSION
Browse Instagram to build a content digest of the user's social world.
You have three activities: browsing the feed, watching stories, and searching for specific topics.
Capture interesting content from DETAIL PAGES (not the feed viewport).

FEED WORKFLOW
1. On the feed, find a post worth capturing.
2. Click its TIMESTAMP (text like "1h", "16h", "2d" — appears near the top-right of each post). The timestamp is a link that opens the post's detail page.
3. On the detail page, immediately capture.
4. If the post has multiple images (carousel — look for dots or arrows), press ArrowRight to advance slides. Capture each slide.
5. Return to feed: click the Instagram logo (top-left corner) or press Escape if the post opened as a modal.
6. Scroll down to see new posts. Repeat.

STORIES WORKFLOW
1. Click a story circle at the top of the feed.
2. Capture every story frame.
3. Advance by clicking the right side of the story viewer or pressing ArrowRight.
4. When stories end, you'll return to the feed automatically.

SEARCH WORKFLOW
1. Click "Search" in the left sidebar.
2. Click the search input, type your search term.
3. Wait for results, then click a relevant result.
4. Capture interesting content from the profile or post detail page.
5. Navigate back and search for the next interest.

TIME BUDGET
Aim for roughly 40% feed, 30% stories, 30% search over the full session.
Don't spend the whole session on one activity — switch it up.
If you've been on the feed for a while, go watch stories. If you've done stories, search for interests.
Use the "done" action when you feel you've covered enough content or time is almost up.

CAPTURE RULES
- GOOD: Post detail page (full image, caption, engagement stats visible).
- GOOD: Story frame (full-screen content).
- BAD: Feed viewport with multiple partial posts. NEVER capture from the feed.
- After capturing a post detail page, return to the feed before capturing another.

SAFETY — HARD RULES
- NEVER click Like, Follow, Share, or Save buttons.
- NEVER type in comment boxes, reply fields, or direct message inputs.
- ONLY type in the Search input.
- This is READ-ONLY browsing. Do not engage with content, do not follow anyone.

RECOVERY
- If your last 3+ clicks had "no change", try a different target or scroll first.
- If scroll fails, press Escape (an overlay may be blocking).
- If stuck for 5+ actions, switch activities (feed → stories → search).
- If an overlay or modal is in the way, press Escape to dismiss it.

MEMORY
You have a "memory" field in your response. Use it to track:
- Posts captured (brief descriptions)
- Your current plan
- Failed attempts to click or capture
Your notes from the previous turn appear as "YOUR NOTES" — use them to avoid re-capturing.

OUTPUT FORMAT (JSON):
{
  "thinking": "Brief reasoning about what you see and what to do",
  "action": "click",
  "x": 450,
  "y": 320,
  "memory": "Captured: sunset post from @nature. Plan: click next post."
}`;
    }

    // -----------------------------------------------------------------------
    // Per-Turn User Prompt
    // -----------------------------------------------------------------------

    private buildUserPrompt(remainingMs: number): string {
        const elapsedSec = Math.round((Date.now() - this.startTime) / 1000);
        const remainingSec = Math.round(remainingMs / 1000);
        const totalMin = Math.round(this.config.maxDurationMs / 60000);

        const parts: string[] = [];

        parts.push(`SESSION: ${elapsedSec}s elapsed, ${remainingSec}s remaining (${totalMin} min total)`);
        parts.push(`CAPTURES: ${this.captureCount} screenshots taken`);

        if (this.config.userInterests.length > 0) {
            parts.push(`INTERESTS TO SEARCH: ${this.config.userInterests.join(', ')}`);
        }

        // Last action + result
        if (this.actionHistory.length > 0) {
            const last = this.actionHistory[this.actionHistory.length - 1];
            parts.push(`\nLAST ACTION: ${last.action} → ${last.result}`);
        }

        // Recent history
        if (this.actionHistory.length > 0) {
            parts.push('\nRECENT HISTORY:');
            this.actionHistory.forEach((entry, i) => {
                parts.push(`${i + 1}. ${entry.action} → ${entry.result}`);
            });
        }

        // Session memory digest (cross-session)
        if (this.config.sessionMemoryDigest) {
            parts.push(`\nSESSION CONTEXT:\n${this.config.sessionMemoryDigest}`);
        }

        // LLM's scratchpad from previous turn
        if (this.lastMemory) {
            parts.push(`\nYOUR NOTES (from last turn):\n${this.lastMemory}`);
        }

        parts.push('\nWhat do you do next?');

        return parts.join('\n');
    }

    // -----------------------------------------------------------------------
    // Utilities
    // -----------------------------------------------------------------------

    private delay(ms: number): Promise<void> {
        return new Promise(r => setTimeout(r, ms));
    }

    private formatAction(d: VisionAction): string {
        switch (d.action) {
            case 'click': return `click(${d.x},${d.y})`;
            case 'scroll': return `scroll(${d.direction || 'down'})`;
            case 'capture': return 'capture';
            case 'type': return `type("${(d.text || '').slice(0, 20)}")`;
            case 'press': return `press(${d.key})`;
            case 'hover': return `hover(${d.x},${d.y})`;
            case 'wait': return `wait(${d.seconds || 2}s)`;
            case 'done': return 'done';
            default: return d.action;
        }
    }

    // Public getters for InstagramScraper session summary
    getCaptureCount(): number { return this.captureCount; }
    getDecisionCount(): number { return this.decisionCount; }
    getActionHistory(): ActionHistoryEntry[] { return [...this.actionHistory]; }
}
