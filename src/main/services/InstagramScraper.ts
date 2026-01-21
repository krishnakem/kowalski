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
import { ExtractedPost, ScrapedSession } from '../../types/instagram.js';

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
    private page!: Page;

    // Metrics
    private visionApiCalls = 0;
    private skippedViewports = 0;

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
        this.page = await this.context.newPage();

        // Initialize layer instances
        this.ghost = new GhostMouse(this.page);
        this.scroll = new HumanScroll(this.page);
        this.navigator = new A11yNavigator(this.page);
        this.vision = new ContentVision(this.apiKey);

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
    // PHASE A: ACTIVE SEARCH
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
                // 1. Find and click Search button
                const searchButton = await this.navigator.findSearchButton();
                if (!searchButton?.boundingBox) {
                    console.log('  ⚠️ Search button not found, skipping');
                    continue;
                }

                await this.ghost.clickElement(searchButton.boundingBox, 0.3);
                await this.humanDelay(1000, 2000);

                // 2. Find search input and type interest
                const searchInput = await this.navigator.findSearchInput();
                if (!searchInput?.boundingBox) {
                    console.log('  ⚠️ Search input not found, skipping');
                    await this.navigator.pressEscape();
                    await this.humanDelay(500, 1000);
                    continue;
                }

                // Click input to focus
                await this.ghost.clickElement(searchInput.boundingBox, 0.5);
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

        // Click first story using Ghost Mouse (with randomized offset)
        const firstStory = storyCircles[0];
        if (firstStory.boundingBox) {
            await this.ghost.clickElement(firstStory.boundingBox, 0.3);
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

            // Advance to next story (click right side of screen)
            const viewportSize = this.page.viewportSize();
            if (viewportSize) {
                // Define a "click zone" on the right side of the story
                const rightZone = {
                    x: viewportSize.width * 0.6,
                    y: viewportSize.height * 0.2,
                    width: viewportSize.width * 0.35,
                    height: viewportSize.height * 0.6
                };
                await this.ghost.clickElement(rightZone, 0.2);  // Low center bias
            }

            await this.humanDelay(1000, 2000);
        }

        // Exit stories (press Escape or click X)
        await this.page.keyboard.press('Escape');
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

            // MOVE: Human-like scroll (FREE) - extended pauses for 8-minute target
            await this.scroll.scroll({
                baseDistance: 300 + Math.random() * 200,
                variability: 0.25,
                microAdjustProb: 0.2,
                readingPauseMs: [4000, 8000]
            });

            scrollCount++;

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

                    // === NEW: Check for carousel and explore all slides ===
                    const carouselNext = await this.navigator.findCarouselNextButton();
                    if (carouselNext?.boundingBox) {
                        console.log(`  🎠 Carousel detected, exploring slides...`);
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
            // Check for Next button
            const nextButton = await this.navigator.findCarouselNextButton();

            if (!nextButton?.boundingBox) {
                // No more slides
                console.log(`    🎠 Carousel complete (${slideNumber - 1} slides captured)`);
                break;
            }

            // === ACTIONABILITY CHECK: Hover before clicking ===
            // Hover for 0.8-1.5 seconds to verify element is interactable (randomized)
            const hoverDuration = 800 + Math.random() * 700;
            console.log(`    🎠 Hovering over Next button...`);
            await this.ghost.hoverElement(nextButton.boundingBox, hoverDuration, 0.3);

            // Re-check button is still there after hover (element may have moved)
            const nextButtonAfterHover = await this.navigator.findCarouselNextButton();
            if (!nextButtonAfterHover?.boundingBox) {
                console.log(`    ⚠️ Next button disappeared after hover, skipping`);
                break;
            }

            // === CLICK with retry logic ===
            let navigationSucceeded = false;
            for (let attempt = 0; attempt < maxRetries; attempt++) {
                // Click Next
                await this.ghost.clickElement(nextButtonAfterHover.boundingBox, 0.3);

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

            // Click highlight
            console.log(`    ✨ Opening highlight: "${highlight.name}"`);
            await this.ghost.clickElement(highlight.boundingBox, 0.3);
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

                // Advance to next slide in highlight
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
                await this.humanDelay(5000, 8000);
            }

            // Exit highlight (Escape)
            await this.page.keyboard.press('Escape');
            await this.humanDelay(1000, 1500);
        }

        console.log(`    👤 Profile deep-dive complete. Captured ${content.length} items`);
        return content;
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
        }
    }

    /**
     * Human-like delay with random variation.
     */
    private humanDelay(min: number, max: number): Promise<void> {
        const delay = min + Math.random() * (max - min);
        return new Promise(resolve => setTimeout(resolve, delay));
    }
}
