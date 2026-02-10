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
import { ScrollConfig, BoundingBox, ContentType } from '../../types/instagram.js';

export class HumanScroll {
    private page: Page;

    // Cached viewport height for proportional calculations (avoids repeated CDP calls)
    private cachedViewportHeight: number = 0;

    constructor(page: Page) {
        this.page = page;
    }

    /** Rebind to a different page (used for tab switching). */
    setPage(page: Page): void {
        this.page = page;
        this.cachedViewportHeight = 0; // Reset cache for new page
    }

    /**
     * Get viewport height, using cache to avoid repeated CDP calls.
     * Refreshes once per scroll operation.
     */
    private async getViewportHeight(): Promise<number> {
        if (this.cachedViewportHeight > 0) return this.cachedViewportHeight;
        const vh = await this.cdpEvaluate<number>('window.innerHeight');
        this.cachedViewportHeight = vh || 1920;
        return this.cachedViewportHeight;
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
        // Refresh viewport cache at start of each scroll operation
        this.cachedViewportHeight = 0;
        const vh = await this.getViewportHeight();

        const {
            baseDistance = Math.round(vh * 0.4),
            variability = 0.3,
            microAdjustProb = 0.10
        } = config;

        // 1. Calculate actual scroll distance with variation
        const variation = 1 + (Math.random() - 0.5) * 2 * variability;
        const targetDistance = Math.round(baseDistance * variation);

        // 2. Execute scroll in phases (acceleration -> cruise -> deceleration)
        await this.smoothScrollWithEasing(targetDistance);

        // 3. Micro-adjustment: scroll past and slightly back (10% chance)
        if (Math.random() < microAdjustProb) {
            await this.microAdjust();
        }
    }

    /**
     * Smooth scroll using wheel events with easing.
     * More realistic than window.scrollBy() which is instant.
     *
     * Uses cubic ease-out: fast start, gradual slow down.
     */
    private async smoothScrollWithEasing(distance: number, axis: 'y' | 'x' = 'y'): Promise<void> {
        const steps = 8 + Math.floor(Math.random() * 4);  // 8-12 steps
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
            if (axis === 'x') {
                await this.page.mouse.wheel(stepDistance, 0);
            } else {
                await this.page.mouse.wheel(0, stepDistance);
            }
            scrolled = targetScrolled;

            // Variable delay between wheel events
            const delay = 5 + Math.random() * 10;
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
        // Scroll down a bit more (overshoot) — proportional to viewport
        const vh = await this.getViewportHeight();
        const overshoot = vh * 0.05 + Math.random() * vh * 0.1;
        await this.page.mouse.wheel(0, overshoot);
        await new Promise(resolve => setTimeout(resolve, 50 + Math.random() * 50));

        // Scroll back up (correct)
        const correction = overshoot * (0.8 + Math.random() * 0.4);
        await this.page.mouse.wheel(0, -correction);
        await new Promise(resolve => setTimeout(resolve, 30 + Math.random() * 30));
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

            // Only scroll if significant movement needed (5% of viewport)
            if (Math.abs(scrollNeeded) > viewportHeight * 0.05) {
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
        // Get viewport height first for proportional tolerance
        const vh = await this.cdpEvaluate<number>('window.innerHeight');
        if (!vh) {
            return { success: false, finalOffset: Infinity };
        }

        // STEALTH: Variable tolerance (8-12% of viewport, not fixed px) to avoid detection patterns
        const TOLERANCE = vh * 0.08 + Math.random() * vh * 0.04;

        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            let cdpSession: CDPSession | null = null;
            try {
                cdpSession = await this.page.context().newCDPSession(this.page);

                // Get element bounding box
                const box = await this.getNodeBoundingBoxByCDP(cdpSession, backendNodeId);
                if (!box) {
                    return { success: false, finalOffset: Infinity };
                }

                const viewportHeight = vh;

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

                // Brief pause for scroll to settle
                await new Promise(r => setTimeout(r, 50 + Math.random() * 50));

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

            const delay = 5 + Math.random() * 10;
            await new Promise(resolve => setTimeout(resolve, delay));
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
            await new Promise(resolve => setTimeout(resolve, 100 + Math.random() * 100));
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
     * Get current horizontal scroll position via CDP (undetectable).
     */
    async getScrollPositionX(): Promise<number> {
        const scrollX = await this.cdpEvaluate<number>('window.scrollX');
        return scrollX ?? 0;
    }

    /**
     * Check if we're near the bottom of the page via CDP (undetectable).
     * Useful for detecting "infinite scroll loaded more content".
     */
    async isNearBottom(threshold?: number): Promise<boolean> {
        // Use proportional default: 20% of viewport height
        const effectiveThreshold = threshold ?? Math.round(await this.getViewportHeight() * 0.2);
        const result = await this.cdpEvaluate<boolean>(`(function() {
            const scrollTop = window.scrollY;
            const scrollHeight = document.documentElement.scrollHeight;
            const clientHeight = window.innerHeight;
            return scrollTop + clientHeight >= scrollHeight - ${effectiveThreshold};
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
     * Scroll with human-like behavior: easing, micro-adjustments, reading pause.
     * The LLM decides scroll distance via config overrides.
     *
     * @param config - Scroll configuration with explicit baseDistance from caller
     */
    async scrollWithIntent(
        config: Partial<ScrollConfig> = {}
    ): Promise<{ contentType: ContentType; scrollDistance: number; actualDelta: number; scrollFailed: boolean; pauseDurationMs: number }> {
        const vh = await this.getViewportHeight();

        // Default distance: ~40% viewport, LLM controls via config.baseDistance
        const {
            baseDistance = Math.round(vh * 0.4),
            variability = 0.3,
            microAdjustProb = 0.10
        } = config;

        // 1. Calculate actual scroll distance with variation
        const variation = 1 + (Math.random() - 0.5) * 2 * variability;
        const targetDistance = Math.round(baseDistance * variation);

        // Capture scroll position BEFORE
        const scrollYBefore = await this.getScrollPosition();

        // 2. Execute scroll in phases (acceleration -> cruise -> deceleration)
        await this.smoothScrollWithEasing(targetDistance);

        // Capture scroll position AFTER
        const scrollYAfter = await this.getScrollPosition();
        const actualDelta = scrollYAfter - scrollYBefore;

        console.log(`  📜 SCROLL: Target=${targetDistance}px, Actual=${actualDelta}px`);

        // Scroll failure detection
        let scrollFailed = false;
        if (actualDelta === 0 && targetDistance > 50) {
            console.log('  ⚠️ Scroll Failed - Page may be stuck or reached bottom!');
            scrollFailed = true;
        }

        // 3. Micro-adjustment (10% chance)
        if (Math.random() < microAdjustProb) {
            await this.microAdjust();
        }

        return {
            contentType: 'mixed',
            scrollDistance: targetDistance,
            actualDelta,
            scrollFailed,
            pauseDurationMs: 0
        };
    }

    /**
     * Horizontal scroll with human-like behavior: easing, micro-adjustments, reading pause.
     * Same physics pipeline as vertical scrollWithIntent but on the X axis.
     */
    async scrollHorizontalWithIntent(
        config: Partial<ScrollConfig> = {}
    ): Promise<{ contentType: ContentType; scrollDistance: number; actualDelta: number; scrollFailed: boolean; pauseDurationMs: number }> {
        const vw = await this.cdpEvaluate<number>('window.innerWidth') ?? 1080;

        const {
            baseDistance = Math.round(vw * 0.4),
            variability = 0.3,
            microAdjustProb = 0.10
        } = config;

        const variation = 1 + (Math.random() - 0.5) * 2 * variability;
        const targetDistance = Math.round(baseDistance * variation);

        const scrollXBefore = await this.getScrollPositionX();

        await this.smoothScrollWithEasing(targetDistance, 'x');

        const scrollXAfter = await this.getScrollPositionX();
        const actualDelta = scrollXAfter - scrollXBefore;

        console.log(`  📜 H-SCROLL: Target=${targetDistance}px, Actual=${actualDelta}px`);

        let scrollFailed = false;
        if (actualDelta === 0 && Math.abs(targetDistance) > 50) {
            console.log('  ⚠️ Horizontal Scroll Failed');
            scrollFailed = true;
        }

        // Micro-adjust on horizontal too (10% chance)
        if (Math.random() < microAdjustProb) {
            const overshoot = vw * 0.05 + Math.random() * vw * 0.1;
            const dir = targetDistance > 0 ? 1 : -1;
            await this.page.mouse.wheel(overshoot * dir, 0);
            await new Promise(resolve => setTimeout(resolve, 50 + Math.random() * 50));
            const correction = overshoot * (0.8 + Math.random() * 0.4);
            await this.page.mouse.wheel(-correction * dir, 0);
            await new Promise(resolve => setTimeout(resolve, 30 + Math.random() * 30));
        }

        return {
            contentType: 'mixed',
            scrollDistance: targetDistance,
            actualDelta,
            scrollFailed,
            pauseDurationMs: 0
        };
    }

}
