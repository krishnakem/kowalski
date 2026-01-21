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
     * Prepare a structured summary of browsed content for the LLM.
     * Groups by content type and applies token-aware truncation.
     */
    private prepareContentSummary(session: ScrapedSession): string {
        const sections: string[] = [];
        let totalChars = 0;

        // Process Feed Posts with truncation
        if (session.feedContent.length > 0) {
            sections.push('## Feed Posts');

            for (let i = 0; i < session.feedContent.length && totalChars < MAX_TOTAL_CONTENT_CHARS; i++) {
                const post = session.feedContent[i];
                const caption = this.truncateCaption(post.caption || post.visualDescription || 'No caption');

                // Format differently for video content
                let line: string;
                if (post.isVideoContent) {
                    line = `${i + 1}. ${post.username} [Video/Reel]: "${caption}"`;
                } else {
                    line = `${i + 1}. ${post.username}: "${caption}"`;
                }

                if (totalChars + line.length > MAX_TOTAL_CONTENT_CHARS) break;

                sections.push(line);
                totalChars += line.length;
            }
        }

        // Process Stories (usually short, less concern)
        if (session.storiesContent.length > 0 && totalChars < MAX_TOTAL_CONTENT_CHARS) {
            sections.push('\n## Stories');

            for (const story of session.storiesContent.slice(0, 10)) {
                const desc = this.truncateCaption(story.visualDescription || story.caption || 'Visual story');
                const line = `- ${story.username}: ${desc}`;

                if (totalChars + line.length > MAX_TOTAL_CONTENT_CHARS) break;

                sections.push(line);
                totalChars += line.length;
            }
        }

        // Metadata (always include)
        const postsIncluded = sections.filter(s => /^\d+\./.test(s)).length;
        sections.push(`\n## Session Info`);
        sections.push(`- Total posts browsed: ${session.feedContent.length}`);
        sections.push(`- Total stories viewed: ${session.storiesContent.length}`);
        sections.push(`- Posts included in summary: ${postsIncluded}`);

        return sections.join('\n');
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

        const prompt = `You are a senior analyst creating a personalized intelligence briefing for ${config.userName}.

═══════════════════════════════════════════════════════════════
USER PROFILE
═══════════════════════════════════════════════════════════════
Name: ${config.userName}
Location: ${config.location || 'Not specified'}
PRIORITY INTERESTS: ${interestsList}

═══════════════════════════════════════════════════════════════
TODAY'S RAW INSTAGRAM FEED
═══════════════════════════════════════════════════════════════
${contentSummary}

═══════════════════════════════════════════════════════════════
OUTPUT FORMAT
═══════════════════════════════════════════════════════════════

# [Punchy Title]
### [One-line insight] — ${dayName}, ${dateStr}${config.location ? `, ${config.location}` : ''}

## Your Interests
- [First interest-related bullet with SPECIFIC details]
- [Second interest-related bullet with SPECIFIC details]

## [Other Thematic Section]
- Topic: Specific detail from content.
- ...

═══════════════════════════════════════════════════════════════
CRITICAL RULES - READ CAREFULLY
═══════════════════════════════════════════════════════════════

🚨 EXTREME SPECIFICITY (MOST IMPORTANT):
Do NOT generalize. Do NOT abstract. Report EXACTLY what you see.

BAD EXAMPLES (NEVER DO THIS):
  ❌ "A sports figure holding a trophy underscores the importance of winning"
  ❌ "A football player celebrated a victory"
  ❌ "A growing trend in the fitness space..."
  ❌ "One creator highlighted the intersection of..."
  ❌ "A tech company announced new features"

GOOD EXAMPLES (DO THIS):
  ✅ "Jim Harbaugh celebrated Michigan's 34-13 win over Washington"
  ✅ "J.J. McCarthy threw for 3 touchdowns in the National Championship"
  ✅ "Apple announced Vision Pro pre-orders start February 2nd at $3,499"
  ✅ "Taylor Swift's Eras Tour grossed $1 billion in 2024"

DIRECT REPORTING:
  - If you see a NAME, write the NAME
  - If you see a SCORE, write the SCORE
  - If you see a DATE, write the DATE
  - If you see a PRICE, write the PRICE
  - If you see STATS, write the STATS
  - NEVER replace specific info with vague descriptors

🎯 "YOUR INTERESTS" SECTION (REQUIRED FIRST SECTION):
This section MUST contain news matching: ${interestsList}
  - Search results for these interests were captured FIRST
  - Report the SPECIFIC news/updates found for each interest
  - Use real names, scores, dates, announcements
  - If we searched "Indiana Football", write what Indiana Football news was found

HANDLE RULE:
  - Use real names for PUBLIC FIGURES (athletes, celebrities, executives)
  - Use descriptors only for random unknown accounts
  - Exception: Always name authorities in ${config.userName}'s interests

FORMAT:
  - 2-4 sections, 2-4 bullets each
  - Each bullet: Topic + 1-2 sentences with SPECIFIC details
  - NO asterisks or bold markers
  - Standard dash (-) for bullets
  - "Your Interests" section MUST be first

═══════════════════════════════════════════════════════════════

Return valid JSON:
{
    "title": "string (punchy, specific)",
    "subtitle": "string (insight + date/location)",
    "sections": [
        {
            "heading": "Your Interests",
            "content": ["- Topic: Specific news about user's interests.", "- Topic: More specific details."]
        },
        {
            "heading": "string (thematic)",
            "content": ["- Topic: Specific detail.", "- Topic: More details."]
        }
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
                model: 'gpt-4-turbo-preview',
                messages: [{ role: 'user', content: prompt }],
                max_tokens: 2000,
                temperature: 0.7,  // Some creativity
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
