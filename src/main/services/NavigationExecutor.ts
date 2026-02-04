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
import { BoundingBox, Point, ContentState } from '../../types/instagram.js';
import { GhostMouse } from './GhostMouse.js';
import { HumanScroll } from './HumanScroll.js';
import type { A11yNavigator } from './A11yNavigator.js';

/**
 * Scroll amount mapping (LLM speaks in high-level terms).
 */
const SCROLL_AMOUNTS: Record<string, number> = {
    small: 200,
    medium: 500,
    large: 800
};

/**
 * Linger duration mapping (LLM controls pacing).
 */
const LINGER_DURATIONS: Record<string, number> = {
    short: 1000,    // 1 second - for navigation, skipping
    medium: 3000,   // 3 seconds - normal engagement
    long: 6000      // 6 seconds - deep engagement, videos
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
     */
    private async executeClick(
        decision: NavigationDecision,
        elements: NavigationElement[],
        startTime: number
    ): Promise<ExecutionResult> {
        const params = decision.params as ClickParams;

        // Find the target element
        const target = elements.find(e => e.id === params.id);
        if (!target) {
            return this.failureResult(decision, startTime, `Element id=${params.id} not found`);
        }

        // Get the bounding box
        const boundingBox = target.boundingBox;
        if (!boundingBox) {
            return this.failureResult(decision, startTime, `Element id=${params.id} has no bounding box`);
        }

        // Click the element
        await this.ghost.clickElement(boundingBox);

        // Small delay after click for page to respond
        await this.humanDelay(200, 500);

        // Record action
        const record = this.recordAction(decision, true);

        return {
            success: true,
            actionTaken: 'click',
            params: params,
            resultingUrl: this.page.url(),
            durationMs: Date.now() - startTime,
            // Return the clicked element info for capture
            focusedElement: {
                id: target.id,
                boundingBox: boundingBox,
                name: target.name
            }
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

        // Map high-level amount to pixels
        const baseDistance = SCROLL_AMOUNTS[params.amount] || SCROLL_AMOUNTS.medium;

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

        // Record action
        this.recordAction(decision, true);

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

        // Type with human-like delays between characters
        for (const char of params.text) {
            await this.page.keyboard.type(char);
            // Human typing speed: 100-250ms between characters
            await this.humanDelay(50, 150);
        }

        // Small pause after typing
        await this.humanDelay(300, 600);

        // Record action
        this.recordAction(decision, true);

        return {
            success: true,
            actionTaken: 'type',
            params: params,
            resultingUrl: this.page.url(),
            durationMs: Date.now() - startTime
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
        this.recordAction(decision, true);

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
        this.recordAction(decision, true);

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

        // Find the target element
        const target = elements.find(e => e.id === params.id);
        if (!target) {
            return this.failureResult(decision, startTime, `Element id=${params.id} not found`);
        }

        const boundingBox = target.boundingBox;
        if (!boundingBox) {
            return this.failureResult(decision, startTime, `Element id=${params.id} has no bounding box`);
        }

        // Hover using GhostMouse (human-like with micro-movements)
        await this.ghost.hoverElement(boundingBox);

        // Record action
        this.recordAction(decision, true);

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
        this.recordAction(decision, true);

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
        this.recordAction(decision, true);

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
     * Record an action to history.
     */
    private recordAction(
        decision: NavigationDecision,
        success: boolean,
        errorMessage?: string
    ): ActionRecord {
        const record: ActionRecord = {
            timestamp: Date.now(),
            action: decision.action,
            params: decision.params,
            success,
            errorMessage
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
     */
    isInLoop(lookback: number = 6): boolean {
        if (this.actionHistory.length < lookback) return false;

        const recent = this.actionHistory.slice(-lookback);

        // Check if all recent actions are the same type
        const allSameAction = recent.every(a => a.action === recent[0].action);
        if (allSameAction && recent[0].action === 'scroll') {
            // Multiple scrolls might be intentional, check for failures
            const failureRate = recent.filter(a => !a.success).length / recent.length;
            return failureRate > 0.5;
        }

        // Check for repeated click failures
        const clickFailures = recent.filter(a => a.action === 'click' && !a.success);
        return clickFailures.length >= 3;
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
     * Reset executor state (for new session).
     */
    reset(): void {
        this.actionHistory = [];
        this.sessionDelayMultiplier = 0.75 + Math.random() * 0.5;
    }

    /**
     * Get action history for debugging.
     */
    getActionHistory(): ActionRecord[] {
        return [...this.actionHistory];
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

    /**
     * Get the linger duration in milliseconds for a given level.
     *
     * @param level - 'short' | 'medium' | 'long'
     * @returns Duration in milliseconds with session variance
     */
    getLingerDurationMs(level: 'short' | 'medium' | 'long'): number {
        const baseDuration = LINGER_DURATIONS[level] || LINGER_DURATIONS.medium;
        return baseDuration * this.sessionDelayMultiplier;
    }
}
