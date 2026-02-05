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
    ElementState,
    BoundingBox,
    ContentDensity,
    ContentType,
    CDPAXNode,
    AXTree,
    AXTreeNode,
    EdgeButtonOptions
} from '../../types/instagram.js';
import { NavigationElement, SemanticHint } from '../../types/navigation.js';
import type { GhostMouse } from './GhostMouse.js';

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

/**
 * Container information for LLM reasoning.
 */
export interface ContainerInfo {
    role: string;
    name: string;
    childCount: number;
}

/**
 * Input field information with parent context for LLM reasoning.
 */
export interface InputInfo {
    role: string;
    name: string;
    parentContainers: string[];  // Names of parent containers
}

/**
 * Rich tree summary for LLM dynamic reasoning.
 * Provides structured context without interpretation.
 */
export interface TreeSummary {
    containers: ContainerInfo[];
    inputs: InputInfo[];
    landmarks: string[];  // Unique names found in tree
}

export class A11yNavigator {
    private page: Page;
    // Session-level timing multiplier for cross-session variance in typing delays
    private sessionTimingMultiplier: number;

    // === CDP Session Management ===
    // Reduces session churn by reusing sessions within a short window
    private managedSession: CDPSession | null = null;
    private sessionLastUsed: number = 0;
    private readonly SESSION_TIMEOUT_MS = 5000; // Auto-detach after 5s idle

    constructor(page: Page) {
        this.page = page;
        // Vary timing by ±30% per session (0.7 to 1.3)
        this.sessionTimingMultiplier = 0.7 + Math.random() * 0.6;
    }

    // =========================================================================
    // CDP Session Management (Reduce Session Churn)
    // =========================================================================

    /**
     * Execute an operation with a managed CDP session.
     * Sessions are reused within a short window to reduce overhead and staleness.
     *
     * @param operation - Async function that uses the CDP session
     * @returns Result of the operation
     */
    private async withSession<T>(
        operation: (session: CDPSession) => Promise<T>
    ): Promise<T> {
        const now = Date.now();

        // If existing session is stale (unused for > 5s), detach it
        if (this.managedSession && (now - this.sessionLastUsed) > this.SESSION_TIMEOUT_MS) {
            await this.forceReleaseSession();
        }

        // Create new session if needed
        if (!this.managedSession) {
            this.managedSession = await this.page.context().newCDPSession(this.page);
        }

        this.sessionLastUsed = now;

        try {
            return await operation(this.managedSession);
        } catch (error) {
            // On error, release session and re-throw
            await this.forceReleaseSession();
            throw error;
        }
    }

    /**
     * Force-release the managed session (e.g., on navigation or error).
     */
    private async forceReleaseSession(): Promise<void> {
        if (this.managedSession) {
            await this.managedSession.detach().catch(() => {});
            this.managedSession = null;
        }
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

        // Check for post detail page: instagram.com/p/xxx or /reel/xxx
        if (url.includes('/p/') || url.includes('/reel/')) {
            return 'post_detail';
        }

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

    // ============================================================================
    // Deep Engagement Detection
    // ============================================================================

    /**
     * Detect current engagement level for LLM context.
     * Determines if we're in feed, post modal, comments, or profile view.
     * Cost: $0 (URL analysis + optional accessibility tree check)
     */
    async detectEngagementLevel(): Promise<{
        level: 'feed' | 'post_modal' | 'comments' | 'profile';
        postUrl?: string;
        username?: string;
    }> {
        const url = this.page.url();

        // Check for post detail page
        if (url.includes('/p/') || url.includes('/reel/')) {
            const postMatch = url.match(/\/(p|reel)\/([A-Za-z0-9_-]+)/);
            const postUrl = postMatch ? `https://www.instagram.com/p/${postMatch[2]}/` : undefined;

            // Check if there's a dialog (modal overlay) in accessibility tree
            const tree = await this.buildAccessibilityTree();
            if (tree) {
                const hasDialog = Array.from(tree.nodeMap.values()).some(
                    node => node.role?.value?.toLowerCase() === 'dialog'
                );

                // If dialog present, we're in a modal on top of feed
                // Otherwise we navigated directly to post page
                return {
                    level: 'post_modal',
                    postUrl
                };
            }

            return { level: 'post_modal', postUrl };
        }

        // Check for profile page
        const profileMatch = url.match(/instagram\.com\/([^\/\?]+)\/?$/);
        if (profileMatch && !['explore', 'reels', 'direct', 'p'].includes(profileMatch[1])) {
            return {
                level: 'profile',
                username: profileMatch[1]
            };
        }

        // Default to feed
        return { level: 'feed' };
    }

    /**
     * Extract engagement metrics from visible post elements.
     * Looks for like counts, comment counts, carousel indicators.
     * Cost: $0 (accessibility tree analysis)
     */
    async extractPostEngagementMetrics(): Promise<{
        likeCount?: string;
        commentCount?: string;
        carouselState?: { currentSlide: number; totalSlides: number };
        hasVideo: boolean;
        username?: string;
    }> {
        const tree = await this.buildAccessibilityTree();
        if (!tree) return { hasVideo: false };

        let likeCount: string | undefined;
        let commentCount: string | undefined;
        let hasVideo = false;
        let username: string | undefined;

        for (const node of tree.nodeMap.values()) {
            if (node.ignored) continue;
            const name = node.name?.value || '';
            const role = node.role?.value?.toLowerCase() || '';

            // Like count patterns: "1,234 likes", "1 like"
            if (/^[\d,]+\s*likes?$/i.test(name)) {
                likeCount = name;
            }

            // Comment count patterns: "View all 42 comments", "1 comment"
            if (/view\s*(all\s*)?\d+\s*comments?/i.test(name) || /^\d+\s*comments?$/i.test(name)) {
                commentCount = name;
            }

            // Video detection
            if (role === 'video' || /video|play|pause|mute|unmute/i.test(name)) {
                hasVideo = true;
            }

            // Username detection (link with @ pattern or alphanumeric in header area)
            if (role === 'link' && /^@?\w+$/.test(name) && name.length > 2 && name.length < 30) {
                // Prefer shorter usernames (actual usernames vs text fragments)
                if (!username || name.length < username.length) {
                    username = name.replace(/^@/, '');
                }
            }
        }

        // Get carousel state using existing method
        const carouselIndicator = await this.getCarouselSlideIndicator();
        const carouselState = carouselIndicator ? {
            currentSlide: carouselIndicator.current,
            totalSlides: carouselIndicator.total
        } : undefined;

        return {
            likeCount,
            commentCount,
            carouselState,
            hasVideo,
            username
        };
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
     * Re-fetch an element's bounding box from CDP (fresh viewport-relative coords).
     * Use after an action has executed to get current position, not stale pre-action position.
     */
    async refetchBoundingBox(backendNodeId: number): Promise<BoundingBox | null> {
        return this.withSession(async (cdpSession) => {
            return this.getNodeBoundingBox(cdpSession, backendNodeId);
        });
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

            for (const node of allStoryNodes) {
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
     * Find post elements with bounding boxes in a SINGLE CDP session.
     * Prevents staleness between tree query and box retrieval.
     *
     * This is the recommended method for post-centered scrolling.
     * Uses withSession() to ensure all operations happen atomically.
     *
     * @returns Posts with fresh bounding boxes from same CDP session
     */
    async findPostElementsAtomic(): Promise<InteractiveElement[]> {
        return this.withSession(async (cdpSession) => {
            const posts: InteractiveElement[] = [];

            // Step 1: Get accessibility tree
            const response = await cdpSession.send('Accessibility.getFullAXTree') as CDPAXTreeResponse;
            const nodes = response.nodes || [];

            // Step 2: Filter for article nodes
            const articleNodes = nodes.filter(node => {
                if (node.ignored) return false;
                const role = node.role?.value?.toLowerCase();
                return role === 'article';
            });

            if (articleNodes.length === 0) {
                return posts;
            }

            // Step 3: Get viewport info (same session)
            const viewportResult = await cdpSession.send('Runtime.evaluate', {
                expression: `JSON.stringify({
                    height: window.innerHeight,
                    scrollY: window.scrollY
                })`,
                returnByValue: true
            });
            const viewport = JSON.parse(viewportResult.result.value as string);

            // Step 4: Get bounding boxes in same session (prevents staleness!)
            for (const node of articleNodes) {
                if (!node.backendDOMNodeId) continue;

                try {
                    const { model } = await cdpSession.send('DOM.getBoxModel', {
                        backendNodeId: node.backendDOMNodeId
                    });

                    if (!model?.content) continue;

                    const [x1, y1, x2, , , y3] = model.content;
                    const box: BoundingBox = {
                        x: x1,
                        y: y1,
                        width: x2 - x1,
                        height: y3 - y1
                    };

                    // Filter for actual posts (not tiny elements)
                    if (box.width < viewport.width * 0.05 || box.height < viewport.height * 0.05) continue;

                    // Check if near viewport
                    const isNearViewport = box.y < viewport.height * 2 &&
                                           box.y + box.height > -viewport.height;
                    if (!isNearViewport) continue;

                    posts.push({
                        role: 'article',
                        name: node.name?.value || 'Post',
                        selector: '',
                        boundingBox: box,
                        backendNodeId: node.backendDOMNodeId
                    });
                } catch {
                    // Skip elements that fail to get box model
                    continue;
                }
            }

            // Sort by Y position (top to bottom)
            return posts.sort((a, b) => (a.boundingBox?.y || 0) - (b.boundingBox?.y || 0));
        });
    }

    /**
     * Find the primary post content area for capture.
     * Returns the bounding box of the main article element.
     * Works for both feed view and post detail modal.
     *
     * In modal view: returns the single main article
     * In feed view: returns the article closest to viewport center
     */
    async findPostContentBounds(): Promise<BoundingBox | null> {
        const articles = await this.findPostElementsAtomic();

        if (articles.length === 0) return null;

        // Get viewport info for centering calculation
        const viewport = await this.getViewportInfo();
        const viewportCenter = viewport.height / 2;

        // Find article closest to viewport center
        let bestArticle = articles[0];
        let bestDistance = Infinity;

        for (const article of articles) {
            if (!article.boundingBox) continue;
            const articleCenter = article.boundingBox.y + article.boundingBox.height / 2;
            const distance = Math.abs(articleCenter - viewportCenter);
            if (distance < bestDistance) {
                bestDistance = distance;
                bestArticle = article;
            }
        }

        return bestArticle.boundingBox || null;
    }

    /**
     * Find carousel "Next" button for multi-image posts.
     * Instagram uses a button with name containing "Next" or arrow patterns.
     *
     * @returns InteractiveElement with bounding box, or null if not found
     */
    // =========================================================================
    // DEPRECATED: Hardcoded button finders removed
    // Use getAllInteractiveElements() with pattern matching instead.
    // Example:
    //   const elements = await navigator.getAllInteractiveElements();
    //   const nextBtn = elements.find(el => /next|skip|forward/i.test(el.name));
    // =========================================================================

    /**
     * Find ALL buttons on the current page.
     * This mimics what a screen reader can highlight - every interactive button.
     * Useful for discovery and debugging.
     *
     * @returns Array of InteractiveElements with bounding boxes
     */
    async findAllButtons(): Promise<InteractiveElement[]> {
        return this.withSession(async (cdpSession) => {
            const buttons: InteractiveElement[] = [];
            const viewport = await this.getViewportInfo();

            const response = await cdpSession.send('Accessibility.getFullAXTree') as CDPAXTreeResponse;
            const nodes = response.nodes || [];

            // Find all button-role elements
            const buttonNodes = nodes.filter(node => {
                if (node.ignored) return false;
                const role = node.role?.value?.toLowerCase();
                return role === 'button';
            });

            // Get bounding boxes for all
            for (const node of buttonNodes) {
                if (!node.backendDOMNodeId) continue;

                try {
                    const box = await this.getNodeBoundingBox(cdpSession, node.backendDOMNodeId);
                    if (!box) continue;

                    // Include even small buttons (proportional to viewport)
                    if (box.width > viewport.width * 0.005 && box.height > viewport.height * 0.005) {
                        buttons.push({
                            role: 'button',
                            name: node.name?.value || '[unnamed]',
                            selector: '',
                            boundingBox: box,
                            backendNodeId: node.backendDOMNodeId
                        });
                    }
                } catch {
                    continue;
                }
            }

            return buttons;
        });
    }

    // =========================================================================
    // SCREEN READER APPROACH - Generic Element Discovery
    // =========================================================================

    // -------------------------------------------------------------------------
    // Hierarchy-Aware Navigation (Screen Reader-Like Tree Traversal)
    // -------------------------------------------------------------------------

    /**
     * Interactive roles that screen readers expose for navigation.
     */
    private readonly INTERACTIVE_ROLES = [
        'button', 'link', 'menuitem', 'tab',
        'checkbox', 'radio', 'switch',
        'textbox', 'searchbox', 'slider',
        'img'  // Include images (may be clickable)
    ];

    /**
     * Build a navigable tree from the flat CDP accessibility response.
     * Establishes parent-child relationships for hierarchy queries.
     *
     * This is the foundation for screen reader-like navigation:
     * - Enables "find button inside THIS container" queries
     * - Supports ancestor lookups (e.g., "what article contains this button?")
     * - Provides O(1) lookup by nodeId or backendDOMNodeId
     *
     * @returns AXTree with nodeMap and backendMap for O(1) lookups, or null if failed
     */
    async buildAccessibilityTree(): Promise<AXTree | null> {
        return this.withSession(async (cdpSession) => {
            const response = await cdpSession.send('Accessibility.getFullAXTree') as CDPAXTreeResponse;
            const nodes = response.nodes || [];

            if (nodes.length === 0) return null;

            // Build lookup maps
            const nodeMap = new Map<string, AXTreeNode>();
            const backendMap = new Map<number, AXTreeNode>();

            // First pass: create all nodes with depth tracking
            for (const node of nodes) {
                const treeNode: AXTreeNode = { ...node, depth: 0 };
                nodeMap.set(node.nodeId, treeNode);
                if (node.backendDOMNodeId) {
                    backendMap.set(node.backendDOMNodeId, treeNode);
                }
            }

            // Second pass: establish parent links and calculate depths
            for (const node of nodes) {
                const parentNode = nodeMap.get(node.nodeId);
                if (!parentNode || !node.childIds) continue;

                for (const childId of node.childIds) {
                    const childNode = nodeMap.get(childId);
                    if (childNode) {
                        childNode.parentId = node.nodeId;
                        childNode.depth = parentNode.depth + 1;
                    }
                }
            }

            // Root is first node (usually document/rootWebArea)
            const root = nodeMap.get(nodes[0].nodeId);
            if (!root) return null;

            return { root, nodeMap, backendMap };
        });
    }

    // =========================================================================
    // Tree Summary for LLM Dynamic Reasoning
    // =========================================================================

    /**
     * Build a rich accessibility tree summary for LLM reasoning.
     * Does NOT interpret the tree - just provides structured context.
     * The LLM infers what page it's on and what's safe to do.
     */
    async buildTreeSummaryForLLM(): Promise<TreeSummary> {
        const tree = await this.buildAccessibilityTree();
        if (!tree) return { containers: [], inputs: [], landmarks: [] };

        const containers: ContainerInfo[] = [];
        const inputs: InputInfo[] = [];
        const landmarkSet = new Set<string>();

        for (const node of tree.nodeMap.values()) {
            if (node.ignored) continue;
            const role = node.role?.value?.toLowerCase() || '';
            const name = node.name?.value || '';

            // Collect container info (regions, dialogs, etc.)
            if (['region', 'dialog', 'main', 'navigation', 'complementary', 'alertdialog',
                 'group', 'list', 'form', 'toolbar', 'tablist'].includes(role)) {
                containers.push({
                    role,
                    name: name || '[unnamed]',
                    childCount: node.childIds?.length || 0
                });
            }

            // Collect input info with parent context
            if (['textbox', 'searchbox', 'input', 'combobox', 'slider', 'spinbutton'].includes(role)) {
                const parentChain = this.getParentContainerChain(tree, node);
                inputs.push({
                    role,
                    name: name || '[unnamed input]',
                    parentContainers: parentChain
                });
            }

            // Collect unique landmark names (for context)
            if (name && name.length > 2 && name.length < 120) {
                landmarkSet.add(name);
            }
        }

        return {
            containers,
            inputs,
            landmarks: Array.from(landmarkSet)
        };
    }

    /**
     * Get the chain of parent container names for an element.
     * Used to give input fields context (e.g., "Search" inside "Direct Messages").
     */
    private getParentContainerChain(tree: AXTree, node: AXTreeNode): string[] {
        const chain: string[] = [];
        let current = node.parentId ? tree.nodeMap.get(node.parentId) : null;

        while (current && chain.length < 10) {
            const name = current.name?.value;
            const role = current.role?.value?.toLowerCase();

            // Only include named containers
            if (name && name.length > 2 &&
                ['region', 'dialog', 'main', 'navigation', 'complementary', 'alertdialog', 'article'].includes(role || '')) {
                chain.push(name);
            }

            current = current.parentId ? tree.nodeMap.get(current.parentId) : null;
        }

        return chain;
    }

    /**
     * Check if a node is a descendant of another node.
     * Walks up the tree from child to ancestor.
     *
     * @param tree - The accessibility tree
     * @param childNodeId - The potential descendant's nodeId
     * @param ancestorNodeId - The potential ancestor's nodeId
     * @returns true if childNodeId is a descendant of ancestorNodeId
     */
    private isDescendantOf(tree: AXTree, childNodeId: string, ancestorNodeId: string): boolean {
        let current = tree.nodeMap.get(childNodeId);
        while (current?.parentId) {
            if (current.parentId === ancestorNodeId) return true;
            current = tree.nodeMap.get(current.parentId);
        }
        return false;
    }

    /**
     * Find ancestor matching one of the given roles.
     * Useful for finding "the article containing this button".
     *
     * @param tree - The accessibility tree
     * @param nodeId - Starting node's nodeId
     * @param roles - Array of roles to search for (e.g., ['article', 'region', 'dialog'])
     * @returns First ancestor matching a role, or null
     */
    private findAncestorByRole(tree: AXTree, nodeId: string, roles: string[]): AXTreeNode | null {
        let current = tree.nodeMap.get(nodeId);
        while (current?.parentId) {
            current = tree.nodeMap.get(current.parentId);
            if (current) {
                const role = current.role?.value?.toLowerCase();
                if (role && roles.includes(role)) return current;
            }
        }
        return null;
    }

    /**
     * Get all interactive descendants of a container.
     * Returns elements that are hierarchically inside the container.
     *
     * This is the key method for scoped searches:
     * - "Find all buttons inside this carousel"
     * - "Find all links inside this article"
     *
     * @param tree - The accessibility tree
     * @param ancestorNodeId - The container's nodeId
     * @param roleFilter - Optional array of roles to filter (e.g., ['button', 'link'])
     * @returns Array of InteractiveElements that are descendants of the container
     */
    private async getDescendantElements(
        tree: AXTree,
        ancestorNodeId: string,
        roleFilter?: string[]
    ): Promise<InteractiveElement[]> {
        const elements: InteractiveElement[] = [];
        const ancestorNode = tree.nodeMap.get(ancestorNodeId);
        if (!ancestorNode) return elements;

        // Collect all descendant nodeIds first (sync traversal)
        const descendantNodeIds: string[] = [];
        const collectDescendants = (nodeId: string) => {
            const node = tree.nodeMap.get(nodeId);
            if (!node || node.ignored) return;

            const role = node.role?.value?.toLowerCase();

            // Check if this node matches our filter
            if (role && this.INTERACTIVE_ROLES.includes(role)) {
                if (!roleFilter || roleFilter.includes(role)) {
                    descendantNodeIds.push(nodeId);
                }
            }

            // Traverse children
            if (node.childIds) {
                for (const childId of node.childIds) {
                    collectDescendants(childId);
                }
            }
        };

        // Start from ancestor's children
        if (ancestorNode.childIds) {
            for (const childId of ancestorNode.childIds) {
                collectDescendants(childId);
            }
        }

        // Now get bounding boxes for all matching descendants (single session)
        return this.withSession(async (cdpSession) => {
            for (const nodeId of descendantNodeIds) {
                const node = tree.nodeMap.get(nodeId);
                if (!node?.backendDOMNodeId) continue;

                try {
                    const box = await this.getNodeBoundingBox(cdpSession, node.backendDOMNodeId);
                    if (box && box.width > 0 && box.height > 0) {
                        elements.push({
                            role: node.role?.value?.toLowerCase() || 'unknown',
                            name: node.name?.value || '[unnamed]',
                            selector: '',
                            boundingBox: box,
                            backendNodeId: node.backendDOMNodeId
                        });
                    }
                } catch {
                    // Skip nodes we can't get boxes for
                }
            }
            return elements;
        });
    }

    /**
     * Find the semantic container (article, region, dialog, figure) for an element.
     * Essential for scoped searches - "find buttons inside THIS post".
     *
     * @param backendNodeId - The backendDOMNodeId of the element
     * @returns Container info with nodeId and role, or null if no container found
     */
    async findContainerForElement(backendNodeId: number): Promise<{
        containerNodeId: string;
        containerRole: string;
        backendNodeId: number;
    } | null> {
        const tree = await this.buildAccessibilityTree();
        if (!tree) return null;

        const elementNode = tree.backendMap.get(backendNodeId);
        if (!elementNode) return null;

        // Container roles (semantic boundaries)
        const containerRoles = ['article', 'region', 'dialog', 'main', 'navigation', 'figure'];

        const container = this.findAncestorByRole(tree, elementNode.nodeId, containerRoles);
        if (!container) return null;

        return {
            containerNodeId: container.nodeId,
            containerRole: container.role?.value || 'unknown',
            backendNodeId: container.backendDOMNodeId || 0
        };
    }

    /**
     * Find the story viewer container (dialog/modal).
     * Stories open in a modal overlay with specific characteristics.
     *
     * @returns Container nodeId if found, or null
     */
    async findStoryViewerContainer(): Promise<string | null> {
        const tree = await this.buildAccessibilityTree();
        if (!tree) return null;

        // Story viewer is typically a dialog or region with story-related content
        for (const [nodeId, node] of tree.nodeMap) {
            const role = node.role?.value?.toLowerCase();
            if (role === 'dialog' || role === 'region') {
                // Check if this container has story-like content
                // (close button, navigation buttons)
                const descendants = await this.getDescendantElements(tree, nodeId, ['button']);
                const hasStoryNav = descendants.some(d =>
                    /close|next|previous|pause|story/i.test(d.name)
                );
                if (hasStoryNav && descendants.length >= 2) {
                    console.log(`  🎯 Found story container: ${role} with ${descendants.length} buttons`);
                    return nodeId;
                }
            }
        }
        return null;
    }

    // -------------------------------------------------------------------------
    // End Hierarchy-Aware Navigation
    // -------------------------------------------------------------------------

    /**
     * Get ALL interactive elements on the page with full semantic information.
     * This is how screen readers discover clickable content.
     *
     * NO hardcoded patterns - returns raw A11y tree data.
     * Let the caller decide what to interact with.
     *
     * @returns Array of all interactive elements with semantic info
     */
    async getAllInteractiveElements(): Promise<InteractiveElement[]> {
        return this.withSession(async (cdpSession) => {
            const response = await cdpSession.send('Accessibility.getFullAXTree') as CDPAXTreeResponse;
            const nodes = response.nodes || [];
            const elements: InteractiveElement[] = [];

            for (const node of nodes) {
                // Skip ignored elements (not in a11y tree)
                if (node.ignored) continue;

                const role = node.role?.value?.toLowerCase();

                // Only actionable roles (using class property)
                if (!this.INTERACTIVE_ROLES.includes(role || '')) continue;

                // Extract state from properties array
                const state = this.extractElementState(node);

                // Keep disabled elements visible — state.disabled is in the returned data
                // LLM benefits from seeing disabled elements (e.g., disabled "Next" = end of carousel)

                // Get bounding box
                if (!node.backendDOMNodeId) continue;

                try {
                    const box = await this.getNodeBoundingBox(cdpSession, node.backendDOMNodeId);
                    // Trust the a11y tree - any visible element is valid (was 5px, too restrictive)
                    if (!box || box.width < 1 || box.height < 1) continue;

                    elements.push({
                        role: role || 'unknown',
                        name: node.name?.value || '[unnamed]',
                        description: node.description?.value || '',
                        value: node.value?.value || '',
                        state,
                        selector: '',
                        boundingBox: box,
                        backendNodeId: node.backendDOMNodeId
                    });
                } catch {
                    continue;
                }
            }

            return elements;
        });
    }

    /**
     * Extract state information from a node's properties.
     * Screen readers use this to determine element state.
     */
    private extractElementState(node: CDPAXNode): ElementState {
        const state: ElementState = {};

        if (!node.properties) return state;

        for (const prop of node.properties) {
            const key = prop.name.toLowerCase();
            const val = prop.value?.value;

            if (key === 'disabled') state.disabled = Boolean(val);
            if (key === 'checked') state.checked = Boolean(val);
            if (key === 'selected') state.selected = Boolean(val);
            if (key === 'expanded') state.expanded = Boolean(val);
            if (key === 'pressed') state.pressed = Boolean(val);
        }

        return state;
    }

    /**
     * Filter elements by role.
     * Example: getAllButtons() is just filterByRole('button')
     */
    async filterByRole(role: string): Promise<InteractiveElement[]> {
        const all = await this.getAllInteractiveElements();
        return all.filter(el => el.role === role);
    }

    /**
     * Filter elements matching a name pattern.
     * Example: Find "Next" or "Skip" buttons
     */
    async filterByNamePattern(pattern: RegExp): Promise<InteractiveElement[]> {
        const all = await this.getAllInteractiveElements();
        return all.filter(el => pattern.test(el.name));
    }

    /**
     * Filter elements in a specific screen region.
     * Example: Find buttons in the right half of the screen
     */
    async filterByRegion(region: BoundingBox): Promise<InteractiveElement[]> {
        const all = await this.getAllInteractiveElements();
        return all.filter(el => {
            if (!el.boundingBox) return false;
            const box = el.boundingBox;
            return box.x >= region.x &&
                   box.x + box.width <= region.x + region.width &&
                   box.y >= region.y &&
                   box.y + box.height <= region.y + region.height;
        });
    }

    /**
     * Dump all interactive elements for debugging.
     * Use this to learn what elements Instagram actually has.
     */
    async dumpInteractiveElements(): Promise<void> {
        const elements = await this.getAllInteractiveElements();

        console.log('\n=== A11y Element Discovery (Screen Reader Mode) ===');
        console.log(`Found ${elements.length} interactive elements:\n`);

        for (const el of elements) {
            const box = el.boundingBox;
            const stateStr = Object.entries(el.state || {})
                .filter(([, v]) => v)
                .map(([k]) => k)
                .join(', ');

            console.log(
                `  [${el.role}] "${el.name}"` +
                (el.description ? ` - ${el.description}` : '') +
                (stateStr ? ` (${stateStr})` : '') +
                ` at (${box?.x?.toFixed(0)}, ${box?.y?.toFixed(0)}) ${box?.width?.toFixed(0)}x${box?.height?.toFixed(0)}`
            );
        }
        console.log('===================================================\n');
    }

    /**
     * Detect if current viewport contains video content.
     * Uses STRICT criteria to avoid false positives on stories.
     *
     * Video detection signals (must have at least one):
     * 1. Mute/unmute/volume button - indicates audio track (videos only)
     * 2. Video element role - actual video player element
     * 3. Scrubber/timeline WITH duration display - video player controls
     *
     * Explicitly IGNORING (present in all stories, causes false positives):
     * - Progress bars (story progress indicator)
     * - Generic pause button (tap-to-pause on stories)
     *
     * @returns Object with isVideo and hasAudio flags
     */
    async detectVideoContent(): Promise<{ isVideo: boolean; hasAudio: boolean }> {
        const elements = await this.getAllInteractiveElements();

        // STRONG signal: Mute/unmute/volume controls (only videos have audio controls)
        const hasMuteControl = elements.some(el =>
            el.role === 'button' && /mute|unmute|volume/i.test(el.name)
        );

        // STRONG signal: Actual video element in a11y tree
        const hasVideoElement = elements.some(el =>
            el.role === 'video' ||
            (el.role === 'application' && /video|player/i.test(el.name))
        );

        // MODERATE signal: Scrubber/timeline control (video players have these, story progress bars don't)
        const hasScrubber = elements.some(el =>
            /scrub|timeline|slider|seek/i.test(el.name) ||
            (el.role === 'slider' && /video|time/i.test(el.name))
        );

        // MODERATE signal: Duration display (shows time like "0:30" - videos only)
        const hasDuration = elements.some(el =>
            /\d+:\d+/.test(el.name) || /duration|remaining/i.test(el.name)
        );

        // Video detection: need at least one STRONG signal, or both moderate signals
        const isVideo = hasMuteControl || hasVideoElement || (hasScrubber && hasDuration);

        if (isVideo) {
            console.log(`  🎬 Video detected: mute=${hasMuteControl}, videoEl=${hasVideoElement}, scrubber=${hasScrubber}`);
        }

        return {
            isVideo,
            hasAudio: hasMuteControl
        };
    }

    /**
     * Get the first element from a list of nodes that has a valid bounding box.
     * Used by button-finding methods to return actionable elements.
     *
     * @param nodes - Array of CDPAXNodes to check
     * @returns InteractiveElement with bounding box, or null if none found
     */
    private async getFirstElementWithBoundingBox(
        nodes: CDPAXNode[]
    ): Promise<InteractiveElement | null> {
        let cdpSession: CDPSession | null = null;
        try {
            cdpSession = await this.page.context().newCDPSession(this.page);

            for (const node of nodes) {
                if (!node.backendDOMNodeId) continue;

                const box = await this.getNodeBoundingBox(cdpSession, node.backendDOMNodeId);
                if (box && box.width > 0 && box.height > 0) {
                    return {
                        role: node.role?.value || 'unknown',
                        name: node.name?.value || '[unnamed]',
                        selector: '',
                        boundingBox: box,
                        backendNodeId: node.backendDOMNodeId
                    };
                }
            }

            return null;
        } finally {
            if (cdpSession) {
                await cdpSession.detach().catch(() => {});
            }
        }
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

        const viewport = await this.getViewportInfo();
        const minHighlight = viewport.width * 0.015;
        const maxHighlight = viewport.width * 0.15;

        let cdpSession: CDPSession | null = null;
        try {
            cdpSession = await this.page.context().newCDPSession(this.page);

            for (const node of highlightNodes) {
                if (!node.backendDOMNodeId) continue;

                const box = await this.getNodeBoundingBox(cdpSession, node.backendDOMNodeId);
                if (box && box.width > 0 && box.height > 0) {
                    // Highlight buttons: proportional size range
                    if (box.width >= minHighlight && box.width <= maxHighlight && box.height >= minHighlight && box.height <= maxHighlight) {
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

    // =========================================================================
    // SPATIAL DISCOVERY: Position-based Element Finding
    // =========================================================================

    /**
     * Find a button positioned on the edge of content using spatial reasoning.
     * Uses tiered strategy: 1) Image-relative search, 2) Viewport-center fallback
     *
     * For carousel navigation:
     * - Button on RIGHT edge = likely "next"
     * - Button on LEFT edge = likely "previous"
     *
     * Key insight: Carousel buttons are ALWAYS in the content area (center of screen),
     * NEVER in sidebars. This allows safe fallback when image detection fails.
     *
     * NEW: Supports hierarchy-first search when containerNodeId provided.
     * Falls back to spatial search for backward compatibility.
     *
     * @param side - 'right' for next, 'left' for previous
     * @param options - Optional EdgeButtonOptions with contentArea and/or containerNodeId
     * @returns Button element positioned on the specified side, or null
     */
    async findEdgeButton(
        side: 'right' | 'left',
        options?: EdgeButtonOptions
    ): Promise<InteractiveElement | null> {
        const viewport = await this.getViewportInfo();

        // === STRATEGY 0: HIERARCHY-FIRST (if containerNodeId provided) ===
        // This is the screen reader approach: find buttons INSIDE the container
        if (options?.containerNodeId) {
            const tree = await this.buildAccessibilityTree();
            if (tree) {
                // Get only buttons/links that are descendants of container
                const descendants = await this.getDescendantElements(
                    tree,
                    options.containerNodeId,
                    ['button', 'link']
                );

                if (descendants.length > 0) {
                    // Filter by side (same spatial logic, but on scoped elements)
                    const centerX = viewport.width / 2;

                    const sideButtons = descendants.filter(btn => {
                        const box = btn.boundingBox!;
                        const btnCenterX = box.x + box.width / 2;
                        return side === 'right' ? btnCenterX > centerX : btnCenterX < centerX;
                    });

                    if (sideButtons.length > 0) {
                        // Sort by distance from center
                        // For stories: pick closest to center (arrow buttons are near content)
                        // For carousel: pick furthest from center (buttons are at edges)
                        const inStory = this.isInStoryViewer();
                        sideButtons.sort((a, b) => {
                            const aX = a.boundingBox!.x;
                            const bX = b.boundingBox!.x;
                            return inStory
                                ? (side === 'right' ? aX - bX : bX - aX)  // Closest to center
                                : (side === 'right' ? bX - aX : aX - bX); // Furthest from center
                        });

                        console.log(`  🎯 Hierarchy: found ${sideButtons.length} ${side} button(s) in container, using "${sideButtons[0].name}"`);
                        return sideButtons[0];
                    }
                }
                console.log(`  🎯 Hierarchy: no ${side} buttons in container, falling back to spatial`);
            }
        }

        // Get all elements for spatial strategies
        const elements = await this.getAllInteractiveElements();

        // Filter to clickable elements (buttons and links)
        const clickables = elements.filter(el =>
            (el.role === 'button' || el.role === 'link') &&
            el.boundingBox && el.boundingBox.width > 0
        );

        if (clickables.length === 0) return null;

        // Extract contentArea from options for backward compatibility
        const contentArea = options?.contentArea;

        // === STRATEGY 1: Image-relative search (when contentArea provided) ===
        if (contentArea) {
            // Expanded margin: 30% of content width, with 5% overflow allowed
            const edgeMargin = contentArea.width * 0.30;
            const overflow = contentArea.width * 0.05;  // Allow buttons slightly outside

            if (side === 'right') {
                const rightZoneStart = contentArea.x + contentArea.width - edgeMargin;
                const rightZoneEnd = contentArea.x + contentArea.width + overflow;

                const rightButtons = clickables
                    .filter(btn => {
                        const box = btn.boundingBox!;
                        const buttonCenterX = box.x + box.width / 2;
                        const buttonCenterY = box.y + box.height / 2;

                        const inRightZone = buttonCenterX >= rightZoneStart && buttonCenterX <= rightZoneEnd;
                        // Proportional vertical tolerance for buttons near edges
                        const verticalTolerance = contentArea.height * 0.05;
                        const inVerticalBounds = buttonCenterY >= contentArea.y - verticalTolerance &&
                                                buttonCenterY <= contentArea.y + contentArea.height + verticalTolerance;

                        return inRightZone && inVerticalBounds;
                    })
                    .sort((a, b) => (b.boundingBox!.x) - (a.boundingBox!.x));

                if (rightButtons.length > 0) {
                    console.log(`  🎯 Spatial (image): found ${rightButtons.length} button(s), using "${rightButtons[0].name}" at x=${rightButtons[0].boundingBox!.x}`);
                    return rightButtons[0];
                }
            } else {
                const leftZoneStart = contentArea.x - overflow;
                const leftZoneEnd = contentArea.x + edgeMargin;

                const leftButtons = clickables
                    .filter(btn => {
                        const box = btn.boundingBox!;
                        const buttonCenterX = box.x + box.width / 2;
                        const buttonCenterY = box.y + box.height / 2;

                        const inLeftZone = buttonCenterX >= leftZoneStart && buttonCenterX <= leftZoneEnd;
                        const verticalTolerance = contentArea.height * 0.05;
                        const inVerticalBounds = buttonCenterY >= contentArea.y - verticalTolerance &&
                                                buttonCenterY <= contentArea.y + contentArea.height + verticalTolerance;

                        return inLeftZone && inVerticalBounds;
                    })
                    .sort((a, b) => (a.boundingBox!.x) - (b.boundingBox!.x));

                if (leftButtons.length > 0) {
                    console.log(`  🎯 Spatial (image): found ${leftButtons.length} button(s), using "${leftButtons[0].name}" at x=${leftButtons[0].boundingBox!.x}`);
                    return leftButtons[0];
                }
            }
        }

        // === STRATEGY 2: Context-aware fallback ===
        const viewportCenterX = viewport.width / 2;
        const inStoryViewer = this.isInStoryViewer();

        // Story viewer has a different layout:
        // - Story content is centered (roughly 30-70% of viewport width)
        // - Arrow buttons are at the EDGES of story content, not viewport edges
        // - Thumbnail buttons are at the FAR edges (0-25% and 75-100%)
        // For stories: search CLOSER to center, pick button nearest to center
        // For carousel/feed: search wider zone, pick button furthest from center

        if (inStoryViewer) {
            // STORY MODE: Tighter zone, pick CLOSEST to center
            // Story arrows are typically at 30-45% (left) and 55-70% (right) of viewport
            const storyZoneStart = viewport.width * 0.28;
            const storyZoneEnd = viewport.width * 0.72;

            if (side === 'right') {
                const rightButtons = clickables
                    .filter(btn => {
                        const box = btn.boundingBox!;
                        const buttonCenterX = box.x + box.width / 2;
                        // Right of center but within story content zone (not thumbnails)
                        return buttonCenterX > viewportCenterX && buttonCenterX < storyZoneEnd;
                    })
                    // Sort by CLOSEST to center (ascending x), not furthest
                    .sort((a, b) => (a.boundingBox!.x) - (b.boundingBox!.x));

                if (rightButtons.length > 0) {
                    console.log(`  🎯 Spatial (story): found ${rightButtons.length} button(s), using "${rightButtons[0].name}" at x=${Math.round(rightButtons[0].boundingBox!.x)}`);
                    return rightButtons[0];
                }
            } else {
                const leftButtons = clickables
                    .filter(btn => {
                        const box = btn.boundingBox!;
                        const buttonCenterX = box.x + box.width / 2;
                        // Left of center but within story content zone (not thumbnails)
                        return buttonCenterX > storyZoneStart && buttonCenterX < viewportCenterX;
                    })
                    // Sort by CLOSEST to center (descending x), not furthest
                    .sort((a, b) => (b.boundingBox!.x) - (a.boundingBox!.x));

                if (leftButtons.length > 0) {
                    console.log(`  🎯 Spatial (story): found ${leftButtons.length} button(s), using "${leftButtons[0].name}" at x=${Math.round(leftButtons[0].boundingBox!.x)}`);
                    return leftButtons[0];
                }
            }

            console.log(`  🎯 Spatial (story): no button found in ${side} zone`);
            return null;
        }

        // CAROUSEL/FEED MODE: Wider zone, pick furthest from center
        const safeZoneStart = viewport.width * 0.15;  // Exclude left sidebar
        const safeZoneEnd = viewport.width * 0.85;    // Exclude right sidebar

        if (side === 'right') {
            // Search right half of safe zone (50-85% of viewport)
            const rightButtons = clickables
                .filter(btn => {
                    const box = btn.boundingBox!;
                    const buttonCenterX = box.x + box.width / 2;
                    // Must be in right portion of content area (center to 85%)
                    return buttonCenterX > viewportCenterX && buttonCenterX < safeZoneEnd;
                })
                .sort((a, b) => (b.boundingBox!.x) - (a.boundingBox!.x));

            if (rightButtons.length > 0) {
                console.log(`  🎯 Spatial (fallback): found ${rightButtons.length} button(s), using "${rightButtons[0].name}" at x=${Math.round(rightButtons[0].boundingBox!.x)}`);
                return rightButtons[0];
            }
        } else {
            // Search left half of safe zone (15-50% of viewport)
            const leftButtons = clickables
                .filter(btn => {
                    const box = btn.boundingBox!;
                    const buttonCenterX = box.x + box.width / 2;
                    return buttonCenterX > safeZoneStart && buttonCenterX < viewportCenterX;
                })
                .sort((a, b) => (a.boundingBox!.x) - (b.boundingBox!.x));

            if (leftButtons.length > 0) {
                console.log(`  🎯 Spatial (fallback): found ${leftButtons.length} button(s), using "${leftButtons[0].name}" at x=${Math.round(leftButtons[0].boundingBox!.x)}`);
                return leftButtons[0];
            }
        }

        console.log(`  🎯 Spatial: no button found in ${side} zone`);
        return null;
    }

    /**
     * Find navigation controls for carousel/gallery using spatial reasoning.
     * Returns next/previous buttons based on position, not text patterns.
     *
     * Uses expanded image detection (img, figure, graphic roles) and passes
     * contentArea to findEdgeButton which will use fallback if needed.
     */
    async findCarouselControls(): Promise<{
        next: InteractiveElement | null;
        previous: InteractiveElement | null;
    }> {
        const elements = await this.getAllInteractiveElements();
        const viewport = await this.getViewportInfo();

        // Expanded image detection - include figure and graphic roles
        const imageElements = elements.filter(el =>
            (el.role === 'img' || el.role === 'figure' || el.role === 'graphic') &&
            el.boundingBox && el.boundingBox.width > viewport.width * 0.09
        );

        // Get the largest image-like element
        let mainImage: InteractiveElement | undefined;
        let maxArea = 0;

        for (const img of imageElements) {
            const area = (img.boundingBox?.width || 0) * (img.boundingBox?.height || 0);
            if (area > maxArea) {
                maxArea = area;
                mainImage = img;
            }
        }

        // contentArea may be undefined - findEdgeButton will use fallback strategy
        const contentArea = mainImage?.boundingBox;

        // NEW: Find the container for this image using hierarchy
        let containerNodeId: string | undefined;
        if (mainImage?.backendNodeId) {
            const tree = await this.buildAccessibilityTree();
            if (tree) {
                const imageNode = tree.backendMap.get(mainImage.backendNodeId);
                if (imageNode) {
                    // Find the article/figure/region containing this image
                    const container = this.findAncestorByRole(tree, imageNode.nodeId, ['article', 'figure', 'region']);
                    containerNodeId = container?.nodeId;
                    if (containerNodeId) {
                        console.log(`  🎯 Found carousel container: ${container?.role?.value}`);
                    }
                }
            }
        }

        if (contentArea) {
            console.log(`  🎯 Using image bounds: ${Math.round(contentArea.width)}x${Math.round(contentArea.height)} at (${Math.round(contentArea.x)}, ${Math.round(contentArea.y)})`);
        } else {
            console.log(`  🎯 No image found, using viewport-center fallback`);
        }

        // Pass both spatial hint AND container to findEdgeButton
        const options: EdgeButtonOptions = { contentArea, containerNodeId };

        return {
            next: await this.findEdgeButton('right', options),
            previous: await this.findEdgeButton('left', options)
        };
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
            if (name.length < 5) continue;

            // Skip if it's an interactive element (button, link, textbox)
            if (role === 'button' || role === 'link' || role === 'textbox') continue;

            // Skip navigation/header patterns
            if (/^(home|search|explore|reels|messages|notifications|create|profile)$/i.test(name)) continue;

            // Prefer text with hashtags or mentions (strong caption signal)
            if (name.includes('#') || name.includes('@')) {
                captionCandidates.unshift(name);  // High priority
            } else if (name.length > 5) {
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

            // Use unified INTERACTIVE_ROLES list
            return this.INTERACTIVE_ROLES.includes(nodeRole || '') && pattern.test(nodeName);
        });

        if (matches.length === 0) {
            return elements;
        }

        let cdpSession: CDPSession | null = null;
        try {
            cdpSession = await this.page.context().newCDPSession(this.page);

            for (const node of matches.slice(0, 100)) {
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
     * Detect if the current viewport shows an ad/sponsored content.
     * Uses accessibility tree to find ad indicators without Vision API.
     *
     * Detection signals:
     * - "Sponsored" label (below username in post header)
     * - "Learn more" button (common in ads)
     * - "Shop now" button
     * - "Paid partnership" text
     *
     * @returns Object with isAd flag and reason
     */
    async detectAdContent(): Promise<{ isAd: boolean; reason?: string }> {
        const nodes = await this.getAccessibilityTree();

        for (const node of nodes) {
            if (node.ignored) continue;
            const nodeName = node.name?.value?.toLowerCase() || '';
            const nodeRole = node.role?.value?.toLowerCase() || '';

            // Check for "Sponsored" label (appears below username in post header)
            // Instagram uses exact "Sponsored" text as a link
            if (nodeName === 'sponsored') {
                return { isAd: true, reason: 'Sponsored label detected' };
            }

            // Check for "Learn more" button/link (common in video/image ads)
            if ((nodeRole === 'button' || nodeRole === 'link') &&
                nodeName.includes('learn more')) {
                return { isAd: true, reason: 'Learn more button detected' };
            }

            // Check for "Shop now" button (e-commerce ads)
            if ((nodeRole === 'button' || nodeRole === 'link') &&
                nodeName.includes('shop now')) {
                return { isAd: true, reason: 'Shop now button detected' };
            }

            // Check for "Paid partnership" text (influencer sponsored content)
            if (nodeName.includes('paid partnership')) {
                return { isAd: true, reason: 'Paid partnership detected' };
            }
        }

        return { isAd: false };
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

            for (const node of linkNodes.slice(0, 50)) {
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
                // Type character by character with randomized delays
                // Base delay: 50-150ms, scaled by session multiplier
                // Character-specific: vowels faster, punctuation slower
                const vowels = 'aeiouAEIOU';
                const punctuation = '.,!?;:\'"()[]{}';

                for (const char of text) {
                    await cdpSession.send('Input.insertText', { text: char });

                    // Base delay with session variance
                    let baseDelay = (50 + Math.random() * 100) * this.sessionTimingMultiplier;

                    // Character-specific adjustments
                    if (vowels.includes(char)) {
                        // Vowels are typed faster (muscle memory)
                        baseDelay *= 0.8 + Math.random() * 0.2;  // 80-100% of base
                    } else if (punctuation.includes(char)) {
                        // Punctuation requires more thought
                        baseDelay *= 1.2 + Math.random() * 0.3;  // 120-150% of base
                    } else if (char === ' ') {
                        // Spaces are fast (thumb muscle memory)
                        baseDelay *= 0.6 + Math.random() * 0.2;  // 60-80% of base
                    }

                    await new Promise(r => setTimeout(r, baseDelay));
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

    // =========================================================================
    // Gaze Simulation Methods (Human-like Visual Attention)
    // =========================================================================

    /**
     * Randomized value within a range - NO fixed values allowed.
     */
    private randomInRange(min: number, max: number): number {
        return min + Math.random() * (max - min);
    }

    /**
     * Score an element's visual salience (how likely a human would look at it).
     * Higher scores = more visually interesting.
     *
     * Scoring factors:
     * - Role priority: image > button > link > heading > text
     * - Position: Center-weighted (elements near viewport center score higher)
     * - Size: Larger elements = more visually prominent
     * - Uniqueness: Common labels ("Like", "Share") score lower
     */
    private scoreElementSalience(
        node: CDPAXNode,
        box: BoundingBox,
        viewportWidth: number,
        viewportHeight: number
    ): number {
        let score = 0;
        const role = node.role?.value?.toLowerCase() || '';
        const name = (node.name?.value || '').toLowerCase();

        // Role priority scoring (randomized within ranges)
        const roleScores: Record<string, [number, number]> = {
            'image': [0.7, 0.9],
            'img': [0.7, 0.9],
            'figure': [0.65, 0.85],
            'button': [0.5, 0.7],
            'link': [0.4, 0.6],
            'heading': [0.35, 0.55],
            'text': [0.2, 0.4],
            'statictext': [0.15, 0.35]
        };
        const [minRole, maxRole] = roleScores[role] || [0.1, 0.3];
        score += this.randomInRange(minRole, maxRole);

        // Position scoring - center-weighted with randomization
        const centerX = viewportWidth / 2;
        const centerY = viewportHeight / 2;
        const elementCenterX = box.x + box.width / 2;
        const elementCenterY = box.y + box.height / 2;

        // Normalize distance from center (0 = at center, 1 = at edge)
        const distX = Math.abs(elementCenterX - centerX) / centerX;
        const distY = Math.abs(elementCenterY - centerY) / centerY;
        const centerDistance = Math.sqrt(distX * distX + distY * distY) / Math.sqrt(2);

        // Higher score for elements closer to center (with randomization)
        score += this.randomInRange(0.1, 0.3) * (1 - centerDistance);

        // Size scoring - larger elements are more prominent
        const area = box.width * box.height;
        const viewportArea = viewportWidth * viewportHeight;
        const sizeRatio = Math.min(area / viewportArea, 0.3); // Cap at 30% of viewport
        score += this.randomInRange(0.05, 0.15) * (sizeRatio / 0.3);

        // Penalty for common/repeated labels (less interesting)
        const commonLabels = ['like', 'comment', 'share', 'save', 'more', 'follow', 'following'];
        if (commonLabels.some(label => name.includes(label))) {
            score *= this.randomInRange(0.4, 0.6);
        }

        // Bonus for unique/interesting content
        if (name.includes('#') || name.includes('@')) {
            score *= this.randomInRange(1.1, 1.3);
        }

        return Math.min(score, 1); // Cap at 1.0
    }

    /**
     * Analyze content density for intent-driven scrolling.
     * Determines if viewport is text-heavy, image-heavy, or mixed.
     *
     * @returns ContentDensity with type classification and counts
     */
    async analyzeContentDensity(): Promise<ContentDensity> {
        const nodes = await this.getAccessibilityTree();

        // Count text-related nodes
        const textRoles = ['paragraph', 'text', 'heading', 'statictext', 'label'];
        const textNodes = nodes.filter(node => {
            if (node.ignored) return false;
            const role = node.role?.value?.toLowerCase() || '';
            return textRoles.includes(role);
        });

        // Count image-related nodes
        const imageRoles = ['image', 'img', 'figure', 'graphics-symbol'];
        const imageNodes = nodes.filter(node => {
            if (node.ignored) return false;
            const role = node.role?.value?.toLowerCase() || '';
            return imageRoles.includes(role);
        });

        const textCount = textNodes.length;
        const imageCount = imageNodes.length;
        const total = textCount + imageCount;

        // Avoid division by zero
        const textRatio = total > 0 ? textCount / total : 0.5;

        // Classify with randomized thresholds for variance
        const textHeavyThreshold = this.randomInRange(0.65, 0.75);
        const imageHeavyThreshold = this.randomInRange(0.25, 0.35);

        let type: ContentType;
        if (textRatio > textHeavyThreshold) {
            type = 'text-heavy';
        } else if (textRatio < imageHeavyThreshold) {
            type = 'image-heavy';
        } else {
            type = 'mixed';
        }

        return {
            type,
            textCount,
            imageCount,
            textRatio
        };
    }

    /**
     * Expose getAccessibilityTree for external use (e.g., by HumanScroll).
     * Returns the raw CDP accessibility tree.
     */
    async getFullAccessibilityTree(): Promise<CDPAXNode[]> {
        return this.getAccessibilityTree();
    }

    // =========================================================================
    // UNIVERSAL ACCESSIBILITY (Screen Reader-Like Capabilities)
    // =========================================================================

    /**
     * Find ANY element by role and name pattern - NO size filters, NO limits.
     * This is the screen reader equivalent - can find any element in the tree.
     *
     * @param role - Accessibility role (e.g., 'button', 'link', 'image', 'textbox')
     * @param namePattern - Regex pattern to match against accessible name
     * @returns First matching element with bounding box, or null
     */
    async findAnyElement(
        role: string,
        namePattern: RegExp | string
    ): Promise<InteractiveElement | null> {
        const pattern = typeof namePattern === 'string'
            ? new RegExp(namePattern, 'i')
            : namePattern;

        const nodes = await this.getAccessibilityTree();

        // Find first match - no size filter, no artificial limits
        const match = nodes.find(node => {
            if (node.ignored) return false;
            const nodeRole = node.role?.value?.toLowerCase();
            const nodeName = node.name?.value || '';
            return nodeRole === role.toLowerCase() && pattern.test(nodeName);
        });

        if (!match?.backendDOMNodeId) return null;

        // Get bounding box
        let cdpSession: CDPSession | null = null;
        try {
            cdpSession = await this.page.context().newCDPSession(this.page);
            const box = await this.getNodeBoundingBox(cdpSession, match.backendDOMNodeId);
            if (box && box.width > 0 && box.height > 0) {
                return {
                    role: match.role?.value || role,
                    name: match.name?.value || '',
                    selector: '',
                    boundingBox: box,
                    backendNodeId: match.backendDOMNodeId
                };
            }
        } finally {
            if (cdpSession) {
                await cdpSession.detach().catch(() => {});
            }
        }

        return null;
    }

    /**
     * Find ALL elements matching role and pattern - NO limits.
     * Returns every match in the accessibility tree.
     *
     * @param role - Accessibility role (e.g., 'button', 'link')
     * @param namePattern - Regex pattern to match against accessible name
     * @returns Array of all matching elements with bounding boxes
     */
    async findAllElements(
        role: string,
        namePattern: RegExp | string
    ): Promise<InteractiveElement[]> {
        const pattern = typeof namePattern === 'string'
            ? new RegExp(namePattern, 'i')
            : namePattern;

        const nodes = await this.getAccessibilityTree();
        const elements: InteractiveElement[] = [];

        // Find ALL matches - no limit
        const matches = nodes.filter(node => {
            if (node.ignored) return false;
            const nodeRole = node.role?.value?.toLowerCase();
            const nodeName = node.name?.value || '';
            return nodeRole === role.toLowerCase() && pattern.test(nodeName);
        });

        if (matches.length === 0) return elements;

        let cdpSession: CDPSession | null = null;
        try {
            cdpSession = await this.page.context().newCDPSession(this.page);

            for (const match of matches) {
                if (!match.backendDOMNodeId) continue;

                const box = await this.getNodeBoundingBox(cdpSession, match.backendDOMNodeId);
                if (box && box.width > 0 && box.height > 0) {
                    elements.push({
                        role: match.role?.value || role,
                        name: match.name?.value || '',
                        selector: '',
                        boundingBox: box,
                        backendNodeId: match.backendDOMNodeId
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
     * Find element WITHIN a specific container (e.g., find Like button inside a post).
     * Uses childIds to traverse the tree contextually like a screen reader.
     *
     * @param containerNodeId - The backendNodeId of the container element
     * @param role - Role to search for within container
     * @param namePattern - Name pattern to match
     * @returns Matching element within the container, or null
     */
    async findElementInContainer(
        containerNodeId: number,
        role: string,
        namePattern: RegExp | string
    ): Promise<InteractiveElement | null> {
        const pattern = typeof namePattern === 'string'
            ? new RegExp(namePattern, 'i')
            : namePattern;

        const nodes = await this.getAccessibilityTree();

        // Build node map for traversal (nodeId -> node)
        const nodeMap = new Map<string, CDPAXNode>();
        for (const node of nodes) {
            nodeMap.set(node.nodeId, node);
        }

        // Find container by backendDOMNodeId
        const container = nodes.find(n => n.backendDOMNodeId === containerNodeId);
        if (!container) return null;

        // Recursive search within container's children
        const searchChildren = (nodeId: string): CDPAXNode | null => {
            const node = nodeMap.get(nodeId);
            if (!node) return null;

            // Check if this node matches
            if (!node.ignored &&
                node.role?.value?.toLowerCase() === role.toLowerCase() &&
                pattern.test(node.name?.value || '')) {
                return node;
            }

            // Recurse into children
            for (const childId of node.childIds || []) {
                const found = searchChildren(childId);
                if (found) return found;
            }

            return null;
        };

        const match = searchChildren(container.nodeId);
        if (!match?.backendDOMNodeId) return null;

        // Get bounding box
        let cdpSession: CDPSession | null = null;
        try {
            cdpSession = await this.page.context().newCDPSession(this.page);
            const box = await this.getNodeBoundingBox(cdpSession, match.backendDOMNodeId);
            if (box && box.width > 0 && box.height > 0) {
                return {
                    role: match.role?.value || role,
                    name: match.name?.value || '',
                    selector: '',
                    boundingBox: box,
                    backendNodeId: match.backendDOMNodeId
                };
            }
        } finally {
            if (cdpSession) {
                await cdpSession.detach().catch(() => {});
            }
        }

        return null;
    }

    /**
     * Get all child elements of a node - enables tree traversal like screen readers.
     *
     * @param parentNodeId - The backendNodeId of the parent element
     * @returns Array of child elements with their roles, names, and bounding boxes
     */
    async getChildElements(parentNodeId: number): Promise<InteractiveElement[]> {
        const nodes = await this.getAccessibilityTree();
        const children: InteractiveElement[] = [];

        // Build node map for traversal
        const nodeMap = new Map<string, CDPAXNode>();
        for (const node of nodes) {
            nodeMap.set(node.nodeId, node);
        }

        // Find parent by backendDOMNodeId
        const parent = nodes.find(n => n.backendDOMNodeId === parentNodeId);
        if (!parent || !parent.childIds) return children;

        let cdpSession: CDPSession | null = null;
        try {
            cdpSession = await this.page.context().newCDPSession(this.page);

            for (const childId of parent.childIds) {
                const child = nodeMap.get(childId);
                if (!child || child.ignored || !child.backendDOMNodeId) continue;

                const box = await this.getNodeBoundingBox(cdpSession, child.backendDOMNodeId);
                if (box && box.width > 0 && box.height > 0) {
                    children.push({
                        role: child.role?.value || 'unknown',
                        name: child.name?.value || '',
                        selector: '',
                        boundingBox: box,
                        backendNodeId: child.backendDOMNodeId
                    });
                }
            }
        } finally {
            if (cdpSession) {
                await cdpSession.detach().catch(() => {});
            }
        }

        return children;
    }

    /**
     * Extract metadata from a post container.
     * Traverses the post's children to find username, timestamp, counts, etc.
     *
     * @param postNodeId - The backendNodeId of the post (article) element
     * @returns PostMetadata object with extracted info, or null
     */
    async extractPostMetadata(postNodeId: number): Promise<{
        username?: string;
        timestamp?: string;
        likeCount?: string;
        commentCount?: string;
    } | null> {
        const nodes = await this.getAccessibilityTree();

        // Build node map for traversal
        const nodeMap = new Map<string, CDPAXNode>();
        for (const node of nodes) {
            nodeMap.set(node.nodeId, node);
        }

        // Find post container
        const container = nodes.find(n => n.backendDOMNodeId === postNodeId);
        if (!container) return null;

        const metadata: {
            username?: string;
            timestamp?: string;
            likeCount?: string;
            commentCount?: string;
        } = {};

        // Recursive search for metadata patterns
        const searchMetadata = (nodeId: string): void => {
            const node = nodeMap.get(nodeId);
            if (!node || node.ignored) return;

            const name = node.name?.value || '';
            const role = node.role?.value?.toLowerCase() || '';

            // Timestamp patterns: "2 hours ago", "January 15", etc.
            if (/\d+\s*(second|minute|hour|day|week|month)s?\s*ago/i.test(name) ||
                /^(january|february|march|april|may|june|july|august|september|october|november|december)\s+\d+/i.test(name)) {
                metadata.timestamp = name;
            }

            // Like count: "42 likes", "1,234 likes"
            if (/^[\d,]+\s*likes?$/i.test(name)) {
                metadata.likeCount = name;
            }

            // Comment count: "View all 15 comments"
            if (/view\s*(all\s*)?\d+\s*comments?/i.test(name)) {
                metadata.commentCount = name;
            }

            // Username link (starts with @ or is a link in post header area)
            if (role === 'link' && (name.startsWith('@') || /^[a-z0-9._]+$/i.test(name))) {
                if (!metadata.username) {
                    metadata.username = name.startsWith('@') ? name : `@${name}`;
                }
            }

            // Recurse into children
            for (const childId of node.childIds || []) {
                searchMetadata(childId);
            }
        };

        searchMetadata(container.nodeId);
        return metadata;
    }

    // =========================================================================
    // AI NAVIGATION SUPPORT (NavigationLLM Integration)
    // =========================================================================

    /**
     * Get elements formatted for NavigationLLM consumption.
     *
     * Returns elements with:
     * - Unique IDs for action reference
     * - Normalized coordinates (0-1000)
     * - Container context from accessibility tree hierarchy
     * - State information (expanded, selected, etc.)
     *
     * The LLM uses container context to discover layout patterns
     * (e.g., "buttons inside 'Stories' region are story circles").
     *
     * @param maxElements - Maximum elements to return (for token efficiency)
     * @returns Array of NavigationElement objects
     */
    async getNavigationElements(maxElements: number = 1000): Promise<NavigationElement[]> {
        const elements: NavigationElement[] = [];
        const viewport = await this.getViewportInfo();

        // Build hierarchical tree for container context
        const tree = await this.buildAccessibilityTree();
        if (!tree) {
            return elements;
        }

        // Collect all interactive nodes from the tree
        const interactiveNodes: AXTreeNode[] = [];
        const relevantRoles = [
            'button', 'link', 'image', 'img', 'figure', 'article',
            'heading', 'textbox', 'searchbox', 'menuitem', 'listitem',
            'tab', 'checkbox', 'radio', 'switch', 'slider', 'combobox'
        ];

        for (const node of tree.nodeMap.values()) {
            if (node.ignored) continue;
            const role = node.role?.value?.toLowerCase() || '';
            if (relevantRoles.includes(role) && node.backendDOMNodeId) {
                interactiveNodes.push(node);
            }
        }

        if (interactiveNodes.length === 0) {
            return elements;
        }

        let cdpSession: CDPSession | null = null;
        try {
            cdpSession = await this.page.context().newCDPSession(this.page);
            let idCounter = 1;

            for (const node of interactiveNodes) {
                if (elements.length >= maxElements) break;
                if (!node.backendDOMNodeId) continue;

                const box = await this.getNodeBoundingBox(cdpSession, node.backendDOMNodeId);
                if (!box || box.width <= 0 || box.height <= 0) continue;

                // Skip elements far outside viewport (1× viewport margin above and below)
                if (box.y + box.height < -viewport.height || box.y > viewport.height * 2) continue;

                // Skip very small elements (proportional to viewport)
                if (box.width < viewport.width * 0.005 || box.height < viewport.height * 0.005) continue;

                const role = node.role?.value || 'unknown';
                const name = node.name?.value || '';

                // Normalize coordinates to 0-1000 range
                const normalizeX = (x: number) => Math.round((x / viewport.width) * 1000);
                const normalizeY = (y: number) => Math.round((y / viewport.height) * 1000);

                // Find container context from tree hierarchy
                const container = this.findNearestContainer(tree, node);

                // Get sibling count (elements in same container)
                const siblingCount = container ? this.countSiblings(tree, node, container) : 0;

                // Only detect forbidden actions (like, comment, share, save, follow)
                const semanticHint = this.inferForbiddenActionHint(name);

                // Extract state from properties
                const state = this.extractElementState(node);

                // Extract content preview for articles (for LLM value assessment)
                // Also check if this element is inside an article container
                const isArticle = role.toLowerCase() === 'article';
                const isInArticle = container?.role?.value?.toLowerCase() === 'article';
                let contentPreview: NavigationElement['contentPreview'] | undefined;

                if (isArticle) {
                    // Extract content from this article and its descendants
                    contentPreview = this.extractContentPreviewFromNode(tree, node);
                } else if (isInArticle && container) {
                    // For elements inside an article, extract from the container
                    // But only do this once per container to avoid duplication
                    contentPreview = this.extractContentPreviewFromNode(tree, container);
                }

                elements.push({
                    id: idCounter++,
                    role: role.toLowerCase(),
                    name: name.slice(0, 300),
                    position: {
                        x: normalizeX(box.x),
                        y: normalizeY(box.y),
                        w: normalizeX(box.width),
                        h: normalizeY(box.height)
                    },
                    containerRole: container?.role?.value?.toLowerCase(),
                    containerName: container?.name?.value?.slice(0, 200),
                    depth: node.depth,
                    siblingCount,
                    semanticHint: semanticHint !== 'unknown' ? semanticHint : undefined,
                    state: Object.keys(state).length > 0 ? state : undefined,
                    backendNodeId: node.backendDOMNodeId,
                    boundingBox: box,
                    contentPreview
                });
            }

        } finally {
            if (cdpSession) {
                await cdpSession.detach().catch(() => {});
            }
        }

        return elements;
    }

    /**
     * Find the nearest container ancestor in the accessibility tree.
     * Containers are elements like region, navigation, list, article, dialog.
     */
    private findNearestContainer(tree: AXTree, node: AXTreeNode): AXTreeNode | null {
        const containerRoles = [
            'region', 'navigation', 'main', 'complementary',
            'list', 'listbox', 'article', 'dialog', 'alertdialog',
            'group', 'toolbar', 'menu', 'menubar', 'tablist'
        ];

        let current = node.parentId ? tree.nodeMap.get(node.parentId) : null;

        while (current) {
            const role = current.role?.value?.toLowerCase();
            if (role && containerRoles.includes(role)) {
                return current;
            }
            current = current.parentId ? tree.nodeMap.get(current.parentId) : null;
        }

        return null;
    }

    /**
     * Count siblings within the same container.
     * Helps LLM understand element clusters (e.g., "8 buttons in Stories").
     */
    private countSiblings(tree: AXTree, node: AXTreeNode, container: AXTreeNode): number {
        if (!container.childIds) return 0;

        let count = 0;
        const nodeRole = node.role?.value?.toLowerCase();

        // Count descendants of container that have the same role
        const countInContainer = (parentNode: AXTreeNode): number => {
            let total = 0;
            if (!parentNode.childIds) return 0;

            for (const childId of parentNode.childIds) {
                const child = tree.nodeMap.get(childId);
                if (!child) continue;

                const childRole = child.role?.value?.toLowerCase();
                if (childRole === nodeRole) {
                    total++;
                }
                // Recurse into non-container children
                const isContainer = ['region', 'list', 'article', 'dialog', 'group'].includes(childRole || '');
                if (!isContainer) {
                    total += countInContainer(child);
                }
            }
            return total;
        };

        count = countInContainer(container);
        return count;
    }

    /**
     * Detect only forbidden action hints (like, comment, share, save, follow).
     * No position-based detection - let the LLM discover patterns from container context.
     */
    private inferForbiddenActionHint(name: string): SemanticHint {
        const nameLower = name.toLowerCase();

        // Search input detection (useful for navigation)
        if (/^search$/i.test(nameLower)) {
            return 'search_input';
        }

        // Close button detection (useful for modal handling)
        if (/^close$|^x$|dismiss/i.test(nameLower)) {
            return 'close_button';
        }

        // Forbidden interaction buttons - LLM should NOT click these
        if (/^like$/i.test(nameLower)) return 'like_button';
        if (/^comment$/i.test(nameLower)) return 'comment_button';
        if (/^share$/i.test(nameLower)) return 'share_button';
        if (/^save$/i.test(nameLower)) return 'save_button';
        if (/^follow$/i.test(nameLower)) return 'follow_button';

        return 'unknown';
    }

    // =========================================================================
    // Content Preview Extraction (for LLM value assessment)
    // =========================================================================

    /**
     * Extract hashtags from text content.
     * @param text - Text to search for hashtags
     * @param max - Maximum hashtags to return
     * @returns Array of hashtags (without # prefix)
     */
    private extractHashtags(text: string | undefined, max: number): string[] {
        if (!text) return [];
        const matches = text.match(/#\w+/g) || [];
        return matches.slice(0, max).map(tag => tag.substring(1)); // Remove # prefix
    }

    /**
     * Extract content preview from an article node and its descendants.
     * Used to give NavigationLLM context about post value WITHOUT Vision API.
     *
     * @param tree - The accessibility tree
     * @param articleNode - The article/container node to extract from
     * @returns Content preview object or undefined if no content found
     */
    private extractContentPreviewFromNode(
        tree: AXTree,
        articleNode: AXTreeNode
    ): NavigationElement['contentPreview'] | undefined {
        let captionText: string | undefined;
        let likes: string | undefined;
        let comments: string | undefined;
        let altText: string | undefined;

        // Recursive function to collect content from descendants
        const collectFromDescendants = (node: AXTreeNode): void => {
            if (node.ignored) return;

            const name = node.name?.value || '';
            const role = node.role?.value?.toLowerCase() || '';
            const description = node.description?.value;

            // Collect alt text from images
            if ((role === 'image' || role === 'img' || role === 'figure') && description) {
                if (!altText && description.length > 5) {
                    altText = description.slice(0, 500);
                }
            }

            // Like count patterns: "1,234 likes", "1 like"
            if (!likes && /^[\d,]+\s*likes?$/i.test(name)) {
                likes = name;
            }

            // Comment count patterns: "View all 42 comments", "1 comment"
            if (!comments && (/view\s*(all\s*)?\d+\s*comments?/i.test(name) || /^\d+\s*comments?$/i.test(name))) {
                comments = name;
            }

            // Caption detection (same logic as findPostCaption but localized to this article)
            if (!captionText && name.length >= 5) {
                // Skip interactive elements
                if (role !== 'button' && role !== 'link' && role !== 'textbox') {
                    // Skip navigation patterns
                    if (!/^(home|search|explore|reels|messages|notifications|create|profile)$/i.test(name)) {
                        // Prefer text with hashtags or mentions
                        if (name.includes('#') || name.includes('@')) {
                            captionText = name;
                        } else if (name.length > 5) {
                            captionText = name;
                        }
                    }
                }
            }

            // Recurse into children
            if (node.childIds) {
                for (const childId of node.childIds) {
                    const child = tree.nodeMap.get(childId);
                    if (child) {
                        collectFromDescendants(child);
                    }
                }
            }
        };

        // Start collection from the article node
        collectFromDescendants(articleNode);

        // Only return if we found something useful
        if (!captionText && !likes && !comments && !altText) {
            return undefined;
        }

        const hashtags = this.extractHashtags(captionText, 30);

        return {
            captionText: captionText?.slice(0, 1000),
            altText,
            engagement: (likes || comments) ? { likes, comments } : undefined,
            hasHashtags: hashtags.length > 0,
            hashtags: hashtags.length > 0 ? hashtags : undefined
        };
    }
}
