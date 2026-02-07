/**
 * Centralized Model Configuration
 *
 * All LLM model strings in one place. Every model is env-overridable for experimentation.
 * GPT-5 family: same API endpoint and request format as GPT-4o.
 */
export const ModelConfig = {
    // Navigation decision loop — called every turn (44+ times per session)
    // Needs: strong vision, instruction following, structured JSON output, LOW LATENCY
    navigation: process.env.KOWALSKI_NAV_MODEL || 'gpt-5-mini',

    // Content extraction from viewport screenshots — called per capture
    // Needs: strong vision, detailed text extraction from images, caption/comment parsing
    vision: process.env.KOWALSKI_VISION_MODEL || 'gpt-5',

    // Image tagging — categorize and describe captured screenshots
    // Needs: basic vision, simple categorization, fast
    tagging: process.env.KOWALSKI_TAGGING_MODEL || 'gpt-5-mini',

    // Batch digest generation — synthesize all captures into a digest
    // Needs: strong reasoning, long context (many captures), good writing
    digest: process.env.KOWALSKI_DIGEST_MODEL || 'gpt-5.2',

    // Analysis and insights generation
    // Needs: complex reasoning, pattern recognition, good writing
    analysis: process.env.KOWALSKI_ANALYSIS_MODEL || 'gpt-5.2',
} as const;
