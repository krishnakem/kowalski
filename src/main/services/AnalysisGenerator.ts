/**
 * AnalysisGenerator - LLM Content Synthesis
 *
 * Transforms raw Instagram content into a personalized newspaper-style analysis.
 * Uses LLM (see ModelConfig.analysis) for high-quality, thoughtful synthesis.
 *
 * Key principles:
 * - NO garbage fallback (if we can't generate quality, we don't generate)
 * - Token-aware content preparation (truncation to prevent blowout)
 * - Minimum content threshold (5+ posts required)
 * - Output compatible with existing GazetteScreen
 */

import { ScrapedSession, ExtractedPost, GeneratorConfig } from '../../types/instagram.js';
import { AnalysisObject } from '../../types/analysis.js';
import { UsageService } from './UsageService.js';
import { ModelConfig } from '../../shared/modelConfig.js';

// Token management constants
const MAX_CAPTION_LENGTH = 280;  // Tweet-length limit per caption
const MAX_TOTAL_CONTENT_CHARS = 8000;  // Safe for GPT-4 context

export class AnalysisGenerator {
    private apiKey: string;
    private usageService: UsageService;

    constructor(apiKey: string) {
        this.apiKey = apiKey;
        this.usageService = UsageService.getInstance();
    }

    /**
     * Generate a newspaper-style analysis from browsed Instagram content.
     * This is the MAIN entry point called by SchedulerService.
     *
     * @throws Error if generation fails (no fallback - transparent failure)
     */
    async generate(
        session: ScrapedSession,
        config: GeneratorConfig
    ): Promise<AnalysisObject> {
        // 1. Prepare content summary for LLM (with truncation)
        const contentSummary = this.prepareContentSummary(session);

        // 2. Generate analysis via GPT-4
        const analysis = await this.callGenerationAPI(contentSummary, config);

        // 3. Enrich with metadata
        return {
            ...analysis,
            date: new Date().toISOString(),
            location: config.location,
            scheduledTime: config.scheduledTime
        };
    }

    /**
     * Prepare content using explicit POST delimiters for strict atomic pairing.
     * Each post is wrapped in --- POST START --- / --- POST END --- tags
     * to prevent the LLM from mixing captions between posts.
     *
     * EXTRACTION RULE: The LLM is FORBIDDEN from borrowing data across POST boundaries.
     */
    private prepareContentSummary(session: ScrapedSession): string {
        const posts: string[] = [];
        let itemId = 1;
        let skippedCount = 0;

        // Process all feed content (includes search results, carousels, profiles, etc.)
        for (const post of session.feedContent) {
            const caption = post.caption || '';

            // Extract source tag and interest from caption prefix
            let source = 'feed';
            let interest: string | undefined;
            let cleanCaption = caption;

            // Parse content tags
            const searchMatch = caption.match(/\[SEARCH: ([^\]]+)\]/);
            const carouselMatch = caption.match(/\[CAROUSEL: ([^\]]+)\]/);
            const profileMatch = caption.match(/\[PROFILE: ([^\]]+)\]/);
            const highlightMatch = caption.match(/\[HIGHLIGHT: ([^\]]+)\]/);

            if (searchMatch) {
                source = 'search';
                interest = searchMatch[1];
                cleanCaption = caption.replace(/\[SEARCH: [^\]]+\]\s*/, '');
            } else if (carouselMatch) {
                source = 'carousel';
                cleanCaption = caption.replace(/\[CAROUSEL: [^\]]+\]\s*/, '');
            } else if (profileMatch) {
                source = 'profile';
                cleanCaption = caption.replace(/\[PROFILE: [^\]]+\]\s*/, '');
            } else if (highlightMatch) {
                source = 'highlight';
                cleanCaption = caption.replace(/\[HIGHLIGHT: [^\]]+\]\s*/, '');
            }

            // Saliency filter: Skip low-value content
            if (this.isLowSaliencyContent(cleanCaption, post.visualDescription || '', post.username)) {
                skippedCount++;
                continue;
            }

            const truncatedCaption = this.truncateCaption(cleanCaption);
            const truncatedImage = this.truncateCaption(post.visualDescription || '');

            // Build atomic POST block with explicit delimiters
            let postBlock = `--- POST START ---
ID: ${itemId++}
Handle: @${post.username}
Caption: ${truncatedCaption || '[No caption]'}
Image: ${truncatedImage || '[No description]'}
Content Type: ${post.isVideoContent ? 'video' : 'image'}
Source: ${source}`;

            if (interest) {
                postBlock += `\nInterest: ${interest}`;
            }

            postBlock += '\n--- POST END ---';
            posts.push(postBlock);
        }

        // Process stories separately
        for (const story of session.storiesContent) {
            // Saliency filter for stories
            if (this.isLowSaliencyContent(story.caption || '', story.visualDescription || '', story.username)) {
                skippedCount++;
                continue;
            }

            const truncatedCaption = this.truncateCaption(story.caption || '');
            const truncatedImage = this.truncateCaption(story.visualDescription || '');

            posts.push(`--- POST START ---
ID: ${itemId++}
Handle: @${story.username}
Caption: ${truncatedCaption || '[No caption]'}
Image: ${truncatedImage || '[No description]'}
Content Type: ${story.isVideoContent ? 'video' : 'image'}
Source: story
--- POST END ---`);
        }

        // Count sources for summary
        const searchCount = posts.filter(p => p.includes('Source: search')).length;
        const feedCount = posts.filter(p => p.includes('Source: feed')).length;
        const storyCount = posts.filter(p => p.includes('Source: story')).length;
        const otherCount = posts.length - searchCount - feedCount - storyCount;

        // Log if we skipped any low-value content
        if (skippedCount > 0) {
            console.log(`📋 Skipped ${skippedCount} low-saliency posts (ads, generic intros)`);
        }

        // Format with summary header
        return `CONTENT DATA (${posts.length} posts total, ${skippedCount} skipped):
- Search results: ${searchCount}
- Feed posts: ${feedCount}
- Stories: ${storyCount}
- Other (carousel/profile/highlight): ${otherCount}

${posts.join('\n\n')}`;
    }

    /**
     * Filter out low-saliency content that adds noise to the analysis.
     * Returns true if the content should be SKIPPED.
     */
    private isLowSaliencyContent(caption: string, imageDesc: string, username: string): boolean {
        const captionLower = caption.toLowerCase();
        const imageLower = imageDesc.toLowerCase();
        const combined = `${captionLower} ${imageLower}`;

        // Skip "Meet the Class" style intro posts (low signal)
        const introPatterns = [
            'meet the class',
            'welcome to the class',
            'introducing the class',
            'class of 20',
            'meet our new',
            'welcome our new',
            'join us in welcoming',
            'excited to introduce'
        ];
        if (introPatterns.some(p => combined.includes(p))) {
            return true;
        }

        // Skip generic commercial noise
        const adPatterns = [
            'shop now',
            'limited time',
            'use code',
            'link in bio',
            'swipe up',
            'click the link',
            'free shipping',
            'order now',
            'get yours',
            'don\'t miss out',
            'sale ends',
            '% off'
        ];
        // Only skip if it's mostly ad content (not mixed with real content)
        const adMatchCount = adPatterns.filter(p => combined.includes(p)).length;
        if (adMatchCount >= 2 && caption.length < 150) {
            return true;
        }

        // Skip empty content (no caption AND no meaningful image description)
        if (!caption.trim() && (!imageDesc.trim() || imageLower.includes('generic') || imageLower.includes('stock photo'))) {
            return true;
        }

        return false;
    }

    /**
     * Truncate caption to reasonable length, preserving meaning.
     */
    private truncateCaption(caption: string): string {
        if (!caption) return '';

        // Remove excessive whitespace and newlines
        const cleaned = caption.replace(/\s+/g, ' ').trim();

        if (cleaned.length <= MAX_CAPTION_LENGTH) {
            return cleaned;
        }

        // Truncate at word boundary
        const truncated = cleaned.slice(0, MAX_CAPTION_LENGTH);
        const lastSpace = truncated.lastIndexOf(' ');

        return (lastSpace > 200 ? truncated.slice(0, lastSpace) : truncated) + '...';
    }

    /**
     * Call GPT-4 to generate the newspaper-style analysis.
     * Uses Smart Brevity format with bullet points and insider context.
     */
    private async callGenerationAPI(
        contentSummary: string,
        config: GeneratorConfig
    ): Promise<Omit<AnalysisObject, 'date' | 'location' | 'scheduledTime'>> {
        const now = new Date();
        const dayName = now.toLocaleDateString('en-US', { weekday: 'long' });
        const dateStr = now.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

        // Format interests for emphasis
        const interestsList = config.interests.length > 0
            ? config.interests.map(i => `"${i}"`).join(', ')
            : 'General news and trends';

        const prompt = `You are a HIGH-DENSITY RESEARCH JOURNALIST and STRATEGIC INTELLIGENCE ANALYST creating a personalized briefing for ${config.userName}.

═══════════════════════════════════════════════════════════════════════════════
I. GROUNDING & FIDELITY RULES (VIOLATIONS = FAILURE)
═══════════════════════════════════════════════════════════════════════════════

EXTRACTION RULE (CRITICAL):
You are an extraction engine. You are FORBIDDEN from mixing data across POST boundaries.
Each post is wrapped in --- POST START --- / --- POST END --- delimiters.
If Post A has no caption, do NOT borrow the caption from Post B.
Use ONLY the data within the specific POST tags.

ATOMIC PAIRING:
- Each {Handle, Image, Caption} is an ISOLATED unit
- NEVER combine data from different POST blocks into the same bullet
- If Post #5 has a sunset and Post #8 has a football game, they are SEPARATE bullets

HANDLE-FIRST ATTRIBUTION:
- Every bullet MUST begin with **@handle** in bold
- Format: "• **@handle**: [Fact from THIS post only]. [Contextual Analysis if warranted]"
- The handle anchors the bullet to its source - no exceptions

NO HALLUCINATIONS:
- If a post has [No caption], describe only what's visible in the Image field
- If you add contextual analysis (trends, implications), label it as [Contextual Analysis: ...]
- NEVER invent meaning like "fostering lifelong connections" or "celebrating innovation"

═══════════════════════════════════════════════════════════════════════════════
II. ANALYSIS DEPTH (THE "SO WHAT?" PROTOCOL)
═══════════════════════════════════════════════════════════════════════════════

For HIGH-VALUE posts (search results, breaking news, user interests), apply 3-level analysis:

Level 1 - THE EVENT: What's literally in the pixels/caption
Level 2 - THE TREND: What 2026 theme does this connect to?
Level 3 - THE IMPLICATION: Why should the reader care?

Example of proper depth:
• **@applebees**: Launching the 'O-M-Cheese' burger for $11.99. [Contextual Analysis: This reflects casual dining's 2026 "Premium Value" pivot as chains fight fast-casual competition on price while maintaining perceived quality.]

For LOW-VALUE posts (generic updates, ephemeral stories), use Level 1 only:
• **@friend_account**: Shared a sunset photo from the beach.

═══════════════════════════════════════════════════════════════════════════════
III. NEGATIVE CONSTRAINTS (DO NOT)
═══════════════════════════════════════════════════════════════════════════════

❌ Do NOT use filler phrases: "The photo shows," "The caption says," "Interestingly,"
❌ Do NOT summarize 5 posts into 1 bland bullet
❌ Do NOT generate market analysis for student intro posts
❌ Do NOT report on generic ads (unless directly relevant to ${interestsList})
❌ Do NOT invent emotional narrative ("celebrating team spirit," "embracing the journey")
❌ Do NOT mix handles across bullet points

═══════════════════════════════════════════════════════════════════════════════
IV. USER PROFILE
═══════════════════════════════════════════════════════════════════════════════

Name: ${config.userName}
Location: ${config.location || 'Not specified'}
Priority Interests: ${interestsList}
Date: ${dayName}, ${dateStr}

═══════════════════════════════════════════════════════════════════════════════
V. CONTENT DATA (ATOMIC POST BLOCKS)
═══════════════════════════════════════════════════════════════════════════════

${contentSummary}

═══════════════════════════════════════════════════════════════════════════════
VI. OUTPUT STRUCTURE
═══════════════════════════════════════════════════════════════════════════════

BULLET FORMAT (MANDATORY):
• **@handle**: [Level 1 event]. [Level 2/3 contextual analysis if high-value].

SECTION STRUCTURE:

# [Compelling Title Based on Top Story]
### [Key Strategic Insight] — ${dayName}, ${dateStr}${config.location ? `, ${config.location}` : ''}

## 🎯 Strategic Interests: ${interestsList}
[4-6 bullets from search results and interest-matching posts]
[Apply full "So What?" Protocol - Levels 1-3]

## 🌍 Global Intelligence
[3-4 bullets from general newsworthy content]
[Cross-reference with current events where verifiable]

## ⚡ Lightning Round
[2-3 single-sentence quick hits for remaining notable content]
[Level 1 only - just the facts]

PRIORITY RULES:
- Posts with Source: search are HIGH PRIORITY (match user interests)
- Posts with Source: story are ephemeral (lower priority unless newsworthy)
- Posts with Interest: field should be featured prominently

EXAMPLES:

✅ CORRECT (with depth):
• **@CalFootball**: Posted "Class is in session" with a facility photo. [Contextual Analysis: This aligns with December's early signing period - Cal's 2026 class is ranked #18 nationally.]

✅ CORRECT (Level 1 only for low-value):
• **@personal_friend**: Shared a coffee shop photo in San Francisco.

❌ WRONG (mixing posts):
• **@CalFootball** celebrated the Warriors' victory... (NEVER mix handles across posts)

❌ WRONG (hallucinating):
• **@UniversityAccount**: "Fostering lifelong connections through education" (if caption just said "Beautiful day")

Return valid JSON:
{
    "title": "string",
    "subtitle": "string",
    "sections": [
        {"heading": "string", "content": ["• **@handle**: Fact. [Contextual Analysis: Trend and implication].", "• **@handle**: Fact."]},
        {"heading": "string", "content": ["• **@handle**: Fact with context."]},
        {"heading": "string", "content": ["• **@handle**: Quick fact."]}
    ]
}`;

        console.log('🤖 Generating analysis with GPT-4...');

        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.apiKey}`
            },
            body: JSON.stringify({
                model: ModelConfig.analysis,
                messages: [{ role: 'user', content: prompt }],
                max_completion_tokens: 16384,
                response_format: { type: 'json_object' }
            })
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            console.error('❌ Generation API error:', errorData);
            throw new Error('GENERATION_FAILED');
        }

        const data = await response.json();

        // Track usage
        if (data.usage) {
            await this.usageService.incrementUsage(data.usage);
            console.log(`💰 Generation cost tracked: ${data.usage.total_tokens} tokens`);
        }

        const rawContent = data.choices[0]?.message?.content;
        const content = typeof rawContent === 'string'
            ? rawContent
            : Array.isArray(rawContent)
                ? rawContent.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('')
                : '';

        if (!content) {
            throw new Error('GENERATION_FAILED');
        }

        try {
            const parsed = JSON.parse(content);

            // Validate structure
            if (!parsed.title || !parsed.sections || !Array.isArray(parsed.sections)) {
                throw new Error('Invalid response structure');
            }

            console.log('✅ Analysis generated successfully');

            return {
                title: parsed.title,
                subtitle: parsed.subtitle || '',
                sections: parsed.sections.map((s: any) => ({
                    heading: s.heading || 'Untitled Section',
                    content: Array.isArray(s.content) ? s.content : [s.content || '']
                }))
            };
        } catch (parseError) {
            console.error('❌ Failed to parse generation response:', parseError);
            throw new Error('GENERATION_FAILED');
        }
    }

    // NOTE: No generateFallback() method - we don't generate garbage content.
    // If generation fails, we notify the user and schedule a retry.
}
