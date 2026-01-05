import { app, BrowserWindow, ipcMain, session } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
// Replace 'playwright' import with 'playwright-extra'
import { chromium } from 'playwright-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

// Add stealth plugin to chromium
chromium.use(StealthPlugin());

// --- GLOBAL ELECTRON FIXES ---
app.commandLine.appendSwitch('ignore-certificate-errors');
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-software-rasterizer');
app.commandLine.appendSwitch('disable-dev-shm-usage');
app.commandLine.appendSwitch('disable-renderer-backgrounding');

// ... (imports remain) ...

// ... (inside setupIPCHandlers) ...


import { SecureKeyManager } from './services/SecureKeyManager.js';
import { UsageService } from './services/UsageService.js';
import { SchedulerService } from './services/SchedulerService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import { createRequire } from 'module';
const require = createRequire(import.meta.url);

// Ensure app launches on login (background daemon)
if (!app.getLoginItemSettings().openAtLogin) {
  app.setLoginItemSettings({
    openAtLogin: true,
    openAsHidden: false // Optional: could be true if we want silent start
  });
}

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (require('electron-squirrel-startup')) {
  app.quit();
}

// Track quitting state so we can actually quit when Cmd+Q is pressed
let isQuitting = false;
let mainWindow: BrowserWindow | null = null;
const SHARED_PARTITION = 'persist:instagram_shared';

const createWindow = () => {
  // Base laptop size (e.g., 1200x800) + random variance of 0-100px
  const width = 1280 + Math.floor(Math.random() * 100);
  const height = 800 + Math.floor(Math.random() * 100);

  // Create the browser window.
  mainWindow = new BrowserWindow({
    width: width,
    height: height,
    title: 'Kowalski',
    backgroundColor: '#F9F8F5', // Warm Alabaster for LCD antialiasing
    frame: true,
    // titleBarStyle property removed to use system default
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.cjs'),
      webviewTag: true,
      partition: SHARED_PARTITION // Force main window to check this (though webview usually isolates)
    },
  });

  // Share window ref with Scheduler
  SchedulerService.getInstance().setMainWindow(mainWindow);

  // Prevent title from being updated by the renderer (React)

  // Prevent title from being updated by the renderer (React)
  mainWindow.on('page-title-updated', (e) => {
    e.preventDefault();
  });

  // Load the index.html of the app.
  if (process.env.VITE_DEV_SERVER_URL) {
    const url = process.env.VITE_DEV_SERVER_URL;
    console.log("Creating window with URL:", url);
    mainWindow.loadURL(url);
    // Open the DevTools.
    // mainWindow.webContents.openDevTools();
  } else {
    const filePath = path.join(__dirname, '../dist/index.html');
    console.log("Loading file path:", filePath);
    mainWindow.loadFile(filePath);
  }

  // --- DIAGNOSTIC LISTENERS ---
  mainWindow.webContents.on('did-finish-load', () => {
    console.log('✅ did-finish-load: Main window content loaded successfully.');
  });

  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
    console.error(`❌ did-fail-load: Error ${errorCode} (${errorDescription}) loading ${validatedURL}`);
  });

  mainWindow.webContents.on('dom-ready', () => {
    console.log('✅ dom-ready: DOM is ready.');
  });

  mainWindow.webContents.on('render-process-gone', (event, details) => {
    console.error(`💀 render-process-gone: Reason: ${details.reason}, Exit Code: ${details.exitCode}`);
  });
  // --- WINDOW LIFECYCLE ---
  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow?.hide();
      return false;
    }
    // Clear reference in Scheduler to be safe
    SchedulerService.getInstance().setMainWindow(null);
  });
  // -------------------------
};

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on('ready', () => {
  createWindow();

  // Fresh Start Logic - DISABLED
  // We now persist session.json to keep Instagram logged in.
  // const userDataPath = app.getPath('userData');
  // ...
  console.log('Session persistence enabled.');

  console.log('Session persistence enabled.');

  // Initialize Usage Service (Checks for monthly reset)
  UsageService.getInstance().initialize();

  // Initialize Scheduler
  SchedulerService.getInstance().initialize();

  // MIGRATION: Ensure storage directory exists
  const userDataPath = app.getPath('userData');
  const recordsPath = path.join(userDataPath, 'analysis_records');
  if (!fs.existsSync(recordsPath)) {
    fs.mkdirSync(recordsPath, { recursive: true });
    console.log('📂 Created analysis_records directory');
  }

  // MIGRATION: Clean Slate for File-Based Storage
  // Clearing legacy store to prevent UI errors with missing files.
  // TEMPORARY MIGRATION CLEANUP (Removed to prevent data loss on restart)
  // The previous block wiped data on every boot.
  // Data persistence is now safely handled by the File-Per-Analysis model.
  setupIPCHandlers();
});

app.on('before-quit', () => {
  isQuitting = true;
  SchedulerService.getInstance().stop();
});

// DIRECT GUEST ATTACHMENT: The Nuclear Option
app.on('web-contents-created', (event, contents) => {
  // Only attach to webviews (which are our Instagram windows)
  if (contents.getType() === 'webview') {
    console.log(`⚡️ HOOKED: Attached direct cookie listener to Webview ID: ${contents.id}`);

    // METHOD B: DIRECT PROBE (Polling the handle)
    // We poll this SPECIFIC webContents' session, ignoring the partition name entirely.
    const directInterval = setInterval(async () => {
      try {
        if (contents.isDestroyed()) {
          clearInterval(directInterval);
          return;
        }

        const cookies = await contents.session.cookies.get({});
        const sessionCookie = cookies.find(c => c.name === 'sessionid');

        if (sessionCookie) {
          await saveSessionAndNotify(contents.session);
          clearInterval(directInterval);
        }
      } catch (e) { /* ignore */ }
    }, 1000);

    // METHOD A: EVENT SNIFFER (Listening to headers on this handle)
    // METHOD A: EVENT SNIFFER (Listening to headers on this handle)
    const filter = { urls: ['*://*.instagram.com/*'] };
    const targetSession = contents.session; // Capture reference safely

    // 1. Setup Listener
    targetSession.webRequest.onHeadersReceived(filter, async (details, callback) => {
      const responseHeaders = details.responseHeaders;
      const setCookie = responseHeaders ? (responseHeaders['set-cookie'] || responseHeaders['Set-Cookie']) : null;
      if (setCookie && Array.isArray(setCookie)) {
        if (setCookie.some(h => h.includes('sessionid'))) {
          // Give it a moment to commit to the jar
          setTimeout(() => {
            // FIX: Prevent accessing destroyed object
            if (!contents.isDestroyed()) {
              saveSessionAndNotify(contents.session);
            }
          }, 500);
        }
      }
      callback({ responseHeaders: details.responseHeaders });
    });

    // 2. Cleanup on Destruction (Requested by User)
    contents.on('destroyed', () => {
      try {
        // Remove the listener to prevent memory leaks or zombie handlers
        // Note: usage of targetSession here is safe because we captured it
        targetSession.webRequest.onHeadersReceived(filter, null);
      } catch (e) {
        // Ignore errors during cleanup
      }
    });
  }
});

// Helper to save session
let isSaving = false;
async function saveSessionAndNotify(targetSession: Electron.Session) {
  if (isSaving) return;
  isSaving = true;

  try {
    // SAFEGUARD: The webview might be destroyed by React before we run this 
    let cookies;
    try {
      cookies = await targetSession.cookies.get({});
    } catch (err) {
      if (String(err).includes('destroyed')) {
        return;
      }
      throw err;
    }

    const sessionCookie = cookies.find(c => c.name === 'sessionid');

    if (sessionCookie) {
      const userDataPath = app.getPath('userData');
      const sessionPath = path.join(userDataPath, 'session.json');

      const playwrightCookies = cookies.map(cookie => {
        // Playwright requires strict SameSite values: 'Strict', 'Lax', 'None'
        let sameSite = 'Lax'; // Default fallback
        if (cookie.sameSite === 'no_restriction' || cookie.sameSite === 'unspecified') {
          sameSite = 'None';
        } else if (cookie.sameSite) {
          sameSite = cookie.sameSite.charAt(0).toUpperCase() + cookie.sameSite.slice(1);
        }

        return {
          ...cookie,
          expires: cookie.expirationDate || -1,
          sameSite: sameSite as "Strict" | "Lax" | "None",
          secure: sameSite === 'None' ? true : cookie.secure
        };
      });

      const storageState = { cookies: playwrightCookies, origins: [] };
      fs.writeFileSync(sessionPath, JSON.stringify(storageState, null, 2));

      // BROADCAST SIGNAL TO ALL WINDOWS
      const windows = BrowserWindow.getAllWindows();
      windows.forEach(win => {
        win.webContents.send('login-success');
      });

      // Reset lock so we can save again (e.g. Switch Account)
      // verify we wait a bit or just reset immediately? 
      // Resetting immediately is fine, the interval checks prevent spamming 
      // but to be safe, maybe a small timeout or just false.
      setTimeout(() => { isSaving = false; }, 2000);

    } else {
      isSaving = false;
    }
  } catch (e) {
    console.error('Save Error:', e);
    isSaving = false;
  }
}

function setupIPCHandlers() {
  ipcMain.handle('reset-session', async () => {
    console.log('🧹 Starting session reset...');

    // 1. Delete session.json
    try {
      const userDataPath = app.getPath('userData');
      const sessionPath = path.join(userDataPath, 'session.json');
      if (fs.existsSync(sessionPath)) {
        fs.unlinkSync(sessionPath);
        console.log('✅ Deleted session.json');
      }
    } catch (e) {
      console.error('⚠️ Failed to delete session.json:', e);
    }

    // 2. Clear Electron Cache (may fail due to file locks, non-critical)
    try {
      await session.defaultSession.clearStorageData();
      console.log('✅ Cleared default session storage');
    } catch (e) {
      console.error('⚠️ Failed to clear default session storage:', e);
    }

    try {
      await session.fromPartition(SHARED_PARTITION).clearStorageData();
      console.log('✅ Cleared shared partition storage');
    } catch (e) {
      console.error('⚠️ Failed to clear shared partition storage:', e);
    }

    // 3. Clear electron-store (critical)
    try {
      const { default: Store } = await import('electron-store');
      const store: any = new Store();
      store.clear();
      store.delete('analyses');
      store.delete('settings');
      store.delete('activeSchedule');
      console.log('✅ Cleared electron-store');
    } catch (e) {
      console.error('❌ Failed to clear electron-store:', e);
      return false;
    }

    console.log('🎉 Session reset complete');
    return true;
  });

  // --- Electron Store Handlers ---
  ipcMain.handle('settings:get', async () => {
    const { default: Store } = await import('electron-store');
    const store: any = new Store();
    return store.get('settings') || {};
  });

  ipcMain.handle('settings:set', async (_event, newSettings) => {
    const { default: Store } = await import('electron-store');
    const store: any = new Store();
    store.set('settings', newSettings);

    // If resetting (hasOnboarded = false), also clear the activeSchedule snapshot
    if (newSettings.hasOnboarded === false) {
      store.delete('activeSchedule');
      console.log('🧹 Cleared activeSchedule during reset');
    }
    return true;
  });

  ipcMain.handle('settings:patch', async (_event, updates) => {
    const { default: Store } = await import('electron-store');
    const store: any = new Store();
    const current = (store.get('settings') as object) || {};
    const merged = { ...current, ...updates };
    store.set('settings', merged);
    return merged;
  });

  ipcMain.handle('analyses:get', async () => {
    const { default: Store } = await import('electron-store');
    const store: any = new Store();
    return store.get('analyses') || [];
  });

  ipcMain.handle('analyses:set', async (_event, analyses) => {
    const { default: Store } = await import('electron-store');
    const store: any = new Store();
    store.set('analyses', analyses);
    return true;
    return true;
  });

  ipcMain.handle('analyses:get-content', async (_event, id) => {
    try {
      const userDataPath = app.getPath('userData');
      const filePath = path.join(userDataPath, 'analysis_records', `${id}.json`);

      if (fs.existsSync(filePath)) {
        const raw = fs.readFileSync(filePath, 'utf-8');
        return JSON.parse(raw);
      }
      return null;
    } catch (e) {
      console.error(`❌ Failed to load analysis content for ${id}:`, e);
      return null;
    }
  });

  ipcMain.handle('settings:get-active-schedule', async () => {
    const { default: Store } = await import('electron-store');
    const store: any = new Store();
    return store.get('activeSchedule') || null;
  });

  ipcMain.handle('settings:get-wake-time', async () => {
    return SchedulerService.getInstance().getLastWakeTime();
  });

  // --- Secure Storage Handlers ---
  ipcMain.handle('settings:set-secure', async (_event, { apiKey }) => {
    return SecureKeyManager.getInstance().setKey(apiKey);
  });

  ipcMain.handle('settings:check-key-status', async () => {
    return SecureKeyManager.getInstance().getKeyStatus();
  });

  ipcMain.handle('settings:get-secure', async () => {
    return SecureKeyManager.getInstance().getKey();
  });
  // -------------------------------
  // -------------------------------

  ipcMain.handle('test-headless', async () => {
    try {
      const userDataPath = app.getPath('userData');
      const sessionPath = path.join(userDataPath, 'session.json');

      console.log('🤖 Starting Playwright with Stealth + GPU Fixes...');

      if (!fs.existsSync(sessionPath)) {
        return 'No session file found';
      }

      // Launch with robust args for "Black Window" fix
      const browser = await chromium.launch({
        headless: false,
        args: [
          '--disable-gpu',
          '--disable-dev-shm-usage',
          '--disable-software-rasterizer', // Crucial for black window issues
          '--no-sandbox',
          '--disable-blink-features=AutomationControlled', // Anti-detection
          '--window-position=0,0'
        ]
      });

      const context = await browser.newContext({
        storageState: sessionPath,
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36'
      });

      const page = await context.newPage();

      // --- VERBOSE LOGGING START ---
      page.on('console', msg => console.log('PW CONSOLE:', msg.text()));
      page.on('pageerror', err => console.log('PW ERROR:', err.message));
      page.on('requestfailed', request => console.log('PW FAILED:', request.url(), request.failure()?.errorText));
      // --- VERBOSE LOGGING END ---

      console.log('🌍 Navigating to Instagram...');
      await page.goto('https://www.instagram.com/');

      try {
        await page.waitForSelector('svg[aria-label="Home"]', { timeout: 10000 });
        console.log('✅ INSTAGRAM LOGIN CONFIRMED');
        return 'Success: Logged in automatically';
      } catch (e) {
        console.log('❌ NOT LOGGED IN / SELECTOR TIMEOUT');
        return 'Failed: Still on login page';
      }
    } catch (error) {
      console.error('CRITICAL PW ERROR:', error);
      return `Error: ${(error as Error).message}`;
    }
  });

  ipcMain.handle('clear-instagram-session', async () => {
    console.log('🧹 Clearing Instagram Session only...');
    try {
      // 1. Delete session.json
      const userDataPath = app.getPath('userData');
      const sessionPath = path.join(userDataPath, 'session.json');
      if (fs.existsSync(sessionPath)) {
        fs.unlinkSync(sessionPath);
      }

      // 2. Clear ONLY the Instagram View partition
      await session.fromPartition(SHARED_PARTITION).clearStorageData();

      // DO NOT clear defaultSession (preserves LocalStorage/Settings)
      return true;
    } catch (e) {
      console.error('Clear Instagram Session Error:', e);
      return false;
    }
  });
}

// Quit when all windows are closed
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  } else {
    // If window exists but is hidden, show it
    mainWindow?.show();
  }
});
