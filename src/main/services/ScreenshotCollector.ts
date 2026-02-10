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
import { Jimp } from 'jimp';
import { CapturedPost, CaptureSource, BoundingBox } from '../../types/instagram.js';

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
    maxCaptures: 200,         // Generous limit — LLM controls capture decisions
    jpegQuality: 85,          // Good balance of quality and size
    minScrollDelta: 100       // Must scroll at least 100px for new capture
};

export class ScreenshotCollector {
    private page: Page;

    /** Rebind to a different page (used for tab switching). */
    setPage(page: Page): void {
        this.page = page;
    }
    private captures: CapturedPost[] = [];
    private config: CollectorConfig;
    private lastScrollPosition: number = 0;
    private outputDir: string | null = null;

    // Deduplication tracking
    private capturedFingerprints = new Set<string>(); // Track by tree-based fingerprint
    private capturedHashes = new Set<string>();       // Track by image hash (for carousel/story)
    private capturedPositions = new Set<string>();    // Track by source + scroll position bucket
    private lastCaptureSource: string = '';

    // File naming: posts get sequential numbers, carousel slides get sub-numbers (001.1, 001.2, ...)
    private postNumber: number = 0;
    private carouselSlideIndex: number = 0;   // 0 = not in carousel, 1+ = slide count
    private lastPostSource: CaptureSource = 'feed';
    private lastSingleFilepath: string = '';

    // Session log buffer (written to .md file alongside screenshots)
    private logBuffer: string[] = [];
    private sessionStartTime: number = Date.now();

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
    private saveScreenshotToDisk(screenshot: Buffer, source: CaptureSource): void {
        if (!this.outputDir) return;

        let filename: string;

        if (source === 'carousel') {
            if (this.carouselSlideIndex === 0) {
                // First carousel slide — rename the parent capture to .1
                if (this.lastSingleFilepath && fs.existsSync(this.lastSingleFilepath)) {
                    const renamedFilename = `${this.postNumber.toString().padStart(3, '0')}.1_${this.lastPostSource}.jpg`;
                    fs.renameSync(this.lastSingleFilepath, path.join(this.outputDir, renamedFilename));
                    console.log(`  💾 Renamed: ${path.basename(this.lastSingleFilepath)} → ${renamedFilename}`);
                }
                this.carouselSlideIndex = 1;
            }
            this.carouselSlideIndex++;
            filename = `${this.postNumber.toString().padStart(3, '0')}.${this.carouselSlideIndex}_${this.lastPostSource}.jpg`;
        } else {
            this.postNumber++;
            this.carouselSlideIndex = 0;
            this.lastPostSource = source;
            filename = `${this.postNumber.toString().padStart(3, '0')}_${source}.jpg`;
        }

        const filepath = path.join(this.outputDir, filename);
        fs.writeFileSync(filepath, screenshot);

        if (source !== 'carousel') {
            this.lastSingleFilepath = filepath;
        }

        console.log(`  💾 Saved: ${filename}`);
    }

    /**
     * Capture the current viewport as a post screenshot.
     * Called after each scroll/story view when content is visible.
     *
     * @param source - Where this content came from (feed, story, search, etc.)
     * @param interest - For search results, which interest triggered this capture
     * @param fingerprint - Tree-based post fingerprint for dedup (null for stories/grids → falls through to hash dedup)
     * @returns true if captured, false if skipped (max reached or duplicate position)
     */
    async captureCurrentPost(source: CaptureSource, interest?: string, fingerprint?: string, clip?: { x: number; y: number; width: number; height: number }): Promise<boolean> {
        // Check memory limit
        if (this.captures.length >= this.config.maxCaptures) {
            console.log(`[CAPTURE-REJECT] max_captures: limit ${this.config.maxCaptures} reached`);
            return false;
        }

        // Get current scroll position for deduplication
        const scrollPosition = await this.getScrollPosition();

        // PRIMARY DEDUP: Skip if we've already captured this exact post (by tree fingerprint)
        // Carousel slides may share the same fingerprint — rely on hash dedup instead
        if (fingerprint && source !== 'carousel' && this.capturedFingerprints.has(fingerprint)) {
            console.log(`[CAPTURE-REJECT] fingerprint_dedup: ${fingerprint} (source=${source})`);
            return false;
        }

        // POSITION-BASED DEDUP: Track by page identity + scroll position bucket
        // Uses fingerprint (from tree) or URL postId to distinguish different post detail pages
        // Falls back to source for feed/story/search viewport captures
        const vpSize = this.page.viewportSize();
        const bucketSize = vpSize ? Math.round(vpSize.height * 0.078) : 75;
        const positionBucket = Math.round(scrollPosition / bucketSize);
        const pageScope = fingerprint || this.extractPostIdForEmbed() || source;
        const positionKey = `${pageScope}:${positionBucket}`;
        if (source !== 'carousel' && source !== 'story' && this.capturedPositions.has(positionKey)) {
            console.log(`[CAPTURE-REJECT] position_dedup: bucket ${positionBucket} key=${positionKey}`);
            return false;
        }

        // Skip if we haven't scrolled enough (likely same content) - for feed only, same source only
        const onSamePage = source === this.lastCaptureSource;
        if (onSamePage && source === 'feed' && Math.abs(scrollPosition - this.lastScrollPosition) < this.config.minScrollDelta) {
            console.log(`[CAPTURE-REJECT] scroll_delta: ${Math.abs(scrollPosition - this.lastScrollPosition)}px < ${this.config.minScrollDelta}px min`);
            return false;
        }

        try {
            // Cropped screenshot if clip region provided, otherwise full viewport
            const screenshot = await this.page.screenshot({
                type: 'jpeg',
                quality: this.config.jpegQuality,
                fullPage: false,  // Viewport only
                ...(clip ? { clip } : {})
            });

            // SECONDARY DEDUP: Perceptual hash — catches near-duplicates (scroll jitter, compression)
            // Stories use tighter threshold (3) because dark background dominates the 8x8 hash,
            // causing different story frames to appear similar at the default threshold (8)
            const hash = await this.computePerceptualHash(screenshot);
            const hashThreshold = source === 'story' ? 3 : 5;
            if (this.isSimilarToExisting(hash, hashThreshold)) {
                console.log(`[CAPTURE-REJECT] perceptual_hash: ${hash} (source=${source}, threshold=${hashThreshold})`);
                return false;
            }

            // Store capture (postId from URL kept for embed rendering only)
            const postId = this.extractPostIdForEmbed();
            this.captures.push({
                id: this.captures.length + 1,
                screenshot,
                source,
                interest,
                postId,  // For Instagram embed rendering (display-only, not dedup)
                timestamp: Date.now(),
                scrollPosition
            });

            // Track for deduplication
            if (fingerprint) {
                this.capturedFingerprints.add(fingerprint);
            }
            this.capturedHashes.add(hash);
            // Only track position for sources that check it (not carousel/story)
            if (source !== 'carousel' && source !== 'story') {
                this.capturedPositions.add(positionKey);
            }

            // Update last position and source for feed content
            this.lastCaptureSource = source;
            if (source === 'feed') {
                this.lastScrollPosition = scrollPosition;
            }

            // Save to disk for debugging if configured
            this.saveScreenshotToDisk(screenshot, source);

            console.log(`📸 Captured #${this.captures.length} (${source}${interest ? `: ${interest}` : ''}${fingerprint ? ` [fp: ${fingerprint.slice(0, 30)}]` : ''})`);
            return true;

        } catch (error) {
            console.error('📸 Screenshot capture failed:', error);
            return false;
        }
    }

    /**
     * Capture a specific element that the LLM focused on.
     * Takes a cropped screenshot centered on the element for high-quality captures.
     *
     * @param elementBox - Bounding box of the focused element
     * @param source - Where this content came from (feed, story, search, etc.)
     * @param interest - For search results, which interest triggered this capture
     * @param reason - Why the LLM decided to capture this (for logging)
     * @param fingerprint - Tree-based post fingerprint for dedup (null → falls through to hash dedup)
     * @returns The captured post, or null if capture failed/skipped
     */
    async captureFocusedElement(
        elementBox: BoundingBox,
        source: CaptureSource,
        interest?: string,
        reason?: string,
        fingerprint?: string
    ): Promise<CapturedPost | null> {
        // Check memory limit
        if (this.captures.length >= this.config.maxCaptures) {
            console.log(`[CAPTURE-REJECT] max_captures: limit ${this.config.maxCaptures} reached (focused)`);
            return null;
        }

        // Get viewport with retry logic (can be null briefly during page transitions)
        let viewport = this.page.viewportSize();
        if (!viewport) {
            // Brief wait and retry
            await new Promise(r => setTimeout(r, 100));
            viewport = this.page.viewportSize();
        }

        if (!viewport) {
            // Fallback: query actual window dimensions via page.evaluate
            const dims = await this.page.evaluate(() => ({
                width: window.innerWidth, height: window.innerHeight
            })).catch(() => ({ width: 1080, height: 1920 }));
            console.log(`📸 Viewport unavailable from viewportSize(), using evaluate: ${dims.width}x${dims.height}`);
            viewport = dims;
        }

        try {
            // Calculate capture region with proportional padding for context
            const padding = Math.round(viewport.width * 0.046);
            const captureRegion = {
                x: Math.max(0, elementBox.x - padding),
                y: Math.max(0, elementBox.y - padding),
                width: Math.min(elementBox.width + padding * 2, viewport.width),
                height: Math.min(elementBox.height + padding * 2, viewport.height)
            };

            // Ensure region doesn't exceed viewport
            if (captureRegion.x + captureRegion.width > viewport.width) {
                captureRegion.width = viewport.width - captureRegion.x;
            }
            if (captureRegion.y + captureRegion.height > viewport.height) {
                captureRegion.height = viewport.height - captureRegion.y;
            }

            // Ensure minimum dimensions — captures should be at least 30% of viewport
            // to produce useful content (not tiny button/icon crops)
            captureRegion.width = Math.max(captureRegion.width, Math.round(viewport.width * 0.30));
            captureRegion.height = Math.max(captureRegion.height, Math.round(viewport.height * 0.20));

            // Take cropped screenshot focused on the element
            const screenshot = await this.page.screenshot({
                type: 'jpeg',
                quality: this.config.jpegQuality,
                clip: captureRegion
            });

            // Perceptual hash deduplication — catches near-duplicates
            const hash = await this.computePerceptualHash(screenshot);
            if (this.isSimilarToExisting(hash)) {
                console.log(`[CAPTURE-REJECT] perceptual_hash: ${hash} (focused, source=${source})`);
                return null;
            }
            this.capturedHashes.add(hash);

            // Fingerprint-based dedup: skip if we've already captured this post
            if (fingerprint && source !== 'carousel' && this.capturedFingerprints.has(fingerprint)) {
                console.log(`[CAPTURE-REJECT] fingerprint_dedup: ${fingerprint.slice(0, 30)} (focused, source=${source})`);
                return null;
            }
            if (fingerprint) {
                this.capturedFingerprints.add(fingerprint);
            }

            // Create captured post (postId from URL kept for embed rendering only)
            const postId = this.extractPostIdForEmbed();
            const captured: CapturedPost = {
                id: this.captures.length + 1,
                screenshot,
                source,
                interest,
                postId,  // For Instagram embed rendering (display-only, not dedup)
                timestamp: Date.now(),
                scrollPosition: elementBox.y  // Use element Y as position
            };

            // Store capture
            this.captures.push(captured);

            // Save to disk for debugging if configured
            this.saveScreenshotToDisk(screenshot, source);

            // Log ONLY after capture is actually stored
            console.log(`\n📸 === CAPTURED #${captured.id} ===`);
            console.log(`   Target: (${elementBox.x}, ${elementBox.y}, ${elementBox.width}x${elementBox.height})`);
            console.log(`   Reason: ${reason || 'LLM focus'}`);
            console.log(`   Crop: ${captureRegion.width}x${captureRegion.height}px`);
            console.log(`   Source: ${source}${interest ? `: ${interest}` : ''}`);
            console.log(`==============================\n`);

            return captured;

        } catch (error) {
            console.error('📸 Focused capture failed:', error);
            return null;
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
        this.capturedFingerprints.clear();
        this.capturedHashes.clear();
        this.capturedPositions.clear();
        this.lastCaptureSource = '';
        console.log('📸 Collector cleared');
    }

    /**
     * Capture multiple frames during video playback.
     * Called when video content is detected. Simulates natural video watching
     * by capturing frames at intervals during the watch duration.
     *
     * @param source - Where this content came from (feed, story, etc.)
     * @param watchDurationMs - How long to watch (human-like: 8-20 seconds)
     * @param frameIntervalMs - Interval between frames (2-3 seconds)
     * @param fingerprint - Tree-based post fingerprint for video grouping
     * @returns Number of unique frames captured
     */
    async captureVideoFrames(
        source: CaptureSource,
        watchDurationMs: number = 12000,  // 12 second default watch time
        frameIntervalMs: number = 2500,    // Capture every 2.5 seconds
        fingerprint?: string
    ): Promise<number> {
        const videoId = fingerprint || this.extractPostIdForEmbed() || `video_${Date.now()}`;
        const maxFrames = Math.floor(watchDurationMs / frameIntervalMs);
        let capturedFrames = 0;
        let lastCapturedTime = -1;  // Track video playback time of last capture
        const startTime = Date.now();

        console.log(`🎬 Starting video frame capture: up to ${maxFrames} frames over ${(watchDurationMs / 1000).toFixed(1)}s`);

        while (Date.now() - startTime < watchDurationMs) {
            // Check memory limit
            if (this.captures.length >= this.config.maxCaptures) {
                console.log(`📸 Max captures reached, stopping video frames`);
                break;
            }

            // Check if we've captured enough frames
            if (capturedFrames >= maxFrames) {
                break;
            }

            // STATE-BASED: Check video state before capture
            const videoState = await this.getVideoState();

            // Skip if video not found or not playing
            if (!videoState?.found) {
                console.log(`🎬 No video found, waiting...`);
                await this.delay(500);
                continue;
            }

            // Skip if video is paused or buffering
            if (videoState.paused) {
                console.log(`🎬 Video paused, waiting...`);
                await this.delay(500);
                continue;
            }

            if (videoState.buffering) {
                console.log(`🎬 Video buffering, waiting...`);
                await this.delay(300);
                continue;
            }

            // Skip if playback time hasn't advanced enough (at least 2s since last capture)
            const minTimeAdvance = 2.0;  // seconds
            if (lastCapturedTime >= 0 && videoState.currentTime - lastCapturedTime < minTimeAdvance) {
                await this.delay(200);
                continue;
            }

            try {
                const screenshot = await this.page.screenshot({
                    type: 'jpeg',
                    quality: this.config.jpegQuality,
                    fullPage: false
                });

                // Perceptual hash dedup for similar frames
                const hash = await this.computePerceptualHash(screenshot);
                if (this.isSimilarToExisting(hash)) {
                    console.log(`🎬 Frame at ${videoState.currentTime.toFixed(1)}s: near-duplicate, skipping`);
                    lastCapturedTime = videoState.currentTime;  // Still advance to avoid re-checking same frame
                    await this.delay(frameIntervalMs);
                    continue;
                }
                this.capturedHashes.add(hash);

                // Store frame with video metadata
                this.captures.push({
                    id: this.captures.length + 1,
                    screenshot,
                    source,
                    postId: this.extractPostIdForEmbed(),
                    timestamp: Date.now(),
                    scrollPosition: 0,
                    isVideoFrame: true,
                    videoId,
                    frameIndex: capturedFrames + 1,
                    totalFrames: maxFrames
                });

                // Save to disk for debugging if configured
                this.saveScreenshotToDisk(screenshot, source);

                capturedFrames++;
                lastCapturedTime = videoState.currentTime;
                console.log(`🎬 Frame ${capturedFrames} captured at ${videoState.currentTime.toFixed(1)}s`);

                // Wait before next capture attempt
                await this.delay(frameIntervalMs);

            } catch (error) {
                console.error(`🎬 Frame capture failed:`, error);
                await this.delay(500);
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
     * Get the current count of captured photos/screenshots.
     * Used by LLM to track capture progress.
     */
    getPhotoCount(): number {
        return this.captures.length;
    }

    /**
     * Simple delay helper for video frame timing.
     */
    private delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Extract Instagram post ID from current URL for embed rendering.
     * Post URLs follow pattern: instagram.com/p/{POST_ID}/
     * Returns undefined for non-post pages (stories, feed, etc.)
     * NOTE: This is display-only (for Instagram embeds), NOT used for dedup.
     */
    private extractPostIdForEmbed(): string | undefined {
        const url = this.page.url();
        const match = url.match(/\/p\/([A-Za-z0-9_-]+)\//);
        return match?.[1];
    }

    /**
     * Compute a perceptual hash (average hash) of a screenshot.
     * Resilient to minor differences (scroll jitter, compression artifacts).
     * Returns a 64-bit hex string (16 hex chars).
     */
    private async computePerceptualHash(screenshot: Buffer): Promise<string> {
        try {
            const image = await Jimp.read(screenshot);
            image.resize({ w: 8, h: 8 });
            image.greyscale();

            const pixels: number[] = [];
            for (let y = 0; y < 8; y++) {
                for (let x = 0; x < 8; x++) {
                    const color = image.getPixelColor(x, y);
                    // R channel from 0xRRGGBBAA (after greyscale R=G=B)
                    pixels.push((color >> 24) & 0xFF);
                }
            }
            const mean = pixels.reduce((a, b) => a + b, 0) / pixels.length;

            let hex = '';
            for (let i = 0; i < 64; i += 4) {
                const nibble = [0,1,2,3].map(j => pixels[i+j] > mean ? '1' : '0').join('');
                hex += parseInt(nibble, 2).toString(16);
            }
            return hex;
        } catch {
            // Fallback to MD5 if perceptual hash fails
            return createHash('md5').update(screenshot).digest('hex');
        }
    }

    /**
     * Hamming distance between two hex hash strings (count differing bits).
     */
    private hammingDistance(hash1: string, hash2: string): number {
        // Different lengths = different hash types (MD5 fallback vs phash) — treat as unique
        if (hash1.length !== hash2.length) return 64;
        let distance = 0;
        for (let i = 0; i < hash1.length; i++) {
            let xor = parseInt(hash1[i], 16) ^ parseInt(hash2[i], 16);
            while (xor) { distance += xor & 1; xor >>= 1; }
        }
        return distance;
    }

    /**
     * Check if a hash is perceptually similar to any previously captured hash.
     * Default threshold 5 (~92% similar). Stories use 3 (dark background dominates hash).
     */
    private isSimilarToExisting(hash: string, threshold: number = 5): boolean {
        for (const existing of this.capturedHashes) {
            if (this.hammingDistance(hash, existing) <= threshold) return true;
        }
        return false;
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
     * Get video element state via CDP for synced frame capture.
     * Returns null if no video found on page.
     */
    private async getVideoState(): Promise<{
        found: boolean;
        paused: boolean;
        currentTime: number;
        buffering: boolean;
        duration: number;
    } | null> {
        try {
            const client = await this.page.context().newCDPSession(this.page);
            const result = await client.send('Runtime.evaluate', {
                expression: `
                    (() => {
                        const v = document.querySelector('video');
                        if (!v) return JSON.stringify({ found: false });
                        return JSON.stringify({
                            found: true,
                            paused: v.paused,
                            currentTime: v.currentTime,
                            buffering: v.readyState < 3,
                            duration: v.duration || 0
                        });
                    })()
                `,
                returnByValue: true
            });
            await client.detach();
            return JSON.parse(result.result.value as string);
        } catch {
            return null;
        }
    }

    /**
     * Append a line to the session log buffer.
     * Lines are timestamped relative to session start.
     */
    appendLog(line: string): void {
        const elapsed = ((Date.now() - this.sessionStartTime) / 1000).toFixed(1);
        this.logBuffer.push(`[${elapsed}s] ${line}`);
    }

    /**
     * Append a raw line (no timestamp prefix) to the session log buffer.
     * Used for headers, separators, and pre-formatted content.
     */
    appendLogRaw(line: string): void {
        this.logBuffer.push(line);
    }

    /**
     * Flush the session log buffer to a markdown file alongside screenshots.
     * Called at session end. Only writes if outputDir is configured.
     */
    flushSessionLog(): void {
        if (!this.outputDir || this.logBuffer.length === 0) return;

        const filepath = path.join(this.outputDir, 'session_log.md');
        const content = this.logBuffer.join('\n') + '\n';
        fs.writeFileSync(filepath, content, 'utf-8');
        console.log(`📝 Session log saved: ${filepath}`);
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
