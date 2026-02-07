/**
 * Navigation Types
 *
 * Minimal types for the VisionAgent browsing system.
 */

/**
 * High-level phases of the Instagram browsing session.
 */
export type BrowsingPhase = 'search' | 'stories' | 'feed' | 'complete';

/**
 * Configuration for the navigation loop.
 */
export interface NavigationLoopConfig {
    maxDurationMs: number;
    actionDelayMs?: [number, number];
}
