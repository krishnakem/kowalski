/**
 * ScreenshotCollector - Screenshot-First Content Capture
 *
 * Captures screenshots of each post/story during natural browsing.
 * Screenshots are accumulated in memory and batch-processed at session end.
 *
 * Key principles:
 * - NO Vision API calls during browsing (just capture)
 * - Viewport-only screenshots (not full page)
 * - Memory-aware with configurable limits
 * - Scroll position tracking for deduplication
 */

import { Page } from 'playwright';
import { CapturedPost, CaptureSource } from '../../types/instagram.js';

/**
 * Configuration for screenshot collection.
 */
interface CollectorConfig {
    maxCaptures: number;      // Maximum screenshots to store
    jpegQuality: number;      // JPEG compression quality (1-100)
    minScrollDelta: number;   // Minimum scroll distance to consider new content
}

const DEFAULT_CONFIG: CollectorConfig = {
    maxCaptures: 50,          // ~7.5MB memory at 150KB/screenshot
    jpegQuality: 85,          // Good balance of quality and size
    minScrollDelta: 200       // Must scroll at least 200px for new capture
};

export class ScreenshotCollector {
    private page: Page;
    private captures: CapturedPost[] = [];
    private config: CollectorConfig;
    private lastScrollPosition: number = 0;

    constructor(page: Page, config: Partial<CollectorConfig> = {}) {
        this.page = page;
        this.config = { ...DEFAULT_CONFIG, ...config };
    }

    /**
     * Capture the current viewport as a post screenshot.
     * Called after each scroll/story view when content is visible.
     *
     * @param source - Where this content came from (feed, story, search, etc.)
     * @param interest - For search results, which interest triggered this capture
     * @returns true if captured, false if skipped (max reached or duplicate position)
     */
    async captureCurrentPost(source: CaptureSource, interest?: string): Promise<boolean> {
        // Check memory limit
        if (this.captures.length >= this.config.maxCaptures) {
            console.log(`📸 Max captures (${this.config.maxCaptures}) reached, skipping`);
            return false;
        }

        // Get current scroll position for deduplication
        const scrollPosition = await this.getScrollPosition();

        // Skip if we haven't scrolled enough (likely same content)
        if (source === 'feed' && Math.abs(scrollPosition - this.lastScrollPosition) < this.config.minScrollDelta) {
            console.log(`📸 Scroll delta too small (${Math.abs(scrollPosition - this.lastScrollPosition)}px), skipping duplicate`);
            return false;
        }

        try {
            // Capture viewport screenshot
            const screenshot = await this.page.screenshot({
                type: 'jpeg',
                quality: this.config.jpegQuality,
                fullPage: false  // Viewport only
            });

            // Store capture
            this.captures.push({
                id: this.captures.length + 1,
                screenshot,
                source,
                interest,
                timestamp: Date.now(),
                scrollPosition
            });

            // Update last position for feed content
            if (source === 'feed') {
                this.lastScrollPosition = scrollPosition;
            }

            console.log(`📸 Captured #${this.captures.length} (${source}${interest ? `: ${interest}` : ''})`);
            return true;

        } catch (error) {
            console.error('📸 Screenshot capture failed:', error);
            return false;
        }
    }

    /**
     * Get all captured screenshots for batch processing.
     */
    getCaptures(): CapturedPost[] {
        return this.captures;
    }

    /**
     * Get capture count.
     */
    getCaptureCount(): number {
        return this.captures.length;
    }

    /**
     * Get source breakdown for logging.
     */
    getSourceBreakdown(): Record<CaptureSource, number> {
        const breakdown: Record<CaptureSource, number> = {
            feed: 0,
            story: 0,
            search: 0,
            profile: 0,
            carousel: 0
        };

        for (const capture of this.captures) {
            breakdown[capture.source]++;
        }

        return breakdown;
    }

    /**
     * Get approximate memory usage in bytes.
     */
    getMemoryUsage(): number {
        return this.captures.reduce((total, c) => total + c.screenshot.length, 0);
    }

    /**
     * Clear all captures (call after processing to free memory).
     */
    clear(): void {
        this.captures = [];
        this.lastScrollPosition = 0;
        console.log('📸 Collector cleared');
    }

    /**
     * Reset scroll tracking (useful when navigating to new context).
     */
    resetScrollTracking(): void {
        this.lastScrollPosition = 0;
    }

    /**
     * Get current scroll Y position via CDP (no page.evaluate needed).
     */
    private async getScrollPosition(): Promise<number> {
        try {
            // Use CDP to get scroll position (more bot-proof than page.evaluate)
            const client = await this.page.context().newCDPSession(this.page);
            const result = await client.send('Runtime.evaluate', {
                expression: 'window.scrollY',
                returnByValue: true
            });
            await client.detach();
            return result.result.value as number;
        } catch {
            // Fallback to page.evaluate if CDP fails
            return await this.page.evaluate(() => window.scrollY);
        }
    }

    /**
     * Log summary of captured content.
     */
    logSummary(): void {
        const breakdown = this.getSourceBreakdown();
        const memoryMB = (this.getMemoryUsage() / (1024 * 1024)).toFixed(2);

        console.log(`\n📸 Screenshot Collection Summary:`);
        console.log(`   Total: ${this.captures.length} captures`);
        console.log(`   Feed: ${breakdown.feed}, Stories: ${breakdown.story}, Search: ${breakdown.search}`);
        console.log(`   Memory: ${memoryMB}MB`);
        console.log('');
    }
}
