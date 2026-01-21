/**
 * AnalysisGenerator - GPT-4 Content Synthesis
 *
 * Transforms raw Instagram content into a personalized newspaper-style analysis.
 * Uses GPT-4-turbo for high-quality, thoughtful synthesis.
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
     * Prepare content as a structured JSON array for strict data attribution.
     * Each item is an atomic unit that cannot be cross-pollinated.
     *
     * This format prevents the LLM from mixing up accounts or inventing narratives
     * by treating each post as an isolated, numbered object with explicit fields.
     */
    private prepareContentSummary(session: ScrapedSession): string {
        const items: Array<{
            id: number;
            handle: string;
            caption: string;
            image_description: string;
            content_type: string;
            source: string;  // 'search', 'feed', 'story', 'carousel', 'profile', 'highlight'
            interest?: string;  // Only for search results
        }> = [];

        let itemId = 1;

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

            const item: {
                id: number;
                handle: string;
                caption: string;
                image_description: string;
                content_type: string;
                source: string;
                interest?: string;
            } = {
                id: itemId++,
                handle: `@${post.username}`,
                caption: this.truncateCaption(cleanCaption),
                image_description: this.truncateCaption(post.visualDescription || ''),
                content_type: post.isVideoContent ? 'video' : 'image',
                source
            };

            if (interest) {
                item.interest = interest;
            }

            items.push(item);
        }

        // Process stories separately
        for (const story of session.storiesContent) {
            items.push({
                id: itemId++,
                handle: `@${story.username}`,
                caption: this.truncateCaption(story.caption || ''),
                image_description: this.truncateCaption(story.visualDescription || ''),
                content_type: story.isVideoContent ? 'video' : 'image',
                source: 'story'
            });
        }

        // Count sources for summary
        const searchCount = items.filter(i => i.source === 'search').length;
        const feedCount = items.filter(i => i.source === 'feed').length;
        const storyCount = items.filter(i => i.source === 'story').length;
        const otherCount = items.length - searchCount - feedCount - storyCount;

        // Format as structured data block with summary
        return `CONTENT ITEMS (${items.length} total):
- Search results: ${searchCount}
- Feed posts: ${feedCount}
- Stories: ${storyCount}
- Other (carousel/profile/highlight): ${otherCount}

${JSON.stringify(items, null, 2)}`;
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

        const prompt = `You are a FACTUAL REPORTER creating a news briefing for ${config.userName}.

═══════════════════════════════════════════════════════════════════════════════
CRITICAL DATA INTEGRITY RULES (VIOLATIONS = FAILURE)
═══════════════════════════════════════════════════════════════════════════════

1. ATOMIC UNITS: You will receive an array of content objects. Each object is ISOLATED.
   - NEVER combine data from different objects into the same bullet point
   - NEVER attribute @account_A's content to @account_B
   - If object #5 has a sunset photo and object #8 has a football game, they are SEPARATE items

2. HANDLE ACCOUNTABILITY: Every bullet MUST start with the exact handle from the data.
   - Format: "• @handle: [Specific fact from THIS object only]"
   - The handle anchors the bullet to its source - no exceptions

3. AD FILTERING: Skip these items entirely (do NOT report on them):
   - Generic advertisements (e.g., "Shop now", "Limited time offer", brand promotions)
   - Sponsored content unrelated to user interests
   - Empty or meaningless captions with stock photos
   - Exception: Ads that directly relate to user's interests (${interestsList})

4. JUST THE FACTS: Only report what is EXPLICITLY in the data.
   - If caption says "Great day" and image shows a lake, say "@handle: Posted a lake scene"
   - Do NOT invent meaning like "fostering lifelong connections" or "celebrating team spirit"
   - If you add context, it must be verifiable external knowledge (scores, dates, known events)

═══════════════════════════════════════════════════════════════════════════════
USER PROFILE
═══════════════════════════════════════════════════════════════════════════════

Name: ${config.userName}
Location: ${config.location || 'Not specified'}
Priority Interests: ${interestsList}

═══════════════════════════════════════════════════════════════════════════════
CONTENT DATA (ATOMIC OBJECTS)
═══════════════════════════════════════════════════════════════════════════════

${contentSummary}

═══════════════════════════════════════════════════════════════════════════════
OUTPUT FORMAT
═══════════════════════════════════════════════════════════════════════════════

BULLET FORMAT (MANDATORY):
• @handle: [Specific event/fact from this object]. [Brief external context if relevant].

EXAMPLES OF CORRECT ATTRIBUTION:

✅ CORRECT:
• @CalFootball: Posted "Class is in session" with a photo of the football facility. This aligns with the early signing period.
• @Warriors: Shared a locker room celebration video after tonight's win over the Lakers.
• @nytimes: Breaking news headline about the Fed's rate decision.

❌ WRONG (mixing objects):
• @CalFootball celebrated the Warriors' victory... (NEVER mix handles)
• @Warriors posted about football recruitment... (WRONG - mixing sources)

❌ WRONG (inventing narrative):
• @UniversityAccount: "Fostering lifelong connections through education" (if caption just said "Beautiful day on campus")
• @BrandAccount: "Celebrating innovation and pushing boundaries" (if it was just a product photo)

❌ WRONG (reporting ads):
• @BrandAccount: Promoting their new product line... (SKIP unless directly relevant to user interests)

SECTION STRUCTURE:

# [Title based on top story]
### [Key insight] — ${dayName}, ${dateStr}${config.location ? `, ${config.location}` : ''}

## 🎯 [Section for User Interests: ${interestsList}]
[4-6 bullets from items matching user interests, each starting with @handle]

## 🌍 [Section for General News]
[3-4 bullets from other newsworthy items, each starting with @handle]

## ⚡ Quick Hits
[2-3 single-line items for remaining notable content]

CROSS-REFERENCE RULES:
- Use the "caption" field for QUOTES and exact wording
- Use the "image_description" field for visual context
- Items with source="search" are HIGH PRIORITY (match user interests)
- Items with source="story" are ephemeral updates

Return valid JSON:
{
    "title": "string",
    "subtitle": "string",
    "sections": [
        {"heading": "string", "content": ["• @handle: Fact from object. Context.", "• @handle: Fact from object. Context."]},
        {"heading": "string", "content": ["• @handle: Fact from object. Context."]},
        {"heading": "string", "content": ["• @handle: Quick fact."]}
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
                model: 'gpt-4o',  // Best model for analysis
                messages: [{ role: 'user', content: prompt }],
                max_tokens: 2000,
                temperature: 0.3,  // Low for factual accuracy, strict attribution
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

        const content = data.choices[0]?.message?.content;

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
