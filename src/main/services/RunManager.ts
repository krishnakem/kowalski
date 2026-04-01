import { app, BrowserWindow } from 'electron';
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { BrowserManager } from './BrowserManager.js';
import { Kowalski } from './Kowalski.js';
import { DigestGeneration } from './DigestGeneration.js';
import { Filterer } from './Filterer.js';
import { SecureKeyManager } from './SecureKeyManager.js';

const __filename = decodeURIComponent(new URL(import.meta.url).pathname);
const __dirname = path.dirname(__filename);

type RunStatus = 'idle' | 'running';

export class RunManager {
    private static instance: RunManager;
    private mainWindow: BrowserWindow | null = null;
    private status: RunStatus = 'idle';

    // Active run state (for stop support)
    private activeScraper: Kowalski | null = null;
    private activeFilters: Filterer[] = [];

    private constructor() {}

    public static getInstance(): RunManager {
        if (!RunManager.instance) {
            RunManager.instance = new RunManager();
        }
        return RunManager.instance;
    }

    public setMainWindow(window: BrowserWindow | null) {
        this.mainWindow = window;
    }

    public getStatus(): RunStatus {
        return this.status;
    }

    public stopRun(): void {
        if (this.activeScraper) {
            console.log('🛑 Stopping active run...');
            this.activeScraper.stop();
        }
        for (const f of this.activeFilters) {
            f.stop();
        }
        if (!this.activeScraper && this.activeFilters.length === 0) {
            console.log('🛑 No active run to stop');
        }
    }

    public async startRun(options?: { headless?: boolean }): Promise<void> {
        if (this.status === 'running') {
            console.log('⚠️ Run already in progress');
            return;
        }

        this.status = 'running';
        const headless = options?.headless ?? false;
        console.log(`🚀 Run started (headless: ${headless})`);

        const MAX_DURATION_MS = 90 * 60 * 1000;
        const browserManager = BrowserManager.getInstance();
        let context = null;

        // Notify UI that run started
        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
            this.mainWindow.webContents.send('run-started', {
                durationMs: MAX_DURATION_MS,
                startTime: Date.now()
            });
        }

        try {
            // 1. Get store & settings
            const { default: Store } = await import('electron-store');
            const store: any = new Store();
            const settings = store.get('settings') || {};

            // 2. Get API Key
            const apiKey = await SecureKeyManager.getInstance().getKey();
            if (!apiKey) {
                console.error('🚀 Run: NO API KEY');
                this.emitError('API key not found.');
                this.finishRun();
                return;
            }

            // 3. Launch browser
            console.log(`🚀 Launching browser (headless: ${headless})...`);
            context = await browserManager.launch({ headless });

            // 4. Validate session
            console.log('🚀 Validating Instagram session...');
            const sessionCheck = await browserManager.validateSession();
            if (!sessionCheck.valid) {
                throw new Error(sessionCheck.reason || 'SESSION_EXPIRED');
            }

            // 5. Set up directories
            const screenshotsDir = path.join(app.getPath('downloads'), 'kowalski-debug');
            const now = new Date();
            const pad = (n: number) => n.toString().padStart(2, '0');
            const dateTime = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
            const sessionDir = path.join(screenshotsDir, `run_${dateTime}`);
            const rawStoriesDir = path.join(sessionDir, 'raw', 'stories');
            const rawFeedDir = path.join(sessionDir, 'raw', 'feed');
            const filteredStoriesDir = path.join(sessionDir, 'filtered', 'stories');
            const filteredFeedDir = path.join(sessionDir, 'filtered', 'feed');
            fs.mkdirSync(rawStoriesDir, { recursive: true });
            fs.mkdirSync(rawFeedDir, { recursive: true });
            fs.mkdirSync(filteredStoriesDir, { recursive: true });
            fs.mkdirSync(filteredFeedDir, { recursive: true });

            // 6. Start filter agents in background
            console.log('🚀 Starting filter agents...');
            const storiesFilter = new Filterer(rawStoriesDir, filteredStoriesDir, apiKey);
            const feedFilter = new Filterer(rawFeedDir, filteredFeedDir, apiKey);
            this.activeFilters = [storiesFilter, feedFilter];
            const storiesFilterPromise = storiesFilter.start();
            const feedFilterPromise = feedFilter.start();

            // 7. Browse Instagram
            console.log('🚀 Browsing Instagram...');
            const scraper = new Kowalski(context, apiKey, !headless);
            this.activeScraper = scraper;
            const session = await scraper.browseAndCapture(
                MAX_DURATION_MS / 60000,
                { rawDir: path.join(sessionDir, 'raw') }
            );
            this.activeScraper = null;
            console.log(`🚀 Browsing complete: ${session.rawScreenshotCount} raw screenshots`);

            // 8. Close browser before generation
            await browserManager.close();
            context = null;

            // 9. Wait for filter agents
            console.log('🚀 Waiting for filter agents...');
            const [storiesStats, feedStats] = await Promise.all([storiesFilterPromise, feedFilterPromise]);
            this.activeFilters = [];
            const totalKept = storiesStats.kept + feedStats.kept;
            const totalRejected = storiesStats.rejected + feedStats.rejected;
            console.log(`🚀 Filter complete: ${totalKept} kept, ${totalRejected} rejected`);

            if (totalKept < 3) {
                console.warn(`🚀 Very few filtered captures (${totalKept}), digest quality may be low`);
            }

            // 10. Load filtered images
            const loadFiltered = (dir: string, source: 'story' | 'feed') => {
                if (!fs.existsSync(dir)) return [] as Array<{ screenshot: Buffer; source: 'story' | 'feed' }>;
                return fs.readdirSync(dir)
                    .filter((f: string) => f.endsWith('.jpg'))
                    .sort()
                    .map((filename: string) => ({
                        screenshot: fs.readFileSync(path.join(dir, filename)),
                        source
                    }));
            };
            const allFiltered = [...loadFiltered(filteredStoriesDir, 'story'), ...loadFiltered(filteredFeedDir, 'feed')];

            const bestCaptures = allFiltered.map((cap, index) => ({
                id: index + 1,
                screenshot: cap.screenshot,
                source: cap.source as 'feed' | 'story' | 'profile' | 'carousel',
                interest: undefined as string | undefined,
                timestamp: Date.now(),
                scrollPosition: 0
            }));
            console.log(`🚀 Loaded ${bestCaptures.length} filtered screenshots`);

            // 11. Generate digest
            console.log('🚀 Generating digest...');
            const digestGenerator = new DigestGeneration(apiKey);
            const analysis = await digestGenerator.generateDigest(bestCaptures, {
                userName: settings.userName || 'User',
                location: settings.location || ''
            });

            // 12. Save images to disk
            const recordId = uuidv4();
            const userDataPath = app.getPath('userData');
            const recordDir = path.join(userDataPath, 'analysis_records');
            const imagesDir = path.join(recordDir, recordId, 'images');
            await fs.promises.mkdir(imagesDir, { recursive: true });

            const imageMetadata: { id: number; filename: string; source: string; interest?: string }[] = [];
            for (const capture of bestCaptures) {
                const filename = `${capture.id}.jpg`;
                const imagePath = path.join(imagesDir, filename);
                await fs.promises.writeFile(imagePath, capture.screenshot);
                imageMetadata.push({
                    id: capture.id,
                    filename,
                    source: capture.source,
                    interest: capture.interest
                });
            }

            // 13. Save analysis JSON
            const analysisWithImages = { ...analysis, images: imageMetadata };
            const newRecord = {
                id: recordId,
                data: analysisWithImages,
                leadStoryPreview: analysis.sections[0]?.content[0]?.substring(0, 100) + "..." || "No preview available."
            };

            const recordPath = path.join(recordDir, `${recordId}.json`);
            const tempPath = path.join(recordDir, `${recordId}.tmp`);
            await fs.promises.writeFile(tempPath, JSON.stringify(newRecord, null, 2));
            await fs.promises.rename(tempPath, recordPath);
            console.log(`🚀 Saved digest to disk: ${recordPath}`);

            // 14. Save metadata to store
            const metadataRecord = {
                id: newRecord.id,
                data: {
                    date: newRecord.data.date,
                    title: newRecord.data.title,
                    scheduledTime: newRecord.data.scheduledTime,
                    location: newRecord.data.location
                },
                leadStoryPreview: newRecord.leadStoryPreview
            };

            const currentAnalyses = store.get('analyses') || [];
            store.set('analyses', [metadataRecord, ...currentAnalyses]);

            // 15. Update status to ready
            const now = new Date();
            store.set('settings', {
                ...store.get('settings'),
                lastAnalysisDate: now.toISOString(),
                analysisStatus: 'ready'
            });

            // 16. Notify UI
            if (this.mainWindow && !this.mainWindow.isDestroyed()) {
                this.mainWindow.webContents.send('analysis-ready', metadataRecord);
            }

            console.log(`🚀 Run complete! Kept: ${totalKept}, Rejected: ${totalRejected}`);

        } catch (error: any) {
            console.error('🚀 Run failed:', error.message);
            this.activeScraper = null;

            if (context) {
                await browserManager.close();
            }

            this.emitError(`Run failed: ${error.message}`);
        }

        this.finishRun();
    }

    private emitError(message: string) {
        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
            this.mainWindow.webContents.send('analysis-error', {
                message,
                canRetry: true
            });
        }
    }

    private finishRun() {
        this.status = 'idle';
        this.activeFilters = [];
        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
            this.mainWindow.webContents.send('run-complete', {});
        }
    }
}
