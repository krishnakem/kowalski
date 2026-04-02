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
import { BaseVisionAgent, type BaseAgentConfig, type VisionAction } from './BaseVisionAgent.js';
import { ModelConfig } from '../../shared/modelConfig.js';
import storiesInstructions from '../prompts/stories-instructions.md';
import { labelElements } from '../../utils/elementLabeler.js';

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
        return 'stories';
    }

    protected getAgentName(): string {
        return 'StoriesAgent';
    }

    protected shouldLabelElements(): boolean {
        return true;
    }

    protected async executeAction(decision: VisionAction): Promise<string> {
        const result = await super.executeAction(decision);

        // Auto-pause after actions that change the story frame
        const shouldAutoPause =
            decision.action === 'click' ||
            (decision.action === 'press' && decision.key === 'ArrowRight');

        if (shouldAutoPause) {
            await this.delay(1500);

            // Diagnostic: check pause state before Space
            const beforeState = await this.page.evaluate(() => {
                const pauseBtn = document.querySelector('[aria-label="Pause"]');
                const playBtn = document.querySelector('[aria-label="Play"]');
                return pauseBtn ? 'playing' : playBtn ? 'paused' : 'unknown';
            }).catch(() => 'error');

            await this.page.keyboard.press(' ');
            await this.delay(200);

            // Diagnostic: check pause state after Space
            const afterState = await this.page.evaluate(() => {
                const pauseBtn = document.querySelector('[aria-label="Pause"]');
                const playBtn = document.querySelector('[aria-label="Play"]');
                return pauseBtn ? 'playing' : playBtn ? 'paused' : 'unknown';
            }).catch(() => 'error');

            console.log(`  ⏸️ Auto-pause: before=${beforeState}, after=${afterState}`);
            this.collector.appendLog(`⏸️ Auto-pause: before=${beforeState}, after=${afterState}`);
        }

        // Detect story end after ArrowRight
        if (decision.action === 'press' && decision.key === 'ArrowRight') {
            const rawScreenshot = await this.captureScreenshot();
            if (rawScreenshot) {
                const labeled = await labelElements(
                    this.page, rawScreenshot,
                    this.screenshotWidth, this.screenshotHeight,
                    this.viewportWidth, this.viewportHeight
                );
                this.currentElements = labeled.elements;

                // Check if a right-arrow / "Next" button still exists
                const hasNextButton = [...labeled.elements.values()].some(el => {
                    const label = (el.ariaLabel || '').toLowerCase();
                    const text = (el.text || '').toLowerCase();
                    return label.includes('next') || text.includes('next') || label.includes('right');
                });

                if (!hasNextButton) {
                    console.log('📖 StoriesAgent: no Next button found — stories ended');
                    this.collector.appendLog('📖 StoriesAgent: no Next button found — stories ended');

                    // Click the X / Close button in the top-right
                    const closeButton = [...labeled.elements.values()].find(el => {
                        const label = (el.ariaLabel || '').toLowerCase();
                        const text = (el.text || '').toLowerCase();
                        return label.includes('close') || text.includes('close') || text === 'x';
                    });

                    if (closeButton) {
                        const cx = closeButton.x + closeButton.width / 2;
                        const cy = closeButton.y + closeButton.height / 2;
                        await this.ghost.clickPoint(cx, cy);
                        console.log('📖 Clicked Close button to exit stories');
                        this.collector.appendLog('📖 Clicked Close button to exit stories');
                    } else {
                        await this.page.keyboard.press('Escape');
                        console.log('📖 No Close button found, pressed Escape');
                        this.collector.appendLog('📖 No Close button found, pressed Escape');
                    }

                    this.stopped = true;
                }
            }
        }

        return result;
    }

    protected getWorkflowSummary(): string {
        return `I've studied the reference images. Here's my workflow:

OPENING STORIES (from stories1):
- Story avatars are the circular profile pictures at the top of the feed with colored gradient rings (pinkish-orange border)
- Click the LEFTMOST avatar with a gradient ring to start viewing stories
- The gradient ring distinguishes unwatched stories from regular profile pictures

VIEWING STORIES (from stories2):
- Press ArrowRight to advance to the next story frame
- Stories are automatically paused by the system — just keep pressing ArrowRight
- Do NOT click the small story previews on the sides (those are other users' stories)

EXITING STORIES (from stories.end):
- When I reach the last story (no more frames to advance to), click the X button in the top-right corner
- This exits the story viewer and returns to the home feed
- Do not skip any stories — every frame must be screenshotted`;
    }
}