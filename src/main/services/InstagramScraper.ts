/**
 * InstagramScraper - Orchestration Layer
 *
 * Manages the session lifecycle: page creation, login verification,
 * session memory, and capture collection. Delegates all browsing
 * decisions to VisionAgent (pure vision-based LLM navigation).
 *
 * Cost layers:
 * - Physics (GhostMouse, HumanScroll) — $0
 * - Navigation (VisionAgent → LLM) — ~$0.001/decision
 * - Post-processing (digest, analysis) — varies
 */

import { BrowserContext, Page } from 'playwright';
import { GhostMouse } from './GhostMouse.js';
import { HumanScroll } from './HumanScroll.js';
import { UsageService } from './UsageService.js';
import { ScreenshotCollector } from './ScreenshotCollector.js';
import { VisionAgent } from './VisionAgent.js';
import { SessionMemory } from './SessionMemory.js';
import * as path from 'path';
import * as os from 'os';
import { BrowsingSession } from '../../types/instagram.js';
import { ModelConfig } from '../../shared/modelConfig.js';
import type { NavigationLoopConfig } from '../../types/navigation.js';
import type { SessionSummary } from '../../types/session-memory.js';

export class InstagramScraper {
    private context: BrowserContext;
    private apiKey: string;
    private usageCap: number;
    private usageService: UsageService;
    private debugMode: boolean;

    // Layer instances (created per-session)
    private ghost!: GhostMouse;
    private scroll!: HumanScroll;
    private screenshotCollector!: ScreenshotCollector;
    private page!: Page;

    private sessionMemory: SessionMemory = new SessionMemory();

    constructor(context: BrowserContext, apiKey: string, usageCap: number, debugMode: boolean = false) {
        this.context = context;
        this.apiKey = apiKey;
        this.usageCap = usageCap;
        this.usageService = UsageService.getInstance();
        this.debugMode = debugMode;
    }

    /**
     * Main entry point — browse Instagram and return captured screenshots.
     */
    async browseAndCapture(
        targetMinutes: number,
        userInterests: string[]
    ): Promise<BrowsingSession> {
        return this.browseWithAINavigation(targetMinutes, userInterests);
    }

    /**
     * Browse Instagram using VisionAgent (pure vision-based LLM navigation).
     */
    async browseWithAINavigation(
        targetMinutes: number,
        userInterests: string[],
        config?: Partial<NavigationLoopConfig>
    ): Promise<BrowsingSession> {
        const startTime = Date.now();
        const targetDurationMs = targetMinutes * 60 * 1000;

        this.page = await this.context.newPage();
        await this.page.setViewportSize({ width: 1280, height: 900 });

        // Initialize physics layer
        this.ghost = new GhostMouse(this.page);
        this.scroll = new HumanScroll(this.page);

        // Initialize screenshot collector
        const estimatedMaxCaptures = Math.max(150, Math.ceil(targetMinutes * 4));
        this.screenshotCollector = new ScreenshotCollector(this.page, {
            maxCaptures: estimatedMaxCaptures,
            jpegQuality: 85,
            minScrollDelta: Math.round((this.page.viewportSize()?.height || 1920) * 0.10),
            saveToDirectory: path.join(os.homedir(), 'Documents', 'debug-screenshots')
        });

        // Enable visible cursor in debug mode
        if (this.debugMode) {
            await this.ghost.enableVisibleCursor();
        }

        let visionAgent: VisionAgent | undefined;

        try {
            // 1. Navigate to Instagram
            console.log('🌐 Navigating to Instagram...');
            await this.page.goto('https://www.instagram.com/', {
                waitUntil: 'domcontentloaded'
            });
            await this.humanDelay(2000, 4000);

            // 2. Check for login redirect
            const pageUrl = this.page.url();
            console.log('📊 Page URL:', pageUrl);

            if (pageUrl.includes('/accounts/login')) {
                throw new Error('SESSION_EXPIRED');
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

            // 5. Run VisionAgent
            visionAgent = new VisionAgent(
                this.page, this.ghost, this.scroll, this.screenshotCollector,
                {
                    apiKey: this.apiKey,
                    maxDurationMs: config?.maxDurationMs || targetDurationMs,
                    userInterests,
                    debugMode: this.debugMode,
                    sessionMemoryDigest
                }
            );

            const result = await visionAgent.run();

            // 6. Write session summary to log
            this.screenshotCollector.appendLogRaw(`\n---\n\n## Summary`);
            this.screenshotCollector.appendLogRaw(`- **Decisions:** ${result.decisionCount}`);
            this.screenshotCollector.appendLogRaw(`- **Captures:** ${result.captureCount}`);
            this.screenshotCollector.appendLogRaw(`- **Duration:** ${((Date.now() - startTime) / 1000 / 60).toFixed(1)} minutes`);
            this.screenshotCollector.flushSessionLog();

            // 7. Save cross-session memory
            const capturesPerInterest = Math.round(result.captureCount / Math.max(userInterests.length, 1));
            const sessionSummary: SessionSummary = {
                id: `session-${startTime}`,
                timestamp: startTime,
                durationMs: Date.now() - startTime,
                interestResults: userInterests.map(interest => ({
                    interest,
                    captureCount: capturesPerInterest,
                    searchTimeMs: 0,
                    quality: capturesPerInterest >= 5 ? 'high' as const
                        : capturesPerInterest >= 2 ? 'medium' as const
                        : 'low' as const
                })),
                phaseBreakdown: [{
                    phase: 'feed',
                    durationMs: Date.now() - startTime,
                    capturesProduced: result.captureCount
                }],
                stagnationEvents: [],
                totalCaptures: result.captureCount,
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
            // Log summary
            console.log(`\n📊 Session Summary:`);
            if (visionAgent) {
                console.log(`   - Decisions: ${visionAgent.getDecisionCount()}`);
            }
            console.log(`   - Captures: ${this.screenshotCollector.getCaptureCount()}`);

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

    // =========================================================================
    // Utilities
    // =========================================================================

    private humanDelay(min: number, max: number): Promise<void> {
        const delay = min + Math.random() * (max - min);
        return new Promise(resolve => setTimeout(resolve, delay));
    }
}
