/**
 * VisionAgent - Set-of-Mark (SoM) Instagram Browsing Agent
 *
 * Vision-based loop with numbered element labels. Interactive elements are
 * detected via page.evaluate(), labeled on the screenshot server-side (Jimp),
 * and the LLM outputs an element number for click/hover/newtab actions.
 * Capture/record still uses x,y crop coordinates.
 *
 * Core loop: screenshot → label elements → LLM → action → repeat
 *
 * Stealth: all labeling is server-side on the screenshot buffer. No DOM
 * modifications, no injected scripts. GhostMouse handles all clicks.
 */

import { Page } from 'playwright';
import { Jimp } from 'jimp';
import fs from 'fs';
import path from 'path';
import { GhostMouse } from './GhostMouse.js';
import { HumanScroll } from './HumanScroll.js';
import { ScreenshotCollector } from './ScreenshotCollector.js';
import { ModelConfig } from '../../shared/modelConfig.js';
import type { CaptureSource } from '../../types/instagram.js';
import visionAgentPrompt from '../prompts/vision-agent.md';
import { labelElements, type LabeledElement } from '../../utils/elementLabeler.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** LLM response schema — the complete output format. */
interface VisionAction {
    thinking: string;
    action: 'click' | 'scroll' | 'type' | 'press' | 'hover' | 'capture' | /* 'record' | */ 'wait' | 'done' | 'newtab' | 'closetab';
    element?: number;  // Element label number for click/hover/newtab
    x?: number;        // Used for capture/record crop coordinates
    y?: number;
    x2?: number;       // Bottom-right x for capture crop region
    y2?: number;       // Bottom-right y for capture crop region
    direction?: 'up' | 'down';
    text?: string;
    key?: string;
    seconds?: number;
    memory?: string;
    phase?: 'posts' | 'search' | 'stories';
    source?: 'feed' | 'story' | 'carousel' | 'search';  // LLM declares content source on capture
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
    // recordCount: number;  // VIDEO RECORDING DISABLED
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
    // private recordCount: number = 0;  // VIDEO RECORDING DISABLED
    // private recordedVideoHashes: Set<string> = new Set();
    private startTime: number = 0;

    // Reference example images organized by phase folder (Posts, Search, Stories)
    private referenceImagesByPhase: Map<string, Array<{ label: string; base64: string }>> | null = null;
    private sentPhases: Set<string> = new Set();
    private lastDeclaredPhase: string = ''; // Set by LLM on first turn; empty = no phase yet

    // Tab management — tracks the original tab so closetab can return to it
    private originalPage: Page | null = null;

    // Current turn's labeled elements (for click/hover/newtab execution)
    private currentElements: Map<number, LabeledElement> = new Map();

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
            const rawScreenshot = await this.captureScreenshot();
            if (!rawScreenshot) {
                await this.delay(500);
                continue;
            }

            // 1b. Detect interactive elements and draw labels on screenshot
            const { buffer: screenshot, elements } = await labelElements(
                this.page, rawScreenshot,
                this.screenshotWidth, this.screenshotHeight,
                this.viewportWidth, this.viewportHeight
            );
            this.currentElements = elements;
            console.log(`  🏷️ Labeled ${elements.size} interactive elements`);

            // 2. Call LLM
            const decision = await this.callLLM(screenshot, remaining);
            this.decisionCount++;

            console.log(`  🧠 [${this.decisionCount}] action=${decision.action} | ${decision.thinking.slice(0, 80)}`);

            // 2b. Log full reasoning for element-based actions (click/hover/newtab)
            if (['click', 'hover', 'newtab'].includes(decision.action) && decision.element !== undefined) {
                const el = this.currentElements.get(decision.element);
                const desc = el ? `"${el.text || el.ariaLabel || el.tag}"` : 'unknown';
                const coordLog = `[${this.decisionCount}] ${decision.action}([${decision.element}] ${desc}) — ${decision.thinking}`;
                console.log(`  📍 ${coordLog}`);
                this.collector.appendLog(`📍 ${coordLog}`);
            }

            // 2c. Save debug screenshot with action overlay
            await this.saveDebugScreenshot(screenshot, decision);

            // 3. Handle "done" — LLM terminates session
            if (decision.action === 'done') {
                console.log(`✅ VisionAgent: LLM ended session — ${decision.thinking}`);
                this.collector.appendLog(`✅ LLM ended session — ${decision.thinking}`);
                break;
            }

            // 4. Persist memory scratchpad and phase declaration
            if (decision.memory) {
                this.lastMemory = decision.memory;
            }
            let phaseChangeDeferred = false;
            if (decision.phase) {
                const phaseMap: Record<string, string> = { posts: 'Posts', search: 'Search', stories: 'Stories' };
                const folder = phaseMap[decision.phase];
                if (folder && folder !== this.lastDeclaredPhase) {
                    if (this.lastDeclaredPhase) {
                        console.log(`  📂 Phase changed: ${this.lastDeclaredPhase} → ${folder}`);
                        this.collector.appendLog(`📂 Phase changed: ${this.lastDeclaredPhase} → ${folder}`);
                    } else {
                        console.log(`  📂 Starting phase: ${folder}`);
                        this.collector.appendLog(`📂 Starting phase: ${folder}`);
                    }
                    this.lastDeclaredPhase = folder;

                    // If reference images for the new phase haven't been sent yet,
                    // defer this turn's action so the LLM sees the images first
                    const allPhaseImages = this.loadReferenceImagesByPhase();
                    const hasUnsentImages = !this.sentPhases.has(folder) &&
                        (allPhaseImages.get(folder)?.length ?? 0) > 0;
                    if (hasUnsentImages) {
                        phaseChangeDeferred = true;
                        console.log(`  📎 Deferring action — loading ${folder} reference images first`);
                        this.collector.appendLog(`📎 Deferring action — loading ${folder} reference images first`);
                    }
                }
            }

            // 5. Execute action (or defer if phase just changed and images need loading)
            let result: string;
            if (phaseChangeDeferred) {
                result = `Phase changed to ${this.lastDeclaredPhase!.toLowerCase()}. Reference images loading — review them on the next turn and then act.`;
            } else {
                result = await this.executeAction(decision);
            }
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
            // recordCount: this.recordCount,  // VIDEO RECORDING DISABLED
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
            // case 'record': return this.executeRecord(decision);  // VIDEO RECORDING DISABLED
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
        if (d.element === undefined) return 'missing element number';
        const el = this.currentElements.get(d.element);
        if (!el) return `element [${d.element}] not found — pick a visible labeled element`;
        const cx = el.x + el.width / 2;
        const cy = el.y + el.height / 2;
        console.log(`  🖱️ click: element [${d.element}] "${el.text || el.ariaLabel}" → viewport(${Math.round(cx)},${Math.round(cy)}) | url=${this.page.url()}`);
        this.collector.appendLog(`🖱️ click: element [${d.element}] "${el.text || el.ariaLabel}" → viewport(${Math.round(cx)},${Math.round(cy)}) | url=${this.page.url()}`);
        await this.ghost.clickPoint(cx, cy);
        return `clicked [${d.element}] "${el.text || el.ariaLabel || el.tag}"`;
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
        const source = this.inferCaptureSource(d);

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
        console.log(`  📷 capture: source=${source}`);
        this.collector.appendLog(`📷 capture: source=${source}`);

        const captured = await this.collector.captureCurrentPost(
            source,
            undefined,
            clip
        );

        if (captured) {
            this.captureCount++;
            const cropInfo = clip ? ` [cropped ${Math.round(clip.width)}x${Math.round(clip.height)}]` : '';
            console.log(`  📷 ✅ captured #${this.captureCount} (source=${source})${cropInfo}`);
            this.collector.appendLog(`📷 ✅ captured #${this.captureCount} (source=${source})${cropInfo}`);
            return `captured #${this.captureCount} (source=${source})${cropInfo}`;
        }
        console.log(`  📷 ❌ capture rejected (duplicate)`);
        this.collector.appendLog(`📷 ❌ capture rejected (duplicate)`);
        return `capture rejected — duplicate content. Move on to the next post.`;
    }

    // VIDEO RECORDING DISABLED — executeRecord() commented out
    // private async executeRecord(d: VisionAction): Promise<string> { ... }

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
        if (d.element === undefined) return 'missing element number';
        const el = this.currentElements.get(d.element);
        if (!el) return `element [${d.element}] not found — pick a visible labeled element`;
        const cx = el.x + el.width / 2;
        const cy = el.y + el.height / 2;
        console.log(`  👆 hover: element [${d.element}] "${el.text || el.ariaLabel}" → viewport(${Math.round(cx)},${Math.round(cy)})`);
        this.collector.appendLog(`👆 hover: element [${d.element}] "${el.text || el.ariaLabel}" → viewport(${Math.round(cx)},${Math.round(cy)})`);
        await this.ghost.moveTo({ x: cx, y: cy });
        return `hovered [${d.element}] "${el.text || el.ariaLabel || el.tag}"`;
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
        if (d.element === undefined) return 'missing element number';
        const el = this.currentElements.get(d.element);
        if (!el) return `element [${d.element}] not found — pick a visible labeled element`;

        const context = this.page.context();
        const cx = el.x + el.width / 2;
        const cy = el.y + el.height / 2;

        console.log(`  🔗 newtab: element [${d.element}] "${el.text || el.ariaLabel}" → viewport(${Math.round(cx)},${Math.round(cy)}) | from=${this.page.url()}`);
        this.collector.appendLog(`🔗 newtab: element [${d.element}] "${el.text || el.ariaLabel}" → viewport(${Math.round(cx)},${Math.round(cy)}) | from=${this.page.url()}`);

        // Save the current page as the original if this is the first newtab
        if (!this.originalPage) {
            this.originalPage = this.page;
        }

        try {
            // Move mouse naturally to the target, then middle-click to open in new tab
            await this.ghost.moveTo({ x: cx, y: cy });

            // Listen for the new page event BEFORE clicking
            const newPagePromise = context.waitForEvent('page', { timeout: 5000 });
            await this.page.mouse.click(cx, cy, { button: 'middle' });

            const newPage = await newPagePromise;
            await newPage.waitForLoadState('domcontentloaded', { timeout: 8000 }).catch(() => {});

            this.switchToPage(newPage);
            console.log(`  🔗 newtab opened → ${newPage.url()}`);
            this.collector.appendLog(`🔗 newtab opened → ${newPage.url()}`);
            return `opened new tab → ${newPage.url()}. You are now in a NEW TAB. Use closetab when done to return.`;
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
    // Vision-Based Source Inference
    // -----------------------------------------------------------------------

    private inferCaptureSource(d: VisionAction): CaptureSource {
        // Primary: use LLM-declared source if provided
        if (d.source) return d.source;

        // Fallback: map from LLM-declared phase
        if (d.phase === 'stories') return 'story';
        if (d.phase === 'search') return 'search';

        // Check action history for carousel detection: last action was ArrowRight
        if (this.actionHistory.length > 0) {
            const last = this.actionHistory[this.actionHistory.length - 1];
            if (last.action === 'press(ArrowRight)') return 'carousel';
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
        const allPhaseImages = this.loadReferenceImagesByPhase();

        // Build messages array: system → (optional) phase reference images → current turn
        const messages: Array<Record<string, unknown>> = [
            { role: 'system', content: systemPrompt }
        ];

        // Inject reference images for the current phase (first time entering each phase)
        const phase = this.lastDeclaredPhase;
        if (phase && !this.sentPhases.has(phase)) {
            const refContent: Array<Record<string, unknown>> = [];

            // Include general images (e.g. goinghome.png) on the very first injection
            if (this.sentPhases.size === 0) {
                const generalImages = allPhaseImages.get('general') || [];
                for (const ref of generalImages) {
                    refContent.push({
                        type: 'image_url',
                        image_url: { url: ref.base64, detail: 'auto' }
                    });
                    refContent.push({
                        type: 'text',
                        text: `[Reference: ${ref.label}]`
                    });
                }
            }

            // Include this phase's images (numbered step-by-step workflow)
            const phaseImages = allPhaseImages.get(phase) || [];
            for (const ref of phaseImages) {
                refContent.push({
                    type: 'image_url',
                    image_url: { url: ref.base64, detail: 'auto' }
                });
                refContent.push({
                    type: 'text',
                    text: `[Step: ${ref.label}]`
                });
            }

            if (refContent.length > 0) {
                refContent.push({
                    type: 'text',
                    text: `These are step-by-step instructions for how to handle ${phase.toLowerCase()} on Instagram. The images are numbered — follow them in sequence. Read the annotations in each image carefully.`
                });
                messages.push({ role: 'user', content: refContent });
                messages.push({
                    role: 'assistant',
                    content: `Understood. I'll follow the ${phase.toLowerCase()} workflow steps shown above.`
                });
                console.log(`  📎 Injected ${phase} reference images (${phaseImages.length} images)`);
                this.collector.appendLog(`📎 Injected ${phase} reference images (${phaseImages.length} images)`);
            }
            this.sentPhases.add(phase);
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

        // Fallback: wait and let the LLM retry next iteration (no autonomous actions)
        console.warn('  ⚠️ LLM failed — waiting before retry');
        this.collector.appendLog('  ⚠️ LLM failed — waiting before retry');
        return { thinking: 'LLM error — waiting to retry', action: 'wait', seconds: 2 };
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
     * Load reference images from src/main/prompts/examples/, organized by folder.
     * Returns a Map: 'general' → root images, 'Posts' → Posts/, 'Search' → Search/, etc.
     * Images within each folder are sorted alphabetically (so numbered files stay in order).
     * Loaded once and cached for the session.
     */
    private loadReferenceImagesByPhase(): Map<string, Array<{ label: string; base64: string }>> {
        if (this.referenceImagesByPhase !== null) return this.referenceImagesByPhase;

        this.referenceImagesByPhase = new Map();
        const examplesDir = path.join(__dirname, '../../src/main/prompts/examples');

        try {
            if (!fs.existsSync(examplesDir)) return this.referenceImagesByPhase;

            const imagePattern = /\.(jpg|jpeg|png|webp)$/i;
            const loaded: string[] = [];

            const readImageBase64 = (filePath: string): string => {
                const buffer = fs.readFileSync(filePath);
                const ext = path.extname(filePath).toLowerCase().replace('.', '');
                const mime = ext === 'jpg' ? 'jpeg' : ext;
                return `data:image/${mime};base64,${buffer.toString('base64')}`;
            };

            const cleanName = (name: string) =>
                path.basename(name, path.extname(name)).replace(/[-_.]/g, ' ').trim();

            // Root-level images → 'general' group (e.g. goinghome.png)
            const rootFiles = fs.readdirSync(examplesDir)
                .filter(f => imagePattern.test(f) && fs.statSync(path.join(examplesDir, f)).isFile())
                .sort();
            if (rootFiles.length > 0) {
                const generalImages: Array<{ label: string; base64: string }> = [];
                for (const file of rootFiles) {
                    generalImages.push({ label: cleanName(file), base64: readImageBase64(path.join(examplesDir, file)) });
                    loaded.push(file);
                }
                this.referenceImagesByPhase.set('general', generalImages);
            }

            // Subdirectories → one group per folder name (Posts, Search, Stories)
            // Recurses one level deeper for sub-flows (e.g. Search/search.results/)
            const subdirs = fs.readdirSync(examplesDir)
                .filter(f => fs.statSync(path.join(examplesDir, f)).isDirectory())
                .sort();
            for (const dir of subdirs) {
                const dirPath = path.join(examplesDir, dir);
                const phaseImages: Array<{ label: string; base64: string }> = [];

                // Direct images in this phase folder
                const files = fs.readdirSync(dirPath)
                    .filter(f => imagePattern.test(f))
                    .sort();
                for (const file of files) {
                    phaseImages.push({ label: `${dir} - ${cleanName(file)}`, base64: readImageBase64(path.join(dirPath, file)) });
                    loaded.push(path.join(dir, file));
                }

                // Nested subdirectories (sub-flows, e.g. search.results/, search.account/)
                const nestedDirs = fs.readdirSync(dirPath)
                    .filter(f => fs.statSync(path.join(dirPath, f)).isDirectory())
                    .sort();
                for (const subdir of nestedDirs) {
                    const subdirPath = path.join(dirPath, subdir);
                    const nestedFiles = fs.readdirSync(subdirPath)
                        .filter(f => imagePattern.test(f))
                        .sort();
                    for (const file of nestedFiles) {
                        phaseImages.push({
                            label: `${dir} - ${cleanName(subdir)} - ${cleanName(file)}`,
                            base64: readImageBase64(path.join(subdirPath, file))
                        });
                        loaded.push(path.join(dir, subdir, file));
                    }
                }

                if (phaseImages.length > 0) {
                    this.referenceImagesByPhase.set(dir, phaseImages);
                }
            }

            if (loaded.length > 0) {
                const phases = [...this.referenceImagesByPhase.keys()].join(', ');
                console.log(`  📎 Loaded ${loaded.length} reference image(s) in phases [${phases}]`);
                this.collector.appendLog(`📎 Loaded ${loaded.length} reference image(s) in phases [${phases}]`);
            }
        } catch (err) {
            console.warn('  ⚠️ Failed to load reference images:', err);
            this.collector.appendLog(`⚠️ Failed to load reference images: ${err}`);
        }

        return this.referenceImagesByPhase;
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

        // Tab state — tell the LLM if it's in a secondary tab
        if (this.originalPage && this.page !== this.originalPage) {
            parts.push(`TAB: You are in a NEW TAB (opened via newtab). Use closetab to return to the main tab when done here. Do NOT navigate away — use closetab.`);
        }

        parts.push(`CAPTURES: ${this.captureCount} screenshots taken`);
        // VIDEO RECORDING DISABLED
        // if (this.recordCount > 0) {
        //     parts.push(`RECORDINGS: ${this.recordCount} videos recorded`);
        // }

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

        // Capture breakdown by source — LLM tracks details in memory scratchpad
        if (this.captureCount > 0) {
            const breakdown = this.collector.getSourceBreakdown();
            const breakdownParts: string[] = [];
            if (breakdown.feed > 0) breakdownParts.push(`${breakdown.feed} feed`);
            if (breakdown.story > 0) breakdownParts.push(`${breakdown.story} story`);
            if (breakdown.search > 0) breakdownParts.push(`${breakdown.search} search`);
            if (breakdown.carousel > 0) breakdownParts.push(`${breakdown.carousel} carousel`);
            parts.push(`CAPTURE BREAKDOWN: ${breakdownParts.join(', ')}`);
        }

        // Session memory digest (cross-session)
        if (this.config.sessionMemoryDigest) {
            parts.push(`\nSESSION CONTEXT:\n${this.config.sessionMemoryDigest}`);
        }

        // LLM's scratchpad from previous turn
        if (this.lastMemory) {
            parts.push(`\nYOUR NOTES (from last turn):\n${this.lastMemory}`);
        }

        // Text list of labeled elements (cross-reference with visual labels on screenshot)
        if (this.currentElements.size > 0) {
            parts.push('\nLABELED ELEMENTS:');
            for (const [id, el] of this.currentElements) {
                const desc = el.text || el.ariaLabel || '';
                const descStr = desc ? ` "${desc.slice(0, 50)}"` : '';
                parts.push(`[${id}] ${el.tag}${descStr}${el.href ? ' → ' + el.href.slice(0, 40) : ''}`);
            }
        }

        parts.push('\nWhat do you do next?');

        return parts.join('\n');
    }

    // -----------------------------------------------------------------------
    // Debug Screenshot Saving
    // -----------------------------------------------------------------------

    /**
     * Save the screenshot the LLM saw with action overlay drawn on it.
     * For click/hover/newtab: draws a red crosshair at the element's center in screenshot space.
     * For capture/record: draws a red rectangle for the crop region.
     * Saved to nav/ subdirectory within the session folder.
     */
    private async saveDebugScreenshot(screenshot: Buffer, decision: VisionAction): Promise<void> {
        const outputDir = this.collector.getNavDir();
        if (!outputDir) return;

        try {
            const image = await Jimp.read(Buffer.from(screenshot));
            const RED = 0xFF0000FF;

            // Draw crosshair at element center for click/hover/newtab
            if (['click', 'hover', 'newtab'].includes(decision.action) && decision.element !== undefined) {
                const el = this.currentElements.get(decision.element);
                if (el) {
                    // Convert element center from viewport to screenshot space
                    const scaleX = this.screenshotWidth / this.viewportWidth;
                    const scaleY = this.screenshotHeight / this.viewportHeight;
                    const cx = Math.round((el.x + el.width / 2) * scaleX);
                    const cy = Math.round((el.y + el.height / 2) * scaleY);
                    const armLen = 15;
                    const thickness = 3;

                    // Horizontal arm
                    for (let dx = -armLen; dx <= armLen; dx++) {
                        for (let dt = -Math.floor(thickness / 2); dt <= Math.floor(thickness / 2); dt++) {
                            const px = cx + dx;
                            const py = cy + dt;
                            if (px >= 0 && px < image.width && py >= 0 && py < image.height) {
                                image.setPixelColor(RED, px, py);
                            }
                        }
                    }
                    // Vertical arm
                    for (let dy = -armLen; dy <= armLen; dy++) {
                        for (let dt = -Math.floor(thickness / 2); dt <= Math.floor(thickness / 2); dt++) {
                            const px = cx + dt;
                            const py = cy + dy;
                            if (px >= 0 && px < image.width && py >= 0 && py < image.height) {
                                image.setPixelColor(RED, px, py);
                            }
                        }
                    }
                }
            }

            // Draw rectangle for capture/record crop region (still coordinate-based)
            if (decision.x2 !== undefined && decision.y2 !== undefined &&
                decision.x !== undefined && decision.y !== undefined &&
                (decision.action === 'capture' /* || decision.action === 'record' */)) {
                const x1 = Math.round(decision.x);
                const y1 = Math.round(decision.y);
                const x2 = Math.round(decision.x2);
                const y2 = Math.round(decision.y2);
                const thickness = 2;

                // Top and bottom edges
                for (let x = x1; x <= x2; x++) {
                    for (let dt = 0; dt < thickness; dt++) {
                        if (x >= 0 && x < image.width) {
                            if (y1 + dt >= 0 && y1 + dt < image.height) image.setPixelColor(RED, x, y1 + dt);
                            if (y2 - dt >= 0 && y2 - dt < image.height) image.setPixelColor(RED, x, y2 - dt);
                        }
                    }
                }
                // Left and right edges
                for (let y = y1; y <= y2; y++) {
                    for (let dt = 0; dt < thickness; dt++) {
                        if (y >= 0 && y < image.height) {
                            if (x1 + dt >= 0 && x1 + dt < image.width) image.setPixelColor(RED, x1 + dt, y);
                            if (x2 - dt >= 0 && x2 - dt < image.width) image.setPixelColor(RED, x2 - dt, y);
                        }
                    }
                }
            }

            const buffer = await image.getBuffer('image/jpeg', { quality: 85 });
            const filename = `turn_${String(this.decisionCount).padStart(3, '0')}_${decision.action}.jpg`;
            fs.writeFileSync(path.join(outputDir, filename), buffer);
        } catch (err) {
            // Non-critical — don't break the main loop
            console.warn(`  ⚠️ Debug screenshot save failed:`, err);
        }
    }

    // -----------------------------------------------------------------------
    // Utilities
    // -----------------------------------------------------------------------

    private delay(ms: number): Promise<void> {
        return new Promise(r => setTimeout(r, ms));
    }


    private formatAction(d: VisionAction): string {
        switch (d.action) {
            case 'click': return `click([${d.element}])`;
            case 'scroll': return `scroll(${d.direction || 'down'})`;
            case 'capture': return d.x2 !== undefined ? `capture(${d.x},${d.y},${d.x2},${d.y2})` : 'capture';
            // case 'record': return `record(${d.x},${d.y},${d.x2},${d.y2},${d.seconds || 10}s)`;  // VIDEO RECORDING DISABLED
            case 'type': return `type("${(d.text || '').slice(0, 20)}")`;
            case 'press': return `press(${d.key})`;
            case 'hover': return `hover([${d.element}])`;
            case 'wait': return `wait(${d.seconds || 2}s)`;
            case 'newtab': return `newtab([${d.element}])`;
            case 'closetab': return 'closetab';
            case 'done': return 'done';
            default: return d.action;
        }
    }

    // Public getters for InstagramScraper session summary
    getCaptureCount(): number { return this.captureCount; }
    // getRecordCount(): number { return this.recordCount; }  // VIDEO RECORDING DISABLED
    getRecordCount(): number { return 0; }
    getDecisionCount(): number { return this.decisionCount; }
    getActionHistory(): ActionHistoryEntry[] { return [...this.actionHistory]; }
}
