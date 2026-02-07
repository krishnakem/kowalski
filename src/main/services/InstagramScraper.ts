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
    BoundingBox
} from '../../types/instagram.js';
import { ModelConfig } from '../../shared/modelConfig.js';
import {
    NavigationContext,
    NavigationGoal,
    NavigationLoopConfig,
    BrowsingPhase,
    ActionRecord,
    EngagementState,
    EngagementLevel,
    PressParams,
    ClickParams,
    CaptureParams,
} from '../../types/navigation.js';
import { Jimp } from 'jimp';
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
    private lastKnownView: string = 'unknown';

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
        const url = this.navigator.getPageUrl();
        const isFeedRoot = url === 'https://www.instagram.com/' || url.startsWith('https://www.instagram.com/?');
        if (!isFeedRoot) {
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

    private extractPostIdFromUrl(url: string): string | null {
        const match = url.match(/\/(p|reel)\/([A-Za-z0-9_-]+)/);
        return match ? match[2] : null;
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
        // Scale max captures based on session duration (~4 captures/minute is generous)
        const estimatedMaxCaptures = Math.max(150, Math.ceil(targetMinutes * 4));
        this.screenshotCollector = new ScreenshotCollector(this.page, {
            maxCaptures: estimatedMaxCaptures,
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

        // Loop configuration — time is the ONLY hard limit
        const loopConfig: NavigationLoopConfig = {
            maxDurationMs: config?.maxDurationMs || targetDurationMs,
            actionDelayMs: config?.actionDelayMs || [300, 1000]
        };

        try {
            // 1. Navigate to Instagram
            console.log('🌐 Navigating to Instagram...');
            await this.page.goto('https://www.instagram.com/', {
                waitUntil: 'domcontentloaded'
            });
            await this.humanDelay(2000, 4000);

            // 2. Check for login redirect (session lifecycle)
            const pageUrl = this.navigator.getPageUrl();
            console.log('📊 Page URL:', pageUrl);

            if (pageUrl.includes('/accounts/login')) {
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

        // Loop warning tracking (injected into LLM context as neutral observation)
        let consecutiveLoopWarnings = 0;

        // Capture attempt feedback for LLM (so it knows when captures are being rejected)
        let lastCaptureAttempt: NavigationContext['lastCaptureAttempt'];
        let lastCaptureAttemptUrl: string = ''; // URL where the rejection happened

        // Scroll feedback for LLM (content-aware scroll results)
        let lastScrollResult: NavigationContext['lastScrollResult'];

        // Deep engagement state (LLM-controlled)
        const engagementState: EngagementState = {
            level: 'feed',
            levelEnteredAt: Date.now(),
            deeplyExploredPostUrls: []
        };

        console.log('\n🤖 LLM-DRIVEN NAVIGATION LOOP STARTED');
        console.log(`   Total budget: ${(config.maxDurationMs / 1000 / 60).toFixed(1)} minutes`);
        console.log(`   Interests: ${userInterests.join(', ')}`);

        // Write session header to log file
        this.screenshotCollector.appendLogRaw(`# Session Log`);
        this.screenshotCollector.appendLogRaw(`**Started:** ${new Date().toISOString()}`);
        this.screenshotCollector.appendLogRaw(`**Budget:** ${(config.maxDurationMs / 1000 / 60).toFixed(1)} minutes`);
        this.screenshotCollector.appendLogRaw(`**Interests:** ${userInterests.join(', ')}`);
        this.screenshotCollector.appendLogRaw(`**Navigation Model:** ${ModelConfig.navigation}`);
        this.screenshotCollector.appendLogRaw(`\n---\n`);

        while (true) {
            // Check time limit (the ONLY hard stop)
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
                loopWarning = {
                    severity: loopStatus.severity,
                    reason: loopStatus.severity,
                    consecutiveWarnings: consecutiveLoopWarnings
                };
                console.log(`  ⚠️ Loop warning #${consecutiveLoopWarnings} (${loopStatus.severity})`);
                this.screenshotCollector.appendLog(`  ⚠️ Loop warning #${consecutiveLoopWarnings} (${loopStatus.severity})`);
            } else {
                consecutiveLoopWarnings = 0;
            }

            const currentUrl = this.page.url();

            // Clear stale capture feedback when navigating to a DIFFERENT post
            // URL variants (/p/X/ vs /user/p/X/) share the same post ID — don't clear for variants
            const currentPostId = this.extractPostIdFromUrl(currentUrl);
            const lastPostId = this.extractPostIdFromUrl(lastCaptureAttemptUrl);
            if (lastCaptureAttempt && currentPostId !== lastPostId) {
                lastCaptureAttempt = undefined;
            }

            this.screenshotCollector.appendLog(`--- url: ${currentUrl} | phase: ${currentPhase} | captures: ${this.screenshotCollector.getPhotoCount()}`);
            const elements = await this.navigator.getNavigationElements();

            // Get tree summary for LLM dynamic page awareness
            const treeSummary = await this.navigator.buildTreeSummaryForLLM();

            // Capture viewport screenshot immediately after tree — same page state
            let screenshot: Buffer | undefined;
            try {
                const raw = await this.page.screenshot({ type: 'jpeg', quality: 80, fullPage: false });
                const image = await Jimp.read(Buffer.from(raw));
                const origW = image.width;
                const origH = image.height;
                if (origW > 1024) {
                    image.resize({ w: 1024 });
                }
                screenshot = await image.getBuffer('image/jpeg', { quality: 80 });
                console.log(`  📸 Screenshot for LLM: ${origW}x${origH} → ${image.width}x${image.height} (${Math.round(screenshot.length / 1024)}KB)`);
            } catch (err) {
                console.log(`  ⚠️ Screenshot capture failed: ${err}`);
            }

            // Build comprehensive context for LLM strategic decisions
            const context: NavigationContext = {
                sessionId: `session-${startTime}`,
                startTime,
                targetDurationMs: config.maxDurationMs,
                url: currentUrl,
                view: currentUrl,
                currentGoal: this.getGoalForPhase(currentPhase, userInterests, interestsSearched),
                userInterests,
                postsCollected,
                storiesWatched,
                interestsSearched,
                recentActions: this.navigationExecutor.getRecentActions(15),

                // Strategic context for LLM decision-making
                timeRemainingMs: config.maxDurationMs - elapsed,
                currentPhase,
                phaseHistory,
                captureCount: this.screenshotCollector.getPhotoCount(),
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

                // Loop warning (LLM decides recovery)
                loopWarning,

                // Last capture attempt feedback
                lastCaptureAttempt,

                // Scroll feedback from last scroll action
                lastScrollResult
            };

            // Get LLM decision (includes strategic decisions)
            const decision = await this.navigationLLM.decideAction(context, elements, screenshot);
            console.log(`  🤖 Decision: ${decision.action} - ${decision.reasoning}`);
            // For click actions, include the target element info in the log
            if (decision.action === 'click') {
                const clickParams = decision.params as ClickParams;
                const targetEl = elements.find(e => e.id === clickParams.id);
                const elInfo = targetEl ? ` → id:${targetEl.id} ${targetEl.role} "${targetEl.name}"` : ` → id:${clickParams.id} (not found)`;
                this.screenshotCollector.appendLog(`**Action #${actionCount + 1}** \`${decision.action}\`${elInfo} — ${decision.reasoning}`);
            } else if (decision.action === 'press') {
                const pressParams = decision.params as PressParams;
                this.screenshotCollector.appendLog(`**Action #${actionCount + 1}** \`press ${pressParams.key}\` — ${decision.reasoning}`);
            } else {
                this.screenshotCollector.appendLog(`**Action #${actionCount + 1}** \`${decision.action}\` — ${decision.reasoning}`);
            }

            // Log strategic decisions if present
            if (decision.strategic) {
                const strategicParts: string[] = [];
                if (decision.strategic.switchPhase) {
                    console.log(`  🎯 Strategic: Switch to ${decision.strategic.switchPhase} phase`);
                    strategicParts.push(`phase→${decision.strategic.switchPhase}`);
                }
                if (decision.strategic.terminateSession) {
                    console.log(`  🎯 Strategic: Terminate session - ${decision.strategic.reason}`);
                    strategicParts.push(`TERMINATE: ${decision.strategic.reason}`);
                }
                if (decision.strategic.captureNow) {
                    console.log(`  🎯 Strategic: Capture now`);
                    strategicParts.push('capture');
                }
                if (decision.strategic.lingerDuration) {
                    console.log(`  🎯 Strategic: Linger ${decision.strategic.lingerDuration}`);
                    strategicParts.push(`linger=${decision.strategic.lingerDuration}`);
                }
                if (decision.strategic.engageDepth) {
                    console.log(`  🔍 Strategic: Engage at depth ${decision.strategic.engageDepth}`);
                    strategicParts.push(`engage=${decision.strategic.engageDepth}`);
                }
                if (decision.strategic.closeEngagement) {
                    console.log(`  🚪 Strategic: Close engagement`);
                    strategicParts.push('close-engagement');
                }
                if (strategicParts.length > 0) {
                    this.screenshotCollector.appendLog(`  Strategic: ${strategicParts.join(', ')}`);
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
                    postsCollected
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
                this.screenshotCollector.appendLog(`✅ **Session terminated by LLM:** ${decision.strategic.reason || 'Content exhausted'}`);
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
                this.screenshotCollector.appendLogRaw(`\n### Phase: ${currentPhase} → ${newPhase}`);
                this.screenshotCollector.appendLog(`Reason: ${decision.strategic.reason || 'LLM decision'}`);

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

            // Track scroll feedback for LLM context (reset on non-scroll actions)
            if (result.scrollResult) {
                lastScrollResult = result.scrollResult;
            } else {
                lastScrollResult = undefined;
            }

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
                    this.screenshotCollector.appendLog(`  ✅ ${result.actionTaken} — ${verifyLabel || 'ok'}`);
                } else {
                    console.log(`  ✅ Action succeeded (${result.actionTaken})`);
                    this.screenshotCollector.appendLog(`  ✅ ${result.actionTaken}`);
                }

                // Track content seen — count when LLM signals capture intent
                const isCaptureAction = decision.capture?.shouldCapture || decision.strategic?.captureNow;

                if (isCaptureAction) {
                    totalPostsSeen++;
                    const fingerprint = await this.navigator.getPostFingerprint();
                    const postKey = fingerprint?.hash || `action-${actionCount}`;
                    uniquePosts.add(postKey);
                }

                // Track story watching via LLM phase
                if (currentPhase === 'stories') {
                    storiesWatched++;
                    phaseItemsCollected++;
                }

                // LLM-controlled capture with 3-tier priority:
                // 1. capture.targetId → crop to specific element the LLM chose
                // 2. strategic.captureNow (no targetId) → full viewport
                // 3. capture.shouldCapture (no targetId) → fallback to nearest article
                const shouldCapture = decision.action === 'capture'
                    || decision.capture?.shouldCapture
                    || decision.strategic?.captureNow;

                if (shouldCapture) {
                    // After a click with capture intent, the SPA needs extra time
                    // to hydrate content. Wait for network idle + delay.
                    if (decision.action === 'click') {
                        await this.page.waitForLoadState('networkidle').catch(() => {});
                        await this.humanDelay(800, 1200);
                    } else {
                        await this.humanDelay(500, 800); // Wait for content to stabilize
                    }

                    // Determine capture source from LLM phase
                    let source: 'feed' | 'story' | 'search' | 'profile' | 'carousel' = 'feed';
                    if (currentPhase === 'stories') {
                        source = 'story';
                    } else if (currentPhase === 'search') {
                        source = 'search';
                    }

                    // Carousel: when in a post modal with multi-slide carousel detected,
                    // use 'carousel' source to bypass fingerprint dedup (all slides share same fingerprint)
                    if (engagementState.carouselState && engagementState.carouselState.totalSlides > 1) {
                        source = 'carousel';
                    }

                    const captureReason = (decision.action === 'capture' ? (decision.params as CaptureParams).reason : undefined)
                                         || decision.capture?.reason
                                         || decision.strategic?.reason
                                         || 'LLM strategic capture';

                    // Get tree-based fingerprint for dedup (null for stories/grids → falls through to hash dedup)
                    const fp = await this.navigator.getPostFingerprint();
                    const fpHash = fp?.hash;

                    let captured = false;

                    // Resolve targetId: first-class capture params take priority, then legacy side-channel
                    const captureTargetId = decision.action === 'capture'
                        ? (decision.params as CaptureParams).targetId
                        : decision.capture?.targetId;

                    // PRIORITY 1: targetId specified → crop to that element (or its container)
                    if (captureTargetId !== undefined) {
                        const targetElement = elements.find(e => e.id === captureTargetId);

                        // Re-fetch bounding box — the action may have shifted the viewport
                        let freshBox: BoundingBox | null = null;
                        if (targetElement?.backendNodeId) {
                            freshBox = await this.navigator.refetchBoundingBox(targetElement.backendNodeId);
                        }

                        let captureBox = freshBox || targetElement?.boundingBox;

                        // Viewport bounds check — skip if element scrolled entirely off-screen
                        const viewportSize = this.page.viewportSize() || { width: 1080, height: 1920 };
                        const offViewport = captureBox && (
                            captureBox.y + captureBox.height < 0 || captureBox.y > viewportSize.height
                        );

                        // Smart expansion: if target is too small (< 20% of viewport in either dimension),
                        // it's likely a button/icon/arrow — expand to the containing article or full viewport
                        const tooSmall = captureBox && (
                            captureBox.width < viewportSize.width * 0.20 ||
                            captureBox.height < viewportSize.height * 0.20
                        );

                        if (tooSmall && captureBox && !offViewport) {
                            console.log(`  📸 Target element too small (${captureBox.width.toFixed(0)}x${captureBox.height.toFixed(0)}px), expanding to article/viewport`);
                            const postBounds = await this.navigator.findPostContentBounds();
                            if (postBounds) {
                                captureBox = postBounds;
                            } else {
                                // No article found — use full viewport capture instead
                                const cap = await this.screenshotCollector.captureCurrentPost(
                                    source, context.currentGoal.target, fpHash
                                );
                                if (cap) {
                                    captured = true;
                                    console.log(`  📸 Capture (full viewport, expanded from small targetId=${captureTargetId}): ${captureReason}`);
                                }
                                captureBox = null; // Skip the cropped capture below
                            }
                        }

                        if (captureBox && !offViewport) {
                            const cap = await this.screenshotCollector.captureFocusedElement(
                                captureBox, source, context.currentGoal.target, captureReason, fpHash
                            );
                            if (cap) {
                                captured = true;
                                console.log(`  📸 Capture (targetId=${captureTargetId}${freshBox ? '' : ', stale bounds'}): ${captureReason}`);
                            }
                        } else if (offViewport) {
                            console.warn(`  ⚠️ capture targetId=${captureTargetId} is off-viewport (y=${captureBox!.y.toFixed(0)}), skipping`);
                        } else if (!captured) {
                            // Element not found — try article bounds or full viewport
                            console.warn(`  ⚠️ capture targetId=${captureTargetId} not found, falling back`);
                            const postBounds = await this.navigator.findPostContentBounds();
                            if (postBounds) {
                                const cap = await this.screenshotCollector.captureFocusedElement(
                                    postBounds, source, context.currentGoal.target, captureReason, fpHash
                                );
                                if (cap) {
                                    captured = true;
                                    console.log(`  📸 Capture (article fallback): ${captureReason}`);
                                }
                            } else {
                                const cap = await this.screenshotCollector.captureCurrentPost(
                                    source, context.currentGoal.target, fpHash
                                );
                                if (cap) {
                                    captured = true;
                                    console.log(`  📸 Capture (viewport fallback): ${captureReason}`);
                                }
                            }
                        }
                    }
                    // PRIORITY 2: captureNow without targetId → full viewport
                    else if (decision.strategic?.captureNow) {
                        const cap = await this.screenshotCollector.captureCurrentPost(
                            source,
                            context.currentGoal.target,
                            fpHash
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
                                captureBounds, source, context.currentGoal.target, captureReason, fpHash
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
                        this.screenshotCollector.appendLog(`  📸 **Capture #${postsCollected}** (${source}) — ${captureReason}`);
                        lastCaptureAttempt = { succeeded: true };
                        lastCaptureAttemptUrl = this.page.url();
                        console.log(`[CAPTURE-OK] #${postsCollected} source=${source} fp=${fpHash?.slice(0, 20) || 'null'} url=${this.page.url()}`);
                    } else {
                        // Don't overwrite success with failure for the same post
                        // URL variants like /p/X/ and /user/p/X/ share the same post ID
                        const currentPostId = this.extractPostIdFromUrl(this.page.url());
                        const lastPostId = this.extractPostIdFromUrl(lastCaptureAttemptUrl);
                        if (lastCaptureAttempt?.succeeded && currentPostId && currentPostId === lastPostId) {
                            // Keep success — LLM needs to know this post is already captured
                            console.log(`[CAPTURE-KEPT-SUCCESS] same post ${currentPostId}, not overwriting success with failure`);
                        } else {
                            lastCaptureAttempt = { succeeded: false, reason: 'filtered as duplicate' };
                            lastCaptureAttemptUrl = this.page.url();
                            console.log(`[CAPTURE-FAILED] source=${source} fp=${fpHash?.slice(0, 20) || 'null'} url=${this.page.url()} reason=see [CAPTURE-REJECT] above`);
                        }
                    }
                }

                // Execute LLM-controlled linger duration
                if (decision.strategic?.lingerDuration) {
                    await this.navigationExecutor.executeLinger(decision.strategic);
                }

                // === DEEP ENGAGEMENT STATE TRACKING ===

                // Update carousel state (needed for programmatic carousel exploration)
                const carouselIndicator = await this.navigator.getCarouselSlideIndicator();
                if (carouselIndicator) {
                    const prevSlide = engagementState.carouselState?.currentSlide || 0;
                    engagementState.carouselState = {
                        currentSlide: carouselIndicator.current,
                        totalSlides: carouselIndicator.total,
                        fullyExplored: carouselIndicator.current === carouselIndicator.total
                    };
                    if (prevSlide !== carouselIndicator.current) {
                        console.log(`  🎠 Carousel: Slide ${carouselIndicator.current}/${carouselIndicator.total}`);
                    }
                }

                // Handle closeEngagement decision
                if (decision.strategic?.closeEngagement) {
                    if (engagementState.currentPost?.postUrl) {
                        engagementState.deeplyExploredPostUrls.push(engagementState.currentPost.postUrl);
                        console.log(`  ✓ Added to explored posts (${engagementState.deeplyExploredPostUrls.length} total)`);
                    }
                    if (decision.action === 'press' && (decision.params as PressParams).key === 'Escape') {
                        engagementState.level = 'feed';
                        engagementState.currentPost = undefined;
                        engagementState.carouselState = undefined;
                        engagementState.entryAction = undefined;
                        engagementState.levelEnteredAt = Date.now();
                    }
                }
            } else {
                console.log(`  ❌ Action failed: ${result.errorMessage}`);
                this.screenshotCollector.appendLog(`  ❌ FAILED: ${result.errorMessage}`);
            }

            actionCount++;

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

        // Write summary to session log
        this.screenshotCollector.appendLogRaw(`\n---\n\n## Summary`);
        this.screenshotCollector.appendLogRaw(`- **Actions:** ${actionCount}`);
        this.screenshotCollector.appendLogRaw(`- **Posts captured:** ${postsCollected}`);
        this.screenshotCollector.appendLogRaw(`- **Stories watched:** ${storiesWatched}`);
        this.screenshotCollector.appendLogRaw(`- **Unique content ratio:** ${(uniquePosts.size / Math.max(totalPostsSeen, 1) * 100).toFixed(0)}%`);
        this.screenshotCollector.appendLogRaw(`- **Posts deeply explored:** ${engagementState.deeplyExploredPostUrls.length}`);
        this.screenshotCollector.appendLogRaw(`- **Phase history:** ${phaseHistory.map(p => `${p.phase}(${(p.durationMs/1000).toFixed(0)}s)`).join(' → ')}`);
        this.screenshotCollector.appendLogRaw(`- **Duration:** ${((Date.now() - startTime) / 1000 / 60).toFixed(1)} minutes`);
        this.screenshotCollector.flushSessionLog();

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
     * Get the navigation goal for a given phase.
     * Returns a generic goal — the LLM determines context from tree + screenshot.
     */
    private getGoalForPhase(
        phase: BrowsingPhase,
        userInterests: string[],
        interestsSearched: string[]
    ): NavigationGoal {
        const unsearched = userInterests.filter(i => !interestsSearched.includes(i));
        if (phase === 'search' && unsearched.length > 0) {
            return {
                type: 'search_interest',
                target: unsearched[0]
            };
        }
        return {
            type: 'general_browse',
            target: `Phase: ${phase}`
        };
    }

    // NOTE: shouldTransitionPhase() and getNextPhase() removed
    // LLM now controls phase transitions through strategic decisions
}
