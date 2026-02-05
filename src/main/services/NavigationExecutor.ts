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

        try {
            switch (decision.action) {
                case 'click':
                    return await this.executeClick(decision, elements, startTime);
                case 'scroll':
                    return await this.executeScroll(decision, startTime);
                case 'type':
                    return await this.executeType(decision, startTime);
                case 'press':
                    return await this.executePress(decision, startTime);
                case 'wait':
                    return await this.executeWait(decision, startTime);
                case 'hover':
                    return await this.executeHover(decision, elements, startTime);
                case 'back':
                    return await this.executeBack(decision, startTime);
                case 'clear':
                    return await this.executeClear(decision, startTime);
                default:
                    return this.failureResult(
                        decision,
                        startTime,
                        `Unknown action: ${decision.action}`
                    );
            }
        } catch (error) {
            return this.failureResult(
                decision,
                startTime,
                error instanceof Error ? error.message : String(error)
            );
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

        // Pre-click name verification: if the LLM provided an expectedName,
        // verify it matches the element. If not, search by name instead.
        // This catches cases where the LLM outputs the wrong ID number.
        if (params.expectedName) {
            const expectedLower = params.expectedName.toLowerCase();
            const targetLower = target.name.toLowerCase();
            const nameMatches = targetLower.includes(expectedLower) || expectedLower.includes(targetLower);

            if (!nameMatches) {
                // ID-name mismatch! Try to find the correct element by name
                const byName = elements.find(e =>
                    e.name.toLowerCase().includes(expectedLower) ||
                    expectedLower.includes(e.name.toLowerCase())
                );
                if (byName) {
                    console.warn(`⚠️ Element ID mismatch: id:${params.id} is "${target.name}", but LLM expected "${params.expectedName}". Corrected to id:${byName.id} "${byName.name}"`);
                    target = byName;
                } else {
                    console.warn(`⚠️ Element ID mismatch: id:${params.id} is "${target.name}", LLM expected "${params.expectedName}". No name match found, using original ID.`);
                }
            }
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

        // Small delay after click for page to respond
        await this.humanDelay(200, 500);

        // Post-click verification
        const postClickUrl = this.page.url();
        const postClickState = await this.getQuickDOMSignature();

        let verified: 'url_changed' | 'dom_changed' | 'no_change_detected' = 'no_change_detected';
        if (preClickUrl !== postClickUrl) {
            verified = 'url_changed';
        } else if (preClickState !== postClickState) {
            verified = 'dom_changed';
        }

        // Record action with state context and clicked element name
        const record = this.recordAction(decision, true, undefined, {
            url: postClickUrl,
            verified,
            clickedElementName: target.name
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

        // Map high-level amount to proportional pixels based on viewport
        const viewportHeight = await this.page.evaluate(() => window.innerHeight).catch(() => 1920);
        const proportion = SCROLL_PROPORTIONS[params.amount] || SCROLL_PROPORTIONS.medium;
        const baseDistance = Math.round(viewportHeight * proportion);

        if (params.direction === 'left' || params.direction === 'right') {
            // Horizontal scroll using mouse wheel
            const deltaX = params.direction === 'right' ? baseDistance : -baseDistance;
            await this.page.mouse.wheel(deltaX, 0);
            await this.humanDelay(300, 600);
        } else {
            // Vertical scroll using HumanScroll
            const direction = params.direction === 'up' ? -1 : 1;
            await this.scroll.scroll({
                baseDistance: baseDistance * direction,
                variability: 0.3,
                readingPauseMs: [500, 1500]  // Shorter pause for navigation
            });
        }

        // Record action with scroll position for stagnation detection
        const scrollYAfter = await this.scroll.getScrollPosition();
        this.recordAction(decision, true, undefined, {
            scrollY: scrollYAfter,
            url: this.page.url()
        });

        return {
            success: true,
            actionTaken: 'scroll',
            params: params,
            resultingUrl: this.page.url(),
            durationMs: Date.now() - startTime
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

        // Pre-hover name verification (same as click verification)
        if (params.expectedName) {
            const expectedLower = params.expectedName.toLowerCase();
            const targetLower = target.name.toLowerCase();
            const nameMatches = targetLower.includes(expectedLower) || expectedLower.includes(targetLower);

            if (!nameMatches) {
                const byName = elements.find(e =>
                    e.name.toLowerCase().includes(expectedLower) ||
                    expectedLower.includes(e.name.toLowerCase())
                );
                if (byName) {
                    console.warn(`⚠️ Hover ID mismatch: id:${params.id} is "${target.name}", but LLM expected "${params.expectedName}". Corrected to id:${byName.id} "${byName.name}"`);
                    target = byName;
                }
            }
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

        // Delay for page to settle
        await this.humanDelay(500, 1000);

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
        stateContext?: { scrollY?: number; url?: string; verified?: string; elementCount?: number; clickedElementName?: string }
    ): ActionRecord {
        const record: ActionRecord = {
            timestamp: Date.now(),
            action: decision.action,
            params: decision.params,
            success,
            errorMessage,
            ...(stateContext || {})
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

        return { inLoop: false, severity: 'mild' };
    }

    /**
     * Get escalating recovery action based on loop severity.
     */
    getRecoveryAction(severity: 'mild' | 'moderate' | 'severe'): { action: string; key?: string; reason: string } {
        switch (severity) {
            case 'mild':
                return { action: 'press', key: 'Escape', reason: 'Close any overlay' };
            case 'moderate':
                return { action: 'back', reason: 'Navigate back to previous page' };
            case 'severe':
                return { action: 'navigate_home', reason: 'Return to feed - page is stuck' };
        }
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
