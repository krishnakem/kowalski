/**
 * HumanScroll - Human-like Scrolling Simulation
 *
 * Generates realistic scroll behavior using:
 * - Variable velocity (not constant scroll speed)
 * - Easing (acceleration/deceleration)
 * - Micro-adjustments (scroll past, then back)
 * - Reading pauses (humans stop to read)
 *
 * Cost: $0 (pure physics simulation, no API calls)
 *
 * IMPORTANT: NO DOM injection allowed.
 * - NO page.evaluate()
 * - NO page.$()
 * - All state queries use CDP Runtime.evaluate
 */

import { Page, CDPSession } from 'playwright';
import { ScrollConfig, BoundingBox, ContentDensity, ContentType } from '../../types/instagram.js';
import type { A11yNavigator } from './A11yNavigator.js';

export class HumanScroll {
    private page: Page;

    // Session-level timing multiplier for cross-session variance
    private sessionTimingMultiplier: number;

    constructor(page: Page) {
        this.page = page;
        // Vary timing by ±30% per session (0.7 to 1.3)
        this.sessionTimingMultiplier = 0.7 + Math.random() * 0.6;
    }

    /**
     * Randomized value within a range - NO fixed values allowed.
     */
    private randomInRange(min: number, max: number): number {
        return min + Math.random() * (max - min);
    }

    // =========================================================================
    // CDP Helper Methods (Undetectable)
    // =========================================================================

    /**
     * Execute JavaScript via CDP Runtime.evaluate (undetectable).
     * This is different from page.evaluate() which injects scripts.
     */
    private async cdpEvaluate<T>(expression: string): Promise<T | null> {
        let cdpSession: CDPSession | null = null;
        try {
            cdpSession = await this.page.context().newCDPSession(this.page);
            const { result } = await cdpSession.send('Runtime.evaluate', {
                expression,
                returnByValue: true
            });
            return result.value as T;
        } catch {
            return null;
        } finally {
            if (cdpSession) {
                await cdpSession.detach().catch(() => {});
            }
        }
    }

    /**
     * Get bounding box for a node using CDP (undetectable).
     */
    private async getNodeBoundingBoxByCDP(
        cdpSession: CDPSession,
        backendNodeId: number
    ): Promise<BoundingBox | null> {
        try {
            const { model } = await cdpSession.send('DOM.getBoxModel', {
                backendNodeId
            });

            if (!model || !model.content) {
                return null;
            }

            const [x1, y1, x2, , , y3] = model.content;
            return {
                x: x1,
                y: y1,
                width: x2 - x1,
                height: y3 - y1
            };
        } catch {
            return null;
        }
    }

    /**
     * Perform human-like scroll with:
     * - Variable distance (not exact pixels every time)
     * - Smooth acceleration/deceleration
     * - Occasional micro-adjustments (scroll past, then back)
     * - Reading pauses
     */
    async scroll(config: ScrollConfig = {}): Promise<void> {
        const {
            baseDistance = 400,
            variability = 0.3,
            microAdjustProb = 0.25,
            readingPauseMs = [2000, 5000]
        } = config;

        // 1. Calculate actual scroll distance with variation
        const variation = 1 + (Math.random() - 0.5) * 2 * variability;
        const targetDistance = Math.round(baseDistance * variation);

        // 2. Execute scroll in phases (acceleration -> cruise -> deceleration)
        await this.smoothScrollWithEasing(targetDistance);

        // 3. Micro-adjustment: scroll past and slightly back (humans do this)
        if (Math.random() < microAdjustProb) {
            await this.microAdjust();
        }

        // 4. Reading pause (human looks at content)
        const pauseDuration = readingPauseMs[0] +
            Math.random() * (readingPauseMs[1] - readingPauseMs[0]);
        await new Promise(resolve => setTimeout(resolve, pauseDuration));
    }

    /**
     * Smooth scroll using wheel events with easing.
     * More realistic than window.scrollBy() which is instant.
     *
     * Uses cubic ease-out: fast start, gradual slow down.
     */
    private async smoothScrollWithEasing(distance: number): Promise<void> {
        const steps = 15 + Math.floor(Math.random() * 10);  // 15-25 steps
        const direction = distance > 0 ? 1 : -1;
        const absDistance = Math.abs(distance);

        let scrolled = 0;

        for (let i = 0; i < steps; i++) {
            // Easing: ease-out (fast start, slow end)
            // This mimics the natural deceleration of a finger flick
            const progress = i / steps;
            const easing = 1 - Math.pow(1 - progress, 3);  // Cubic ease-out
            const targetScrolled = absDistance * easing;
            const stepDistance = (targetScrolled - scrolled) * direction;

            // Use wheel event (more human-like than scrollBy)
            await this.page.mouse.wheel(0, stepDistance);
            scrolled = targetScrolled;

            // Variable delay between wheel events (human inconsistency)
            const delay = 10 + Math.random() * 30;
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }

    /**
     * Micro-adjustment: scroll a bit more, then back up.
     * Simulates "oops, scrolled too far" human behavior.
     *
     * This is common when looking for specific content -
     * we overshoot, then scroll back to find what we want.
     */
    private async microAdjust(): Promise<void> {
        // Scroll down a bit more (overshoot)
        const overshoot = 50 + Math.random() * 100;
        await this.page.mouse.wheel(0, overshoot);
        await new Promise(resolve => setTimeout(resolve, 200 + Math.random() * 300));

        // Scroll back up (correct)
        const correction = overshoot * (0.8 + Math.random() * 0.4);
        await this.page.mouse.wheel(0, -correction);
        await new Promise(resolve => setTimeout(resolve, 100 + Math.random() * 200));
    }

    /**
     * Scroll to bring a specific element into view (human-like).
     * Uses CDP to get element position - NO DOM injection.
     *
     * @param backendNodeId - CDP backend node ID from accessibility tree
     * @returns true if scrolled successfully, false otherwise
     */
    async scrollToElementByCDP(backendNodeId: number): Promise<boolean> {
        let cdpSession: CDPSession | null = null;
        try {
            cdpSession = await this.page.context().newCDPSession(this.page);

            // Get element bounding box via CDP
            const box = await this.getNodeBoundingBoxByCDP(cdpSession, backendNodeId);
            if (!box) return false;

            // Get viewport info via CDP
            const viewportHeight = await this.cdpEvaluate<number>('window.innerHeight');
            const currentScroll = await this.cdpEvaluate<number>('window.scrollY');

            if (viewportHeight === null || currentScroll === null) return false;

            // Calculate how far to scroll to center element in viewport
            // NOTE: box.y is viewport-relative (from DOM.getBoxModel), not document-relative
            // So we just need: elementCenter - viewportCenter (no currentScroll subtraction)
            const elementCenter = box.y + box.height / 2;
            const viewportCenter = viewportHeight / 2;
            const scrollNeeded = elementCenter - viewportCenter;

            // Only scroll if significant movement needed
            if (Math.abs(scrollNeeded) > 50) {
                // Use precise scroll for centering (no variability)
                await this.preciseScroll(scrollNeeded);
            }

            return true;
        } catch {
            return false;
        } finally {
            if (cdpSession) {
                await cdpSession.detach().catch(() => {});
            }
        }
    }

    /**
     * Scroll to center an element with verification and retry.
     * Ensures the post is actually centered after scrolling.
     *
     * This is the recommended method for post-centered browsing.
     *
     * @param backendNodeId - CDP backend node ID from accessibility tree
     * @param maxRetries - Maximum centering attempts (default: 2)
     * @returns Object with success status and final offset from center
     */
    async scrollToElementCentered(
        backendNodeId: number,
        maxRetries: number = 2
    ): Promise<{ success: boolean; finalOffset: number }> {
        // STEALTH: Variable tolerance (80-120px, not fixed) to avoid detection patterns
        const TOLERANCE = 80 + Math.random() * 40;

        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            let cdpSession: CDPSession | null = null;
            try {
                cdpSession = await this.page.context().newCDPSession(this.page);

                // Get element bounding box
                const box = await this.getNodeBoundingBoxByCDP(cdpSession, backendNodeId);
                if (!box) {
                    return { success: false, finalOffset: Infinity };
                }

                // Get viewport info
                const viewportHeight = await this.cdpEvaluate<number>('window.innerHeight');
                if (!viewportHeight) {
                    return { success: false, finalOffset: Infinity };
                }

                // Calculate current offset from center
                // box.y is viewport-relative
                const elementCenterY = box.y + box.height / 2;
                const viewportCenterY = viewportHeight / 2;
                const offset = elementCenterY - viewportCenterY;

                // Check if already centered
                if (Math.abs(offset) <= TOLERANCE) {
                    console.log(`  ✓ Post centered (offset: ${Math.round(offset)}px, attempt: ${attempt})`);
                    return { success: true, finalOffset: offset };
                }

                // Scroll to center
                console.log(`  📍 Centering post (offset: ${Math.round(offset)}px, attempt: ${attempt + 1}/${maxRetries + 1})`);
                await this.preciseScroll(offset);

                // STEALTH: Variable pause with session multiplier for scroll to settle
                const basePause = 150 + Math.random() * 100;
                await new Promise(r => setTimeout(r, basePause * this.sessionTimingMultiplier));

            } finally {
                if (cdpSession) {
                    await cdpSession.detach().catch(() => {});
                }
            }
        }

        // Final check after all retries
        const finalOffset = await this.checkElementCenterOffset(backendNodeId);
        const success = Math.abs(finalOffset) <= TOLERANCE;

        if (!success) {
            console.log(`  ⚠️ Centering incomplete after ${maxRetries + 1} attempts (final offset: ${Math.round(finalOffset)}px)`);
        }

        return { success, finalOffset };
    }

    /**
     * Check how far an element is from viewport center.
     * Helper method for scroll verification.
     */
    private async checkElementCenterOffset(backendNodeId: number): Promise<number> {
        let cdpSession: CDPSession | null = null;
        try {
            cdpSession = await this.page.context().newCDPSession(this.page);
            const box = await this.getNodeBoundingBoxByCDP(cdpSession, backendNodeId);
            if (!box) return Infinity;

            const viewportHeight = await this.cdpEvaluate<number>('window.innerHeight');
            if (!viewportHeight) return Infinity;

            const elementCenterY = box.y + box.height / 2;
            const viewportCenterY = viewportHeight / 2;
            return elementCenterY - viewportCenterY;
        } finally {
            if (cdpSession) {
                await cdpSession.detach().catch(() => {});
            }
        }
    }

    /**
     * Quick scroll for navigation (less human-like, but faster).
     * Use sparingly - mostly for getting to starting position.
     *
     * Note: Randomized timing to avoid machine-like patterns.
     */
    async quickScroll(distance: number): Promise<void> {
        const steps = 5;
        const stepSize = distance / steps;

        for (let i = 0; i < steps; i++) {
            await this.page.mouse.wheel(0, stepSize);
            // Randomized delay (was hardcoded 20ms - bot signal!)
            await new Promise(resolve => setTimeout(resolve, 15 + Math.random() * 15));
        }
    }

    /**
     * Precise scroll for centering operations.
     * Unlike scroll(), this does NOT add variability - we need exact positioning.
     * Still uses easing for human-like feel.
     *
     * @param distance - Exact pixels to scroll (positive = down, negative = up)
     */
    async preciseScroll(distance: number): Promise<void> {
        const steps = 12 + Math.floor(Math.random() * 6);  // 12-18 steps
        const direction = distance > 0 ? 1 : -1;
        const absDistance = Math.abs(distance);

        let scrolled = 0;

        for (let i = 0; i < steps; i++) {
            // Easing: ease-out (fast start, slow end)
            const progress = i / steps;
            const easing = 1 - Math.pow(1 - progress, 3);
            const targetScrolled = absDistance * easing;
            const stepDistance = (targetScrolled - scrolled) * direction;

            await this.page.mouse.wheel(0, stepDistance);
            scrolled = targetScrolled;

            // STEALTH: Variable delay with session multiplier (same range as regular scroll)
            const baseDelay = 10 + Math.random() * 30;  // 10-40ms base
            await new Promise(resolve => setTimeout(resolve, baseDelay * this.sessionTimingMultiplier));
        }
    }

    /**
     * Scroll to top of page (for starting fresh exploration).
     * Uses CDP to get current scroll position - NO DOM injection.
     */
    async scrollToTop(): Promise<void> {
        const currentScroll = await this.cdpEvaluate<number>('window.scrollY');
        if (currentScroll && currentScroll > 0) {
            await this.quickScroll(-currentScroll);
            await new Promise(resolve => setTimeout(resolve, 400 + Math.random() * 200));
        }
    }

    /**
     * Get current scroll position via CDP (undetectable).
     */
    async getScrollPosition(): Promise<number> {
        const scrollY = await this.cdpEvaluate<number>('window.scrollY');
        return scrollY ?? 0;
    }

    /**
     * Check if we're near the bottom of the page via CDP (undetectable).
     * Useful for detecting "infinite scroll loaded more content".
     */
    async isNearBottom(threshold: number = 200): Promise<boolean> {
        const result = await this.cdpEvaluate<boolean>(`(function() {
            const scrollTop = window.scrollY;
            const scrollHeight = document.documentElement.scrollHeight;
            const clientHeight = window.innerHeight;
            return scrollTop + clientHeight >= scrollHeight - ${threshold};
        })()`);
        return result ?? false;
    }

    /**
     * Get viewport dimensions via CDP (undetectable).
     */
    async getViewportInfo(): Promise<{ width: number; height: number; scrollHeight: number }> {
        const result = await this.cdpEvaluate<{ width: number; height: number; scrollHeight: number }>(`JSON.parse(JSON.stringify({
            width: window.innerWidth,
            height: window.innerHeight,
            scrollHeight: document.documentElement.scrollHeight
        }))`);
        return result ?? { width: 0, height: 0, scrollHeight: 0 };
    }

    // =========================================================================
    // Intent-Driven Scrolling (Content-Aware)
    // =========================================================================

    /**
     * Get scroll parameters based on content type.
     * Text-heavy content = smaller scrolls, longer pauses
     * Image-heavy content = larger scrolls, shorter pauses
     *
     * All values are randomized within ranges - NO fixed values.
     */
    private getScrollParamsForContent(contentType: ContentType): {
        distance: number;
        pauseMs: [number, number];
    } {
        const params: Record<ContentType, {
            distance: [number, number];
            pause: [number, number];
        }> = {
            'text-heavy': {
                distance: [200, 300],    // Smaller scrolls for reading
                pause: [3000, 6000]      // Longer pauses to read
            },
            'image-heavy': {
                distance: [500, 700],    // Larger scrolls for visual scanning
                pause: [1500, 3000]      // Shorter pauses (quick visual scan)
            },
            'mixed': {
                distance: [350, 450],    // Balanced scrolls
                pause: [2000, 5000]      // Moderate pauses
            }
        };

        const { distance, pause } = params[contentType];

        return {
            distance: this.randomInRange(distance[0], distance[1]) * this.sessionTimingMultiplier,
            pauseMs: [
                pause[0] * this.sessionTimingMultiplier,
                pause[1] * this.sessionTimingMultiplier
            ]
        };
    }

    /**
     * Intent-driven scroll that adapts to content density.
     *
     * This is the "smart" scroll that:
     * 1. Analyzes the current viewport content via A11y tree
     * 2. Adjusts scroll distance based on content type
     * 3. Adjusts reading pause based on content density
     * 4. AUDIT: Logs scroll delta and verifies scroll actually occurred
     *
     * @param navigator - A11yNavigator instance for content analysis
     * @param config - Optional scroll configuration overrides
     */
    async scrollWithIntent(
        navigator: A11yNavigator,
        config: Partial<ScrollConfig> = {}
    ): Promise<{ contentType: ContentType; scrollDistance: number; actualDelta: number; scrollFailed: boolean }> {
        // Analyze content density
        const contentDensity = await navigator.analyzeContentDensity();
        const contentType = contentDensity.type;

        // Get adaptive scroll parameters
        const adaptiveParams = this.getScrollParamsForContent(contentType);

        // Allow config overrides but default to adaptive values
        const {
            baseDistance = adaptiveParams.distance,
            variability = 0.3,
            microAdjustProb = 0.25,
            readingPauseMs = adaptiveParams.pauseMs
        } = config;

        // 1. Calculate actual scroll distance with variation
        const variation = 1 + (Math.random() - 0.5) * 2 * variability;
        const targetDistance = Math.round(baseDistance * variation);

        // === SCROLL DELTA VERIFICATION ===
        // Capture scroll position BEFORE
        const scrollYBefore = await this.getScrollPosition();

        // 2. Execute scroll in phases (acceleration -> cruise -> deceleration)
        await this.smoothScrollWithEasing(targetDistance);

        // Capture scroll position AFTER
        const scrollYAfter = await this.getScrollPosition();
        const actualDelta = scrollYAfter - scrollYBefore;

        // === ENTROPY AUDIT LOG ===
        console.log(`  📜 SCROLL AUDIT: Target=${targetDistance}px, Actual Delta=${actualDelta}px, ContentType=${contentType}`);
        console.log(`  📊 Session Multiplier: ${this.sessionTimingMultiplier.toFixed(2)}x, Pause Range: [${Math.round(readingPauseMs[0])}-${Math.round(readingPauseMs[1])}]ms`);

        // === CRITICAL WARNING: Scroll Failed ===
        let scrollFailed = false;
        if (actualDelta === 0 && targetDistance > 50) {
            console.log('  ⚠️ CRITICAL WARNING: Scroll Failed - Page may be stuck or reached bottom!');
            console.log(`  ⚠️ ScrollY unchanged at ${scrollYBefore}px after attempting ${targetDistance}px scroll`);
            scrollFailed = true;
        } else if (Math.abs(actualDelta) < targetDistance * 0.3) {
            console.log(`  ⚠️ WARNING: Scroll undershot significantly (${Math.round(actualDelta / targetDistance * 100)}% of target)`);
        }

        // 3. Micro-adjustment: scroll past and slightly back (humans do this)
        // Probability varies by content type (more likely with text-heavy)
        const adjustedMicroProb = contentType === 'text-heavy'
            ? microAdjustProb * 1.3  // More likely when reading
            : contentType === 'image-heavy'
            ? microAdjustProb * 0.7  // Less likely when scanning images
            : microAdjustProb;

        if (Math.random() < adjustedMicroProb) {
            await this.microAdjust();
        }

        // 4. Reading pause (human looks at content)
        // Adjusted based on content type
        const pauseDuration = this.randomInRange(readingPauseMs[0], readingPauseMs[1]);
        console.log(`  ⏱️ Reading pause: ${Math.round(pauseDuration)}ms`);
        await new Promise(resolve => setTimeout(resolve, pauseDuration));

        return {
            contentType,
            scrollDistance: targetDistance,
            actualDelta,
            scrollFailed
        };
    }

    /**
     * Multiple intent-driven scrolls with cumulative content analysis.
     * Useful for browsing sessions where content type may change.
     *
     * @param navigator - A11yNavigator instance for content analysis
     * @param count - Number of scrolls to perform
     * @param config - Optional scroll configuration overrides
     */
    async scrollMultipleWithIntent(
        navigator: A11yNavigator,
        count: number,
        config: Partial<ScrollConfig> = {}
    ): Promise<{
        scrollCount: number;
        contentTypes: ContentType[];
        totalDistance: number;
    }> {
        const contentTypes: ContentType[] = [];
        let totalDistance = 0;

        for (let i = 0; i < count; i++) {
            const result = await this.scrollWithIntent(navigator, config);
            contentTypes.push(result.contentType);
            totalDistance += result.scrollDistance;
        }

        return {
            scrollCount: count,
            contentTypes,
            totalDistance
        };
    }

    /**
     * Get the session timing multiplier (for external coordination).
     */
    getSessionTimingMultiplier(): number {
        return this.sessionTimingMultiplier;
    }
}
