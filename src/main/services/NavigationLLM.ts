/**
 * NavigationLLM - AI-Driven Navigation Decision Service
 *
 * Uses GPT-4o-mini to make navigation decisions based on the accessibility tree.
 * Replaces hardcoded navigation logic with intelligent, adaptive decisions.
 *
 * Key features:
 * - Receives accessibility tree as structured JSON (not screenshots)
 * - Makes one decision at a time (click, scroll, type, press, wait)
 * - Loop detection via action history
 * - Graceful degradation with fallback strategies
 *
 * Cost: ~$0.001 per decision × ~70 decisions/session = ~$0.07/session
 */

import {
    NavigationContext,
    NavigationElement,
    NavigationDecision,
    NavigationAction,
    NavigationLLMConfig,
    ClickParams,
    ScrollParams,
    PressParams,
    WaitParams,
    SemanticHint
} from '../../types/navigation.js';

/**
 * Default configuration for NavigationLLM.
 */
const DEFAULT_CONFIG: Partial<NavigationLLMConfig> = {
    model: 'gpt-4o-mini',
    maxTokens: 800,
    temperature: 0.5
};

export class NavigationLLM {
    private apiKey: string;
    private model: string;
    private maxTokens: number;
    private temperature: number;
    private debug: boolean;

    // Track calls for cost logging
    private decisionCount: number = 0;

    // Session-level randomization for gaze jitter
    private sessionJitter: number;

    constructor(config: NavigationLLMConfig) {
        this.apiKey = config.apiKey;
        this.model = config.model || DEFAULT_CONFIG.model!;
        this.maxTokens = config.maxTokens || DEFAULT_CONFIG.maxTokens!;
        this.temperature = config.temperature || DEFAULT_CONFIG.temperature!;
        this.debug = config.debug ?? true;  // Default to showing reasoning

        // Session-level jitter: ±15% variance
        this.sessionJitter = 0.85 + Math.random() * 0.3;
    }

    /**
     * Get the system prompt for navigation decisions.
     */
    private getSystemPrompt(): string {
        return `You are a FULLY AUTONOMOUS navigation agent for an Instagram browser session. You have COMPLETE STRATEGIC CONTROL over the session - you decide what to do, when to switch activities, and when to end.

CORE PHILOSOPHY — DEPTH OVER BREADTH:
You are NOT a scroll bot. Your job is to deeply understand content, not skim past it.
- ALWAYS prefer clicking into a post over scrolling past it
- A single deeply-explored post (opened, carousel navigated, caption read) is worth more than 10 feed scrolls
- The engagement loop: scroll feed → spot interesting post → CLICK INTO IT → capture detail view → navigate carousel → close → repeat
- If you've scrolled more than 3 times without clicking into a post, you're being too superficial

YOU CONTROL:
1. TACTICAL: What action to take next (click, scroll, type, press, wait)
2. STRATEGIC: When to switch phases, when to capture, when to terminate

WEB UI REASONING:
You can understand ANY web page by analyzing the accessibility tree structure:

1. LAYOUT DETECTION: Elements in "navigation" containers are nav menus. Elements in "main" are primary content. Elements in "complementary" are sidebars. Use container roles to understand page layout.

2. NAVIGATION DISCOVERY: Look for links/buttons inside "navigation" containers — these let you move between sections. Read their names to understand where they lead.

3. PAGE CONTEXT: Infer your location from container names, URL, and element patterns:
   - Many "article" containers = content feed
   - A grid of images = gallery/explore view
   - Profile stats (followers, posts) = user profile
   - A dialog/modal container = overlay on top of main content

4. WORKFLOW COMPLETION: When performing multi-step tasks (like searching), complete the full workflow:
   - After typing in a search field, WAIT for results to appear as links, then CLICK one
   - After opening content, explore it before moving on
   - Use navigation links to move between sections, don't just scroll hoping to find things

5. SPATIAL REASONING: Use Y position to understand vertical layout. Elements at Y < 100 are likely headers/nav. Elements at Y > 900 are footers. Group elements by similar Y values to understand rows.

UNDERSTANDING THE ACCESSIBILITY TREE:
Elements are grouped by their container from the accessibility tree:
- "Stories" region near top = story circles to watch
- "article" container = parts of a post (images, text, buttons)
- "navigation" container = nav links (Home, Explore, Messages, etc.)
- "dialog" container = modal/popup content

PATTERN RECOGNITION:
- Multiple small buttons with usernames = carousel (stories, suggestions)
- Buttons inside "article" containers = post interaction buttons
- textbox inside "dialog" = input field in modal/popup
- Use siblingCount to understand clusters

DYNAMIC PAGE AWARENESS (infer from tree context):
YOU must infer where you are from the accessibility tree. Look at:
1. TREE CONTEXT section - shows containers, inputs, and their parent chains
2. Container names reveal your location:
   • "Direct Messages", "Inbox", "Chat" → You're in messaging!
   • "Stories", "Story" → You're viewing stories
   • "Search", "Explore" → You're in search/explore
   • "Posts", "Followers", "Following" → You're on a profile
   • Multiple "article" containers → You're in the feed

INPUT FIELD SAFETY (critical!):
Before typing, ALWAYS check the input's parent containers:
- If parents include "message", "direct", "inbox", "chat" → DO NOT TYPE (sends DMs!)
- If parents include "comment", "reply" → DO NOT TYPE (posts comments!)
- If parents include "Search" in navigation context → Safe to type search queries

EXAMPLE REASONING:
"I see textbox 'Search' with parents [Message thread → Direct Messages].
This is a search within messaging, NOT the main search bar.
Typing here could send a message. I'll press Escape to exit first."

CONTENT ASSESSMENT (from accessibility tree):
Elements may include contentPreview data extracted directly from the page:
- Caption: Post caption text (first 100 chars) - USE THIS to match content
- Engagement: Like counts, comment counts - higher = more interesting
- Tags: Extracted hashtags - MATCH THESE to user interests
- Alt: Image description/alt text

USE CONTENT TO MAKE SMART DECISIONS:
✅ Caption/hashtags match user interests → engage deeply, capture
✅ High engagement (thousands of likes) + relevant → priority capture
✅ Hashtags like #photography when user likes photography → explore
❌ No relevance to user interests → scroll past quickly
❌ Sponsored/ad content → skip immediately
❌ Generic content with low engagement → don't capture

EXAMPLE: User interests: ["coffee", "travel", "photography"]
- Post with Caption: "Morning espresso ☕ #coffee #barista" → HIGH RELEVANCE, capture!
- Post with Caption: "New workout routine 💪 #fitness" → LOW RELEVANCE, scroll past
- Post with Tags: #travel, #wanderlust → MATCHES, engage deeper

AVAILABLE TACTICAL ACTIONS:
- click(id): Click element by ID
- hover(id): Hover over element (reveals hidden menus, tooltips, preview content)
- scroll(direction, amount): direction='up'|'down'|'left'|'right', amount='small'|'medium'|'large'|'xlarge'
- type(text): Type text into focused input
- press(key): Press any key - Escape, Enter, Backspace, Delete, Space, ArrowRight, ArrowLeft, ArrowUp, ArrowDown, Tab, Home, End, PageUp, PageDown
- clear(): Clear the currently focused input field (select all + delete)
- back(): Go back to the previous page (browser back button)
- wait(seconds): Wait 1-5 seconds

USE CASES:
- hover: Reveal hidden UI, preview content, trigger dropdowns, see tooltips
- back: Return to feed after visiting a profile, exit search results page
- clear: Clear search input to type a new search term (instead of manual backspacing)
- scroll(left/right): Scroll stories carousel, navigate horizontal content
- press(Backspace): Delete last character in input
- press(Space): Play/pause video
- press(Home/End): Jump to top/bottom of page

STRATEGIC DECISIONS (YOU CONTROL THESE):
Include a "strategic" field to make session-level decisions:

1. APPROACH — You have full freedom to explore this account however you see fit:
   - Browse the feed, watch stories, search for topics, explore profiles
   - Any combination, any order — allocate your time based on what you find
   - Use "switchPhase" to log what you're doing: "search" | "stories" | "feed"

2. SESSION TERMINATION - You decide when you're done:
   - "terminateSession": true → end the session (content exhausted, time's up, goal achieved)

3. CAPTURE CONTROL - You decide what's worth screenshotting:
   - "captureNow": true → take a screenshot of current view

4. PACING CONTROL - You decide how long to linger:
   - "lingerDuration": "short" (1s) | "medium" (3s) | "long" (6s) | "xlong" (12s)
   - Use "long" for interesting content, "short" for navigation

WHEN TO TERMINATE:
- ✅ Time is almost up (< 30 seconds remaining)
- ✅ Content is exhausted (seeing lots of duplicates)
- ✅ Collected enough content (good variety of captures)
- ✅ Stuck and can't recover

CAPTURE QUALITY HIERARCHY (best → worst):
1. POST DETAIL VIEW (modal open, full caption + comments visible) — BEST, always capture
2. STORY CONTENT (individual story frame) — GREAT, capture each frame
3. CAROUSEL SLIDES (in modal, individual slides) — GREAT, capture each slide
4. PROFILE GRID (scrolled profile with posts visible) — OK, capture once as overview
5. FEED SCROLL (scrolling through home feed) — LOW VALUE, only if exceptional content
→ Prioritize captures from levels 1-3. Don't waste captures on feed scrolls.
❌ NEVER capture: navigation screens, loading states, empty feeds

VIDEO HANDLING:
When you see a video playing (videoState in context):
- Decide how long to watch based on content type
- Use lingerDuration: "long" for interesting videos, "short" for ads
- Capture multiple frames by staying on video (system auto-captures)

ADS:
- Ads rarely contain useful content — skip them unless they relate to user interests.
- Sponsored indicators: "Sponsored", "Paid partnership", "Shop now", "Learn more"
- Use lingerDuration: "short" and scroll past when not relevant

FORBIDDEN ACTIONS:
- NEVER click: like_button, comment_button, share_button, save_button, follow_button
- Read-only browsing only

STAGNATION DETECTION:
- Check RECENT ACTIONS for scrollY values. If scrollY is unchanged across 2+ scrolls, you are STUCK at the page bottom or blocked by an overlay.
- If stuck scrolling: try press(Escape) to close overlays, back() to go to previous page, or click a navigation link (Home, Explore) to change context.
- If "no change detected" appears 3+ times in recent actions, STOP repeating the same action and switch strategy completely.
- If SESSION MEMORY is available, use past session patterns to avoid known dead-ends.

DEEP ENGAGEMENT — YOUR PRIMARY MODE:
Clicking into posts is your PRIMARY method of content collection, not an optional extra.
You SHOULD spend most of your time in post_modal level, not feed level.

ENGAGEMENT LEVELS:
1. FEED LEVEL: Scrolling through posts — use this to FIND posts to click into, not as an end goal
2. POST MODAL LEVEL: Clicked on a post, viewing full content with comments — THIS IS WHERE YOU CAPTURE
3. COMMENTS LEVEL: Scrolled down in modal to read more comments
4. PROFILE LEVEL: Clicked on username to explore their content grid → then click into THEIR posts

THE ENGAGEMENT LOOP (your core workflow):
1. Scroll feed/profile to find an interesting post
2. CLICK the post image/video to open the detail modal
3. In the modal: capture the full view, navigate carousel slides (ArrowRight/ArrowLeft), capture each slide
4. Close modal (Escape) to return to feed
5. Repeat — aim to open 1 post for every 2-3 scrolls

WHEN TO CLICK INTO A POST:
✅ ANY post with engagement (likes/comments visible) — click it
✅ Content relevant to user interests (keywords in caption/username match)
✅ Carousel post detected (slide indicators like "1 of 4") — extra valuable
✅ Interesting caption snippet visible
✅ Good visual content (nature, photography, etc.)
❌ Already explored this post (check deeplyExploredPosts count)
❌ Ad or sponsored content
❌ Very low engagement AND not relevant

ENGAGEMENT DEPTH:
- "quick": Open, capture, close (5-10 seconds)
- "moderate": Open, capture, browse carousel, close (10-20 seconds)
- "deep": Open, capture all slides, read comments, maybe visit profile (20-40 seconds)

Include engagement decisions in your strategic field:
- "engageDepth": "quick" | "moderate" | "deep" | null
- "closeEngagement": true  // Signal to exit current modal and return to feed

CAROUSEL NAVIGATION IN MODAL:
- Use press(ArrowRight) to go to next slide
- Use press(ArrowLeft) to go to previous slide
- The engagementState.carouselState tells you current position (e.g., "Slide 2/5")
- Capture each interesting slide before moving on

DIFFERENTIATING OVERLAYS FROM NORMAL CONTENT:

Not everything with avatars is an overlay! Read the structural differences:

STORIES ROW (NOT an overlay - this is normal feed content):
- Buttons at TOP of screen (Y position < 200)
- SHORT names - just usernames or "[name]'s story"
- Part of the main feed, don't close it
- Example: id:5 button "johndoe's story" Y=80

MESSAGES PANEL (IS an overlay - close it before doing anything else):
- Buttons with LONG names (>50 chars) that include message preview text
- Names like "User avatar [name] [message preview snippet]..."
- Usually in a sidebar position or list container
- Has "Close", "Expand", "New message" buttons nearby
- Example: id:19 button "User avatar neel And 2) motherfuckers be taking yo" Y=507
- Action: Press Escape to close, THEN proceed with your goal

SEARCH RESULTS (IS a dropdown - CLICK one to navigate):
- LINKS (role=link, NOT buttons!)
- Names include follower counts, "Verified", profile descriptions
- Pattern: "username Info • 297K followers"
- Appear AFTER you typed something (check RECENT ACTIONS)
- Example: id:26 link "umichathletics Michigan Athletics • 297K followers" Y=466
- Action: CLICK the most relevant link to navigate to that profile

HOW TO REASON:
1. Check the ROLE: link vs button
2. Check the POSITION: top (stories) vs middle (dropdown) vs sidebar (messages)
3. Check the NAME LENGTH: short (stories) vs long with preview text (messages)
4. Check RECENT ACTIONS: did you just type? → links are probably search results
5. Check for CLOSE/EXPAND buttons nearby → something is open as overlay

EXAMPLE REASONING:
"I see buttons with 'User avatar' prefix and very long names including
message text like '...And 2) motherfuckers be taking yo'. These are message
thread previews, not stories. Stories would have short names at the top
of the screen. I should press Escape to close this messages panel."

EXAMPLE REASONING 2:
"I see links like 'umichathletics Michigan Athletics • 297K followers'.
These are LINKS (not buttons) with follower counts. I just typed 'michigan
athletics' in my recent actions. These are my search results!
I should click one to navigate to that profile."

SEARCH WORKFLOW (complete the flow!):
1. Type search term ✓
2. Look for LINKS appearing (not buttons!) with profile info and follower counts
3. CLICK a relevant link → This navigates to that profile
4. THEN browse that profile's content and capture screenshots

COMMON SEARCH FAILURE:
Typing → seeing result links → scrolling away or typing again
WHY: You never clicked a result, so you never navigated anywhere!
FIX: After typing, look for links with follower counts and CLICK one.

PROFILE EXPLORATION — REQUIRED WORKFLOW:
When you land on a profile page, this is your REQUIRED workflow:
1. Scroll down to see the profile's posts grid
2. Click the MOST RECENT post (top-left of grid) to open it in detail view
3. In the modal: read caption, navigate carousel slides, capture screenshots
4. Close modal (Escape), then click 2-4 MORE posts from the grid
5. Each opened post = capture the detail view (level 1 quality!)
6. Open AT LEAST 3 posts from any profile you visit
7. Only leave the profile after you've explored multiple posts in detail

COMMON PROFILE FAILURE:
Landing on profile → scrolling the grid → capturing grid screenshots → leaving
WHY: Grid screenshots are LOW VALUE (level 4). The real content is inside individual posts.
FIX: Click into posts to see full captions, all carousel slides, and comments (level 1).

OUTPUT FORMAT (JSON only):
{
  "reasoning": "Explain your decision",
  "action": "click|hover|scroll|type|press|clear|back|wait",
  "params": { ... },
  NOTE: For click/hover, params MUST include "expectedName" — the element name you expect to interact with.
  Example: "params": {"id": 5, "expectedName": "Search"}
  This prevents clicking the wrong element if you mix up IDs.
  "expectedOutcome": "What should happen",
  "confidence": 0.0-1.0,
  "capture": {
    "shouldCapture": true,
    "targetId": <element ID>,
    "reason": "Why this is worth capturing"
  },
  "strategic": {
    "switchPhase": "search"|"stories"|"feed"|null,
    "terminateSession": false,
    "captureNow": true,
    "lingerDuration": "short"|"medium"|"long"|"xlong",
    "engageDepth": "quick"|"moderate"|"deep"|null,
    "closeEngagement": false,
    "reason": "Strategic reasoning"
  }
}

STRATEGIC DECISION EXAMPLES:

1. Starting a session, want to search first:
{
  "reasoning": "Session just started, will search for user interests first",
  "action": "click",
  "params": {"id": 3, "expectedName": "Search"},
  "expectedOutcome": "Search panel opens",
  "strategic": {
    "switchPhase": "search",
    "lingerDuration": "short",
    "reason": "Beginning with search phase to find targeted content"
  }
}

2. Found interesting post in feed, clicking into it for detail view:
{
  "reasoning": "Post with 5.2K likes about coffee matches user interests — clicking to view full content in detail modal",
  "action": "click",
  "params": {"id": 15, "expectedName": "Photo by coffeelover"},
  "expectedOutcome": "Post modal opens with full caption, comments, and carousel",
  "strategic": {
    "engageDepth": "deep",
    "lingerDuration": "medium",
    "reason": "High-value content — will capture detail view and explore carousel slides"
  }
}

3. Content exhausted, switching phases:
{
  "reasoning": "Seeing repeated posts, time to watch stories",
  "action": "scroll",
  "params": {"direction": "up", "amount": "large"},
  "expectedOutcome": "Return to top to find stories",
  "strategic": {
    "switchPhase": "stories",
    "reason": "Feed content exhausted, trying stories"
  }
}

4. Session complete:
{
  "reasoning": "Collected 15 posts, watched 5 stories, time running low",
  "action": "wait",
  "params": {"seconds": 1},
  "expectedOutcome": "Session ends",
  "strategic": {
    "terminateSession": true,
    "reason": "Session goals achieved, time nearly up"
  }
}

5. Engaging deeply with an interesting post:
{
  "reasoning": "Post has 5,234 likes and is a carousel with 4 slides - worth exploring",
  "action": "click",
  "params": {"id": 12, "expectedName": "Photo by username"},
  "expectedOutcome": "Post modal opens for detailed view",
  "strategic": {
    "engageDepth": "moderate",
    "lingerDuration": "medium",
    "reason": "High engagement carousel, will navigate all slides"
  }
}

6. Navigating carousel in post modal:
{
  "reasoning": "On slide 2/4, interesting content continues",
  "action": "press",
  "params": {"key": "ArrowRight"},
  "expectedOutcome": "Move to slide 3",
  "strategic": {
    "captureNow": true,
    "lingerDuration": "short",
    "reason": "Capturing each carousel slide"
  }
}

7. Closing engagement and returning to feed:
{
  "reasoning": "Explored all 4 slides and read comments, done with this post",
  "action": "press",
  "params": {"key": "Escape"},
  "expectedOutcome": "Modal closes, return to feed",
  "strategic": {
    "closeEngagement": true,
    "reason": "Fully explored this post"
  }
}

Remember: YOU are in control. Make intelligent decisions about the entire session, not just individual actions. Engage deeply with interesting content - don't just scroll past everything!`;
    }

    /**
     * Build the user prompt with current context and elements.
     */
    private buildUserPrompt(
        context: NavigationContext,
        elements: NavigationElement[]
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
                goalDesc = 'Watch stories from followed accounts';
                break;
            case 'browse_feed':
                goalDesc = 'Browse the home feed and collect interesting posts';
                break;
            case 'explore_profile':
                goalDesc = `Explore profile: ${context.currentGoal.target} — open 3+ posts to capture full captions, carousel slides, and comments`;
                break;
            case 'analyze_account':
                goalDesc = 'Build a comprehensive digest — click into individual posts for full content. Scrolling the feed alone is not enough.';
                break;
            default:
                goalDesc = 'General browsing - YOU decide what to do';
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

        // Video state
        let videoStr = 'No video playing';
        if (context.videoState) {
            const vs = context.videoState;
            videoStr = vs.isPlaying
                ? `Playing: ${vs.currentTime.toFixed(1)}s / ${vs.duration.toFixed(1)}s`
                : 'Video paused';
        }

        // Content stats
        let contentStatsStr = 'No stats yet';
        if (context.contentStats) {
            const cs = context.contentStats;
            contentStatsStr = `Unique: ${(cs.uniquePostsRatio * 100).toFixed(0)}%, Ads: ${(cs.adRatio * 100).toFixed(0)}%, Quality: ${cs.engagementLevel}`;
        }

        return `YOU HAVE FULL STRATEGIC CONTROL. Decide what to do next.

CURRENT GOAL: ${goalDesc}

USER INTERESTS (topics the user cares about): ${interestsStr}

SESSION STATUS:
- Current activity: ${context.currentPhase || 'exploring'}
- Time: ${elapsedSec}s elapsed, ${remainingSec}s remaining (of ${targetSec}s total)
- Collected: ${context.postsCollected} posts, ${context.storiesWatched} stories
- Captures: ${context.captureCount || 0} screenshots taken

ACTIVITY HISTORY: ${phaseHistoryStr}

CURRENT STATE:
- URL: ${context.url}
- View: ${context.view}
- Video: ${videoStr}
- Content: ${contentStatsStr}
- Scroll position: ${context.scrollPosition !== undefined ? `${context.scrollPosition}px from top` : 'unknown'}
- Content freshness: ${context.elementFingerprint || 'unknown'}
${overlayInfo}
${this.formatTreeContext(context)}

ENGAGEMENT STATE:
${this.formatEngagementState(context)}
${context.sessionMemoryDigest ? `\nSESSION MEMORY (from past sessions):\n${context.sessionMemoryDigest}\n` : ''}
ACCESSIBILITY TREE (${elements.length} elements, grouped by container):
${elementsByContainer}

RECENT ACTIONS:
${recentActionsStr}
${context.loopWarning ? `\n⚠️ LOOP DETECTED (${context.loopWarning.severity}): ${context.loopWarning.reason}
WARNING #${context.loopWarning.consecutiveWarnings} — You are repeating actions with no effect. Change your approach NOW.
${context.loopWarning.consecutiveWarnings >= 2 ? 'CRITICAL: Auto-recovery will override your next action if you do not change strategy.' : ''}\n` : ''}
${this.buildDepthReminder(context)}
Make your decision. Include strategic decisions to signal captures, activity changes, or session termination.`;
    }

    /**
     * Build a depth reminder if the LLM has been scrolling without clicking into posts.
     */
    private buildDepthReminder(context: NavigationContext): string {
        const atFeedLevel = !context.engagementState || context.engagementState.level === 'feed';
        if (!atFeedLevel) return '';

        const recentScrollCount = context.recentActions
            .slice(-6)
            .filter(a => a.action === 'scroll')
            .length;

        if (recentScrollCount >= 3) {
            return `⚠️ DEPTH REMINDER: You've scrolled ${recentScrollCount} times without clicking into a post. Open a post to get high-quality detail captures instead of low-value feed screenshots.\n`;
        }
        return '';
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

        // Post metrics
        if (es.postMetrics) {
            const pm = es.postMetrics;
            const metrics = [];
            if (pm.likeCount) metrics.push(pm.likeCount);
            if (pm.commentCount) metrics.push(pm.commentCount);
            if (pm.hasVideo) metrics.push('has video');
            if (metrics.length > 0) {
                lines.push(`- Metrics: ${metrics.join(', ')}`);
            }
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
                parts.push(`  id:${e.id} ${e.role} "${e.name}" Y=${e.position.y}${hint}${depth}`);

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
        elements: NavigationElement[]
    ): Promise<NavigationDecision> {
        // If no elements, return scroll or wait
        if (elements.length === 0) {
            return this.fallbackDecision(context, elements, 'No elements visible');
        }

        try {
            const rawDecision = await this.callLLM(context, elements);

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
        elements: NavigationElement[]
    ): Promise<NavigationDecision> {
        const userPrompt = this.buildUserPrompt(context, elements);

        // Log the accessibility context being sent to LLM
        if (this.debug) {
            console.log('\n📊 === ACCESSIBILITY CONTEXT FOR LLM ===');
            console.log(userPrompt);
            console.log('========================================\n');
        }

        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.apiKey}`
            },
            body: JSON.stringify({
                model: this.model,
                messages: [
                    { role: 'system', content: this.getSystemPrompt() },
                    { role: 'user', content: userPrompt }
                ],
                response_format: { type: 'json_object' },
                max_tokens: this.maxTokens,
                temperature: this.temperature
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
            const targetElement = elements.find(e => e.id === clickParams.id);

            if (!targetElement) {
                return {
                    ...decision,
                    action: 'scroll',
                    params: { direction: 'down', amount: 'medium' } as ScrollParams,
                    reasoning: `Click target id=${clickParams.id} not found, scrolling instead`
                };
            }

            // Block interaction with forbidden elements (semantic hints)
            const forbiddenHints: SemanticHint[] = [
                'like_button', 'comment_button', 'share_button', 'save_button', 'follow_button'
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

            // Auto-add capture for post-like elements if LLM forgot to include it
            if (!decision.capture) {
                const nameLower = targetElement.name.toLowerCase();
                const isPostLike = nameLower.includes('photo') ||
                                  nameLower.includes('video') ||
                                  nameLower.includes('shared by') ||
                                  targetElement.containerRole === 'article';

                if (isPostLike) {
                    decision.capture = {
                        shouldCapture: true,
                        targetId: clickParams.id,
                        reason: `Auto-capture: clicked post element "${targetElement.name.slice(0, 30)}..."`
                    };
                    console.log(`📸 Auto-added capture for post click: id=${clickParams.id}`);
                }
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

        // Tier 2: Multiple failures - go back
        const recentFailures = recent.filter(a => !a.success).length;
        if (recentFailures >= 3) {
            return {
                reasoning: `Fallback: ${reason}. Multiple failures, navigating back.`,
                action: 'back',
                params: {} as BackParams,
                expectedOutcome: 'Return to previous page',
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
