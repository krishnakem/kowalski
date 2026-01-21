/**
 * A11yNavigator - Content Detection via URL and CDP Accessibility Tree
 *
 * This service uses URL analysis and raw CDP accessibility data only.
 * NO DOM queries, NO aria-label selectors - these are detectable.
 *
 * Detection methods:
 * 1. URL analysis (completely undetectable)
 * 2. Viewport/scroll position analysis via CDP
 * 3. CDP Accessibility.getFullAXTree for element finding (undetectable)
 *
 * Cost: $0 (all detection via CDP protocol)
 *
 * IMPORTANT: This service handles CONTENT detection only.
 * Auth/session validation is handled by BrowserManager.validateSession().
 */

import { Page, CDPSession } from 'playwright';
import {
    ContentState,
    FeedTerminationConfig,
    TerminationResult,
    InteractiveElement,
    BoundingBox
} from '../../types/instagram.js';
import type { GhostMouse } from './GhostMouse.js';

/**
 * Raw CDP Accessibility Node structure.
 * This is the format returned by Accessibility.getFullAXTree.
 */
interface CDPAXNode {
    nodeId: string;
    ignored: boolean;
    role?: { type: string; value: string };
    name?: { type: string; value: string; sources?: unknown[] };
    description?: { type: string; value: string };
    value?: { type: string; value: string };
    properties?: Array<{ name: string; value: { type: string; value: unknown } }>;
    childIds?: string[];
    backendDOMNodeId?: number;
}

/**
 * CDP Accessibility tree response.
 */
interface CDPAXTreeResponse {
    nodes: CDPAXNode[];
}

/**
 * Result of a human-like search interaction.
 */
export interface SearchInteractionResult {
    success: boolean;
    navigated: boolean;
    matchedResult?: string;
    fallbackUsed: boolean;
}

export class A11yNavigator {
    private page: Page;

    constructor(page: Page) {
        this.page = page;
    }

    /**
     * Get content state by analyzing URL only.
     * Cost: $0 (no API calls, no DOM queries)
     *
     * NOTE: This does NOT check auth status. Use BrowserManager.validateSession() for that.
     * For detailed element detection, use ContentVision.
     */
    async getContentState(): Promise<ContentState> {
        const url = this.page.url();
        const currentView = this.detectCurrentView(url);

        // URL-based inference only - no DOM queries
        return {
            hasStories: currentView === 'feed' || currentView === 'story',
            hasPosts: currentView === 'feed' || currentView === 'profile',
            currentView
        };
    }

    /**
     * Determine current view/page type from URL.
     */
    private detectCurrentView(url: string): ContentState['currentView'] {
        if (url.includes('/accounts/login')) return 'login';
        if (url.includes('/stories/')) return 'story';
        if (url.includes('/explore')) return 'explore';

        // Check for profile page pattern: instagram.com/username
        const profileMatch = url.match(/instagram\.com\/([^\/\?]+)\/?$/);
        if (profileMatch && !['explore', 'reels', 'direct'].includes(profileMatch[1])) {
            return 'profile';
        }

        // Default to feed if on main page
        if (url === 'https://www.instagram.com/' || url.includes('instagram.com/?')) {
            return 'feed';
        }

        return 'unknown';
    }

    /**
     * Determine if we should stop browsing the feed.
     * Uses multiple signals since "end of feed" text is unreliable
     * (Instagram feeds are often infinite).
     */
    shouldStopBrowsing(
        scrollCount: number,
        extractedCount: number,
        startTime: number,
        recentDuplicates: number,
        config: FeedTerminationConfig = {
            maxScrolls: 25,          // ~25 scrolls = 5 min at human pace
            maxPosts: 30,            // 30 posts is plenty for analysis
            maxDurationMs: 5 * 60 * 1000,  // 5 minute hard cap
            duplicateThreshold: 5    // 5 consecutive dupes = we're looping
        }
    ): TerminationResult {

        // 1. Time-based cutoff (most reliable)
        if (Date.now() - startTime > config.maxDurationMs) {
            return { shouldStop: true, reason: 'TIME_LIMIT' };
        }

        // 2. Scroll count limit (prevents infinite scrolling)
        if (scrollCount >= config.maxScrolls) {
            return { shouldStop: true, reason: 'SCROLL_LIMIT' };
        }

        // 3. Content quota reached (we have enough data)
        if (extractedCount >= config.maxPosts) {
            return { shouldStop: true, reason: 'CONTENT_QUOTA' };
        }

        // 4. Duplicate detection (we're seeing the same posts)
        if (recentDuplicates >= config.duplicateThreshold) {
            return { shouldStop: true, reason: 'DUPLICATE_LOOP' };
        }

        return { shouldStop: false, reason: '' };
    }

    /**
     * Get current scroll position via CDP (undetectable).
     * Useful for tracking feed progress without DOM queries.
     */
    async getScrollPosition(): Promise<{ x: number; y: number }> {
        try {
            const cdpSession = await this.page.context().newCDPSession(this.page);
            const { result } = await cdpSession.send('Runtime.evaluate', {
                expression: 'JSON.stringify({ x: window.scrollX, y: window.scrollY })',
                returnByValue: true
            });
            await cdpSession.detach();
            return JSON.parse(result.value as string);
        } catch {
            return { x: 0, y: 0 };
        }
    }

    /**
     * Get viewport dimensions via CDP (undetectable).
     */
    async getViewportInfo(): Promise<{ width: number; height: number; scrollHeight: number }> {
        try {
            const cdpSession = await this.page.context().newCDPSession(this.page);
            const { result } = await cdpSession.send('Runtime.evaluate', {
                expression: `JSON.stringify({
                    width: window.innerWidth,
                    height: window.innerHeight,
                    scrollHeight: document.documentElement.scrollHeight
                })`,
                returnByValue: true
            });
            await cdpSession.detach();
            return JSON.parse(result.value as string);
        } catch {
            return { width: 0, height: 0, scrollHeight: 0 };
        }
    }

    /**
     * Check if we're currently viewing a story (vs feed).
     * URL-based detection only - completely undetectable.
     */
    isInStoryViewer(): boolean {
        const url = this.page.url();
        return url.includes('/stories/');
    }

    /**
     * Check if we're on a profile page and extract username.
     * URL-based detection only.
     */
    getProfileUsername(): string | null {
        const url = this.page.url();
        const profileMatch = url.match(/instagram\.com\/([^\/\?]+)\/?$/);
        if (profileMatch && !['explore', 'reels', 'direct', 'stories'].includes(profileMatch[1])) {
            return profileMatch[1];
        }
        return null;
    }

    /**
     * Check if we're on the main feed.
     * URL-based detection only.
     */
    isOnFeed(): boolean {
        const url = this.page.url();
        return url === 'https://www.instagram.com/' ||
               url.includes('instagram.com/?') ||
               url === 'https://www.instagram.com';
    }

    /**
     * Check if we're on the explore page.
     * URL-based detection only.
     */
    isOnExplore(): boolean {
        return this.page.url().includes('/explore');
    }

    // =========================================================================
    // CDP Accessibility Tree Methods (Blind Element Finding)
    // =========================================================================

    /**
     * Get the full accessibility tree via CDP.
     * This is undetectable - it reads the browser's internal a11y representation
     * without injecting any scripts or querying the DOM.
     */
    private async getAccessibilityTree(): Promise<CDPAXNode[]> {
        let cdpSession: CDPSession | null = null;
        try {
            cdpSession = await this.page.context().newCDPSession(this.page);
            const response = await cdpSession.send('Accessibility.getFullAXTree') as CDPAXTreeResponse;
            return response.nodes || [];
        } catch (error) {
            console.warn('Failed to get accessibility tree:', error);
            return [];
        } finally {
            if (cdpSession) {
                await cdpSession.detach().catch(() => {});
            }
        }
    }

    /**
     * Get bounding box for a node using its backendDOMNodeId via CDP.
     * This avoids DOM queries - we use CDP's DOM.getBoxModel directly.
     */
    private async getNodeBoundingBox(
        cdpSession: CDPSession,
        backendNodeId: number
    ): Promise<BoundingBox | null> {
        try {
            const { model } = await cdpSession.send('DOM.getBoxModel', {
                backendNodeId
            });

            if (!model || !model.content) {
                return null;
            }

            // content is [x1, y1, x2, y2, x3, y3, x4, y4] - a quad
            // We need the bounding rectangle
            const [x1, y1, x2, , , y3] = model.content;
            return {
                x: x1,
                y: y1,
                width: x2 - x1,
                height: y3 - y1
            };
        } catch {
            return null;
        }
    }

    /**
     * Find all nodes matching a role and name pattern in the accessibility tree.
     */
    private findMatchingNodes(
        nodes: CDPAXNode[],
        role: string,
        namePattern: RegExp
    ): CDPAXNode[] {
        return nodes.filter(node => {
            if (node.ignored) return false;

            const nodeRole = node.role?.value?.toLowerCase();
            const nodeName = node.name?.value || '';

            return nodeRole === role.toLowerCase() && namePattern.test(nodeName);
        });
    }

    /**
     * Find interactive element by role and name pattern using CDP accessibility tree.
     * Returns element info with bounding box for clicking - NO DOM selectors used.
     *
     * @param role - Accessibility role (e.g., 'button', 'link')
     * @param namePattern - Regex pattern to match against the accessible name
     */
    async findElement(
        role: string,
        namePattern: RegExp | string
    ): Promise<InteractiveElement | null> {
        const pattern = typeof namePattern === 'string'
            ? new RegExp(namePattern, 'i')
            : namePattern;

        const nodes = await this.getAccessibilityTree();
        const matches = this.findMatchingNodes(nodes, role, pattern);

        if (matches.length === 0) {
            return null;
        }

        const match = matches[0];

        // Get bounding box if we have a backend node ID
        let boundingBox: BoundingBox | undefined;
        if (match.backendDOMNodeId) {
            let cdpSession: CDPSession | null = null;
            try {
                cdpSession = await this.page.context().newCDPSession(this.page);
                const box = await this.getNodeBoundingBox(cdpSession, match.backendDOMNodeId);
                if (box) {
                    boundingBox = box;
                }
            } finally {
                if (cdpSession) {
                    await cdpSession.detach().catch(() => {});
                }
            }
        }

        return {
            role: match.role?.value || role,
            name: match.name?.value || '',
            selector: '', // No selector - we use coordinates only
            boundingBox
        };
    }

    /**
     * Find all story circles using CDP accessibility tree.
     * Stories appear as buttons with names containing "Story" or "'s story".
     *
     * Returns elements with bounding boxes for clicking - NO DOM selectors used.
     */
    async findStoryCircles(): Promise<InteractiveElement[]> {
        const stories: InteractiveElement[] = [];

        const nodes = await this.getAccessibilityTree();

        // Find buttons/links related to stories
        // Instagram uses various patterns: "Story by X", "X's story", etc.
        const storyPattern = /story/i;
        const storyNodes = this.findMatchingNodes(nodes, 'button', storyPattern);

        // Also check for 'link' role (sometimes used for story circles)
        const storyLinks = this.findMatchingNodes(nodes, 'link', storyPattern);
        const allStoryNodes = [...storyNodes, ...storyLinks];

        if (allStoryNodes.length === 0) {
            return stories;
        }

        // Get bounding boxes for up to 10 stories
        let cdpSession: CDPSession | null = null;
        try {
            cdpSession = await this.page.context().newCDPSession(this.page);

            for (const node of allStoryNodes.slice(0, 10)) {
                if (!node.backendDOMNodeId) continue;

                const box = await this.getNodeBoundingBox(cdpSession, node.backendDOMNodeId);
                if (box && box.width > 0 && box.height > 0) {
                    stories.push({
                        role: node.role?.value || 'button',
                        name: node.name?.value || 'Story',
                        selector: '', // No selector - we use coordinates only
                        boundingBox: box
                    });
                }
            }
        } catch (error) {
            console.warn('Failed to get story bounding boxes:', error);
        } finally {
            if (cdpSession) {
                await cdpSession.detach().catch(() => {});
            }
        }

        return stories;
    }

    /**
     * Find carousel "Next" button for multi-image posts.
     * Instagram uses a button with name containing "Next" or arrow patterns.
     *
     * @returns InteractiveElement with bounding box, or null if not found
     */
    async findCarouselNextButton(): Promise<InteractiveElement | null> {
        const nodes = await this.getAccessibilityTree();

        // Look for "Next" button patterns used by Instagram carousels
        const nextPatterns = [
            /^next$/i,
            /next slide/i,
            /go to slide/i,
            /chevron.*right/i
        ];

        for (const pattern of nextPatterns) {
            const matches = this.findMatchingNodes(nodes, 'button', pattern);
            if (matches.length > 0) {
                const match = matches[0];
                if (match.backendDOMNodeId) {
                    let cdpSession: CDPSession | null = null;
                    try {
                        cdpSession = await this.page.context().newCDPSession(this.page);
                        const box = await this.getNodeBoundingBox(cdpSession, match.backendDOMNodeId);
                        if (box && box.width > 0 && box.height > 0) {
                            return {
                                role: match.role?.value || 'button',
                                name: match.name?.value || 'Next',
                                selector: '',
                                boundingBox: box
                            };
                        }
                    } finally {
                        if (cdpSession) {
                            await cdpSession.detach().catch(() => {});
                        }
                    }
                }
            }
        }

        return null;
    }

    /**
     * Find Story Highlights on a profile page.
     * Highlights appear as circular buttons below the bio, similar to stories.
     *
     * @returns Array of InteractiveElements with bounding boxes
     */
    async findHighlights(): Promise<InteractiveElement[]> {
        const highlights: InteractiveElement[] = [];
        const nodes = await this.getAccessibilityTree();

        // Instagram highlights use patterns like "Highlight: [name]" or just the highlight name
        const highlightPattern = /highlight/i;

        // Find buttons that look like highlights
        const highlightNodes = nodes.filter(node => {
            if (node.ignored) return false;
            const role = node.role?.value?.toLowerCase();
            const name = (node.name?.value || '').toLowerCase();

            // Must be button or link
            if (role !== 'button' && role !== 'link') return false;

            // Look for highlight-related patterns
            return highlightPattern.test(name) ||
                   // Also match buttons in the highlight tray area (usually short names)
                   (role === 'button' && name.length > 0 && name.length < 30 && !name.includes('follow'));
        });

        if (highlightNodes.length === 0) {
            return highlights;
        }

        let cdpSession: CDPSession | null = null;
        try {
            cdpSession = await this.page.context().newCDPSession(this.page);

            for (const node of highlightNodes.slice(0, 5)) { // Limit to 5 highlights
                if (!node.backendDOMNodeId) continue;

                const box = await this.getNodeBoundingBox(cdpSession, node.backendDOMNodeId);
                if (box && box.width > 0 && box.height > 0) {
                    // Highlight buttons are typically small circles (40-80px)
                    if (box.width >= 30 && box.width <= 100 && box.height >= 30 && box.height <= 100) {
                        highlights.push({
                            role: node.role?.value || 'button',
                            name: node.name?.value || 'Highlight',
                            selector: '',
                            boundingBox: box
                        });
                    }
                }
            }
        } finally {
            if (cdpSession) {
                await cdpSession.detach().catch(() => {});
            }
        }

        return highlights;
    }

    /**
     * Get the current carousel slide indicator (e.g., "Slide 2 of 5").
     * Used to verify carousel navigation actually occurred.
     *
     * @returns Object with current slide number, total slides, and raw text, or null if not found
     */
    async getCarouselSlideIndicator(): Promise<{ current: number; total: number; raw: string } | null> {
        const nodes = await this.getAccessibilityTree();

        // Look for patterns like "Slide 2 of 5", "2 of 5", "Photo 3 of 10"
        const slidePatterns = [
            /slide\s*(\d+)\s*of\s*(\d+)/i,
            /photo\s*(\d+)\s*of\s*(\d+)/i,
            /(\d+)\s*of\s*(\d+)/i,
            /(\d+)\/(\d+)/  // 2/5 format
        ];

        for (const node of nodes) {
            if (node.ignored) continue;
            const name = node.name?.value || '';

            for (const pattern of slidePatterns) {
                const match = name.match(pattern);
                if (match) {
                    return {
                        current: parseInt(match[1], 10),
                        total: parseInt(match[2], 10),
                        raw: name
                    };
                }
            }
        }

        return null;
    }

    /**
     * Find post caption text in the accessibility tree.
     * Instagram captions appear as StaticText nodes below the post content.
     *
     * @returns Caption text or null if not found
     */
    async findPostCaption(): Promise<string | null> {
        const nodes = await this.getAccessibilityTree();

        // Look for StaticText nodes that look like captions
        // Captions typically:
        // - Are not too short (>20 chars) - excludes "Like", "Comment", etc.
        // - Don't match button/link patterns
        // - May contain hashtags (#) or mentions (@)
        const captionCandidates: string[] = [];

        for (const node of nodes) {
            if (node.ignored) continue;
            const role = node.role?.value?.toLowerCase();
            const name = node.name?.value || '';

            // Skip if too short
            if (name.length < 20) continue;

            // Skip if it's an interactive element (button, link, textbox)
            if (role === 'button' || role === 'link' || role === 'textbox') continue;

            // Skip navigation/header patterns
            if (/^(home|search|explore|reels|messages|notifications|create|profile)$/i.test(name)) continue;

            // Prefer text with hashtags or mentions (strong caption signal)
            if (name.includes('#') || name.includes('@')) {
                captionCandidates.unshift(name);  // High priority
            } else if (name.length > 50) {
                captionCandidates.push(name);  // Lower priority but still valid
            }
        }

        return captionCandidates.length > 0 ? captionCandidates[0] : null;
    }

    /**
     * Find the "more" button for truncated captions.
     * Instagram shows "more" or "... more" for long captions.
     *
     * @returns InteractiveElement with bounding box, or null if not found
     */
    async findMoreButton(): Promise<InteractiveElement | null> {
        const nodes = await this.getAccessibilityTree();

        // Look for "more" patterns
        const morePatterns = [
            /^more$/i,
            /^…\s*more$/i,
            /^\.{3}\s*more$/i,
            /^see\s*more$/i
        ];

        for (const pattern of morePatterns) {
            const matches = this.findMatchingNodes(nodes, 'button', pattern);
            if (matches.length > 0) {
                const match = matches[0];
                if (match.backendDOMNodeId) {
                    let cdpSession: CDPSession | null = null;
                    try {
                        cdpSession = await this.page.context().newCDPSession(this.page);
                        const box = await this.getNodeBoundingBox(cdpSession, match.backendDOMNodeId);
                        if (box && box.width > 0 && box.height > 0) {
                            return {
                                role: match.role?.value || 'button',
                                name: match.name?.value || 'more',
                                selector: '',
                                boundingBox: box
                            };
                        }
                    } finally {
                        if (cdpSession) {
                            await cdpSession.detach().catch(() => {});
                        }
                    }
                }
            }
        }

        // Also check for links with "more" pattern
        for (const pattern of morePatterns) {
            const matches = this.findMatchingNodes(nodes, 'link', pattern);
            if (matches.length > 0) {
                const match = matches[0];
                if (match.backendDOMNodeId) {
                    let cdpSession: CDPSession | null = null;
                    try {
                        cdpSession = await this.page.context().newCDPSession(this.page);
                        const box = await this.getNodeBoundingBox(cdpSession, match.backendDOMNodeId);
                        if (box && box.width > 0 && box.height > 0) {
                            return {
                                role: match.role?.value || 'link',
                                name: match.name?.value || 'more',
                                selector: '',
                                boundingBox: box
                            };
                        }
                    } finally {
                        if (cdpSession) {
                            await cdpSession.detach().catch(() => {});
                        }
                    }
                }
            }
        }

        return null;
    }

    /**
     * Find elements by accessible name containing specific text.
     * Useful for finding "Like", "Comment", "Share" buttons without DOM queries.
     */
    async findElementsByName(namePattern: RegExp | string): Promise<InteractiveElement[]> {
        const pattern = typeof namePattern === 'string'
            ? new RegExp(namePattern, 'i')
            : namePattern;

        const nodes = await this.getAccessibilityTree();
        const elements: InteractiveElement[] = [];

        // Find all interactive nodes matching the pattern
        const matches = nodes.filter(node => {
            if (node.ignored) return false;
            const nodeName = node.name?.value || '';
            const nodeRole = node.role?.value?.toLowerCase();

            // Only match interactive roles
            const interactiveRoles = ['button', 'link', 'menuitem', 'tab', 'checkbox', 'radio'];
            return interactiveRoles.includes(nodeRole || '') && pattern.test(nodeName);
        });

        if (matches.length === 0) {
            return elements;
        }

        let cdpSession: CDPSession | null = null;
        try {
            cdpSession = await this.page.context().newCDPSession(this.page);

            for (const node of matches.slice(0, 20)) { // Limit to 20 results
                if (!node.backendDOMNodeId) continue;

                const box = await this.getNodeBoundingBox(cdpSession, node.backendDOMNodeId);
                if (box && box.width > 0 && box.height > 0) {
                    elements.push({
                        role: node.role?.value || 'button',
                        name: node.name?.value || '',
                        selector: '',
                        boundingBox: box
                    });
                }
            }
        } finally {
            if (cdpSession) {
                await cdpSession.detach().catch(() => {});
            }
        }

        return elements;
    }

    /**
     * Check if stories are present by looking for story-related elements
     * in the accessibility tree. More accurate than URL-only detection.
     */
    async detectStoriesPresent(): Promise<boolean> {
        const nodes = await this.getAccessibilityTree();
        const storyPattern = /story/i;

        return nodes.some(node => {
            if (node.ignored) return false;
            const nodeName = node.name?.value || '';
            const nodeRole = node.role?.value?.toLowerCase();

            return (nodeRole === 'button' || nodeRole === 'link') && storyPattern.test(nodeName);
        });
    }

    /**
     * Check if posts are present by looking for Like/Comment buttons
     * in the accessibility tree. More accurate than URL-only detection.
     */
    async detectPostsPresent(): Promise<boolean> {
        const nodes = await this.getAccessibilityTree();

        const hasLikeButton = nodes.some(node => {
            if (node.ignored) return false;
            const nodeName = node.name?.value?.toLowerCase() || '';
            return nodeName.includes('like') && node.role?.value === 'button';
        });

        const hasCommentButton = nodes.some(node => {
            if (node.ignored) return false;
            const nodeName = node.name?.value?.toLowerCase() || '';
            return nodeName.includes('comment') && node.role?.value === 'button';
        });

        return hasLikeButton || hasCommentButton;
    }

    /**
     * Get enhanced content state using both URL and accessibility tree.
     * Slightly more expensive than getContentState() but more accurate.
     */
    async getEnhancedContentState(): Promise<ContentState> {
        const url = this.page.url();
        const currentView = this.detectCurrentView(url);

        // Use CDP accessibility tree for accurate detection
        const [hasStories, hasPosts] = await Promise.all([
            this.detectStoriesPresent(),
            this.detectPostsPresent()
        ]);

        return {
            hasStories,
            hasPosts,
            currentView
        };
    }

    // =========================================================================
    // Search Navigation Methods (Active Research)
    // =========================================================================

    /**
     * Check if we're on the search/explore page.
     * URL-based detection.
     */
    isOnSearchPage(): boolean {
        const url = this.page.url();
        return url.includes('/explore') || url.includes('/search');
    }

    /**
     * Find the Search button/link in the sidebar using CDP accessibility tree.
     * Instagram's search is typically a link with name "Search" in the sidebar.
     *
     * Returns element with bounding box for clicking - NO DOM selectors used.
     */
    async findSearchButton(): Promise<InteractiveElement | null> {
        const nodes = await this.getAccessibilityTree();

        // Instagram uses a link or button with name "Search" in the navigation
        const searchPattern = /^search$/i;

        // First try to find a link with exact "Search" name
        const searchLinks = this.findMatchingNodes(nodes, 'link', searchPattern);
        if (searchLinks.length > 0) {
            const match = searchLinks[0];
            if (match.backendDOMNodeId) {
                let cdpSession: CDPSession | null = null;
                try {
                    cdpSession = await this.page.context().newCDPSession(this.page);
                    const box = await this.getNodeBoundingBox(cdpSession, match.backendDOMNodeId);
                    if (box && box.width > 0 && box.height > 0) {
                        return {
                            role: match.role?.value || 'link',
                            name: match.name?.value || 'Search',
                            selector: '',
                            boundingBox: box
                        };
                    }
                } finally {
                    if (cdpSession) {
                        await cdpSession.detach().catch(() => {});
                    }
                }
            }
        }

        // Also try button role
        const searchButtons = this.findMatchingNodes(nodes, 'button', searchPattern);
        if (searchButtons.length > 0) {
            const match = searchButtons[0];
            if (match.backendDOMNodeId) {
                let cdpSession: CDPSession | null = null;
                try {
                    cdpSession = await this.page.context().newCDPSession(this.page);
                    const box = await this.getNodeBoundingBox(cdpSession, match.backendDOMNodeId);
                    if (box && box.width > 0 && box.height > 0) {
                        return {
                            role: match.role?.value || 'button',
                            name: match.name?.value || 'Search',
                            selector: '',
                            boundingBox: box
                        };
                    }
                } finally {
                    if (cdpSession) {
                        await cdpSession.detach().catch(() => {});
                    }
                }
            }
        }

        return null;
    }

    /**
     * Find the search input field using CDP accessibility tree.
     * Instagram's search input is typically a textbox/searchbox with name containing "Search".
     *
     * Returns element with bounding box for clicking - NO DOM selectors used.
     */
    async findSearchInput(): Promise<InteractiveElement | null> {
        const nodes = await this.getAccessibilityTree();

        // Look for textbox, searchbox, or combobox with "search" in the name
        const searchPattern = /search/i;
        const inputRoles = ['textbox', 'searchbox', 'combobox'];

        for (const role of inputRoles) {
            const matches = this.findMatchingNodes(nodes, role, searchPattern);
            if (matches.length > 0) {
                const match = matches[0];
                if (match.backendDOMNodeId) {
                    let cdpSession: CDPSession | null = null;
                    try {
                        cdpSession = await this.page.context().newCDPSession(this.page);
                        const box = await this.getNodeBoundingBox(cdpSession, match.backendDOMNodeId);
                        if (box && box.width > 0 && box.height > 0) {
                            return {
                                role: match.role?.value || role,
                                name: match.name?.value || 'Search',
                                selector: '',
                                boundingBox: box
                            };
                        }
                    } finally {
                        if (cdpSession) {
                            await cdpSession.detach().catch(() => {});
                        }
                    }
                }
            }
        }

        return null;
    }

    /**
     * Find search result items using CDP accessibility tree.
     * Returns elements that appear to be search result entries.
     */
    async findSearchResults(): Promise<InteractiveElement[]> {
        const results: InteractiveElement[] = [];
        const nodes = await this.getAccessibilityTree();

        // Search results are typically links with user/hashtag names
        // Filter for links that are not navigation items
        const linkNodes = nodes.filter(node => {
            if (node.ignored) return false;
            const nodeRole = node.role?.value?.toLowerCase();
            const nodeName = node.name?.value || '';

            // Must be a link with a non-empty name
            if (nodeRole !== 'link' || !nodeName) return false;

            // Exclude navigation items (Home, Search, Explore, etc.)
            const navItems = ['home', 'search', 'explore', 'reels', 'messages', 'notifications', 'create', 'profile'];
            if (navItems.some(nav => nodeName.toLowerCase() === nav)) return false;

            // Include if it looks like a username or hashtag
            return nodeName.startsWith('@') || nodeName.startsWith('#') || nodeName.length > 2;
        });

        if (linkNodes.length === 0) {
            return results;
        }

        let cdpSession: CDPSession | null = null;
        try {
            cdpSession = await this.page.context().newCDPSession(this.page);

            for (const node of linkNodes.slice(0, 10)) { // Limit to 10 results
                if (!node.backendDOMNodeId) continue;

                const box = await this.getNodeBoundingBox(cdpSession, node.backendDOMNodeId);
                if (box && box.width > 0 && box.height > 0) {
                    results.push({
                        role: node.role?.value || 'link',
                        name: node.name?.value || '',
                        selector: '',
                        boundingBox: box
                    });
                }
            }
        } finally {
            if (cdpSession) {
                await cdpSession.detach().catch(() => {});
            }
        }

        return results;
    }

    /**
     * Type text into the currently focused input using CDP.
     * This uses Input.insertText which is harder to detect than keyboard events.
     *
     * @param text - The text to type
     * @param humanLike - If true, adds random delays between characters
     */
    async typeText(text: string, humanLike: boolean = true): Promise<void> {
        let cdpSession: CDPSession | null = null;
        try {
            cdpSession = await this.page.context().newCDPSession(this.page);

            if (humanLike) {
                // Type character by character with random delays
                for (const char of text) {
                    await cdpSession.send('Input.insertText', { text: char });
                    // Random delay between 50-150ms per character
                    await new Promise(r => setTimeout(r, 50 + Math.random() * 100));
                }
            } else {
                // Type all at once
                await cdpSession.send('Input.insertText', { text });
            }
        } finally {
            if (cdpSession) {
                await cdpSession.detach().catch(() => {});
            }
        }
    }

    /**
     * Clear the current input field using CDP.
     * Selects all text and deletes it.
     */
    async clearInput(): Promise<void> {
        let cdpSession: CDPSession | null = null;
        try {
            cdpSession = await this.page.context().newCDPSession(this.page);

            // Select all (Cmd+A on Mac, Ctrl+A on others)
            const isMac = process.platform === 'darwin';
            const modifier = isMac ? 2 : 4; // 2 = Meta, 4 = Control

            await cdpSession.send('Input.dispatchKeyEvent', {
                type: 'keyDown',
                modifiers: modifier,
                key: 'a',
                code: 'KeyA'
            });
            await cdpSession.send('Input.dispatchKeyEvent', {
                type: 'keyUp',
                modifiers: modifier,
                key: 'a',
                code: 'KeyA'
            });

            // Delete selected text
            await cdpSession.send('Input.dispatchKeyEvent', {
                type: 'keyDown',
                key: 'Backspace',
                code: 'Backspace'
            });
            await cdpSession.send('Input.dispatchKeyEvent', {
                type: 'keyUp',
                key: 'Backspace',
                code: 'Backspace'
            });
        } finally {
            if (cdpSession) {
                await cdpSession.detach().catch(() => {});
            }
        }
    }

    /**
     * Press the Escape key using CDP.
     * Useful for closing search panel or dialogs.
     */
    async pressEscape(): Promise<void> {
        let cdpSession: CDPSession | null = null;
        try {
            cdpSession = await this.page.context().newCDPSession(this.page);

            await cdpSession.send('Input.dispatchKeyEvent', {
                type: 'keyDown',
                key: 'Escape',
                code: 'Escape'
            });
            await cdpSession.send('Input.dispatchKeyEvent', {
                type: 'keyUp',
                key: 'Escape',
                code: 'Escape'
            });
        } finally {
            if (cdpSession) {
                await cdpSession.detach().catch(() => {});
            }
        }
    }

    /**
     * Press the Enter key using CDP.
     * Used to submit search queries and trigger results loading.
     */
    async pressEnter(): Promise<void> {
        let cdpSession: CDPSession | null = null;
        try {
            cdpSession = await this.page.context().newCDPSession(this.page);

            // Send Enter key with proper keyCode (13)
            await cdpSession.send('Input.dispatchKeyEvent', {
                type: 'keyDown',
                key: 'Enter',
                code: 'Enter',
                windowsVirtualKeyCode: 13,
                nativeVirtualKeyCode: 13
            });
            await cdpSession.send('Input.dispatchKeyEvent', {
                type: 'keyUp',
                key: 'Enter',
                code: 'Enter',
                windowsVirtualKeyCode: 13,
                nativeVirtualKeyCode: 13
            });
        } finally {
            if (cdpSession) {
                await cdpSession.detach().catch(() => {});
            }
        }
    }

    /**
     * Type text and press Enter to submit search.
     * Combines typeText + pressEnter for convenience.
     *
     * @param text - The search term to type
     * @param humanLike - If true, adds random delays between characters
     */
    async typeAndSubmit(text: string, humanLike: boolean = true): Promise<void> {
        await this.typeText(text, humanLike);
        // Small delay before pressing Enter (human hesitation)
        await new Promise(r => setTimeout(r, 200 + Math.random() * 300));
        await this.pressEnter();
    }

    // =========================================================================
    // Human Search Method (Type-Wait-Click)
    // =========================================================================

    /**
     * Human-like delay with random variation.
     */
    private humanDelay(min: number, max: number): Promise<void> {
        const delay = min + Math.random() * (max - min);
        return new Promise(resolve => setTimeout(resolve, delay));
    }

    /**
     * Human-like search: Type term, wait for dropdown, click matching result.
     *
     * This mimics how a human searches:
     * 1. Type the search term (character by character)
     * 2. Wait for autocomplete dropdown to appear (2.5-3.5 seconds)
     * 3. Scan dropdown for matching result in accessibility tree
     * 4. Click the result using GhostMouse (or press Enter as fallback)
     *
     * This is MORE human-like than typing + pressing Enter because:
     * - Humans typically click on dropdown suggestions
     * - The interaction with the dropdown is visible and natural
     * - Avoids the "instant Enter press" pattern that bots use
     *
     * @param term - The search term to enter
     * @param ghost - GhostMouse instance for human-like clicking
     * @returns SearchInteractionResult with navigation status
     */
    async enterSearchTerm(
        term: string,
        ghost: GhostMouse
    ): Promise<SearchInteractionResult> {
        console.log(`  🔤 Typing search term: "${term}"`);

        // Step 1: Type the term character by character (human-like)
        await this.typeText(term, true);

        // Step 2: Human pause after typing (looking at dropdown results)
        // Instagram needs 2-3 seconds to populate the dropdown
        const waitTime = 2500 + Math.random() * 1000;
        console.log(`  ⏳ Waiting ${(waitTime / 1000).toFixed(1)}s for dropdown...`);
        await this.humanDelay(waitTime, waitTime + 200);

        // Step 3: Refresh accessibility tree and scan for matching results
        const nodes = await this.getAccessibilityTree();
        const termLower = term.toLowerCase();

        // Navigation items to exclude from search results
        const navItems = ['home', 'search', 'explore', 'reels', 'messages', 'notifications', 'create', 'profile', 'more'];

        // Priority 1: Find link/button with name containing the search term
        // These are the most relevant results (e.g., "Indiana Football" for "indiana football")
        const matchingResults = nodes.filter(node => {
            if (node.ignored) return false;
            const role = node.role?.value?.toLowerCase();
            const name = (node.name?.value || '').toLowerCase();

            // Must be interactive (link or button)
            if (role !== 'link' && role !== 'button') return false;

            // Exclude navigation items
            if (navItems.some(nav => name === nav)) return false;

            // Must contain the search term (case-insensitive)
            return name.includes(termLower) && name.length > 2;
        });

        // Priority 2: Find any link that looks like a search result
        // (fallback if exact match not found)
        const dropdownResults = nodes.filter(node => {
            if (node.ignored) return false;
            const role = node.role?.value?.toLowerCase();
            const name = node.name?.value || '';

            // Must be a link with a non-empty name
            if (role !== 'link' || !name) return false;

            // Exclude navigation items
            if (navItems.some(nav => name.toLowerCase() === nav)) return false;

            // Must have a reasonable name length (not too short, not navigation)
            return name.length > 2 && name.length < 100;
        });

        // Step 4: Try to click the best matching result
        let cdpSession: CDPSession | null = null;
        try {
            cdpSession = await this.page.context().newCDPSession(this.page);

            // Determine which result to click (prioritize exact matches)
            const targetNode = matchingResults[0] || dropdownResults[0];

            if (targetNode?.backendDOMNodeId) {
                const box = await this.getNodeBoundingBox(cdpSession, targetNode.backendDOMNodeId);

                if (box && box.width > 0 && box.height > 0) {
                    const resultName = targetNode.name?.value || 'Unknown';
                    console.log(`  🎯 Clicking dropdown result: "${resultName}"`);

                    // Use GhostMouse for human-like click
                    await ghost.clickElement(box, 0.3);

                    // Brief pause after clicking (human reaction time)
                    await this.humanDelay(500, 1000);

                    return {
                        success: true,
                        navigated: true,
                        matchedResult: resultName,
                        fallbackUsed: false
                    };
                }
            }

            // Step 5: Fallback - Press Enter if no clickable result found
            console.log('  ⚠️ No dropdown result found, pressing Enter as fallback...');
            await this.pressEnter();

            return {
                success: true,
                navigated: false,
                matchedResult: undefined,
                fallbackUsed: true
            };

        } catch (error: any) {
            console.error('  ❌ Search interaction error:', error.message);

            // Last resort fallback - try pressing Enter
            try {
                await this.pressEnter();
            } catch {
                // Ignore
            }

            return {
                success: false,
                navigated: false,
                matchedResult: undefined,
                fallbackUsed: true
            };

        } finally {
            if (cdpSession) {
                await cdpSession.detach().catch(() => {});
            }
        }
    }
}
