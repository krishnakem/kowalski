"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const playwright_1 = require("playwright");
const SecureKeyManager_1 = require("./services/SecureKeyManager");
// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (require('electron-squirrel-startup')) {
    electron_1.app.quit();
}
let mainWindow = null;
const SHARED_PARTITION = 'persist:instagram_shared';
const createWindow = () => {
    // Base laptop size (e.g., 1200x800) + random variance of 0-100px
    const width = 1280 + Math.floor(Math.random() * 100);
    const height = 800 + Math.floor(Math.random() * 100);
    // Create the browser window.
    mainWindow = new electron_1.BrowserWindow({
        width: width,
        height: height,
        title: 'Kowalski',
        backgroundColor: '#F9F8F5', // Warm Alabaster for LCD antialiasing
        frame: true,
        // titleBarStyle property removed to use system default
        webPreferences: {
            preload: path_1.default.join(__dirname, '../preload/preload.cjs'),
            webviewTag: true,
            partition: SHARED_PARTITION // Force main window to check this (though webview usually isolates)
        },
    });
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
        mainWindow.webContents.openDevTools();
    }
    else {
        const filePath = path_1.default.join(__dirname, '../dist/index.html');
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
    // -----------------------------
};
// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
electron_1.app.on('ready', () => {
    createWindow();
    // Fresh Start Logic - DISABLED
    // We now persist session.json to keep Instagram logged in.
    // const userDataPath = app.getPath('userData');
    // ...
    console.log('Session persistence enabled.');
    setupIPCHandlers();
});
// DIRECT GUEST ATTACHMENT: The Nuclear Option
electron_1.app.on('web-contents-created', (event, contents) => {
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
            }
            catch (e) { /* ignore */ }
        }, 1000);
        // METHOD A: EVENT SNIFFER (Listening to headers on this handle)
        const filter = { urls: ['*://*.instagram.com/*'] };
        contents.session.webRequest.onHeadersReceived(filter, async (details, callback) => {
            const responseHeaders = details.responseHeaders;
            const setCookie = responseHeaders ? (responseHeaders['set-cookie'] || responseHeaders['Set-Cookie']) : null;
            if (setCookie && Array.isArray(setCookie)) {
                if (setCookie.some(h => h.includes('sessionid'))) {
                    // Give it a moment to commit to the jar
                    setTimeout(() => saveSessionAndNotify(contents.session), 500);
                }
            }
            callback({ responseHeaders: details.responseHeaders });
        });
    }
});
// Helper to save session
let isSaving = false;
async function saveSessionAndNotify(targetSession) {
    if (isSaving)
        return;
    isSaving = true;
    try {
        // SAFEGUARD: The webview might be destroyed by React before we run this 
        let cookies;
        try {
            cookies = await targetSession.cookies.get({});
        }
        catch (err) {
            if (String(err).includes('destroyed')) {
                return;
            }
            throw err;
        }
        const sessionCookie = cookies.find(c => c.name === 'sessionid');
        if (sessionCookie) {
            const userDataPath = electron_1.app.getPath('userData');
            const sessionPath = path_1.default.join(userDataPath, 'session.json');
            const playwrightCookies = cookies.map(cookie => {
                // Playwright requires strict SameSite values: 'Strict', 'Lax', 'None'
                let sameSite = 'Lax'; // Default fallback
                if (cookie.sameSite === 'no_restriction' || cookie.sameSite === 'unspecified') {
                    sameSite = 'None';
                }
                else if (cookie.sameSite) {
                    sameSite = cookie.sameSite.charAt(0).toUpperCase() + cookie.sameSite.slice(1);
                }
                return {
                    ...cookie,
                    expires: cookie.expirationDate || -1,
                    sameSite: sameSite,
                    secure: sameSite === 'None' ? true : cookie.secure
                };
            });
            const storageState = { cookies: playwrightCookies, origins: [] };
            fs_1.default.writeFileSync(sessionPath, JSON.stringify(storageState, null, 2));
            // BROADCAST SIGNAL TO ALL WINDOWS
            const windows = electron_1.BrowserWindow.getAllWindows();
            windows.forEach(win => {
                win.webContents.send('login-success');
            });
            // Reset lock so we can save again (e.g. Switch Account)
            // verify we wait a bit or just reset immediately? 
            // Resetting immediately is fine, the interval checks prevent spamming 
            // but to be safe, maybe a small timeout or just false.
            setTimeout(() => { isSaving = false; }, 2000);
        }
        else {
            isSaving = false;
        }
    }
    catch (e) {
        console.error('Save Error:', e);
        isSaving = false;
    }
}
function setupIPCHandlers() {
    electron_1.ipcMain.handle('reset-session', async () => {
        try {
            // 1. Delete session.json
            const userDataPath = electron_1.app.getPath('userData');
            const sessionPath = path_1.default.join(userDataPath, 'session.json');
            if (fs_1.default.existsSync(sessionPath)) {
                fs_1.default.unlinkSync(sessionPath);
            }
            // 2. Clear Electron Cache
            await electron_1.session.defaultSession.clearStorageData();
            await electron_1.session.fromPartition(SHARED_PARTITION).clearStorageData();
            // 3. Clear electron-store settings (except maybe some persistent flags if needed, but for reset we wipe info)
            const { default: Store } = await Promise.resolve().then(() => __importStar(require('electron-store')));
            const store = new Store();
            store.clear();
            // Ensure specific keys are definitely gone if clear didn't catch them
            store.delete('analyses');
            store.delete('settings');
            return true;
        }
        catch (e) {
            console.error('Reset Error:', e);
            return false;
        }
    });
    // --- Electron Store Handlers ---
    electron_1.ipcMain.handle('settings:get', async () => {
        const { default: Store } = await Promise.resolve().then(() => __importStar(require('electron-store')));
        const store = new Store();
        return store.get('settings') || {};
    });
    electron_1.ipcMain.handle('settings:set', async (_event, newSettings) => {
        const { default: Store } = await Promise.resolve().then(() => __importStar(require('electron-store')));
        const store = new Store();
        store.set('settings', newSettings);
        return true;
    });
    electron_1.ipcMain.handle('settings:patch', async (_event, updates) => {
        const { default: Store } = await Promise.resolve().then(() => __importStar(require('electron-store')));
        const store = new Store();
        const current = store.get('settings') || {};
        const merged = { ...current, ...updates };
        store.set('settings', merged);
        return merged;
    });
    electron_1.ipcMain.handle('analyses:get', async () => {
        const { default: Store } = await Promise.resolve().then(() => __importStar(require('electron-store')));
        const store = new Store();
        return store.get('analyses') || [];
    });
    electron_1.ipcMain.handle('analyses:set', async (_event, analyses) => {
        const { default: Store } = await Promise.resolve().then(() => __importStar(require('electron-store')));
        const store = new Store();
        store.set('analyses', analyses);
        return true;
    });
    // --- Secure Storage Handlers ---
    electron_1.ipcMain.handle('settings:set-secure', async (_event, { apiKey }) => {
        return SecureKeyManager_1.SecureKeyManager.getInstance().setKey(apiKey);
    });
    electron_1.ipcMain.handle('settings:check-key-status', async () => {
        return SecureKeyManager_1.SecureKeyManager.getInstance().getKeyStatus();
    });
    // -------------------------------
    // -------------------------------
    electron_1.ipcMain.handle('test-headless', async () => {
        try {
            const userDataPath = electron_1.app.getPath('userData');
            const sessionPath = path_1.default.join(userDataPath, 'session.json');
            if (!fs_1.default.existsSync(sessionPath)) {
                return 'No session file found';
            }
            // Launch non-headless temporarily to verify
            const browser = await playwright_1.chromium.launch({ headless: false });
            const context = await browser.newContext({ storageState: sessionPath });
            const page = await context.newPage();
            await page.goto('https://www.instagram.com/');
            try {
                await page.waitForSelector('svg[aria-label="Home"]', { timeout: 5000 });
                // await browser.close(); // Keep open for inspection
                return 'Success: Logged in automatically';
            }
            catch (e) {
                // await browser.close(); // Keep open for inspection
                return 'Failed: Still on login page';
            }
        }
        catch (error) {
            return `Error: ${error.message}`;
        }
    });
    electron_1.ipcMain.handle('clear-instagram-session', async () => {
        console.log('🧹 Clearing Instagram Session only...');
        try {
            // 1. Delete session.json
            const userDataPath = electron_1.app.getPath('userData');
            const sessionPath = path_1.default.join(userDataPath, 'session.json');
            if (fs_1.default.existsSync(sessionPath)) {
                fs_1.default.unlinkSync(sessionPath);
            }
            // 2. Clear ONLY the Instagram View partition
            await electron_1.session.fromPartition(SHARED_PARTITION).clearStorageData();
            // DO NOT clear defaultSession (preserves LocalStorage/Settings)
            return true;
        }
        catch (e) {
            console.error('Clear Instagram Session Error:', e);
            return false;
        }
    });
}
// Quit when all windows are closed
electron_1.app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        electron_1.app.quit();
    }
});
electron_1.app.on('activate', () => {
    if (electron_1.BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});
