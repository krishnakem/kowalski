/**
 * InstagramScraper - Orchestration Layer
 *
 * Coordinates the three-layer hybrid system:
 * - Physics Layer (GhostMouse, HumanScroll) - Cost: $0
 * - Blind Layer (A11yNavigator) - Cost: $0
 * - Vision Layer (ContentVision) - Cost: ~$0.01/viewport
 *
 * Research Sequence (15 minute session):
 * - Phase A: Active Search (~2-3 min) - Search each user interest
 * - Phase B: Story Watch (~7 min) - Watch available stories
 * - Phase C: Feed Scroll (~8 min) - Browse main feed
 *
 * Estimated cost per session: $0.08 - $0.15
 */

import { BrowserContext, Page } from 'playwright';
import { GhostMouse } from './GhostMouse.js';
import { HumanScroll } from './HumanScroll.js';
import { A11yNavigator } from './A11yNavigator.js';
import { ContentVision } from './ContentVision.js';
import { UsageService } from './UsageService.js';
import { StrategicGaze } from './StrategicGaze.js';
import { ScreenshotCollector } from './ScreenshotCollector.js';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { createHash } from 'crypto';
import {
    ExtractedPost,
    ScrapedSession,
    BrowsingSession,
    BoundingBox,
    ContentState,
    GazeTarget
} from '../../types/instagram.js';

// ============================================================================
// DEBUGGING & AUDIT TRAIL TYPES
// ============================================================================

/**
 * Decision Block for audit trail logging.
 * Each action is logged with its objective, state, rationale, and verification.
 */
interface DecisionBlock {
    timestamp: string;
    phase: 'SEARCH' | 'STORY' | 'FEED' | 'PROFILE' | 'CAROUSEL';
    action: string;
    objective: string;
    currentState: {
        view: string;
        scrollPosition?: number;
        visibleElements?: string[];
        contentType?: string;
    };
    rationale: string;
    verificationMarker: string;
}

/**
 * Loop detection state for identifying stuck navigation.
 */
interface LoopDetectionState {
    lastActions: Array<{
        action: string;
        coordinate?: { x: number; y: number };
        scrollPosition?: number;
        timestamp: number;
    }>;
    repeatCount: number;
}

/**
 * Search result captured during Active Search phase.
 */
interface SearchCapture {
    interest: string;
    posts: ExtractedPost[];
    capturedAt: string;
}

export class InstagramScraper {
    private context: BrowserContext;
    private apiKey: string;
    private usageCap: number;
    private usageService: UsageService;
    private debugMode: boolean;

    // Layer instances (created per-session)
    private ghost!: GhostMouse;
    private scroll!: HumanScroll;
    private navigator!: A11yNavigator;
    private vision!: ContentVision;
    private strategicGaze!: StrategicGaze;
    private screenshotCollector!: ScreenshotCollector;
    private page!: Page;

    // Track current view for gaze planning
    private lastKnownView: ContentState['currentView'] = 'unknown';

    // Metrics
    private visionApiCalls = 0;
    private skippedViewports = 0;

    // =========================================================================
    // DEBUGGING & LOOP DETECTION STATE
    // =========================================================================
    private loopDetection: LoopDetectionState = {
        lastActions: [],
        repeatCount: 0
    };
    private decisionLog: DecisionBlock[] = [];
    private diagnosticsDir: string = '';

    constructor(context: BrowserContext, apiKey: string, usageCap: number, debugMode: boolean = false) {
        this.context = context;
        this.apiKey = apiKey;
        this.usageCap = usageCap;
        this.usageService = UsageService.getInstance();
        this.debugMode = debugMode;
    }

    /**
     * Main scraping entry point - Research Sequence.
     *
     * Executes three phases:
     * 1. Active Search - Search each interest, capture results
     * 2. Story Watch - Watch available stories
     * 3. Feed Scroll - Browse main feed
     *
     * @param targetMinutes - Total browsing time (human-paced), split across phases
     * @param userInterests - Topics to search for in Phase A
     */
    async scrapeFeedAndStories(
        targetMinutes: number,
        userInterests: string[]
    ): Promise<ScrapedSession> {
        // === PRE-FLIGHT BUDGET CHECK ===
        const budget = await this.usageService.getBudgetStatus(this.usageCap);
        console.log(`💰 Budget Status: $${budget.currentSpend.toFixed(2)} spent, $${budget.remaining.toFixed(2)} remaining (~${budget.estimatedCallsRemaining} calls)`);

        if (budget.estimatedCallsRemaining < 3) {
            console.warn('💸 Budget too low for meaningful session (need at least 3 Vision calls)');
            throw new Error('BUDGET_EXCEEDED');
        }

        // Calculate max Vision calls for this session based on budget
        // Reserve some budget for final analysis generation (~$0.02)
        const ANALYSIS_RESERVE = 0.02;
        const availableForVision = Math.max(0, budget.remaining - ANALYSIS_RESERVE);
        const maxVisionCalls = Math.floor(availableForVision / 0.01);

        console.log(`📊 Session budget: max ${maxVisionCalls} Vision API calls`);

        const startTime = Date.now();

        // Reuse existing page if available (launchPersistentContext creates one)
        const existingPages = this.context.pages();
        this.page = existingPages.length > 0 ? existingPages[0] : await this.context.newPage();

        // Initialize layer instances
        this.ghost = new GhostMouse(this.page);
        this.scroll = new HumanScroll(this.page);
        this.navigator = new A11yNavigator(this.page);
        this.vision = new ContentVision(this.apiKey);
        this.strategicGaze = new StrategicGaze(this.apiKey);

        // Enable visible cursor in debug mode
        if (this.debugMode) {
            await this.ghost.enableVisibleCursor();
        }

        const feedContent: ExtractedPost[] = [];
        const storiesContent: ExtractedPost[] = [];
        const searchContent: ExtractedPost[] = [];

        try {
            // 1. Navigate to Instagram
            console.log('🌐 Navigating to Instagram...');
            await this.page.goto('https://www.instagram.com/', {
                waitUntil: 'domcontentloaded'
            });
            await this.humanDelay(2000, 4000);

            // 2. Check page state (FREE - no API call)
            const state = await this.navigator.getContentState();
            console.log('📊 Content State:', state);

            // Session validation should have been done by BrowserManager
            if (state.currentView === 'login') {
                throw new Error('SESSION_EXPIRED');
            }

            // === RESEARCH SEQUENCE ===
            // Time allocation (approximate):
            // - Phase A (Search): ~2-3 minutes (depends on interest count)
            // - Phase B (Stories): ~7 minutes
            // - Phase C (Feed): ~8 minutes

            // Budget allocation:
            // - Search: 1 call per interest (max 5)
            // - Stories: max 5 calls
            // - Feed: remaining budget
            const searchBudget = Math.min(userInterests.length, 5);
            const storyBudget = 5;
            const feedBudget = Math.max(0, maxVisionCalls - searchBudget - storyBudget);

            console.log(`📊 Budget allocation: Search=${searchBudget}, Stories=${storyBudget}, Feed=${feedBudget}`);

            // === PHASE A: ACTIVE SEARCH ===
            if (userInterests.length > 0 && this.visionApiCalls < maxVisionCalls) {
                console.log('\n🔍 ═══════════════════════════════════════');
                console.log('🔍 PHASE A: ACTIVE SEARCH');
                console.log('🔍 ═══════════════════════════════════════\n');

                const searchResults = await this.executeSearchPhase(userInterests, searchBudget);
                for (const result of searchResults) {
                    searchContent.push(...result.posts);
                }
            }

            // === PHASE B: STORY WATCH ===
            if (state.hasStories && this.visionApiCalls < maxVisionCalls) {
                console.log('\n🎬 ═══════════════════════════════════════');
                console.log('🎬 PHASE B: STORY WATCH');
                console.log('🎬 ═══════════════════════════════════════\n');

                // Return to home first
                await this.returnToHome();

                const stories = await this.exploreStories(storyBudget);
                storiesContent.push(...stories);
            }

            // === PHASE C: FEED SCROLL ===
            if (this.visionApiCalls < maxVisionCalls) {
                console.log('\n📜 ═══════════════════════════════════════');
                console.log('📜 PHASE C: FEED SCROLL');
                console.log('📜 ═══════════════════════════════════════\n');

                // Return to home first
                await this.returnToHome();

                // Allocate remaining time for feed (minimum 2 minutes)
                const elapsedMinutes = (Date.now() - startTime) / 60000;
                const remainingMinutes = Math.max(2, targetMinutes - elapsedMinutes);

                const feed = await this.exploreFeed(remainingMinutes, feedBudget);
                feedContent.push(...feed);
            }

        } catch (error: any) {
            console.error('❌ Scraping error:', error.message);
            // Re-throw known errors for upstream handling
            if (['SESSION_EXPIRED', 'RATE_LIMITED', 'VISION_RATE_LIMITED', 'BUDGET_EXCEEDED'].includes(error.message)) {
                throw error;
            }
            // For other errors, we'll return what we have so far
        } finally {
            await this.page.close();
        }

        // Combine search content with feed content for analysis
        // Search results are prepended so they appear first in the digest
        const combinedFeed = [...searchContent, ...feedContent];

        return {
            feedContent: combinedFeed,
            storiesContent,
            sessionDuration: Date.now() - startTime,
            visionApiCalls: this.visionApiCalls,
            skippedViewports: this.skippedViewports,
            scrapedAt: new Date().toISOString()
        };
    }

    // =========================================================================
    // SCREENSHOT-FIRST BROWSING (NEW ARCHITECTURE)
    // =========================================================================

    /**
     * Screenshot-First Browsing Session.
     *
     * This is the new architecture that:
     * 1. Browses Instagram naturally (like a human would)
     * 2. Screenshots each post/story as encountered
     * 3. Returns all screenshots for batch LLM processing
     *
     * NO Vision API calls during browsing - all analysis happens at the end.
     *
     * @param targetMinutes - Total browsing time
     * @param userInterests - Topics to search for
     * @returns BrowsingSession with all captured screenshots
     */
    async browseAndCapture(
        targetMinutes: number,
        userInterests: string[]
    ): Promise<BrowsingSession> {
        const startTime = Date.now();
        this.page = await this.context.newPage();

        // Initialize layer instances
        this.ghost = new GhostMouse(this.page);
        this.scroll = new HumanScroll(this.page);
        this.navigator = new A11yNavigator(this.page);
        this.vision = new ContentVision(this.apiKey);  // Keep for potential fallback
        this.strategicGaze = new StrategicGaze(this.apiKey);
        this.screenshotCollector = new ScreenshotCollector(this.page, {
            maxCaptures: 60,  // Capture more, ImageTagger will filter to best 25
            jpegQuality: 85,
            minScrollDelta: 200,
            saveToDirectory: path.join(os.homedir(), 'Documents', 'Kowalski', 'debug-screenshots')
        });

        // Enable visible cursor in debug mode
        if (this.debugMode) {
            await this.ghost.enableVisibleCursor();
        }

        try {
            // 1. Navigate to Instagram
            console.log('🌐 Navigating to Instagram...');
            await this.page.goto('https://www.instagram.com/', {
                waitUntil: 'domcontentloaded'
            });
            await this.humanDelay(2000, 4000);

            // 2. Check page state (FREE - no API call)
            const state = await this.navigator.getContentState();
            console.log('📊 Content State:', state);

            if (state.currentView === 'login') {
                throw new Error('SESSION_EXPIRED');
            }

            // === PHASE A: INTEREST SEARCH (capture results) ===
            if (userInterests.length > 0) {
                console.log('\n🔍 ═══════════════════════════════════════');
                console.log('🔍 PHASE A: INTEREST SEARCH (Screenshot-First)');
                console.log('🔍 ═══════════════════════════════════════\n');

                for (const interest of userInterests.slice(0, 3)) {
                    await this.searchAndCaptureScreenshot(interest);
                }
            }

            // === PHASE B: STORY WATCH (capture each story) ===
            if (state.hasStories) {
                console.log('\n🎬 ═══════════════════════════════════════');
                console.log('🎬 PHASE B: STORY WATCH (Screenshot-First)');
                console.log('🎬 ═══════════════════════════════════════\n');

                await this.returnToHome();
                await this.watchAndCaptureStories();
            }

            // === PHASE C: FEED BROWSE (capture posts) ===
            console.log('\n📜 ═══════════════════════════════════════');
            console.log('📜 PHASE C: FEED BROWSE (Screenshot-First)');
            console.log('📜 ═══════════════════════════════════════\n');

            await this.returnToHome();
            const elapsedMinutes = (Date.now() - startTime) / 60000;
            const remainingMinutes = Math.max(2, targetMinutes - elapsedMinutes);
            await this.browseFeedWithCapture(remainingMinutes);

        } catch (error: any) {
            console.error('❌ Browsing error:', error.message);
            if (['SESSION_EXPIRED', 'RATE_LIMITED'].includes(error.message)) {
                throw error;
            }
        } finally {
            // Log summary before closing
            this.screenshotCollector.logSummary();
            await this.page.close();
        }

        return {
            captures: this.screenshotCollector.getCaptures(),
            sessionDuration: Date.now() - startTime,
            captureCount: this.screenshotCollector.getCaptureCount(),
            scrapedAt: new Date().toISOString()
        };
    }

    /**
     * Search for an interest and capture screenshot (no Vision API).
     */
    private async searchAndCaptureScreenshot(interest: string): Promise<void> {
        console.log(`🔍 Searching for: "${interest}"`);

        try {
            // 1. Find and click Search button
            const searchButton = await this.navigator.findSearchButton();
            if (!searchButton?.boundingBox) {
                console.log('  ⚠️ Search button not found, skipping');
                return;
            }

            await this.clickWithGaze(searchButton.boundingBox, 'link', 'search');
            await this.humanDelay(1000, 2000);

            // 2. Find search input and type interest
            const searchInput = await this.navigator.findSearchInput();
            if (!searchInput?.boundingBox) {
                console.log('  ⚠️ Search input not found, skipping');
                await this.navigator.pressEscape();
                return;
            }

            await this.ghost.clickElementWithRole(searchInput.boundingBox, 'searchbox', 0.5);
            await this.humanDelay(300, 600);

            // Type and select from dropdown
            const searchResult = await this.navigator.enterSearchTerm(interest, this.ghost);
            if (searchResult.matchedResult) {
                console.log(`  ✅ Clicked dropdown result: "${searchResult.matchedResult}"`);
            }

            // 3. Wait for results to load
            await this.humanDelay(3000, 5000);

            // 4. Check if we're on a profile page
            const currentView = await this.navigator.getContentState();
            if (currentView.currentView === 'profile') {
                console.log(`  📍 On profile page, capturing...`);
                await this.screenshotCollector.captureCurrentPost('profile', interest);

                // Scroll down the profile a bit
                for (let i = 0; i < 2; i++) {
                    await this.scroll.scrollWithIntent(this.navigator);
                    await this.humanDelay(1500, 3000);
                    await this.screenshotCollector.captureCurrentPost('profile', interest);
                }
            } else {
                // On search results page
                await this.screenshotCollector.captureCurrentPost('search', interest);

                // Scroll and capture more search results
                await this.scroll.scrollWithIntent(this.navigator);
                await this.humanDelay(1500, 2500);
                await this.screenshotCollector.captureCurrentPost('search', interest);
            }

            // 5. Close search/return home
            await this.navigator.pressEscape();
            await this.humanDelay(1000, 2000);

        } catch (error: any) {
            console.error(`  ❌ Search error for "${interest}":`, error.message);
            await this.navigator.pressEscape().catch(() => {});
            await this.humanDelay(500, 1000);
        }
    }

    /**
     * Watch stories and capture each one (no Vision API).
     */
    private async watchAndCaptureStories(maxStories: number = 8): Promise<void> {
        console.log('🎬 Watching stories...');

        // Find and enter stories
        const storyCircles = await this.navigator.findStoryCircles();
        if (storyCircles.length === 0 || !storyCircles[0].boundingBox) {
            console.log('  No stories found');
            return;
        }

        await this.clickWithGaze(storyCircles[0].boundingBox, 'button', 'watch_story');
        await this.humanDelay(2000, 3000);  // Wait for story viewer to load

        // Debug: Discover story viewer buttons (helps learn Instagram's button names)
        if (this.debugMode) {
            console.log('  🔍 Discovering story viewer buttons...');
            await this.navigator.dumpInteractiveElements();
        }

        // Track what we've seen (for loop/change detection)
        let lastStoryHash = '';
        let stuckCount = 0;  // Track consecutive failed advances
        let storiesWatched = 0;

        for (let i = 0; i < maxStories; i++) {
            // Check if still in story viewer
            if (!this.navigator.isInStoryViewer()) {
                console.log('  📱 Exited story viewer');
                break;
            }

            // Get hash of current view (for change detection)
            const currentHash = await this.getQuickViewportHash();

            // Check if story changed from last iteration
            if (currentHash === lastStoryHash) {
                stuckCount++;
                console.log(`  ⚠️ Same story as before (${stuckCount}/3)`);
                if (stuckCount >= 3) {
                    console.log('  📱 Stuck on same story, exiting');
                    break;
                }
                // Try clicking next again
                await this.advanceStory();
                await this.humanDelay(800, 1200);
                continue;  // Check again without capturing
            }

            // New story - reset stuck counter
            stuckCount = 0;
            lastStoryHash = currentHash;

            // Check if this story is a video
            const videoInfo = await this.navigator.detectVideoContent();

            if (videoInfo.isVideo) {
                // Video story: capture frames (shorter duration - 3-5 seconds)
                console.log(`  🎬 Video story - capturing frames`);
                const watchDuration = 3000 + Math.random() * 2000;  // 3-5 seconds
                await this.screenshotCollector.captureVideoFrames('story', watchDuration, 1500);
            } else {
                // Photo story: single screenshot, minimal wait
                await this.screenshotCollector.captureCurrentPost('story');
                // Brief pause to seem human (but not the full story duration)
                await this.humanDelay(500, 1000);
            }
            storiesWatched++;
            console.log(`  📸 Story ${storiesWatched} captured`);

            // ADVANCE: Click next to move to next story
            const advanced = await this.advanceStory();
            if (!advanced) {
                console.log('  📱 Could not advance, may be at end of stories');
                stuckCount++;
            }

            // Wait for story transition
            await this.humanDelay(800, 1200);
        }

        // Exit stories
        await this.navigator.pressEscape();
        await this.humanDelay(500, 1000);

        console.log(`✅ Stories complete: ${storiesWatched} captured`);
    }

    /**
     * Advance to next story by clicking the right arrow button.
     * Falls back to keyboard if button not found.
     *
     * @returns true if advancement was attempted
     */
    private async advanceStory(): Promise<boolean> {
        // Try hierarchy-first approach: find buttons inside the story viewer container
        const storyContainer = await this.navigator.findStoryViewerContainer();

        const nextBtn = await this.navigator.findEdgeButton('right', {
            containerNodeId: storyContainer || undefined
        });

        if (nextBtn?.boundingBox) {
            console.log(`  ➡️ Clicking next: "${nextBtn.name}" at x=${Math.round(nextBtn.boundingBox.x)}`);
            await this.ghost.clickElement(nextBtn.boundingBox, 0.3);
            return true;
        }

        // Fallback: Try pressing right arrow key
        console.log('  ➡️ Button not found, trying arrow key');
        await this.page.keyboard.press('ArrowRight');
        return true;  // Assume it worked
    }

    /**
     * Quick viewport hash for change detection (low quality = fast).
     * Used to detect if story/content actually changed after navigation.
     */
    private async getQuickViewportHash(): Promise<string> {
        const screenshot = await this.page.screenshot({
            type: 'jpeg',
            quality: 20,  // Low quality for speed
            fullPage: false
        });
        return createHash('md5').update(screenshot).digest('hex').slice(0, 12);
    }

    /**
     * Explore a post deeply before capturing.
     *
     * This method implements "deep exploration" as requested:
     * 1. Expand truncated captions (click "more" button)
     * 2. Check for carousel posts and capture all slides
     *
     * @returns Object with number of slides captured (1 if not a carousel) and whether it's a carousel
     */
    private async explorePostDeeply(): Promise<{ capturedSlides: number; isCarousel: boolean; isVideo: boolean }> {
        let capturedSlides = 0;
        let isCarousel = false;
        let isVideo = false;

        // 1. Expand caption if truncated
        const moreButton = await this.navigator.findMoreButton();
        if (moreButton?.boundingBox) {
            console.log('  📝 Expanding truncated caption...');
            await this.ghost.clickElement(moreButton.boundingBox, 0.3);

            // INCREASED wait time for Instagram's caption expansion animation
            // Instagram uses a CSS transition that can take 500-1000ms
            await this.humanDelay(800, 1200);

            // Verify expansion by checking if "more" button is still visible
            const stillTruncated = await this.navigator.findMoreButton();
            if (stillTruncated?.boundingBox) {
                console.log('  📝 Caption still truncated, trying again...');
                await this.ghost.clickElement(stillTruncated.boundingBox, 0.3);
                await this.humanDelay(500, 800);
            }
        }

        // 2. Check for VIDEO content FIRST (reels, video posts)
        const videoInfo = await this.navigator.detectVideoContent();
        if (videoInfo.isVideo) {
            isVideo = true;
            console.log(`  🎬 Video post detected${videoInfo.hasAudio ? ' (with audio)' : ''}`);

            // Human-like watch duration: 8-20 seconds
            const watchDuration = 8000 + Math.random() * 12000;

            // Capture frames during natural watch time
            const frames = await this.screenshotCollector.captureVideoFrames('feed', watchDuration);
            capturedSlides = frames;

            return { capturedSlides, isCarousel, isVideo };
        }

        // 3. Check for carousel (multi-image post) - SPATIAL DISCOVERY
        // Use position-based reasoning instead of pattern matching
        const { next: carouselNext } = await this.navigator.findCarouselControls();

        // Debug: log available buttons if no carousel found
        if (!carouselNext) {
            const elements = await this.navigator.getAllInteractiveElements();
            const buttons = elements.filter(e => e.role === 'button').map(e => `"${e.name}"`).slice(0, 8);
            if (buttons.length > 0) {
                console.log(`  📋 Available buttons: ${buttons.join(', ')}`);
            }
        }

        if (carouselNext?.boundingBox) {
            isCarousel = true;
            console.log(`  🎠 Carousel detected: "${carouselNext.name}" [${carouselNext.role}]`);

            // Capture first slide
            await this.screenshotCollector.captureCurrentPost('carousel');
            capturedSlides++;

            // Navigate through remaining slides with verification
            const maxSlides = 10;
            let slideCount = 1;

            // Track slide indicator to verify navigation succeeded
            let previousSlideIndicator = await this.navigator.getCarouselSlideIndicator();
            if (previousSlideIndicator) {
                console.log(`  🎠 Starting at slide ${previousSlideIndicator.current} of ${previousSlideIndicator.total}`);
            }

            while (slideCount < maxSlides) {
                // Re-discover using spatial reasoning after each slide transition
                const { next: nextBtn } = await this.navigator.findCarouselControls();

                if (!nextBtn?.boundingBox) {
                    // No more slides - log for debugging
                    console.log(`  🎠 No next button found via spatial discovery`);
                    break;
                }

                // Click next slide
                await this.ghost.clickElement(nextBtn.boundingBox, 0.3);
                await this.humanDelay(800, 1500); // Wait for slide transition

                // VERIFY slide actually changed before capturing
                const currentSlideIndicator = await this.navigator.getCarouselSlideIndicator();
                if (currentSlideIndicator && previousSlideIndicator &&
                    currentSlideIndicator.current === previousSlideIndicator.current) {
                    console.log(`  🎠 Slide unchanged after click (still ${currentSlideIndicator.current}), stopping carousel`);
                    break;  // Navigation failed
                }
                previousSlideIndicator = currentSlideIndicator;

                // Capture this slide (ScreenshotCollector will dedupe via hash if needed)
                await this.screenshotCollector.captureCurrentPost('carousel');
                slideCount++;
                capturedSlides++;
            }

            console.log(`  🎠 Captured ${capturedSlides} carousel slides`);
        }

        return { capturedSlides, isCarousel, isVideo };
    }

    /**
     * Browse feed with POST-CENTERED capture and DEEP EXPLORATION (no Vision API).
     *
     * This method ensures each screenshot contains ONE post only by:
     * 1. Detecting post elements via accessibility tree
     * 2. Centering each post in the viewport before capturing
     * 3. Tracking captured posts by ABSOLUTE position (scroll + element Y) to avoid duplicates
     * 4. Deep exploration: expanding captions, exploring carousel slides
     *
     * FIXES APPLIED:
     * - Uses absolute Y position (scrollY + element.y) for deduplication (stable across scrolls)
     * - Single centering calculation (let scrollToElementByCDP handle it)
     * - Scroll verification to detect stuck situations
     */
    private async browseFeedWithCapture(targetMinutes: number): Promise<void> {
        const startTime = Date.now();
        const endTime = startTime + (targetMinutes * 60 * 1000);
        const capturedPostAbsoluteYs = new Set<number>();  // Track by absolute Y position
        let consecutiveEmpty = 0;
        const maxConsecutiveEmpty = 3;

        console.log(`🔄 Browsing feed (deep exploration mode) for ${targetMinutes.toFixed(1)} minutes...`);

        // Scroll to top to start fresh
        await this.scroll.scrollToTop();
        await this.humanDelay(1000, 2000);

        // Get viewport dimensions
        const viewportInfo = await this.scroll.getViewportInfo();
        const viewportHeight = viewportInfo.height;

        while (Date.now() < endTime) {
            // Check capture limit
            if (this.screenshotCollector.getCaptureCount() >= 60) {
                console.log('📸 Max captures reached, stopping browse');
                break;
            }

            // Get current scroll position for absolute Y calculation
            const currentScrollY = await this.scroll.getScrollPosition();

            // Find post elements in the current viewport (atomic to prevent staleness)
            const posts = await this.navigator.findPostElementsAtomic();

            // Find the first uncaptured post that's visible
            let targetPost: (typeof posts[0] & { absoluteY: number }) | null = null;
            for (const post of posts) {
                if (!post.boundingBox || !post.backendNodeId) continue;

                // Calculate ABSOLUTE Y position (scroll position + viewport-relative Y)
                // This is stable across scrolls - the same post will have the same absoluteY
                // Using 20px buckets for precision (was 50px, caused duplicates)
                // Using 100px buckets to prevent same post being "discovered" multiple times
                // due to DOM reflow or position drift (was 20px, too small)
                const absoluteY = Math.round((currentScrollY + post.boundingBox.y) / 100);

                // Check if post is at least partially visible in viewport
                const postTop = post.boundingBox.y;
                const postBottom = postTop + post.boundingBox.height;
                const isVisible = postTop < viewportHeight && postBottom > 0;

                if (isVisible && !capturedPostAbsoluteYs.has(absoluteY)) {
                    targetPost = { ...post, absoluteY };
                    break;
                }
            }

            if (targetPost && targetPost.boundingBox && targetPost.backendNodeId) {
                // Center this post in the viewport with verification and retry
                const centerResult = await this.scroll.scrollToElementCentered(
                    targetPost.backendNodeId,
                    2  // max 2 retry attempts
                );

                if (!centerResult.success) {
                    console.log(`  ⚠️ Centering incomplete (offset: ${Math.round(centerResult.finalOffset)}px), using fallback`);
                    await this.scroll.scroll({ baseDistance: 350 });
                }

                await this.humanDelay(400, 800);

                // Check for ad BEFORE any capture - skip sponsored content
                const adCheck = await this.navigator.detectAdContent();
                if (adCheck.isAd) {
                    console.log(`  🚫 Skipping ad: ${adCheck.reason}`);
                    capturedPostAbsoluteYs.add(targetPost.absoluteY);  // Mark as "seen"
                    consecutiveEmpty = 0;
                    continue;  // Skip to next post
                }

                // DEEP EXPLORATION: Expand caption, check for carousel
                const exploration = await this.explorePostDeeply();

                // Capture main post (only if not already captured as part of carousel)
                if (!exploration.isCarousel) {
                    await this.screenshotCollector.captureCurrentPost('feed');
                }

                capturedPostAbsoluteYs.add(targetPost.absoluteY);
                consecutiveEmpty = 0;

                // Human-like reading pause (varies by estimated content)
                const postHeight = targetPost.boundingBox.height;
                const readingTime = postHeight > 600
                    ? 2500 + Math.random() * 3000   // 2.5-5.5s for tall posts
                    : 1500 + Math.random() * 2000;  // 1.5-3.5s for shorter posts

                await this.humanDelay(readingTime, readingTime + 500);

                // Random longer pause (human behavior)
                if (Math.random() < 0.12) {
                    const pauseTime = 3000 + Math.random() * 4000;
                    console.log(`  ☕ Reading pause (${(pauseTime / 1000).toFixed(1)}s)...`);
                    await this.humanDelay(pauseTime, pauseTime + 500);
                }

                // Log progress occasionally
                const captureCount = this.screenshotCollector.getCaptureCount();
                if (captureCount % 5 === 0) {
                    console.log(`  📊 Captured ${captureCount} screenshots, ${capturedPostAbsoluteYs.size} unique posts`);
                }

            } else {
                // No uncaptured posts found in current view - scroll to load more
                consecutiveEmpty++;

                if (consecutiveEmpty >= maxConsecutiveEmpty) {
                    console.log('  📜 No new posts found after multiple attempts, ending browse');
                    break;
                }

                console.log(`  📜 No new posts visible, scrolling down (attempt ${consecutiveEmpty}/${maxConsecutiveEmpty})...`);
                await this.scroll.scrollWithIntent(this.navigator, {
                    baseDistance: 500,
                    variability: 0.2,
                    microAdjustProb: 0.15
                });
                await this.humanDelay(1500, 2500);
            }
        }

        console.log(`✅ Feed browse complete. Captured ${this.screenshotCollector.getCaptureCount()} screenshots (${capturedPostAbsoluteYs.size} unique posts)`);
    }

    // =========================================================================
    // PHASE A: ACTIVE SEARCH (LEGACY - for backward compatibility)
    // =========================================================================

    /**
     * Execute Active Search phase.
     * For each user interest:
     * 1. Click Search button
     * 2. Type interest term + press Enter to commit
     * 3. Wait 5-8 seconds for results to load
     * 4. Scroll 1-2 times to trigger lazy loading
     * 5. Capture screenshot with Vision API
     * 6. Close search and repeat
     *
     * @param interests - User interests to search for
     * @param maxCalls - Maximum Vision API calls for this phase
     */
    private async executeSearchPhase(
        interests: string[],
        maxCalls: number
    ): Promise<SearchCapture[]> {
        const captures: SearchCapture[] = [];
        const interestsToSearch = interests.slice(0, maxCalls); // Limit to budget

        for (const interest of interestsToSearch) {
            // Budget check
            if (this.visionApiCalls >= maxCalls) {
                console.log('💰 Search phase budget exhausted');
                break;
            }

            console.log(`🔍 Searching for: "${interest}"`);

            try {
                // === DECISION LOGGING: Search Intent ===
                const stateSummary = await this.getCurrentStateSummary();
                this.logDecision({
                    phase: 'SEARCH',
                    action: `Search for "${interest}"`,
                    objective: `Find content related to user interest: ${interest}`,
                    currentState: stateSummary,
                    rationale: `User specified "${interest}" as an interest. Searching to find relevant accounts and posts.`,
                    verificationMarker: `Search results panel opens AND results for "${interest}" are visible`
                });

                // 1. Find and click Search button (with gaze simulation)
                const searchButton = await this.navigator.findSearchButton();
                if (!searchButton?.boundingBox) {
                    console.log('  ⚠️ Search button not found, skipping');
                    continue;
                }

                // Use gaze-aware clicking for major UI interactions
                await this.clickWithGaze(searchButton.boundingBox, 'link', 'search');
                await this.humanDelay(1000, 2000);

                // 2. Find search input and type interest
                const searchInput = await this.navigator.findSearchInput();
                if (!searchInput?.boundingBox) {
                    console.log('  ⚠️ Search input not found, skipping');
                    await this.navigator.pressEscape();
                    await this.humanDelay(500, 1000);
                    continue;
                }

                // Click input to focus (with gaze-aware timing for text input)
                await this.ghost.clickElementWithRole(searchInput.boundingBox, 'searchbox', 0.5);
                await this.humanDelay(300, 600);

                // Human-like search: Type, wait for dropdown, click result
                // This is MORE human-like than typing + pressing Enter
                console.log(`  ⌨️ Typing "${interest}" and selecting from dropdown...`);
                const searchResult = await this.navigator.enterSearchTerm(interest, this.ghost);

                if (searchResult.matchedResult) {
                    console.log(`  ✅ Clicked dropdown result: "${searchResult.matchedResult}"`);
                } else if (searchResult.fallbackUsed) {
                    console.log(`  ⚠️ Used Enter key fallback (no dropdown match)`);
                }

                // 3. WAIT for results/navigation to complete
                // If we clicked a result, we may have navigated to a profile/hashtag page
                // If we pressed Enter, we're on the search results page
                const waitTime = 3000 + Math.random() * 2000;  // Reduced from 5-8s since dropdown already waited
                console.log(`  ⏳ Waiting ${(waitTime / 1000).toFixed(1)}s for results to load...`);
                await this.humanDelay(waitTime, waitTime + 500);

                // === NEW: Check if we navigated to a profile page ===
                // If so, do deep exploration (grid scroll + highlights)
                const currentView = await this.navigator.getContentState();
                if (currentView.currentView === 'profile') {
                    const profileUsername = this.navigator.getProfileUsername() || interest;
                    console.log(`  📍 Detected profile page: ${profileUsername}`);

                    // Deep exploration of the profile
                    const deepContent = await this.exploreProfileDeep(interest, profileUsername);

                    // Add to captures with proper tagging
                    if (deepContent.length > 0) {
                        captures.push({
                            interest,
                            posts: deepContent,
                            capturedAt: new Date().toISOString()
                        });
                        console.log(`  ✅ Deep-dive captured ${deepContent.length} items from ${profileUsername}`);
                    }

                    // Return home before next search
                    await this.returnToHome();
                    continue; // Skip the normal capture flow since we did deep exploration
                }

                // 4. SCROLL to trigger lazy loading (1-2 small scrolls)
                const scrollCount = 1 + Math.floor(Math.random() * 2); // 1 or 2 scrolls
                console.log(`  📜 Scrolling ${scrollCount}x to trigger lazy loading...`);
                for (let i = 0; i < scrollCount; i++) {
                    await this.scroll.scroll({
                        baseDistance: 200 + Math.random() * 150,  // Smaller scrolls
                        variability: 0.2,
                        microAdjustProb: 0.1,
                        readingPauseMs: [1000, 2000]  // Shorter pauses
                    });
                }

                // Brief pause after scrolling
                await this.humanDelay(1000, 1500);

                // 5. Capture search results with Vision API
                const canAfford = await this.usageService.canAffordVisionCall(this.usageCap);
                if (!canAfford) {
                    console.log('💸 Budget exhausted during search phase');
                    break;
                }

                console.log(`  📸 Capturing search results (Vision API call #${this.visionApiCalls + 1})`);
                const result = await this.vision.extractVisibleContent(this.page);
                this.visionApiCalls++;

                if (result.success && result.posts.length > 0) {
                    captures.push({
                        interest,
                        posts: result.posts.map(p => ({
                            ...p,
                            // Tag posts with the search interest for context
                            caption: `[SEARCH: ${interest}] ${p.caption || p.visualDescription || ''}`
                        })),
                        capturedAt: new Date().toISOString()
                    });
                    console.log(`  ✅ Found ${result.posts.length} results for "${interest}"`);
                } else {
                    console.log(`  📭 No results captured for "${interest}"`);
                    if (result.skipped) {
                        this.skippedViewports++;
                    }
                }

                // 6. Close search panel
                await this.navigator.pressEscape();
                await this.humanDelay(1000, 2000);

            } catch (error: any) {
                console.error(`  ❌ Search error for "${interest}":`, error.message);
                // Try to recover by pressing escape
                await this.navigator.pressEscape().catch(() => {});
                await this.humanDelay(500, 1000);
            }
        }

        console.log(`✅ Search phase complete. Captured ${captures.length} interest searches`);
        return captures;
    }

    // =========================================================================
    // PHASE B: STORY WATCH
    // =========================================================================

    /**
     * Stories exploration using Blind Navigation + Vision Extraction.
     *
     * @param maxCalls - Maximum Vision API calls for this phase
     */
    private async exploreStories(maxCalls: number): Promise<ExtractedPost[]> {
        const stories: ExtractedPost[] = [];

        console.log('🎬 Exploring stories...');

        // Find story circles using A11y (FREE)
        const storyCircles = await this.navigator.findStoryCircles();

        if (storyCircles.length === 0) {
            console.log('  No stories found');
            return stories;
        }

        // Click first story using gaze-aware clicking
        const firstStory = storyCircles[0];
        if (firstStory.boundingBox) {
            await this.clickWithGaze(firstStory.boundingBox, 'button', 'watch_story');
            await this.humanDelay(2000, 3000);  // Wait for story to load
        } else {
            console.log('  Could not click first story (no bounding box)');
            return stories;
        }

        // Watch stories up to budget limit (extended for 7-minute target)
        const maxStories = Math.min(maxCalls, storyCircles.length, 12);
        let storiesWatched = 0;

        for (let i = 0; i < maxStories; i++) {
            // Budget check
            if (storiesWatched >= maxCalls) {
                console.log('💰 Story phase budget exhausted');
                break;
            }

            // Check we're still in story viewer (FREE - URL check)
            if (!this.navigator.isInStoryViewer()) {
                console.log('  Exited story viewer');
                break;
            }

            // Budget check before Vision call
            const canAfford = await this.usageService.canAffordVisionCall(this.usageCap);
            if (!canAfford) {
                console.log('💸 Budget exhausted during story phase');
                break;
            }

            // Extract story content (PAID - Vision API)
            const storyContent = await this.vision.extractStoryContent(this.page);
            this.visionApiCalls++;
            storiesWatched++;

            if (storyContent) {
                stories.push(storyContent);
                console.log(`  📖 Story ${i + 1}: ${storyContent.username}`);
            }

            // === CONTENT-AWARE TIMING ===
            // Humans spend different amounts of time based on content type:
            // - Text-heavy stories (captions, announcements): 6-10 seconds to read
            // - Photo-only stories: 2-4 seconds
            // - Video content: watch duration varies (handled by video detection)
            const isTextHeavy = storyContent?.caption && storyContent.caption.length > 50;
            const isVideo = storyContent?.isVideoContent;

            if (isVideo) {
                // Video: medium viewing time (assume 5-15 second videos)
                console.log(`  🎬 Video story - watching...`);
                await this.humanDelay(5000, 15000);
            } else if (isTextHeavy) {
                // Text-heavy: longer reading time (6-10 seconds)
                console.log(`  📝 Text-heavy story - reading...`);
                await this.humanDelay(6000, 10000);
            } else {
                // Photo-only: quick glance (2-4 seconds)
                console.log(`  📷 Photo story - quick view...`);
                await this.humanDelay(2000, 4000);
            }

            // Advance to next story - SPATIAL DISCOVERY (position-based)
            const nextStoryBtn = await this.navigator.findEdgeButton('right');

            if (nextStoryBtn?.boundingBox) {
                console.log(`  🎯 Found next via spatial: "${nextStoryBtn.name}" at x=${nextStoryBtn.boundingBox.x}`);
                await this.ghost.clickElement(nextStoryBtn.boundingBox, 0.3);
            } else {
                // Fallback: blind click right zone (stories may not have visible buttons)
                const viewportSize = this.page.viewportSize();
                if (viewportSize) {
                    const rightZone = {
                        x: viewportSize.width * 0.6,
                        y: viewportSize.height * 0.2,
                        width: viewportSize.width * 0.35,
                        height: viewportSize.height * 0.6
                    };
                    await this.ghost.clickElement(rightZone, 0.2);
                }
            }

            await this.humanDelay(1000, 2000);
        }

        // Exit stories using CDP-based key press (undetectable)
        await this.navigator.pressEscape();
        await this.humanDelay(1000, 2000);

        console.log(`✅ Stories complete. Watched ${stories.length} stories`);
        return stories;
    }

    // =========================================================================
    // PHASE C: FEED SCROLL
    // =========================================================================

    /**
     * Feed exploration using Hybrid Loop:
     * 1. MOVE: Scroll using Physics Layer (FREE)
     * 2. CHECK: Verify content with A11y Layer (FREE)
     * 3. EXTRACT: Call Vision API only when content confirmed (PAID)
     *
     * @param targetMinutes - Time to spend scrolling
     * @param maxCalls - Maximum Vision API calls for this phase
     */
    private async exploreFeed(
        targetMinutes: number,
        maxCalls: number
    ): Promise<ExtractedPost[]> {
        const startTime = Date.now();
        const endTime = startTime + (targetMinutes * 60 * 1000);
        const extractedContent: ExtractedPost[] = [];
        const seenPostKeys = new Set<string>();

        let scrollCount = 0;
        let consecutiveDuplicates = 0;
        let feedVisionCalls = 0;
        const maxScrollsBeforeExtract = 3;  // Extract every 3 scrolls

        console.log(`🔄 Starting feed exploration for ${targetMinutes.toFixed(1)} minutes (max ${maxCalls} calls)`);

        // Scroll to top to start fresh
        await this.scroll.scrollToTop();
        await this.humanDelay(1000, 2000);

        while (Date.now() < endTime) {
            // CHECK: Should we stop? (Multi-signal termination)
            const termination = this.navigator.shouldStopBrowsing(
                scrollCount,
                extractedContent.length,
                startTime,
                consecutiveDuplicates
            );

            if (termination.shouldStop) {
                console.log(`✅ Stopping feed exploration: ${termination.reason}`);
                break;
            }

            // === BUDGET CHECK ===
            if (feedVisionCalls >= maxCalls) {
                console.log(`💰 Feed budget limit reached (${feedVisionCalls}/${maxCalls} calls). Stopping extraction.`);
                break;
            }

            // === DECISION LOGGING: Feed Scroll ===
            if (scrollCount % 3 === 0 || scrollCount === 0) {
                const stateSummary = await this.getCurrentStateSummary();
                this.logDecision({
                    phase: 'FEED',
                    action: `Scroll #${scrollCount + 1}`,
                    objective: 'Discover new content by scrolling feed',
                    currentState: stateSummary,
                    rationale: `Content type is ${stateSummary.contentType || 'unknown'}. Adapting scroll distance and pause accordingly.`,
                    verificationMarker: `ScrollY increases AND new posts become visible (not same posts as before)`
                });
            }

            // Track for loop detection
            const scrollPosBefore = await this.scroll.getScrollPosition();

            // MOVE: Content-aware scroll (FREE) - adapts to text vs image content
            const scrollResult = await this.scroll.scrollWithIntent(this.navigator, {
                variability: 0.25,
                microAdjustProb: 0.2
                // baseDistance and readingPauseMs determined by content density
            });

            // Track action for loop detection
            await this.trackActionForLoopDetection('scroll', undefined, scrollPosBefore);

            scrollCount++;

            // Log content type occasionally
            if (scrollCount % 5 === 1) {
                console.log(`  📊 Content type: ${scrollResult.contentType} (scrolled ${scrollResult.scrollDistance}px)`);
            }

            // CHECK: Is there content? (FREE - A11y check)
            const state = await this.navigator.getContentState();

            if (!state.hasPosts) {
                console.log('⚠️ No posts detected, waiting...');
                await this.humanDelay(2000, 3000);
                continue;
            }

            // EXTRACT: Only call Vision API periodically (PAID)
            if (scrollCount % maxScrollsBeforeExtract === 0) {
                // Real-time budget check before each Vision call
                const canAfford = await this.usageService.canAffordVisionCall(this.usageCap);
                if (!canAfford) {
                    console.log('💸 Real-time budget check failed. Stopping.');
                    break;
                }

                console.log(`📸 Extracting content (Vision API call #${this.visionApiCalls + 1})`);

                const result = await this.vision.extractVisibleContent(this.page);
                this.visionApiCalls++;
                feedVisionCalls++;

                if (result.skipped) {
                    this.skippedViewports++;
                    consecutiveDuplicates++;  // Count as potential duplicate situation
                    continue;
                }

                if (result.success) {
                    // Deduplicate by username + caption prefix
                    let newPostsThisRound = 0;
                    for (const post of result.posts) {
                        const key = `${post.username}-${post.caption.slice(0, 50)}`;
                        if (!seenPostKeys.has(key)) {
                            seenPostKeys.add(key);
                            extractedContent.push(post);
                            newPostsThisRound++;
                            console.log(`  📝 Found: ${post.username}`);
                        }
                    }

                    // Track duplicates for termination detection
                    if (newPostsThisRound === 0) {
                        consecutiveDuplicates++;
                    } else {
                        consecutiveDuplicates = 0;  // Reset on new content
                    }

                    // === Check for carousel using SPATIAL DISCOVERY ===
                    const { next: carouselNext } = await this.navigator.findCarouselControls();
                    if (carouselNext?.boundingBox) {
                        console.log(`  🎠 Carousel detected via spatial at x=${carouselNext.boundingBox.x}`);
                        const carouselSlides = await this.exploreCarousel('feed', 'feed_carousel');
                        for (const slide of carouselSlides) {
                            const slideKey = `${slide.username}-${slide.caption.slice(0, 50)}`;
                            if (!seenPostKeys.has(slideKey)) {
                                seenPostKeys.add(slideKey);
                                extractedContent.push(slide);
                            }
                        }
                    }
                }
            }

            // Random longer pause occasionally (human behavior) - extended for 8-minute target
            if (Math.random() < 0.12) {
                console.log('☕ Taking a longer pause...');
                await this.humanDelay(8000, 15000);
            }
        }

        console.log(`✅ Feed exploration complete. Extracted ${extractedContent.length} posts`);
        return extractedContent;
    }

    // =========================================================================
    // RECURSIVE EXPLORATION METHODS
    // =========================================================================

    /**
     * Explore a carousel post by clicking through all slides.
     * Captures each slide with Vision API.
     *
     * FIXED: Proper actionability checks with hover, animation buffer, and slide verification.
     *
     * @param context - Context label for the carousel (e.g., "feed", interest name)
     * @param slidePrefix - Prefix for slide labels
     * @returns Array of captured slides as ExtractedPosts
     */
    private async exploreCarousel(
        context: string,
        slidePrefix: string
    ): Promise<ExtractedPost[]> {
        const slides: ExtractedPost[] = [];
        let slideNumber = 1;
        const maxSlides = 10; // Safety limit
        const maxRetries = 2; // Retry failed navigations

        console.log(`    🎠 Exploring carousel for "${context}"...`);

        // Get initial slide indicator (if available)
        let previousSlideIndicator = await this.navigator.getCarouselSlideIndicator();
        if (previousSlideIndicator) {
            console.log(`    🎠 Starting at slide ${previousSlideIndicator.current} of ${previousSlideIndicator.total}`);
        }

        while (slideNumber <= maxSlides) {
            // SPATIAL DISCOVERY: find Next button by position
            const { next: nextButton } = await this.navigator.findCarouselControls();

            if (!nextButton?.boundingBox) {
                console.log(`    🎠 Carousel complete (${slideNumber - 1} slides) - no next button found`);
                break;
            }

            // === ACTIONABILITY CHECK: Hover before clicking ===
            const hoverDuration = 800 + Math.random() * 700;
            console.log(`    🎠 Hovering over button at x=${nextButton.boundingBox.x}`);
            await this.ghost.hoverElement(nextButton.boundingBox, hoverDuration, 0.3);

            // Re-discover after hover (element may have moved)
            const { next: nextButtonAfterHover } = await this.navigator.findCarouselControls();
            if (!nextButtonAfterHover?.boundingBox) {
                console.log(`    ⚠️ Button disappeared after hover, skipping`);
                break;
            }

            // === CLICK with retry logic (using role-specific timing) ===
            let navigationSucceeded = false;
            for (let attempt = 0; attempt < maxRetries; attempt++) {
                // Click Next with button-specific timing
                await this.ghost.clickElementWithRole(nextButtonAfterHover.boundingBox, 'button', 0.3);

                // === ANIMATION BUFFER: Wait for slide transition ===
                // 1.5-3 second buffer for CSS transitions to complete (randomized)
                await this.humanDelay(1500, 3000);

                // === VERIFICATION: Check slide indicator changed ===
                const currentSlideIndicator = await this.navigator.getCarouselSlideIndicator();

                if (currentSlideIndicator) {
                    // Check if we actually moved to a new slide
                    if (!previousSlideIndicator ||
                        currentSlideIndicator.current !== previousSlideIndicator.current) {
                        console.log(`    🎠 Navigation verified: now on slide ${currentSlideIndicator.current} of ${currentSlideIndicator.total}`);
                        previousSlideIndicator = currentSlideIndicator;
                        navigationSucceeded = true;
                        break;
                    } else {
                        console.log(`    ⚠️ Slide indicator unchanged (attempt ${attempt + 1}/${maxRetries}), retrying...`);
                        await this.humanDelay(500, 800);
                    }
                } else {
                    // No indicator found - assume navigation worked if button was clicked
                    console.log(`    🎠 No slide indicator found, assuming navigation succeeded`);
                    navigationSucceeded = true;
                    break;
                }
            }

            if (!navigationSucceeded) {
                console.log(`    ⚠️ Failed to navigate after ${maxRetries} attempts, stopping carousel`);
                break;
            }

            // Budget check
            const canAfford = await this.usageService.canAffordVisionCall(this.usageCap);
            if (!canAfford) {
                console.log('    💸 Budget exhausted during carousel');
                break;
            }

            // === CAPTION EXTRACTION (FREE - A11y tree) ===
            // Try to get caption from accessibility tree before Vision call
            const moreButton = await this.navigator.findMoreButton();
            if (moreButton?.boundingBox) {
                console.log(`    📝 Expanding truncated caption...`);
                await this.ghost.clickElement(moreButton.boundingBox, 0.3);
                await this.humanDelay(500, 800);
            }
            const rawCaption = await this.navigator.findPostCaption();

            // Capture this slide with Vision API
            const result = await this.vision.extractVisibleContent(this.page);
            this.visionApiCalls++;

            if (result.success && result.posts.length > 0) {
                // Tag with carousel context and include raw caption
                for (const post of result.posts) {
                    const captionText = rawCaption || post.caption || post.visualDescription || '';
                    slides.push({
                        ...post,
                        caption: `[CAROUSEL: ${context} slide ${slideNumber}] ${captionText}`
                    });
                }
                console.log(`    🎠 Captured slide ${slideNumber}${rawCaption ? ' (with caption)' : ''}`);
            }

            slideNumber++;
        }

        return slides;
    }

    /**
     * Deep exploration of a profile page.
     * 1. Scroll through recent posts grid (2 minutes)
     * 2. Explore first 2 Story Highlights (30s each)
     *
     * @param interest - The search interest (for labeling)
     * @param profileUsername - Username being explored
     * @returns Array of captured content as ExtractedPosts
     */
    private async exploreProfileDeep(
        interest: string,
        profileUsername: string
    ): Promise<ExtractedPost[]> {
        const content: ExtractedPost[] = [];
        const startTime = Date.now();
        // Randomize durations to avoid predictable patterns
        // Profile grid: 1.5-2.5 minutes (randomized)
        const profileDuration = (90 + Math.random() * 60) * 1000;
        // Highlight viewing: 25-40 seconds per highlight (randomized)
        const highlightDuration = (25 + Math.random() * 15) * 1000;

        console.log(`    👤 Deep-diving into ${profileUsername}'s profile...`);

        // === PHASE 1: Grid Scroll (2 minutes) ===
        let scrollCount = 0;
        const maxGridScrolls = 6; // Limit scrolls to stay within time

        while (Date.now() - startTime < profileDuration && scrollCount < maxGridScrolls) {
            // Scroll down the profile grid
            await this.scroll.scroll({
                baseDistance: 250 + Math.random() * 150,
                variability: 0.2,
                microAdjustProb: 0.1,
                readingPauseMs: [2000, 4000]
            });
            scrollCount++;

            // Capture every other scroll
            if (scrollCount % 2 === 0) {
                const canAfford = await this.usageService.canAffordVisionCall(this.usageCap);
                if (!canAfford) {
                    console.log('    💸 Budget exhausted during profile grid');
                    break;
                }

                const result = await this.vision.extractVisibleContent(this.page);
                this.visionApiCalls++;

                if (result.success && result.posts.length > 0) {
                    for (const post of result.posts) {
                        content.push({
                            ...post,
                            caption: `[PROFILE: ${profileUsername}] ${post.caption || post.visualDescription || ''}`
                        });
                    }
                    console.log(`    👤 Captured ${result.posts.length} grid posts`);
                }
            }
        }

        // === PHASE 2: Story Highlights (30s each, max 2) ===
        // Scroll back to top first
        await this.scroll.scrollToTop();
        await this.humanDelay(1500, 2500);

        const highlights = await this.navigator.findHighlights();
        const highlightsToExplore = Math.min(highlights.length, 2);

        console.log(`    ✨ Found ${highlights.length} highlights, exploring ${highlightsToExplore}...`);

        for (let i = 0; i < highlightsToExplore; i++) {
            const highlight = highlights[i];
            if (!highlight.boundingBox) continue;

            // Click highlight (with gaze-aware interaction for profile exploration)
            console.log(`    ✨ Opening highlight: "${highlight.name}"`);
            await this.clickWithGaze(highlight.boundingBox, 'button');
            await this.humanDelay(2000, 3000);

            // Watch highlight for 30 seconds, capturing periodically
            const highlightStart = Date.now();
            let captureCount = 0;

            while (Date.now() - highlightStart < highlightDuration && captureCount < 3) {
                const canAfford = await this.usageService.canAffordVisionCall(this.usageCap);
                if (!canAfford) break;

                const result = await this.vision.extractVisibleContent(this.page);
                this.visionApiCalls++;
                captureCount++;

                if (result.success && result.posts.length > 0) {
                    for (const post of result.posts) {
                        content.push({
                            ...post,
                            caption: `[HIGHLIGHT: ${profileUsername} - ${highlight.name}] ${post.caption || post.visualDescription || ''}`
                        });
                    }
                }

                // Advance to next slide in highlight - SPATIAL DISCOVERY
                const nextBtn = await this.navigator.findEdgeButton('right');
                if (nextBtn?.boundingBox) {
                    await this.ghost.clickElement(nextBtn.boundingBox, 0.3);
                } else {
                    // Fallback: blind click right zone (highlights may not have visible buttons)
                    const viewportSize = this.page.viewportSize();
                    if (viewportSize) {
                        const rightZone = {
                            x: viewportSize.width * 0.7,
                            y: viewportSize.height * 0.3,
                            width: viewportSize.width * 0.25,
                            height: viewportSize.height * 0.4
                        };
                        await this.ghost.clickElement(rightZone, 0.2);
                    }
                }
                await this.humanDelay(5000, 8000);
            }

            // Exit highlight using CDP-based key press (undetectable)
            await this.navigator.pressEscape();
            await this.humanDelay(1000, 1500);
        }

        console.log(`    👤 Profile deep-dive complete. Captured ${content.length} items`);
        return content;
    }

    // =========================================================================
    // DEBUGGING & AUDIT TRAIL SYSTEM
    // =========================================================================

    /**
     * Log a Decision Block to terminal and internal log.
     * Provides conversational audit trail explaining the "Why" behind every "How".
     */
    private logDecision(decision: Omit<DecisionBlock, 'timestamp'>): void {
        const block: DecisionBlock = {
            ...decision,
            timestamp: new Date().toISOString()
        };

        this.decisionLog.push(block);

        // Terminal output with clear formatting
        console.log('\n┌───────────────────────────────────────────────────────────────────');
        console.log(`│ 📋 DECISION BLOCK [${block.phase}]`);
        console.log('├───────────────────────────────────────────────────────────────────');
        console.log(`│ 🎯 OBJECTIVE: ${block.objective}`);
        console.log(`│ 📍 ACTION: ${block.action}`);
        console.log(`│ 📊 STATE: View=${block.currentState.view}` +
            (block.currentState.scrollPosition !== undefined ? `, ScrollY=${block.currentState.scrollPosition}px` : '') +
            (block.currentState.contentType ? `, Content=${block.currentState.contentType}` : ''));
        if (block.currentState.visibleElements && block.currentState.visibleElements.length > 0) {
            console.log(`│ 👁️ VISIBLE: ${block.currentState.visibleElements.slice(0, 5).join(', ')}${block.currentState.visibleElements.length > 5 ? '...' : ''}`);
        }
        console.log(`│ 💭 RATIONALE: ${block.rationale}`);
        console.log(`│ ✓ VERIFY: ${block.verificationMarker}`);
        console.log('└───────────────────────────────────────────────────────────────────\n');
    }

    /**
     * Track action for loop detection.
     * If the same action is repeated 3 times without state change, trigger diagnostic.
     */
    private async trackActionForLoopDetection(
        action: string,
        coordinate?: { x: number; y: number },
        scrollPosition?: number
    ): Promise<void> {
        const now = Date.now();

        // Add to action history (keep last 10)
        this.loopDetection.lastActions.push({
            action,
            coordinate,
            scrollPosition,
            timestamp: now
        });

        if (this.loopDetection.lastActions.length > 10) {
            this.loopDetection.lastActions.shift();
        }

        // Check for repeated actions (last 3 actions identical)
        const last3 = this.loopDetection.lastActions.slice(-3);
        if (last3.length === 3) {
            const allSame = last3.every(a => {
                const first = last3[0];
                const actionMatch = a.action === first.action;
                const coordMatch = (!a.coordinate && !first.coordinate) ||
                    (a.coordinate && first.coordinate &&
                     Math.abs(a.coordinate.x - first.coordinate.x) < 50 &&
                     Math.abs(a.coordinate.y - first.coordinate.y) < 50);
                const scrollMatch = a.scrollPosition === undefined ||
                    first.scrollPosition === undefined ||
                    Math.abs((a.scrollPosition || 0) - (first.scrollPosition || 0)) < 50;

                return actionMatch && coordMatch && scrollMatch;
            });

            if (allSame) {
                this.loopDetection.repeatCount++;

                if (this.loopDetection.repeatCount >= 3) {
                    await this.triggerDiagnosticSnapshot(action, coordinate);
                }
            } else {
                this.loopDetection.repeatCount = 0;
            }
        }
    }

    /**
     * Trigger a diagnostic snapshot when a navigation loop is detected.
     * Saves screenshot and A11y tree dump for debugging.
     */
    private async triggerDiagnosticSnapshot(
        action: string,
        coordinate?: { x: number; y: number }
    ): Promise<void> {
        console.log('\n⚠️ ═══════════════════════════════════════════════════════════════');
        console.log('⚠️ NAVIGATION LOOP DETECTED');
        console.log('⚠️ ═══════════════════════════════════════════════════════════════\n');

        // Ensure diagnostics directory exists
        if (!this.diagnosticsDir) {
            this.diagnosticsDir = path.join(process.cwd(), 'diagnostics');
            if (!fs.existsSync(this.diagnosticsDir)) {
                fs.mkdirSync(this.diagnosticsDir, { recursive: true });
            }
        }

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

        try {
            // Save screenshot
            const screenshotPath = path.join(this.diagnosticsDir, `loop_detected_screen_${timestamp}.png`);
            await this.page.screenshot({ path: screenshotPath, fullPage: false });
            console.log(`📸 Screenshot saved: ${screenshotPath}`);

            // Dump A11y tree
            const a11yTree = await this.navigator.getFullAccessibilityTree();
            const treePath = path.join(this.diagnosticsDir, `loop_diagnostic_tree_${timestamp}.json`);
            fs.writeFileSync(treePath, JSON.stringify({
                timestamp,
                action,
                coordinate,
                repeatCount: this.loopDetection.repeatCount,
                lastActions: this.loopDetection.lastActions,
                decisionLog: this.decisionLog.slice(-10),
                accessibilityTree: a11yTree.slice(0, 100)  // Limit to first 100 nodes
            }, null, 2));
            console.log(`📋 A11y tree dump saved: ${treePath}`);

            // Throw descriptive error
            const coordStr = coordinate ? `(${coordinate.x}, ${coordinate.y})` : 'N/A';
            throw new Error(`Navigation Loop Detected: LLM repeated [${action}] at [${coordStr}] without page progress. Diagnostics saved to ${this.diagnosticsDir}`);

        } catch (error: any) {
            if (error.message.includes('Navigation Loop Detected')) {
                throw error;  // Re-throw loop detection error
            }
            console.error('❌ Failed to save diagnostic snapshot:', error.message);
        }
    }

    /**
     * Get current state summary for decision logging.
     */
    private async getCurrentStateSummary(): Promise<DecisionBlock['currentState']> {
        try {
            const contentState = await this.navigator.getContentState();
            const scrollPos = await this.scroll.getScrollPosition();
            const contentDensity = await this.navigator.analyzeContentDensity();

            // Get visible elements (limited for performance)
            const gazeTargets = await this.navigator.findGazeTargets(5);
            const visibleElements = gazeTargets.map(t => `${t.role}:${t.label.slice(0, 20)}`);

            return {
                view: contentState.currentView,
                scrollPosition: scrollPos,
                contentType: contentDensity.type,
                visibleElements
            };
        } catch {
            return { view: 'unknown' };
        }
    }

    // =========================================================================
    // UTILITY METHODS
    // =========================================================================

    /**
     * Return to Instagram home page.
     */
    private async returnToHome(): Promise<void> {
        if (!this.navigator.isOnFeed()) {
            console.log('🏠 Returning to home...');
            await this.page.goto('https://www.instagram.com/', {
                waitUntil: 'domcontentloaded'
            });
            await this.humanDelay(2000, 3000);
            // Reset gaze planning for new view
            this.strategicGaze.reset();
            this.lastKnownView = 'feed';
        }
    }

    /**
     * Human-like delay with random variation.
     */
    private humanDelay(min: number, max: number): Promise<void> {
        const delay = min + Math.random() * (max - min);
        return new Promise(resolve => setTimeout(resolve, delay));
    }

    // =========================================================================
    // GAZE-AWARE INTERACTION METHODS
    // =========================================================================

    /**
     * Click an element with human-like gaze simulation.
     *
     * This implements the "Look, then Move" pattern:
     * 1. Check if view changed (triggers LLM gaze planning)
     * 2. Find nearby visually interesting elements (gaze anchors)
     * 3. Execute gaze-lag movement: scan anchors → ballistic → corrective → click
     *
     * Falls back to normal clicking if gaze planning fails.
     *
     * @param boundingBox - Element to click
     * @param role - Accessibility role for timing adjustment
     * @param action - Optional action description for intent inference
     */
    private async clickWithGaze(
        boundingBox: BoundingBox,
        role: string = 'button',
        action?: string
    ): Promise<void> {
        try {
            // Check current view for potential gaze strategy update
            const currentState = await this.navigator.getContentState();
            const currentView = currentState.currentView;

            // Get gaze targets - either from LLM or deterministic fallback
            let gazeTargets: GazeTarget[] = [];

            // Only plan gaze on view transitions
            if (currentView !== this.lastKnownView) {
                this.lastKnownView = currentView;

                // Try LLM-based gaze planning (only on major view changes)
                const intent = StrategicGaze.inferIntent(currentView, action);
                const spatialMap = await this.navigator.getSpatialMap(15);

                if (spatialMap.length > 0) {
                    const strategy = await this.strategicGaze.planGazeStrategy(
                        currentView,
                        spatialMap,
                        intent
                    );

                    if (strategy && strategy.gazeAnchors.length > 0) {
                        // Convert normalized coordinates to screen pixels
                        const viewport = await this.navigator.getViewportInfo();
                        const denormalized = this.strategicGaze.denormalizeStrategy(
                            strategy,
                            viewport.width,
                            viewport.height
                        );

                        // Convert to GazeTarget format (we only have points from LLM)
                        gazeTargets = denormalized.gazeAnchors.map(point => ({
                            point,
                            role: 'unknown',
                            label: 'LLM anchor',
                            salience: strategy.confidence,
                            boundingBox: { x: point.x - 10, y: point.y - 10, width: 20, height: 20 }
                        }));

                        console.log(`  👁️ Gaze strategy: ${gazeTargets.length} anchors (LLM confidence: ${strategy.confidence.toFixed(2)})`);
                    }
                }
            }

            // If no LLM strategy, use deterministic gaze target detection
            if (gazeTargets.length === 0) {
                gazeTargets = await this.navigator.findGazeTargets(2);
                if (gazeTargets.length > 0) {
                    console.log(`  👁️ Gaze targets: ${gazeTargets.length} (deterministic)`);
                }
            }

            // Calculate primary target point (center of bounding box with slight offset)
            const primaryTarget = {
                x: boundingBox.x + boundingBox.width / 2,
                y: boundingBox.y + boundingBox.height / 2
            };

            // === DEBUG: Draw Gaze Overlay in headed mode ===
            if (this.debugMode && gazeTargets.length > 0) {
                await this.navigator.drawGazeOverlay(gazeTargets, primaryTarget, true);
            }

            // Execute gaze-aware click
            if (gazeTargets.length > 0) {
                await this.ghost.investigateAndClickElement(
                    boundingBox,
                    gazeTargets,
                    role,
                    0.3  // centerBias
                );
            } else {
                // Fallback to normal click with role-specific timing
                await this.ghost.clickElementWithRole(boundingBox, role, 0.3);
            }

        } catch (error) {
            // On any error, fall back to simple click
            console.warn('  ⚠️ Gaze-aware click failed, using fallback:', error);
            await this.ghost.clickElement(boundingBox, 0.3);
        }
    }

    /**
     * Scroll with content-aware timing.
     * Uses the HumanScroll.scrollWithIntent for intelligent scroll behavior.
     *
     * @param config - Optional scroll configuration overrides
     */
    private async scrollWithIntent(config?: {
        baseDistance?: number;
        variability?: number;
        microAdjustProb?: number;
        readingPauseMs?: [number, number];
    }): Promise<{ contentType: string; scrollDistance: number }> {
        return this.scroll.scrollWithIntent(this.navigator, config);
    }
}
