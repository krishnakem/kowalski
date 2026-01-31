/**
 * StrategicGaze - LLM-Driven Gaze Planning Service
 *
 * Uses a lightweight LLM (gpt-4o-mini) to identify visually interesting
 * "gaze anchors" that a human would look at before clicking a target.
 *
 * This service is called ONLY on major view transitions:
 * - feed → landing on home feed
 * - profile → navigating to a user profile
 * - explore → entering explore page
 * - search_results → search dropdown populated
 * - story → entering story view
 *
 * Cost: ~$0.001 per call × ~10 view changes = ~$0.01/session
 *
 * Key principles:
 * - Strategic decisions only (where to look), NOT motor control
 * - Graceful degradation (fallback to deterministic if LLM fails)
 * - Token-efficient spatial map format (normalized 0-1000 coordinates)
 * - View-change triggered (not per-action)
 */

import {
    Point,
    GazeStrategy,
    SpatialNode,
    ContentState
} from '../../types/instagram.js';

/**
 * Views that trigger strategic gaze planning.
 */
type MajorView = ContentState['currentView'];

/**
 * Intent describes what the user is trying to accomplish.
 */
type GazeIntent =
    | 'explore_feed'
    | 'find_search'
    | 'browse_profile'
    | 'watch_story'
    | 'view_search_results'
    | 'general_browse';

export class StrategicGaze {
    private apiKey: string;

    // Track last view to avoid redundant LLM calls
    private lastView: MajorView | null = null;
    private lastIntent: GazeIntent | null = null;

    // Session-level randomization
    private sessionVariance: number;

    // Track gaze planning calls for logging
    private gazePlanningCalls: number = 0;

    constructor(apiKey: string) {
        this.apiKey = apiKey;
        // Add ±20% variance to all coordinates
        this.sessionVariance = 0.8 + Math.random() * 0.4;
    }

    /**
     * Randomized value within a range - NO fixed values allowed.
     */
    private randomInRange(min: number, max: number): number {
        return min + Math.random() * (max - min);
    }

    /**
     * Check if we should plan a new gaze strategy.
     * Only plan on view changes to minimize LLM calls.
     */
    shouldPlanGaze(currentView: MajorView, intent: GazeIntent): boolean {
        // Skip if view and intent haven't changed
        if (currentView === this.lastView && intent === this.lastIntent) {
            return false;
        }

        // Skip unknown views
        if (currentView === 'unknown' || currentView === 'login') {
            return false;
        }

        return true;
    }

    /**
     * Plan gaze strategy using LLM.
     *
     * @param currentView - Current page view type
     * @param spatialMap - Token-efficient representation of visible elements
     * @param intent - What the user is trying to accomplish
     * @returns GazeStrategy with gaze anchors and primary target, or null if skipped
     */
    async planGazeStrategy(
        currentView: MajorView,
        spatialMap: SpatialNode[],
        intent: GazeIntent
    ): Promise<GazeStrategy | null> {
        // Skip if view hasn't changed
        if (!this.shouldPlanGaze(currentView, intent)) {
            return null;
        }

        // Update tracked state
        this.lastView = currentView;
        this.lastIntent = intent;

        // If spatial map is empty, return null (nothing to look at)
        if (spatialMap.length === 0) {
            return null;
        }

        try {
            const strategy = await this.callGazePlanningLLM(currentView, spatialMap, intent);

            // Track gaze planning calls (cost is ~$0.001 per call, negligible)
            this.gazePlanningCalls++;
            console.log(`  👁️ StrategicGaze call #${this.gazePlanningCalls} (est. cost: $${(this.gazePlanningCalls * 0.001).toFixed(4)})`);

            return strategy;
        } catch (error) {
            console.warn('StrategicGaze LLM call failed, using fallback:', error);
            return this.fallbackGazeStrategy(spatialMap);
        }
    }

    /**
     * Call the LLM to generate gaze strategy.
     */
    private async callGazePlanningLLM(
        currentView: MajorView,
        spatialMap: SpatialNode[],
        intent: GazeIntent
    ): Promise<GazeStrategy> {
        const systemPrompt = `You are a human attention simulator. Given a spatial map of UI elements, identify 1-2 "gaze anchors" (visually interesting elements a human would glance at) before looking at the primary target.

Rules:
1. Gaze anchors should be visually prominent elements (images, buttons, headings)
2. Anchors should be on the path toward or near the target (not opposite corners)
3. Return 1-2 anchors maximum
4. Coordinates are normalized 0-1000 (will be converted to screen pixels)
5. Prefer elements with meaningful labels over generic ones

Return JSON only:
{
  "gazeAnchors": [{"x": number, "y": number}],
  "primaryTarget": {"x": number, "y": number},
  "confidence": number (0-1)
}`;

        const userPrompt = `View: ${currentView}
Intent: ${intent}
Elements (${spatialMap.length} total):
${JSON.stringify(spatialMap.slice(0, 15), null, 0)}`;  // Limit to 15 elements for token efficiency

        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.apiKey}`
            },
            body: JSON.stringify({
                model: 'gpt-4o-mini',  // Fast, cheap model for this task
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userPrompt }
                ],
                response_format: { type: 'json_object' },
                max_tokens: 200,
                temperature: 0.3  // Low temperature for consistent behavior
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`LLM API error: ${response.status} - ${errorText}`);
        }

        const data = await response.json();
        const content = data.choices?.[0]?.message?.content;

        if (!content) {
            throw new Error('Empty LLM response');
        }

        const parsed = JSON.parse(content) as {
            gazeAnchors: Array<{ x: number; y: number }>;
            primaryTarget: { x: number; y: number };
            confidence: number;
        };

        // Add randomized jitter to all coordinates (±20-40 normalized units)
        const jitterAmount = this.randomInRange(20, 40);

        return {
            gazeAnchors: parsed.gazeAnchors.map(anchor => ({
                x: anchor.x + this.randomInRange(-jitterAmount, jitterAmount),
                y: anchor.y + this.randomInRange(-jitterAmount, jitterAmount)
            })),
            primaryTarget: {
                x: parsed.primaryTarget.x + this.randomInRange(-jitterAmount / 2, jitterAmount / 2),
                y: parsed.primaryTarget.y + this.randomInRange(-jitterAmount / 2, jitterAmount / 2)
            },
            confidence: parsed.confidence
        };
    }

    /**
     * Fallback gaze strategy when LLM is unavailable.
     * Uses deterministic selection based on element salience.
     */
    private fallbackGazeStrategy(spatialMap: SpatialNode[]): GazeStrategy {
        if (spatialMap.length === 0) {
            return {
                gazeAnchors: [],
                primaryTarget: { x: 500, y: 500 },  // Center fallback
                confidence: 0.1
            };
        }

        // Score elements by visual salience
        const scored = spatialMap.map(node => {
            let score = 0;

            // Role-based scoring
            const roleScores: Record<string, number> = {
                image: 0.8, img: 0.8, figure: 0.75,
                button: 0.6, link: 0.5, heading: 0.4
            };
            score += roleScores[node.role] || 0.2;

            // Center-weighted position scoring
            const distFromCenter = Math.hypot(node.x - 500, node.y - 500) / 707;  // Normalize
            score += (1 - distFromCenter) * 0.3;

            // Size scoring
            const size = node.w * node.h;
            score += Math.min(size / 100000, 0.2);

            return { node, score };
        });

        // Sort by score
        scored.sort((a, b) => b.score - a.score);

        // Select top 1-2 as gaze anchors (randomize count)
        const anchorCount = Math.random() > 0.5 ? 2 : 1;
        const anchors = scored.slice(0, anchorCount).map(s => ({
            x: s.node.x + s.node.w / 2 + this.randomInRange(-30, 30),
            y: s.node.y + s.node.h / 2 + this.randomInRange(-30, 30)
        }));

        // Use the most salient element as primary target (or second if we have 2 anchors)
        const targetNode = scored[Math.min(anchorCount, scored.length - 1)]?.node || scored[0].node;
        const primaryTarget = {
            x: targetNode.x + targetNode.w / 2 + this.randomInRange(-20, 20),
            y: targetNode.y + targetNode.h / 2 + this.randomInRange(-20, 20)
        };

        return {
            gazeAnchors: anchors,
            primaryTarget,
            confidence: 0.5  // Lower confidence for fallback
        };
    }

    /**
     * Convert normalized coordinates (0-1000) to screen pixels.
     *
     * @param normalized - Point in 0-1000 coordinate space
     * @param viewportWidth - Actual viewport width in pixels
     * @param viewportHeight - Actual viewport height in pixels
     */
    denormalizePoint(
        normalized: Point,
        viewportWidth: number,
        viewportHeight: number
    ): Point {
        return {
            x: Math.round((normalized.x / 1000) * viewportWidth * this.sessionVariance),
            y: Math.round((normalized.y / 1000) * viewportHeight * this.sessionVariance)
        };
    }

    /**
     * Convert entire gaze strategy to screen coordinates.
     */
    denormalizeStrategy(
        strategy: GazeStrategy,
        viewportWidth: number,
        viewportHeight: number
    ): GazeStrategy {
        return {
            gazeAnchors: strategy.gazeAnchors.map(p =>
                this.denormalizePoint(p, viewportWidth, viewportHeight)
            ),
            primaryTarget: this.denormalizePoint(
                strategy.primaryTarget,
                viewportWidth,
                viewportHeight
            ),
            confidence: strategy.confidence
        };
    }

    /**
     * Map view and action to intent for gaze planning.
     */
    static inferIntent(view: MajorView, action?: string): GazeIntent {
        if (action === 'search') return 'find_search';
        if (action === 'click_result') return 'view_search_results';

        switch (view) {
            case 'feed': return 'explore_feed';
            case 'profile': return 'browse_profile';
            case 'story': return 'watch_story';
            case 'explore': return 'general_browse';
            default: return 'general_browse';
        }
    }

    /**
     * Reset view tracking (call when starting new session).
     */
    reset(): void {
        this.lastView = null;
        this.lastIntent = null;
    }
}
