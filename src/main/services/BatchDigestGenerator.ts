/**
 * BatchDigestGenerator - Screenshot-First Digest Generation
 *
 * Generates a comprehensive digest from all captured screenshots in ONE API call.
 * Uses GPT-4o Vision with multiple images for full visual context.
 *
 * Key principles:
 * - Single API call with all screenshots (no fragmented extraction)
 * - LLM sees actual visual content (not extracted descriptions)
 * - Strategic Intelligence Analyst persona with "So What?" Protocol
 * - Handle-first attribution for every bullet
 */

import { CapturedPost, DigestConfig } from '../../types/instagram.js';
import { AnalysisObject, AnalysisSection } from '../../types/analysis.js';
import { UsageService } from './UsageService.js';

/**
 * Internal type for image content in OpenAI API.
 */
interface ImageContent {
    type: 'image_url';
    image_url: {
        url: string;
        detail: 'low' | 'high' | 'auto';
    };
}

/**
 * Internal type for text content in OpenAI API.
 */
interface TextContent {
    type: 'text';
    text: string;
}

export class BatchDigestGenerator {
    private apiKey: string;
    private usageService: UsageService;

    constructor(apiKey: string) {
        this.apiKey = apiKey;
        this.usageService = UsageService.getInstance();
    }

    /**
     * Generate a digest from all captured screenshots in one API call.
     * Uses GPT-4o Vision with multiple images.
     *
     * @param captures - Array of captured screenshots from browsing session
     * @param config - User configuration (name, interests, location)
     * @returns Complete analysis object ready for display
     */
    async generateDigest(
        captures: CapturedPost[],
        config: DigestConfig
    ): Promise<AnalysisObject> {
        if (captures.length === 0) {
            throw new Error('INSUFFICIENT_CONTENT: No screenshots captured');
        }

        const now = new Date();
        const dayName = now.toLocaleDateString('en-US', { weekday: 'long' });
        const dateStr = now.toLocaleDateString('en-US', {
            month: 'long',
            day: 'numeric',
            year: 'numeric'
        });

        // Build image content array for GPT-4o
        const imageContents: ImageContent[] = captures.map((capture) => ({
            type: 'image_url' as const,
            image_url: {
                url: `data:image/jpeg;base64,${capture.screenshot.toString('base64')}`,
                detail: 'low' as const  // Cost optimization: low detail for social media content
            }
        }));

        // Build the prompt
        const prompt = this.buildDigestPrompt(config, dayName, dateStr, captures);

        console.log(`🤖 Generating digest from ${captures.length} screenshots...`);

        // Build message content array
        const messageContent: (TextContent | ImageContent)[] = [
            { type: 'text', text: prompt },
            ...imageContents
        ];

        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.apiKey}`
            },
            body: JSON.stringify({
                model: 'gpt-4o',
                messages: [{
                    role: 'user',
                    content: messageContent
                }],
                max_tokens: 3000,
                temperature: 0.3,  // Low for factual accuracy
                response_format: { type: 'json_object' }
            })
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            console.error('❌ Digest generation API error:', errorData);
            throw new Error('DIGEST_GENERATION_FAILED');
        }

        const data = await response.json();

        // Track usage
        if (data.usage) {
            await this.usageService.incrementUsage(data.usage);
            console.log(`💰 Digest cost tracked: ${data.usage.total_tokens} tokens`);
        }

        const content = data.choices[0]?.message?.content;

        if (!content) {
            throw new Error('DIGEST_GENERATION_FAILED: No content in response');
        }

        try {
            return this.parseDigestResponse(content, config, dayName, dateStr);
        } catch (parseError) {
            console.error('❌ Failed to parse digest response:', parseError);
            throw new Error('DIGEST_GENERATION_FAILED');
        }
    }

    /**
     * Build the system prompt for digest generation.
     */
    private buildDigestPrompt(
        config: DigestConfig,
        dayName: string,
        dateStr: string,
        captures: CapturedPost[]
    ): string {
        const interestsList = config.interests.length > 0
            ? config.interests.map(i => `"${i}"`).join(', ')
            : 'General news and trends';

        // Build source summary
        const feedCount = captures.filter(c => c.source === 'feed').length;
        const storyCount = captures.filter(c => c.source === 'story').length;
        const searchCount = captures.filter(c => c.source === 'search').length;
        const profileCount = captures.filter(c => c.source === 'profile').length;
        const carouselCount = captures.filter(c => c.source === 'carousel').length;

        // Extract interests from search captures
        const searchInterests = [...new Set(
            captures
                .filter(c => c.source === 'search' && c.interest)
                .map(c => c.interest)
        )];

        return `You are a STRATEGIC INTELLIGENCE ANALYST creating a personalized morning briefing for ${config.userName}.

═══════════════════════════════════════════════════════════════════════════════
I. YOUR TASK
═══════════════════════════════════════════════════════════════════════════════

You are viewing ${captures.length} Instagram screenshots captured during a browsing session.
- Feed posts: ${feedCount}
- Stories: ${storyCount}
- Search results: ${searchCount}${searchInterests.length > 0 ? ` (searched: ${searchInterests.join(', ')})` : ''}
- Profile views: ${profileCount}
- Carousel slides: ${carouselCount}

Analyze ALL images and synthesize them into ONE comprehensive digest.

═══════════════════════════════════════════════════════════════════════════════
II. USER PROFILE
═══════════════════════════════════════════════════════════════════════════════

Name: ${config.userName}
Priority Interests: ${interestsList}
Location: ${config.location || 'Not specified'}
Date: ${dayName}, ${dateStr}

═══════════════════════════════════════════════════════════════════════════════
III. ANALYSIS RULES (CRITICAL - VIOLATIONS = FAILURE)
═══════════════════════════════════════════════════════════════════════════════

1. **ATTRIBUTION (MANDATORY)**:
   - Every bullet MUST start with **@handle** in bold (extract username from screenshot)
   - If you cannot read the handle clearly, use **@[unclear]** but still include the content
   - Format: "• **@handle**: [Fact]. [Contextual Analysis if warranted]."

2. **DEPTH - THE "SO WHAT?" PROTOCOL**:
   For HIGH-VALUE content (news, user interests, breaking updates):
   - Level 1: What's literally in the image
   - Level 2: What trend does this connect to?
   - Level 3: Why should the reader care?

   For LOW-VALUE content (generic updates, lifestyle posts):
   - Level 1 only: Just the facts, one sentence

3. **PRIORITIZATION**:
   - Search results matching "${interestsList}" = HIGH PRIORITY (feature prominently)
   - Breaking news / time-sensitive content = HIGH PRIORITY
   - Stories = MEDIUM (ephemeral, context-dependent)
   - Generic lifestyle posts = LOW (brief mention or skip)

4. **NO HALLUCINATIONS**:
   - Only report what you can SEE in the screenshots
   - If you can't read text clearly, say "[text unclear]"
   - Label any inference as [Contextual Analysis: ...]
   - NEVER invent emotional narrative ("celebrating team spirit," "fostering connections")

5. **NEGATIVE CONSTRAINTS**:
   ❌ Do NOT use filler phrases: "The photo shows," "The caption says," "Interestingly"
   ❌ Do NOT summarize 5 posts into 1 bland bullet
   ❌ Do NOT mix handles across bullet points
   ❌ Do NOT generate deep analysis for ads or sponsored content
   ❌ Do NOT report on duplicate/similar screenshots multiple times

═══════════════════════════════════════════════════════════════════════════════
IV. OUTPUT STRUCTURE
═══════════════════════════════════════════════════════════════════════════════

Return valid JSON with this exact structure:
{
    "title": "[Compelling headline based on top story - be specific and engaging]",
    "subtitle": "[Key strategic insight in one sentence] — ${dayName}, ${dateStr}",
    "sections": [
        {
            "heading": "🎯 Strategic Interests: ${config.interests[0] || 'Your Feed'}",
            "content": [
                "• **@handle**: [Fact from screenshot]. [Contextual Analysis: trend/implication].",
                "• **@handle**: [Another fact with depth]."
            ]
        },
        {
            "heading": "🌍 Global Intelligence",
            "content": [
                "• **@handle**: [Newsworthy item with context].",
                "• **@handle**: [Another newsworthy item]."
            ]
        },
        {
            "heading": "⚡ Lightning Round",
            "content": [
                "• **@handle**: [Quick hit - one sentence].",
                "• **@handle**: [Quick hit - one sentence]."
            ]
        }
    ]
}

TARGET: 15-25 high-quality bullets total across all sections.
SKIP: Ads, sponsored content, empty/unclear screenshots, duplicate content.

═══════════════════════════════════════════════════════════════════════════════
V. EXAMPLES
═══════════════════════════════════════════════════════════════════════════════

✅ CORRECT (with depth):
• **@CalFootball**: Posted recruiting update showing new 5-star commit. [Contextual Analysis: This brings Cal's 2026 class to #18 nationally during early signing period.]

✅ CORRECT (quick hit):
• **@friend_account**: Shared a sunset photo from Malibu.

❌ WRONG (missing handle):
• Someone posted about a new restaurant opening...

❌ WRONG (hallucinating):
• **@UniversityAccount**: "Fostering lifelong connections through education" (if you can't read this in the screenshot, don't invent it)`;
    }

    /**
     * Parse the LLM response into a structured AnalysisObject.
     */
    private parseDigestResponse(
        content: string,
        config: DigestConfig,
        dayName: string,
        dateStr: string
    ): AnalysisObject {
        const parsed = JSON.parse(content);

        // Validate structure
        if (!parsed.title || !parsed.sections || !Array.isArray(parsed.sections)) {
            throw new Error('Invalid response structure: missing title or sections');
        }

        // Map sections
        const sections: AnalysisSection[] = parsed.sections.map((s: { heading?: string; content?: string | string[] }) => ({
            heading: s.heading || 'Untitled Section',
            content: Array.isArray(s.content) ? s.content : [s.content || '']
        }));

        console.log('✅ Digest generated successfully');

        return {
            title: parsed.title,
            subtitle: parsed.subtitle || `Your Instagram Digest — ${dayName}, ${dateStr}`,
            sections,
            date: new Date().toISOString(),
            location: config.location || '',
            scheduledTime: new Date().toLocaleTimeString('en-US', {
                hour: 'numeric',
                minute: '2-digit',
                hour12: true
            })
        };
    }
}
