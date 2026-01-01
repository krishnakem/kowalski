
import { BrowserWindow, powerMonitor } from 'electron';
import { LoremIpsumGenerator } from './LoremIpsumGenerator.js';
import { v4 as uuidv4 } from 'uuid';
import { ActiveSchedule } from '../../types/schedule.js';

interface SchedulerSettings {
    digestFrequency: 1 | 2;
    morningTime: string;
    eveningTime: string;
    lastAnalysisDate?: string;
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

    // Helper to dynamically load electron-store (ESM)
    private async getStore(): Promise<any> {
        const { default: Store } = await import('electron-store');
        return new Store();
    }

    // Format date in LOCAL timezone (avoids UTC conversion issues)
    private formatLocalDate(date: Date): string {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
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
    }

    public async initialize(): Promise<void> {
        console.log('⏰ SchedulerService: Initialized.');
        this.lastWakeTime = new Date();
        console.log('⏰ Wake Time set to:', this.lastWakeTime.toLocaleString());

        // DAEMON MODE: No Catch-Up. Start watching immediately.
        this.startHeartbeat();


        // Restart heartbeat on system wake to ensure accuracy
        powerMonitor.on('resume', () => {
            console.log('⚡️ System Resumed: Restarting Heartbeat.');
            this.lastWakeTime = new Date(); // Reset wake time on resume
            console.log('⏰ Wake Time updated to:', this.lastWakeTime.toLocaleString());
            this.startHeartbeat();
        });
    }

    private startHeartbeat() {
        // Clear existing timers
        if (this.checkInterval) clearInterval(this.checkInterval);
        if (this.alignmentTimeout) clearTimeout(this.alignmentTimeout);

        const now = new Date();
        const msUntilNextMinute = 60000 - (now.getTime() % 60000);

        console.log(`⏰ SchedulerService: Aligning heartbeat. Waiting ${msUntilNextMinute}ms for minute boundary.`);

        // Run immediate check for catch-up (in case we missed a slot while app was closed)
        this.checkSchedule();

        // Wait for top of minute
        this.alignmentTimeout = setTimeout(() => {
            console.log('⏰ SchedulerService: Minute boundary reached. Starting precision intervals.');

            // Execute exactly on the minute
            this.checkSchedule();

            // Start regular interval
            this.checkInterval = setInterval(() => {
                this.checkSchedule();
            }, 60000);
        }, msUntilNextMinute);
    }

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
        if (!activeSchedule) {
            const tomorrow = new Date();
            tomorrow.setDate(tomorrow.getDate() + 1);
            const tomorrowStr = this.formatLocalDate(tomorrow);

            activeSchedule = {
                morningTime: settings.morningTime || '8:00 AM',
                eveningTime: settings.eveningTime || '4:00 PM',
                digestFrequency: settings.digestFrequency || 1,
                activeDate: tomorrowStr  // First schedule activates tomorrow
            };
            store.set('activeSchedule', activeSchedule);
            console.log(`📅 First Daily Snapshot Created. Active starting ${tomorrowStr}:`, activeSchedule);
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
        }

        return activeSchedule;
    }

    private async checkSchedule() {
        // Log precise execution time for debugging
        console.log("Scheduler Triggered at: " + new Date().toISOString());

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

            // Only check if today matches the active schedule date
            if (activeSchedule.activeDate !== todayStr) {
                // Schedule is for tomorrow (first-run scenario)
                return;
            }

            // Check Morning Slot using LOCKED schedule times
            if (this.shouldTrigger(now, activeSchedule.morningTime, settings.lastAnalysisDate)) {
                console.log(`🚀 Scheduling Trigger (Morning: ${activeSchedule.morningTime})`);
                await this.triggerSimulation(now, store, activeSchedule.morningTime);
                return;
            }

            // Check Evening Slot (if frequency is 2) using LOCKED schedule
            if (activeSchedule.digestFrequency === 2 && this.shouldTrigger(now, activeSchedule.eveningTime, settings.lastAnalysisDate)) {
                console.log(`🚀 Scheduling Trigger (Evening: ${activeSchedule.eveningTime})`);
                await this.triggerSimulation(now, store, activeSchedule.eveningTime);
                return;
            }

        } catch (error) {
            console.error('Scheduler Check Failed:', error);
        }
    }

    // catchUpMissedSlots removed for Daemon Mode (Anti-Burst)

    /**
     * Determines if we should trigger based on current time, target time, and last run.
     * Logic: 
     * 1. Parse target time (e.g., "8:00 AM") into a Date object for TODAY.
     * 2. If NOW is >= Target Time AND Last Run was BEFORE Target Time (or never), then TRIGGER.
     * 3. Tolerance: Only trigger if within 12 hours of the missed slot to avoid ancient catch-ups.
     */
    private shouldTrigger(now: Date, targetTimeStr: string, lastRunIso?: string): boolean {
        if (!targetTimeStr) return false;

        // Parse target time for TODAY
        const [time, modifier] = targetTimeStr.split(' ');
        let [hours, minutes] = time.split(':').map(Number);

        if (modifier === 'PM' && hours < 12) hours += 12;
        if (modifier === 'AM' && hours === 12) hours = 0;

        const targetTimeToday = new Date(now);
        targetTimeToday.setHours(hours, minutes, 0, 0);

        // 1. If we haven't reached the target time yet today, wait.
        if (now < targetTimeToday) return false;

        // 1.5 CHECK: 3-Hour Preparation Buffer
        // If the machine woke up too close to the target time, skip it.
        // Diff = TargetTime - WakeTime
        const prepTimeMs = targetTimeToday.getTime() - this.lastWakeTime.getTime();
        const threeHoursMs = 3 * 60 * 60 * 1000;

        // Condition: triggers only if we have > 3 hours of "uptime" before the slot
        if (prepTimeMs < threeHoursMs) {
            console.log(`🛡️ Skipping Slot ${targetTimeStr}: Not enough prep time (${Math.floor(prepTimeMs / 60000)}m < 180m)`);
            return false;
        }

        // 2. Check if we already ran for this slot TODAY (or after it)
        if (lastRunIso) {
            const lastRun = new Date(lastRunIso);
            if (lastRun.getTime() >= targetTimeToday.getTime()) {
                return false;
            }
        }

        // 3. Catch-Up Tolerance (e.g., 30 minutes for daemon mode)
        const diffMs = now.getTime() - targetTimeToday.getTime();
        const thirtyMinutesMs = 30 * 60 * 1000;

        if (diffMs > thirtyMinutesMs) {
            return false;
        }

        return true;
    }

    private async triggerSimulation(now: Date, store: any, scheduledTime: string, targetDate?: Date, silent: boolean = false) {
        const settings = store.get('settings') || {};

        // If targetDate provided, use it. Otherwise use 'now'
        const effectiveDate = targetDate || now;

        // 1. Generate Content with User Context (including the scheduled time slot)
        const mockAnalysis = LoremIpsumGenerator.generate({
            userName: settings.userName,
            location: settings.location,
            scheduledTime: scheduledTime,
            targetDate: effectiveDate
        });

        // 2. Persist
        const newRecord = {
            id: `analysis-sim-${Date.now()}-${Math.floor(Math.random() * 1000)}`, // Random suffix to avoid collision in fast loops
            data: mockAnalysis,
            leadStoryPreview: mockAnalysis.sections[0]?.content[0]?.substring(0, 100) + "..." || "No preview available."
        };

        const currentAnalyses = store.get('analyses') || [];
        const updatedAnalyses = [newRecord, ...currentAnalyses];
        store.set('analyses', updatedAnalyses);

        // 3. Update State
        // If silent (catch-up), mark as 'idle' so user isn't bombarded. Only final one (not silent) marks 'ready'.
        const newStatus = silent ? 'idle' : 'ready';

        store.set('settings', {
            ...settings,
            lastAnalysisDate: effectiveDate.toISOString(),
            analysisStatus: newStatus
        });

        // 4. Zero-Cost Logging
        console.log(`🤖 Simulation Complete (${silent ? 'Silent/Historical' : 'Live'}). Estimated Cost: $0.00`);

        // 5. Notify UI (Push) - Only if not silent
        if (!silent && this.mainWindow && !this.mainWindow.isDestroyed()) {
            console.log('📡 Push Notification Sent: analysis-ready');
            this.mainWindow.webContents.send('analysis-ready', newRecord);
        }
    }
}
