import { app, BrowserWindow } from 'electron';
import path from 'path';
import fs from 'fs';
import { chromium } from 'playwright-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { BrowserContext, Page } from 'playwright';
import { ChromiumVersionHelper } from './ChromiumVersionHelper.js';
import { SessionValidationResult } from '../../types/instagram.js';

// Configure stealth plugin with all evasions enabled for maximum anti-detection
const stealth = StealthPlugin();
stealth.enabledEvasions.add('chrome.app');
stealth.enabledEvasions.add('chrome.csi');
stealth.enabledEvasions.add('chrome.loadTimes');
stealth.enabledEvasions.add('chrome.runtime');
stealth.enabledEvasions.add('iframe.contentWindow');
stealth.enabledEvasions.add('media.codecs');
stealth.enabledEvasions.add('navigator.hardwareConcurrency');
stealth.enabledEvasions.add('navigator.languages');
stealth.enabledEvasions.add('navigator.permissions');
stealth.enabledEvasions.add('navigator.plugins');
stealth.enabledEvasions.add('navigator.vendor');
stealth.enabledEvasions.add('navigator.webdriver');
stealth.enabledEvasions.add('sourceurl');
stealth.enabledEvasions.add('user-agent-override');
stealth.enabledEvasions.add('webgl.vendor');
stealth.enabledEvasions.add('window.outerdimensions');

chromium.use(stealth);

// GPU profiles for WebGL fingerprint randomization
// Using common GPU configurations to avoid statistical anomalies
const GPU_PROFILES = [
    { vendor: 'Intel Inc.', renderer: 'Intel Iris OpenGL Engine' },
    { vendor: 'Intel Inc.', renderer: 'Intel HD Graphics 630' },
    { vendor: 'Intel Inc.', renderer: 'Intel UHD Graphics 620' },
    { vendor: 'Apple Inc.', renderer: 'Apple M1' },
    { vendor: 'Apple Inc.', renderer: 'Apple M2' },
    { vendor: 'Google Inc. (Apple)', renderer: 'ANGLE (Apple, Apple M1, OpenGL 4.1)' },
];

interface BrowserLaunchConfig {
    headless: boolean;
    bounds?: Electron.Rectangle;
}

export class BrowserManager {
    private static instance: BrowserManager;
    private browserContext: BrowserContext | null = null;

    private constructor() { }

    public static getInstance(): BrowserManager {
        if (!BrowserManager.instance) {
            BrowserManager.instance = new BrowserManager();
        }
        return BrowserManager.instance;
    }

    /**
     * Launches a persistent browser context.
     * If an instance is already running, it closes it first to prevent zombies.
     */
    public async launch(config: BrowserLaunchConfig = { headless: true }): Promise<BrowserContext> {
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
                // APP MODE: Removes address bar and tabs for a cleaner login experience
                // Note: --frameless is not a valid Chromium flag, removed to prevent crashes
                extraArgs.push(`--app=https://www.instagram.com/accounts/login/`);
                extraArgs.push(`--window-position=${config.bounds.x},${config.bounds.y}`);
                extraArgs.push(`--window-size=${config.bounds.width},${config.bounds.height}`);
            }

            // 2. Launch Persistent Context
            // POINT TO CUSTOM "KOWALSKI" APP (Stealth/Icon Mask)
            // Uses dynamic revision detection for cross-version compatibility
            const customExecutablePath = ChromiumVersionHelper.getCustomExecutablePath();
            console.log('🔍 DEBUG: Custom executable path:', customExecutablePath);

            // Verify it exists, else fallback to default (empty string lets PW decide)
            let executablePath = '';
            if (fs.existsSync(customExecutablePath)) {
                console.log('🕵️‍♀️ BrowserManager: Using Custom Stealth Browser:', customExecutablePath);
                executablePath = customExecutablePath;
            } else {
                console.warn('⚠️ BrowserManager: Custom browser not found at:', customExecutablePath);
                console.warn('⚠️ BrowserManager: Using Playwright default browser.');
            }

            // Detect system timezone for fingerprint consistency
            const systemTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

            console.log('🔍 DEBUG: About to launch with config:', {
                headless: config.headless,
                executablePath: executablePath || 'DEFAULT',
                persistentContextPath,
                extraArgs,
                userAgent: ChromiumVersionHelper.generateUserAgent()
            });

            this.browserContext = await chromium.launchPersistentContext(persistentContextPath, {
                headless: config.headless,
                executablePath: executablePath || undefined,
                viewport: null, // Let window size dictate viewport (deviceScaleFactor not compatible with null viewport)
                // Dynamic User-Agent that matches actual Chromium version (auto-detected)
                userAgent: ChromiumVersionHelper.generateUserAgent(),

                // Fingerprint consistency options
                locale: 'en-US',
                timezoneId: systemTimezone,
                colorScheme: 'light',
                // Note: deviceScaleFactor removed - not compatible with viewport: null

                // HTTP headers that Chrome normally sends
                extraHTTPHeaders: {
                    'Accept-Language': 'en-US,en;q=0.9',
                },

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

            // WebGL fingerprint masking - randomize GPU from common profiles
            // Select a random GPU profile for this session to avoid statistical anomalies
            const selectedGpu = GPU_PROFILES[Math.floor(Math.random() * GPU_PROFILES.length)];
            console.log(`🎮 WebGL Fingerprint: ${selectedGpu.vendor} / ${selectedGpu.renderer}`);

            await this.browserContext.addInitScript((gpu: { vendor: string; renderer: string }) => {
                // Override WebGL vendor/renderer to avoid unique fingerprint detection
                const getParameterProto = WebGLRenderingContext.prototype.getParameter;
                WebGLRenderingContext.prototype.getParameter = function(parameter: number) {
                    // UNMASKED_VENDOR_WEBGL
                    if (parameter === 37445) {
                        return gpu.vendor;
                    }
                    // UNMASKED_RENDERER_WEBGL
                    if (parameter === 37446) {
                        return gpu.renderer;
                    }
                    return getParameterProto.call(this, parameter);
                };

                // Also handle WebGL2
                const getParameterProto2 = WebGL2RenderingContext.prototype.getParameter;
                WebGL2RenderingContext.prototype.getParameter = function(parameter: number) {
                    if (parameter === 37445) {
                        return gpu.vendor;
                    }
                    if (parameter === 37446) {
                        return gpu.renderer;
                    }
                    return getParameterProto2.call(this, parameter);
                };
            }, selectedGpu);

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
            } catch (err) {
                console.error('⚠️ BrowserManager: Failed to sync session.json cookies:', err);
                // Non-critical, continue launching
            }

            console.log('✅ DEBUG: Browser context created successfully');

            // 3. Extra Safety (Closing logic on disconnect)
            this.browserContext.on('close', () => {
                console.log('❌ BrowserManager: Context closed unexpectedly (or manually). Clearing reference.');
                this.browserContext = null;
            });

            console.log('✅ DEBUG: Returning browser context, pages count:', this.browserContext.pages().length);
            return this.browserContext;

        } catch (error) {
            console.error('🔥 BrowserManager: Failed to launch browser:', error);
            console.error('🔥 Stack trace:', (error as Error).stack);
            // Ensure cleanup on failure
            this.browserContext = null;
            throw error;
        }
    }

    /**
     * Safely closes the current browser instance.
     */
    public async close(): Promise<void> {
        if (!this.browserContext) return;

        try {
            console.log('🛑 BrowserManager: Closing browser...');
            await this.browserContext.close();
        } catch (error) {
            console.error('⚠️ BrowserManager: Error during close (likely already closed):', error);
        } finally {
            this.browserContext = null;
        }
    }

    /**
     * NUCLEAR OPTION: Closes the browser and WIPES the persistent profile directory.
     * Used for "Reset All" functionality.
     */
    public async clearData(): Promise<void> {
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
            } else {
                console.log('ℹ️ BrowserManager: No directory to wipe.');
            }
        } catch (error) {
            console.error('❌ BrowserManager: Failed to wipe data:', error);
            // Don't throw, we want reset to continue best-effort
        }
    }

    /**
     * Launches a frameless overlay for login, locked to the UI.
     */
    public async login(bounds: Electron.Rectangle, mainWindow: BrowserWindow): Promise<boolean> {
        console.log('🔐 BrowserManager: Starting Single Vehicle Login Overlay...');

        // 1. Lock the Main Window
        mainWindow.setMovable(false);

        try {
            console.log('🔍 DEBUG login: Bounds received:', bounds);

            // 2. Launch Persistent Context (Frameless at specific coordinates)
            const context = await this.launch({ headless: false, bounds: bounds }); // Ensure launch cleans up old instances
            console.log('🔍 DEBUG login: Context launched successfully');

            // 3. Get the Overlay Page (Re-use the one created by --app)
            // If --app is used, Chromium opens a window immediately. newPage() creates a SECOND window (with UI).
            const pages = context.pages();
            console.log('🔍 DEBUG login: Pages count:', pages.length);
            const page = pages.length > 0 ? pages[0] : await context.newPage();
            console.log('🔍 DEBUG login: Got page, URL:', page.url());

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
                    } catch (e) {
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
            } catch (e) {
                console.log('⚠️ Page load state wait timed out, continuing anyway...');
            }

            // 4. Wait for Login Success
            // Uses URL polling + CDP accessibility tree (NO waitForSelector - bot detectable!)
            try {
                console.log('⏳ Waiting for user to complete login...');
                const loginSuccess = await this.waitForLoginSuccessViaCDP(page, 300000); // 5 min timeout

                if (loginSuccess) {
                    console.log('✅ INSTAGRAM LOGIN CONFIRMED (Overlay)');
                    // 5. Cleanup on Success
                    await this.close();
                    mainWindow.setMovable(true);
                    return true;
                } else {
                    throw new Error('Login timeout');
                }
            } catch (e) {
                console.log('❌ Login/Timeout failed.');
                throw e; // Bubble up to close
            }

        } catch (error) {
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
    public getContext(): BrowserContext | null {
        return this.browserContext;
    }

    /**
     * Validates if the current session is still authenticated with Instagram.
     * Uses the same check as login() but with shorter timeout.
     *
     * This consolidates session validation logic - callers should use this
     * instead of implementing their own checks.
     *
     * @returns SessionValidationResult with valid flag and optional reason
     */
    public async validateSession(): Promise<SessionValidationResult> {
        if (!this.browserContext) {
            return { valid: false, reason: 'NO_CONTEXT' };
        }

        try {
            const pages = this.browserContext.pages();
            const page = pages.length > 0 ? pages[0] : await this.browserContext.newPage();

            // Navigate to Instagram if not already there
            const url = page.url();
            if (!url.includes('instagram.com')) {
                await page.goto('https://www.instagram.com/', { waitUntil: 'domcontentloaded' });
            }

            // Check URL for obvious failure states first (fast path)
            const currentUrl = page.url();
            if (currentUrl.includes('/accounts/login')) {
                return { valid: false, reason: 'SESSION_EXPIRED' };
            }
            if (currentUrl.includes('/challenge')) {
                return { valid: false, reason: 'CHALLENGE_REQUIRED' };
            }
            if (currentUrl.includes('/accounts/suspended')) {
                return { valid: false, reason: 'RATE_LIMITED' };
            }

            // Validate via CDP accessibility tree (NO waitForSelector - bot detectable!)
            const isValid = await this.checkLoginStateViaCDP(page);
            if (isValid) {
                console.log('✅ Session validation: Valid');
                return { valid: true };
            } else {
                console.log('❌ Session validation: Not logged in');
                return { valid: false, reason: 'SESSION_EXPIRED' };
            }

        } catch (error: any) {
            console.error('❌ Session validation error:', error.message);
            return { valid: false, reason: error.message };
        }
    }

    // =========================================================================
    // CDP-Based Login Detection (Undetectable)
    // =========================================================================

    /**
     * Wait for login success using URL polling + CDP accessibility tree.
     * NO waitForSelector - that injects MutationObserver (bot detectable).
     *
     * @param page - Playwright page
     * @param timeout - Maximum wait time in ms
     * @returns true if login detected, false if timeout
     */
    private async waitForLoginSuccessViaCDP(page: Page, timeout: number): Promise<boolean> {
        const startTime = Date.now();
        const pollInterval = 1500; // Check every 1.5 seconds

        while (Date.now() - startTime < timeout) {
            const url = page.url();

            // Fast path: Still on login page
            if (url.includes('/accounts/login') || url.includes('/challenge')) {
                await new Promise(r => setTimeout(r, pollInterval));
                continue;
            }

            // URL looks good - verify with CDP accessibility tree
            if (url.includes('instagram.com')) {
                const isLoggedIn = await this.checkLoginStateViaCDP(page);
                if (isLoggedIn) {
                    return true;
                }
            }

            await new Promise(r => setTimeout(r, pollInterval));
        }

        return false;
    }

    /**
     * Check login state using CDP accessibility tree.
     * Looks for navigation elements that only appear when logged in.
     *
     * NO DOM queries, NO selectors - completely undetectable.
     */
    private async checkLoginStateViaCDP(page: Page): Promise<boolean> {
        let cdpSession = null;
        try {
            cdpSession = await page.context().newCDPSession(page);
            const { nodes } = await cdpSession.send('Accessibility.getFullAXTree') as { nodes: any[] };

            // Look for logged-in indicators in the accessibility tree
            // Instagram shows "Home", "Search", "Explore" links when logged in
            const loggedInIndicators = ['home', 'search', 'explore', 'new post', 'profile'];

            const hasLoggedInElement = nodes.some((node: any) => {
                if (node.ignored) return false;
                const nodeName = (node.name?.value || '').toLowerCase();
                const nodeRole = node.role?.value?.toLowerCase();

                // Must be a link or button (navigation elements)
                if (nodeRole !== 'link' && nodeRole !== 'button') return false;

                return loggedInIndicators.some(indicator => nodeName.includes(indicator));
            });

            return hasLoggedInElement;
        } catch (error) {
            console.warn('CDP accessibility check failed:', error);
            return false;
        } finally {
            if (cdpSession) {
                await cdpSession.detach().catch(() => {});
            }
        }
    }
}
