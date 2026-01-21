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
import { ScrollConfig, BoundingBox } from '../../types/instagram.js';

export class HumanScroll {
    private page: Page;

    constructor(page: Page) {
        this.page = page;
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
            const elementCenter = box.y + box.height / 2;
            const viewportCenter = viewportHeight / 2;
            const scrollNeeded = elementCenter - viewportCenter - currentScroll;

            // Only scroll if significant movement needed
            if (Math.abs(scrollNeeded) > 50) {
                await this.scroll({ baseDistance: scrollNeeded });
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
}
