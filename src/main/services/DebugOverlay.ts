/**
 * DebugOverlay - Visual Debug System for Kowalski Navigation
 *
 * Provides visual feedback during debug mode to understand:
 * - What elements the LLM sees and is targeting
 * - Current state (phase, engagement level, time remaining)
 * - Click targets before clicking
 * - LLM reasoning and confidence
 *
 * Uses two overlay mechanisms:
 * 1. CSS-injected info panel (stealth-safe)
 * 2. Canvas overlay for element highlights (pointer-events: none)
 */

import { Page } from 'playwright';
import { BoundingBox, Point } from '../../types/instagram.js';
import { NavigationElement, EngagementLevel, BrowsingPhase } from '../../types/navigation.js';

/**
 * State information to display in the debug panel.
 */
export interface DebugState {
    // Session info
    phase: BrowsingPhase;
    timeRemainingMs: number;
    captureCount: number;

    // Engagement state
    engagementLevel: EngagementLevel;
    carouselState?: {
        currentSlide: number;
        totalSlides: number;
    };
    currentPostUsername?: string;

    // LLM decision
    action: string;
    targetId?: number;
    targetName?: string;
    targetRole?: string;
    confidence?: number;
    reasoning: string;

    // Metrics
    postsCollected: number;
    actionsRemaining: number;
}

/**
 * Configuration for debug overlay.
 */
export interface DebugOverlayConfig {
    showElementHighlights?: boolean;  // Highlight all visible elements
    highlightDurationMs?: number;     // How long to show click target highlight
    panelPosition?: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left';
}

const DEFAULT_CONFIG: DebugOverlayConfig = {
    showElementHighlights: false,
    highlightDurationMs: 500,
    panelPosition: 'top-right'
};

/**
 * CSS styles for the debug panel.
 */
const DEBUG_PANEL_CSS = `
#kowalski-debug-panel {
    position: fixed;
    top: 10px;
    right: 10px;
    width: 320px;
    max-height: 90vh;
    overflow-y: auto;
    background: rgba(0, 0, 0, 0.92);
    color: #00ffff;
    font-family: 'SF Mono', 'Monaco', 'Menlo', 'Consolas', monospace;
    font-size: 11px;
    line-height: 1.4;
    padding: 12px;
    border: 2px solid #00ffff;
    border-radius: 8px;
    z-index: 99999;
    pointer-events: none;
    box-shadow: 0 0 20px rgba(0, 255, 255, 0.3);
}

#kowalski-debug-panel .debug-header {
    font-size: 13px;
    font-weight: bold;
    margin-bottom: 10px;
    padding-bottom: 8px;
    border-bottom: 1px solid #00ffff;
    display: flex;
    align-items: center;
    gap: 8px;
}

#kowalski-debug-panel .debug-section {
    margin-bottom: 10px;
    padding-bottom: 8px;
    border-bottom: 1px solid rgba(0, 255, 255, 0.3);
}

#kowalski-debug-panel .debug-section:last-child {
    border-bottom: none;
    margin-bottom: 0;
    padding-bottom: 0;
}

#kowalski-debug-panel .debug-label {
    color: #888;
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-bottom: 2px;
}

#kowalski-debug-panel .debug-value {
    color: #fff;
    font-size: 12px;
}

#kowalski-debug-panel .debug-value.highlight {
    color: #00ff00;
}

#kowalski-debug-panel .debug-value.warning {
    color: #ffff00;
}

#kowalski-debug-panel .debug-value.error {
    color: #ff4444;
}

#kowalski-debug-panel .debug-row {
    display: flex;
    justify-content: space-between;
    margin-bottom: 4px;
}

#kowalski-debug-panel .debug-reasoning {
    color: #aaa;
    font-style: italic;
    font-size: 10px;
    word-wrap: break-word;
    max-height: 60px;
    overflow-y: auto;
}

#kowalski-debug-panel .debug-target-box {
    background: rgba(0, 255, 255, 0.1);
    border: 1px solid rgba(0, 255, 255, 0.5);
    border-radius: 4px;
    padding: 6px;
    margin-top: 6px;
}

#kowalski-debug-canvas {
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    z-index: 99998;
    pointer-events: none;
}
`;

export class DebugOverlay {
    private page: Page;
    private enabled: boolean = false;
    private config: DebugOverlayConfig;

    constructor(page: Page, config?: Partial<DebugOverlayConfig>) {
        this.page = page;
        this.config = { ...DEFAULT_CONFIG, ...config };
    }

    /**
     * Enable the debug overlay by injecting CSS and canvas.
     */
    async enable(): Promise<void> {
        if (this.enabled) return;

        try {
            // Inject CSS styles
            await this.page.addStyleTag({ content: DEBUG_PANEL_CSS });

            // Inject debug panel container
            await this.page.evaluate(() => {
                // Remove existing if any
                const existing = document.getElementById('kowalski-debug-panel');
                if (existing) existing.remove();

                const panel = document.createElement('div');
                panel.id = 'kowalski-debug-panel';
                panel.innerHTML = `
                    <div class="debug-header">
                        🔍 KOWALSKI DEBUG
                    </div>
                    <div class="debug-content">
                        <div class="debug-section">
                            <div class="debug-label">Status</div>
                            <div class="debug-value">Initializing...</div>
                        </div>
                    </div>
                `;
                document.body.appendChild(panel);
            });

            // Inject canvas for element highlights
            await this.page.evaluate(() => {
                const existing = document.getElementById('kowalski-debug-canvas');
                if (existing) existing.remove();

                const canvas = document.createElement('canvas');
                canvas.id = 'kowalski-debug-canvas';
                canvas.width = window.innerWidth;
                canvas.height = window.innerHeight;
                document.body.appendChild(canvas);

                // Handle resize
                window.addEventListener('resize', () => {
                    canvas.width = window.innerWidth;
                    canvas.height = window.innerHeight;
                });
            });

            this.enabled = true;
            console.log('  🔍 Debug overlay enabled');
        } catch (error) {
            console.error('  ❌ Failed to enable debug overlay:', error);
        }
    }

    /**
     * Disable and remove the debug overlay.
     */
    async disable(): Promise<void> {
        if (!this.enabled) return;

        try {
            await this.page.evaluate(() => {
                const panel = document.getElementById('kowalski-debug-panel');
                if (panel) panel.remove();
                const canvas = document.getElementById('kowalski-debug-canvas');
                if (canvas) canvas.remove();
            });
            this.enabled = false;
            console.log('  🔍 Debug overlay disabled');
        } catch (error) {
            // Page might have navigated away
        }
    }

    /**
     * Update the debug panel with current state.
     */
    async updateState(state: DebugState): Promise<void> {
        if (!this.enabled) return;

        const html = this.formatStateHtml(state);

        try {
            await this.page.evaluate((htmlContent) => {
                const panel = document.getElementById('kowalski-debug-panel');
                if (panel) {
                    const content = panel.querySelector('.debug-content');
                    if (content) {
                        content.innerHTML = htmlContent;
                    }
                }
            }, html);
        } catch (error) {
            // Page might have navigated, silently fail
        }
    }

    /**
     * Format state into HTML for the debug panel.
     */
    private formatStateHtml(state: DebugState): string {
        const timeRemaining = Math.max(0, Math.floor(state.timeRemainingMs / 1000));
        const minutes = Math.floor(timeRemaining / 60);
        const seconds = timeRemaining % 60;
        const timeStr = `${minutes}:${seconds.toString().padStart(2, '0')}`;

        // Time warning colors
        const timeClass = timeRemaining < 60 ? 'warning' : (timeRemaining < 30 ? 'error' : '');

        // Engagement emoji
        const engagementEmoji = {
            'feed': '📜',
            'post_modal': '🖼️',
            'comments': '💬',
            'profile': '👤'
        }[state.engagementLevel] || '❓';

        // Phase emoji
        const phaseEmoji = {
            'search': '🔍',
            'stories': '📖',
            'feed': '📜',
            'complete': '✅'
        }[state.phase] || '❓';

        // Action emoji
        const actionEmoji = {
            'click': '👆',
            'scroll': '📜',
            'type': '⌨️',
            'press': '⏎',
            'wait': '⏳'
        }[state.action] || '❓';

        // Confidence bar
        const confidence = state.confidence ?? 0;
        const confidencePercent = Math.round(confidence * 100);
        const confidenceClass = confidence >= 0.8 ? 'highlight' : (confidence >= 0.5 ? '' : 'warning');

        // Build carousel state string
        let carouselStr = '';
        if (state.carouselState) {
            carouselStr = `Slide ${state.carouselState.currentSlide}/${state.carouselState.totalSlides}`;
        }

        return `
            <!-- Session Section -->
            <div class="debug-section">
                <div class="debug-row">
                    <span><span class="debug-label">Phase</span> ${phaseEmoji} ${state.phase.toUpperCase()}</span>
                    <span class="${timeClass}">${timeStr}</span>
                </div>
                <div class="debug-row">
                    <span><span class="debug-label">Captures</span> ${state.captureCount}</span>
                    <span><span class="debug-label">Posts</span> ${state.postsCollected}</span>
                </div>
                <div class="debug-row">
                    <span><span class="debug-label">Actions left</span> ${state.actionsRemaining}</span>
                </div>
            </div>

            <!-- Engagement Section -->
            <div class="debug-section">
                <div class="debug-label">Engagement</div>
                <div class="debug-value">${engagementEmoji} ${state.engagementLevel}</div>
                ${carouselStr ? `<div class="debug-value">🎠 ${carouselStr}</div>` : ''}
                ${state.currentPostUsername ? `<div class="debug-value">👤 @${state.currentPostUsername}</div>` : ''}
            </div>

            <!-- Action Section -->
            <div class="debug-section">
                <div class="debug-label">Action</div>
                <div class="debug-value highlight">${actionEmoji} ${state.action.toUpperCase()}</div>
                ${state.targetId !== undefined ? `
                    <div class="debug-target-box">
                        <div class="debug-row">
                            <span class="debug-label">Target ID</span>
                            <span class="debug-value">#${state.targetId}</span>
                        </div>
                        ${state.targetRole ? `
                            <div class="debug-row">
                                <span class="debug-label">Role</span>
                                <span class="debug-value">${state.targetRole}</span>
                            </div>
                        ` : ''}
                        ${state.targetName ? `
                            <div class="debug-row">
                                <span class="debug-label">Name</span>
                                <span class="debug-value" style="word-break: break-word;">"${this.truncate(state.targetName, 40)}"</span>
                            </div>
                        ` : ''}
                    </div>
                ` : ''}
                <div class="debug-row" style="margin-top: 6px;">
                    <span class="debug-label">Confidence</span>
                    <span class="debug-value ${confidenceClass}">${confidencePercent}%</span>
                </div>
            </div>

            <!-- Reasoning Section -->
            <div class="debug-section">
                <div class="debug-label">Reasoning</div>
                <div class="debug-reasoning">${this.escapeHtml(state.reasoning)}</div>
            </div>
        `;
    }

    /**
     * Highlight a specific element with a colored rectangle.
     */
    async highlightElement(
        bounds: BoundingBox,
        label: string,
        color: string = '#00ffff'
    ): Promise<void> {
        if (!this.enabled) return;

        try {
            await this.page.evaluate(({ bounds, label, color }) => {
                const canvas = document.getElementById('kowalski-debug-canvas') as HTMLCanvasElement;
                if (!canvas) return;

                const ctx = canvas.getContext('2d');
                if (!ctx) return;

                // Clear previous highlights
                ctx.clearRect(0, 0, canvas.width, canvas.height);

                // Draw rectangle
                ctx.strokeStyle = color;
                ctx.lineWidth = 3;
                ctx.setLineDash([5, 5]);
                ctx.strokeRect(bounds.x, bounds.y, bounds.width, bounds.height);

                // Draw label background
                ctx.font = 'bold 12px monospace';
                const textMetrics = ctx.measureText(label);
                const textHeight = 16;
                const padding = 4;

                const labelX = bounds.x;
                const labelY = bounds.y - textHeight - padding * 2;

                ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
                ctx.fillRect(
                    labelX - padding,
                    labelY - padding,
                    textMetrics.width + padding * 2,
                    textHeight + padding * 2
                );

                // Draw label text
                ctx.fillStyle = color;
                ctx.fillText(label, labelX, labelY + textHeight - 2);

            }, { bounds, label, color });
        } catch (error) {
            // Page might have navigated
        }
    }

    /**
     * Show a crosshair at the click target point.
     */
    async showClickTarget(point: Point, label?: string): Promise<void> {
        if (!this.enabled) return;

        try {
            await this.page.evaluate(({ x, y, label }) => {
                const canvas = document.getElementById('kowalski-debug-canvas') as HTMLCanvasElement;
                if (!canvas) return;

                const ctx = canvas.getContext('2d');
                if (!ctx) return;

                // Don't clear - keep element highlight, add crosshair
                const crosshairSize = 20;
                const color = '#ff0000';

                // Draw crosshair
                ctx.strokeStyle = color;
                ctx.lineWidth = 2;
                ctx.setLineDash([]);

                // Horizontal line
                ctx.beginPath();
                ctx.moveTo(x - crosshairSize, y);
                ctx.lineTo(x + crosshairSize, y);
                ctx.stroke();

                // Vertical line
                ctx.beginPath();
                ctx.moveTo(x, y - crosshairSize);
                ctx.lineTo(x, y + crosshairSize);
                ctx.stroke();

                // Circle around point
                ctx.beginPath();
                ctx.arc(x, y, 8, 0, Math.PI * 2);
                ctx.stroke();

                // Draw label if provided
                if (label) {
                    ctx.font = 'bold 11px monospace';
                    ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
                    ctx.fillRect(x + 15, y - 8, ctx.measureText(label).width + 8, 18);
                    ctx.fillStyle = color;
                    ctx.fillText(label, x + 19, y + 5);
                }

            }, { x: point.x, y: point.y, label });
        } catch (error) {
            // Page might have navigated
        }
    }

    /**
     * Clear all highlights from the canvas.
     */
    async clearHighlights(): Promise<void> {
        if (!this.enabled) return;

        try {
            await this.page.evaluate(() => {
                const canvas = document.getElementById('kowalski-debug-canvas') as HTMLCanvasElement;
                if (!canvas) return;

                const ctx = canvas.getContext('2d');
                if (ctx) {
                    ctx.clearRect(0, 0, canvas.width, canvas.height);
                }
            });
        } catch (error) {
            // Page might have navigated
        }
    }

    /**
     * Truncate string for display.
     */
    private truncate(str: string, maxLen: number): string {
        if (str.length <= maxLen) return str;
        return str.substring(0, maxLen - 3) + '...';
    }

    /**
     * Escape HTML for safe insertion.
     */
    private escapeHtml(str: string): string {
        return str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }
}
