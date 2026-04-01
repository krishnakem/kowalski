/**
 * Centralized Model Configuration
 *
 * All LLM model strings in one place. Every model is env-overridable for experimentation.
 * Dual-agent architecture: Sonnet navigates, Opus captures and rescues.
 */
export const ModelConfig = {
    // Stories navigation — cheap model, tight mechanical loop (click avatar, advance, escape)
    stories: process.env.KOWALSKI_STORIES_MODEL || 'claude-haiku-4-5-20241022',

    // Feed navigation — fast model, handles scrolling, clicking, dismissing popups
    navigation: process.env.KOWALSKI_NAV_MODEL || 'claude-sonnet-4-6',

    // Specialist — powerful model, handles captures, carousels, stuck recovery
    specialist: process.env.KOWALSKI_SPECIALIST_MODEL || 'claude-opus-4-6',

    // Content extraction from viewport screenshots — called per capture
    // Needs: strong vision, detailed text extraction from images, caption/comment parsing
    vision: process.env.KOWALSKI_VISION_MODEL || 'claude-opus-4-6',

    // Image tagging — categorize and describe captured screenshots
    // Needs: basic vision, simple categorization, fast
    tagging: process.env.KOWALSKI_TAGGING_MODEL || 'claude-opus-4-6',

    // Batch digest generation — synthesize all captures into a digest
    // Needs: strong reasoning, long context (many captures), good writing
    digest: process.env.KOWALSKI_DIGEST_MODEL || 'claude-opus-4-6',

    // Analysis and insights generation
    // Needs: complex reasoning, pattern recognition, good writing
    analysis: process.env.KOWALSKI_ANALYSIS_MODEL || 'claude-opus-4-6',
} as const;
