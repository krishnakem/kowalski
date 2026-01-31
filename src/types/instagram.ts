/**
 * Instagram Browser Automation Types
 *
 * Types for the hybrid economical Instagram exploration system.
 */

// ============================================================================
// Core Data Types
// ============================================================================

/**
 * Extracted content from a single Instagram post or story.
 */
export interface ExtractedPost {
    username: string;
    caption: string;
    contentType: 'post' | 'story' | 'reel';
    visualDescription?: string;
    isVideoContent?: boolean;
}

/**
 * Complete result of a scraping/exploration session.
 */
export interface ScrapedSession {
    feedContent: ExtractedPost[];
    storiesContent: ExtractedPost[];
    sessionDuration: number;      // Total milliseconds
    visionApiCalls: number;       // For cost tracking
    skippedViewports: number;     // Viewports skipped due to errors
    scrapedAt: string;            // ISO timestamp
}

// ============================================================================
// Page State Types
// ============================================================================

/**
 * Content state from A11y Navigator (NOT auth state).
 */
export interface ContentState {
    hasStories: boolean;
    hasPosts: boolean;
    currentView: 'feed' | 'story' | 'profile' | 'explore' | 'login' | 'unknown';
}

/**
 * Session validation result from BrowserManager.
 */
export interface SessionValidationResult {
    valid: boolean;
    reason?: 'SESSION_EXPIRED' | 'CHALLENGE_REQUIRED' | 'RATE_LIMITED' | 'NO_CONTEXT' | string;
}

// ============================================================================
// Navigation Types
// ============================================================================

/**
 * Interactive element found via accessibility tree.
 */
export interface InteractiveElement {
    role: string;
    name: string;
    selector: string;
    boundingBox?: BoundingBox;
}

/**
 * Bounding box for element positioning.
 */
export interface BoundingBox {
    x: number;
    y: number;
    width: number;
    height: number;
}

/**
 * 2D point for mouse movements.
 */
export interface Point {
    x: number;
    y: number;
}

// ============================================================================
// Feed Termination Types
// ============================================================================

/**
 * Configuration for when to stop browsing the feed.
 */
export interface FeedTerminationConfig {
    maxScrolls: number;           // Hard limit on scroll count
    maxPosts: number;             // Stop after extracting N posts
    maxDurationMs: number;        // Time-based cutoff
    duplicateThreshold: number;   // Stop if N consecutive posts are duplicates
}

/**
 * Result of termination check.
 */
export interface TerminationResult {
    shouldStop: boolean;
    reason: 'TIME_LIMIT' | 'SCROLL_LIMIT' | 'CONTENT_QUOTA' | 'DUPLICATE_LOOP' | '';
}

// ============================================================================
// Vision API Types
// ============================================================================

/**
 * Result from Vision API content extraction.
 */
export interface ExtractionResult {
    success: boolean;
    posts: ExtractedPost[];
    skipped: boolean;
    reason?: string;
}

// ============================================================================
// Configuration Types
// ============================================================================

/**
 * Configuration for mouse movement behavior.
 */
export interface MovementConfig {
    minSpeed?: number;           // Minimum pixels per step
    maxSpeed?: number;           // Maximum pixels per step
    overshootProbability?: number;  // Chance of overshooting target (0-1)
    jitterAmount?: number;       // Random micro-movement pixels
}

/**
 * Configuration for scroll behavior.
 */
export interface ScrollConfig {
    baseDistance?: number;       // Target scroll distance in pixels
    variability?: number;        // +/- percentage variation (0-1)
    microAdjustProb?: number;    // Probability of scroll-back micro-adjustment (0-1)
    readingPauseMs?: [number, number];  // Min/max reading pause in ms
}

// ============================================================================
// Gaze Simulation Types
// ============================================================================

/**
 * Content density classification for intent-driven scrolling.
 */
export type ContentType = 'text-heavy' | 'image-heavy' | 'mixed';

/**
 * Result of content density analysis.
 */
export interface ContentDensity {
    type: ContentType;
    textCount: number;
    imageCount: number;
    textRatio: number;
}

/**
 * Target for gaze simulation - an element worth "looking at".
 */
export interface GazeTarget {
    point: Point;
    role: string;
    label: string;
    salience: number;  // 0-1 score of visual interest
    boundingBox: BoundingBox;
}

/**
 * Configuration for gaze-lag execution.
 */
export interface GazeConfig {
    /** Enable/disable gaze simulation */
    enabled?: boolean;
    /** Saccadic latency range in ms [min, max] */
    saccadicLatency?: [number, number];
    /** Fixation pause range in ms [min, max] */
    fixationPause?: [number, number];
    /** Ballistic phase covers this % of distance [min, max] */
    ballisticSplit?: [number, number];
    /** Speed ranges for each phase [min, max] px/step */
    scanningSpeed?: [number, number];
    ballisticSpeed?: [number, number];
    correctiveSpeed?: [number, number];
    /** Jitter ranges for each phase [min, max] px */
    scanningJitter?: [number, number];
    ballisticJitter?: [number, number];
    correctiveJitter?: [number, number];
}

/**
 * Strategy returned by StrategicGaze LLM service.
 */
export interface GazeStrategy {
    gazeAnchors: Point[];      // 1-2 "distractor" points to look at first
    primaryTarget: Point;       // The actual click target
    confidence: number;         // 0-1 confidence in strategy
}

/**
 * Spatial node for LLM gaze planning (token-efficient format).
 */
export interface SpatialNode {
    role: string;        // "button", "link", "image"
    label: string;       // Truncated to 20 chars
    x: number;           // Normalized 0-1000
    y: number;           // Normalized 0-1000
    w: number;           // Width normalized
    h: number;           // Height normalized
}

/**
 * Configuration for analysis generation.
 */
export interface GeneratorConfig {
    userName: string;
    interests: string[];
    location: string;
    scheduledTime: string;
}

// ============================================================================
// Error Types
// ============================================================================

/**
 * Known error types for the automation pipeline.
 */
export type AutomationErrorType =
    | 'SESSION_EXPIRED'
    | 'RATE_LIMITED'
    | 'VISION_RATE_LIMITED'
    | 'INSUFFICIENT_CONTENT'
    | 'GENERATION_FAILED'
    | 'NETWORK_ERROR';

/**
 * Error information sent to UI.
 */
export interface AutomationError {
    type: AutomationErrorType;
    message: string;
    canRetry: boolean;
    nextRetry?: string;  // Human-readable time like "9:30 AM"
}

/**
 * Insufficient content information.
 */
export interface InsufficientContentInfo {
    collected: number;
    required: number;
    reason: string;
    nextRetry: string;
}
