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
import { ScreenshotCollector } from './ScreenshotCollector.js';
import { ContentReadiness } from './ContentReadiness.js';
import * as path from 'path';
import * as os from 'os';
import {
    BrowsingSession,
    BoundingBox,
    ContentState
} from '../../types/instagram.js';
import {
    NavigationContext,
    NavigationGoal,
    NavigationLoopConfig,
    BrowsingPhase,
    ActionRecord,
    EngagementState,
    EngagementLevel,
    PressParams
} from '../../types/navigation.js';
import { NavigationLLM } from './NavigationLLM.js';
import { NavigationExecutor } from './NavigationExecutor.js';
import { DebugOverlay, DebugState } from './DebugOverlay.js';
import { SessionMemory } from './SessionMemory.js';
import { SessionSummary, StagnationEvent } from '../../types/session-memory.js';

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
    private screenshotCollector!: ScreenshotCollector;
    private contentReadiness!: ContentReadiness;
    private page!: Page;

    // AI Navigation
    private navigationLLM!: NavigationLLM;
    private navigationExecutor!: NavigationExecutor;
    private debugOverlay?: DebugOverlay;
    private sessionMemory: SessionMemory = new SessionMemory();

    // Track current view for gaze planning
    private lastKnownView: ContentState['currentView'] = 'unknown';

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


    // =========================================================================
    // SCREENSHOT-FIRST BROWSING (NEW ARCHITECTURE)
    // =========================================================================

    /**
     * Screenshot-First Browsing Session.
     *
     * Now delegates to AI-driven navigation for intelligent browsing.
     * The AI decides what to click, scroll, and type based on the
     * accessibility tree and current goals.
     *
     * @param targetMinutes - Total browsing time
     * @param userInterests - Topics to search for
     * @returns BrowsingSession with all captured screenshots
     */
    async browseAndCapture(
        targetMinutes: number,
        userInterests: string[]
    ): Promise<BrowsingSession> {
        // Delegate to AI-driven navigation
        return this.browseWithAINavigation(targetMinutes, userInterests);
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
    // HUMAN-LIKE INTERACTION METHODS
    // =========================================================================

    /**
     * Click an element with human-like behavior.
     *
     * Uses Bezier curve movement, Gaussian click positioning, and role-specific
     * timing for natural interaction.
     *
     * @param boundingBox - Element to click
     * @param role - Accessibility role for timing adjustment
     * @param _action - Optional action description (unused, kept for compatibility)
     */
    private async clickWithGaze(
        boundingBox: BoundingBox,
        role: string = 'button',
        _action?: string
    ): Promise<void> {
        try {
            // Click with human-like behavior (Bezier curves, jitter, role-specific timing)
            await this.ghost.clickElementWithRole(boundingBox, role, 0.3);

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

    // =========================================================================
    // AI-DRIVEN NAVIGATION (Replaces hardcoded phase logic)
    // =========================================================================

    /**
     * Browse Instagram using AI-driven navigation.
     *
     * Instead of hardcoded phases (search → stories → feed), this method
     * uses an LLM to decide each navigation action based on the current
     * accessibility tree and session goals.
     *
     * @param targetMinutes - Total browsing time
     * @param userInterests - Topics to search for
     * @param config - Navigation loop configuration
     * @returns BrowsingSession with captured screenshots
     */
    async browseWithAINavigation(
        targetMinutes: number,
        userInterests: string[],
        config?: Partial<NavigationLoopConfig>
    ): Promise<BrowsingSession> {
        const startTime = Date.now();
        const targetDurationMs = targetMinutes * 60 * 1000;

        this.page = await this.context.newPage();

        // Initialize layer instances
        this.ghost = new GhostMouse(this.page);
        this.scroll = new HumanScroll(this.page);
        this.navigator = new A11yNavigator(this.page);
        this.vision = new ContentVision(this.apiKey);
        this.screenshotCollector = new ScreenshotCollector(this.page, {
            maxCaptures: 150,
            jpegQuality: 85,
            minScrollDelta: Math.round((this.page.viewportSize()?.height || 1920) * 0.10),
            saveToDirectory: path.join(os.homedir(), 'Documents', 'debug-screenshots')
        });
        this.contentReadiness = new ContentReadiness(this.page);

        // Initialize AI navigation services
        this.navigationLLM = new NavigationLLM({ apiKey: this.apiKey });
        this.navigationExecutor = new NavigationExecutor(
            this.page,
            this.ghost,
            this.scroll,
            this.navigator
        );

        // Enable visible cursor and debug overlay in debug mode
        if (this.debugMode) {
            await this.ghost.enableVisibleCursor();

            // Initialize and enable debug overlay for visual debugging
            this.debugOverlay = new DebugOverlay(this.page);
            await this.debugOverlay.enable();
        }

        // Default loop configuration
        // LLM has full strategic control - 5 minute default for debugging
        const loopConfig: NavigationLoopConfig = {
            maxActions: config?.maxActions || 500,  // LLM controls termination via strategic decisions
            maxDurationMs: config?.maxDurationMs || 5 * 60 * 1000,  // 5 minutes default
            minPostsForCompletion: config?.minPostsForCompletion || 5,  // LLM decides actual completion
            actionDelayMs: config?.actionDelayMs || [300, 1000]  // Faster - LLM controls pacing via linger
        };

        try {
            // 1. Navigate to Instagram
            console.log('🌐 Navigating to Instagram...');
            await this.page.goto('https://www.instagram.com/', {
                waitUntil: 'domcontentloaded'
            });
            await this.humanDelay(2000, 4000);

            // 2. Check page state
            const state = await this.navigator.getContentState();
            console.log('📊 Content State:', state);

            if (state.currentView === 'login') {
                throw new Error('SESSION_EXPIRED');
            }

            console.log('\n🤖 ═══════════════════════════════════════');
            console.log('🤖 AI NAVIGATION MODE ACTIVE');
            console.log('🤖 ═══════════════════════════════════════\n');

            // 3. Load cross-session memory for LLM context
            await this.sessionMemory.loadMemory();
            const sessionMemoryDigest = this.sessionMemory.generateDigest();

            // 4. Run AI navigation loop
            await this.runNavigationLoop(
                userInterests,
                loopConfig,
                startTime,
                sessionMemoryDigest
            );

        } catch (error: any) {
            console.error('❌ AI Navigation error:', error.message);
            if (['SESSION_EXPIRED', 'RATE_LIMITED'].includes(error.message)) {
                throw error;
            }
        } finally {
            // Disable debug overlay before closing
            if (this.debugOverlay) {
                await this.debugOverlay.disable();
            }

            // Log summary
            console.log(`\n📊 AI Navigation Summary:`);
            console.log(`   - Decisions made: ${this.navigationLLM.getDecisionCount()}`);
            console.log(`   - Estimated LLM cost: $${this.navigationLLM.getEstimatedCost().toFixed(4)}`);
            console.log(`   - Screenshots captured: ${this.screenshotCollector.getCaptureCount()}`);

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
     * LLM-DRIVEN NAVIGATION LOOP
     *
     * The LLM has FULL STRATEGIC CONTROL over:
     * - Phase transitions (search/stories/feed)
     * - Session termination
     * - Capture timing
     * - Pacing (linger duration)
     *
     * No hardcoded phase sequence, time budgets, or termination thresholds.
     * The LLM decides everything based on content quality and session context.
     */
    private async runNavigationLoop(
        userInterests: string[],
        config: NavigationLoopConfig,
        startTime: number,
        sessionMemoryDigest?: string
    ): Promise<void> {
        let actionCount = 0;
        let postsCollected = 0;
        let storiesWatched = 0;
        const interestsSearched: string[] = [];

        // Phase tracking (LLM controls transitions — neutral start, LLM decides approach)
        let currentPhase: BrowsingPhase = 'feed';
        const phaseHistory: Array<{ phase: BrowsingPhase; durationMs: number; itemsCollected: number }> = [];
        let phaseStartTime = Date.now();
        let phaseItemsCollected = 0;

        // Content quality tracking
        let totalPostsSeen = 0;
        const uniquePosts = new Set<string>();
        let adsSkipped = 0;

        // Stagnation events (for cross-session memory)
        const stagnationEvents: StagnationEvent[] = [];

        // Loop warning tracking (LLM gets warned before auto-recovery kicks in)
        let consecutiveLoopWarnings = 0;

        // Deep engagement state (LLM-controlled)
        const engagementState: EngagementState = {
            level: 'feed',
            levelEnteredAt: Date.now(),
            deeplyExploredPostUrls: []
        };

        console.log('\n🤖 LLM-DRIVEN NAVIGATION LOOP STARTED');
        console.log(`   Total budget: ${(config.maxDurationMs / 1000 / 60).toFixed(1)} minutes`);
        console.log(`   Interests: ${userInterests.join(', ')}`);

        while (actionCount < config.maxActions) {
            // Check time limit (hard stop)
            const elapsed = Date.now() - startTime;
            if (elapsed >= config.maxDurationMs) {
                console.log('⏰ Time limit reached, stopping navigation');
                break;
            }

            // Check loop status BEFORE LLM call (inject warning into context)
            const loopStatus = this.navigationExecutor.isInLoop();
            let loopWarning: NavigationContext['loopWarning'] = undefined;
            if (loopStatus.inLoop) {
                consecutiveLoopWarnings++;
                const recovery = this.navigationExecutor.getRecoveryAction(loopStatus.severity);
                loopWarning = {
                    severity: loopStatus.severity,
                    reason: recovery.reason,
                    consecutiveWarnings: consecutiveLoopWarnings
                };
                console.log(`  ⚠️ Loop warning #${consecutiveLoopWarnings} (${loopStatus.severity}): ${recovery.reason}`);
            } else {
                consecutiveLoopWarnings = 0;
            }

            // Get current state
            const state = await this.navigator.getContentState();
            const elements = await this.navigator.getNavigationElements();

            // Get tree summary for LLM dynamic page awareness
            const treeSummary = await this.navigator.buildTreeSummaryForLLM();

            // Build comprehensive context for LLM strategic decisions
            const context: NavigationContext = {
                sessionId: `session-${startTime}`,
                startTime,
                targetDurationMs: config.maxDurationMs,
                url: this.page.url(),
                view: state.currentView,
                currentGoal: this.getGoalForPhase(currentPhase, userInterests, interestsSearched, state.currentView, this.page.url()),
                userInterests,
                postsCollected,
                storiesWatched,
                interestsSearched,
                actionsRemaining: config.maxActions - actionCount,
                recentActions: this.navigationExecutor.getRecentActions(15),

                // Strategic context for LLM decision-making
                timeRemainingMs: config.maxDurationMs - elapsed,
                currentPhase,
                phaseHistory,
                captureCount: this.screenshotCollector.getPhotoCount(),
                videoState: state.hasVideo ? {
                    isPlaying: true,  // Assume playing if detected
                    duration: 0,      // Unknown without CDP query
                    currentTime: 0
                } : undefined,
                contentStats: {
                    uniquePostsRatio: totalPostsSeen > 0 ? uniquePosts.size / totalPostsSeen : 1,
                    adRatio: totalPostsSeen > 0 ? adsSkipped / totalPostsSeen : 0,
                    engagementLevel: this.estimateEngagementLevel(postsCollected, elapsed)
                },

                // Deep engagement state
                engagementState,

                // Tree summary for dynamic page awareness
                treeSummary,

                // Stagnation awareness
                scrollPosition: await this.scroll.getScrollPosition(),
                elementFingerprint: elements.slice(0, 25).map(e => `${e.role}:${e.name?.slice(0, 30)}`).join('|'),

                // Cross-session memory
                sessionMemoryDigest,

                // Loop warning (LLM decides recovery, auto-recovery only as last resort)
                loopWarning
            };

            // Get LLM decision (includes strategic decisions)
            const decision = await this.navigationLLM.decideAction(context, elements);
            console.log(`  🤖 Decision: ${decision.action} - ${decision.reasoning}`);

            // Log strategic decisions if present
            if (decision.strategic) {
                if (decision.strategic.switchPhase) {
                    console.log(`  🎯 Strategic: Switch to ${decision.strategic.switchPhase} phase`);
                }
                if (decision.strategic.terminateSession) {
                    console.log(`  🎯 Strategic: Terminate session - ${decision.strategic.reason}`);
                }
                if (decision.strategic.captureNow) {
                    console.log(`  🎯 Strategic: Capture now`);
                }
                if (decision.strategic.lingerDuration) {
                    console.log(`  🎯 Strategic: Linger ${decision.strategic.lingerDuration}`);
                }
                if (decision.strategic.engageDepth) {
                    console.log(`  🔍 Strategic: Engage at depth ${decision.strategic.engageDepth}`);
                }
                if (decision.strategic.closeEngagement) {
                    console.log(`  🚪 Strategic: Close engagement`);
                }
            }

            // === DEBUG OVERLAY UPDATE ===
            if (this.debugOverlay) {
                // Find target element if clicking
                let targetElement = undefined;
                if (decision.action === 'click') {
                    const clickParams = decision.params as { id: number };
                    targetElement = elements.find(e => e.id === clickParams.id);
                }

                // Update debug panel with current state
                const debugState: DebugState = {
                    phase: currentPhase,
                    timeRemainingMs: config.maxDurationMs - elapsed,
                    captureCount: this.screenshotCollector.getPhotoCount(),
                    engagementLevel: engagementState.level,
                    carouselState: engagementState.carouselState ? {
                        currentSlide: engagementState.carouselState.currentSlide,
                        totalSlides: engagementState.carouselState.totalSlides
                    } : undefined,
                    currentPostUsername: engagementState.currentPost?.username,
                    action: decision.action,
                    targetId: targetElement?.id,
                    targetName: targetElement?.name,
                    targetRole: targetElement?.role,
                    confidence: decision.confidence,
                    reasoning: decision.reasoning,
                    postsCollected,
                    actionsRemaining: config.maxActions - actionCount
                };

                await this.debugOverlay.updateState(debugState);

                // If clicking, highlight the target element
                if (decision.action === 'click' && targetElement?.boundingBox) {
                    await this.debugOverlay.clearHighlights();
                    await this.debugOverlay.highlightElement(
                        targetElement.boundingBox,
                        `#${targetElement.id} ${targetElement.role}: "${targetElement.name?.slice(0, 25)}..."`
                    );

                    // Show crosshair at click point
                    const clickPoint = {
                        x: targetElement.boundingBox.x + targetElement.boundingBox.width / 2,
                        y: targetElement.boundingBox.y + targetElement.boundingBox.height / 2
                    };
                    await this.debugOverlay.showClickTarget(clickPoint, 'CLICK');

                    // Brief pause to see target before clicking
                    await this.humanDelay(300, 500);
                }
            }

            // Handle LLM strategic termination
            if (decision.strategic?.terminateSession) {
                console.log(`\n✅ LLM terminated session: ${decision.strategic.reason || 'Content exhausted'}`);
                break;
            }

            // Handle LLM strategic phase switch
            if (decision.strategic?.switchPhase && decision.strategic.switchPhase !== currentPhase) {
                const newPhase = decision.strategic.switchPhase as BrowsingPhase;

                // Record phase history
                phaseHistory.push({
                    phase: currentPhase,
                    durationMs: Date.now() - phaseStartTime,
                    itemsCollected: phaseItemsCollected
                });

                console.log(`\n🔄 LLM Phase transition: ${currentPhase} → ${newPhase}`);
                console.log(`   Reason: ${decision.strategic.reason || 'LLM decision'}`);

                currentPhase = newPhase;
                phaseStartTime = Date.now();
                phaseItemsCollected = 0;

                if (newPhase === 'complete') {
                    console.log('✅ LLM signaled session complete');
                    break;
                }
            }

            // Execute the decision
            const result = await this.navigationExecutor.execute(decision, elements);

            // Clear debug highlights after execution
            if (this.debugOverlay) {
                await this.debugOverlay.clearHighlights();
            }

            if (result.success) {
                // Log with action type and verification status
                if (result.verified) {
                    const verifyLabel = result.verified === 'url_changed' ? 'URL changed'
                        : result.verified === 'dom_changed' ? 'DOM changed'
                        : result.verified === 'no_change_detected' ? 'no state change detected'
                        : '';
                    console.log(`  ✅ Action succeeded (${result.actionTaken}${verifyLabel ? ` - ${verifyLabel}` : ''})`);
                } else {
                    console.log(`  ✅ Action succeeded (${result.actionTaken})`);
                }

                // Track content seen - only count actual post/story views, not every action
                const currentUrl = result.resultingUrl || '';
                const isPostView = currentUrl.includes('/p/') || currentUrl.includes('/reel/');
                const isStoryView = currentUrl.includes('/stories/');
                const isCaptureAction = decision.capture?.shouldCapture || decision.strategic?.captureNow;

                if (isPostView || isStoryView || isCaptureAction) {
                    totalPostsSeen++;
                    const postId = this.extractPostIdFromUrl(currentUrl) || `action-${actionCount}`;
                    uniquePosts.add(postId);
                }

                // Track story watching and profile navigation
                const newState = await this.navigator.getContentState();
                if (newState.currentView === 'story') {
                    storiesWatched++;
                    phaseItemsCollected++;
                }

                // Detect profile page navigation: mark interest as searched
                // so we don't re-search the same interest in a loop
                if (newState.currentView === 'profile') {
                    const currentInterest = userInterests.find(i => !interestsSearched.includes(i));
                    if (currentInterest && !interestsSearched.includes(currentInterest)) {
                        interestsSearched.push(currentInterest);
                        console.log(`  📍 Landed on profile — marked "${currentInterest}" as searched (${interestsSearched.length}/${userInterests.length})`);
                    }
                }

                // LLM-controlled capture with 3-tier priority:
                // 1. capture.targetId → crop to specific element the LLM chose
                // 2. strategic.captureNow (no targetId) → full viewport
                // 3. capture.shouldCapture (no targetId) → fallback to nearest article
                const shouldCapture = decision.capture?.shouldCapture || decision.strategic?.captureNow;

                if (shouldCapture) {
                    await this.humanDelay(500, 800); // Wait for content to stabilize

                    // Determine capture source based on current view
                    let source: 'feed' | 'story' | 'search' | 'profile' | 'carousel' = 'feed';
                    if (newState.currentView === 'story') {
                        source = 'story';
                    } else if (newState.currentView === 'profile') {
                        source = 'profile';
                    } else if (this.page.url().includes('/explore') || this.page.url().includes('search')) {
                        source = 'search';
                    }

                    const captureReason = decision.capture?.reason ||
                                         decision.strategic?.reason ||
                                         'LLM strategic capture';

                    let captured = false;

                    // PRIORITY 1: LLM specified targetId → crop to that element
                    if (decision.capture?.targetId !== undefined) {
                        const targetElement = elements.find(e => e.id === decision.capture!.targetId);

                        // Re-fetch bounding box — the action may have shifted the viewport
                        let freshBox: BoundingBox | null = null;
                        if (targetElement?.backendNodeId) {
                            freshBox = await this.navigator.refetchBoundingBox(targetElement.backendNodeId);
                        }

                        const captureBox = freshBox || targetElement?.boundingBox;

                        // Viewport bounds check — skip if element scrolled entirely off-screen
                        const viewportHeight = this.page.viewportSize()?.height || 1920;
                        const offViewport = captureBox && (
                            captureBox.y + captureBox.height < 0 || captureBox.y > viewportHeight
                        );

                        if (captureBox && !offViewport) {
                            const cap = await this.screenshotCollector.captureFocusedElement(
                                captureBox, source, context.currentGoal.target, captureReason
                            );
                            if (cap) {
                                captured = true;
                                console.log(`  📸 Capture (targetId=${decision.capture.targetId}${freshBox ? '' : ', stale bounds'}): ${captureReason}`);
                            }
                        } else if (offViewport) {
                            console.warn(`  ⚠️ capture.targetId=${decision.capture.targetId} is off-viewport (y=${captureBox!.y.toFixed(0)}), skipping`);
                        } else {
                            console.warn(`  ⚠️ capture.targetId=${decision.capture.targetId} not found or no boundingBox, falling back`);
                            const postBounds = await this.navigator.findPostContentBounds();
                            const fallbackBounds = postBounds || result.focusedElement?.boundingBox;
                            if (fallbackBounds) {
                                const cap = await this.screenshotCollector.captureFocusedElement(
                                    fallbackBounds, source, context.currentGoal.target, captureReason
                                );
                                if (cap) {
                                    captured = true;
                                    console.log(`  📸 Capture (fallback from invalid targetId): ${captureReason}`);
                                }
                            }
                        }
                    }
                    // PRIORITY 2: captureNow without targetId → full viewport
                    else if (decision.strategic?.captureNow) {
                        const cap = await this.screenshotCollector.captureCurrentPost(
                            source,
                            context.currentGoal.target
                        );
                        if (cap) {
                            captured = true;
                            console.log(`  📸 Capture (viewport): ${captureReason}`);
                        }
                    }
                    // PRIORITY 3: shouldCapture without targetId → article fallback
                    else {
                        const postBounds = await this.navigator.findPostContentBounds();
                        const captureBounds = postBounds || result.focusedElement?.boundingBox;
                        if (captureBounds) {
                            const cap = await this.screenshotCollector.captureFocusedElement(
                                captureBounds, source, context.currentGoal.target, captureReason
                            );
                            if (cap) {
                                captured = true;
                                console.log(`  📸 Capture: ${captureReason}${postBounds ? ' (full post)' : ' (element)'}`);
                            }
                        }
                    }

                    if (captured) {
                        postsCollected++;
                        phaseItemsCollected++;
                    }
                }

                // Execute LLM-controlled linger duration
                if (decision.strategic?.lingerDuration) {
                    await this.navigationExecutor.executeLinger(decision.strategic);
                }

                // === DEEP ENGAGEMENT STATE TRACKING ===

                // Detect engagement level change
                const engagementLevel = await this.navigator.detectEngagementLevel();
                if (engagementLevel.level !== engagementState.level) {
                    console.log(`  📍 Engagement: ${engagementState.level} → ${engagementLevel.level}`);
                    engagementState.level = engagementLevel.level;
                    engagementState.levelEnteredAt = Date.now();

                    // If entering post modal, track the post
                    if (engagementLevel.level === 'post_modal' && engagementLevel.postUrl) {
                        engagementState.currentPost = {
                            postUrl: engagementLevel.postUrl,
                            username: engagementLevel.username
                        };
                        engagementState.entryAction = 'clicked_post';
                    }

                    // If entering profile
                    if (engagementLevel.level === 'profile') {
                        engagementState.currentPost = {
                            username: engagementLevel.username
                        };
                        engagementState.entryAction = 'clicked_username';
                    }
                }

                // If in post modal, extract metrics and carousel state
                if (engagementState.level === 'post_modal') {
                    const metrics = await this.navigator.extractPostEngagementMetrics();
                    engagementState.postMetrics = {
                        likeCount: metrics.likeCount,
                        commentCount: metrics.commentCount,
                        hasVideo: metrics.hasVideo
                    };

                    // Update carousel state
                    if (metrics.carouselState) {
                        const prevSlide = engagementState.carouselState?.currentSlide || 0;
                        engagementState.carouselState = {
                            currentSlide: metrics.carouselState.currentSlide,
                            totalSlides: metrics.carouselState.totalSlides,
                            fullyExplored: metrics.carouselState.currentSlide === metrics.carouselState.totalSlides
                        };

                        // Log carousel navigation
                        if (prevSlide !== metrics.carouselState.currentSlide) {
                            console.log(`  🎠 Carousel: Slide ${metrics.carouselState.currentSlide}/${metrics.carouselState.totalSlides}`);
                        }
                    }
                }

                // Handle closeEngagement decision
                if (decision.strategic?.closeEngagement) {
                    // Mark post as deeply explored
                    if (engagementState.currentPost?.postUrl) {
                        engagementState.deeplyExploredPostUrls.push(engagementState.currentPost.postUrl);
                        console.log(`  ✓ Added to explored posts (${engagementState.deeplyExploredPostUrls.length} total)`);
                    }

                    // If we just pressed Escape, reset engagement state
                    if (decision.action === 'press' && (decision.params as PressParams).key === 'Escape') {
                        engagementState.level = 'feed';
                        engagementState.currentPost = undefined;
                        engagementState.carouselState = undefined;
                        engagementState.postMetrics = undefined;
                        engagementState.entryAction = undefined;
                        engagementState.levelEnteredAt = Date.now();
                    }
                }
            } else {
                console.log(`  ❌ Action failed: ${result.errorMessage}`);
            }

            actionCount++;

            // Last-resort auto-recovery: only if LLM failed to self-recover after 3+ warnings
            if (consecutiveLoopWarnings >= 3) {
                const recovery = this.navigationExecutor.getRecoveryAction(loopStatus.severity);
                console.log(`  🚨 Auto-recovery (LLM failed to recover after ${consecutiveLoopWarnings} warnings): ${recovery.reason}`);

                const scrollYBefore = await this.scroll.getScrollPosition();

                if (recovery.action === 'press' && recovery.key) {
                    await this.page.keyboard.press(recovery.key);
                } else if (recovery.action === 'back') {
                    await this.page.goBack({ waitUntil: 'domcontentloaded', timeout: 5000 }).catch(() => {});
                } else if (recovery.action === 'navigate_home') {
                    await this.page.goto('https://www.instagram.com/', { waitUntil: 'domcontentloaded', timeout: 10000 }).catch(() => {});
                }
                await this.humanDelay(1000, 2000);
                consecutiveLoopWarnings = 0;  // Reset after forced recovery

                // Track stagnation event for cross-session memory
                const scrollYAfter = await this.scroll.getScrollPosition();
                stagnationEvents.push({
                    scrollY: scrollYBefore,
                    phase: currentPhase,
                    recoveryAction: recovery.action,
                    recoveredSuccessfully: scrollYAfter !== scrollYBefore || recovery.action === 'navigate_home'
                });
            }

            // Minimal delay between actions (LLM controls pacing via linger)
            // Only add small delay if no linger was executed
            if (!decision.strategic?.lingerDuration) {
                const [minDelay, maxDelay] = config.actionDelayMs!;
                await this.humanDelay(minDelay / 2, maxDelay / 2);
            }
        }

        // Final phase history entry
        phaseHistory.push({
            phase: currentPhase,
            durationMs: Date.now() - phaseStartTime,
            itemsCollected: phaseItemsCollected
        });

        console.log(`\n📊 LLM Navigation Complete:`);
        console.log(`   Actions: ${actionCount}`);
        console.log(`   Posts captured: ${postsCollected}`);
        console.log(`   Stories watched: ${storiesWatched}`);
        console.log(`   Unique content ratio: ${(uniquePosts.size / Math.max(totalPostsSeen, 1) * 100).toFixed(0)}%`);
        console.log(`   Posts deeply explored: ${engagementState.deeplyExploredPostUrls.length}`);
        console.log(`   Phase history: ${phaseHistory.map(p => `${p.phase}(${(p.durationMs/1000).toFixed(0)}s)`).join(' → ')}`);

        // Save cross-session memory
        const sessionSummary: SessionSummary = {
            id: `session-${startTime}`,
            timestamp: startTime,
            durationMs: Date.now() - startTime,
            interestResults: userInterests.map(interest => {
                const searchedAt = interestsSearched.indexOf(interest);
                return {
                    interest,
                    captureCount: Math.round(postsCollected / Math.max(userInterests.length, 1)),
                    searchTimeMs: searchedAt >= 0 ? (phaseHistory.find(p => p.phase === 'search')?.durationMs || 0) : 0,
                    quality: (postsCollected / Math.max(userInterests.length, 1)) >= 5 ? 'high' as const
                        : (postsCollected / Math.max(userInterests.length, 1)) >= 2 ? 'medium' as const
                        : 'low' as const
                };
            }),
            phaseBreakdown: phaseHistory.map(p => ({
                phase: p.phase,
                durationMs: p.durationMs,
                capturesProduced: p.itemsCollected
            })),
            stagnationEvents,
            totalCaptures: postsCollected,
            totalActions: actionCount,
            uniqueContentRatio: uniquePosts.size / Math.max(totalPostsSeen, 1)
        };
        await this.sessionMemory.saveSession(sessionSummary);
    }

    /**
     * Estimate engagement level based on capture rate.
     */
    private estimateEngagementLevel(postsCollected: number, elapsedMs: number): 'low' | 'medium' | 'high' {
        const capturesPerMinute = postsCollected / (elapsedMs / 60000);
        if (capturesPerMinute > 3) return 'high';
        if (capturesPerMinute > 1) return 'medium';
        return 'low';
    }

    /**
     * Extract post ID from a URL string.
     * Matches instagram.com/p/{ID}/ or /reel/{ID}/ patterns.
     */
    private extractPostIdFromUrl(url: string): string | null {
        const match = url.match(/\/(p|reel)\/([A-Za-z0-9_-]+)/);
        return match ? match[2] : null;
    }

    /**
     * Get the navigation goal for a given phase.
     * Note: Time allocation is now fully LLM-controlled.
     * These goals provide hints but LLM decides actual duration.
     */
    private getGoalForPhase(
        phase: BrowsingPhase,
        userInterests: string[],
        interestsSearched: string[],
        currentView?: string,
        currentUrl?: string
    ): NavigationGoal {
        // If viewing a post detail (modal open), signal to capture and explore before closing
        if (currentUrl && (currentUrl.includes('/p/') || currentUrl.includes('/reel/'))) {
            return {
                type: 'analyze_account',
                target: 'Capture this post detail view, navigate carousel slides, then close modal'
            };
        }

        // If we're on a profile page, signal to explore it deeply
        // (prevents search → click → back → search loops)
        if (currentView === 'profile') {
            const username = this.navigator.getProfileUsername() || 'this profile';
            return {
                type: 'explore_profile',
                target: username,
                minItems: 3
            };
        }

        // Broad analytical goal — push toward depth
        return {
            type: 'analyze_account',
            target: 'Click into individual posts for detail captures'
        };
    }

    // NOTE: shouldTransitionPhase() and getNextPhase() removed
    // LLM now controls phase transitions through strategic decisions
}
