/**
 * BatchDigestGenerator - Screenshot-First Digest Generation
 *
 * Generates a comprehensive digest from all captured screenshots in ONE API call.
 * Uses LLM vision (see ModelConfig.digest) with multiple images for full visual context.
 *
 * Key principles:
 * - Single API call with all screenshots (no fragmented extraction)
 * - LLM sees actual visual content (not extracted descriptions)
 * - Strategic Intelligence Analyst persona with "So What?" Protocol
 * - Handle-first attribution for every bullet
 */

import { CapturedPost, DigestConfig } from '../../types/instagram.js';
import { AnalysisObject, AnalysisSection, StoryHighlight } from '../../types/analysis.js';
import { ModelConfig } from '../../shared/modelConfig.js';
import { UsageService } from './UsageService.js';

/**
 * Internal type for image content in Anthropic API.
 */
interface ImageContent {
    type: 'image';
    source: {
        type: 'base64';
        media_type: string;
        data: string;
    };
}

/**
 * Internal type for text content in Anthropic API.
 */
interface TextContent {
    type: 'text';
    text: string;
}

export class DigestGeneration {
    private apiKey: string;
    private usageService: UsageService;

    constructor(apiKey: string) {
        this.apiKey = apiKey;
        this.usageService = UsageService.getInstance();
    }

    /**
     * Generate a digest from all captured screenshots in one API call.
     * Uses Anthropic Claude with multiple images.
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

        // Build image content array for Anthropic
        const imageContents: ImageContent[] = captures.map((capture) => ({
            type: 'image' as const,
            source: {
                type: 'base64' as const,
                media_type: 'image/jpeg',
                data: capture.screenshot.toString('base64')
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

        const maxRetries = 4;
        let data: any;

        for (let attempt = 0; attempt < maxRetries; attempt++) {
            const response = await fetch('https://api.anthropic.com/v1/messages', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': this.apiKey,
                    'anthropic-version': '2023-06-01'
                },
                body: JSON.stringify({
                    model: ModelConfig.digest,
                    messages: [{
                        role: 'user',
                        content: messageContent
                    }],
                    max_tokens: 16384
                })
            });

            // Retry on overload (529) or rate limit (429) with exponential backoff
            if ((response.status === 529 || response.status === 429) && attempt < maxRetries - 1) {
                const baseDelay = response.status === 429 ? 10000 : 5000;
                const backoff = Math.min(baseDelay * Math.pow(2, attempt), 60000);
                const jitter = backoff * 0.25 * (Math.random() * 2 - 1);
                const delay = Math.round(backoff + jitter);
                console.warn(`  ⏳ Digest LLM ${response.status} (attempt ${attempt + 1}/${maxRetries - 1}). Retrying in ${(delay / 1000).toFixed(1)}s...`);
                await new Promise(resolve => setTimeout(resolve, delay));
                continue;
            }

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                console.error('❌ Digest generation API error:', errorData);
                throw new Error('DIGEST_GENERATION_FAILED');
            }

            data = await response.json();
            break;
        }

        if (!data) {
            console.error('❌ Digest generation: all retries exhausted');
            throw new Error('DIGEST_GENERATION_FAILED');
        }

        // Track usage
        if (data.usage) {
            await this.usageService.incrementUsage(data.usage);
            const totalTokens = (data.usage.input_tokens || 0) + (data.usage.output_tokens || 0);
            console.log(`💰 Digest cost tracked: ${totalTokens} tokens`);
        }

        const contentBlocks = data.content as Array<{ type: string; text?: string }> | undefined;
        const content = contentBlocks?.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('') || '';

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
        // Build source summary for metadata line
        const feedCount = captures.filter(c => c.source === 'feed').length;
        const storyCount = captures.filter(c => c.source === 'story').length;
        const profileCount = captures.filter(c => c.source === 'profile').length;
        const carouselCount = captures.filter(c => c.source === 'carousel').length;

        const sourceParts: string[] = [];
        if (feedCount) sourceParts.push(`${feedCount} feed`);
        if (storyCount) sourceParts.push(`${storyCount} stories`);
        if (profileCount) sourceParts.push(`${profileCount} profile`);
        if (carouselCount) sourceParts.push(`${carouselCount} carousel`);

        return `You are a text-only digest writer. You will receive ${captures.length} Instagram screenshots (${sourceParts.join(', ')}) captured on ${dayName}, ${dateStr}.

Your job: extract every concrete fact visible in the screenshots and organize them by Instagram account.

════════════════════════════════════════════════════════════════
GROUPING RULES
════════════════════════════════════════════════════════════════

1. Create ONE section per unique @handle you can identify in the screenshots.
2. The section "heading" field MUST be exactly the @handle as it appears (e.g. "@espn", "@nba"). Nothing else in the heading — no emojis, no descriptions.
3. If you cannot read the handle, use "@unknown_N" (incrementing N).
4. Order sections so that news accounts and accounts matching the user's interests appear first, then order remaining sections by how many frames/screenshots that account had (most first).

════════════════════════════════════════════════════════════════
BULLET RULES — DENSITY IS MANDATORY
════════════════════════════════════════════════════════════════

Each section's "content" array contains 1–5 bullets (strings). Rules:

A) EVERY bullet MUST contain at least one concrete fact extracted from the screenshot:
   a number, score, name, date, quoted overlay text, product & price, headline text, or specific visual detail.

B) BANNED phrasings — if any bullet contains these, the output is a failure:
   "posted about", "shared a story about", "graphics showing", "content related to",
   "images of", "a post featuring", "the photo shows", "the caption says",
   "shared a", "posted a", "featuring a".
   Instead, write the actual information.

C) MERGE rule: if multiple frames show the same underlying information (e.g. video
   frames of one play, multi-slide carousel on one topic), combine into ONE bullet.

D) OMIT rule: if a frame is unreadable, a loading spinner, a pure logo with no info,
   or adds nothing new, skip it entirely. Do not pad bullet counts.

E) No "see screenshot", no references to image numbers or image indices.

F) Examples of correct vs. incorrect bullets:
   BAD:  "NBA shared graphics about last night's game."
   GOOD: "Lakers 118, Warriors 112 — LeBron 34 pts / 8 reb / 6 ast, Curry 29 on 10-22 FG."

   BAD:  "Posted about a new sneaker release."
   GOOD: "Nike Air Max Dn8 releasing Apr 17, $180, colorway 'Midnight Navy'."

   BAD:  "Shared a story about weather."
   GOOD: "Heat advisory through Friday, high of 108°F in Phoenix."

════════════════════════════════════════════════════════════════
TONE & CONSTRAINTS
════════════════════════════════════════════════════════════════

- Pure extraction. Only report what is literally visible in the screenshots + any JSON metadata provided.
- No outside context, no "why it matters", no implications, no LLM training knowledge.
- If text is partially unreadable, transcribe what you can and mark unclear portions with [unclear].
- Skip ads and sponsored posts unless they contain genuinely newsworthy facts.
- Skip blank, loading, or duplicate screenshots.

════════════════════════════════════════════════════════════════
OUTPUT FORMAT
════════════════════════════════════════════════════════════════

Return valid JSON matching this schema exactly:

{
  "title": "Instagram Digest — ${dayName}, ${dateStr}",
  "subtitle": "[N] accounts, [M] items captured",
  "sections": [
    {
      "heading": "@handle",
      "content": [
        "Concrete fact bullet 1.",
        "Concrete fact bullet 2."
      ]
    }
  ]
}

- "title": always "Instagram Digest — ${dayName}, ${dateStr}".
- "subtitle": fill in the actual count of unique accounts (N) and total meaningful items (M) you extracted.
- "sections": one object per account. "heading" is the raw @handle. "content" is 1–5 fact-dense bullet strings.

Do NOT add any keys beyond title, subtitle, sections, heading, content.
Do NOT wrap the JSON in markdown code fences.`;
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
        // Strip markdown code fencing if present (```json ... ```)
        let cleaned = content.trim();
        const codeBlockMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (codeBlockMatch) {
            cleaned = codeBlockMatch[1].trim();
        }
        const parsed = JSON.parse(cleaned);

        // Validate structure
        if (!parsed.title || !parsed.sections || !Array.isArray(parsed.sections)) {
            throw new Error('Invalid response structure: missing title or sections');
        }

        // Map sections - LLM creates its own headings based on content
        const sections: AnalysisSection[] = parsed.sections
            .map((s: { heading?: string; content?: string | string[] }) => ({
                heading: s.heading || 'Untitled Section',
                content: Array.isArray(s.content) ? s.content : [s.content || '']
            }));

        console.log(`✅ Digest generated successfully`);
        console.log(`   Sections: ${sections.length}`);

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
