/**
 * FeedAgent - Phase 2: Feed browsing agent.
 *
 * The complex browsing agent. Uses Sonnet for reasoning about
 * which elements are timestamp links, how to handle carousels,
 * when to scroll, how to dismiss unexpected UI.
 *
 * Gets remaining time budget (total minus stories duration).
 * Reference images included (feed navigation is more complex).
 */

import { Page } from 'playwright';
import { GhostMouse } from './GhostMouse.js';
import { HumanScroll } from './HumanScroll.js';
import { ScreenshotCollector } from './ScreenshotCollector.js';
import { BaseVisionAgent, type BaseAgentConfig } from './BaseVisionAgent.js';
import { ModelConfig } from '../../shared/modelConfig.js';
import feedInstructions from '../prompts/feed-instructions.md';

export class FeedAgent extends BaseVisionAgent {
    constructor(
        page: Page,
        ghost: GhostMouse,
        scroll: HumanScroll,
        collector: ScreenshotCollector,
        config: BaseAgentConfig
    ) {
        super(page, ghost, scroll, collector, config);
    }

    protected getInstructionPrompt(): string {
        return feedInstructions;
    }

    protected getModel(): string {
        return ModelConfig.navigation;
    }

    protected getMaxTokens(): number {
        return 2048;
    }

    protected getReferenceImageFolder(): string | null {
        return 'Posts';
    }

    protected getAgentName(): string {
        return 'FeedAgent';
    }

    protected shouldLabelElements(): boolean {
        return true; // Feed benefits from labeled elements for timestamp links, carousels, etc.
    }
}