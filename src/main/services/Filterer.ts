/**
 * ScreenshotFilter - Async LLM-Based Screenshot Filter (Agent 2)
 *
 * Watches the raw/ directory for new screenshots dumped by the Navigator (Agent 1).
 * For each new screenshot, calls an LLM to determine if it contains actual
 * Instagram content worth including in a digest.
 *
 * Saves accepted screenshots to filtered/ for the Digest Writer (Agent 3).
 *
 * Completely decoupled from Agent 1 and Agent 3 — communicates via filesystem only.
 */

import * as fs from 'fs';
import * as path from 'path';
import { ModelConfig } from '../../shared/modelConfig.js';
import { UsageService } from './UsageService.js';

interface FilterResult {
    keep: boolean;
    reason: string;
}

export interface FilterStats {
    processed: number;
    kept: number;
    rejected: number;
    tokensUsed: number;
}

export class Filterer {
    private rawDir: string;
    private filteredDir: string;
    private apiKey: string;
    private interests: string[];
    private processed = new Set<string>();
    private running = false;
    private kept = 0;
    private rejected = 0;
    private tokensUsed = 0;
    private usageService: UsageService;

    constructor(rawDir: string, filteredDir: string, apiKey: string, interests: string[]) {
        this.rawDir = rawDir;
        this.filteredDir = filteredDir;
        this.apiKey = apiKey;
        this.interests = interests;
        this.usageService = UsageService.getInstance();

        if (!fs.existsSync(this.filteredDir)) {
            fs.mkdirSync(this.filteredDir, { recursive: true });
        }
    }

    /**
     * Start the async filter loop. Polls raw/ for new screenshots every 2 seconds.
     * Resolves when the Navigator writes done.marker and all remaining files are processed.
     */
    async start(): Promise<FilterStats> {
        this.running = true;
        console.log(`🔍 ScreenshotFilter: watching ${this.rawDir}`);

        while (this.running) {
            // Get all jpg files we haven't processed yet
            const files = fs.readdirSync(this.rawDir)
                .filter(f => f.endsWith('.jpg') && !this.processed.has(f))
                .sort(); // Process in order

            for (const file of files) {
                if (!this.running) break;
                await this.evaluateScreenshot(file);
                this.processed.add(file);
            }

            // Check if navigator is done
            if (fs.existsSync(path.join(this.rawDir, 'done.marker'))) {
                // Do one final sweep for any files that arrived after our last check
                const remaining = fs.readdirSync(this.rawDir)
                    .filter(f => f.endsWith('.jpg') && !this.processed.has(f))
                    .sort();
                for (const file of remaining) {
                    await this.evaluateScreenshot(file);
                    this.processed.add(file);
                }
                this.running = false;
                break;
            }

            // Poll interval
            await new Promise(resolve => setTimeout(resolve, 2000));
        }

        // Write our own done marker
        fs.writeFileSync(path.join(this.filteredDir, 'done.marker'), JSON.stringify({
            processed: this.processed.size,
            kept: this.kept,
            rejected: this.rejected,
            tokensUsed: this.tokensUsed,
            timestamp: Date.now()
        }));

        console.log(`🔍 ScreenshotFilter: done. ${this.kept} kept, ${this.rejected} rejected out of ${this.processed.size} processed.`);

        return {
            processed: this.processed.size,
            kept: this.kept,
            rejected: this.rejected,
            tokensUsed: this.tokensUsed
        };
    }

    /** Stop the filter loop early (e.g. user pressed Cmd+Shift+K). */
    stop(): void {
        this.running = false;
    }

    /**
     * Evaluate a single screenshot using LLM vision.
     * If it contains real content, copy it (and its sidecar JSON) to filtered/.
     */
    private async evaluateScreenshot(filename: string): Promise<void> {
        const filepath = path.join(this.rawDir, filename);
        const buffer = fs.readFileSync(filepath);
        const base64 = buffer.toString('base64');

        try {
            const result = await this.callFilterLLM(base64);

            if (result.keep) {
                // Copy image to filtered/
                fs.copyFileSync(filepath, path.join(this.filteredDir, filename));

                // Copy sidecar metadata if it exists
                const jsonFile = filename.replace('.jpg', '.json');
                const jsonPath = path.join(this.rawDir, jsonFile);
                if (fs.existsSync(jsonPath)) {
                    // Read existing sidecar data and add filter reason
                    const sidecar = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
                    sidecar.filterReason = result.reason;
                    fs.writeFileSync(
                        path.join(this.filteredDir, jsonFile),
                        JSON.stringify(sidecar)
                    );
                }

                this.kept++;
                console.log(`  🔍 ✅ ${filename}: KEEP — ${result.reason}`);
            } else {
                this.rejected++;
                console.log(`  🔍 ❌ ${filename}: REJECT — ${result.reason}`);
            }
        } catch (error) {
            // On error, keep the image (fail open — better to include than miss)
            console.warn(`  🔍 ⚠️ ${filename}: filter error, keeping by default —`, error);
            fs.copyFileSync(filepath, path.join(this.filteredDir, filename));
            const jsonFile = filename.replace('.jpg', '.json');
            const jsonPath = path.join(this.rawDir, jsonFile);
            if (fs.existsSync(jsonPath)) {
                fs.copyFileSync(jsonPath, path.join(this.filteredDir, jsonFile));
            }
            this.kept++;
        }
    }

    /**
     * Call the LLM to decide if a screenshot contains real content.
     * Uses the tagging model for speed and low cost.
     */
    private async callFilterLLM(base64Image: string): Promise<FilterResult> {
        const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': this.apiKey,
                'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify({
                model: ModelConfig.tagging,
                max_tokens: 100,
                messages: [{
                    role: 'user',
                    content: [
                        {
                            type: 'image',
                            source: {
                                type: 'base64',
                                media_type: 'image/jpeg',
                                data: base64Image
                            }
                        },
                        {
                            type: 'text',
                            text: `You are filtering Instagram browsing screenshots for a digest.

Does this screenshot contain actual Instagram content worth summarizing?

YES if: a post is clearly visible (image with caption), a story frame is showing full-screen, a post modal is open (dark overlay with content centered), a search result post is open, carousel content is displayed, a profile page with visible posts.

NO if: this is mid-navigation (home feed scrolling with no post focused), a loading/spinner screen, a search grid showing only tiny thumbnails, a settings/menu page, a login or error screen, mostly UI chrome (sidebar, top bar) with no content, a transitional state between pages, a duplicate of content that looks nearly identical to something you'd expect was just captured (same post, slightly different scroll).

User interests for context: ${this.interests.join(', ')}

Respond with ONLY a JSON object:
{"keep": true, "reason": "Post modal open showing a landscape photo with caption"}
or
{"keep": false, "reason": "Home feed mid-scroll, no post focused"}`
                        }
                    ]
                }]
            })
        });

        const data = await response.json() as any;

        // Track token usage
        if (data.usage) {
            this.tokensUsed += (data.usage.input_tokens || 0) + (data.usage.output_tokens || 0);
            this.usageService.incrementUsage({
                input_tokens: data.usage.input_tokens || 0,
                output_tokens: data.usage.output_tokens || 0,
                cache_creation_input_tokens: 0,
                cache_read_input_tokens: 0
            });
        }

        // Parse response
        const text = data.content?.[0]?.text || '';
        try {
            // Extract JSON from response (handle markdown code blocks)
            const jsonMatch = text.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                return JSON.parse(jsonMatch[0]) as FilterResult;
            }
        } catch {
            // Fall through
        }

        // Default: keep (fail open)
        return { keep: true, reason: 'Failed to parse filter response, keeping by default' };
    }
}
