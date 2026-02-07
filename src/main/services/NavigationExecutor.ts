/**
 * NavigationExecutor - Translates LLM Decisions to Physical Actions
 *
 * Takes navigation decisions from NavigationLLM and executes them using:
 * - GhostMouse for human-like mouse movements and clicks
 * - HumanScroll for human-like scrolling
 * - Playwright keyboard for key presses
 *
 * Also handles:
 * - Gaze anchor simulation (look before clicking)
 * - Action history tracking
 * - Error handling and retries
 *
 * Cost: $0 (uses physics simulation, no API calls)
 */

import { Page } from 'playwright';
import {
    NavigationDecision,
    NavigationElement,
    ExecutionResult,
    ActionRecord,
    ScrollResult,
    ClickParams,
    ScrollParams,
    TypeParams,
    PressParams,
    WaitParams,
    HoverParams,
    BackParams,
    ClearParams,
    StrategicDecision
} from '../../types/navigation.js';
import { ScrollConfig } from '../../types/instagram.js';

import { GhostMouse } from './GhostMouse.js';
import { HumanScroll } from './HumanScroll.js';
import type { A11yNavigator } from './A11yNavigator.js';

/**
 * Scroll amount proportions (fraction of viewport height).
 * LLM speaks in high-level terms; we scale to actual viewport.
 */
const SCROLL_PROPORTIONS: Record<string, number> = {
    small: 0.15,   // 15% of viewport
    medium: 0.40,  // 40% of viewport
    large: 0.70,   // 70% of viewport
    xlarge: 1.20   // 120% of viewport
};

/**
 * Linger duration mapping (LLM controls pacing).
 */
const LINGER_DURATIONS: Record<string, number> = {
    short: 1000,    // 1 second - for navigation, skipping
    medium: 3000,   // 3 seconds - normal engagement
    long: 6000,     // 6 seconds - deep engagement, videos
    xlong: 12000    // 12 seconds - very deep engagement
};

export class NavigationExecutor {
    private page: Page;
    private ghost: GhostMouse;
    private scroll: HumanScroll;
    private navigator: A11yNavigator;

    // Action history for loop detection
    private actionHistory: ActionRecord[] = [];
    private maxHistorySize: number = 50;

    // Session-level timing randomization
    private sessionDelayMultiplier: number;

    constructor(
        page: Page,
        ghost: GhostMouse,
        scroll: HumanScroll,
        navigator: A11yNavigator
    ) {
        this.page = page;
        this.ghost = ghost;
        this.scroll = scroll;
        this.navigator = navigator;

        // Vary action delays by ±25% per session
        this.sessionDelayMultiplier = 0.75 + Math.random() * 0.5;
    }

    /**
     * Execute a navigation decision.
     *
     * @param decision - The LLM's navigation decision
     * @param elements - Current visible elements (for click target lookup)
     * @returns Execution result with success status and details
     */
    async execute(
        decision: NavigationDecision,
        elements: NavigationElement[]
    ): Promise<ExecutionResult> {
        const startTime = Date.now();
        // Propagate rewrite note from validation (transient field set by validateDecision)
        const rewriteNote: string | undefined = (decision as any)._rewriteNote;

        try {
            let result: ExecutionResult;
            switch (decision.action) {
                case 'click':
                    result = await this.executeClick(decision, elements, startTime);
                    break;
                case 'scroll':
                    result = await this.executeScroll(decision, startTime);
                    break;
                case 'capture':
                    result = await this.executeCapture(decision, startTime);
                    break;
                case 'type':
                    result = await this.executeType(decision, startTime);
                    break;
                case 'press':
                    result = await this.executePress(decision, startTime);
                    break;
                case 'wait':
                    result = await this.executeWait(decision, startTime);
                    break;
                case 'hover':
                    result = await this.executeHover(decision, elements, startTime);
                    break;
                case 'back':
                    result = await this.executeBack(decision, startTime);
                    break;
                case 'clear':
                    result = await this.executeClear(decision, startTime);
                    break;
                default:
                    result = this.failureResult(
                        decision,
                        startTime,
                        `Unknown action: ${decision.action}`
                    );
            }
            if (rewriteNote) result.rewriteNote = rewriteNote;
            return result;
        } catch (error) {
            const result = this.failureResult(
                decision,
                startTime,
                error instanceof Error ? error.message : String(error)
            );
            if (rewriteNote) result.rewriteNote = rewriteNote;
            return result;
        }
    }

    /**
     * Execute a click action with optional gaze anchors.
     * Returns the clicked element info for potential capture.
     * Includes post-click verification to detect if click caused a state change.
     */
    private async executeClick(
        decision: NavigationDecision,
        elements: NavigationElement[],
        startTime: number
    ): Promise<ExecutionResult> {
        const params = decision.params as ClickParams;

        // Find the target element by ID
        let target = elements.find(e => e.id === params.id);
        if (!target) {
            return this.failureResult(decision, startTime, `Element id=${params.id} not found`);
        }

        // Get the bounding box
        const boundingBox = target.boundingBox;
        if (!boundingBox) {
            return this.failureResult(decision, startTime, `Element id=${params.id} has no bounding box`);
        }

        // Capture pre-click state for verification
        const preClickUrl = this.page.url();
        const preClickState = await this.getQuickDOMSignature();

        // Click the element
        await this.ghost.clickElement(boundingBox);

        // Poll for state change — Instagram SPA can take 500-2000ms to navigate/render overlays
        let verified: 'url_changed' | 'dom_changed' | 'no_change_detected' = 'no_change_detected';
        let postClickUrl = preClickUrl;
        for (let attempt = 0; attempt < 5; attempt++) {
            await this.humanDelay(200, 400);
            postClickUrl = this.page.url();
            if (preClickUrl !== postClickUrl) {
                verified = 'url_changed';
                break;
            }
            const postClickState = await this.getQuickDOMSignature();
            if (preClickState !== postClickState) {
                verified = 'dom_changed';
                break;
            }
        }

        // Retry once for link elements — Instagram SPA may not have hydrated event handlers yet
        let autoRetried = false;
        if (verified === 'no_change_detected' && target.role === 'link') {
            console.log(`  🔄 Link click no_change_detected — retrying after hydration delay (id:${target.id} "${target.name}")`);
            autoRetried = true;
            await this.humanDelay(1200, 1800);
            await this.ghost.clickElement(boundingBox);

            for (let attempt = 0; attempt < 5; attempt++) {
                await this.humanDelay(300, 500);
                postClickUrl = this.page.url();
                if (preClickUrl !== postClickUrl) {
                    verified = 'url_changed';
                    break;
                }
                const postClickState = await this.getQuickDOMSignature();
                if (preClickState !== postClickState) {
                    verified = 'dom_changed';
                    break;
                }
            }
        }

        // After URL-changing clicks (like Instagram logo → feed), wait for SPA hydration
        // so the next click finds interactive elements. Same treatment as executeBack().
        if (verified === 'url_changed') {
            await this.page.waitForLoadState('networkidle', { timeout: 3000 }).catch(() => {});
            await this.humanDelay(800, 1200);
            console.log(`  ⏳ Post-navigation hydration wait (url_changed)`);
        }

        // Invalidate tree cache if click caused a state change (page structure is now different)
        if (verified !== 'no_change_detected') {
            this.navigator.invalidateTreeCache();
        }

        // Record action with state context and clicked element name
        const retryNote = autoRetried
            ? `Infrastructure auto-retried this link click after hydration delay. First click had no effect.`
            : undefined;
        const record = this.recordAction(decision, true, undefined, {
            url: postClickUrl,
            verified,
            clickedElementName: target.name,
            rewriteNote: retryNote
        });

        return {
            success: true,
            actionTaken: 'click',
            params: params,
            resultingUrl: postClickUrl,
            durationMs: Date.now() - startTime,
            // Return the clicked element info for capture
            focusedElement: {
                id: target.id,
                boundingBox: boundingBox,
                name: target.name
            },
            verified
        };
    }

    /**
     * Execute a scroll action.
     */
    private async executeScroll(
        decision: NavigationDecision,
        startTime: number
    ): Promise<ExecutionResult> {
        const params = decision.params as ScrollParams;

        // Horizontal scroll: use HumanScroll for easing, micro-adjust, reading pause
        if (params.direction === 'left' || params.direction === 'right') {
            const vw = await this.page.evaluate(() => window.innerWidth).catch(() => 1080);
            const proportion = SCROLL_PROPORTIONS[params.amount] || SCROLL_PROPORTIONS.medium;
            const baseDistance = params.direction === 'right'
                ? Math.round(vw * proportion)
                : -Math.round(vw * proportion);

            const intentResult = await this.scroll.scrollHorizontalWithIntent({ baseDistance });

            const scrollResultData: ScrollResult = {
                contentType: intentResult.contentType,
                requestedDirection: params.direction,
                requestedAmount: params.amount,
                actualDeltaPx: intentResult.actualDelta,
                scrollFailed: intentResult.scrollFailed,
                pauseDurationMs: intentResult.pauseDurationMs,
                newElementsAppeared: 0,
                elementsDisappeared: 0,
                newArticles: 0,
            };

            const scrollYAfter = await this.scroll.getScrollPosition();
            this.recordAction(decision, true, undefined, {
                scrollY: scrollYAfter,
                url: this.page.url(),
                scrollResult: scrollResultData
            });

            return {
                success: true,
                actionTaken: 'scroll',
                params: params,
                resultingUrl: this.page.url(),
                durationMs: Date.now() - startTime,
                scrollResult: scrollResultData
            };
        }

        // --- Vertical scroll: use content-aware scrollWithIntent ---

        // Pre-scroll element snapshot (reuses cached tree from earlier in loop iteration)
        const preSnapshot = await this.getQuickElementSnapshot();

        // Build config overrides based on LLM amount hint or pixelAmount
        const overrides: Partial<ScrollConfig> = {};
        if (params.pixelAmount !== undefined) {
            // Exact pixel control — still goes through HumanScroll for easing
            overrides.baseDistance = params.direction === 'up'
                ? -Math.abs(params.pixelAmount)
                : Math.abs(params.pixelAmount);
        } else if (params.amount !== 'medium') {
            const vh = await this.page.evaluate(() => window.innerHeight).catch(() => 1920);
            const proportion = SCROLL_PROPORTIONS[params.amount] || SCROLL_PROPORTIONS.medium;
            overrides.baseDistance = Math.round(vh * proportion);
        }
        // For 'medium' with no pixelAmount, pass no overrides — scrollWithIntent picks distance from content density

        // Handle direction: negate baseDistance for upward scrolls (only if not already handled by pixelAmount)
        if (params.direction === 'up' && params.pixelAmount === undefined) {
            if (overrides.baseDistance) {
                overrides.baseDistance = -overrides.baseDistance;
            } else {
                // scrollWithIntent defaults to downward — for upward with no override, set explicit negative
                const vh = await this.page.evaluate(() => window.innerHeight).catch(() => 1920);
                overrides.baseDistance = -Math.round(vh * 0.4);
            }
        }

        // Execute content-aware scroll (adapts distance + pause to content density)
        const intentResult = await this.scroll.scrollWithIntent(overrides);

        // Post-scroll element snapshot (fresh tree build — cache expired during scroll pause)
        const postSnapshot = await this.getQuickElementSnapshot();

        // Compute element diff
        const newInteractive = [...postSnapshot.interactive].filter(([id]) => !preSnapshot.interactive.has(id));
        const disappeared = [...preSnapshot.interactive].filter(([id]) => !postSnapshot.interactive.has(id));
        const meaningfulNew = newInteractive.filter(([, name]) => name.length > 0).length;
        const newArticles = Math.max(0, postSnapshot.articleCount - preSnapshot.articleCount);

        // Record action with scroll position and scroll result for stagnation detection
        const scrollYAfter = await this.scroll.getScrollPosition();

        // Get page height info for LLM awareness
        const viewportInfo = await this.scroll.getViewportInfo();
        const isNearBottom = await this.scroll.isNearBottom();

        const scrollResultData: ScrollResult = {
            contentType: intentResult.contentType,
            requestedDirection: params.direction,
            requestedAmount: params.amount,
            actualDeltaPx: intentResult.actualDelta,
            scrollFailed: intentResult.scrollFailed,
            pauseDurationMs: intentResult.pauseDurationMs,
            newElementsAppeared: meaningfulNew,
            elementsDisappeared: disappeared.length,
            newArticles,
            pageHeightPx: viewportInfo.scrollHeight,
            scrollPositionPx: scrollYAfter,
            isNearBottom
        };
        this.recordAction(decision, true, undefined, {
            scrollY: scrollYAfter,
            url: this.page.url(),
            scrollResult: scrollResultData
        });

        return {
            success: true,
            actionTaken: 'scroll',
            params: params,
            resultingUrl: this.page.url(),
            durationMs: Date.now() - startTime,
            scrollResult: scrollResultData
        };
    }

    /**
     * Quick snapshot of visible elements for scroll diff computation.
     * Returns interactive elements (from getNavigationElements) plus article count from the raw tree.
     */
    private async getQuickElementSnapshot(): Promise<{ interactive: Map<number, string>; articleCount: number }> {
        const elements = await this.navigator.getNavigationElements();
        // Count articles from the cached tree (flat nodeMap, NOT nested children)
        const tree = await this.navigator.getCachedTree();
        let articleCount = 0;
        if (tree) {
            for (const node of tree.nodeMap.values()) {
                if (node.ignored) continue;
                if ((node.role?.value?.toLowerCase() || '') === 'article') articleCount++;
            }
        }
        return {
            interactive: new Map(elements.map(e => [e.id, e.name || ''])),
            articleCount
        };
    }

    /**
     * Execute a type action.
     */
    private async executeType(
        decision: NavigationDecision,
        startTime: number
    ): Promise<ExecutionResult> {
        const params = decision.params as TypeParams;

        // Pre-type check: verify a text input is actually focused
        const focusedInput = await this.page.evaluate(() => {
            const el = document.activeElement;
            if (!el) return null;
            const tag = el.tagName.toLowerCase();
            const role = el.getAttribute('role');
            const isEditable = el.getAttribute('contenteditable') === 'true';
            const isInput = tag === 'input' || tag === 'textarea' || role === 'textbox' || role === 'searchbox' || role === 'combobox' || isEditable;
            return isInput ? (el.getAttribute('aria-label') || el.getAttribute('placeholder') || tag) : null;
        }).catch(() => null);

        if (!focusedInput) {
            console.warn(`⚠️ Type action failed: no text input is focused. Text "${params.text}" would go nowhere.`);
            this.recordAction(decision, false, 'No text input focused', { url: this.page.url(), verified: 'no_change_detected' });
            return {
                success: false,
                actionTaken: 'type',
                params: params,
                errorMessage: 'No text input focused — click a search/text field first',
                resultingUrl: this.page.url(),
                durationMs: Date.now() - startTime,
                verified: 'no_change_detected'
            };
        }

        // Pre-type state for verification
        const preTypeState = await this.getQuickDOMSignature();

        // Type with human-like delays between characters
        for (const char of params.text) {
            await this.page.keyboard.type(char);
            // Human typing speed: 100-250ms between characters
            await this.humanDelay(50, 150);
        }

        // Small pause after typing
        await this.humanDelay(300, 600);

        // Post-type verification: check if DOM changed (indicates text landed in an input)
        const postTypeState = await this.getQuickDOMSignature();
        const verified: 'dom_changed' | 'no_change_detected' =
            preTypeState !== postTypeState ? 'dom_changed' : 'no_change_detected';

        // Record action with verification
        this.recordAction(decision, true, undefined, { url: this.page.url(), verified });

        return {
            success: true,
            actionTaken: 'type',
            params: params,
            resultingUrl: this.page.url(),
            durationMs: Date.now() - startTime,
            verified
        };
    }

    /**
     * Execute a key press action.
     */
    private async executePress(
        decision: NavigationDecision,
        startTime: number
    ): Promise<ExecutionResult> {
        const params = decision.params as PressParams;

        await this.page.keyboard.press(params.key);

        // Small delay after key press
        await this.humanDelay(200, 400);

        // Record action
        this.recordAction(decision, true, undefined, { url: this.page.url() });

        return {
            success: true,
            actionTaken: 'press',
            params: params,
            resultingUrl: this.page.url(),
            durationMs: Date.now() - startTime
        };
    }

    /**
     * Execute a wait action.
     */
    private async executeWait(
        decision: NavigationDecision,
        startTime: number
    ): Promise<ExecutionResult> {
        const params = decision.params as WaitParams;

        // Wait the specified time with some variance
        const waitMs = params.seconds * 1000 * this.sessionDelayMultiplier;
        await new Promise(resolve => setTimeout(resolve, waitMs));

        // Record action
        this.recordAction(decision, true, undefined, { url: this.page.url() });

        return {
            success: true,
            actionTaken: 'wait',
            params: params,
            resultingUrl: this.page.url(),
            durationMs: Date.now() - startTime
        };
    }

    /**
     * Execute a hover action using GhostMouse.
     */
    private async executeHover(
        decision: NavigationDecision,
        elements: NavigationElement[],
        startTime: number
    ): Promise<ExecutionResult> {
        const params = decision.params as HoverParams;

        // Find the target element by ID
        let target = elements.find(e => e.id === params.id);
        if (!target) {
            return this.failureResult(decision, startTime, `Element id=${params.id} not found`);
        }

        const boundingBox = target.boundingBox;
        if (!boundingBox) {
            return this.failureResult(decision, startTime, `Element id=${params.id} has no bounding box`);
        }

        // Hover using GhostMouse (human-like with micro-movements)
        await this.ghost.hoverElement(boundingBox);

        // Record action with hovered element name
        this.recordAction(decision, true, undefined, { url: this.page.url(), clickedElementName: target.name });

        return {
            success: true,
            actionTaken: 'hover',
            params: params,
            resultingUrl: this.page.url(),
            durationMs: Date.now() - startTime,
            focusedElement: {
                id: target.id,
                boundingBox: boundingBox,
                name: target.name
            }
        };
    }

    /**
     * Execute a browser back navigation.
     */
    private async executeBack(
        decision: NavigationDecision,
        startTime: number
    ): Promise<ExecutionResult> {
        await this.page.goBack({ waitUntil: 'domcontentloaded' });

        // Wait for Instagram SPA to re-render — 'networkidle' catches React hydration
        // (no network requests for 500ms = React finished re-rendering)
        await this.page.waitForLoadState('networkidle', { timeout: 3000 }).catch(() => {});
        await this.humanDelay(800, 1500);

        // Invalidate tree cache — page structure changed fundamentally after back()
        this.navigator.invalidateTreeCache();

        // Record action
        this.recordAction(decision, true, undefined, { url: this.page.url() });

        return {
            success: true,
            actionTaken: 'back',
            params: {} as BackParams,
            resultingUrl: this.page.url(),
            durationMs: Date.now() - startTime
        };
    }

    /**
     * Execute a clear action (select all + delete on currently focused input).
     */
    private async executeClear(
        decision: NavigationDecision,
        startTime: number
    ): Promise<ExecutionResult> {
        // Use platform-appropriate select-all (Meta+A on Mac, Control+A elsewhere)
        const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
        await this.page.keyboard.press(`${modifier}+a`);
        await this.humanDelay(50, 150);
        await this.page.keyboard.press('Backspace');

        // Small delay after clearing
        await this.humanDelay(200, 400);

        // Record action
        this.recordAction(decision, true, undefined, { url: this.page.url() });

        return {
            success: true,
            actionTaken: 'clear',
            params: {} as ClearParams,
            resultingUrl: this.page.url(),
            durationMs: Date.now() - startTime
        };
    }

    /**
     * Execute a capture action.
     * The actual screenshot logic lives in InstagramScraper.runNavigationLoop()
     * which checks the action type after execution. The executor just records it.
     */
    private async executeCapture(
        decision: NavigationDecision,
        startTime: number
    ): Promise<ExecutionResult> {
        this.recordAction(decision, true);
        return {
            success: true,
            actionTaken: 'capture',
            params: decision.params,
            durationMs: Date.now() - startTime,
        };
    }

    /**
     * Create a failure result.
     */
    private failureResult(
        decision: NavigationDecision,
        startTime: number,
        errorMessage: string
    ): ExecutionResult {
        // Record failed action
        this.recordAction(decision, false, errorMessage);

        return {
            success: false,
            actionTaken: decision.action,
            params: decision.params,
            errorMessage,
            durationMs: Date.now() - startTime
        };
    }

    /**
     * Record an action to history with optional state context.
     */
    private recordAction(
        decision: NavigationDecision,
        success: boolean,
        errorMessage?: string,
        stateContext?: { scrollY?: number; url?: string; verified?: ActionRecord['verified']; elementCount?: number; clickedElementName?: string; scrollResult?: ScrollResult; rewriteNote?: string }
    ): ActionRecord {
        const rewriteNote = stateContext?.rewriteNote || (decision as any)._rewriteNote;
        const record: ActionRecord = {
            timestamp: Date.now(),
            action: decision.action,
            params: decision.params,
            success,
            errorMessage,
            ...(stateContext || {}),
            ...(rewriteNote ? { rewriteNote } : {})
        };

        this.actionHistory.push(record);

        // Trim history if too long
        if (this.actionHistory.length > this.maxHistorySize) {
            this.actionHistory = this.actionHistory.slice(-this.maxHistorySize);
        }

        return record;
    }

    /**
     * Get recent action history.
     */
    getRecentActions(count: number = 10): ActionRecord[] {
        return this.actionHistory.slice(-count);
    }

    /**
     * Check if we're in a loop (repeating same actions).
     * Returns severity level for escalating recovery.
     */
    isInLoop(lookback: number = 6): { inLoop: boolean; severity: 'mild' | 'moderate' | 'severe' } {
        if (this.actionHistory.length < lookback) return { inLoop: false, severity: 'mild' };

        const recent = this.actionHistory.slice(-lookback);

        // Check 1: Scroll position stagnation (most critical - page isn't moving)
        const scrollActions = recent.filter(a => a.action === 'scroll' && a.scrollY !== undefined);
        if (scrollActions.length >= 3) {
            const positions = scrollActions.map(a => a.scrollY!);
            const allSamePosition = positions.every(p => p === positions[0]);
            if (allSamePosition) return { inLoop: true, severity: 'severe' };
        }

        // Check 2: Repeated no-change actions (clicking/acting with no effect)
        const noChangeActions = recent.filter(a => a.verified === 'no_change_detected');
        if (noChangeActions.length >= 4) return { inLoop: true, severity: 'moderate' };

        // Check 3: All same action type with high failure rate
        const allSameAction = recent.every(a => a.action === recent[0].action);
        if (allSameAction && recent[0].action !== 'scroll') {
            const failureRate = recent.filter(a => !a.success).length / recent.length;
            if (failureRate > 0.5) return { inLoop: true, severity: 'moderate' };
        }

        // Check 4: Repeated click failures
        const clickFailures = recent.filter(a => a.action === 'click' && !a.success);
        if (clickFailures.length >= 3) return { inLoop: true, severity: 'moderate' };

        // Check 5: Repeated wait actions on same URL (capture loop — LLM stuck waiting for captures that won't happen)
        const recentWaits = recent.filter(a => a.action === 'wait');
        if (recentWaits.length >= 3) {
            const urls = recentWaits.map(a => a.url).filter(Boolean);
            if (urls.length >= 3 && urls.every(u => u === urls[0])) {
                return { inLoop: true, severity: 'moderate' };
            }
        }

        return { inLoop: false, severity: 'mild' };
    }

    /**
     * Human-like delay with session variance.
     */
    private humanDelay(minMs: number, maxMs: number): Promise<void> {
        const baseDelay = minMs + Math.random() * (maxMs - minMs);
        const adjustedDelay = baseDelay * this.sessionDelayMultiplier;
        return new Promise(resolve => setTimeout(resolve, adjustedDelay));
    }

    /**
     * Get a quick DOM state signature for click verification.
     * Captures lightweight signals: dialog count, article count, and scroll position.
     * Cost: ~1-2ms (single evaluate call)
     */
    private async getQuickDOMSignature(): Promise<string> {
        try {
            return await this.page.evaluate(() => {
                const dialogs = document.querySelectorAll('[role="dialog"]').length;
                const articles = document.querySelectorAll('article').length;
                const scrollY = Math.round(window.scrollY / (window.innerHeight * 0.05));
                return `d${dialogs}:a${articles}:s${scrollY}`;
            });
        } catch {
            return 'unknown';
        }
    }

    /**
     * Execute linger duration from strategic decision.
     * This is the LLM-controlled pacing mechanism.
     *
     * @param strategic - The strategic decision containing linger duration
     */
    async executeLinger(strategic?: StrategicDecision): Promise<void> {
        if (!strategic?.lingerDuration) {
            return;  // No linger requested
        }

        const baseDuration = LINGER_DURATIONS[strategic.lingerDuration] || LINGER_DURATIONS.medium;
        // Add session variance (±25%)
        const duration = baseDuration * this.sessionDelayMultiplier;

        console.log(`  ⏱️ Lingering for ${(duration / 1000).toFixed(1)}s (${strategic.lingerDuration})`);

        await new Promise(resolve => setTimeout(resolve, duration));
    }

}
