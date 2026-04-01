/**
 * StoriesAgent - Phase 1: Stories browsing agent.
 *
 * Bounded, mechanical, cheap. Uses Haiku for the tight loop of
 * click avatar → advance right → advance right → escape.
 *
 * No reference images needed (stories UI is simple).
 * Smaller max_tokens (512 is plenty for story navigation).
 * Hard time cap (default 3 minutes).
 */

import { Page } from 'playwright';
import { GhostMouse } from './GhostMouse.js';
import { HumanScroll } from './HumanScroll.js';
import { ScreenshotCollector } from './ScreenshotCollector.js';
import { BaseVisionAgent, type BaseAgentConfig } from './BaseVisionAgent.js';
import { ModelConfig } from '../../shared/modelConfig.js';
import storiesInstructions from '../prompts/stories-instructions.md';

export class StoriesAgent extends BaseVisionAgent {
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
        return storiesInstructions;
    }

    protected getModel(): string {
        return ModelConfig.stories;
    }

    protected getMaxTokens(): number {
        return 512;
    }

    protected getReferenceImageFolder(): string | null {
        return null; // Stories UI is simple enough — no reference images needed
    }

    protected getAgentName(): string {
        return 'StoriesAgent';
    }

    protected shouldLabelElements(): boolean {
        return false; // Stories navigation is mechanical — pure visual recognition
    }
}