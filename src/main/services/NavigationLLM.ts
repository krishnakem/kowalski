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

CORE PHILOSOPHY — CATALOG EVERYTHING:
Your job is to build a COMPLETE digest of the user's Instagram world. Capture EVERY post and story you encounter.
- On the FEED: capture EVERY post as you scroll. Don't skip posts. The digest should reflect the full feed.
- On STORIES: capture EVERY story frame. Stories are ephemeral — they disappear after 24h.
- On GRID views (profiles, explore, hashtags): thumbnails are too small — you MUST click them to open post modals before capturing.
- On profiles: click into posts to see full captions, carousel slides, and comments.
- The ONLY content to skip: ads/sponsored posts, "Suggested for you" panels, and loading states.

SESSION START PATTERN:
When a session begins and you're on the feed:
1. Scroll through feed posts — capture EVERY post you see (they're all part of the digest).
2. Watch stories — capture EVERY story frame.
3. Search for interest topics and visit relevant profiles for additional targeted content.
The feed and stories are cataloged completely. Interest searches add bonus targeted content on top.

CAPTURE PACING:
- Capture EVERY post on the feed and EVERY story frame — no selectivity needed.
- You should be capturing on almost every scroll action when on the feed.
- If you've scrolled 3+ times without a capture, you're missing content — capture more aggressively.
- Stories are your easiest captures — each frame is fresh, full-screen, and quick.

TIME ALLOCATION (proportional to session length — check SESSION STATUS for your total time):
- First ~40%: Scroll feed — click TIMESTAMP LINK on EVERY post to open detail page, capture, back, repeat
- 40-60%: Watch stories — capture EVERY story frame
- 60-80%: Search for topics (from SEARCH TOPICS), visit profiles, click into grid posts
- 80-100%: Return to feed for any remaining posts, wrap up, terminate

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

INSTAGRAM CONTENT LAYOUTS:

1. FEED LAYOUT (instagram.com/ home feed):
   Posts are visible as cards with image, truncated caption, and engagement counts.
   For EVERY feed post, you must open the POST DETAIL MODAL. Here's how to find the right element to click:

   HOW TO OPEN A FEED POST (try in this order):
   a) BEST: Find the TIMESTAMP LINK inside the article (e.g. link "1h", link "16h", link "2d", link "1w").
      This is a LINK (role=link) — it ALWAYS exists in every feed post and ALWAYS navigates to the post detail page.
   b) BACKUP: Find a link whose name contains "comments" (e.g. "View all 106 comments") → CLICK it.
      NOTE: This link does NOT exist on every post! Many posts only have a button with a bare number for comment count.
   c) LAST RESORT: Click the username link (e.g. link "username Verified") — goes to profile, then find the post there.

   ⚠️ DO NOT click BUTTONS with numbers like "390.2K", "663", "1.4K" — those are like/comment count BUTTONS that may not navigate.
   ⚠️ DO NOT click buttons named "Comment", "Like", "Share", "Save" — those are action buttons, not navigation.
   ⚠️ KEY DISTINCTION: Look for LINKS (role=link), not BUTTONS (role=button). Timestamp links are ALWAYS role=link.

   After the post detail page opens: capture it (captureNow: true), then press Back to return to feed, scroll to next post.
   DO NOT capture feed cards directly — always open the post detail first.

2. GRID LAYOUT (profile pages, explore page, hashtag pages, search result pages):
   Posts appear as SMALL THUMBNAILS in a grid (3 columns on profiles, mixed sizes on explore).
   - Thumbnails are too small to capture meaningfully — you MUST click one to open it.
   - Click a thumbnail (link or image with caption text) → post opens in a MODAL DIALOG.
   - Capture the content inside the modal, then close it (press Escape or click Close) and click the next thumbnail.
   - Grid thumbnails in the accessibility tree look like: link "Caption text..." at consistent Y positions in rows of 3.

RULE: On the FEED → for each post, click the TIMESTAMP LINK (e.g. link "16h", link "2d") inside the article → capture the post detail page → Back → scroll to next.
RULE: On GRID views (profile, explore, hashtag) → click thumbnails to open post modals, capture, close, next.

PATTERN RECOGNITION:
- Multiple small buttons with usernames = carousel (stories, suggestions)
- Buttons inside "article" containers = post interaction buttons
- textbox inside "dialog" = input field in modal/popup
- Use siblingCount to understand clusters

ELEMENT IDENTIFICATION QUICK REFERENCE:
| What you want to do              | What to look for in the tree                                    |
|----------------------------------|-----------------------------------------------------------------|
| Open a feed post detail          | BEST: timestamp link (role=link, name "1h","16h","2d","1w") — ALWAYS present. BACKUP: link with "comments" in name (not always present). NEVER click buttons with numbers. |
| Open a post from a grid          | link "Caption text..." or image with caption → CLICK this       |
| Watch a story                    | button with "story" in name, or "not seen" → CLICK this        |
| Search for a topic               | link "Search" in sidebar, then textbox "Search input"           |
| Close a modal/overlay            | button "Close" or press Escape                                  |
| Navigate carousel in modal       | button "Next" / "Go Back", or press ArrowRight/ArrowLeft        |
| Go to someone's profile          | link "[username]" — the text username link, not the avatar      |
| Skip suggested accounts          | Scroll past any section with button "Follow" elements           |

HOW TO IDENTIFY CLICKABLE ELEMENTS INSIDE A FEED ARTICLE:
Inside each article container, you'll typically see these elements:
- link "16h" (or "1h", "2d", "1w") → TIMESTAMP LINK — ✅ CLICK THIS to open post detail. Always present, always works.
- link "username Verified" (or just "username") → USERNAME LINK — goes to profile page
- button "390.2K" (large number) → LIKE COUNT button — ❌ DO NOT CLICK (won't navigate)
- button "663" (smaller number) → COMMENT COUNT button — ❌ DO NOT CLICK (it's a button, may not navigate)
- button "Comment" → comment icon — ❌ DO NOT CLICK (action button)
- button "Like" → like icon — ❌ FORBIDDEN
- button "Share" → share icon — ❌ FORBIDDEN
- button "Save" → save icon — ❌ FORBIDDEN

KEY RULE: Only click LINKS (role=link), not BUTTONS (role=button). The timestamp link is your primary navigation tool on the feed.
On SOME posts, a "View all X comments" LINK may exist — if you see it, you can click it too. But don't count on it being there.

CLICK RECOVERY — if a click produces "no state change detected":
- Do NOT click the same element again. It will fail again.
- Try the TIMESTAMP LINK in the same article — it's always a link (role=link) with a time name like "1h", "2d"
- If 2 different elements both fail, scroll to the next post and try there
- Remember: only LINKS navigate. BUTTONS with numbers are like/comment counts and don't navigate.

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
- Caption: Post caption text (first 100 chars)
- Engagement: Like counts, comment counts
- Tags: Extracted hashtags
- Alt: Image description/alt text

CAPTURE RULES BY CONTEXT:
✅ ANY feed post → CAPTURE IT (the digest catalogs the FULL feed — no filtering)
✅ ANY story frame → CAPTURE IT (stories are ephemeral — capture ALL of them)
✅ Search results / profile posts → capture posts relevant to your search topic
❌ Sponsored/ad content → skip (don't capture)
❌ "Suggested for you" panels → skip (not real posts)

IMPORTANT: User interests are SEARCH TOPICS ONLY. Do NOT use them to decide what to capture on the feed or stories. On the feed, capture EVERY post. On stories, capture EVERY frame. Interests are ONLY used during the search phase to decide what to search for and which search result posts to capture.

TIMESTAMP RECENCY (from link elements like "1h", "2d", "1w" inside articles):
Recency helps you prioritize when SEARCHING for content on profiles/explore:
- Minutes/hours (1m, 30m, 1h, 3h) = very fresh, highest priority for search results
- 1-3 days (1d, 2d, 3d) = recent, good for search results
- 4-7 days (4d, 5d, 6d, 1w) = borderline for search, only if highly relevant
- 2+ weeks (2w, 4w, 12w, 90w) = STALE for search — skip on profiles/explore

BUT on the HOME FEED: capture ALL posts regardless of timestamp. Instagram's algorithm already curates the feed — whatever appears is worth cataloging.

EXAMPLE: Search topics: ["coffee", "travel", "photography"]
- Any feed post → CAPTURE (the digest catalogs everything on the feed — no filtering by topics)
- Any story → CAPTURE (ephemeral content, always catalog — no filtering by topics)
- During search phase: search "coffee", visit profile, capture recent posts about coffee from their grid
- Profile post 2+ weeks old → skip on profiles, it's stale

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

3. CAPTURE CONTROL - You decide WHAT to screenshot and HOW it's framed:
   ⚠️ CAPTURES DO NOT HAPPEN AUTOMATICALLY. You MUST explicitly include "strategic": {"captureNow": true} in your JSON output.
   If you don't include captureNow: true, NO screenshot is taken — no matter what you write in "reasoning".
   - To capture the FULL VIEWPORT: set strategic.captureNow = true.
     Use this for: detail modals, story frames, profile overviews.
   - To capture a SPECIFIC ELEMENT: set capture.targetId to the element's id number.
     The screenshot will crop tightly to that element's bounding box.
   - EVERY TIME you see a detail modal open, your VERY NEXT action must include strategic.captureNow = true.
   ⚠️ captureNow is a ONE-SHOT signal. Send it ONCE per post/story, then IMMEDIATELY move on (back/scroll/next).
   NEVER send captureNow twice for the same content. The screenshot is taken instantly — retrying wastes time.

4. PACING CONTROL - You decide how long to linger:
   - "lingerDuration": "short" (1s) | "medium" (3s) | "long" (6s) | "xlong" (12s)
   - Use "long" for interesting content, "short" for navigation

WHEN TO TERMINATE:
- ✅ Time is almost up (< 30 seconds remaining)
- ✅ Content is exhausted (seeing lots of duplicates)
- ✅ Collected enough content (good variety of captures)
- ✅ Stuck and can't recover

CAPTURE EVERYTHING RULE:
⚠️ Captures require explicit "strategic": {"captureNow": true} in your JSON. Nothing is captured automatically!
⚠️ captureNow is ONE-SHOT: send it ONCE, screenshot is taken instantly, then MOVE ON. Never retry for the same content.
- FEED POSTS: click TIMESTAMP LINK → wait+captureNow (ONE TIME) → back() → scroll. Four actions per post, no more.
- STORIES: Each frame → ONE captureNow, then advance (click right/ArrowRight/wait for auto-advance) → captureNow next frame → repeat
- POST MODALS (from grid): As soon as modal is open → ONE captureNow → Escape → next thumbnail
- CAROUSEL SLIDES: Navigate to slide → ONE captureNow → next slide
- PROFILE GRID overview: ONE captureNow as overview
❌ NEVER: send captureNow twice for the same content, wait repeatedly on a post detail page, or retry captures
❌ NEVER capture: navigation screens, loading states, empty feeds, "Suggested for you" panels, ads, feed card views

CAPTURE FRAMING:
All post captures should be from the POST DETAIL view (image left, caption+comments right).
- For feed posts: click timestamp link → post detail page opens → use strategic.captureNow for full viewport capture.
- For grid posts: click thumbnail → modal opens → use strategic.captureNow for full viewport capture.
- For stories: use strategic.captureNow for full viewport capture.
- You can also use capture.targetId on the dialog or article element for cropped captures.
- NEVER capture feed card views — always open the post detail first.

VIDEO HANDLING:
When you see a video playing (videoState in context):
- Decide how long to watch based on content type
- Use lingerDuration: "long" for interesting videos, "short" for ads
- Capture multiple frames by staying on video (system auto-captures)

ADS:
- Ads rarely contain useful content — skip them entirely.
- Sponsored indicators: "Sponsored", "Paid partnership", "Shop now", "Learn more"
- Use lingerDuration: "short" and scroll past

FORBIDDEN ACTIONS:
- NEVER click: like_button, share_button, save_button, follow_button
- Read-only browsing only
- NOTE: Clicking LINKS to navigate (timestamps, "View all X comments") is ALLOWED and REQUIRED. The forbidden actions are only POSTING comments, liking, sharing, etc.

STAGNATION DETECTION AND RECOVERY:
Check RECENT ACTIONS for these failure patterns and apply the correct fix:

1. SCROLL STUCK (scrollY unchanged across 2+ scrolls):
   → A modal/overlay may be intercepting scroll events, OR scroll focus was lost after back() navigation.
   → Fix #1: Press Escape to close any overlay, then retry scroll.
   → Fix #2: If no overlay is visible, click on any element in the main content area (an article, an image) to restore scroll focus, then retry scroll.

2. CLICK DID NOTHING on feed (no_change_detected):
   → You probably clicked a BUTTON instead of a LINK. Buttons with numbers (like "390.2K", "663") don't navigate.
   → Fix: Find the TIMESTAMP LINK (role=link, name like "1h", "16h", "2d") in the same article. This ALWAYS works.
   → If the timestamp link also fails, scroll to the next post and try there.
   → NEVER click buttons with numbers — those are like/comment count buttons that don't navigate.

3. CLICK DID NOTHING on grid (clicking thumbnail, no_change_detected):
   → You may have clicked a non-interactive element (container, decorative image).
   → Fix: Find the link element with caption text — that's the clickable thumbnail. Click THAT.

4. STUCK IN CAPTURE LOOP (sending wait+captureNow repeatedly on the same post):
   → The capture was ALREADY TAKEN on the first captureNow. Retrying does nothing — the dedup system blocks duplicate screenshots.
   → Fix: IMMEDIATELY send back() to return to the feed. Then scroll to the next post.
   → The 4-step rhythm is: click → wait+captureNow → back → scroll. If you've done 2+ waits in a row, you're stuck.

5. REOPENED SAME POST (clicked a timestamp you already captured):
   → After back(), the feed is at the SAME scroll position — the post you just captured is STILL the first visible post.
   → You forgot step 4 (scroll). You MUST scroll down BEFORE clicking any timestamp link.
   → Fix: IMMEDIATELY back() if you're on the post detail page again, then scroll(down, medium) to move past it.
   → Check RECENT ACTIONS: if your last sequence was click→capture→back→click (missing scroll), you're in this loop.
   → CORRECT sequence: click → capture → back → SCROLL → click next. The scroll is MANDATORY.

6. STUCK IN LOOP (same actions repeating 3+ times):
   → Switch strategy completely. If feed isn't working, search for a specific account.
   → If search isn't working, go to a known profile directly.
   → If a profile is exhausted, try a different one.

7. CONTENT NOT LOADING (tree looks sparse after navigation):
   → Use wait(2) to let content load. Instagram loads images lazily.

8. FEED IS STALE (only old timestamps visible like 2w, 3w):
   → Scroll past old content or switch to a different content source.
   → Search for an account that posts frequently for fresher content.

9. SCROLL IN MODAL (you scrolled but feed position didn't change):
   → If RECENT ACTIONS shows "scrolled in dialog", your scroll moved content INSIDE a modal/dialog, NOT the main feed.
   → Fix: Close the modal first — use back() if the URL changed when you opened it, or press Escape for overlay dialogs.
   → After closing the modal, THEN scroll the feed.

CONTENT COLLECTION — TWO MODES:

MODE 1: FEED (home feed at instagram.com/)
For EVERY feed post, follow this EXACT 4-step loop. Each step is ONE action — do them in strict sequence:

STEP 1 (action: click): FIND the TIMESTAMP LINK inside the article and CLICK it.
   - Look for a link (role=link) with a short time name: "1h", "16h", "2d", "3d", "1w"
   - This is the MOST RELIABLE element — it ALWAYS exists in every feed post
   - Click the timestamp link → post detail page opens (URL changes)
STEP 2 (action: wait): CAPTURE — include "strategic": {"captureNow": true}. The screenshot is taken INSTANTLY.
   - Send wait(1) with captureNow: true. ONE time. The capture happens immediately.
STEP 2.5 (CAROUSEL ONLY — check BEFORE going back): If the post has multiple slides (look for "Next" button, "Go Back" button, or slide indicator like "1/4" in the accessibility tree), navigate through ALL slides:
   - press(ArrowRight) + wait(1) with captureNow: true → captures slide 2
   - Repeat ArrowRight + captureNow for each additional slide until you've seen them all
   - The engagementState.carouselState tells you current position (e.g., "Slide 2/5")
   - Skip this step if no carousel indicators are visible
STEP 3 (action: back): RETURN to feed after capturing all slides (or immediately after step 2 if not a carousel).
   - Send back() to return to the feed.
STEP 4 (action: scroll): SCROLL DOWN before clicking anything. This step is MANDATORY — without it you will click the SAME post again.
   - After back(), the feed is at the EXACT SAME scroll position. The post you just captured is STILL visible.
   - You MUST scroll(down, medium) to move the captured post off-screen and bring the NEXT post into view.
   - Only AFTER scrolling should you look for the next timestamp link to click.

⚠️ CRITICAL: captureNow is a ONE-SHOT signal. You send it ONCE, the screenshot is taken, then you IMMEDIATELY back().
⚠️ DO NOT send captureNow multiple times for the same post. If you already sent it, the capture already happened — MOVE ON.
⚠️ If captures count in SESSION STATUS didn't increase, the capture was filtered as a duplicate — still MOVE ON. Never retry.
⚠️ The sequence is ALWAYS: click → wait+captureNow → back → SCROLL → click next. Four actions, then repeat. NEVER skip the scroll.
⚠️ After back(), you MUST scroll BEFORE clicking. If you click without scrolling, you will reopen the same post.

⚠️ DO NOT CLICK BUTTONS WITH NUMBERS: Elements like button "390.2K" or button "663" are like/comment count BUTTONS — they are NOT links and may not navigate.

⚠️ IF A CLICK FAILS ("no state change detected"): do NOT retry the same element. Try a DIFFERENT link in the article, or scroll to the next post.

MODE 2: GRID (profile pages, explore, hashtag pages)
Posts appear as SMALL THUMBNAILS — too small to capture meaningfully.
- You MUST click a thumbnail (link or image with caption text) to open the post in a modal dialog.
- In the modal: capture, navigate carousel slides (ArrowRight/ArrowLeft), capture each slide.
- Close modal (Escape or "Close" button) and click the next thumbnail.
- Aim to open 3+ posts per profile grid visit.

MODE 3: STORIES (full-screen story viewer)
Stories auto-play — your job is to capture EVERY frame as it plays:
- STEP 1: Click a story circle (button with username) from the stories row at the top of the feed.
- STEP 2: Story viewer opens full-screen. IMMEDIATELY send wait(1) + captureNow: true to capture this frame.
- STEP 3: Advance to next frame — click the right side of the screen, press ArrowRight, or just wait (stories auto-advance).
- STEP 4: captureNow: true again for the new frame. Repeat steps 3-4 for every frame.
- STEP 5: When the story viewer closes (no more stories), you're back on the feed. Continue with feed posts.
⚠️ Stories are ephemeral (disappear after 24h) — capture EVERY frame, don't skip any.
⚠️ Each frame needs its own captureNow: true. One capture per frame, then advance.
⚠️ If a story is a video, use captureNow immediately (captures current frame). Don't wait for it to finish.

ENGAGEMENT LEVELS:
1. FEED LEVEL: Scrolling feed — for each post, click the TIMESTAMP LINK to open post detail, capture, back, scroll next
2. GRID LEVEL: On a profile/explore/hashtag page — click thumbnails to open modals
3. POST DETAIL LEVEL: On a post detail page or modal — capture (captureNow: true!), browse carousel, back/close
4. PROFILE LEVEL: Clicked on a username — explore their content grid, click into their posts
5. STORY LEVEL: In story viewer — captureNow each frame, advance to next, repeat until stories end

WHEN TO CLICK A THUMBNAIL (grid views only — NOT the feed):
✅ Content relevant to your current search topic (keywords in caption/username match)
✅ High engagement visible (many likes/comments)
✅ Carousel post (slide indicators like "1 of 4") — extra valuable, multiple images
✅ Recent timestamp visible (1h, 1d, 2d — NOT weeks old)
❌ Already explored this post (check deeplyExploredPosts count)
❌ Ad or sponsored content
❌ Posts older than 1 week (stale content on profiles)

FEED POST WORKFLOW:
1️⃣ click(timestamp link) → URL changes, post detail page opens
2️⃣ wait(1) + captureNow: true → screenshot taken INSTANTLY (ONE TIME ONLY)
2️⃣.5 IF CAROUSEL: press(ArrowRight) + captureNow for EACH additional slide (check for "Next" button or slide indicators in the tree)
3️⃣ back() → returns to feed (same scroll position — captured post is STILL visible!)
4️⃣ scroll(down, medium) → MANDATORY: moves past captured post, brings NEXT post into view, THEN repeat from 1️⃣
⚠️ Step 4 is NOT optional. After back(), you are looking at the SAME post. If you skip scroll, you WILL click the same post again.

✅ The deduplication system handles duplicates — just capture once and move on
✅ Carousel posts: ALWAYS navigate ALL slides with ArrowRight and captureNow each one before going back
❌ Ads / "Sponsored" posts → skip (scroll past)
❌ "Suggested for you" panels → skip (scroll past)
❌ NEVER send captureNow more than once per post — the screenshot is instant
❌ NEVER click BUTTONS with numbers (like "390.2K", "663") — those don't navigate

POST MODAL (appears after clicking a thumbnail on a profile/explore/hashtag grid):
The modal is a "dialog" container overlaying the page. Layout:
- LEFT SIDE: Full-size image or video. If it's a carousel, you'll see "Next"/"Go Back" buttons or can press ArrowRight/ArrowLeft to advance slides.
- RIGHT SIDE: Username, full caption (not truncated like feed), full comments list, engagement buttons, timestamp at bottom.
- CLOSE: button "Close" in top-right, or press Escape. Returns you to the grid.

CAPTURING IN A MODAL:
- Use strategic.captureNow for full viewport capture (gets image + caption + comments).
- Or use capture.targetId on the main image element for a focused image capture.
- For carousels: advance through slides with Next/ArrowRight, capture each interesting slide separately.

IMPORTANT: After capturing, CLOSE the modal (Escape) and click the NEXT thumbnail. Don't stay in one modal forever.

ENGAGEMENT DEPTH (for modal interactions — applies to BOTH feed and grid):
- "quick": Open post, capture modal, close (5-10 seconds) — DEFAULT for feed posts
- "moderate": Open post, capture, browse carousel slides, close (10-20 seconds)
- "deep": Open post, capture all slides, read comments, maybe visit profile (20-40 seconds)
For feed posts: always open via timestamp link → capture (captureNow: true) → back(). Use "quick" depth unless it's a carousel (then "moderate").

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

PROFILE EXPLORATION:
When you land on a profile page:
1. Scroll down to see the profile's posts grid
2. Click a recent post (top-left of grid) to open it in detail view
3. In the modal: read caption, navigate carousel slides, capture screenshots
4. Close modal (Escape), then click more posts from the grid
5. Each opened post = high-quality capture
6. Only leave the profile after you've explored posts in detail — use your judgement on how many based on time remaining

COMMON PROFILE FAILURE:
Landing on profile → scrolling the grid → capturing grid thumbnails → leaving WITHOUT opening any posts
WHY: Grid thumbnails are too small. The real content is inside individual posts opened as modals.
FIX: Click thumbnails to open modals — see full captions, all carousel slides, and comments.

OUTPUT FORMAT (JSON only):
{
  "reasoning": "Explain your decision",
  "action": "click|hover|scroll|type|press|clear|back|wait",
  "params": { ... },
  NOTE: For click/hover, params MUST include "expectedName" — copy the EXACT element name from the ACCESSIBILITY TREE.
  ⚠️ DO NOT invent or copy names from examples — use the ACTUAL name shown in the tree for that element ID.
  Example: If tree shows id:42 link "View all 106 comments", use "params": {"id": 42, "expectedName": "View all 106 comments"}
  If the name doesn't match, the click will be REJECTED.
  "expectedOutcome": "What should happen",
  "confidence": 0.0-1.0,
  "capture": {
    "shouldCapture": true,
    "targetId": 12,
    "reason": "Post detail modal open — capture for the digest"
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

1. Starting a session on the feed — open the first post via TIMESTAMP LINK:
(You MUST replace the id and expectedName with ACTUAL values from the accessibility tree!)
{
  "reasoning": "Session started. Inside the first article, I see the timestamp link (role=link). Clicking to navigate to post detail page.",
  "action": "click",
  "params": {"id": "[ACTUAL ID OF TIMESTAMP LINK]", "expectedName": "[ACTUAL TIMESTAMP e.g. '16h' or '2d']"},
  "expectedOutcome": "Navigates to post detail page",
  "strategic": {
    "switchPhase": "feed",
    "engageDepth": "quick",
    "lingerDuration": "short",
    "reason": "Opening first feed post via timestamp link"
  }
}

2. Alternative — using "View all X comments" link if it exists (not always present):
{
  "reasoning": "I see a link with 'comments' in the name inside this article. Clicking to open detail.",
  "action": "click",
  "params": {"id": "[ACTUAL ID]", "expectedName": "[ACTUAL NAME e.g. 'View all 106 comments']"},
  "expectedOutcome": "Post detail opens",
  "strategic": {
    "engageDepth": "quick",
    "lingerDuration": "short",
    "reason": "Opening feed post via comments link"
  }
}

2b. STEP 2 — Capture (ONE TIME, then immediately proceed to step 2c):
{
  "reasoning": "Post detail page is open — capturing NOW, then immediately going back",
  "action": "wait",
  "params": {"seconds": 1},
  "expectedOutcome": "Screenshot taken, next action will be back()",
  "capture": {
    "shouldCapture": true,
    "reason": "Feed post detail — full view for digest"
  },
  "strategic": {
    "captureNow": true,
    "lingerDuration": "short"
  }
}
⚠️ After this action, your VERY NEXT output MUST be back(). Do NOT send another wait or captureNow.

2c. STEP 3 — Back to feed (IMMEDIATELY after 2b, no extra waits):
{
  "reasoning": "Capture taken — going back to feed for next post",
  "action": "back",
  "params": {},
  "expectedOutcome": "Returns to feed at same scroll position — must scroll before clicking",
  "strategic": {
    "closeEngagement": true
  }
}

2d. STEP 4 — Scroll to next post (MANDATORY after back, before clicking anything):
{
  "reasoning": "Back on feed — same post is still visible. Must scroll down to bring the NEXT post into view before clicking its timestamp.",
  "action": "scroll",
  "params": {"direction": "down", "amount": "medium"},
  "expectedOutcome": "Next uncaptured post becomes visible, ready to click its timestamp link",
  "strategic": {
    "lingerDuration": "short"
  }
}
⚠️ After this scroll, look for the NEXT timestamp link (a different one than you just clicked) and go back to step 2a.

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
  "reasoning": "Good variety of content captured, time running low",
  "action": "wait",
  "params": {"seconds": 1},
  "expectedOutcome": "Session ends",
  "strategic": {
    "terminateSession": true,
    "reason": "Session goals achieved, time nearly up"
  }
}

5. On a profile grid, clicking a thumbnail to open it in a modal:
(Replace id and expectedName with ACTUAL values from the tree!)
{
  "reasoning": "Profile grid — tree shows a link with caption text. Clicking to open in modal.",
  "action": "click",
  "params": {"id": "[ACTUAL ID]", "expectedName": "[ACTUAL NAME FROM TREE]"},
  "expectedOutcome": "Post modal opens with full image, caption, and comments",
  "strategic": {
    "engageDepth": "moderate",
    "lingerDuration": "medium",
    "reason": "Opening grid post for full detail capture"
  }
}

6. Navigating carousel in post modal (capture each slide by targeting the article element):
{
  "reasoning": "On slide 2/4, interesting content continues — capture this slide",
  "action": "press",
  "params": {"key": "ArrowRight"},
  "expectedOutcome": "Move to slide 3",
  "capture": {
    "shouldCapture": true,
    "targetId": 8,
    "reason": "Carousel slide 2/4 — crop to the article element for this slide"
  },
  "strategic": {
    "lingerDuration": "short",
    "reason": "Navigating carousel slides"
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

CRITICAL REMINDERS:
1. CAPTURE IS NOT AUTOMATIC. You MUST include "strategic": {"captureNow": true} for EVERY screenshot. No captureNow = no screenshot.
2. Feed post flow: click TIMESTAMP LINK → wait+captureNow → (if carousel: ArrowRight+captureNow each slide) → back() → SCROLL. Then repeat.
3. captureNow is ONE-SHOT per slide. Send it ONCE per slide/frame, then move to next slide or back(). The screenshot is instant.
4. The expectedName MUST be the EXACT name from the accessibility tree below. Do NOT copy names from these examples.
5. Only click LINKS (role=link) to navigate. BUTTONS with numbers (e.g., button "390.2K", button "663") are like/comment counts — they do NOT navigate.
6. If a click produces "no state change detected", NEVER retry the same element. SCROLL DOWN to the next post and try its timestamp link.
7. Feed and stories: capture EVERYTHING. Search topics are ONLY for the search phase.
8. After clicking a timestamp link, you navigate to a NEW PAGE — use back() to return (not Escape).
9. If you find yourself sending wait+captureNow more than once on the same page, STOP — the capture already happened. Send back() immediately.
10. After back(), ALWAYS SCROLL before clicking any timestamp. The feed is at the SAME scroll position — the post you just captured is still visible. Clicking without scrolling will reopen the same post.
11. Stories: capture EVERY story frame with captureNow as it plays. Click Next/tap right side to advance to next frame, captureNow again. Repeat until stories end.
12. NEVER use back() when you are on the feed. back() navigates to the PREVIOUS browser page, which may be outside Instagram. Only use back() from a POST DETAIL page to return to the feed. If you need to recover on the feed, SCROLL or click the Home/Instagram link in the navigation sidebar.
13. CAROUSEL POSTS: After opening a post detail page, check for "Next"/"Go Back" buttons or slide indicators. If present, press ArrowRight + captureNow for EACH slide before going back. Don't leave carousel content uncaptured.`;
    }

    /**
     * Build a dynamic progress audit from the current context.
     * Analyzes recent actions and state to produce targeted warnings
     * that help the LLM recognize when it's stuck and redirect.
     */
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
                warnings.push(`⚠️ LOW CAPTURE RATE: Only ${context.captureCount || 0} captures in ${elapsedMin} minutes. You should have ~${elapsedMin * 2}+. Follow the 4-step rhythm strictly: click timestamp → wait+captureNow → back → scroll.`);
            }
        }

        // 4. Scroll-in-dialog detection (from recent action feedback)
        const lastAction = recentActions[recentActions.length - 1];
        if (lastAction?.verified === 'scrolled_in_dialog') {
            warnings.push(`⚠️ SCROLL IN MODAL: Your last scroll happened INSIDE a modal/dialog, NOT the main feed. The feed did not move. Close the modal first (back() if URL changed, or Escape for overlay), THEN scroll the feed.`);
        } else if (context.engagementState?.level === 'post_modal') {
            warnings.push(`📍 MODAL OPEN: You are inside a post modal. If you scroll, it will scroll within the modal, NOT the feed. To return to feed: use back() if URL changed, or press Escape.`);
        }

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
        if (recentClickFailures.length >= 2 && (context.view === 'feed' || context.view === 'unknown')) {
            warnings.push(`⚠️ CLICK FAILURES: ${recentClickFailures.length} clicks with no navigation. The post you're clicking may already be captured or the link is stale. SCROLL DOWN to bring a FRESH post into view, then click ITS timestamp link. Do NOT use back() — you are already on the feed.`);
        }

        // 7. Warn against back() when on the feed (it leaves Instagram)
        if (context.view === 'feed' || context.view === 'unknown') {
            const lastWasBack = lastAction?.action === 'back';
            if (lastWasBack) {
                warnings.push(`⚠️ DANGEROUS BACK: You just used back() while on the feed. This navigated AWAY from Instagram. NEVER use back() on the feed — it goes to the previous browser page (outside Instagram). Use scroll, click elements, or click the Home link to navigate.`);
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
                goalDesc = 'Watch stories — capture EVERY frame with captureNow: true, then advance to next frame, repeat';
                break;
            case 'browse_feed':
                goalDesc = 'Browsing the home feed — capture EVERY post (click TIMESTAMP LINK → post detail page → captureNow: true → back → next)';
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

        // Video state
        let videoStr = 'No video playing';
        if (context.videoState) {
            const vs = context.videoState;
            videoStr = vs.isPlaying
                ? `Playing: ${vs.currentTime.toFixed(1)}s / ${vs.duration.toFixed(1)}s`
                : 'Video paused';
        }

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

        return `YOU HAVE FULL STRATEGIC CONTROL. Decide what to do next.

CURRENT GOAL: ${goalDesc}

SEARCH TOPICS (use ONLY during search phase — NOT for filtering feed/stories): ${interestsStr}

SESSION STATUS:
- Current activity: ${context.currentPhase || 'exploring'}
- Time: ${elapsedSec}s elapsed, ${remainingSec}s remaining (of ${targetSec}s total)
- Collected: ${context.postsCollected} posts, ${context.storiesWatched} stories
- Captures: ${context.captureCount || 0} screenshots taken
${this.buildProgressAudit(context)}
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
