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
    hasVideo?: boolean;
    currentView: 'feed' | 'story' | 'profile' | 'explore' | 'login' | 'post_detail' | 'unknown';
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
 * Element state - exposed by screen readers for interactive elements.
 * Mirrors what VoiceOver/NVDA announce about element state.
 */
export interface ElementState {
    disabled?: boolean;
    checked?: boolean;
    selected?: boolean;
    expanded?: boolean;
    pressed?: boolean;
}

/**
 * Interactive element found via accessibility tree.
 * Enhanced with full semantic info like screen readers expose.
 */
export interface InteractiveElement {
    role: string;
    name: string;
    selector: string;
    boundingBox?: BoundingBox;
    backendNodeId?: number;  // CDP node ID for scroll-to-element operations

    // Screen reader semantic info (NEW)
    description?: string;    // ARIA description
    value?: string;          // Current value (for inputs/sliders)
    state?: ElementState;    // Element state (disabled, checked, etc.)
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
// Accessibility Tree Types (Screen Reader-Like Navigation)
// ============================================================================

/**
 * Raw CDP accessibility node (from Accessibility.getFullAXTree).
 * This mirrors what Chrome DevTools Protocol returns.
 */
export interface CDPAXNode {
    nodeId: string;
    ignored?: boolean;
    role?: { type: string; value: string };
    name?: { type: string; value: string; sources?: unknown[] };
    description?: { type: string; value: string };
    value?: { type: string; value: string };
    properties?: Array<{ name: string; value: { type: string; value: unknown } }>;
    childIds?: string[];
    backendDOMNodeId?: number;
}

/**
 * Enhanced accessibility node with parent link for hierarchy queries.
 * Built from CDP response by walking the childIds and creating reverse links.
 */
export interface AXTreeNode extends CDPAXNode {
    parentId?: string;     // Reverse link for ancestor queries (we populate this)
    depth: number;         // Tree depth for debugging (0 = root)
}

/**
 * Navigable accessibility tree with O(1) lookups.
 * Enables screen reader-like navigation using parent-child relationships.
 */
export interface AXTree {
    root: AXTreeNode;
    nodeMap: Map<string, AXTreeNode>;        // nodeId → node
    backendMap: Map<number, AXTreeNode>;     // backendDOMNodeId → node
}

/**
 * Options for findEdgeButton with hierarchy support.
 */
export interface EdgeButtonOptions {
    contentArea?: BoundingBox;      // Existing spatial hint (image bounds)
    containerNodeId?: string;        // Hierarchy constraint (search only within this container)
}

// ============================================================================
// Feed Termination Types
// ============================================================================

/**
 * Configuration for when to stop browsing the feed.
 */
export interface FeedTerminationConfig {
    maxDurationMs: number;        // Time-based cutoff (the ONLY hard limit)
    duplicateThreshold: number;   // Stop if N consecutive posts are duplicates (loop safeguard)
}

/**
 * Result of termination check.
 */
export interface TerminationResult {
    shouldStop: boolean;
    reason: 'TIME_LIMIT' | 'DUPLICATE_LOOP' | '';
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


// ============================================================================
// Screenshot-First Digest Types
// ============================================================================

/**
 * Source type for captured content.
 */
export type CaptureSource = 'feed' | 'story' | 'search' | 'profile' | 'carousel';

/**
 * A single captured screenshot during browsing.
 */
export interface CapturedPost {
    id: number;
    screenshot: Buffer;           // Raw JPEG image data
    source: CaptureSource;
    interest?: string;            // For search results - which interest triggered this
    postId?: string;              // Instagram post ID (e.g., "C1a2B3c4D5e") for embed support
    timestamp: number;            // Unix timestamp of capture
    scrollPosition: number;       // Y scroll position for deduplication

    // Video frame tracking (for multi-frame sampling)
    isVideoFrame?: boolean;       // True if this is a video frame capture
    videoId?: string;             // Groups frames from same video (postId or generated)
    frameIndex?: number;          // 1, 2, 3... for ordering frames
    totalFrames?: number;         // Total frames captured for this video
}

/**
 * Result of a browsing session using screenshot-first approach.
 */
export interface BrowsingSession {
    captures: CapturedPost[];     // All captured screenshots
    sessionDuration: number;      // Total milliseconds
    captureCount: number;         // Number of screenshots taken
    scrapedAt: string;            // ISO timestamp
}

/**
 * Configuration for batch digest generation.
 */
export interface DigestConfig {
    userName: string;
    interests: string[];
    location?: string;
}

// ============================================================================
// Image Tagging Types
// ============================================================================

/**
 * Tag assigned to each image during pre-filtering.
 * Used by ImageTagger to score and filter screenshots before digest generation.
 */
export interface ImageTag {
    imageId: number;
    isAd: boolean;              // Sponsored/promoted content
    isBlank: boolean;           // Loading screen, empty, or unclear
    relevance: number;          // 0-10 score based on user interests
    quality: number;            // 0-10 visual quality score
    description: string;        // Brief description for debugging
}

/**
 * Result of batch tagging operation.
 */
export interface TaggingResult {
    tags: ImageTag[];
    tokensUsed: number;
}
