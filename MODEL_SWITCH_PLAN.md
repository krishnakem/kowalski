# Model Switch Plan

Downgrade most model slots from Opus to Sonnet/Haiku. The goal is to cut per-session API cost from ~$10 to ~$1-2 without meaningfully degrading output quality.

## Current State (`src/shared/modelConfig.ts`)

| Slot | Current Model | Cost (input/output per M tokens) |
|------|--------------|----------------------------------|
| `stories` | `claude-haiku-4-5-20241022` | $0.80 / $4 |
| `navigation` | `claude-sonnet-4-6` | $3 / $15 |
| `specialist` | `claude-opus-4-6` | $15 / $75 |
| `vision` | `claude-opus-4-6` | $15 / $75 |
| `tagging` | `claude-opus-4-6` | $15 / $75 |
| `digest` | `claude-opus-4-6` | $15 / $75 |
| `analysis` | `claude-opus-4-6` | $15 / $75 |

**5 of 7 slots are Opus.** Opus is 5x the cost of Sonnet and ~19x the cost of Haiku.

## Recommended Changes

| Slot | New Model | Rationale |
|------|----------|-----------|
| `stories` | `claude-haiku-4-5-20241022` | **No change.** Stories navigation is a tight mechanical loop (click avatar, advance, escape). Haiku handles this fine. |
| `navigation` | `claude-sonnet-4-6` | **No change.** Feed scrolling needs decent vision + reasoning for popup dismissal, scroll decisions, etc. Sonnet is the sweet spot. |
| `specialist` | `claude-sonnet-4-6` | **Downgrade from Opus.** Specialist handles captures, carousels, and stuck recovery. Sonnet's vision is strong enough for these tasks. Only escalate to Opus if you see capture quality drop. |
| `vision` | `claude-sonnet-4-6` | **Downgrade from Opus.** Content extraction from viewport screenshots (captions, comments, text). Sonnet's vision is excellent for OCR-style tasks. This is the highest-volume slot — biggest cost savings here. |
| `tagging` | `claude-haiku-4-5-20241022` | **Downgrade from Opus.** Image categorization and description is a simple classification task. Haiku is more than capable. |
| `digest` | `claude-sonnet-4-6` | **Downgrade from Opus.** Digest generation needs good writing and long context, but Sonnet handles both well. The quality difference vs Opus for summarization/writing is marginal. |
| `analysis` | `claude-sonnet-4-6` | **Downgrade from Opus.** Pattern recognition and insight generation. Sonnet is strong at reasoning. Keep Opus as a fallback if analysis quality feels shallow. |

## Cost Impact Estimate

Assuming a typical session generates ~50 vision calls, ~20 navigation calls, ~10 tagging calls, 1 digest call, and 1 analysis call:

| Slot | Before (est.) | After (est.) | Savings |
|------|--------------|-------------|---------|
| vision (50 calls) | ~$4.50 | ~$0.90 | 80% |
| specialist (~10 calls) | ~$1.50 | ~$0.30 | 80% |
| tagging (10 calls) | ~$0.75 | ~$0.04 | 95% |
| digest (1 call) | ~$1.50 | ~$0.30 | 80% |
| analysis (1 call) | ~$1.00 | ~$0.20 | 80% |
| navigation (unchanged) | ~$0.60 | ~$0.60 | 0% |
| stories (unchanged) | ~$0.10 | ~$0.10 | 0% |
| **Total** | **~$9.95** | **~$2.44** | **~75%** |

These are rough estimates. Actual costs depend on prompt length, number of screenshots, and session duration.

## Implementation

### The Change

One file, one diff. Replace the defaults in `src/shared/modelConfig.ts`:

```typescript
export const ModelConfig = {
    // Stories navigation — cheap model, tight mechanical loop
    stories: process.env.KOWALSKI_STORIES_MODEL || 'claude-haiku-4-5-20241022',

    // Feed navigation — handles scrolling, clicking, dismissing popups
    navigation: process.env.KOWALSKI_NAV_MODEL || 'claude-sonnet-4-6',

    // Specialist — captures, carousels, stuck recovery
    specialist: process.env.KOWALSKI_SPECIALIST_MODEL || 'claude-sonnet-4-6',

    // Content extraction from viewport screenshots
    vision: process.env.KOWALSKI_VISION_MODEL || 'claude-sonnet-4-6',

    // Image tagging — categorize and describe captured screenshots
    tagging: process.env.KOWALSKI_TAGGING_MODEL || 'claude-haiku-4-5-20241022',

    // Batch digest generation — synthesize all captures into a digest
    digest: process.env.KOWALSKI_DIGEST_MODEL || 'claude-sonnet-4-6',

    // Analysis and insights generation
    analysis: process.env.KOWALSKI_ANALYSIS_MODEL || 'claude-sonnet-4-6',
} as const;
```

### Rollback Strategy

Every slot is env-overridable. If any downgraded slot produces noticeably worse results, override it without touching code:

```bash
# Bump a single slot back to Opus
export KOWALSKI_VISION_MODEL=claude-opus-4-6

# Or bump everything back
export KOWALSKI_SPECIALIST_MODEL=claude-opus-4-6
export KOWALSKI_VISION_MODEL=claude-opus-4-6
export KOWALSKI_TAGGING_MODEL=claude-opus-4-6
export KOWALSKI_DIGEST_MODEL=claude-opus-4-6
export KOWALSKI_ANALYSIS_MODEL=claude-opus-4-6
```

### Testing

1. Run a full session with the new defaults
2. Compare digest quality to a recent Opus-generated digest
3. Check for: missed content in vision extraction, shallow analysis, poor tagging categories
4. If a specific slot underperforms, bump just that one back to Opus via env var

### Slots Most Likely to Need Opus

In order of risk (highest first):

1. **`analysis`** — If your digests feel shallow or miss non-obvious patterns, this is the first slot to bump back. Opus has an edge in complex reasoning.
2. **`digest`** — If the writing quality or synthesis across many captures degrades. Usually Sonnet is fine here.
3. **`specialist`** — If carousel navigation or stuck recovery starts failing. The specialist needs good spatial reasoning.
4. **`vision`** — Sonnet's OCR/extraction is very strong. Unlikely to need Opus here.
5. **`tagging`** — Haiku is more than sufficient for categorization. Almost zero risk.

## Summary

- Change 5 default values in one file
- ~75% cost reduction (~$10 → ~$2.50 per session)
- Every slot is individually reversible via env vars
- No architectural changes needed
