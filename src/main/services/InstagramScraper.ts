/**
 * InstagramScraper - Orchestration Layer
 *
 * Manages the session lifecycle: page creation, login verification,
 * session memory, and capture collection. Delegates all browsing
 * decisions to Scroller (pure vision-based LLM navigation).
 *
 * Cost layers:
 * - Physics (GhostMouse, HumanScroll) — $0
 * - Navigation (Scroller → LLM) — ~$0.001/decision
 * - Post-processing (digest, analysis) — varies
 */

import { BrowserContext, Page } from 'playwright';
import { GhostMouse } from './GhostMouse.js';
import { HumanScroll } from './HumanScroll.js';
import { UsageService } from './UsageService.js';
import { ScreenshotCollector } from './ScreenshotCollector.js';
import { Scroller } from './Scroller.js';
import { SessionMemory } from './SessionMemory.js';
import * as path from 'path';
import { BrowsingSession } from '../../types/instagram.js';
import { ModelConfig } from '../../shared/modelConfig.js';
import type { NavigationLoopConfig } from '../../types/navigation.js';
import type { SessionSummary } from '../../types/session-memory.js';

export class InstagramScraper {
    private context: BrowserContext;
    private apiKey: string;
    private usageService: UsageService;
    private debugMode: boolean;

    // Layer instances (created per-session)
    private ghost!: GhostMouse;
    private scroll!: HumanScroll;
    private screenshotCollector!: ScreenshotCollector;
    private page!: Page;

    private sessionMemory: SessionMemory = new SessionMemory();
    private activeScroller: Scroller | null = null;

    constructor(context: BrowserContext, apiKey: string, debugMode: boolean = false) {
        this.context = context;
        this.apiKey = apiKey;
        this.usageService = UsageService.getInstance();
        this.debugMode = debugMode;
    }

    /** Stop the active browsing session externally (e.g. Cmd+Shift+K). */
    stop(): void {
        if (this.activeScroller) {
            this.activeScroller.stop();
        }
    }

    /**
     * Main entry point — browse Instagram and return captured screenshots.
     */
    async browseAndCapture(
        targetMinutes: number,
        userInterests: string[],
        config?: Partial<NavigationLoopConfig>
    ): Promise<BrowsingSession> {
        return this.browseWithAINavigation(targetMinutes, userInterests, config);
    }

    /**
     * Browse Instagram using Scroller (pure vision-based LLM navigation).
     */
    async browseWithAINavigation(
        targetMinutes: number,
        userInterests: string[],
        config?: Partial<NavigationLoopConfig>
    ): Promise<BrowsingSession> {
        const startTime = Date.now();
        const targetDurationMs = targetMinutes * 60 * 1000;

        // Reuse the existing page if it's already on Instagram (e.g. from validateSession),
        // otherwise create a new one. This avoids opening a duplicate tab.
        const existingPages = this.context.pages();
        const instagramPage = existingPages.find(p => p.url().includes('instagram.com'));
        this.page = instagramPage || await this.context.newPage();

        // Initialize physics layer
        this.ghost = new GhostMouse(this.page);
        this.scroll = new HumanScroll(this.page);

        // Initialize screenshot collector
        const estimatedMaxCaptures = Math.max(150, Math.ceil(targetMinutes * 4));
        this.screenshotCollector = new ScreenshotCollector(this.page, {
            maxCaptures: estimatedMaxCaptures,
            jpegQuality: 85,
            minScrollDelta: Math.round((this.page.viewportSize()?.height || 1920) * 0.10),
            saveToDirectory: path.join(__dirname, '../../debug-screenshots')
        });

        let visionAgent: Scroller | undefined;

        try {
            // 1. Navigate to Instagram (skip if already there from validateSession)
            const currentUrl = this.page.url();
            if (!currentUrl.includes('instagram.com') || currentUrl.includes('/accounts/login')) {
                console.log('🌐 Navigating to Instagram...');
                await this.page.goto('https://www.instagram.com/', {
                    waitUntil: 'domcontentloaded'
                });
                await this.humanDelay(2000, 4000);
            } else {
                console.log('🌐 Already on Instagram, reusing existing page');
            }

            // 2. Check for login redirect
            const pageUrl = this.page.url();
            console.log('📊 Page URL:', pageUrl);

            if (pageUrl.includes('/accounts/login')) {
                throw new Error('SESSION_EXPIRED');
            }

            // Natural mouse settle — move cursor away from sidebar with human-like motion
            const vp = this.page.viewportSize();
            if (vp) {
                // First move: somewhere in the upper-center area
                await this.ghost.hover(
                    { x: vp.width * (0.35 + Math.random() * 0.3), y: vp.height * (0.2 + Math.random() * 0.3) },
                    300 + Math.random() * 400
                );
                // Second move: settle into the feed area
                await this.ghost.hover(
                    { x: vp.width * (0.4 + Math.random() * 0.2), y: vp.height * (0.4 + Math.random() * 0.3) },
                    200 + Math.random() * 300
                );
            }

            console.log('\n👁️  ═══════════════════════════════════════');
            console.log('👁️  VISION AGENT MODE ACTIVE');
            console.log('👁️  ═══════════════════════════════════════\n');

            // 3. Load cross-session memory
            await this.sessionMemory.loadMemory();
            const sessionMemoryDigest = this.sessionMemory.generateDigest();

            // 4. Write session header to log
            this.screenshotCollector.appendLogRaw(`# Session Log`);
            this.screenshotCollector.appendLogRaw(`**Started:** ${new Date().toISOString()}`);
            this.screenshotCollector.appendLogRaw(`**Budget:** ${targetMinutes} minutes`);
            this.screenshotCollector.appendLogRaw(`**Interests:** ${userInterests.join(', ')}`);
            this.screenshotCollector.appendLogRaw(`**Navigation Model:** ${ModelConfig.navigation}`);
            this.screenshotCollector.appendLogRaw(`**Mode:** Vision-only (no accessibility tree)`);
            this.screenshotCollector.appendLogRaw(`\n---\n`);

            // 5. Run Scroller
            visionAgent = new Scroller(
                this.page, this.ghost, this.scroll, this.screenshotCollector,
                {
                    apiKey: this.apiKey,
                    maxDurationMs: config?.maxDurationMs || targetDurationMs,
                    userInterests,
                    debugMode: this.debugMode,
                    sessionMemoryDigest,
                    rawDir: config?.rawDir
                }
            );
            this.activeScroller = visionAgent;

            const result = await visionAgent.run();

            // 6. Write session summary to log
            this.screenshotCollector.appendLogRaw(`\n---\n\n## Summary`);
            this.screenshotCollector.appendLogRaw(`- **Decisions:** ${result.decisionCount}`);
            this.screenshotCollector.appendLogRaw(`- **Raw Screenshots:** ${result.rawScreenshotCount}`);
            // this.screenshotCollector.appendLogRaw(`- **Video recordings:** ${result.recordCount}`);  // VIDEO RECORDING DISABLED
            this.screenshotCollector.appendLogRaw(`- **Duration:** ${((Date.now() - startTime) / 1000 / 60).toFixed(1)} minutes`);
            this.screenshotCollector.flushSessionLog();

            // 7. Save cross-session memory
            const screenshotsPerInterest = Math.round(result.rawScreenshotCount / Math.max(userInterests.length, 1));
            const sessionSummary: SessionSummary = {
                id: `session-${startTime}`,
                timestamp: startTime,
                durationMs: Date.now() - startTime,
                interestResults: userInterests.map(interest => ({
                    interest,
                    captureCount: screenshotsPerInterest,
                    searchTimeMs: 0,
                    quality: screenshotsPerInterest >= 5 ? 'high' as const
                        : screenshotsPerInterest >= 2 ? 'medium' as const
                        : 'low' as const
                })),
                phaseBreakdown: [{
                    phase: 'feed',
                    durationMs: Date.now() - startTime,
                    capturesProduced: result.rawScreenshotCount
                }],
                stagnationEvents: [],
                totalCaptures: result.rawScreenshotCount,
                totalActions: result.decisionCount,
                uniqueContentRatio: 1.0
            };
            await this.sessionMemory.saveSession(sessionSummary);

        } catch (error: any) {
            console.error('❌ Navigation error:', error.message);
            if (['SESSION_EXPIRED', 'RATE_LIMITED'].includes(error.message)) {
                throw error;
            }
        } finally {
            this.activeScroller = null;

            // Log summary
            console.log(`\n📊 Session Summary:`);
            if (visionAgent) {
                console.log(`   - Decisions: ${visionAgent.getDecisionCount()}`);
                console.log(`   - Raw screenshots: ${visionAgent.getRawScreenshotCount()}`);
            }

            this.screenshotCollector.logSummary();
            await this.page.close();
        }

        return {
            captures: [],  // No longer populated here — filter agent handles this
            videos: [],
            sessionDuration: Date.now() - startTime,
            rawScreenshotCount: visionAgent?.getRawScreenshotCount() || 0,
            captureCount: 0,  // Deprecated
            videoCount: 0,
            scrapedAt: new Date().toISOString()
        };
    }

    // =========================================================================
    // Utilities
    // =========================================================================

    private humanDelay(min: number, max: number): Promise<void> {
        const delay = min + Math.random() * (max - min);
        return new Promise(resolve => setTimeout(resolve, delay));
    }
}
