import { app } from 'electron';
import path from 'path';
import fs from 'fs';
import { chromium } from 'playwright-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
// Apply stealth plugin globally to this chromium instance
chromium.use(StealthPlugin());
export class BrowserManager {
    static instance;
    browserContext = null;
    constructor() { }
    static getInstance() {
        if (!BrowserManager.instance) {
            BrowserManager.instance = new BrowserManager();
        }
        return BrowserManager.instance;
    }
    /**
     * Launches a persistent browser context.
     * If an instance is already running, it closes it first to prevent zombies.
     */
    async launch(config = { headless: true }) {
        // 1. Zombie Prevention: Cleanup any existing instance
        if (this.browserContext) {
            console.log('♻️ BrowserManager: Closing existing instance before launch...');
            await this.close();
        }
        try {
            const userDataPath = app.getPath('userData');
            const persistentContextPath = path.join(userDataPath, 'kowalski_browser');
            console.log(`🚀 BrowserManager: Launching Persistent Context at: ${persistentContextPath}`);
            console.log(`   Headless: ${config.headless}`);
            // 2. Launch Persistent Context
            // Handle Overlay Args if provided (via some config, or just modify launch to accept args if needed later)
            // Ideally launch() should accept an args array override, OR we check if we are in "login mode".
            // Simplify: We will just modify launch to accept launchOptions override.
            // Actually, let's keep launch simple and hardcode the overlay check for now or
            // refactor launch to accept { headless, bounds? }.
            // For now, let's assume standard launch is fine, BUT we need the overlay args.
            // CRITICAL REFACTOR: Updating launch signature to support dynamic args is risky for regression.
            // Better: launch() accepts optional 'args' array to append.
            const extraArgs = [];
            if (config.bounds) {
                // FORCE FRAMELESS APP MODE
                // --app makes it look like a standalone app (no tabs/url bar)
                // --test-type removes the "Chrome is being controlled by automated test software" banner
                extraArgs.push(`--app=https://www.instagram.com/accounts/login/`);
                extraArgs.push('--frameless');
                extraArgs.push('--always-on-top'); // Keep it floating above the locked Main Window
                extraArgs.push(`--window-position=${config.bounds.x},${config.bounds.y}`);
                extraArgs.push(`--window-size=${config.bounds.width},${config.bounds.height}`);
            }
            // 2. Launch Persistent Context
            // POINT TO CUSTOM "KOWALSKI" APP (Stealth/Icon Mask)
            const userHome = app.getPath('home');
            // Hardcoded based on our setup script logic (chromium-1200)
            const customExecutablePath = path.join(userHome, 'Library/Caches/ms-playwright/chromium-1200/chrome-mac-arm64/Kowalski.app/Contents/MacOS/Google Chrome for Testing');
            // Verify it exists, else fallback to default (empty string lets PW decide)
            let executablePath = '';
            if (fs.existsSync(customExecutablePath)) {
                console.log('🕵️‍♀️ BrowserManager: Using Custom Stealth Browser:', customExecutablePath);
                executablePath = customExecutablePath;
            }
            else {
                console.warn('⚠️ BrowserManager: Custom browser not found. Using default.');
            }
            this.browserContext = await chromium.launchPersistentContext(persistentContextPath, {
                headless: config.headless,
                executablePath: executablePath || undefined,
                viewport: null, // Let window size dictate viewport
                userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                args: [
                    '--disable-blink-features=AutomationControlled', // Mask WebDriver
                    '--disable-infobars',
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-accelerated-2d-canvas',
                    '--disable-gpu', // Often helps stability in headless envs
                    ...extraArgs
                ],
                // Accept downloads if needed later
                acceptDownloads: true,
            });
            // 2.5 MIGRATION: Sync Session from Onboarding (session.json) -> Persistent Context
            // The user logs in via the Electron Webview (Onboarding), which saves to "session.json".
            // We need to inject those cookies into this new Persistent Context so they are shared.
            try {
                const sessionPath = path.join(userDataPath, 'session.json');
                if (fs.existsSync(sessionPath)) {
                    console.log('🍪 BrowserManager: Found session.json from Onboarding. Injecting cookies...');
                    const sessionData = JSON.parse(fs.readFileSync(sessionPath, 'utf-8'));
                    if (sessionData && Array.isArray(sessionData.cookies)) {
                        await this.browserContext.addCookies(sessionData.cookies);
                        console.log(`✅ BrowserManager: Injected ${sessionData.cookies.length} cookies from session.json`);
                    }
                }
            }
            catch (err) {
                console.error('⚠️ BrowserManager: Failed to sync session.json cookies:', err);
                // Non-critical, continue launching
            }
            // 3. Extra Safety (Closing logic on disconnect)
            this.browserContext.on('close', () => {
                console.log('❌ BrowserManager: Context closed unexpectedly (or manually). Clearing reference.');
                this.browserContext = null;
            });
            return this.browserContext;
        }
        catch (error) {
            console.error('🔥 BrowserManager: Failed to launch browser:', error);
            // Ensure cleanup on failure
            this.browserContext = null;
            throw error;
        }
    }
    /**
     * Safely closes the current browser instance.
     */
    async close() {
        if (!this.browserContext)
            return;
        try {
            console.log('🛑 BrowserManager: Closing browser...');
            await this.browserContext.close();
        }
        catch (error) {
            console.error('⚠️ BrowserManager: Error during close (likely already closed):', error);
        }
        finally {
            this.browserContext = null;
        }
    }
    /**
     * NUCLEAR OPTION: Closes the browser and WIPES the persistent profile directory.
     * Used for "Reset All" functionality.
     */
    async clearData() {
        console.log('☢️ BrowserManager: Initiating Data Wipe...');
        // 1. Force Close
        await this.close();
        // 2. Delete Folder
        try {
            const userDataPath = app.getPath('userData');
            const persistentContextPath = path.join(userDataPath, 'kowalski_browser');
            if (fs.existsSync(persistentContextPath)) {
                fs.rmSync(persistentContextPath, { recursive: true, force: true });
                console.log('✅ BrowserManager: Wiped kowalski_browser directory.');
            }
            else {
                console.log('ℹ️ BrowserManager: No directory to wipe.');
            }
        }
        catch (error) {
            console.error('❌ BrowserManager: Failed to wipe data:', error);
            // Don't throw, we want reset to continue best-effort
        }
    }
    /**
     * Launches a frameless overlay for login, locked to the UI.
     */
    async login(bounds, mainWindow) {
        console.log('🔐 BrowserManager: Starting Single Vehicle Login Overlay...');
        // 1. Lock the Main Window
        mainWindow.setMovable(false);
        try {
            // 2. Launch Persistent Context (Frameless at specific coordinates)
            const context = await this.launch({ headless: false, bounds: bounds }); // Ensure launch cleans up old instances
            // 3. Get the Overlay Page (Re-use the one created by --app)
            // If --app is used, Chromium opens a window immediately. newPage() creates a SECOND window (with UI).
            const pages = context.pages();
            const page = pages.length > 0 ? pages[0] : await context.newPage();
            // ENFORCE SINGLE WINDOW:
            // If user clicks Dock Icon, Chrome might spawn a new window. We don't want that.
            context.on('page', async (newPage) => {
                // Use a small delay to let the initial page settle
                await new Promise(resolve => setTimeout(resolve, 100));
                const allPages = context.pages();
                if (allPages.length > 1) {
                    console.log('🚫 BrowserManager: Blocked attempt to open new window.');
                    try {
                        await newPage.close();
                    }
                    catch (e) {
                        // Page might already be closed
                    }
                }
            });
            // Note: --app=URL already navigates to the login page, so we don't call page.goto()
            // Just wait for the page to be ready
            console.log('🌍 Waiting for Instagram Login page to be ready...');
            // Wait for the page to finish loading (or at least get to a stable state)
            try {
                await page.waitForLoadState('domcontentloaded', { timeout: 10000 });
            }
            catch (e) {
                console.log('⚠️ Page load state wait timed out, continuing anyway...');
            }
            // 4. Wait for Login Success
            // We look for the "Home" icon SVG, or a specific cookie.
            try {
                console.log('⏳ Waiting for user to complete login...');
                await page.waitForSelector('svg[aria-label="Home"]', { timeout: 300000 }); // 5 min timeout for user to type
                console.log('✅ INSTAGRAM LOGIN CONFIRMED (Overlay)');
                // 5. Cleanup on Success
                await this.close();
                mainWindow.setMovable(true);
                return true;
            }
            catch (e) {
                console.log('❌ Login/Timeout failed.');
                throw e; // Bubble up to close
            }
        }
        catch (error) {
            console.error('⚠️ Login Overlay Failed/Cancelled:', error);
            // Cleanup on Error
            await this.close();
            mainWindow.setMovable(true);
            return false;
        }
    }
    /**
     * Returns the current active context, or null if not running.
     */
    getContext() {
        return this.browserContext;
    }
}
