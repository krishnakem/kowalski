/**
 * Preview the user prompt that the Digest Agent will send for a given run.
 *
 * Usage:
 *   npx tsx scripts/preview-digest-prompt.ts <run-dir>
 *
 * Reads filtered/{stories,feed}/*.json sidecars and prints the user-prompt body
 * the new DigestGeneration would build (without calling the LLM).
 */
import fs from 'fs';
import path from 'path';

const runDir = process.argv[2] || `${process.env.HOME}/Downloads/kowalski-debug/run_2026-04-13_19-05-24`;
if (!fs.existsSync(runDir)) {
    console.error(`Run directory not found: ${runDir}`);
    process.exit(1);
}

type Cap = { source: 'story' | 'feed'; filterReason?: string };

function load(dir: string, source: 'story' | 'feed'): Cap[] {
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir)
        .filter(f => f.endsWith('.jpg'))
        .sort()
        .map(filename => {
            const jsonPath = path.join(dir, filename.replace('.jpg', '.json'));
            let filterReason: string | undefined;
            if (fs.existsSync(jsonPath)) {
                try {
                    const sidecar = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
                    if (typeof sidecar?.filterReason === 'string') filterReason = sidecar.filterReason;
                } catch {}
            }
            return { source, filterReason };
        });
}

const stories = load(path.join(runDir, 'filtered', 'stories'), 'story');
const feed = load(path.join(runDir, 'filtered', 'feed'), 'feed');
const captures = [...stories, ...feed];

const now = new Date();
const dayName = now.toLocaleDateString('en-US', { weekday: 'long' });
const dateStr = now.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

const renderItem = (c: Cap, i: number) => `[${i + 1}] ${c.filterReason?.trim() || '(no description available)'}`;
const storiesBlock = stories.length ? stories.map(renderItem).join('\n') : '(none)';
const feedBlock = feed.length ? feed.map(renderItem).join('\n') : '(none)';

const userPrompt = `Today is ${dayName}, ${dateStr}.

You have ${captures.length} filtered Instagram captures from this morning's run: ${stories.length} story frames and ${feed.length} feed posts.

Each item below is a one-line description written by the upstream filter agent describing what was on the screen. Use these descriptions plus the attached images to determine WHAT happened in the world the reader's accounts cover. Then write the editorial column following the rules in your system prompt.

══════════════════════════════════════════
STORY FRAMES (chronological, ${stories.length} total)
══════════════════════════════════════════
${storiesBlock}

══════════════════════════════════════════
FEED POSTS (chronological, ${feed.length} total)
══════════════════════════════════════════
${feedBlock}

══════════════════════════════════════════
ATTACHED IMAGES
══════════════════════════════════════════

${captures.length} JPEGs are attached after this message in the same order: stories first (${stories.length}), then feed (${feed.length}).

Now write the editorial column. Begin immediately with "# " followed by your generated title. No preamble.`;

console.log(userPrompt);
