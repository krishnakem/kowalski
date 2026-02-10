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
import fs from 'fs';
import path from 'path';
import { GhostMouse } from './GhostMouse.js';
import { HumanScroll } from './HumanScroll.js';
import { ScreenshotCollector } from './ScreenshotCollector.js';
import { ModelConfig } from '../../shared/modelConfig.js';
import type { BrowsingPhase } from '../../types/navigation.js';
import type { CaptureSource } from '../../types/instagram.js';
import visionAgentPrompt from '../prompts/vision-agent.md';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** LLM response schema — the complete output format. */
interface VisionAction {
    thinking: string;
    action: 'click' | 'scroll' | 'type' | 'press' | 'hover' | 'capture' | 'wait' | 'done' | 'newtab' | 'closetab';
    x?: number;
    y?: number;
    x2?: number;   // Bottom-right x for capture crop region
    y2?: number;   // Bottom-right y for capture crop region
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
// No cap — LLM sees full history for the run

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
    private lastTokenUsage: { promptTokens: number; completionTokens: number } | null = null;

    // Session state
    private captureCount: number = 0;
    private startTime: number = 0;
    private capturedPosts: Array<{ fingerprint: string; url: string; source: string }> = [];

    // Reference example images (loaded once, cached; sent only on first turn)
    private referenceImages: Array<{ label: string; base64: string }> | null = null;
    private referenceImagesSent: boolean = false;

    // Tab management — tracks the original tab so closetab can return to it
    private originalPage: Page | null = null;

    // External stop signal (set by Cmd+Shift+K)
    private stopped: boolean = false;

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

    /** Stop the agent externally (e.g. Cmd+Shift+K). */
    stop(): void {
        this.stopped = true;
        console.log('🛑 VisionAgent: external stop signal received');
        this.collector.appendLog('🛑 External stop signal received');
    }

    async run(): Promise<VisionAgentResult> {
        this.startTime = Date.now();
        const vp = this.page.viewportSize();
        this.viewportWidth = vp?.width || 1080;
        this.viewportHeight = vp?.height || 1920;

        console.log(`\n👁️  VisionAgent starting (viewport: ${this.viewportWidth}x${this.viewportHeight}, model: ${this.model})`);
        this.collector.appendLog(`👁️ VisionAgent starting (viewport: ${this.viewportWidth}x${this.viewportHeight}, model: ${this.model})`);

        while (true) {
            // Check external stop signal (Cmd+Shift+K)
            if (this.stopped) {
                console.log('🛑 VisionAgent: stopped by user');
                this.collector.appendLog('🛑 Stopped by user (Cmd+Shift+K)');
                break;
            }

            const elapsed = Date.now() - this.startTime;
            const remaining = this.config.maxDurationMs - elapsed;
            if (remaining <= 0) {
                console.log('⏱️  VisionAgent: time limit reached');
                this.collector.appendLog('⏱️ Time limit reached');
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
                this.collector.appendLog(`✅ LLM ended session — ${decision.thinking}`);
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

            // 7. Log to session file
            const tokenStr = this.lastTokenUsage
                ? ` | ${this.lastTokenUsage.promptTokens}+${this.lastTokenUsage.completionTokens} tokens`
                : '';
            this.collector.appendLog(`[${this.decisionCount}] ${this.formatAction(decision)}${tokenStr}`);
            this.collector.appendLog(`  💭 ${decision.thinking}`);
            this.collector.appendLog(`  → ${result}`);
            if (decision.memory) {
                this.collector.appendLog(`  📝 Memory: ${decision.memory}`);
            }

        }

        console.log(`\n👁️  VisionAgent finished: ${this.captureCount} captures, ${this.decisionCount} decisions\n`);
        this.collector.appendLog(`👁️ VisionAgent finished: ${this.captureCount} captures, ${this.decisionCount} decisions`);

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
            const sizeKB = Math.round(buffer.length / 1024);
            console.log(`  📸 Screenshot: ${origW}x${origH} → ${this.screenshotWidth}x${this.screenshotHeight} (${sizeKB}KB)`);
            this.collector.appendLog(`📸 ${origW}x${origH} → ${this.screenshotWidth}x${this.screenshotHeight} (${sizeKB}KB)`);
            return buffer;
        } catch (err) {
            console.warn('  ⚠️ Screenshot failed:', err);
            this.collector.appendLog(`⚠️ Screenshot failed: ${err}`);
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
            case 'capture': return this.executeCapture(decision);
            case 'type': return this.executeType(decision);
            case 'press': return this.executePress(decision);
            case 'hover': return this.executeHover(decision);
            case 'wait': return this.executeWait(decision);
            case 'newtab': return this.executeNewtab(decision);
            case 'closetab': return this.executeClosetab();
            default: return `unknown action: ${decision.action}`;
        }
    }

    private async executeClick(d: VisionAction): Promise<string> {
        if (d.x === undefined || d.y === undefined) return 'missing coordinates';
        const { x, y } = this.scaleToViewport(d.x, d.y);
        console.log(`  🖱️ click: screenshot(${d.x},${d.y}) → viewport(${Math.round(x)},${Math.round(y)}) | url=${this.page.url()}`);
        this.collector.appendLog(`🖱️ click: screenshot(${d.x},${d.y}) → viewport(${Math.round(x)},${Math.round(y)}) | url=${this.page.url()}`);
        await this.ghost.clickPoint(x, y);
        return 'clicked';
    }

    private async executeScroll(d: VisionAction): Promise<string> {
        const direction = d.direction || 'down';
        const baseDistance = direction === 'up'
            ? -Math.round(this.viewportHeight * 0.4)
            : Math.round(this.viewportHeight * 0.4);

        console.log(`  📜 scroll: direction=${direction}, baseDistance=${baseDistance}px`);
        this.collector.appendLog(`📜 scroll: direction=${direction}, baseDistance=${baseDistance}px`);
        const result = await this.scroll.scrollWithIntent({ baseDistance });
        if (result.scrollFailed) {
            console.log(`  📜 scroll failed`);
            this.collector.appendLog(`📜 scroll failed`);
            return 'scroll failed';
        }
        console.log(`  📜 scrolled ${direction} ${Math.abs(result.actualDelta)}px`);
        this.collector.appendLog(`📜 scrolled ${direction} ${Math.abs(result.actualDelta)}px`);
        return `scrolled ${direction} ${Math.abs(result.actualDelta)}px`;
    }

    private async executeCapture(d: VisionAction): Promise<string> {
        const source = this.inferCaptureSource();
        const fingerprint = this.extractUrlFingerprint();
        const url = this.page.url();

        // Build optional clip region from LLM-provided crop coordinates
        let clip: { x: number; y: number; width: number; height: number } | undefined;
        if (d.x !== undefined && d.y !== undefined && d.x2 !== undefined && d.y2 !== undefined) {
            const topLeft = this.scaleToViewport(d.x, d.y);
            const bottomRight = this.scaleToViewport(d.x2, d.y2);
            const width = bottomRight.x - topLeft.x;
            const height = bottomRight.y - topLeft.y;
            if (width > 50 && height > 50) {
                clip = { x: topLeft.x, y: topLeft.y, width, height };
                console.log(`  📷 capture: crop screenshot(${d.x},${d.y})→(${d.x2},${d.y2}) → viewport clip(${Math.round(topLeft.x)},${Math.round(topLeft.y)},${Math.round(width)}x${Math.round(height)})`);
                this.collector.appendLog(`📷 capture: crop screenshot(${d.x},${d.y})→(${d.x2},${d.y2}) → viewport clip(${Math.round(topLeft.x)},${Math.round(topLeft.y)},${Math.round(width)}x${Math.round(height)})`);
            } else {
                console.log(`  📷 capture: crop region too small (${Math.round(width)}x${Math.round(height)}), using full viewport`);
                this.collector.appendLog(`📷 capture: crop region too small (${Math.round(width)}x${Math.round(height)}), using full viewport`);
            }
        } else {
            console.log(`  📷 capture: no crop coordinates, using full viewport`);
            this.collector.appendLog(`📷 capture: no crop coordinates, using full viewport`);
        }
        console.log(`  📷 capture: source=${source}, fingerprint=${fingerprint || 'none'}, url=${url}`);
        this.collector.appendLog(`📷 capture: source=${source}, fingerprint=${fingerprint || 'none'}, url=${url}`);

        const captured = await this.collector.captureCurrentPost(
            source,
            undefined,
            fingerprint || undefined,
            clip
        );

        if (captured) {
            this.captureCount++;
            if (fingerprint) {
                this.capturedPosts.push({ fingerprint, url, source });
            }
            const cropInfo = clip ? ` [cropped ${Math.round(clip.width)}x${Math.round(clip.height)}]` : '';
            console.log(`  📷 ✅ captured #${this.captureCount} (source=${source})${cropInfo}`);
            this.collector.appendLog(`📷 ✅ captured #${this.captureCount} (source=${source})${cropInfo}`);
            return `captured #${this.captureCount} (source=${source})${cropInfo}`;
        }
        console.log(`  📷 ❌ capture rejected (duplicate) url=${url}`);
        this.collector.appendLog(`📷 ❌ capture rejected (duplicate) url=${url}`);
        return `capture rejected — already captured this post (${url}). Do NOT re-open it.`;
    }

    private async executeType(d: VisionAction): Promise<string> {
        if (!d.text) return 'no text provided';

        // SAFETY GUARDRAIL: check focused input context
        const context = await this.getFocusedInputContext();
        console.log(`  ⌨️ type: text="${d.text.slice(0, 40)}", inputContext=${context}`);
        this.collector.appendLog(`⌨️ type: text="${d.text.slice(0, 40)}", inputContext=${context}`);
        if (context === 'comment' || context === 'message') {
            console.warn(`  🚫 BLOCKED: typing in ${context} context`);
            this.collector.appendLog(`🚫 BLOCKED: typing in ${context} context`);
            return `BLOCKED: cannot type in ${context} field`;
        }

        await this.page.keyboard.type(d.text);
        console.log(`  ⌨️ typed "${d.text.slice(0, 40)}"`);
        this.collector.appendLog(`⌨️ typed "${d.text.slice(0, 40)}"`);
        return `typed "${d.text.slice(0, 30)}"`;
    }

    private async executePress(d: VisionAction): Promise<string> {
        if (!d.key) return 'no key provided';
        console.log(`  🔑 press: key=${d.key}`);
        this.collector.appendLog(`🔑 press: key=${d.key}`);
        await this.page.keyboard.press(d.key);
        return `pressed ${d.key}`;
    }

    private async executeHover(d: VisionAction): Promise<string> {
        if (d.x === undefined || d.y === undefined) return 'missing coordinates';
        const { x, y } = this.scaleToViewport(d.x, d.y);
        console.log(`  👆 hover: screenshot(${d.x},${d.y}) → viewport(${Math.round(x)},${Math.round(y)})`);
        this.collector.appendLog(`👆 hover: screenshot(${d.x},${d.y}) → viewport(${Math.round(x)},${Math.round(y)})`);
        await this.ghost.moveTo({ x, y });
        return `hovered at (${Math.round(x)}, ${Math.round(y)})`;
    }

    private async executeWait(d: VisionAction): Promise<string> {
        const seconds = Math.max(1, Math.min(5, d.seconds || 2));
        console.log(`  ⏳ wait: ${seconds}s`);
        this.collector.appendLog(`⏳ wait: ${seconds}s`);
        await this.delay(seconds * 1000);
        return `waited ${seconds}s`;
    }

    // -----------------------------------------------------------------------
    // Tab Management
    // -----------------------------------------------------------------------

    private async executeNewtab(d: VisionAction): Promise<string> {
        if (d.x === undefined || d.y === undefined) return 'missing coordinates';

        const context = this.page.context();
        const { x, y } = this.scaleToViewport(d.x, d.y);

        console.log(`  🔗 newtab: screenshot(${d.x},${d.y}) → viewport(${Math.round(x)},${Math.round(y)}) | from=${this.page.url()}`);
        this.collector.appendLog(`🔗 newtab: screenshot(${d.x},${d.y}) → viewport(${Math.round(x)},${Math.round(y)}) | from=${this.page.url()}`);

        // Save the current page as the original if this is the first newtab
        if (!this.originalPage) {
            this.originalPage = this.page;
        }

        try {
            // Move mouse naturally to the target, then middle-click to open in new tab
            await this.ghost.moveTo({ x, y });

            // Listen for the new page event BEFORE clicking
            const newPagePromise = context.waitForEvent('page', { timeout: 5000 });
            await this.page.mouse.click(x, y, { button: 'middle' });

            const newPage = await newPagePromise;
            await newPage.waitForLoadState('domcontentloaded', { timeout: 8000 }).catch(() => {});

            this.switchToPage(newPage);
            console.log(`  🔗 newtab opened → ${newPage.url()}`);
            this.collector.appendLog(`🔗 newtab opened → ${newPage.url()}`);
            return `opened new tab → ${newPage.url()}`;
        } catch {
            console.log(`  🔗 newtab failed — target not a link`);
            this.collector.appendLog(`🔗 newtab failed — target not a link`);
            return 'newtab failed — target may not be a link. Try click() instead.';
        }
    }

    private async executeClosetab(): Promise<string> {
        if (!this.originalPage) {
            console.log(`  ❎ closetab: no tab to close — already on main tab`);
            this.collector.appendLog(`❎ closetab: no tab to close — already on main tab`);
            return 'no tab to close — already on the main tab';
        }

        // If we're on the original page, nothing to close
        if (this.page === this.originalPage) {
            this.originalPage = null;
            console.log(`  ❎ closetab: already on main tab`);
            this.collector.appendLog(`❎ closetab: already on main tab`);
            return 'already on main tab';
        }

        const closingUrl = this.page.url();
        console.log(`  ❎ closetab: closing ${closingUrl}`);
        this.collector.appendLog(`❎ closetab: closing ${closingUrl}`);
        try {
            await this.page.close();
        } catch {
            // Page may already be closed
        }

        // Switch back to the original page
        this.switchToPage(this.originalPage);
        this.originalPage = null;

        console.log(`  ❎ closetab: back to ${this.page.url()}`);
        this.collector.appendLog(`❎ closetab: back to ${this.page.url()}`);
        return `closed tab (was: ${closingUrl}), back to ${this.page.url()}`;
    }

    /** Rebind all services to a different page/tab. */
    private switchToPage(page: Page): void {
        this.page = page;
        this.ghost.setPage(page);
        this.scroll.setPage(page);
        this.collector.setPage(page);

        // Update viewport dimensions for the new page
        const vp = page.viewportSize();
        if (vp) {
            this.viewportWidth = vp.width;
            this.viewportHeight = vp.height;
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
        const refImages = this.loadReferenceImages();

        // Build messages array: system → (optional) reference images → current turn
        const messages: Array<Record<string, unknown>> = [
            { role: 'system', content: systemPrompt }
        ];

        // Inject reference images as a few-shot user→assistant exchange (first turn only)
        if (refImages.length > 0 && !this.referenceImagesSent) {
            const refContent: Array<Record<string, unknown>> = [];
            for (const ref of refImages) {
                refContent.push({
                    type: 'image_url',
                    image_url: { url: ref.base64, detail: 'auto' }
                });
                refContent.push({
                    type: 'text',
                    text: `[Reference: ${ref.label}]`
                });
            }
            refContent.push({
                type: 'text',
                text: 'Above are reference screenshots of Instagram\'s desktop UI. Study them so you know where key elements are.'
            });
            messages.push({ role: 'user', content: refContent });
            messages.push({
                role: 'assistant',
                content: 'Understood. I\'ve studied the reference screenshots and will use them to navigate accurately.'
            });
            this.referenceImagesSent = true;
        }

        // Current turn: live screenshot + context
        messages.push({
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
        });

        const requestBody = {
            model: this.model,
            messages,
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
                    this.collector.appendLog(`  ⚠️ LLM API error (${response.status}): ${errText.slice(0, 200)}`);
                    break; // Don't retry API errors
                }

                const data = await response.json() as Record<string, unknown>;

                // Log token usage
                const usage = data.usage as { prompt_tokens?: number; completion_tokens?: number } | undefined;
                if (usage) {
                    this.lastTokenUsage = {
                        promptTokens: usage.prompt_tokens || 0,
                        completionTokens: usage.completion_tokens || 0
                    };
                    console.log(`  🧠 Tokens: ${usage.prompt_tokens} in, ${usage.completion_tokens} out (vision:${visionDetail})`);
                    this.collector.appendLog(`  🧠 Tokens: ${usage.prompt_tokens} in, ${usage.completion_tokens} out (vision:${visionDetail})`);
                }

                const choices = data.choices as Array<{ message?: { content?: string } }> | undefined;
                const content = choices?.[0]?.message?.content;
                if (!content || typeof content !== 'string') {
                    console.warn(`  ⚠️ Empty LLM response (attempt ${attempt + 1})`);
                    this.collector.appendLog(`  ⚠️ Empty LLM response (attempt ${attempt + 1})`);
                    if (attempt === 0) { await this.delay(500); continue; }
                    break;
                }

                const parsed = JSON.parse(content) as VisionAction;
                return parsed;

            } catch (err) {
                console.warn(`  ⚠️ LLM call/parse error (attempt ${attempt + 1}):`, err);
                this.collector.appendLog(`  ⚠️ LLM call/parse error (attempt ${attempt + 1}): ${err}`);
                if (attempt === 0) { await this.delay(500); continue; }
            }
        }

        // Fallback: scroll down and continue
        console.warn('  ⚠️ LLM fallback: scrolling down');
        this.collector.appendLog('  ⚠️ LLM fallback: scrolling down');
        return { thinking: 'LLM error fallback', action: 'scroll', direction: 'down' };
    }

    // -----------------------------------------------------------------------
    // System Prompt
    // -----------------------------------------------------------------------

    private getSystemPrompt(): string {
        return visionAgentPrompt
            .replace('{{SCREENSHOT_WIDTH}}', String(this.screenshotWidth))
            .replace('{{SCREENSHOT_HEIGHT}}', String(this.screenshotHeight));
    }

    /**
     * Load reference example images from src/main/prompts/examples/.
     * Images are loaded once and cached for the session.
     *
     * Naming convention: use descriptive filenames like:
     *   home-feed.jpg, search-panel.png, post-modal.jpg, story-viewer.jpg
     * The filename (without extension) becomes the label shown to the LLM.
     */
    private loadReferenceImages(): Array<{ label: string; base64: string }> {
        if (this.referenceImages !== null) return this.referenceImages;

        this.referenceImages = [];
        // __dirname at runtime is dist-electron/main/, project root is ../..
        const examplesDir = path.join(__dirname, '../../src/main/prompts/examples');

        try {
            if (!fs.existsSync(examplesDir)) return this.referenceImages;

            const imagePattern = /\.(jpg|jpeg|png|webp)$/i;
            const loaded: string[] = [];

            // Helper: read an image file and push to referenceImages
            const addImage = (filePath: string, label: string) => {
                const buffer = fs.readFileSync(filePath);
                const ext = path.extname(filePath).toLowerCase().replace('.', '');
                const mime = ext === 'jpg' ? 'jpeg' : ext;
                this.referenceImages!.push({
                    label,
                    base64: `data:image/${mime};base64,${buffer.toString('base64')}`
                });
                loaded.push(path.relative(examplesDir, filePath));
            };

            // Helper: clean filename into readable label
            const cleanName = (name: string) =>
                path.basename(name, path.extname(name)).replace(/[-_.]/g, ' ').trim();

            // 1. Root-level images first (e.g. goinghome.png)
            const rootFiles = fs.readdirSync(examplesDir)
                .filter(f => imagePattern.test(f) && fs.statSync(path.join(examplesDir, f)).isFile())
                .sort();
            for (const file of rootFiles) {
                addImage(path.join(examplesDir, file), cleanName(file));
            }

            // 2. Subdirectories in sorted order (Posts/, Search/, Stories/)
            const subdirs = fs.readdirSync(examplesDir)
                .filter(f => fs.statSync(path.join(examplesDir, f)).isDirectory())
                .sort();
            for (const dir of subdirs) {
                const dirPath = path.join(examplesDir, dir);
                const files = fs.readdirSync(dirPath)
                    .filter(f => imagePattern.test(f))
                    .sort();
                for (const file of files) {
                    const label = `${dir} - ${cleanName(file)}`;
                    addImage(path.join(dirPath, file), label);
                }
            }

            if (this.referenceImages.length > 0) {
                console.log(`  📎 Loaded ${this.referenceImages.length} reference image(s): ${loaded.join(', ')}`);
                this.collector.appendLog(`📎 Loaded ${this.referenceImages.length} reference image(s): ${loaded.join(', ')}`);
            }
        } catch (err) {
            console.warn('  ⚠️ Failed to load reference images:', err);
            this.collector.appendLog(`⚠️ Failed to load reference images: ${err}`);
        }

        return this.referenceImages;
    }

    // -----------------------------------------------------------------------
    // Per-Turn User Prompt
    // -----------------------------------------------------------------------

    private buildUserPrompt(remainingMs: number): string {
        const elapsedSec = Math.round((Date.now() - this.startTime) / 1000);
        const elapsedMin = Math.round(elapsedSec / 60);
        const remainingMin = Math.round(remainingMs / 60000);

        const parts: string[] = [];

        parts.push(`SESSION: ${elapsedMin} min elapsed, ${remainingMin} min remaining. Use done when you've collected enough content across feed, stories, and searches.`);
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

        // Captured posts — persistent list so LLM knows what to skip
        if (this.capturedPosts.length > 0) {
            parts.push('\nCAPTURED POSTS (do not re-open these):');
            for (const post of this.capturedPosts) {
                const shortUrl = post.fingerprint || post.url.split('instagram.com')[1]?.slice(0, 40) || post.url;
                parts.push(`- ${shortUrl} (${post.source})`);
            }
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
            case 'capture': return d.x2 !== undefined ? `capture(${d.x},${d.y},${d.x2},${d.y2})` : 'capture';
            case 'type': return `type("${(d.text || '').slice(0, 20)}")`;
            case 'press': return `press(${d.key})`;
            case 'hover': return `hover(${d.x},${d.y})`;
            case 'wait': return `wait(${d.seconds || 2}s)`;
            case 'newtab': return `newtab(${d.x},${d.y})`;
            case 'closetab': return 'closetab';
            case 'done': return 'done';
            default: return d.action;
        }
    }

    // Public getters for InstagramScraper session summary
    getCaptureCount(): number { return this.captureCount; }
    getDecisionCount(): number { return this.decisionCount; }
    getActionHistory(): ActionHistoryEntry[] { return [...this.actionHistory]; }
}
