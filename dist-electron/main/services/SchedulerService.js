import { app, powerMonitor, powerSaveBlocker } from 'electron';
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { LoremIpsumGenerator } from './LoremIpsumGenerator.js';
// Next-Day Effect: Locked schedule that only updates on new calendar days
// (Imported ActiveSchedule)
export class SchedulerService {
    static instance;
    checkInterval = null;
    mainWindow = null;
    alignmentTimeout = null;
    lastWakeTime = new Date(); // Track when app started/woke
    suspensionBlockerId = null;
    constructor() { }
    static getInstance() {
        if (!SchedulerService.instance) {
            SchedulerService.instance = new SchedulerService();
        }
        return SchedulerService.instance;
    }
    getLastWakeTime() {
        return this.lastWakeTime;
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
        if (this.alignmentTimeout) {
            clearTimeout(this.alignmentTimeout);
            this.alignmentTimeout = null;
        }
        this.disableInsomnia();
    }
    async initialize() {
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
    startHeartbeat() {
        // Clear existing timers
        if (this.checkInterval)
            clearInterval(this.checkInterval);
        if (this.alignmentTimeout)
            clearTimeout(this.alignmentTimeout);
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
        // console.log(`⏰ SchedulerService: Aligning heartbeat. Waiting ${msUntilNextMinute}ms for minute boundary.`);
        // Run immediate check for catch-up (in case we missed a slot while app was closed)
        this.checkSchedule();
        // Wait for top of minute
        this.alignmentTimeout = setTimeout(() => {
            // console.log('⏰ SchedulerService: Minute boundary reached. Starting precision intervals.');
            // Execute exactly on the minute
            this.checkSchedule();
            // Start regular interval
            this.checkInterval = setInterval(() => {
                this.checkSchedule();
            }, 60000);
        }, msUntilNextMinute);
    }
    // --- INSOMNIA MANAGEMENT ---
    insomniaProcess = null; // Type 'ChildProcess' needs import or 'any'
    handleInsomniaState() {
        if (!powerMonitor.isOnBatteryPower()) {
            this.enableInsomnia();
        }
        else {
            this.disableInsomnia();
        }
    }
    enableInsomnia() {
        if (this.insomniaProcess)
            return; // Already running
        console.log('🔋 AC Power detected: Insomnia Mode active (Preventing System Sleep)');
        // Use standard import (added to top of file)
        this.insomniaProcess = spawn('caffeinate', ['-i', '-s', '-w', process.pid.toString()]);
        this.insomniaProcess.on('close', (code) => {
            console.log(`☕️ Insomnia Process exited with code ${code}`);
            this.insomniaProcess = null;
        });
    }
    disableInsomnia() {
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
    async checkSchedule() {
        // Log precise execution time for debugging
        // console.log("Scheduler Triggered at: " + new Date().toISOString());
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
            // PULSE: Send Heartbeat to UI
            // This ensures that if the UI is stuck in "Tomorrow" mode (due to clock jump/race condition),
            // it receives a fresh signal that the schedule is indeed TODAY.
            // We do this every minute.
            this.mainWindow?.webContents.send('schedule-updated', activeSchedule);
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
    // catchUpMissedSlots removed for Daemon Mode (Anti-Burst)
    /**
     * Helper to determine if a slot is still viable for TODAY based on time and buffer.
     */
    canScheduleForToday(targetTimeStr) {
        const now = new Date();
        const [time, modifier] = targetTimeStr.split(' ');
        let [hours, minutes] = time.split(':').map(Number);
        if (modifier === 'PM' && hours < 12)
            hours += 12;
        if (modifier === 'AM' && hours === 12)
            hours = 0;
        const targetDate = new Date(now);
        targetDate.setHours(hours, minutes, 0, 0);
        // 1. If time passed, obviously not.
        if (now >= targetDate)
            return false;
        // 2. Check Buffer (Reuse logic from shouldTrigger or duplicate for safety)
        const prepTimeMs = targetDate.getTime() - this.lastWakeTime.getTime();
        // TEST OVERRIDE: 15 seconds
        const threeHoursMs = 15 * 1000;
        const uptimeSeconds = process.uptime();
        const threeHoursSeconds = 15;
        if (prepTimeMs < threeHoursMs && uptimeSeconds < threeHoursSeconds) {
            console.log(`🛡️ Initial Snapshot: Skipping Today. Too close to wake/boot. (${Math.floor(uptimeSeconds)}s uptime)`);
            return false;
        }
        return true;
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
        // 1.5 CHECK: 3-Hour Preparation Buffer
        // If the machine woke up too close to the target time, skip it.
        // Diff = TargetTime - WakeTime
        // Diff = TargetTime - WakeTime
        const prepTimeMs = targetTimeToday.getTime() - this.lastWakeTime.getTime();
        // TEST OVERRIDE: 15 seconds instead of 3 hours
        const threeHoursMs = 15 * 1000;
        // Condition: triggers only if we have > 15 seconds of "uptime" before the slot
        // LOGIC FIX: Check BOTH "Date-based" prep time AND "Process Uptime"
        // If the app has been running for > 15 seconds (process.uptime), we consider it buffered/ready regardless of wake quirks.
        const uptimeSeconds = process.uptime();
        const threeHoursSeconds = 15;
        if (prepTimeMs < threeHoursMs && uptimeSeconds < threeHoursSeconds) {
            console.log(`🛡️ Skipping Slot ${targetTimeStr}: Not enough prep time (DateDiff: ${Math.floor(prepTimeMs / 60000)}m, Uptime: ${Math.floor(uptimeSeconds / 60)}m < 180m)`);
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
    async triggerSimulation(now, store, scheduledTime, targetDate, silent = false) {
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
        console.log(`🌑 Background Task Started at ${new Date().toLocaleString()}`);
        // 2. Persist
        const newRecord = {
            id: `analysis-sim-${Date.now()}-${Math.floor(Math.random() * 1000)}`, // Random suffix to avoid collision in fast loops
            data: mockAnalysis,
            leadStoryPreview: mockAnalysis.sections[0]?.content[0]?.substring(0, 100) + "..." || "No preview available."
        };
        // FILE-BASED STORAGE MIGRATION
        // A. Atomic Write (Write to temp -> Rename) to prevent partial writes
        const userDataPath = app.getPath('userData');
        const recordDir = path.join(userDataPath, 'analysis_records');
        const recordPath = path.join(recordDir, `${newRecord.id}.json`);
        // Temp path for atomic swap
        const tempPath = path.join(recordDir, `${newRecord.id}.tmp`);
        try {
            // 1. Write to temporary file first
            await fs.promises.writeFile(tempPath, JSON.stringify(newRecord, null, 2));
            // 2. Atomic Rename (This is the "Commit" step)
            await fs.promises.rename(tempPath, recordPath);
            console.log(`💾 Saved Full Analysis cleanly to disk: ${recordPath}`);
            // B. Save METADATA ONLY to Store (Lightweight)
            // MOVED INSIDE TRY: Only update store if file write succeeded
            const metadataRecord = {
                id: newRecord.id,
                // Keep critical fields for sorting/listing
                data: {
                    date: newRecord.data.date, // Used for sorting
                    title: newRecord.data.title,
                    scheduledTime: newRecord.data.scheduledTime,
                    location: newRecord.data.location
                    // REMOVED: sections (heavy text)
                },
                leadStoryPreview: newRecord.leadStoryPreview
            };
            const currentAnalyses = store.get('analyses') || [];
            const updatedAnalyses = [metadataRecord, ...currentAnalyses];
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
            console.log(`🌕 Background Task Completed at ${new Date().toLocaleString()}`);
            console.log(`🤖 Simulation Complete (${silent ? 'Silent/Historical' : 'Live'}). Estimated Cost: $0.00`);
            // 5. Notify UI (Push) - Only if not silent
            if (!silent && this.mainWindow && !this.mainWindow.isDestroyed()) {
                console.log('📡 Push Notification Sent: analysis-ready (Metadata Only)');
                // OPTIMIZATION: Send only metadata, not the full blob.
                // The UI doesn't need the full text until the user opens the archive.
                this.mainWindow.webContents.send('analysis-ready', metadataRecord);
            }
        }
        catch (e) {
            console.error('❌ Failed to save analysis to disk (Atomic Write Failed). Aborting metadata update.', e);
            // Notify UI of the critical failure so it can show a toast/error state
            if (this.mainWindow && !this.mainWindow.isDestroyed()) {
                this.mainWindow.webContents.send('analysis-error', { message: 'Failed to save analysis to disk.' });
            }
            // Cleanup temp file if it exists
            try {
                if (fs.existsSync(tempPath))
                    await fs.promises.unlink(tempPath);
            }
            catch (cleanupErr) { /* ignore */ }
            return; // Abort - Do not update metadata or notify user
        }
    }
}
