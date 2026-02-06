/**
 * Navigation Types - AI-Driven Navigation System
 *
 * Types for the NavigationLLM service that replaces hardcoded navigation logic
 * with LLM-driven decision making. The LLM receives the accessibility tree
 * as structured data and decides which action to take next.
 *
 * Cost: ~$0.001 per decision using GPT-4o-mini
 */

import { Point, BoundingBox, ContentState, ContentType } from './instagram.js';

// ============================================================================
// Navigation Context Types
// ============================================================================

/**
 * High-level goal the navigation system is trying to achieve.
 */
export interface NavigationGoal {
    type: 'search_interest' | 'watch_stories' | 'browse_feed' | 'explore_profile' | 'general_browse' | 'analyze_account';
    target?: string;           // Interest term, username, etc.
    minItems?: number;         // Minimum items to collect
    timeAllocatedMs?: number;  // Time budget for this goal
}

/**
 * Current navigation context passed to the LLM for decision making.
 * Provides all information needed to decide the next action.
 */
export interface NavigationContext {
    // Session info
    sessionId: string;
    startTime: number;
    targetDurationMs: number;

    // Current page state
    url: string;
    view: ContentState['currentView'];

    // Goal/mission
    currentGoal: NavigationGoal;
    userInterests: string[];

    // Collected data metrics
    postsCollected: number;
    storiesWatched: number;
    interestsSearched: string[];

    // Action history (for loop detection and context)
    recentActions: ActionRecord[];

    // Strategic context (for LLM strategic decisions)
    timeRemainingMs?: number;                // Seconds left in session
    currentPhase?: BrowsingPhase;            // Current phase (search/stories/feed)
    phaseHistory?: Array<{                   // History of phases visited
        phase: BrowsingPhase;
        durationMs: number;
        itemsCollected: number;
    }>;
    captureCount?: number;                   // Screenshots taken so far
    videoState?: {                           // Current video state (if any)
        isPlaying: boolean;
        duration: number;
        currentTime: number;
    };
    contentStats?: {                         // Content quality metrics
        uniquePostsRatio: number;            // 0-1: how much unique content
        adRatio: number;                     // 0-1: how many ads seen
        engagementLevel: 'low' | 'medium' | 'high';  // Estimated content quality
    };

    // Deep engagement state (LLM-controlled exploration)
    engagementState?: EngagementState;

    // Tree summary for dynamic LLM reasoning (infer page context)
    treeSummary?: {
        containers: Array<{
            role: string;
            name: string;
            childCount: number;
        }>;
        inputs: Array<{
            role: string;
            name: string;
            parentContainers: string[];
        }>;
        landmarks: string[];
    };

    // Stagnation awareness
    scrollPosition?: number;            // Current scrollY in pixels
    elementFingerprint?: string;        // Hash of current elements for freshness detection

    // Cross-session memory digest (from SessionMemory)
    sessionMemoryDigest?: string;

    // Loop detection warning (injected into LLM context so it can self-recover)
    loopWarning?: {
        severity: 'mild' | 'moderate' | 'severe';
        reason: string;
        consecutiveWarnings: number;   // How many times LLM has been warned without recovering
    };

    // Last capture attempt feedback (so LLM knows when captures are being rejected)
    lastCaptureAttempt?: {
        succeeded: boolean;
        reason?: string;  // e.g., 'filtered as duplicate', 'ok'
    };

    // Scroll feedback from last scroll action (content-aware results)
    lastScrollResult?: ScrollResult;
}

// ============================================================================
// Deep Engagement Types
// ============================================================================

/**
 * Engagement level indicating where the LLM is in an exploration flow.
 */
export type EngagementLevel = 'feed' | 'post_modal' | 'comments' | 'profile';

/**
 * Tracks the current engagement depth with content.
 * Enables LLM to understand "where we are" in an exploration flow.
 */
export interface EngagementState {
    /** Current engagement level */
    level: EngagementLevel;

    /** How we got here (for context) */
    entryAction?: 'clicked_post' | 'clicked_username' | 'clicked_comments';

    /** Post we're currently exploring (if any) */
    currentPost?: {
        /** Post URL (instagram.com/p/xxx) */
        postUrl?: string;
        /** Username if detected */
        username?: string;
        /** Detected timestamp */
        timestamp?: string;
    };

    /** Carousel state (if viewing a carousel post) */
    carouselState?: {
        currentSlide: number;
        totalSlides: number;
        /** Have we seen all slides? */
        fullyExplored: boolean;
    };

    /** Engagement metrics for this post */
    postMetrics?: {
        likeCount?: string;      // e.g., "1,234 likes"
        commentCount?: string;   // e.g., "View all 42 comments"
        hasVideo: boolean;
    };

    /** Time spent in current engagement level (ms) */
    levelEnteredAt: number;

    /** Posts we've deeply explored this session (prevent re-visiting) */
    deeplyExploredPostUrls: string[];
}

// ============================================================================
// Navigation Element Types
// ============================================================================

/**
 * Semantic hint for common Instagram UI elements (backup detection).
 * Primarily used for forbidden action detection (like, comment, etc.).
 * The LLM should discover element purposes from container context.
 */
export type SemanticHint =
    | 'like_button'
    | 'comment_button'
    | 'share_button'
    | 'save_button'
    | 'follow_button'
    | 'search_input'
    | 'close_button'
    | 'unknown';

/**
 * Element representation optimized for LLM consumption.
 * Includes container context from accessibility tree for pattern discovery.
 */
export interface NavigationElement {
    id: number;                              // Unique ID for action reference
    role: string;                            // ARIA role (button, link, article, etc.)
    name: string;                            // Accessible name (truncated to 50 chars)
    position: {
        x: number;                           // Normalized 0-1000
        y: number;                           // Normalized 0-1000
        w: number;                           // Width normalized 0-1000
        h: number;                           // Height normalized 0-1000
    };

    // Container context (for LLM to discover patterns)
    containerRole?: string;                  // e.g., 'region', 'list', 'article', 'navigation'
    containerName?: string;                  // e.g., 'Stories', 'Posts'
    depth?: number;                          // Tree depth (0 = root)
    siblingCount?: number;                   // How many siblings in same container

    // Optional backup hint (mainly for forbidden actions)
    semanticHint?: SemanticHint;

    state?: {
        expanded?: boolean;
        selected?: boolean;
        disabled?: boolean;
    };
    backendNodeId?: number;                  // CDP node ID for direct interaction
    boundingBox?: BoundingBox;               // Actual pixel coordinates (for execution)

    // Content preview from accessibility tree (for value assessment)
    // Enables LLM to match content to user interests WITHOUT Vision API
    contentPreview?: {
        captionText?: string;                // First 100 chars of caption
        altText?: string;                    // Image description/alt text
        engagement?: {
            likes?: string;                  // e.g., "1,234 likes"
            comments?: string;               // e.g., "View all 42 comments"
        };
        hasHashtags?: boolean;               // Quick relevance signal
        hashtags?: string[];                 // Extracted hashtags (max 5)
    };
}

// ============================================================================
// Action Types
// ============================================================================

/**
 * Available actions the LLM can request.
 */
export type NavigationAction =
    | 'click'
    | 'scroll'
    | 'type'
    | 'press'
    | 'wait'
    | 'hover'
    | 'back'
    | 'clear';

/**
 * Parameters for click action.
 */
export interface ClickParams {
    id: number;                              // Element ID to click
    expectedName?: string;                   // Element name for verification (LLM outputs this)
}

/**
 * Parameters for scroll action.
 */
export interface ScrollParams {
    direction: 'up' | 'down' | 'left' | 'right';
    amount: 'small' | 'medium' | 'large';    // Small ~200px, Medium ~500px, Large ~800px
}

/**
 * Parameters for type action.
 */
export interface TypeParams {
    text: string;                            // Text to type
}

/**
 * Parameters for press action.
 */
export interface PressParams {
    key: string;  // Any valid key: Escape, Enter, Backspace, Delete, Space, Arrow keys, Tab, Home, End, etc.
}

/**
 * Parameters for wait action.
 */
export interface WaitParams {
    seconds: number;                         // 1-5 seconds
}

/**
 * Parameters for hover action.
 */
export interface HoverParams {
    id: number;                              // Element ID to hover over
    expectedName?: string;                   // Element name for verification (LLM outputs this)
}

/**
 * Parameters for back action (browser back button).
 */
export interface BackParams {}

/**
 * Parameters for clear action (clear currently focused input).
 */
export interface ClearParams {}

/**
 * Union type for all action parameters.
 */
export type ActionParams = ClickParams | ScrollParams | TypeParams | PressParams | WaitParams | HoverParams | BackParams | ClearParams;

// ============================================================================
// Decision Types
// ============================================================================

/**
 * Capture intent signaled by the LLM.
 * When the LLM focuses on something interesting, it signals capture intent.
 *
 * Capture priority (handled in InstagramScraper.runNavigationLoop):
 *   1. targetId set → screenshot crops to that element's bounding box
 *   2. strategic.captureNow without targetId → full viewport capture
 *   3. shouldCapture without targetId → fallback to nearest article / focused element
 */
export interface CaptureIntent {
    shouldCapture: boolean;                  // LLM signals "this is worth capturing"
    targetId?: number;                       // Element ID to crop to (highest priority framing)
    reason?: string;                         // Why this is capture-worthy (for logging)
}

/**
 * Strategic decision for session-level control.
 * The LLM decides when to switch phases, terminate, engage deeply, and how long to linger.
 */
export interface StrategicDecision {
    // Phase control
    switchPhase?: 'search' | 'stories' | 'feed' | null;  // Switch to different phase
    terminateSession?: boolean;              // End the session (content exhausted)

    // Capture control (priority 2: full viewport when no capture.targetId is set)
    captureNow?: boolean;                    // Full viewport capture (use when no specific element to target)

    // Pacing control
    lingerDuration?: 'short' | 'medium' | 'long';  // How long to stay (short=1s, medium=3s, long=6s)

    // Deep engagement control
    engageDepth?: 'quick' | 'moderate' | 'deep' | null;  // How deeply to explore current/target post
    closeEngagement?: boolean;               // Exit current modal/engagement, return to feed

    // Explanation
    reason?: string;                         // Why this strategic decision was made
}

/**
 * LLM's reasoning and decision for next action.
 */
export interface NavigationDecision {
    reasoning: string;                       // Brief explanation of decision
    action: NavigationAction;                // Action type
    params: ActionParams;                    // Action-specific parameters
    expectedOutcome: string;                 // What should happen next
    confidence?: number;                     // 0-1 confidence in decision
    capture?: CaptureIntent;                 // Optional: signal to capture this element
    strategic?: StrategicDecision;           // Optional: strategic session-level decisions
}

/**
 * Result of a content-aware scroll operation.
 * Provides feedback about what happened after scrolling so the LLM
 * can make informed decisions about subsequent actions.
 */
export interface ScrollResult {
    contentType: ContentType;                    // Content density detected before scroll
    requestedDirection: 'up' | 'down' | 'left' | 'right';
    requestedAmount: string;                     // 'small' | 'medium' | 'large' | 'xlarge'
    actualDeltaPx: number;                       // How far the page actually scrolled
    scrollFailed: boolean;                       // True if scroll had no effect
    pauseDurationMs: number;                     // Reading pause applied after scroll
    newElementsAppeared: number;                 // Interactive elements with meaningful names
    elementsDisappeared: number;                 // Elements that scrolled off-screen
    newArticles: number;                         // New article-role elements (approx new posts)
}

/**
 * Record of an executed action (for history tracking).
 */
export interface ActionRecord {
    timestamp: number;
    action: NavigationAction;
    params: ActionParams;
    success: boolean;
    resultingView?: ContentState['currentView'];
    errorMessage?: string;
    // State context for stagnation detection
    scrollY?: number;
    url?: string;
    verified?: 'url_changed' | 'dom_changed' | 'no_change_detected' | 'not_verified' | 'scrolled_in_dialog';
    elementCount?: number;
    // What element was actually acted on (for LLM feedback)
    clickedElementName?: string;
    // Content-aware scroll feedback
    scrollResult?: ScrollResult;
}

// ============================================================================
// Execution Types
// ============================================================================

/**
 * Information about a focused/clicked element for capture.
 */
export interface FocusedElement {
    id: number;                              // Element ID that was clicked
    boundingBox: BoundingBox;                // Element's screen position
    name: string;                            // Accessible name of element
}

/**
 * Result of executing a navigation decision.
 */
export interface ExecutionResult {
    success: boolean;
    actionTaken: NavigationAction;
    params: ActionParams;
    resultingUrl?: string;
    resultingView?: ContentState['currentView'];
    errorMessage?: string;
    durationMs: number;
    focusedElement?: FocusedElement;         // Element that was clicked (for capture)
    verified?: 'url_changed' | 'dom_changed' | 'no_change_detected' | 'not_verified' | 'scrolled_in_dialog';
    scrollResult?: ScrollResult;             // Content-aware scroll feedback
}

/**
 * Configuration for the NavigationLLM service.
 */
export interface NavigationLLMConfig {
    apiKey: string;
    model?: string;                          // Default: 'gpt-4o-mini'
    maxTokens?: number;                      // Default: 300
    temperature?: number;                    // Default: 0.3
    debug?: boolean;                         // Enable verbose logging of LLM reasoning
}

/**
 * Configuration for the navigation loop.
 */
export interface NavigationLoopConfig {
    maxDurationMs: number;                   // Maximum duration before stopping (the ONLY hard limit)
    actionDelayMs?: [number, number];        // Min/max delay between actions [default: 500, 2000]
}

// ============================================================================
// Phase Types (for high-level orchestration)
// ============================================================================

/**
 * High-level phases of the Instagram browsing session.
 */
export type BrowsingPhase = 'search' | 'stories' | 'feed' | 'complete';


