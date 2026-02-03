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
import { createHash } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { CapturedPost, CaptureSource } from '../../types/instagram.js';

/**
 * Configuration for screenshot collection.
 */
interface CollectorConfig {
    maxCaptures: number;      // Maximum screenshots to store
    jpegQuality: number;      // JPEG compression quality (1-100)
    minScrollDelta: number;   // Minimum scroll distance to consider new content
    saveToDirectory?: string; // Optional: path to save screenshots for debugging
}

const DEFAULT_CONFIG: CollectorConfig = {
    maxCaptures: 60,          // Capture more, filter later with ImageTagger
    jpegQuality: 85,          // Good balance of quality and size
    minScrollDelta: 200       // Must scroll at least 200px for new capture
};

/**
 * Story UI dimensions to crop out (approximate values for standard mobile viewport)
 * Instagram stories have:
 * - Top: Progress bar (~8px) + Header (~52px) = ~60px
 * - Bottom: Reply box (~60px)
 */
const STORY_CROP_CONFIG = {
    topMargin: 65,    // Crop out progress bar and header
    bottomMargin: 70  // Crop out reply box
};

export class ScreenshotCollector {
    private page: Page;
    private captures: CapturedPost[] = [];
    private config: CollectorConfig;
    private lastScrollPosition: number = 0;
    private outputDir: string | null = null;

    // Deduplication tracking
    private capturedPostIds = new Set<string>();      // Track by Instagram post ID
    private capturedHashes = new Set<string>();       // Track by image hash (for carousel/story)
    private capturedPositions = new Set<number>();    // Track by scroll position bucket (100px)

    constructor(page: Page, config: Partial<CollectorConfig> = {}) {
        this.page = page;
        this.config = { ...DEFAULT_CONFIG, ...config };

        // Set up output directory for debugging if specified
        // Creates a session-specific subfolder for each browsing session
        if (this.config.saveToDirectory) {
            const sessionTimestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
            this.outputDir = path.join(this.config.saveToDirectory, `session_${sessionTimestamp}`);
            this.ensureOutputDir();
            console.log(`📸 Debug screenshots will be saved to: ${this.outputDir}`);
        }
    }

    /**
     * Ensure the output directory exists for saving screenshots.
     */
    private ensureOutputDir(): void {
        if (this.outputDir && !fs.existsSync(this.outputDir)) {
            fs.mkdirSync(this.outputDir, { recursive: true });
        }
    }

    /**
     * Save a screenshot to disk for debugging.
     * Only saves if outputDir is configured.
     */
    private saveScreenshotToDisk(screenshot: Buffer, source: CaptureSource, id: number): void {
        if (!this.outputDir) return;

        // Simpler filename since session folder already has timestamp
        const filename = `${id.toString().padStart(3, '0')}_${source}.jpg`;
        const filepath = path.join(this.outputDir, filename);

        fs.writeFileSync(filepath, screenshot);
        console.log(`  💾 Saved: ${filename}`);
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

        // Extract post ID from URL (for embed support and deduplication)
        const postId = this.extractPostId();

        // PRIMARY DEDUP: Skip if we've already captured this exact post
        if (postId && this.capturedPostIds.has(postId)) {
            console.log(`📸 Skipping duplicate post: ${postId}`);
            return false;
        }

        // POSITION-BASED DEDUP: Track by absolute scroll position (300px buckets)
        // This catches the same viewport being captured multiple times even with different sources
        // Exception: carousel slides and stories share position but show different content (rely on hash dedup)
        // - Carousel: multiple slides at same scroll position
        // - Stories: modal overlay always at scrollPosition=0
        // NOTE: 300px tolerance needed because post centering has 80-120px variance
        const positionBucket = Math.round(scrollPosition / 300);
        if (source !== 'carousel' && source !== 'story' && this.capturedPositions.has(positionBucket)) {
            console.log(`📸 Skipping duplicate position: bucket ${positionBucket} (scroll ~${scrollPosition}px)`);
            return false;
        }

        // Skip if we haven't scrolled enough (likely same content) - for feed only
        if (source === 'feed' && Math.abs(scrollPosition - this.lastScrollPosition) < this.config.minScrollDelta) {
            console.log(`📸 Scroll delta too small (${Math.abs(scrollPosition - this.lastScrollPosition)}px), skipping duplicate`);
            return false;
        }

        try {
            // Get viewport dimensions for clip calculations
            const viewport = this.page.viewportSize();
            let screenshot: Buffer;

            // For stories, crop out the Instagram UI chrome (progress bar, header, reply box)
            if (source === 'story' && viewport) {
                const clipHeight = viewport.height - STORY_CROP_CONFIG.topMargin - STORY_CROP_CONFIG.bottomMargin;

                screenshot = await this.page.screenshot({
                    type: 'jpeg',
                    quality: this.config.jpegQuality,
                    clip: {
                        x: 0,
                        y: STORY_CROP_CONFIG.topMargin,
                        width: viewport.width,
                        height: Math.max(clipHeight, 100)  // Ensure minimum height
                    }
                });
                console.log(`📸 Story cropped: removed top ${STORY_CROP_CONFIG.topMargin}px and bottom ${STORY_CROP_CONFIG.bottomMargin}px`);
            } else {
                // Regular viewport screenshot for feed/search/profile
                screenshot = await this.page.screenshot({
                    type: 'jpeg',
                    quality: this.config.jpegQuality,
                    fullPage: false  // Viewport only
                });
            }

            // SECONDARY DEDUP: Hash-based for carousel/story (no postId available)
            const hash = this.computeImageHash(screenshot);
            if (this.capturedHashes.has(hash)) {
                console.log(`📸 Skipping duplicate (hash match): ${hash.slice(0, 8)}...`);
                return false;
            }

            // Store capture
            this.captures.push({
                id: this.captures.length + 1,
                screenshot,
                source,
                interest,
                postId,  // For Instagram embed rendering
                timestamp: Date.now(),
                scrollPosition
            });

            // Track for deduplication
            if (postId) {
                this.capturedPostIds.add(postId);
            }
            this.capturedHashes.add(hash);
            this.capturedPositions.add(positionBucket);

            // Update last position for feed content
            if (source === 'feed') {
                this.lastScrollPosition = scrollPosition;
            }

            // Save to disk for debugging if configured
            this.saveScreenshotToDisk(screenshot, source, this.captures.length);

            console.log(`📸 Captured #${this.captures.length} (${source}${interest ? `: ${interest}` : ''}${postId ? ` [postId: ${postId}]` : ''})`);
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
        this.capturedPostIds.clear();
        this.capturedHashes.clear();
        this.capturedPositions.clear();
        console.log('📸 Collector cleared');
    }

    /**
     * Reset scroll tracking (useful when navigating to new context).
     */
    resetScrollTracking(): void {
        this.lastScrollPosition = 0;
    }

    /**
     * Capture multiple frames during video playback.
     * Called when video content is detected. Simulates natural video watching
     * by capturing frames at intervals during the watch duration.
     *
     * @param source - Where this content came from (feed, story, etc.)
     * @param watchDurationMs - How long to watch (human-like: 8-20 seconds)
     * @param frameIntervalMs - Interval between frames (2-3 seconds)
     * @returns Number of unique frames captured
     */
    async captureVideoFrames(
        source: CaptureSource,
        watchDurationMs: number = 12000,  // 12 second default watch time
        frameIntervalMs: number = 2500     // Capture every 2.5 seconds
    ): Promise<number> {
        const videoId = this.extractPostId() || `video_${Date.now()}`;
        const frameCount = Math.floor(watchDurationMs / frameIntervalMs);
        let capturedFrames = 0;

        console.log(`🎬 Starting video frame capture: ${frameCount} frames over ${(watchDurationMs / 1000).toFixed(1)}s`);

        for (let i = 0; i < frameCount; i++) {
            // Check memory limit
            if (this.captures.length >= this.config.maxCaptures) {
                console.log(`📸 Max captures reached, stopping video frames`);
                break;
            }

            // Wait before capture (simulates watching)
            if (i > 0) {
                await this.delay(frameIntervalMs);
            }

            try {
                const screenshot = await this.page.screenshot({
                    type: 'jpeg',
                    quality: this.config.jpegQuality,
                    fullPage: false
                });

                // Hash-based dedup for identical frames (e.g., paused video)
                const hash = this.computeImageHash(screenshot);
                if (this.capturedHashes.has(hash)) {
                    console.log(`🎬 Frame ${i + 1}: duplicate, skipping`);
                    continue;
                }
                this.capturedHashes.add(hash);

                // Store frame with video metadata
                this.captures.push({
                    id: this.captures.length + 1,
                    screenshot,
                    source,
                    postId: this.extractPostId(),
                    timestamp: Date.now(),
                    scrollPosition: 0,  // Video frames don't need scroll tracking
                    isVideoFrame: true,
                    videoId,
                    frameIndex: capturedFrames + 1,
                    totalFrames: frameCount  // Will be updated at end
                });

                // Save to disk for debugging if configured
                this.saveScreenshotToDisk(screenshot, source, this.captures.length);

                capturedFrames++;
                console.log(`🎬 Frame ${capturedFrames} captured`);

            } catch (error) {
                console.error(`🎬 Frame capture failed:`, error);
            }
        }

        // Update totalFrames for all frames of this video
        this.captures
            .filter(c => c.videoId === videoId)
            .forEach(c => c.totalFrames = capturedFrames);

        console.log(`🎬 Video complete: ${capturedFrames} unique frames captured`);
        return capturedFrames;
    }

    /**
     * Simple delay helper for video frame timing.
     */
    private delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Extract Instagram post ID from current URL.
     * Post URLs follow pattern: instagram.com/p/{POST_ID}/
     * Returns undefined for non-post pages (stories, feed, etc.)
     */
    private extractPostId(): string | undefined {
        const url = this.page.url();
        const match = url.match(/\/p\/([A-Za-z0-9_-]+)\//);
        return match?.[1];
    }

    /**
     * Compute a simple hash of the screenshot for deduplication.
     * Uses MD5 on the entire buffer - fast enough for our needs.
     */
    private computeImageHash(screenshot: Buffer): string {
        return createHash('md5').update(screenshot).digest('hex');
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
