
import { app, BrowserWindow, powerMonitor, powerSaveBlocker } from 'electron';
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { v4 as uuidv4 } from 'uuid';
import { ActiveSchedule } from '../../types/schedule.js';
import { BrowserManager } from './BrowserManager.js';
import { InstagramScraper } from './InstagramScraper.js';
import { AnalysisGenerator } from './AnalysisGenerator.js';
import { BatchDigestGenerator } from './BatchDigestGenerator.js';
import { ImageTagger } from './ImageTagger.js';
import { SecureKeyManager } from './SecureKeyManager.js';
import { AutomationErrorType } from '../../types/instagram.js';

// ============ SCHEDULER CONFIGURATION ============
// TESTING VALUES (for quick verification)
const BAKER_LEAD_TIME_MS = 2 * 60 * 1000;     // 2 minutes before delivery
const PREP_BUFFER_MS = 15 * 1000;              // 15 seconds buffer

// ================================================

interface SchedulerSettings {
    digestFrequency: 1 | 2;
    morningTime: string;
    eveningTime: string;
    lastAnalysisDate?: string;      // Keep for backwards compatibility
    lastBakeDate?: string;          // When Baker last ran
    lastDeliveryDate?: string;      // When Delivery Boy last ran
    analysisStatus?: 'idle' | 'pending_delivery' | 'ready';
    hasOnboarded?: boolean;
    userName?: string;
    location?: string;
}

// Next-Day Effect: Locked schedule that only updates on new calendar days
// (Imported ActiveSchedule)

export class SchedulerService {
    private static instance: SchedulerService;
    private checkInterval: NodeJS.Timeout | null = null;
    private mainWindow: BrowserWindow | null = null;

    private alignmentTimeout: NodeJS.Timeout | null = null;
    private lastWakeTime: Date = new Date(); // Track when app started/woke
    private suspensionBlockerId: number | null = null;

    // Active debug run scraper (for Cmd+Shift+K stop)
    private activeDebugScraper: InstagramScraper | null = null;

    private constructor() { }

    public static getInstance(): SchedulerService {
        if (!SchedulerService.instance) {
            SchedulerService.instance = new SchedulerService();
        }
        return SchedulerService.instance;
    }

    public getLastWakeTime(): Date {
        return this.lastWakeTime;
    }

    public setMainWindow(window: BrowserWindow | null) {
        this.mainWindow = window;
    }

    private storeInstance: any = null;

    // Helper to dynamically load electron-store (ESM) with EINTR retry
    private async getStore(): Promise<any> {
        if (this.storeInstance) return this.storeInstance;
        const maxRetries = 3;
        for (let i = 0; i < maxRetries; i++) {
            try {
                const { default: Store } = await import('electron-store');
                this.storeInstance = new Store();
                return this.storeInstance;
            } catch (err: any) {
                if (err.code === 'EINTR' && i < maxRetries - 1) {
                    await new Promise(r => setTimeout(r, 100));
                    continue;
                }
                throw err;
            }
        }
    }

    // Format date in LOCAL timezone (avoids UTC conversion issues)
    private formatLocalDate(date: Date): string {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    // Parse time string (e.g., "8:00 AM") into a Date object for the given reference date
    private parseTimeString(timeStr: string, referenceDate: Date): Date {
        const [time, modifier] = timeStr.split(' ');
        let [hours, minutes] = time.split(':').map(Number);
        if (modifier === 'PM' && hours < 12) hours += 12;
        if (modifier === 'AM' && hours === 12) hours = 0;
        const result = new Date(referenceDate);
        result.setHours(hours, minutes, 0, 0);
        return result;
    }

    // Deterministic random offset (0-30 minutes) based on date string hash (djb2 algorithm)
    // This makes bake time vary day-to-day (stealth) but stay fixed within a single day (predictable)
    private getDeterministicBakeOffset(dateStr: string): number {
        let hash = 0;
        for (let i = 0; i < dateStr.length; i++) {
            hash = ((hash << 5) - hash) + dateStr.charCodeAt(i);
            hash = hash & hash; // Convert to 32-bit integer
        }
        // Map to 0-30 minute range (in milliseconds)
        const offsetMinutes = Math.abs(hash) % 31; // 0-30 minutes
        return offsetMinutes * 60 * 1000;
    }

    public stop() {
        if (this.checkInterval) {
            clearInterval(this.checkInterval);
            this.checkInterval = null;
        }
        if (this.alignmentTimeout) {
            clearTimeout(this.alignmentTimeout);
            this.alignmentTimeout = null;
        }
        this.disableInsomnia();
    }

    public async initialize(): Promise<void> {
        console.log('⏰ SchedulerService: Initialized.');
        this.lastWakeTime = new Date();
        console.log('⏰ Wake Time set to:', this.lastWakeTime.toLocaleString());

        // Start preventing app suspension to ensure overnight execution
        this.suspensionBlockerId = powerSaveBlocker.start('prevent-app-suspension');
        console.log(`🔋 Power Save Blocker active (ID: ${this.suspensionBlockerId})`);

        // DAEMON MODE: No Catch-Up. Start watching immediately.
        this.startHeartbeat();


        // Restart heartbeat on system wake to ensure accuracy
        // Restart heartbeat on system wake to ensure accuracy
        powerMonitor.on('resume', () => {
            console.log(`⚡️ System Resumed. Heartbeat active. App Uptime: ${Math.floor(process.uptime() / 60)}m. Last Wake (Start) Time: ${this.lastWakeTime.toLocaleString()}`);
            this.startHeartbeat();
        });
    }

    private startHeartbeat() {
        // Clear existing timers
        if (this.checkInterval) clearInterval(this.checkInterval);
        if (this.alignmentTimeout) clearTimeout(this.alignmentTimeout);

        // --- SAFE INSOMNIA MODE (AC POWER ONLY) ---
        // Initial Check
        this.handleInsomniaState();

        // Dynamic Listeners
        powerMonitor.on('on-ac', () => {
            console.log('🔌 Power Source: AC. Re-evaluating Insomnia Mode...');
            this.handleInsomniaState();
        });

        powerMonitor.on('on-battery', () => {
            console.log('🪫 Power Source: Battery. Disabling Insomnia Mode...');
            this.disableInsomnia();
        });
        // ------------------------------------------

        const now = new Date();
        const msUntilNextMinute = 60000 - (now.getTime() % 60000);

        // Run immediate check for catch-up (in case we missed a slot while app was closed)
        this.checkSchedule();

        // Wait for top of minute
        this.alignmentTimeout = setTimeout(() => {
            // Execute exactly on the minute
            this.checkSchedule();

            // Start regular interval
            this.checkInterval = setInterval(() => {
                this.checkSchedule();
            }, 60000);
        }, msUntilNextMinute);
    }

    // --- INSOMNIA MANAGEMENT ---
    private insomniaProcess: any = null; // Type 'ChildProcess' needs import or 'any'

    private handleInsomniaState() {
        if (!powerMonitor.isOnBatteryPower()) {
            this.enableInsomnia();
        } else {
            this.disableInsomnia();
        }
    }

    private enableInsomnia() {
        if (this.insomniaProcess) return; // Already running



        console.log('🔋 AC Power detected: Insomnia Mode active (Preventing System Sleep)');

        // Use standard import (added to top of file)
        this.insomniaProcess = spawn('caffeinate', ['-i', '-s', '-w', process.pid.toString()]);

        this.insomniaProcess.on('close', (code: any) => {
            console.log(`☕️ Insomnia Process exited with code ${code}`);
            this.insomniaProcess = null;
        });
    }

    private disableInsomnia() {
        if (this.insomniaProcess) {
            console.log('🪫 Battery detected / Stopping: Insomnia Mode disabled');
            this.insomniaProcess.kill();
            this.insomniaProcess = null;
        }
    }
    // ---------------------------

    /**
     * Ensures the daily schedule snapshot is up-to-date.
     * - On first run after onboarding: Creates snapshot with activeDate = TOMORROW
     * - On new calendar day: Refreshes snapshot from current settings
     * - Otherwise: Returns existing snapshot
     */
    private async ensureDailySnapshot(store: any): Promise<ActiveSchedule | null> {
        const settings = (store.get('settings') || {}) as SchedulerSettings;

        // Don't create snapshot if user hasn't completed onboarding
        if (!settings.hasOnboarded) {
            return null;
        }

        const today = this.formatLocalDate(new Date());
        let activeSchedule = store.get('activeSchedule') as ActiveSchedule | undefined;

        // If no snapshot exists (first run after onboarding), set activeDate to TOMORROW
        // This ensures the onboarding schedule doesn't trigger missed slots from today
        // If no snapshot exists (first run after onboarding), decide if we start TODAY or TOMORROW.
        // PREVIOUS BUG: We unconditionally set it to TOMORROW. This caused the "Jan 2" bug where
        // restarting the app on Day 2 (with no saved snapshot) would skip Day 2 and jump to Day 3.
        if (!activeSchedule) {
            // Check if we can still hit the Morning slot TODAY
            const canHitToday = this.canScheduleForToday(settings.morningTime || '8:00 AM');

            // If we can hit today, set activeDate to TODAY. Otherwise, TOMORROW.
            const nextDate = new Date();
            if (!canHitToday) {
                nextDate.setDate(nextDate.getDate() + 1);
            }
            const activeDateStr = this.formatLocalDate(nextDate);

            activeSchedule = {
                morningTime: settings.morningTime || '8:00 AM',
                eveningTime: settings.eveningTime || '4:00 PM',
                digestFrequency: settings.digestFrequency || 1,
                activeDate: activeDateStr
            };
            store.set('activeSchedule', activeSchedule);
            console.log(`📅 First Daily Snapshot Created. Active starting ${activeDateStr}:`, activeSchedule);
            this.mainWindow?.webContents.send('schedule-updated', activeSchedule);
            return activeSchedule;
        }

        // If snapshot exists but is from a PREVIOUS day (past), refresh it from current settings.
        // IMPORTANT: Do NOT refresh if activeDate is in the FUTURE (set during onboarding).
        if (activeSchedule.activeDate !== today && activeSchedule.activeDate < today) {
            activeSchedule = {
                morningTime: settings.morningTime || '8:00 AM',
                eveningTime: settings.eveningTime || '4:00 PM',
                digestFrequency: settings.digestFrequency || 1,
                activeDate: today
            };
            store.set('activeSchedule', activeSchedule);
            console.log(`📅 Daily Snapshot Refreshed for ${today}:`, activeSchedule);
            this.mainWindow?.webContents.send('schedule-updated', activeSchedule);
        }

        return activeSchedule;
    }

    private async checkSchedule() {
        try {
            const store = await this.getStore();

            // Get the locked schedule for today (or null if not onboarded)
            const activeSchedule = await this.ensureDailySnapshot(store);
            if (!activeSchedule) {
                // User hasn't onboarded, or schedule is for tomorrow - skip
                return;
            }

            const settings = (store.get('settings') || {}) as SchedulerSettings;
            const now = new Date();
            const todayStr = this.formatLocalDate(now);
            const analysisStatus = settings.analysisStatus || 'idle';

            // Only check if today matches the active schedule date
            if (activeSchedule.activeDate !== todayStr) {
                // Schedule is for tomorrow (first-run scenario)
                return;
            }

            // PULSE: Send Heartbeat to UI
            this.mainWindow?.webContents.send('schedule-updated', activeSchedule);

            // ==================== TWO-PHASE SCHEDULER ====================

            // === PHASE 1: BAKER (2.5-3h before delivery, randomized) ===
            // Morning slot
            if (this.shouldTriggerBaker(now, activeSchedule.morningTime, settings.lastBakeDate)) {
                console.log(`🥐 Baker triggered for Morning slot (Delivery: ${activeSchedule.morningTime})`);
                await this.triggerBaker(now, store, activeSchedule.morningTime);
                return;
            }

            // === PHASE 2: DELIVERY BOY (at/after delivery time - infinite window) ===
            // Morning slot
            if (this.shouldTriggerDelivery(now, activeSchedule.morningTime, analysisStatus, settings.lastDeliveryDate)) {
                console.log(`📬 Delivery Boy triggered for Morning slot`);
                await this.triggerDelivery(store, activeSchedule.morningTime);
                return;
            }

            // Evening slot (if frequency is 2)
            if (activeSchedule.digestFrequency === 2) {
                // Baker for evening
                if (this.shouldTriggerBaker(now, activeSchedule.eveningTime, settings.lastBakeDate)) {
                    console.log(`🥐 Baker triggered for Evening slot (Delivery: ${activeSchedule.eveningTime})`);
                    await this.triggerBaker(now, store, activeSchedule.eveningTime);
                    return;
                }

                // Delivery Boy for evening
                if (this.shouldTriggerDelivery(now, activeSchedule.eveningTime, analysisStatus, settings.lastDeliveryDate)) {
                    console.log(`📬 Delivery Boy triggered for Evening slot`);
                    await this.triggerDelivery(store, activeSchedule.eveningTime);
                    return;
                }
            }

            // ==================== END TWO-PHASE SCHEDULER ====================

        } catch (error) {
            console.error('Scheduler Check Failed:', error);
        }
    }

    // catchUpMissedSlots removed for Daemon Mode (Anti-Burst)

    /**
     * Helper to determine if a slot is still viable for TODAY based on time and buffer.
     */
    private canScheduleForToday(targetTimeStr: string): boolean {
        const now = new Date();
        const targetDate = this.parseTimeString(targetTimeStr, now);

        // 1. If time passed, obviously not.
        if (now >= targetDate) return false;

        // 2. Check Buffer using PREP_BUFFER_MS constant
        const prepTimeMs = targetDate.getTime() - this.lastWakeTime.getTime();
        const uptimeSeconds = process.uptime();
        const prepBufferSeconds = PREP_BUFFER_MS / 1000;

        if (prepTimeMs < PREP_BUFFER_MS && uptimeSeconds < prepBufferSeconds) {
            console.log(`🛡️ Initial Snapshot: Skipping Today. Too close to wake/boot. (${Math.floor(uptimeSeconds)}s uptime)`);
            return false;
        }

        return true;
    }

    // ==================== TWO-JOB SCHEDULER (INVISIBLE BUTLER) ====================

    /**
     * BAKER: Determines if we should start the preparation phase.
     * Triggers 2.5-3 hours BEFORE delivery time (with deterministic random offset).
     */
    private shouldTriggerBaker(now: Date, deliveryTimeStr: string, lastBakeIso?: string): boolean {
        if (!deliveryTimeStr) return false;

        const todayStr = this.formatLocalDate(now);
        const deliveryTime = this.parseTimeString(deliveryTimeStr, now);

        // Deterministic random offset: 0-30 minutes (varies by day, fixed within day)
        const offset = this.getDeterministicBakeOffset(todayStr);

        // Bake time: BAKER_LEAD_TIME before delivery + offset (so 2.5-3h before in production)
        const bakeTime = new Date(deliveryTime.getTime() - BAKER_LEAD_TIME_MS + offset);

        // 1. Must be within baking window (bakeTime <= now < deliveryTime)
        if (now < bakeTime || now >= deliveryTime) return false;

        // 2. Check if already baked for this slot today
        if (lastBakeIso) {
            const lastBake = new Date(lastBakeIso);
            if (lastBake >= bakeTime) return false;
        }

        // 3. Preparation buffer (machine must have been on for reasonable time)
        const prepTimeMs = bakeTime.getTime() - this.lastWakeTime.getTime();
        const uptimeSeconds = process.uptime();
        const prepBufferSeconds = PREP_BUFFER_MS / 1000;

        if (prepTimeMs < PREP_BUFFER_MS && uptimeSeconds < prepBufferSeconds) {
            console.log(`🛡️ Baker: Skipping - machine woke too close to bake time (uptime: ${Math.floor(uptimeSeconds)}s)`);
            return false;
        }

        return true;
    }

    /**
     * DELIVERY BOY: Determines if we should deliver the prepared analysis.
     * Triggers AT or AFTER the exact delivery time - INFINITE WINDOW (no 30-min tolerance).
     * If status === 'pending_delivery' and time has passed, deliver it.
     */
    private shouldTriggerDelivery(
        now: Date,
        deliveryTimeStr: string,
        analysisStatus: string,
        lastDeliveryIso?: string
    ): boolean {
        if (!deliveryTimeStr) return false;
        if (analysisStatus !== 'pending_delivery') return false;  // Nothing to deliver

        const deliveryTime = this.parseTimeString(deliveryTimeStr, now);

        // Must have reached/passed delivery time
        if (now < deliveryTime) return false;

        // Check if already delivered for this slot today (prevent double delivery)
        if (lastDeliveryIso) {
            const lastDelivery = new Date(lastDeliveryIso);
            if (lastDelivery >= deliveryTime) return false;
        }

        // NO 30-MIN TOLERANCE - "Never Throw Away" Policy
        // If user opens laptop at 5:59 PM, they still get their 8:00 AM paper
        return true;
    }

    /**
     * COLLISION HANDLER: Archives any pending undelivered paper before baking a new one.
     * This ensures no paper is ever lost - they go to the Archive.
     */
    private async archivePendingAnalysis(store: any): Promise<void> {
        const settings = store.get('settings') || {};

        // Only archive if there's actually a pending delivery
        if (settings.analysisStatus !== 'pending_delivery') return;

        const analyses = store.get('analyses') || [];
        if (analyses.length === 0) return;

        const pendingAnalysis = analyses[0];

        console.log(`📦 Archiving undelivered paper: ${pendingAnalysis.id}`);

        // The paper is already in the analyses array (archive) and persisted to disk.
        // We just need to reset the status so the new bake can proceed.
        // The old paper remains accessible in the Archive screen.

        store.set('settings', {
            ...settings,
            analysisStatus: 'idle'
        });

        console.log(`📦 Previous paper archived. Ready for new bake.`);
    }

    // ==================== END TWO-JOB SCHEDULER ====================

    // Old shouldTrigger() method removed - replaced by shouldTriggerBaker() and shouldTriggerDelivery()

    /**
     * Handle errors with user-facing messages and automatic retry scheduling.
     * NO FALLBACK GENERATION - either quality content or transparent failure.
     */
    private handleAnalysisError(
        errorType: AutomationErrorType | string,
        scheduledTime: string,
        store: any,
        settings: any
    ) {
        const errorMap: Record<string, { userMessage: string; canRetry: boolean }> = {
            'SESSION_EXPIRED': {
                userMessage: 'Your Instagram session has expired. Please log in again.',
                canRetry: false
            },
            'CHALLENGE_REQUIRED': {
                userMessage: 'Instagram requires verification. Please log in manually.',
                canRetry: false
            },
            'RATE_LIMITED': {
                userMessage: 'Instagram is temporarily limiting access. We\'ll try again later.',
                canRetry: true
            },
            'VISION_RATE_LIMITED': {
                userMessage: 'Content analysis service is busy. We\'ll try again soon.',
                canRetry: true
            },
            'INSUFFICIENT_CONTENT': {
                userMessage: 'Not enough content was collected. We\'ll try again at the next scheduled time.',
                canRetry: true
            },
            'GENERATION_FAILED': {
                userMessage: 'Unable to generate your analysis. We\'ll try again later.',
                canRetry: true
            },
            'NO_API_KEY': {
                userMessage: 'API key not found. Please check your settings.',
                canRetry: false
            },
            'NO_CONTEXT': {
                userMessage: 'Browser session not available. Please try again.',
                canRetry: true
            },
            'BUDGET_EXCEEDED': {
                userMessage: 'Monthly API budget reached. Your next digest will be ready when the new month begins.',
                canRetry: false
            }
        };

        const errorInfo = errorMap[errorType] || {
            userMessage: 'Something went wrong. We\'ll try again later.',
            canRetry: true
        };

        // Notify UI with clear, actionable message
        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
            // Send specific error type for UI handling
            if (errorType === 'SESSION_EXPIRED' || errorType === 'CHALLENGE_REQUIRED') {
                this.mainWindow.webContents.send('instagram-session-expired', {});
            } else if (errorType === 'RATE_LIMITED') {
                this.mainWindow.webContents.send('instagram-rate-limited', {
                    nextRetry: this.calculateNextRetryTime()
                });
            } else if (errorType === 'INSUFFICIENT_CONTENT') {
                this.mainWindow.webContents.send('analysis-insufficient-content', {
                    collected: 0,  // We don't have exact count here
                    required: 5,
                    reason: errorInfo.userMessage,
                    nextRetry: this.calculateNextRetryTime()
                });
            } else if (errorType === 'BUDGET_EXCEEDED') {
                this.mainWindow.webContents.send('budget-exceeded', {
                    message: 'Monthly API budget reached. Kowalski will resume next month.',
                    canRetry: false
                });
            } else {
                this.mainWindow.webContents.send('analysis-error', {
                    message: errorInfo.userMessage,
                    canRetry: errorInfo.canRetry,
                    nextRetry: errorInfo.canRetry ? this.calculateNextRetryTime() : null
                });
            }
        }

        // Update status to idle (not working, not ready)
        store.set('settings', {
            ...settings,
            analysisStatus: 'idle'
        });

        console.log(`📢 Error notification sent: ${errorInfo.userMessage}`);
    }

    /**
     * Calculate human-readable next retry time.
     */
    private calculateNextRetryTime(): string {
        const retryTime = new Date(Date.now() + 30 * 60 * 1000);  // 30 min from now
        return retryTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    }

    // ==================== BAKER & DELIVERY BOY METHODS ====================

    /**
     * BAKER: Silently prepares the analysis (scrapes Instagram, generates content).
     * CRUCIAL: This phase must be COMPLETELY SILENT - no notifications!
     */
    private async triggerBaker(now: Date, store: any, scheduledTime: string) {
        console.log(`🥐 Baker starting at ${new Date().toLocaleString()} for delivery at ${scheduledTime}`);

        // === COLLISION HANDLING: Archive undelivered paper first ===
        await this.archivePendingAnalysis(store);

        // Re-fetch settings in case archivePendingAnalysis modified them
        const settings = store.get('settings') || {};

        await this.triggerBakerScreenshotFirst(now, store, scheduledTime);
    }

    /**
     * DELIVERY BOY: Delivers the prepared analysis to the user.
     * This is where we notify the UI - at the user's requested time.
     */
    private async triggerDelivery(store: any, scheduledTime: string) {
        const settings = store.get('settings') || {};
        const analyses = store.get('analyses') || [];
        const latestAnalysis = analyses[0];

        if (!latestAnalysis) {
            console.warn('📬 Delivery Boy: No analysis found to deliver');
            return;
        }

        // Update status to 'ready'
        store.set('settings', {
            ...settings,
            lastDeliveryDate: new Date().toISOString(),
            analysisStatus: 'ready'
        });

        // NOW notify the user (could be at 8:00 AM or 5:59 PM - doesn't matter)
        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
            console.log(`📬 Delivering analysis (scheduled: ${scheduledTime}, actual: ${new Date().toLocaleTimeString()})`);
            this.mainWindow.webContents.send('analysis-ready', latestAnalysis);
        }

        console.log(`📬 Delivery complete! User notified.`);
    }

    // ==================== END BAKER & DELIVERY BOY ====================

    // ==================== DEBUG / TESTING ====================

    /**
     * DEBUG RUN: Immediately triggers the full analysis pipeline in VISIBLE mode.
     * Shortcut: Cmd+Shift+H
     *
     * Behavior:
     * - Bypasses all scheduling logic (Baker/Delivery phases)
     * - Forces headless: false (visible browser)
     * - Notifies UI immediately after completion (no pending_delivery state)
     */
    public async triggerDebugRun(): Promise<void> {
        await this.triggerDebugRunScreenshotFirst();
    }

    /** Stop the active debug run (Cmd+Shift+K). */
    public stopDebugRun(): void {
        if (this.activeDebugScraper) {
            console.log('🛑 Stopping debug run (Cmd+Shift+K)...');
            this.activeDebugScraper.stop();
        } else {
            console.log('🛑 No active debug run to stop');
        }
    }

    /**
     * DEBUG RUN (Screenshot-First): Uses the new screenshot-based architecture.
     */
    private async triggerDebugRunScreenshotFirst(): Promise<void> {
        console.log('🧪 Debug Run (Screenshot-First): Starting Visible Browsing Pipeline');

        const store = await this.getStore();
        const settings = store.get('settings') || {};
        const now = new Date();
        const scheduledTime = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

        // 90-minute max (matches normal baker run), or stop early with Cmd+Shift+K
        const MAX_DURATION_MS = 90 * 60 * 1000;
        const browserManager = BrowserManager.getInstance();
        let context = null;

        // Notify UI that debug run started
        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
            this.mainWindow.webContents.send('debug-run-started', {
                durationMs: MAX_DURATION_MS,
                startTime: Date.now()
            });
        }

        try {
            // 1. Get API Key
            const apiKey = await SecureKeyManager.getInstance().getKey();
            if (!apiKey) {
                console.error('🧪 Debug Run: NO API KEY');
                this.mainWindow?.webContents.send('analysis-error', { message: 'API key not found.' });
                this.mainWindow?.webContents.send('debug-run-complete', {});
                return;
            }

            // 2. Launch browser in VISIBLE mode
            console.log('🧪 Launching browser (VISIBLE mode)...');
            context = await browserManager.launch({ headless: false });

            // 3. Validate session
            console.log('🧪 Validating Instagram session...');
            const sessionCheck = await browserManager.validateSession();
            if (!sessionCheck.valid) {
                throw new Error(sessionCheck.reason || 'SESSION_EXPIRED');
            }

            // 4. Browse Instagram and capture screenshots (90 min max, or stop with Cmd+Shift+K)
            console.log('🧪 Browsing Instagram (90 min max, stop with Cmd+Shift+K)...');
            const scraper = new InstagramScraper(context, apiKey, true);  // debugMode = true
            this.activeDebugScraper = scraper;
            const session = await scraper.browseAndCapture(
                MAX_DURATION_MS / 60000,  // Convert to minutes (24h safety net)
                settings.interests || []
            );

            this.activeDebugScraper = null;
            console.log(`🧪 Browsing complete: ${session.captureCount} screenshots captured`);

            // 5. Close browser before generation
            await browserManager.close();
            context = null;

            // 6. Warn if very few captures, but don't abort — time is the only limit
            if (session.captureCount < 3) {
                console.warn(`🧪 Very few captures (${session.captureCount}), digest quality may be low`);
            }

            // 6.5. Tag and select best images (scale with capture count, cap at 50 for token limits)
            console.log('🧪 Tagging captured images for smart selection...');
            const tagger = new ImageTagger(apiKey, settings.interests || []);
            const { tags, tokensUsed: taggingTokens } = await tagger.tagBatch(session.captures);
            const selectCount = Math.min(50, session.captureCount);
            const bestCaptures = tagger.selectBest(session.captures, tags, selectCount);
            console.log(`🧪 Tagging used ${taggingTokens} tokens, selected ${bestCaptures.length} images`);

            // 7. Generate digest from SELECTED screenshots
            console.log('🧪 Generating digest from selected screenshots...');
            const digestGenerator = new BatchDigestGenerator(apiKey);
            const analysis = await digestGenerator.generateDigest(bestCaptures, {
                userName: settings.userName || 'User',
                interests: settings.interests || [],
                location: settings.location || ''
            });

            // 8. Save images to disk (only selected images to save space)
            const recordId = uuidv4();
            const userDataPath = app.getPath('userData');
            const recordDir = path.join(userDataPath, 'analysis_records');
            const imagesDir = path.join(recordDir, recordId, 'images');

            await fs.promises.mkdir(imagesDir, { recursive: true });

            // Build a set of selected image IDs for quick lookup
            const selectedIds = new Set(bestCaptures.map(c => c.id));

            // Build image metadata and save SELECTED files only
            const imageMetadata: { id: number; filename: string; source: string; interest?: string; tag?: { relevance: number; quality: number; description: string } }[] = [];
            for (const capture of bestCaptures) {
                const filename = `${capture.id}.jpg`;
                const imagePath = path.join(imagesDir, filename);
                await fs.promises.writeFile(imagePath, capture.screenshot);

                // Find the tag for this capture
                const captureTag = tags.find(t => t.imageId === capture.id);

                imageMetadata.push({
                    id: capture.id,
                    filename,
                    source: capture.source,
                    interest: capture.interest,
                    tag: captureTag ? {
                        relevance: captureTag.relevance,
                        quality: captureTag.quality,
                        description: captureTag.description
                    } : undefined
                });
            }

            console.log(`🖼️ Saved ${imageMetadata.length} selected images to ${imagesDir}`);

            // 9. Save analysis JSON with image metadata
            const analysisWithImages = {
                ...analysis,
                images: imageMetadata
            };

            const newRecord = {
                id: recordId,
                data: analysisWithImages,
                leadStoryPreview: analysis.sections[0]?.content[0]?.substring(0, 100) + "..." || "No preview available."
            };

            const recordPath = path.join(recordDir, `${recordId}.json`);
            const tempPath = path.join(recordDir, `${recordId}.tmp`);

            await fs.promises.writeFile(tempPath, JSON.stringify(newRecord, null, 2));
            await fs.promises.rename(tempPath, recordPath);

            console.log(`🧪 Saved digest to disk: ${recordPath}`);

            // 9. Save metadata to store
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

            // 10. IMMEDIATE DELIVERY
            store.set('settings', {
                ...store.get('settings'),
                lastAnalysisDate: now.toISOString(),
                analysisStatus: 'ready'
            });

            // 11. Notify UI immediately
            if (this.mainWindow && !this.mainWindow.isDestroyed()) {
                console.log('🧪 Notifying UI: analysis-ready');
                this.mainWindow.webContents.send('analysis-ready', metadataRecord);
                // Notify UI that debug run completed (stop timer)
                this.mainWindow.webContents.send('debug-run-complete', {});
            }

            console.log(`🧪 Debug Run (Screenshot-First) Complete! Captures: ${session.captureCount}`);

        } catch (error: any) {
            console.error('🧪 Debug Run Failed:', error.message);
            this.activeDebugScraper = null;

            if (context) {
                await browserManager.close();
            }

            if (this.mainWindow && !this.mainWindow.isDestroyed()) {
                this.mainWindow.webContents.send('analysis-error', {
                    message: `Debug run failed: ${error.message}`,
                    canRetry: true
                });
                // Notify UI that debug run completed (stop timer even on error)
                this.mainWindow.webContents.send('debug-run-complete', {});
            }
        }
    }

    // ==================== END DEBUG / TESTING ====================

    /**
     * BAKER (Screenshot-First Mode): Browse Instagram naturally, capture screenshots,
     * then batch-send to LLM for comprehensive digest generation.
     *
     * This is the new architecture that:
     * - Takes screenshots of each post/story during browsing
     * - No Vision API calls during browsing (all analysis at the end)
     * - LLM sees actual visual content instead of extracted descriptions
     */
    private async triggerBakerScreenshotFirst(now: Date, store: any, scheduledTime: string) {
        const settings = store.get('settings') || {};
        // No minimum capture gate — time is the only limit

        console.log(`🥐 Baker (Screenshot-First) - Starting Instagram browsing at ${new Date().toLocaleString()}`);

        const browserManager = BrowserManager.getInstance();
        let context = null;

        try {
            // 1. Get API Key
            const apiKey = await SecureKeyManager.getInstance().getKey();
            if (!apiKey) {
                throw new Error('NO_API_KEY');
            }

            // 2. Launch browser (headless for baker)
            console.log('🌐 Baker launching browser (headless)...');
            context = await browserManager.launch({ headless: true });

            // 3. Validate session
            console.log('🔐 Baker validating Instagram session...');
            const sessionCheck = await browserManager.validateSession();
            if (!sessionCheck.valid) {
                throw new Error(sessionCheck.reason || 'SESSION_EXPIRED');
            }

            // 4. Browse Instagram and capture screenshots
            console.log('📱 Baker browsing Instagram (Screenshot-First mode)...');
            const scraper = new InstagramScraper(context, apiKey);
            const session = await scraper.browseAndCapture(
                90,  // Normal mode: 90 minutes (range: 60-150 min)
                settings.interests || []
            );

            console.log(`📸 Baker browsing complete: ${session.captureCount} screenshots captured`);

            // 5. Close browser before generation
            await browserManager.close();
            context = null;

            // 6. Warn if very few captures, but don't abort
            if (session.captureCount < 3) {
                console.warn(`⚠️ Baker: Very few captures (${session.captureCount}), digest quality may be low`);
            }

            // 6.5. Tag and select best images (scale with capture count, cap at 50 for token limits)
            console.log('🏷️ Baker tagging captured images for smart selection...');
            const tagger = new ImageTagger(apiKey, settings.interests || []);
            const { tags, tokensUsed: taggingTokens } = await tagger.tagBatch(session.captures);
            const selectCount = Math.min(50, session.captureCount);
            const bestCaptures = tagger.selectBest(session.captures, tags, selectCount);
            console.log(`🏷️ Baker tagging used ${taggingTokens} tokens, selected ${bestCaptures.length} images`);

            // 7. Generate digest from SELECTED screenshots
            console.log('🤖 Baker generating digest from selected screenshots...');
            const digestGenerator = new BatchDigestGenerator(apiKey);
            const analysis = await digestGenerator.generateDigest(bestCaptures, {
                userName: settings.userName || 'User',
                interests: settings.interests || [],
                location: settings.location || ''
            });

            // 8. Save images to disk (only selected images to save space)
            const recordId = uuidv4();
            const userDataPath = app.getPath('userData');
            const recordDir = path.join(userDataPath, 'analysis_records');
            const imagesDir = path.join(recordDir, recordId, 'images');

            await fs.promises.mkdir(imagesDir, { recursive: true });

            // Build image metadata and save SELECTED files only
            const imageMetadata: { id: number; filename: string; source: string; interest?: string; tag?: { relevance: number; quality: number; description: string } }[] = [];
            for (const capture of bestCaptures) {
                const filename = `${capture.id}.jpg`;
                const imagePath = path.join(imagesDir, filename);
                await fs.promises.writeFile(imagePath, capture.screenshot);

                // Find the tag for this capture
                const captureTag = tags.find(t => t.imageId === capture.id);

                imageMetadata.push({
                    id: capture.id,
                    filename,
                    source: capture.source,
                    interest: capture.interest,
                    tag: captureTag ? {
                        relevance: captureTag.relevance,
                        quality: captureTag.quality,
                        description: captureTag.description
                    } : undefined
                });
            }

            console.log(`🖼️ Baker saved ${imageMetadata.length} selected images to ${imagesDir}`);

            // 9. Save analysis JSON with image metadata
            const analysisWithImages = {
                ...analysis,
                images: imageMetadata
            };

            const newRecord = {
                id: recordId,
                data: analysisWithImages,
                leadStoryPreview: analysis.sections[0]?.content[0]?.substring(0, 100) + "..." || "No preview available."
            };

            const recordPath = path.join(recordDir, `${recordId}.json`);
            const tempPath = path.join(recordDir, `${recordId}.tmp`);

            await fs.promises.writeFile(tempPath, JSON.stringify(newRecord, null, 2));
            await fs.promises.rename(tempPath, recordPath);

            console.log(`💾 Baker saved digest to disk: ${recordPath}`);

            // 9. Save metadata to store
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

            // 10. SILENT: Update status to 'pending_delivery' - NO NOTIFICATION!
            store.set('settings', {
                ...store.get('settings'),
                lastBakeDate: now.toISOString(),
                analysisStatus: 'pending_delivery'
            });

            console.log(`🥐 Baker (Screenshot-First) complete. Digest saved, awaiting delivery at ${scheduledTime}`);
            console.log(`✅ Screenshot-First Pipeline Complete. Captures: ${session.captureCount}`);
            // NO mainWindow.webContents.send() here - SILENT!

        } catch (error: any) {
            console.error('❌ Baker (Screenshot-First) pipeline failed:', error.message);

            // Ensure browser is closed
            if (context) {
                await browserManager.close();
            }

            // Log error but DON'T notify UI - baker is silent
            console.log(`🥐 Baker failed silently. No paper to deliver at ${scheduledTime}`);
        }
    }
}
