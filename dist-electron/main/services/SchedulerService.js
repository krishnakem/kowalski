import { powerMonitor } from 'electron';
import { LoremIpsumGenerator } from './LoremIpsumGenerator.js';
export class SchedulerService {
    static instance;
    checkInterval = null;
    mainWindow = null;
    constructor() { }
    static getInstance() {
        if (!SchedulerService.instance) {
            SchedulerService.instance = new SchedulerService();
        }
        return SchedulerService.instance;
    }
    setMainWindow(window) {
        this.mainWindow = window;
    }
    // Helper to dynamically load electron-store (ESM)
    async getStore() {
        const { default: Store } = await import('electron-store');
        return new Store();
    }
    // Format date in LOCAL timezone (avoids UTC conversion issues)
    formatLocalDate(date) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }
    stop() {
        if (this.checkInterval) {
            clearInterval(this.checkInterval);
            this.checkInterval = null;
        }
    }
    async initialize() {
        console.log('⏰ SchedulerService: Initialized.');
        this.startHeartbeat();
        // Restart heartbeat on system wake to ensure accuracy
        powerMonitor.on('resume', () => {
            console.log('⚡️ System Resumed: Restarting Heartbeat.');
            this.startHeartbeat();
        });
    }
    startHeartbeat() {
        if (this.checkInterval)
            clearInterval(this.checkInterval);
        // Check every minute
        this.checkInterval = setInterval(() => {
            this.checkSchedule();
        }, 60 * 1000);
        // Run immediate check in case we launched right on the minute or need to catch up
        this.checkSchedule();
    }
    /**
     * Ensures the daily schedule snapshot is up-to-date.
     * - On first run after onboarding: Creates snapshot with activeDate = TOMORROW
     * - On new calendar day: Refreshes snapshot from current settings
     * - Otherwise: Returns existing snapshot
     */
    async ensureDailySnapshot(store) {
        const settings = (store.get('settings') || {});
        // Don't create snapshot if user hasn't completed onboarding
        if (!settings.hasOnboarded) {
            return null;
        }
        const today = this.formatLocalDate(new Date());
        let activeSchedule = store.get('activeSchedule');
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
                activeDate: tomorrowStr // First schedule activates tomorrow
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
    async checkSchedule() {
        try {
            const store = await this.getStore();
            // Get the locked schedule for today (or null if not onboarded)
            const activeSchedule = await this.ensureDailySnapshot(store);
            if (!activeSchedule) {
                // User hasn't onboarded, or schedule is for tomorrow - skip
                return;
            }
            const settings = (store.get('settings') || {});
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
        }
        catch (error) {
            console.error('Scheduler Check Failed:', error);
        }
    }
    /**
     * Determines if we should trigger based on current time, target time, and last run.
     * Logic:
     * 1. Parse target time (e.g., "8:00 AM") into a Date object for TODAY.
     * 2. If NOW is >= Target Time AND Last Run was BEFORE Target Time (or never), then TRIGGER.
     * 3. Tolerance: Only trigger if within 12 hours of the missed slot to avoid ancient catch-ups.
     */
    shouldTrigger(now, targetTimeStr, lastRunIso) {
        if (!targetTimeStr)
            return false;
        // Parse target time for TODAY
        const [time, modifier] = targetTimeStr.split(' ');
        let [hours, minutes] = time.split(':').map(Number);
        if (modifier === 'PM' && hours < 12)
            hours += 12;
        if (modifier === 'AM' && hours === 12)
            hours = 0;
        const targetTimeToday = new Date(now);
        targetTimeToday.setHours(hours, minutes, 0, 0);
        // 1. If we haven't reached the target time yet today, wait.
        if (now < targetTimeToday)
            return false;
        // 2. Check if we already ran for this slot TODAY (or after it)
        if (lastRunIso) {
            const lastRun = new Date(lastRunIso);
            if (lastRun.getTime() >= targetTimeToday.getTime()) {
                return false;
            }
        }
        // 3. Catch-Up Tolerance (e.g., 12 hours)
        const diffMs = now.getTime() - targetTimeToday.getTime();
        const twelveHoursMs = 12 * 60 * 60 * 1000;
        if (diffMs > twelveHoursMs) {
            return false;
        }
        return true;
    }
    async triggerSimulation(now, store, scheduledTime) {
        const settings = store.get('settings') || {};
        // 1. Generate Content with User Context (including the scheduled time slot)
        const mockAnalysis = LoremIpsumGenerator.generate({
            userName: settings.userName,
            location: settings.location,
            scheduledTime: scheduledTime
        });
        // 2. Persist
        const newRecord = {
            id: `analysis-sim-${Date.now()}`,
            data: mockAnalysis,
            leadStoryPreview: mockAnalysis.sections[0]?.content[0]?.substring(0, 100) + "..." || "No preview available."
        };
        const currentAnalyses = store.get('analyses') || [];
        const updatedAnalyses = [newRecord, ...currentAnalyses];
        store.set('analyses', updatedAnalyses);
        // 3. Update State
        store.set('settings', {
            ...settings,
            lastAnalysisDate: now.toISOString(),
            analysisStatus: 'ready'
        });
        // 4. Zero-Cost Logging
        console.log('🤖 Simulation Complete. Estimated Cost: $0.00 (Zero-Cost Mode)');
        // 5. Notify UI (Push)
        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
            console.log('📡 Push Notification Sent: analysis-ready');
            this.mainWindow.webContents.send('analysis-ready', newRecord);
        }
    }
}
