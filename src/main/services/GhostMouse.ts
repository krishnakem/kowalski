/**
 * GhostMouse - Human-like Mouse Movement Simulation
 *
 * Generates realistic mouse movements using Bezier curves with:
 * - Variable velocity (acceleration/deceleration)
 * - Natural curve trajectories (humans don't move in straight lines)
 * - Overshoot and micro-corrections
 * - Randomized click positions (never exactly center)
 *
 * Cost: $0 (pure physics simulation, no API calls)
 */

import { Bezier } from 'bezier-js';
import { Page } from 'playwright';
import { Point, MovementConfig, BoundingBox, GazeConfig, GazeTarget } from '../../types/instagram.js';
import { ease } from '../../lib/animations.js';

/**
 * Control points for a cubic Bezier curve.
 */
interface BezierControlPoints {
    start: Point;
    cp1: Point;
    cp2: Point;
    end: Point;
}

export class GhostMouse {
    private page: Page;
    private currentPosition: Point = { x: 0, y: 0 };
    private cursorVisible: boolean = false;

    // Session-level entropy (randomized once per GhostMouse instance)
    // This ensures timing patterns vary across sessions, defeating pattern analysis
    private sessionTimingMultiplier: number;
    private sessionJitterMultiplier: number;
    // Session-level hesitation probability (3-7% per session, not fixed 5%)
    private sessionHesitationProb: number;

    constructor(page: Page) {
        this.page = page;
        // Vary timing by ±30% per session (0.7 to 1.3)
        this.sessionTimingMultiplier = 0.7 + Math.random() * 0.6;
        // Vary jitter by ±40% per session (0.6 to 1.4)
        this.sessionJitterMultiplier = 0.6 + Math.random() * 0.8;
        // Vary hesitation probability per session (3-7% range)
        this.sessionHesitationProb = 0.03 + Math.random() * 0.04;
    }

    /**
     * Enable visible cursor for debugging.
     * Uses a custom CSS cursor image (data URI) - no DOM injection.
     * This is safer than injecting elements which could trigger bot detection.
     */
    async enableVisibleCursor(): Promise<void> {
        if (this.cursorVisible) return;

        // Use CSS cursor with a data URI for a large, visible cursor
        // This doesn't inject any detectable DOM elements
        await this.page.addStyleTag({
            content: `
                * {
                    cursor: url('data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><circle cx="16" cy="16" r="12" fill="rgba(255,0,0,0.7)" stroke="white" stroke-width="2"/><circle cx="16" cy="16" r="3" fill="white"/></svg>') 16 16, auto !important;
                }
            `
        });

        this.cursorVisible = true;
        console.log('👁️ Visible cursor enabled (CSS mode)');
    }

    /**
     * Disable visible cursor.
     * Note: CSS cannot be easily removed, so this is a no-op.
     * The cursor will reset on page navigation.
     */
    async disableVisibleCursor(): Promise<void> {
        // CSS cursor styles persist until page reload
        // For debug sessions this is fine
        this.cursorVisible = false;
    }

    /**
     * Update the visible cursor position.
     * With CSS cursor mode, no update needed - cursor follows mouse automatically.
     */
    private async updateVisibleCursor(_x: number, _y: number): Promise<void> {
        // No-op: CSS cursor follows mouse automatically
    }

    /**
     * Move mouse to target with human-like Bezier curve trajectory.
     * Includes variable velocity (acceleration/deceleration).
     */
    async moveTo(target: Point, config: MovementConfig = {}): Promise<void> {
        const {
            minSpeed = 2,
            maxSpeed = 8,
            overshootProbability = 0.15,
            jitterAmount = 2
        } = config;

        // Calculate movement distance for physics-based overshoot
        const movementDistance = Math.hypot(
            target.x - this.currentPosition.x,
            target.y - this.currentPosition.y
        );

        // 1. Generate control points for Bezier curve
        const controlPoints = this.generateBezierControlPoints(
            this.currentPosition,
            target
        );

        // 2. Create Bezier curve
        const curve = new Bezier(
            controlPoints.start.x, controlPoints.start.y,
            controlPoints.cp1.x, controlPoints.cp1.y,
            controlPoints.cp2.x, controlPoints.cp2.y,
            controlPoints.end.x, controlPoints.end.y
        );

        // 3. Calculate points along curve with variable velocity
        const points = this.generateVariableVelocityPoints(curve, minSpeed, maxSpeed);

        // 4. Execute movement with micro-jitter and session-adjusted timing
        // Apply session jitter multiplier for cross-session variation
        const effectiveJitter = jitterAmount * this.sessionJitterMultiplier;

        for (let i = 0; i < points.length; i++) {
            const jitteredPoint = this.addJitter(points[i], effectiveJitter);
            await this.page.mouse.move(jitteredPoint.x, jitteredPoint.y);
            await this.updateVisibleCursor(jitteredPoint.x, jitteredPoint.y);
            // Human-realistic timing with session variance (base 12-45ms scaled by session multiplier)
            const baseMin = 12 * this.sessionTimingMultiplier;
            const baseMax = 45 * this.sessionTimingMultiplier;
            await this.microDelay(baseMin, baseMax);

            // Hesitation point: session-varied probability (3-7%) of longer pause during movement
            // Humans don't move smoothly for long distances - they pause to "think"
            if (i > 0 && i < points.length - 1 && Math.random() < this.sessionHesitationProb) {
                await this.microDelay(80 * this.sessionTimingMultiplier, 200 * this.sessionTimingMultiplier);
            }
        }

        // 5. Optional overshoot and correction (with distance-based physics)
        if (Math.random() < overshootProbability) {
            await this.overshootAndCorrect(target, movementDistance);
        }

        this.currentPosition = target;
    }

    /**
     * Generate Bezier control points that create natural curve.
     * Humans don't move in straight lines - they curve slightly.
     */
    private generateBezierControlPoints(start: Point, end: Point): BezierControlPoints {
        const distance = Math.hypot(end.x - start.x, end.y - start.y);

        // Control points offset perpendicular to the line
        const angle = Math.atan2(end.y - start.y, end.x - start.x);
        const perpAngle = angle + Math.PI / 2;

        // Randomize curve intensity
        const curveIntensity = distance * (0.1 + Math.random() * 0.2);
        const curveDirection = Math.random() > 0.5 ? 1 : -1;

        return {
            start,
            cp1: {
                x: start.x + (end.x - start.x) * 0.25 + Math.cos(perpAngle) * curveIntensity * curveDirection,
                y: start.y + (end.y - start.y) * 0.25 + Math.sin(perpAngle) * curveIntensity * curveDirection
            },
            cp2: {
                x: start.x + (end.x - start.x) * 0.75 + Math.cos(perpAngle) * curveIntensity * curveDirection * 0.5,
                y: start.y + (end.y - start.y) * 0.75 + Math.sin(perpAngle) * curveIntensity * curveDirection * 0.5
            },
            end
        };
    }

    /**
     * Generate points with easing (slow start, fast middle, slow end).
     * Mimics human acceleration/deceleration pattern.
     *
     * Uses the cinematic easing curve from animations.ts for consistency
     * with the app's visual language.
     */
    private generateVariableVelocityPoints(
        curve: Bezier,
        minSpeed: number,
        maxSpeed: number
    ): Point[] {
        const points: Point[] = [];
        const curveLength = curve.length();
        let t = 0;

        while (t <= 1) {
            const point = curve.get(t);
            points.push({ x: point.x, y: point.y });

            // Easing function: ease-in-out (slow-fast-slow)
            // Uses adapted cinematic curve from animations.ts
            const easing = this.easeInOutCinematic(t);
            const speed = minSpeed + (maxSpeed - minSpeed) * (1 - Math.abs(easing - 0.5) * 2);

            // Convert speed to t increment
            const increment = speed / curveLength;
            t += Math.max(increment, 0.01);  // Minimum increment to prevent infinite loop
        }

        return points;
    }

    /**
     * Easing function adapted from animations.ts cinematic curve.
     * [0.22, 1, 0.36, 1] converted to a function.
     *
     * This creates the characteristic "slow start, fast middle, slow end"
     * that makes mouse movements feel natural.
     */
    private easeInOutCinematic(t: number): number {
        // Approximate the cinematic bezier [0.22, 1, 0.36, 1]
        // Using ease-in-out quad as a close approximation
        return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    }

    /**
     * Add random micro-jitter to a point with layered noise.
     * Humans have small involuntary hand movements at multiple frequencies.
     *
     * Layer 1: Base jitter (primary hand tremor)
     * Layer 2: Micro-tremor (higher frequency, smaller amplitude neurological noise)
     *
     * This two-layer approach defeats bot detection that looks for
     * geometrically perfect Bezier curves.
     */
    private addJitter(point: Point, amount: number): Point {
        // Layer 1: Base jitter (primary hand tremor)
        const baseJitter = {
            x: (Math.random() - 0.5) * amount,
            y: (Math.random() - 0.5) * amount
        };

        // Layer 2: Micro-tremor (higher frequency, ~30% of base amplitude)
        // Simulates fine motor control imperfection
        const tremor = {
            x: (Math.random() - 0.5) * (amount * 0.3),
            y: (Math.random() - 0.5) * (amount * 0.3)
        };

        return {
            x: point.x + baseJitter.x + tremor.x,
            y: point.y + baseJitter.y + tremor.y
        };
    }

    /**
     * Simulate human overshoot: move past target, then correct.
     * This happens when moving quickly - we slightly overshoot, then adjust.
     *
     * Physics-based: Faster movements = more overshoot (human momentum).
     *
     * IMPORTANT: Correction movement uses a micro-curve, NOT a straight line.
     * Straight-line correction is a bot signal (humans don't move perfectly).
     *
     * @param target - The intended target point
     * @param movementDistance - Distance traveled to reach target (affects overshoot magnitude)
     */
    private async overshootAndCorrect(target: Point, movementDistance: number = 100): Promise<void> {
        // Physics-based overshoot: faster/longer movements = more overshoot
        // Range: 5-30px based on movement distance (8% of distance, clamped)
        const baseOvershoot = Math.min(30, Math.max(5, movementDistance * 0.08));
        // Add randomization: ±50% of base overshoot
        const overshootAmount = baseOvershoot * (0.5 + Math.random());

        // Random direction for overshoot (full 360°)
        const overshootAngle = Math.random() * Math.PI * 2;
        const overshoot: Point = {
            x: target.x + Math.cos(overshootAngle) * overshootAmount,
            y: target.y + Math.sin(overshootAngle) * overshootAmount
        };

        await this.page.mouse.move(overshoot.x, overshoot.y);
        await this.updateVisibleCursor(overshoot.x, overshoot.y);
        await this.microDelay(50, 180);  // Pause to "realize" overshoot (widened range)

        // Use micro-curve for correction instead of straight line
        // Humans don't move in perfect straight lines, even for small corrections
        const midpoint: Point = {
            x: (overshoot.x + target.x) / 2 + (Math.random() - 0.5) * 8,
            y: (overshoot.y + target.y) / 2 + (Math.random() - 0.5) * 8
        };

        // Move through midpoint with slight curve
        await this.page.mouse.move(midpoint.x, midpoint.y);
        await this.updateVisibleCursor(midpoint.x, midpoint.y);
        await this.microDelay(10, 30);  // Brief pause (widened from 8-20)
        await this.page.mouse.move(target.x, target.y);
        await this.updateVisibleCursor(target.x, target.y);
    }

    /**
     * Human-like click with pre-click hover and post-click pause.
     */
    async click(target: Point): Promise<void> {
        await this.moveTo(target);
        await this.microDelay(100, 300);  // Pre-click hesitation
        await this.page.mouse.down();
        await this.microDelay(50, 150);   // Hold duration varies
        await this.page.mouse.up();
        await this.microDelay(200, 500);  // Post-click pause
    }

    /**
     * Hover over a target for a duration without clicking.
     * Used to verify element actionability before clicking (e.g., carousel buttons).
     *
     * @param target - Point to hover over
     * @param durationMs - How long to hover (in milliseconds)
     */
    async hover(target: Point, durationMs: number = 1000): Promise<void> {
        await this.moveTo(target);
        // Add slight jitter during hover (humans don't hold perfectly still)
        const jitterDuration = durationMs * 0.8;  // 80% of duration with micro-movements
        const jitterInterval = 150;  // Check/jitter every 150ms
        let elapsed = 0;

        while (elapsed < jitterDuration) {
            await this.microDelay(jitterInterval * 0.8, jitterInterval * 1.2);
            // Tiny micro-movements during hover (1-3px)
            const microMove = {
                x: target.x + (Math.random() - 0.5) * 3,
                y: target.y + (Math.random() - 0.5) * 3
            };
            await this.page.mouse.move(microMove.x, microMove.y);
            elapsed += jitterInterval;
        }

        // Settle back to target for final 20%
        await this.page.mouse.move(target.x, target.y);
        await this.microDelay(durationMs * 0.15, durationMs * 0.25);
    }

    /**
     * Hover over an element with randomized offset within its bounds.
     *
     * @param boundingBox - Element's bounding box
     * @param durationMs - How long to hover
     * @param centerBias - How much to favor center (0.0 = uniform, 1.0 = always center). Randomized 0.2-0.4 if not specified.
     */
    async hoverElement(
        boundingBox: BoundingBox,
        durationMs: number = 1000,
        centerBias?: number
    ): Promise<void> {
        // Use randomized center bias if not explicitly specified
        const effectiveBias = centerBias ?? this.getRandomizedCenterBias();
        const offsetX = this.gaussianRandom(effectiveBias) * boundingBox.width;
        const offsetY = this.gaussianRandom(effectiveBias) * boundingBox.height;

        let hoverPoint: Point = {
            x: boundingBox.x + offsetX,
            y: boundingBox.y + offsetY
        };

        // Ensure we're within the element (safety clamp with 5px margin)
        hoverPoint.x = Math.max(
            boundingBox.x + 5,
            Math.min(hoverPoint.x, boundingBox.x + boundingBox.width - 5)
        );
        hoverPoint.y = Math.max(
            boundingBox.y + 5,
            Math.min(hoverPoint.y, boundingBox.y + boundingBox.height - 5)
        );

        await this.hover(hoverPoint, durationMs);
    }

    /**
     * Click an element with randomized offset within its bounds.
     * Humans NEVER click exactly in the center of buttons.
     *
     * @param boundingBox - Element's bounding box
     * @param centerBias - How much to favor center (0.0 = uniform, 1.0 = always center). Randomized 0.2-0.4 if not specified.
     */
    async clickElement(
        boundingBox: BoundingBox,
        centerBias?: number  // Randomized 0.2-0.4 if not specified
    ): Promise<void> {
        // Generate random offset with randomized center bias
        // Using gaussian-like distribution: more likely near center, but not exact
        const effectiveBias = centerBias ?? this.getRandomizedCenterBias();
        const offsetX = this.gaussianRandom(effectiveBias) * boundingBox.width;
        const offsetY = this.gaussianRandom(effectiveBias) * boundingBox.height;

        // Calculate click point (offset from top-left corner)
        let clickPoint: Point = {
            x: boundingBox.x + offsetX,
            y: boundingBox.y + offsetY
        };

        // Ensure we're still within the element (safety clamp with 5px margin)
        clickPoint.x = Math.max(
            boundingBox.x + 5,
            Math.min(clickPoint.x, boundingBox.x + boundingBox.width - 5)
        );
        clickPoint.y = Math.max(
            boundingBox.y + 5,
            Math.min(clickPoint.y, boundingBox.y + boundingBox.height - 5)
        );

        await this.click(clickPoint);
    }

    /**
     * Get a randomized center bias value (0.2-0.4 range).
     * Avoids using fixed 0.3 which creates detectable patterns.
     */
    private getRandomizedCenterBias(): number {
        return 0.2 + Math.random() * 0.2;  // 0.2-0.4 range
    }

    /**
     * Generate a random number between 0 and 1 with gaussian-like distribution.
     * centerBias: 0.0 = uniform distribution, 1.0 = always 0.5 (center)
     *
     * This mimics human click patterns: usually near center, but with natural variation.
     */
    private gaussianRandom(centerBias?: number): number {
        // Use randomized default if not specified
        const effectiveBias = centerBias ?? this.getRandomizedCenterBias();
        // Box-Muller transform for gaussian distribution
        const u1 = Math.random();
        const u2 = Math.random();
        const gaussian = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);

        // Normalize to 0-1 range (gaussian has ~99.7% within +/-3 std dev)
        const normalized = (gaussian / 6) + 0.5;  // Center at 0.5

        // Clamp to valid range with margin
        const clamped = Math.max(0.1, Math.min(0.9, normalized));

        // Blend between uniform and gaussian based on effectiveBias
        const uniform = 0.1 + Math.random() * 0.8;  // Uniform with margin
        return clamped * effectiveBias + uniform * (1 - effectiveBias);
    }

    /**
     * Small random delay for human-like timing variation.
     * Applies session-level timing multiplier for cross-session variation,
     * defeating pattern analysis that looks for consistent timing signatures.
     */
    private microDelay(min: number, max: number): Promise<void> {
        const baseDelay = min + Math.random() * (max - min);
        // Apply session-level timing variation (set once per GhostMouse instance)
        const sessionAdjustedDelay = baseDelay * this.sessionTimingMultiplier;
        return new Promise(resolve => setTimeout(resolve, sessionAdjustedDelay));
    }

    /**
     * Get current mouse position.
     */
    getPosition(): Point {
        return { ...this.currentPosition };
    }

    /**
     * Set current position (for initialization or after page navigation).
     */
    setPosition(position: Point): void {
        this.currentPosition = { ...position };
    }

    // =========================================================================
    // Gaze-Lag Execution System (Human-like "Look, then Move")
    // =========================================================================

    /**
     * Randomized value within a range - NO fixed values allowed.
     */
    private randomInRange(min: number, max: number): number {
        return min + Math.random() * (max - min);
    }

    /**
     * Default gaze configuration with all randomized ranges.
     */
    private getDefaultGazeConfig(): Required<GazeConfig> {
        return {
            enabled: true,
            saccadicLatency: [280, 420],        // Human eye-to-hand reaction time
            fixationPause: [200, 500],          // Visual fixation at gaze points
            ballisticSplit: [0.75, 0.85],       // 75-85% of distance is ballistic
            scanningSpeed: [2, 4],              // Slow, deliberate scanning
            ballisticSpeed: [8, 12],            // Fast, committed movement
            correctiveSpeed: [1, 3],            // Slow, precise final approach
            scanningJitter: [1.5, 2.5],         // Relaxed hand
            ballisticJitter: [0.5, 1.5],        // Minimal - focused movement
            correctiveJitter: [2.5, 4.5]        // Increased - fine motor tension
        };
    }

    /**
     * Get element-specific hover duration based on role.
     * Different element types require different amounts of visual processing.
     *
     * @param role - The accessibility role of the element
     * @returns Randomized hover duration in milliseconds
     */
    getHoverDurationForRole(role: string): number {
        const roleLower = role.toLowerCase();

        const ranges: Record<string, [number, number]> = {
            button: [50, 150],       // Large, easy targets
            link: [150, 300],        // Precision required
            textbox: [200, 400],     // Cognitive preparation for typing
            searchbox: [200, 400],   // Same as textbox
            combobox: [180, 350],    // Dropdown interaction
            image: [100, 250],       // Visual inspection
            img: [100, 250],         // Same as image
            menuitem: [120, 280],    // Menu navigation
            tab: [100, 220],         // Tab switching
            checkbox: [80, 180],     // Quick toggle
            radio: [80, 180],        // Quick selection
        };

        const [min, max] = ranges[roleLower] || [100, 300];  // Default range
        return this.randomInRange(min, max) * this.sessionTimingMultiplier;
    }

    /**
     * Human-like click with element-specific timing.
     * Varies pre-click hover based on element role.
     *
     * @param target - Point to click
     * @param role - Accessibility role for timing adjustment
     */
    async clickWithRole(target: Point, role: string = 'button'): Promise<void> {
        await this.moveTo(target);

        // Element-specific pre-click hover duration
        const hoverDuration = this.getHoverDurationForRole(role);
        await new Promise(r => setTimeout(r, hoverDuration));

        await this.page.mouse.down();
        // Hold duration varies: 50-150ms (randomized)
        await this.microDelay(50, 150);
        await this.page.mouse.up();

        // Post-click pause: 200-500ms (randomized)
        await this.microDelay(200, 500);
    }

    /**
     * Click an element with gaze-aware role-specific timing.
     *
     * @param boundingBox - Element's bounding box
     * @param role - Accessibility role for timing adjustment
     * @param centerBias - How much to favor center (0.0 = uniform, 1.0 = always center). Randomized 0.2-0.4 if not specified.
     */
    async clickElementWithRole(
        boundingBox: BoundingBox,
        role: string = 'button',
        centerBias?: number
    ): Promise<void> {
        // Generate random offset with randomized center bias
        const effectiveBias = centerBias ?? this.getRandomizedCenterBias();
        const offsetX = this.gaussianRandom(effectiveBias) * boundingBox.width;
        const offsetY = this.gaussianRandom(effectiveBias) * boundingBox.height;

        let clickPoint: Point = {
            x: boundingBox.x + offsetX,
            y: boundingBox.y + offsetY
        };

        // Safety clamp with 5px margin
        clickPoint.x = Math.max(
            boundingBox.x + 5,
            Math.min(clickPoint.x, boundingBox.x + boundingBox.width - 5)
        );
        clickPoint.y = Math.max(
            boundingBox.y + 5,
            Math.min(clickPoint.y, boundingBox.y + boundingBox.height - 5)
        );

        await this.clickWithRole(clickPoint, role);
    }

    /**
     * Investigate and click: Human-like "Look, then Move" sequence.
     *
     * This implements the Hybrid Gaze-Physics System:
     * - Phase 0: Saccadic latency (280-420ms wait before movement)
     * - Phase 1: Scanning (move to gaze anchors, pause at each)
     * - Phase 2: Ballistic (fast movement covering 75-85% of distance)
     * - Phase 3: Corrective (slow, jittery final approach with Fitts's Law)
     *
     * @param target - The final click target
     * @param gazeAnchors - 1-2 "distractor" points to look at first
     * @param role - Accessibility role for timing adjustment
     * @param config - Optional gaze configuration overrides
     */
    async investigateAndClick(
        target: Point,
        gazeAnchors: Point[],
        role: string = 'button',
        config?: Partial<GazeConfig>
    ): Promise<void> {
        const cfg = { ...this.getDefaultGazeConfig(), ...config };

        if (!cfg.enabled || gazeAnchors.length === 0) {
            // Fallback to normal click with role-specific timing
            await this.clickWithRole(target, role);
            return;
        }

        // =====================================================================
        // PHASE 0: Saccadic Latency
        // Human eye-to-hand reaction time before any movement begins
        // =====================================================================
        const saccadicDelay = this.randomInRange(cfg.saccadicLatency[0], cfg.saccadicLatency[1]);
        await new Promise(r => setTimeout(r, saccadicDelay * this.sessionTimingMultiplier));

        // =====================================================================
        // PHASE 1: Scanning
        // Move to gaze anchors at moderate speed, pause at each
        // =====================================================================
        for (const anchor of gazeAnchors.slice(0, 2)) {  // Max 2 anchors
            await this.moveToWithPhaseConfig(
                anchor,
                cfg.scanningSpeed,
                cfg.scanningJitter
            );

            // Visual fixation pause (randomized per anchor)
            const fixationTime = this.randomInRange(cfg.fixationPause[0], cfg.fixationPause[1]);
            await new Promise(r => setTimeout(r, fixationTime * this.sessionTimingMultiplier));
        }

        // =====================================================================
        // PHASE 2 & 3: Ballistic + Corrective
        // Fast approach covering 75-85%, then slow corrective for remainder
        // =====================================================================
        const lastPosition = gazeAnchors.length > 0
            ? gazeAnchors[gazeAnchors.length - 1]
            : this.currentPosition;

        // Calculate split point (randomized 75-85%)
        const ballisticRatio = this.randomInRange(cfg.ballisticSplit[0], cfg.ballisticSplit[1]);

        // Calculate intermediate point for ballistic phase
        const ballisticTarget: Point = {
            x: lastPosition.x + (target.x - lastPosition.x) * ballisticRatio,
            y: lastPosition.y + (target.y - lastPosition.y) * ballisticRatio
        };

        // Phase 2: Ballistic movement (fast, minimal jitter)
        await this.moveToWithPhaseConfig(
            ballisticTarget,
            cfg.ballisticSpeed,
            cfg.ballisticJitter
        );

        // Phase 3: Corrective movement (slow, high jitter)
        await this.moveToWithPhaseConfig(
            target,
            cfg.correctiveSpeed,
            cfg.correctiveJitter
        );

        // =====================================================================
        // Click with role-specific timing
        // =====================================================================
        const hoverDuration = this.getHoverDurationForRole(role);
        await new Promise(r => setTimeout(r, hoverDuration));

        await this.page.mouse.down();
        await this.microDelay(50, 150);
        await this.page.mouse.up();
        await this.microDelay(200, 500);

        this.currentPosition = target;
    }

    /**
     * Move to target with specific speed and jitter configuration.
     * Used internally by investigateAndClick for phase-specific movement.
     */
    private async moveToWithPhaseConfig(
        target: Point,
        speedRange: [number, number],
        jitterRange: [number, number]
    ): Promise<void> {
        // Randomize speed within range for this movement
        const minSpeed = this.randomInRange(speedRange[0], speedRange[1] * 0.6);
        const maxSpeed = this.randomInRange(speedRange[0] * 1.4, speedRange[1]);

        // Randomize jitter amount for this movement
        const jitterAmount = this.randomInRange(jitterRange[0], jitterRange[1]);

        // Generate Bezier curve
        const controlPoints = this.generateBezierControlPoints(this.currentPosition, target);
        const curve = new Bezier(
            controlPoints.start.x, controlPoints.start.y,
            controlPoints.cp1.x, controlPoints.cp1.y,
            controlPoints.cp2.x, controlPoints.cp2.y,
            controlPoints.end.x, controlPoints.end.y
        );

        // Generate points with velocity profile
        const points = this.generateVariableVelocityPoints(curve, minSpeed, maxSpeed);

        // Execute movement with phase-specific jitter
        const effectiveJitter = jitterAmount * this.sessionJitterMultiplier;

        for (let i = 0; i < points.length; i++) {
            const jitteredPoint = this.addJitter(points[i], effectiveJitter);
            await this.page.mouse.move(jitteredPoint.x, jitteredPoint.y);
            await this.updateVisibleCursor(jitteredPoint.x, jitteredPoint.y);
            await this.microDelay(12, 45);
        }

        this.currentPosition = target;
    }

    /**
     * Investigate and click an element using gaze targets.
     * Convenience method that calculates click point from bounding box.
     *
     * @param boundingBox - Element's bounding box
     * @param gazeTargets - Array of GazeTarget objects from A11yNavigator
     * @param role - Accessibility role for timing adjustment
     * @param centerBias - How much to favor center for click point. Randomized 0.2-0.4 if not specified.
     * @param config - Optional gaze configuration overrides
     */
    async investigateAndClickElement(
        boundingBox: BoundingBox,
        gazeTargets: GazeTarget[],
        role: string = 'button',
        centerBias?: number,
        config?: Partial<GazeConfig>
    ): Promise<void> {
        // Calculate click point with randomized offset
        const effectiveBias = centerBias ?? this.getRandomizedCenterBias();
        const offsetX = this.gaussianRandom(effectiveBias) * boundingBox.width;
        const offsetY = this.gaussianRandom(effectiveBias) * boundingBox.height;

        let clickPoint: Point = {
            x: boundingBox.x + offsetX,
            y: boundingBox.y + offsetY
        };

        // Safety clamp
        clickPoint.x = Math.max(
            boundingBox.x + 5,
            Math.min(clickPoint.x, boundingBox.x + boundingBox.width - 5)
        );
        clickPoint.y = Math.max(
            boundingBox.y + 5,
            Math.min(clickPoint.y, boundingBox.y + boundingBox.height - 5)
        );

        // Extract points from gaze targets
        const gazeAnchors = gazeTargets.map(t => t.point);

        await this.investigateAndClick(clickPoint, gazeAnchors, role, config);
    }

    /**
     * Get the session timing multiplier (for external coordination).
     */
    getSessionTimingMultiplier(): number {
        return this.sessionTimingMultiplier;
    }
}
