import { app, BrowserWindow, ipcMain, session } from 'electron';
import path from 'path';
import fs from 'fs';
import { chromium } from 'playwright';

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (require('electron-squirrel-startup')) {
  app.quit();
}

const createWindow = () => {
  // Base laptop size (e.g., 1200x800) + random variance of 0-100px
  const width = 1280 + Math.floor(Math.random() * 100);
  const height = 800 + Math.floor(Math.random() * 100);

  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: width,
    height: height,
    title: 'Kowalski',
    frame: true,
    // titleBarStyle property removed to use system default
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.cjs'),
      webviewTag: true,
    },
  });

  // Prevent title from being updated by the renderer (React)
  mainWindow.on('page-title-updated', (e) => {
    e.preventDefault();
  });

  // Load the index.html of the app.
  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
    // Open the DevTools.
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }
};

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on('ready', () => {
  createWindow();

  // Fresh Start Logic
  try {
    const userDataPath = app.getPath('userData');
    const sessionPath = path.join(userDataPath, 'session.json');
    if (fs.existsSync(sessionPath)) {
      console.log('Clearing previous session file on startup...');
      fs.unlinkSync(sessionPath);
    }

    // Clear partition data to force login screen
    session.defaultSession.clearStorageData();
    session.fromPartition('persist:instagram').clearStorageData();
    console.log('Cookies and storage cleared.');
  } catch (e) {
    console.error('Failed to clear session on start:', e);
  }


  ipcMain.handle('start-agent', async () => {
    console.log('Starting agent...');
    try {
      const userDataPath = app.getPath('userData');
      const sessionPath = path.join(userDataPath, 'session.json');
      const sessionExists = fs.existsSync(sessionPath);
      let context;

      const browser = await chromium.launch({ headless: false });

      if (sessionExists) {
        console.log('Loading existing session from:', sessionPath);
        context = await browser.newContext({ storageState: sessionPath });
      } else {
        console.log('No session found. Starting fresh...');
        context = await browser.newContext();
      }

      const page = await context.newPage();
      await page.goto('https://instagram.com');

      console.log('Waiting for user login verification (Home icon)...');
      // Always wait for the "Home" icon to confirm we are actually logged in
      // This covers both "First Run" (waiting for input) and "Recurring" (verifying token)
      await page.waitForSelector('svg[aria-label="Home"]', { timeout: 0 });

      console.log('Login verified.');

      if (!sessionExists) {
        console.log('First run: Saving session...');
        await context.storageState({ path: sessionPath });
        console.log('Session saved to:', sessionPath);

        await browser.close();
      } else {
        console.log('Recurring run: Session valid.');
        // Optional: Close browser or leave it open? 
        // For consistency and "ghost" simulation, let's close it after verification
        await browser.close();
      }

      return 'Login captured!';
    } catch (error) {
      console.error('Agent error:', error);
      throw error; // Propagate error to frontend
    }
  });

  ipcMain.handle('reset-session', async () => {
    console.log('Resetting session...');
    try {
      const userDataPath = app.getPath('userData');
      const sessionPath = path.join(userDataPath, 'session.json');

      if (fs.existsSync(sessionPath)) {
        fs.unlinkSync(sessionPath);
        console.log('Session file deleted.');
        return true;
      }
      return false;
    } catch (error) {
      console.error('Error deleting session:', error);
      throw error;
    }
  });

  ipcMain.handle('save-login-session', async () => {
    console.log('Saving login session from Embedded View...');
    try {
      const cookies = await session.defaultSession.cookies.get({});
      const userDataPath = app.getPath('userData');
      const sessionPath = path.join(userDataPath, 'session.json');

      // Transform Electron cookies to Playwright format
      const playwrightCookies = cookies.map(cookie => ({
        ...cookie,
        // Playwright expects 'expires' as -1 for session cookies, Electron uses 0 or missing
        expires: cookie.expirationDate || -1,
        sameSite: cookie.sameSite === 'unspecified' ? 'Lax' : cookie.sameSite
      }));

      const storageState = {
        cookies: playwrightCookies,
        origins: [] // We can populate this if we need localStorage, but cookies are usually enough for IG
      };

      fs.writeFileSync(sessionPath, JSON.stringify(storageState, null, 2));
      console.log('Session saved to:', sessionPath);
      return true;
    } catch (error) {
      console.error('Error saving session:', error);
      throw error;
    }
  });
});

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and import them here.
