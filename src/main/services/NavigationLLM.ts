/**
 * NavigationLLM - AI-Driven Navigation Decision Service
 *
 * Uses LLM (see ModelConfig.navigation) to make navigation decisions based on the accessibility tree.
 * Replaces hardcoded navigation logic with intelligent, adaptive decisions.
 *
 * Key features:
 * - Receives accessibility tree as structured JSON (not screenshots)
 * - Makes one decision at a time (click, scroll, type, press, wait)
 * - Loop detection via action history
 * - Graceful degradation with fallback strategies
 *
 * Cost: varies by model (see ModelConfig.navigation)
 */

import {
    NavigationContext,
    NavigationElement,
    NavigationDecision,
    NavigationAction,
    NavigationLLMConfig,
    ScrollResult,
    ClickParams,
    ScrollParams,
    PressParams,
    WaitParams,
    SemanticHint
} from '../../types/navigation.js';
import { ModelConfig } from '../../shared/modelConfig.js';

/**
 * Default configuration for NavigationLLM.
 */
const DEFAULT_CONFIG: Partial<NavigationLLMConfig> = {
    model: ModelConfig.navigation,
    maxTokens: 16384,
};

export class NavigationLLM {
    private apiKey: string;
    private model: string;
    private maxTokens: number;
    private debug: boolean;
    private visionDetail: 'low' | 'high' | 'off';

    // Track calls for cost logging
    private decisionCount: number = 0;

    // Session-level randomization for gaze jitter
    private sessionJitter: number;

    constructor(config: NavigationLLMConfig) {
        this.apiKey = config.apiKey;
        this.model = config.model || DEFAULT_CONFIG.model!;
        this.maxTokens = config.maxTokens || DEFAULT_CONFIG.maxTokens!;
        this.debug = config.debug ?? true;  // Default to showing reasoning
        this.visionDetail = config.visionDetail
            || (process.env.KOWALSKI_VISION_DETAIL as 'low' | 'high' | 'off')
            || 'low';

        // Session-level jitter: ±15% variance
        this.sessionJitter = 0.85 + Math.random() * 0.3;
    }

    /**
     * Get the system prompt for navigation decisions.
     */
    private getSystemPrompt(): string {
        return `You are a FULLY AUTONOMOUS Instagram navigation agent. You receive a screenshot + accessibility tree each turn. Use both to understand page state and decide actions.

CORE GOAL: Build a thorough digest of the user's Instagram world by capturing posts and stories from their detail pages.
- FEED: capture posts by navigating to each post's detail page first (NEVER capture the feed viewport itself — it produces unusable partial-post screenshots)
- STORIES: capture EVERY frame (captureNow each frame, advance, repeat)
- GRID (profiles/explore): click thumbnails to open modals before capturing (thumbnails are too small)
- Skip: ads/sponsored, "Suggested for you", loading states

TIME ALLOCATION (proportional to session length):
- ~40%: Feed posts (navigate into post detail pages to capture)
- 40-60%: Stories (capture every frame)
- 60-80%: Search topics, visit profiles, explore grid posts
- 80-100%: Wrap up remaining content, terminate

CAPTURE QUALITY — WHAT MAKES A GOOD CAPTURE:
A capture is a screenshot that gets processed into structured data downstream.
- GOOD capture: a SINGLE post's detail page — full-resolution image, complete caption, engagement stats visible. This is what captureNow is for.
- BAD capture: the feed viewport — multiple partial posts stacked, images cropped at viewport edge, captions truncated. The pipeline CANNOT extract clean data from this.
- RULE: NEVER set captureNow while on the feed or explore grid. Always navigate INTO a post first.

HOW TO CAPTURE FEED POSTS:
Each feed post has a timestamp link (role=link, named "1h", "16h", "2d", "1w", etc.) inside its article. Click it to navigate to the post's detail page where the image is full-size and the caption is complete.
- Click the timestamp link → page navigates to post detail → THEN captureNow: true
- If carousel: ArrowRight + captureNow for each slide before leaving
- After capturing, press Escape (if modal) or click the Instagram logo (link "Instagram" in sidebar) to return to the feed
- Then scroll past the captured post before clicking the next one

ARRIVING AT A POST DETAIL PAGE:
When the URL contains /p/ or /reel/, you are on a post detail page.
YOUR VERY FIRST ACTION must be: captureNow (set strategic.captureNow = true).
Do NOT click any other element first. Do NOT scroll. Capture FIRST, always.

FULL SEQUENCE ON DETAIL PAGE:
1. Arrive → captureNow (IMMEDIATELY, no other actions first)
2. Check tree for carousel indicators (dot indicators, Next button ON the image, "Slide 1 of N")
   - If carousel: press ArrowRight → captureNow → repeat until last slide
   - If not carousel: skip to step 3
3. Leave: click Instagram logo (top-left) to return to feed (NOT Escape — see standalone vs modal below)
4. Scroll down to bring fresh posts into view
5. Click next timestamp link

COMMON MISTAKES (avoid these):
- Clicking "More posts from [account]" links below the comments — navigates AWAY to a different post
- Clicking timestamp links on the detail page — you are already on the detail page
- Pressing Escape on a standalone page — does nothing, use Instagram logo instead

CAPTURE MECHANICS:
- captureNow = ONE-SHOT. Send once, screenshot taken instantly, then MOVE ON.
- Full viewport: set strategic.captureNow = true
- Specific element: set capture.targetId to element ID (crops to bounding box)
- NEVER send captureNow twice for the same content.

CAPTURE PACE:
If you have scrolled past 3 or more posts without capturing any, you are being too passive. Capture posts as you encounter them — the feed is finite and scrolling without capturing wastes session time.

EFFICIENT FEED BROWSING:
On the feed, follow this rhythm:
1. SCROLL to bring a fresh post into view
2. FIND the timestamp link (role=link, named "1h", "3h", "16h", "2d", etc.) in the nearest article
3. CLICK the timestamp link → navigates to post detail page
4. CAPTURE (captureNow) → then leave (Escape or click Instagram logo)
5. Repeat
Do NOT scroll more than 2 times in a row without clicking a timestamp link. Every scroll should be followed by a click.
If you scroll 3+ times without clicking, you are wasting session time — STOP scrolling and click the nearest timestamp.

GRID (profiles/explore/hashtags):
- Click thumbnail link → modal opens → captureNow → navigate carousel slides → Escape → next thumbnail
- Modal: dialog container with image (left) + caption/comments (right). Close with Escape or "Close" button.

STORIES:
- Click story button → viewer opens → captureNow → advance (ArrowRight/click right) → captureNow → repeat
- Stories are ephemeral — capture EVERY frame.

ELEMENT RULES:
✅ Click LINKS (role=link) to navigate: timestamp links, "View all X comments", username links, caption links
❌ NEVER click BUTTONS with numbers ("390.2K", "663") — like/comment counts, they DON'T navigate
❌ NEVER click: Like, Share, Save, Follow buttons (FORBIDDEN — read-only browsing only)

CLICK RECOVERY:
- "no_change_detected" → do NOT retry same element. Try timestamp link in same article, or scroll to next post.
- Only LINKS (role=link) navigate. BUTTONS with numbers don't.

INPUT SAFETY:
Before typing, check input's parent containers:
- Parents include "message"/"direct"/"inbox"/"chat" → DO NOT TYPE (sends DMs!)
- Parents include "comment"/"reply" → DO NOT TYPE (posts comments!)
- Parents include "Search" in navigation → Safe to type

SEARCH WORKFLOW:
1. Click "Search" link in sidebar → type search term → WAIT for results
2. Results appear as LINKS (not buttons) with "username • follower count" pattern
3. CLICK a relevant link → navigates to profile
4. On profile: scroll to grid, click posts to open modals, capture

PAGE CONTEXT (infer from tree + screenshot):
- Multiple "article" containers = feed
- Grid of images = profile/explore
- "dialog" container = modal overlay
- Use container roles, URL, and screenshot to understand layout

STANDALONE PAGES vs MODALS:
When you click a timestamp link from the feed, Instagram navigates to a STANDALONE post detail page.
This is a full page, not a modal overlay. Escape does NOTHING here.
- MODAL: You see a dialog container in the accessibility tree. Press Escape or click Close/X to dismiss.
- STANDALONE PAGE: No dialog in the tree. You navigated to a new page (/p/ or /reel/ in URL). Click the Instagram logo (top-left link named "Instagram") to return to the feed.
CRITICAL: If you press Escape and nothing changes, you are on a standalone page. Do NOT press Escape again — click the Instagram logo instead.

CAROUSEL vs "MORE POSTS" — DO NOT CONFUSE THESE:
CAROUSEL CONTROLS (slides within the SAME post):
- Small arrow buttons overlaid ON the image (Next/Previous)
- Dot indicators below the image
- Use press ArrowRight/ArrowLeft to advance slides
- Tree shows "Slide 1 of 4" or similar indicators

"MORE POSTS FROM [account]" (navigates to a DIFFERENT post):
- Grid of thumbnail images BELOW the post and comments section
- Appears after scrolling down past the comments
- NEVER click these — they navigate away from the post you're capturing
To navigate carousel slides: press ArrowRight, do NOT click links below the post.

STAGNATION RECOVERY:
- Scroll stuck (scrollY unchanged): Press Escape (overlay?), click content area to restore focus, retry
- Click fails: Try different link in same article, or scroll to next post
- Capture loop (wait+captureNow repeated): capture already taken — press Escape or click Instagram logo to leave
- Reopened same post: forgot to scroll after returning — scroll(down, medium) first
- General loop (3+ repeated actions): switch strategy entirely (feed→search, search→profile)
- Content not loading: wait(2) for lazy loading

STRATEGIC DECISIONS:
- switchPhase: "search" | "stories" | "feed" — log what you're doing
- terminateSession: true — end session (time up, content exhausted)
- lingerDuration: "short"(1s) | "medium"(3s) | "long"(6s) — pacing control
- engageDepth: "quick" | "moderate" | "deep" — exploration depth
- closeEngagement: true — exit modal, return to feed

TERMINATE WHEN: time < 30s remaining, content exhausted, stuck and can't recover

AVAILABLE ACTIONS:
- click(id): Click element. MUST include expectedName from tree.
- hover(id): Hover element (reveals hidden UI)
- scroll(direction, amount): up/down/left/right, small/medium/large
- type(text): Type into focused input
- press(key): Escape, Enter, ArrowRight, ArrowLeft, Backspace, Space, Home, End, etc.
- clear(): Clear focused input
- wait(seconds): Wait 1-5 seconds

OUTPUT FORMAT (JSON only):
{
  "reasoning": "Brief explanation",
  "action": "click",
  "params": { "id": 47, "expectedName": "16h" },
  "expectedOutcome": "Navigate to post detail page",
  "confidence": 0.9,
  "capture": { "shouldCapture": false },
  "strategic": { "captureNow": false, "lingerDuration": "short" }
}

PARAMS BY ACTION TYPE:
- click: { "id": <element_id>, "expectedName": "<name from tree>" }
- hover: { "id": <element_id>, "expectedName": "<name from tree>" }
- scroll: { "direction": "down", "amount": "medium" }
- type: { "text": "search query" }
- press: { "key": "Escape" }
- wait: { "seconds": 2 }
- clear: {}
⚠️ "id" in click/hover params is the element ID from the tree (e.g., id:47). This is NOT the same as capture.targetId.
⚠️ "expectedName" MUST be the EXACT name from the accessibility tree. Do NOT invent names.
⚠️ User interests are SEARCH TOPICS ONLY — feed and stories capture EVERYTHING regardless of topic.
⚠️ Carousel posts: check for "Next"/"Go Back" buttons or slide indicators. ArrowRight + captureNow each slide before leaving.
⚠️ On a post detail page (/p/ or /reel/ in URL)? Your FIRST action must be captureNow. Do not click anything else first.`;
    }

    /**
     * Build a dynamic progress audit from the current context.
     * Analyzes recent actions and state to produce targeted warnings
     * that help the LLM recognize when it's stuck and redirect.
     */
    private formatScrollResult(result: ScrollResult): string {
        const health = result.scrollFailed ? 'FAILED (page may be stuck)'
            : result.actualDeltaPx === 0 ? 'NO MOVEMENT'
            : 'OK';

        const lines = [
            'LAST SCROLL RESULT:',
            `- Scrolled ${result.requestedDirection} (${result.requestedAmount}): ${Math.abs(result.actualDeltaPx)}px actual`,
            `- Content type detected: ${result.contentType}`,
            `- New content: ~${result.newArticles} new post(s), ${result.newElementsAppeared} interactive elements appeared, ${result.elementsDisappeared} left viewport`,
            `- Scroll health: ${health}`,
        ];

        return lines.join('\n');
    }

    private buildProgressAudit(context: NavigationContext): string {
        const warnings: string[] = [];
        const recentActions = context.recentActions || [];

        // 1. Detect consecutive wait actions on same URL (capture loop)
        let consecutiveWaits = 0;
        for (let i = recentActions.length - 1; i >= 0; i--) {
            if (recentActions[i].action === 'wait') {
                consecutiveWaits++;
            } else {
                break;
            }
        }
        if (consecutiveWaits >= 2) {
            warnings.push(`⚠️ CAPTURE LOOP DETECTED: You've sent ${consecutiveWaits} consecutive wait actions on the same page. The capture was already taken on the first captureNow (or rejected as duplicate). STOP waiting — send back() NOW to return to the feed.`);
        }

        // 2. Last capture attempt was rejected
        if (context.lastCaptureAttempt && !context.lastCaptureAttempt.succeeded) {
            warnings.push(`⚠️ LAST CAPTURE REJECTED: ${context.lastCaptureAttempt.reason}. Do NOT send captureNow again — it will be rejected again. Send back() immediately and move to the next post.`);
        }

        // 3. Low capture rate (after 60s of session time)
        const elapsedMs = Date.now() - context.startTime;
        if (elapsedMs > 60000) {
            const capturesPerMin = (context.captureCount || 0) / (elapsedMs / 60000);
            if (capturesPerMin < 0.5) {
                const elapsedMin = Math.round(elapsedMs / 60000);
                warnings.push(`⚠️ LOW CAPTURE RATE: Only ${context.captureCount || 0} captures in ${elapsedMin} minutes. You should have ~${elapsedMin * 2}+. On the feed, click a timestamp link to enter a post's detail page, then captureNow. Do not capture from the feed viewport.`);
            }
        }

        // 4. Modal context (LLM sees dialogs in tree + screenshot)
        const lastAction = recentActions[recentActions.length - 1];

        // 5. Stagnation: many actions on same URL with no captures increasing
        if (recentActions.length >= 5) {
            const last5 = recentActions.slice(-5);
            const urls = last5.map(a => a.url).filter(Boolean);
            const allSameUrl = urls.length >= 5 && urls.every(u => u === urls[0]);
            const noCaptureIncrease = last5.every(a => a.action === 'wait' || a.action === 'scroll');
            if (allSameUrl && noCaptureIncrease) {
                warnings.push(`⚠️ STAGNANT: ${last5.length} actions on the same page with no navigation progress. Break the pattern: scroll down → click a NEW timestamp link.`);
            }
        }

        // 6. Click failures on feed — scroll down instead of retrying or backing
        const recentClickFailures = recentActions.slice(-5).filter(
            a => a.action === 'click' && a.verified === 'no_change_detected'
        );
        const isFeedUrl = context.url === 'https://www.instagram.com/' || context.url?.startsWith('https://www.instagram.com/?');
        if (recentClickFailures.length >= 2 && isFeedUrl) {
            warnings.push(`⚠️ CLICK FAILURES: ${recentClickFailures.length} clicks with no navigation. The post you're clicking may already be captured or the link is stale. SCROLL DOWN to bring a FRESH post into view, then click ITS timestamp link. Do NOT use back() — you are already on the feed.`);
        }

        // 7. Warn against back() when on the feed (it leaves Instagram)
        if (isFeedUrl) {
            const lastWasBack = lastAction?.action === 'back';
            if (lastWasBack) {
                warnings.push(`⚠️ DANGEROUS BACK: You just used back() while on the feed. This navigated AWAY from Instagram. NEVER use back() on the feed — it goes to the previous browser page (outside Instagram). Use scroll, click elements, or click the Home link to navigate.`);
            }
        }

        // 8. Scroll-only pattern on feed — scrolling without clicking any posts
        if (isFeedUrl && recentActions.length >= 6) {
            const last8 = recentActions.slice(-8);
            const scrollCount = last8.filter(a => a.action === 'scroll').length;
            const clickCount = last8.filter(a => a.action === 'click').length;
            if (scrollCount >= 4 && clickCount === 0) {
                warnings.push(
                    `⚠️ SCROLL LOOP: You have scrolled ${scrollCount} times in the last ${last8.length} actions without clicking any post. ` +
                    `Scrolling the feed without entering posts produces ZERO captures. ` +
                    `Find the nearest timestamp link (e.g., "1h", "16h", "2d") and CLICK IT to navigate to a post detail page, then captureNow.`
                );
            }
        }

        // 9. Escape spam — pressing Escape on standalone page (no modal to close)
        if (recentActions.length >= 2) {
            let consecutiveEscapes = 0;
            for (let i = recentActions.length - 1; i >= 0; i--) {
                const a = recentActions[i];
                if (a.action === 'press' && (a.params as PressParams)?.key === 'Escape') {
                    consecutiveEscapes++;
                } else {
                    break;
                }
            }
            if (consecutiveEscapes >= 2) {
                warnings.push(
                    `⚠️ ESCAPE NOT WORKING: You pressed Escape ${consecutiveEscapes} times with no effect. ` +
                    `You are on a STANDALONE PAGE, not a modal. Escape cannot close it. ` +
                    `Click the Instagram logo (link "Instagram" in the sidebar/top-left) to return to the feed.`
                );
            }
        }

        if (warnings.length === 0) return '';
        return `\n🚨 PROGRESS AUDIT (read these warnings BEFORE deciding your next action):\n${warnings.join('\n')}\n`;
    }

    /**
     * Build the user prompt with current context and elements.
     */
    private buildUserPrompt(
        context: NavigationContext,
        elements: NavigationElement[],
        hasScreenshot: boolean = false
    ): string {
        // Format recent actions with state context for stagnation detection
        // Include clicked element name so LLM knows what it ACTUALLY interacted with
        const recentActionsStr = context.recentActions
            .slice(-15)
            .map((a, i) => {
                let line = `${i + 1}. ${a.action}(${JSON.stringify(a.params)}) → ${a.success ? 'success' : 'FAILED'}`;
                const parts: string[] = [];
                if (a.clickedElementName) parts.push(`element="${a.clickedElementName}"`);
                if (a.verified && a.verified !== 'not_verified') parts.push(a.verified.replace(/_/g, ' '));
                if (a.scrollY !== undefined) parts.push(`scrollY=${a.scrollY}`);
                if (parts.length > 0) line += ` [${parts.join(', ')}]`;
                return line;
            })
            .join('\n') || 'None yet';

        // Format goal description based on current phase
        let goalDesc = '';
        switch (context.currentGoal.type) {
            case 'search_interest':
                goalDesc = `Search for posts about "${context.currentGoal.target}"`;
                break;
            case 'watch_stories':
                goalDesc = 'Watch stories — capture EVERY frame with captureNow: true, then advance to next frame, repeat';
                break;
            case 'browse_feed':
                goalDesc = 'Browsing the home feed — click timestamp links to enter post detail pages, then captureNow from the detail page (not the feed viewport)';
                break;
            case 'explore_profile':
                goalDesc = `Currently on profile: ${context.currentGoal.target}`;
                break;
            case 'analyze_account':
                goalDesc = 'Capture the full feed (every post via detail modal) and all stories. Search topics are bonus content.';
                break;
            default:
                goalDesc = 'General browsing';
        }

        // Group elements by container for LLM pattern discovery
        const elementsByContainer = this.groupElementsByContainer(elements);

        // Detect active dialog overlays (basic - LLM reasons about the rest)
        const overlays = this.detectActiveOverlays(elements);
        const overlayInfo = overlays.length > 0
            ? `- Active dialogs: ${overlays.join(', ')}\n`
            : '';

        // Calculate time
        const elapsedSec = Math.round((Date.now() - context.startTime) / 1000);
        const targetSec = Math.round(context.targetDurationMs / 1000);
        const remainingSec = Math.max(0, targetSec - elapsedSec);

        // Format user interests as context (not a checklist)
        const interestsStr = context.userInterests.length > 0
            ? context.userInterests.join(', ')
            : 'None specified';

        // Phase history
        let phaseHistoryStr = 'None yet';
        if (context.phaseHistory && context.phaseHistory.length > 0) {
            phaseHistoryStr = context.phaseHistory
                .map(p => `${p.phase}: ${Math.round(p.durationMs / 1000)}s, ${p.itemsCollected} items`)
                .join('; ');
        }

        // Video state removed — LLM detects videos from screenshot + tree

        // Content stats (only show capture pace after enough time has passed to be meaningful)
        let contentStatsStr = 'No stats yet';
        if (context.contentStats) {
            const cs = context.contentStats;
            const elapsedMs = Date.now() - context.startTime;
            const parts = [`Unique: ${(cs.uniquePostsRatio * 100).toFixed(0)}%`, `Ads: ${(cs.adRatio * 100).toFixed(0)}%`];
            // Only show capture pace after 60s — before that, "low" is meaningless and misleading
            if (elapsedMs > 60000) {
                parts.push(`Capture pace: ${cs.engagementLevel}`);
            }
            contentStatsStr = parts.join(', ');
        }

        const screenshotNote = hasScreenshot
            ? 'The screenshot above shows the current browser viewport.\n'
            : '(No screenshot available — rely on the accessibility tree below.)\n';

        return `${screenshotNote}YOU HAVE FULL STRATEGIC CONTROL. Decide what to do next.

CURRENT GOAL: ${goalDesc}

${context.currentPhase === 'search' ? `SEARCH TOPICS: ${interestsStr}` : ''}

SESSION STATUS:
- Current activity: ${context.currentPhase || 'exploring'}
- Time: ${elapsedSec}s elapsed, ${remainingSec}s remaining (of ${targetSec}s total)
- Collected: ${context.postsCollected} posts, ${context.storiesWatched} stories
- Captures: ${context.captureCount || 0} screenshots taken
${this.buildProgressAudit(context)}
ACTIVITY HISTORY: ${phaseHistoryStr}

CURRENT STATE:
- URL: ${context.url}
- Content: ${contentStatsStr}
- Scroll position: ${context.scrollPosition !== undefined ? `${context.scrollPosition}px from top` : 'unknown'}
- Content freshness: ${context.elementFingerprint || 'unknown'}
${overlayInfo}
${this.formatTreeContext(context)}
${context.lastScrollResult ? '\n' + this.formatScrollResult(context.lastScrollResult) + '\n' : ''}
ENGAGEMENT STATE:
${this.formatEngagementState(context)}
${context.sessionMemoryDigest ? `\nSESSION MEMORY (from past sessions):\n${context.sessionMemoryDigest}\n` : ''}
ACCESSIBILITY TREE (${elements.length} elements, grouped by container):
${elementsByContainer}

RECENT ACTIONS:
${recentActionsStr}
${context.loopWarning ? `\n⚠️ LOOP DETECTED (${context.loopWarning.severity}): ${context.loopWarning.reason}
WARNING #${context.loopWarning.consecutiveWarnings} — The same action has been repeated ${context.loopWarning.consecutiveWarnings} times with no visible effect.
${context.loopWarning.consecutiveWarnings >= 2 ? 'NOTE: Auto-recovery will take over on the next action if the loop continues.' : ''}\n` : ''}
Make your decision. Include strategic decisions to signal captures, activity changes, or session termination.`;
    }

    /**
     * Detect active overlays from container roles in the accessibility tree.
     * Returns descriptions of any dialogs/overlays that might intercept scrolls.
     */
    private detectActiveOverlays(elements: NavigationElement[]): string[] {
        const overlays: string[] = [];
        const seenContainers = new Set<string>();

        for (const elem of elements) {
            if (!elem.containerRole) continue;
            const key = `${elem.containerRole}:${elem.containerName || ''}`;
            if (seenContainers.has(key)) continue;
            seenContainers.add(key);

            // Dialog/alertdialog = definite overlay
            if (elem.containerRole === 'dialog' || elem.containerRole === 'alertdialog') {
                overlays.push(`${elem.containerRole}: "${elem.containerName || 'unnamed'}"`);
            }
            // Region with messaging-like names = likely overlay panel
            if (elem.containerRole === 'region' && elem.containerName) {
                const name = elem.containerName.toLowerCase();
                if (name.includes('message') || name.includes('inbox') || name.includes('chat') || name.includes('direct')) {
                    overlays.push(`messaging panel: "${elem.containerName}"`);
                }
            }
        }
        return overlays;
    }

    /**
     * Format engagement state for LLM context.
     */
    private formatEngagementState(context: NavigationContext): string {
        if (!context.engagementState) {
            return '- Level: feed (not in deep engagement)\n- Posts explored: 0';
        }

        const es = context.engagementState;
        const lines: string[] = [];

        // Current level
        lines.push(`- Level: ${es.level}`);

        // Post info
        if (es.currentPost) {
            const postInfo = [];
            if (es.currentPost.username) postInfo.push(`by @${es.currentPost.username}`);
            if (es.currentPost.postUrl) postInfo.push(`(${es.currentPost.postUrl})`);
            if (postInfo.length > 0) {
                lines.push(`- Current post: ${postInfo.join(' ')}`);
            }
        }

        // Carousel state
        if (es.carouselState) {
            const cs = es.carouselState;
            lines.push(`- Carousel: Slide ${cs.currentSlide}/${cs.totalSlides}${cs.fullyExplored ? ' (fully explored)' : ''}`);
        }

        // Time in level
        const levelDuration = Math.round((Date.now() - es.levelEnteredAt) / 1000);
        lines.push(`- Time in ${es.level}: ${levelDuration}s`);

        // Posts explored
        const exploredCount = es.deeplyExploredPostUrls?.length || 0;
        lines.push(`- Posts already explored: ${exploredCount}`);

        return lines.join('\n');
    }

    /**
     * Format tree context for LLM dynamic reasoning.
     * Shows containers, inputs with parent chains, and landmarks.
     */
    private formatTreeContext(context: NavigationContext): string {
        if (!context.treeSummary) {
            return 'TREE CONTEXT: Not available';
        }

        const ts = context.treeSummary;
        const lines: string[] = [];

        lines.push('TREE CONTEXT (use this to infer where you are):');

        // Containers
        if (ts.containers.length > 0) {
            lines.push('\nContainers found:');
            for (const c of ts.containers) {
                lines.push(`- ${c.role}: "${c.name}" (${c.childCount} children)`);
            }
        }

        // Inputs with parent context (critical for safety)
        if (ts.inputs.length > 0) {
            lines.push('\nInput fields (CHECK PARENTS BEFORE TYPING!):');
            for (const inp of ts.inputs) {
                lines.push(`- ${inp.role}: "${inp.name}"`);
                if (inp.parentContainers.length > 0) {
                    lines.push(`  Parents: [${inp.parentContainers.join(' → ')}]`);
                }
            }
        }

        // Key landmarks
        if (ts.landmarks.length > 0) {
            lines.push(`\nKey landmarks: ${ts.landmarks.join(', ')}`);
        }

        return lines.join('\n');
    }

    /**
     * Group elements by their container from the accessibility tree.
     * This lets the LLM discover patterns like "buttons in Stories region".
     * Now includes content preview for interest matching.
     */
    private groupElementsByContainer(elements: NavigationElement[]): string {
        // Group by container key (role + name)
        const containers = new Map<string, NavigationElement[]>();

        for (const elem of elements) {
            const containerKey = elem.containerRole
                ? `${elem.containerRole}${elem.containerName ? ` "${elem.containerName}"` : ''}`
                : 'root';
            if (!containers.has(containerKey)) {
                containers.set(containerKey, []);
            }
            containers.get(containerKey)!.push(elem);
        }

        // Build grouped output
        const parts: string[] = [];

        for (const [containerKey, elems] of containers) {
            // Show container with item count
            const siblingInfo = elems[0]?.siblingCount ? ` (${elems[0].siblingCount} siblings)` : '';
            parts.push(`[${containerKey}${siblingInfo}]`);

            for (const e of elems) {
                const hint = e.semanticHint ? ` ⚠️${e.semanticHint}` : '';
                const depth = e.depth !== undefined ? ` depth=${e.depth}` : '';
                const disabled = e.state?.disabled ? ' [disabled]' : '';
                parts.push(`  id:${e.id} ${e.role} "${e.name}" Y=${e.position.y}${hint}${depth}${disabled}`);

                // Show content preview for every element that has one
                if (e.contentPreview) {
                    const cp = e.contentPreview;
                    if (cp.captionText) {
                        parts.push(`    Caption: "${cp.captionText}"`);
                    }
                    if (cp.engagement) {
                        const engParts = [];
                        if (cp.engagement.likes) engParts.push(cp.engagement.likes);
                        if (cp.engagement.comments) engParts.push(cp.engagement.comments);
                        if (engParts.length > 0) {
                            parts.push(`    Engagement: ${engParts.join(', ')}`);
                        }
                    }
                    if (cp.hashtags && cp.hashtags.length > 0) {
                        parts.push(`    Tags: #${cp.hashtags.join(', #')}`);
                    }
                    if (cp.altText) {
                        parts.push(`    Alt: "${cp.altText}"`);
                    }
                }
            }
            parts.push(''); // Empty line between containers
        }

        return parts.join('\n').trim();
    }

    /**
     * Make a navigation decision using the LLM.
     *
     * @param context - Current navigation context
     * @param elements - Visible elements from accessibility tree
     * @returns Navigation decision or fallback if LLM fails
     */
    async decideAction(
        context: NavigationContext,
        elements: NavigationElement[],
        screenshot?: Buffer
    ): Promise<NavigationDecision> {
        // If no elements, return scroll or wait
        if (elements.length === 0) {
            return this.fallbackDecision(context, elements, 'No elements visible');
        }

        try {
            const rawDecision = await this.callLLM(context, elements, screenshot);

            // Track calls for cost logging
            this.decisionCount++;
            const estimatedCost = this.decisionCount * 0.001;

            // Validate and sanitize BEFORE logging so terminal reflects actual execution
            const validated = this.validateDecision(rawDecision, elements);

            // Log AFTER validation so terminal matches what actually happens
            if (this.debug) {
                console.log('\n🧠 === LLM REASONING ===');
                console.log(`Decision #${this.decisionCount} (est. cost: $${estimatedCost.toFixed(4)})`);

                // Show modification if validation changed the action
                if (rawDecision.action !== validated.action) {
                    console.log(`Action: ${rawDecision.action} → ${validated.action} (safety modified)`);
                } else {
                    console.log(`Action: ${validated.action}`);
                }

                console.log(`Reasoning: ${validated.reasoning}`);
                console.log(`Expected: ${validated.expectedOutcome}`);
                console.log(`Confidence: ${validated.confidence ?? 'N/A'}`);
                // Log capture intent
                if (validated.capture) {
                    console.log(`📸 Capture: ${validated.capture.shouldCapture ? 'YES' : 'NO'} - ${validated.capture.reason || 'no reason'}`);
                } else {
                    console.log(`📸 Capture: NOT SIGNALED`);
                }
                // Log strategic decisions
                if (validated.strategic) {
                    console.log('🎯 === STRATEGIC DECISIONS ===');
                    if (validated.strategic.switchPhase) {
                        console.log(`  Phase: SWITCH TO ${validated.strategic.switchPhase}`);
                    }
                    if (validated.strategic.terminateSession) {
                        console.log(`  ⏹️ TERMINATE SESSION`);
                    }
                    if (validated.strategic.captureNow) {
                        console.log(`  📸 Capture viewport NOW`);
                    }
                    if (validated.strategic.lingerDuration) {
                        console.log(`  ⏱️ Linger: ${validated.strategic.lingerDuration}`);
                    }
                    if (validated.strategic.reason) {
                        console.log(`  Reason: ${validated.strategic.reason}`);
                    }
                }
                console.log('========================\n');
            }

            return validated;
        } catch (error) {
            console.warn('NavigationLLM call failed, using fallback:', error);
            return this.fallbackDecision(context, elements, String(error));
        }
    }

    /**
     * Call the LLM API.
     */
    private async callLLM(
        context: NavigationContext,
        elements: NavigationElement[],
        screenshot?: Buffer
    ): Promise<NavigationDecision> {
        // Determine if we should send the screenshot based on visionDetail config
        const sendScreenshot = screenshot && this.visionDetail !== 'off';
        const userPrompt = this.buildUserPrompt(context, elements, !!sendScreenshot);

        // Log the accessibility context being sent to LLM
        if (this.debug) {
            console.log('\n📊 === ACCESSIBILITY CONTEXT FOR LLM ===');
            console.log(userPrompt);
            console.log('========================================\n');
        }

        // Build user message: multimodal (image + text) when screenshot available, text-only otherwise
        const userMessage: { role: string; content: string | Array<Record<string, unknown>> } = sendScreenshot
            ? {
                role: 'user',
                content: [
                    {
                        type: 'image_url',
                        image_url: {
                            url: `data:image/jpeg;base64,${screenshot.toString('base64')}`,
                            detail: this.visionDetail  // 'low' or 'high'
                        }
                    },
                    { type: 'text', text: userPrompt }
                ]
            }
            : { role: 'user', content: userPrompt };

        const requestBody = {
            model: this.model,
            messages: [
                { role: 'system', content: this.getSystemPrompt() },
                userMessage
            ],
            response_format: { type: 'json_object' },
            max_completion_tokens: this.maxTokens
        };

        let content = '';
        for (let attempt = 0; attempt < 3; attempt++) {
            const response = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.apiKey}`
                },
                body: JSON.stringify(requestBody)
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`LLM API error: ${response.status} - ${errorText}`);
            }

            const data = await response.json();

            // Log token usage
            if (data.usage) {
                console.log(`  🧠 LLM tokens: ${data.usage.prompt_tokens} in, ${data.usage.completion_tokens} out${sendScreenshot ? ` (vision:${this.visionDetail})` : ''}`);
            }

            // Detailed response diagnostics
            const choice = data.choices?.[0];
            console.log('[DEBUG] Full response choice:', JSON.stringify({
                finish_reason: choice?.finish_reason,
                refusal: choice?.message?.refusal,
                content_length: choice?.message?.content?.length,
                content_preview: typeof choice?.message?.content === 'string'
                    ? choice.message.content.slice(0, 100)
                    : 'non-string'
            }));

            // Check for refusal field (GPT-5 soft-refuse puts response here instead of content)
            if (choice?.message?.refusal && !choice?.message?.content) {
                console.warn(`⚠️ LLM refused request (attempt ${attempt + 1}): ${choice.message.refusal}`);
            }

            const raw = choice?.message?.content;
            content = typeof raw === 'string'
                ? raw
                : Array.isArray(raw)
                    ? raw.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('')
                    : '';

            if (content && content.trim().length > 0) break;

            if (attempt < 2) {
                console.log(`[DEBUG] Empty response on attempt ${attempt + 1} (finish_reason: ${choice?.finish_reason}), retrying in 500ms...`);
                await new Promise(r => setTimeout(r, 500));
            }
        }

        if (!content || content.trim().length === 0) {
            throw new Error('Empty LLM response');
        }

        const parsed = JSON.parse(content) as NavigationDecision;
        return parsed;
    }

    /**
     * Validate and sanitize the LLM decision.
     */
    private validateDecision(
        decision: NavigationDecision,
        elements: NavigationElement[]
    ): NavigationDecision {
        // Rewrite captureNow/capture action → wait + strategic.captureNow
        // The LLM sometimes outputs "action": "captureNow" instead of using the strategic flag
        if ((decision.action as string) === 'captureNow' || (decision.action as string) === 'capture') {
            console.log(`  🔄 Rewriting "${decision.action}" action → wait + captureNow`);
            decision = {
                ...decision,
                action: 'wait',
                params: { seconds: 1 } as WaitParams,
                strategic: { ...decision.strategic, captureNow: true }
            };
        }

        // Block back() — unreliable in Instagram SPA, can navigate to about:blank
        if (decision.action === 'back') {
            console.log(`  🛡️ Blocking back() action — converting to scroll`);
            return {
                ...decision,
                action: 'scroll',
                params: { direction: 'down', amount: 'medium' } as ScrollParams,
                reasoning: `back() blocked (unreliable in SPA), scrolling instead. Use Escape to close modals or click Instagram logo to return to feed.`
            };
        }

        // Validate action type
        const validActions: NavigationAction[] = ['click', 'scroll', 'type', 'press', 'wait', 'hover', 'back', 'clear'];
        if (!validActions.includes(decision.action)) {
            return {
                ...decision,
                action: 'wait',
                params: { seconds: 2 } as WaitParams,
                reasoning: `Invalid action "${decision.action}", defaulting to wait`
            };
        }

        // Validate click targets
        if (decision.action === 'click') {
            const clickParams = decision.params as ClickParams;
            let targetElement = elements.find(e => e.id === clickParams.id);

            // Recovery: if id is undefined/not found but expectedName exists, find by name match
            // Guard: only use startsWith for names >= 2 chars (short names like "1" match too broadly)
            if (!targetElement && clickParams.expectedName) {
                const name = clickParams.expectedName;
                targetElement = elements.find(e =>
                    e.name === name ||
                    (name.length >= 2 && e.name.startsWith(name))
                );
                if (targetElement) {
                    console.log(`  🔧 Click recovery: id=${clickParams.id} not found, matched by expectedName="${name}" → id:${targetElement.id}`);
                    clickParams.id = targetElement.id;
                }
            }

            if (!targetElement) {
                console.warn(`  ⚠️ Click target not found — params: ${JSON.stringify(decision.params)}`);
                return {
                    ...decision,
                    action: 'scroll',
                    params: { direction: 'down', amount: 'medium' } as ScrollParams,
                    reasoning: `Click target id=${clickParams.id} not found, scrolling instead`
                };
            }

            // Block interaction with forbidden elements (semantic hints)
            // Note: comment_button removed — clicking it just focuses the input,
            // the type safety net (below) blocks actually posting comments.
            const forbiddenHints: SemanticHint[] = [
                'like_button', 'share_button', 'save_button', 'follow_button'
            ];
            if (targetElement.semanticHint && forbiddenHints.includes(targetElement.semanticHint)) {
                console.log(`  🛡️ Safety: click on ${targetElement.semanticHint} → scroll (forbidden element)`);
                return {
                    ...decision,
                    action: 'scroll',
                    params: { direction: 'down', amount: 'small' } as ScrollParams,
                    reasoning: `SAFETY: Blocked interaction with ${targetElement.semanticHint}, scrolling instead`
                };
            }

        }

        // SAFETY NET: Validate type actions (context-dependent)
        // - Search typing = observational (OK)
        // - Message/comment typing = interactive (BLOCKED)
        if (decision.action === 'type') {
            for (const elem of elements) {
                if (elem.role === 'textbox' || elem.role === 'searchbox') {
                    const containerName = elem.containerName?.toLowerCase() || '';
                    const inputName = elem.name?.toLowerCase() || '';

                    // Block if in messaging context
                    if (containerName.includes('message') ||
                        containerName.includes('direct') ||
                        containerName.includes('inbox') ||
                        containerName.includes('chat')) {
                        console.log(`  🛡️ Safety: type in "${elem.containerName}" → Escape (message context)`);
                        return {
                            ...decision,
                            action: 'press',
                            params: { key: 'Escape' } as PressParams,
                            reasoning: `SAFETY: Blocked typing in message context "${elem.containerName}", pressing Escape to exit`
                        };
                    }

                    // Block if in comment context
                    if (containerName.includes('comment') ||
                        inputName.includes('comment') ||
                        inputName.includes('reply') ||
                        inputName.includes('add a comment')) {
                        console.log(`  🛡️ Safety: type in "${inputName}" → Escape (comment context)`);
                        return {
                            ...decision,
                            action: 'press',
                            params: { key: 'Escape' } as PressParams,
                            reasoning: `SAFETY: Blocked typing in comment context "${inputName}", pressing Escape to exit`
                        };
                    }
                }
            }
        }

        // Validate scroll params
        if (decision.action === 'scroll') {
            const scrollParams = decision.params as ScrollParams;
            if (!['up', 'down', 'left', 'right'].includes(scrollParams.direction)) {
                scrollParams.direction = 'down';
            }
            if (!['small', 'medium', 'large', 'xlarge'].includes(scrollParams.amount)) {
                scrollParams.amount = 'medium';
            }
        }

        // Validate press params
        if (decision.action === 'press') {
            const pressParams = decision.params as PressParams;
            const validKeys = [
                'Escape', 'Enter', 'Backspace', 'Delete', 'Space',
                'ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown',
                'Tab', 'Home', 'End', 'PageUp', 'PageDown'
            ];
            if (!validKeys.includes(pressParams.key)) {
                return {
                    ...decision,
                    action: 'wait',
                    params: { seconds: 1 } as WaitParams,
                    reasoning: `Invalid key "${pressParams.key}", defaulting to wait`
                };
            }
        }

        // Validate hover targets (same as click - need valid element)
        if (decision.action === 'hover') {
            const hoverParams = decision.params as ClickParams;  // Same shape: { id }
            const targetElement = elements.find(e => e.id === hoverParams.id);
            if (!targetElement) {
                return {
                    ...decision,
                    action: 'wait',
                    params: { seconds: 1 } as WaitParams,
                    reasoning: `Hover target id=${hoverParams.id} not found, defaulting to wait`
                };
            }
        }

        // Validate wait params
        if (decision.action === 'wait') {
            const waitParams = decision.params as WaitParams;
            waitParams.seconds = Math.max(1, Math.min(5, waitParams.seconds || 2));
        }

        return decision;
    }

    /**
     * Fallback decision when LLM fails or is unavailable.
     * Uses escalating strategies based on recent action patterns.
     */
    private fallbackDecision(
        context: NavigationContext,
        elements: NavigationElement[],
        reason: string
    ): NavigationDecision {
        const recent = context.recentActions.slice(-15);

        // Check for scroll position stagnation
        const scrollPositions = recent
            .filter(a => a.scrollY !== undefined)
            .map(a => a.scrollY!);
        const scrollStagnant = scrollPositions.length >= 2 &&
            scrollPositions.every(p => p === scrollPositions[0]);

        // Tier 1: Scroll stagnant - try Escape
        if (scrollStagnant) {
            return {
                reasoning: `Fallback: ${reason}. Scroll position stuck, trying escape.`,
                action: 'press',
                params: { key: 'Escape' } as PressParams,
                expectedOutcome: 'Close any blocking overlay',
                confidence: 0.3
            };
        }

        // Tier 2: Multiple failures - press Escape (might be stuck in overlay)
        const recentFailures = recent.filter(a => !a.success).length;
        if (recentFailures >= 3) {
            return {
                reasoning: `Fallback: ${reason}. Multiple failures, pressing Escape.`,
                action: 'press',
                params: { key: 'Escape' } as PressParams,
                expectedOutcome: 'Close any blocking overlay',
                confidence: 0.2
            };
        }

        // Default: scroll down to find more content
        return {
            reasoning: `Fallback: ${reason}. Scrolling to find more content.`,
            action: 'scroll',
            params: { direction: 'down', amount: 'medium' } as ScrollParams,
            expectedOutcome: 'More content should become visible',
            confidence: 0.3
        };
    }

    /**
     * Get the number of decisions made this session.
     */
    getDecisionCount(): number {
        return this.decisionCount;
    }

    /**
     * Get estimated cost based on decisions made.
     */
    getEstimatedCost(): number {
        return this.decisionCount * 0.001;
    }

}
