
// CJS shims for ESM compatibility
const { fileURLToPath: __fileURLToPath } = require('url');
const __importMetaUrl = require('url').pathToFileURL(__filename).toString();

var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// src/main/main.ts
var import_electron5 = require("electron");
var import_path4 = __toESM(require("path"), 1);
var import_url = require("url");
var import_fs4 = __toESM(require("fs"), 1);

// src/main/services/BrowserManager.ts
var import_electron2 = require("electron");
var import_path2 = __toESM(require("path"), 1);
var import_fs2 = __toESM(require("fs"), 1);
var import_playwright_extra = require("playwright-extra");
var import_puppeteer_extra_plugin_stealth = __toESM(require("puppeteer-extra-plugin-stealth"), 1);

// src/main/services/ChromiumVersionHelper.ts
var import_fs = __toESM(require("fs"), 1);
var import_path = __toESM(require("path"), 1);
var import_electron = require("electron");
var ChromiumVersionHelper = class {
  static cachedVersion = null;
  static cachedRevision = null;
  static cachedUserAgent = null;
  /**
   * Gets Chromium version using a production-safe fallback chain:
   * 1. browsers.json via require() (handles asar transparency)
   * 2. Scan Playwright cache directory (external to app bundle)
   * 3. Hardcoded fallback (safety net)
   */
  static getChromiumVersion() {
    if (this.cachedVersion) return this.cachedVersion;
    this.cachedVersion = this.tryReadBrowsersJson();
    if (this.cachedVersion) return this.cachedVersion;
    this.cachedVersion = this.tryDetectFromCache();
    if (this.cachedVersion) return this.cachedVersion;
    console.warn("\u26A0\uFE0F ChromiumVersionHelper: Using hardcoded fallback version");
    this.cachedVersion = "143.0.0.0";
    return this.cachedVersion;
  }
  /**
   * Try reading version from playwright-core's browsers.json
   * Uses require() which handles asar transparency in production
   */
  static tryReadBrowsersJson() {
    try {
      const browsersJson = require("playwright-core/browsers.json");
      const chromiumEntry = browsersJson.browsers?.find(
        (b) => b.name === "chromium"
      );
      if (chromiumEntry?.browserVersion) {
        console.log(`\u{1F50D} ChromiumVersionHelper: Detected v${chromiumEntry.browserVersion} from browsers.json`);
        return chromiumEntry.browserVersion;
      }
    } catch (error) {
      console.log("\u{1F50D} ChromiumVersionHelper: browsers.json not accessible, trying cache scan...");
    }
    return null;
  }
  /**
   * Scan the Playwright cache directory to detect installed Chromium revision
   * This is production-safe because the cache is on the user's filesystem
   */
  static tryDetectFromCache() {
    try {
      const userHome = import_electron.app.getPath("home");
      const cacheDir = this.getPlaywrightCacheDir(userHome);
      if (!import_fs.default.existsSync(cacheDir)) return null;
      const revisions = import_fs.default.readdirSync(cacheDir).filter((d) => d.startsWith("chromium-") && !d.includes("headless")).map((d) => parseInt(d.replace("chromium-", ""), 10)).filter((n) => !isNaN(n)).sort((a, b) => b - a);
      if (revisions.length > 0) {
        const latestRevision = revisions[0];
        const version = this.revisionToVersion(latestRevision);
        console.log(`\u{1F50D} ChromiumVersionHelper: Detected revision ${latestRevision} \u2192 Chrome ${version}`);
        return version;
      }
    } catch (error) {
      console.warn("\u26A0\uFE0F ChromiumVersionHelper: Cache scan failed:", error);
    }
    return null;
  }
  /**
   * Maps Playwright revision numbers to approximate Chrome versions
   * Based on Playwright release history
   */
  static revisionToVersion(revision) {
    const versionMap = [
      [1255, "145.0.0.0"],
      [1220, "143.0.0.0"],
      [1200, "131.0.0.0"],
      [1140, "128.0.0.0"],
      [1100, "125.0.0.0"]
    ];
    for (const [knownRevision, version] of versionMap) {
      if (revision >= knownRevision) {
        return version;
      }
    }
    return "125.0.0.0";
  }
  /**
   * Gets the Playwright cache directory for the current platform
   */
  static getPlaywrightCacheDir(userHome) {
    if (process.platform === "darwin") {
      return import_path.default.join(userHome, "Library/Caches/ms-playwright");
    } else if (process.platform === "win32") {
      return import_path.default.join(userHome, "AppData/Local/ms-playwright");
    } else {
      return import_path.default.join(userHome, ".cache/ms-playwright");
    }
  }
  /**
   * Gets the latest installed Chromium revision number
   * Used for constructing the executable path
   */
  static getLatestRevision() {
    if (this.cachedRevision) return this.cachedRevision;
    try {
      const userHome = import_electron.app.getPath("home");
      const cacheDir = this.getPlaywrightCacheDir(userHome);
      if (!import_fs.default.existsSync(cacheDir)) {
        this.cachedRevision = "1200";
        return this.cachedRevision;
      }
      const revisions = import_fs.default.readdirSync(cacheDir).filter((d) => d.startsWith("chromium-") && !d.includes("headless")).map((d) => d.replace("chromium-", "")).filter((r) => !isNaN(parseInt(r, 10))).sort((a, b) => parseInt(b, 10) - parseInt(a, 10));
      this.cachedRevision = revisions[0] || "1200";
      console.log(`\u{1F50D} ChromiumVersionHelper: Latest revision is ${this.cachedRevision}`);
    } catch (error) {
      console.warn("\u26A0\uFE0F ChromiumVersionHelper: Failed to detect revision:", error);
      this.cachedRevision = "1200";
    }
    return this.cachedRevision;
  }
  /**
   * Generates a platform-appropriate User-Agent string
   * Automatically uses the detected Chromium version
   */
  static generateUserAgent() {
    if (this.cachedUserAgent) return this.cachedUserAgent;
    const version = this.getChromiumVersion();
    const majorVersion = version.split(".")[0];
    if (process.platform === "darwin") {
      this.cachedUserAgent = `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${majorVersion}.0.0.0 Safari/537.36`;
    } else if (process.platform === "win32") {
      this.cachedUserAgent = `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${majorVersion}.0.0.0 Safari/537.36`;
    } else {
      this.cachedUserAgent = `Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${majorVersion}.0.0.0 Safari/537.36`;
    }
    console.log(`\u{1F50D} ChromiumVersionHelper: Generated User-Agent with Chrome/${majorVersion}`);
    return this.cachedUserAgent;
  }
  /**
   * Constructs the path to the custom Kowalski browser executable
   * Dynamically uses the latest installed revision
   */
  static getCustomExecutablePath() {
    const userHome = import_electron.app.getPath("home");
    const revision = this.getLatestRevision();
    if (process.platform === "darwin") {
      return import_path.default.join(
        userHome,
        `Library/Caches/ms-playwright/chromium-${revision}/chrome-mac-arm64/Kowalski.app/Contents/MacOS/Google Chrome for Testing`
      );
    } else if (process.platform === "win32") {
      return import_path.default.join(
        userHome,
        `AppData/Local/ms-playwright/chromium-${revision}/chrome-win/Kowalski.exe`
      );
    } else {
      return import_path.default.join(
        userHome,
        `.cache/ms-playwright/chromium-${revision}/chrome-linux/Kowalski`
      );
    }
  }
  /**
   * Clears all cached values (useful for testing or forced refresh)
   */
  static clearCache() {
    this.cachedVersion = null;
    this.cachedRevision = null;
    this.cachedUserAgent = null;
  }
};

// src/main/services/BrowserManager.ts
var stealth = (0, import_puppeteer_extra_plugin_stealth.default)();
stealth.enabledEvasions.add("chrome.app");
stealth.enabledEvasions.add("chrome.csi");
stealth.enabledEvasions.add("chrome.loadTimes");
stealth.enabledEvasions.add("chrome.runtime");
stealth.enabledEvasions.add("iframe.contentWindow");
stealth.enabledEvasions.add("media.codecs");
stealth.enabledEvasions.add("navigator.hardwareConcurrency");
stealth.enabledEvasions.add("navigator.languages");
stealth.enabledEvasions.add("navigator.permissions");
stealth.enabledEvasions.add("navigator.plugins");
stealth.enabledEvasions.add("navigator.vendor");
stealth.enabledEvasions.add("navigator.webdriver");
stealth.enabledEvasions.add("sourceurl");
stealth.enabledEvasions.add("user-agent-override");
stealth.enabledEvasions.add("webgl.vendor");
stealth.enabledEvasions.add("window.outerdimensions");
import_playwright_extra.chromium.use(stealth);
var BrowserManager = class _BrowserManager {
  static instance;
  browserContext = null;
  constructor() {
  }
  static getInstance() {
    if (!_BrowserManager.instance) {
      _BrowserManager.instance = new _BrowserManager();
    }
    return _BrowserManager.instance;
  }
  /**
   * Launches a persistent browser context.
   * If an instance is already running, it closes it first to prevent zombies.
   */
  async launch(config = { headless: true }) {
    if (this.browserContext) {
      console.log("\u267B\uFE0F BrowserManager: Closing existing instance before launch...");
      await this.close();
    }
    try {
      const userDataPath = import_electron2.app.getPath("userData");
      const persistentContextPath = import_path2.default.join(userDataPath, "kowalski_browser");
      console.log(`\u{1F680} BrowserManager: Launching Persistent Context at: ${persistentContextPath}`);
      console.log(`   Headless: ${config.headless}`);
      const extraArgs = [];
      if (config.bounds) {
        extraArgs.push(`--app=https://www.instagram.com/accounts/login/`);
        extraArgs.push(`--window-position=${config.bounds.x},${config.bounds.y}`);
        extraArgs.push(`--window-size=${config.bounds.width},${config.bounds.height}`);
      }
      const customExecutablePath = ChromiumVersionHelper.getCustomExecutablePath();
      console.log("\u{1F50D} DEBUG: Custom executable path:", customExecutablePath);
      let executablePath = "";
      if (import_fs2.default.existsSync(customExecutablePath)) {
        console.log("\u{1F575}\uFE0F\u200D\u2640\uFE0F BrowserManager: Using Custom Stealth Browser:", customExecutablePath);
        executablePath = customExecutablePath;
      } else {
        console.warn("\u26A0\uFE0F BrowserManager: Custom browser not found at:", customExecutablePath);
        console.warn("\u26A0\uFE0F BrowserManager: Using Playwright default browser.");
      }
      const systemTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      console.log("\u{1F50D} DEBUG: About to launch with config:", {
        headless: config.headless,
        executablePath: executablePath || "DEFAULT",
        persistentContextPath,
        extraArgs,
        userAgent: ChromiumVersionHelper.generateUserAgent()
      });
      this.browserContext = await import_playwright_extra.chromium.launchPersistentContext(persistentContextPath, {
        headless: config.headless,
        executablePath: executablePath || void 0,
        viewport: null,
        // Let window size dictate viewport (deviceScaleFactor not compatible with null viewport)
        // Dynamic User-Agent that matches actual Chromium version (auto-detected)
        userAgent: ChromiumVersionHelper.generateUserAgent(),
        // Fingerprint consistency options
        locale: "en-US",
        timezoneId: systemTimezone,
        colorScheme: "light",
        // Note: deviceScaleFactor removed - not compatible with viewport: null
        // HTTP headers that Chrome normally sends
        extraHTTPHeaders: {
          "Accept-Language": "en-US,en;q=0.9"
        },
        args: [
          "--disable-blink-features=AutomationControlled",
          // Mask WebDriver
          "--disable-infobars",
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-accelerated-2d-canvas",
          "--disable-gpu",
          // Often helps stability in headless envs
          ...extraArgs
        ],
        // Accept downloads if needed later
        acceptDownloads: true
      });
      await this.browserContext.addInitScript(() => {
        const getParameterProto = WebGLRenderingContext.prototype.getParameter;
        WebGLRenderingContext.prototype.getParameter = function(parameter) {
          if (parameter === 37445) {
            return "Intel Inc.";
          }
          if (parameter === 37446) {
            return "Intel Iris OpenGL Engine";
          }
          return getParameterProto.call(this, parameter);
        };
        const getParameterProto2 = WebGL2RenderingContext.prototype.getParameter;
        WebGL2RenderingContext.prototype.getParameter = function(parameter) {
          if (parameter === 37445) {
            return "Intel Inc.";
          }
          if (parameter === 37446) {
            return "Intel Iris OpenGL Engine";
          }
          return getParameterProto2.call(this, parameter);
        };
      });
      try {
        const sessionPath = import_path2.default.join(userDataPath, "session.json");
        if (import_fs2.default.existsSync(sessionPath)) {
          console.log("\u{1F36A} BrowserManager: Found session.json from Onboarding. Injecting cookies...");
          const sessionData = JSON.parse(import_fs2.default.readFileSync(sessionPath, "utf-8"));
          if (sessionData && Array.isArray(sessionData.cookies)) {
            await this.browserContext.addCookies(sessionData.cookies);
            console.log(`\u2705 BrowserManager: Injected ${sessionData.cookies.length} cookies from session.json`);
          }
        }
      } catch (err) {
        console.error("\u26A0\uFE0F BrowserManager: Failed to sync session.json cookies:", err);
      }
      console.log("\u2705 DEBUG: Browser context created successfully");
      this.browserContext.on("close", () => {
        console.log("\u274C BrowserManager: Context closed unexpectedly (or manually). Clearing reference.");
        this.browserContext = null;
      });
      console.log("\u2705 DEBUG: Returning browser context, pages count:", this.browserContext.pages().length);
      return this.browserContext;
    } catch (error) {
      console.error("\u{1F525} BrowserManager: Failed to launch browser:", error);
      console.error("\u{1F525} Stack trace:", error.stack);
      this.browserContext = null;
      throw error;
    }
  }
  /**
   * Safely closes the current browser instance.
   */
  async close() {
    if (!this.browserContext) return;
    try {
      console.log("\u{1F6D1} BrowserManager: Closing browser...");
      await this.browserContext.close();
    } catch (error) {
      console.error("\u26A0\uFE0F BrowserManager: Error during close (likely already closed):", error);
    } finally {
      this.browserContext = null;
    }
  }
  /**
   * NUCLEAR OPTION: Closes the browser and WIPES the persistent profile directory.
   * Used for "Reset All" functionality.
   */
  async clearData() {
    console.log("\u2622\uFE0F BrowserManager: Initiating Data Wipe...");
    await this.close();
    try {
      const userDataPath = import_electron2.app.getPath("userData");
      const persistentContextPath = import_path2.default.join(userDataPath, "kowalski_browser");
      if (import_fs2.default.existsSync(persistentContextPath)) {
        import_fs2.default.rmSync(persistentContextPath, { recursive: true, force: true });
        console.log("\u2705 BrowserManager: Wiped kowalski_browser directory.");
      } else {
        console.log("\u2139\uFE0F BrowserManager: No directory to wipe.");
      }
    } catch (error) {
      console.error("\u274C BrowserManager: Failed to wipe data:", error);
    }
  }
  /**
   * Launches a frameless overlay for login, locked to the UI.
   */
  async login(bounds, mainWindow2) {
    console.log("\u{1F510} BrowserManager: Starting Single Vehicle Login Overlay...");
    mainWindow2.setMovable(false);
    try {
      console.log("\u{1F50D} DEBUG login: Bounds received:", bounds);
      const context = await this.launch({ headless: false, bounds });
      console.log("\u{1F50D} DEBUG login: Context launched successfully");
      const pages = context.pages();
      console.log("\u{1F50D} DEBUG login: Pages count:", pages.length);
      const page = pages.length > 0 ? pages[0] : await context.newPage();
      console.log("\u{1F50D} DEBUG login: Got page, URL:", page.url());
      context.on("page", async (newPage) => {
        await new Promise((resolve) => setTimeout(resolve, 100));
        const allPages = context.pages();
        if (allPages.length > 1) {
          console.log("\u{1F6AB} BrowserManager: Blocked attempt to open new window.");
          try {
            await newPage.close();
          } catch (e) {
          }
        }
      });
      console.log("\u{1F30D} Waiting for Instagram Login page to be ready...");
      try {
        await page.waitForLoadState("domcontentloaded", { timeout: 1e4 });
      } catch (e) {
        console.log("\u26A0\uFE0F Page load state wait timed out, continuing anyway...");
      }
      try {
        console.log("\u23F3 Waiting for user to complete login...");
        const loginSuccess = await this.waitForLoginSuccessViaCDP(page, 3e5);
        if (loginSuccess) {
          console.log("\u2705 INSTAGRAM LOGIN CONFIRMED (Overlay)");
          await this.close();
          mainWindow2.setMovable(true);
          return true;
        } else {
          throw new Error("Login timeout");
        }
      } catch (e) {
        console.log("\u274C Login/Timeout failed.");
        throw e;
      }
    } catch (error) {
      console.error("\u26A0\uFE0F Login Overlay Failed/Cancelled:", error);
      await this.close();
      mainWindow2.setMovable(true);
      return false;
    }
  }
  /**
   * Returns the current active context, or null if not running.
   */
  getContext() {
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
  async validateSession() {
    if (!this.browserContext) {
      return { valid: false, reason: "NO_CONTEXT" };
    }
    try {
      const pages = this.browserContext.pages();
      const page = pages.length > 0 ? pages[0] : await this.browserContext.newPage();
      const url = page.url();
      if (!url.includes("instagram.com")) {
        await page.goto("https://www.instagram.com/", { waitUntil: "domcontentloaded" });
      }
      const currentUrl = page.url();
      if (currentUrl.includes("/accounts/login")) {
        return { valid: false, reason: "SESSION_EXPIRED" };
      }
      if (currentUrl.includes("/challenge")) {
        return { valid: false, reason: "CHALLENGE_REQUIRED" };
      }
      if (currentUrl.includes("/accounts/suspended")) {
        return { valid: false, reason: "RATE_LIMITED" };
      }
      const isValid = await this.checkLoginStateViaCDP(page);
      if (isValid) {
        console.log("\u2705 Session validation: Valid");
        return { valid: true };
      } else {
        console.log("\u274C Session validation: Not logged in");
        return { valid: false, reason: "SESSION_EXPIRED" };
      }
    } catch (error) {
      console.error("\u274C Session validation error:", error.message);
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
  async waitForLoginSuccessViaCDP(page, timeout) {
    const startTime = Date.now();
    const pollInterval = 1500;
    while (Date.now() - startTime < timeout) {
      const url = page.url();
      if (url.includes("/accounts/login") || url.includes("/challenge")) {
        await new Promise((r) => setTimeout(r, pollInterval));
        continue;
      }
      if (url.includes("instagram.com")) {
        const isLoggedIn = await this.checkLoginStateViaCDP(page);
        if (isLoggedIn) {
          return true;
        }
      }
      await new Promise((r) => setTimeout(r, pollInterval));
    }
    return false;
  }
  /**
   * Check login state using CDP accessibility tree.
   * Looks for navigation elements that only appear when logged in.
   *
   * NO DOM queries, NO selectors - completely undetectable.
   */
  async checkLoginStateViaCDP(page) {
    let cdpSession = null;
    try {
      cdpSession = await page.context().newCDPSession(page);
      const { nodes } = await cdpSession.send("Accessibility.getFullAXTree");
      const loggedInIndicators = ["home", "search", "explore", "new post", "profile"];
      const hasLoggedInElement = nodes.some((node) => {
        if (node.ignored) return false;
        const nodeName = (node.name?.value || "").toLowerCase();
        const nodeRole = node.role?.value?.toLowerCase();
        if (nodeRole !== "link" && nodeRole !== "button") return false;
        return loggedInIndicators.some((indicator) => nodeName.includes(indicator));
      });
      return hasLoggedInElement;
    } catch (error) {
      console.warn("CDP accessibility check failed:", error);
      return false;
    } finally {
      if (cdpSession) {
        await cdpSession.detach().catch(() => {
        });
      }
    }
  }
};

// src/main/services/SecureKeyManager.ts
var import_electron3 = require("electron");
var SecureKeyManager = class _SecureKeyManager {
  static instance;
  constructor() {
  }
  static getInstance() {
    if (!_SecureKeyManager.instance) {
      _SecureKeyManager.instance = new _SecureKeyManager();
    }
    return _SecureKeyManager.instance;
  }
  // Helper to dynamically load electron-store (ESM)
  async getStore() {
    const { default: Store } = await import("electron-store");
    return new Store();
  }
  /**
   * Encrypts and saves the API key to disk.
   */
  async setKey(apiKey) {
    if (!import_electron3.safeStorage.isEncryptionAvailable()) {
      console.error("SafeStorage encryption is not available.");
      return false;
    }
    try {
      const buffer = import_electron3.safeStorage.encryptString(apiKey);
      const store = await this.getStore();
      store.set("secure.openaiApiKey", buffer.toString("hex"));
      return true;
    } catch (error) {
      console.error("Failed to encrypt API key:", error);
      return false;
    }
  }
  /**
   * Retrieves and decrypts the API key.
   * Returns null if missing or decryption fails.
   */
  async getKey() {
    if (!import_electron3.safeStorage.isEncryptionAvailable()) return null;
    try {
      const store = await this.getStore();
      const hex = store.get("secure.openaiApiKey");
      if (!hex) return null;
      const buffer = Buffer.from(hex, "hex");
      return import_electron3.safeStorage.decryptString(buffer);
    } catch (error) {
      console.error("Decryption failed, treating key as missing:", error);
      return null;
    }
  }
  /**
   * Checks the status of the key without exposing it.
   */
  async getKeyStatus() {
    if (!import_electron3.safeStorage.isEncryptionAvailable()) {
      return "locked";
    }
    try {
      const store = await this.getStore();
      const hex = store.get("secure.openaiApiKey");
      if (!hex) {
        return "missing";
      }
      return "secured";
    } catch (error) {
      console.error("Error checking key status:", error);
      return "missing";
    }
  }
};

// src/main/services/UsageService.ts
var MODEL_RATES = {
  INPUT_TOKEN: 25e-7,
  // $2.50 / 1M
  CACHED_INPUT_TOKEN: 125e-8,
  // $1.25 / 1M
  OUTPUT_TOKEN: 1e-5
  // $10.00 / 1M
};
var UsageService = class _UsageService {
  static instance;
  constructor() {
  }
  static getInstance() {
    if (!_UsageService.instance) {
      _UsageService.instance = new _UsageService();
    }
    return _UsageService.instance;
  }
  // Helper to dynamically load electron-store (ESM)
  async getStore() {
    const { default: Store } = await import("electron-store");
    return new Store();
  }
  /**
   * Initializes usage data if not present.
   * Performs monthly reset check on startup.
   */
  async initialize() {
    const store = await this.getStore();
    const usage = store.get("usageData");
    if (!usage) {
      const initial = {
        currentMonthSpend: 0,
        lastResetDate: (/* @__PURE__ */ new Date()).toISOString()
      };
      store.set("usageData", initial);
      return;
    }
    await this.checkMonthlyReset();
  }
  /**
   * Resets spending if we have entered a new month relative to lastResetDate.
   */
  async checkMonthlyReset() {
    const store = await this.getStore();
    const usage = store.get("usageData");
    if (!usage) return;
    const lastDate = new Date(usage.lastResetDate);
    const now = /* @__PURE__ */ new Date();
    if (lastDate.getMonth() !== now.getMonth() || lastDate.getFullYear() !== now.getFullYear()) {
      console.log("\u{1F5D3}\uFE0F Monthly Usage Reset Triggered.");
      const resetData = {
        currentMonthSpend: 0,
        lastResetDate: now.toISOString()
      };
      store.set("usageData", resetData);
    }
  }
  /**
   * Calculates estimated cost for Vision requests (Pre-flight).
   * Returns cost in Dollars (e.g., 0.0005)
   */
  calculateVisionCost(width, height, detail = "high") {
    let tokens = 0;
    if (detail === "low") {
      tokens = 85;
    } else {
      let scaledWidth = width;
      let scaledHeight = height;
      if (scaledWidth > 2048 || scaledHeight > 2048) {
        const ratio = Math.min(2048 / scaledWidth, 2048 / scaledHeight);
        scaledWidth = Math.floor(scaledWidth * ratio);
        scaledHeight = Math.floor(scaledHeight * ratio);
      }
      const shortestSide = Math.min(scaledWidth, scaledHeight);
      const scaleFactor = 768 / shortestSide;
      scaledWidth = Math.floor(scaledWidth * scaleFactor);
      scaledHeight = Math.floor(scaledHeight * scaleFactor);
      const tilesX = Math.ceil(scaledWidth / 512);
      const tilesY = Math.ceil(scaledHeight / 512);
      const totalTiles = tilesX * tilesY;
      tokens = 85 + 170 * totalTiles;
    }
    return tokens * MODEL_RATES.INPUT_TOKEN;
  }
  /**
   * Adds actual API usage to the accumulator.
   */
  async incrementUsage(usage) {
    const cached = usage.prompt_tokens_details?.cached_tokens || 0;
    const regularInput = Math.max(0, usage.prompt_tokens - cached);
    const output = usage.completion_tokens || 0;
    const cost = regularInput * MODEL_RATES.INPUT_TOKEN + cached * MODEL_RATES.CACHED_INPUT_TOKEN + output * MODEL_RATES.OUTPUT_TOKEN;
    const store = await this.getStore();
    const currentData = store.get("usageData");
    const currentSpend = currentData?.currentMonthSpend || 0;
    const lastReset = currentData?.lastResetDate || (/* @__PURE__ */ new Date()).toISOString();
    const newSpend = currentSpend + cost;
    store.set("usageData", {
      currentMonthSpend: newSpend,
      lastResetDate: lastReset
    });
    console.log(`\u{1F4B0} Usage Added: $${cost.toFixed(6)} | Total: $${newSpend.toFixed(4)}`);
    return newSpend;
  }
  /**
   * Checks if current spending + estimated cost exceeds the cap.
   */
  async isOverBudget(cap, estimatedCost = 0) {
    const store = await this.getStore();
    const usage = store.get("usageData");
    const current = usage?.currentMonthSpend || 0;
    return current + estimatedCost >= cap;
  }
  /**
   * Returns current usage data.
   */
  async getUsage() {
    const store = await this.getStore();
    return store.get("usageData") || { currentMonthSpend: 0, lastResetDate: (/* @__PURE__ */ new Date()).toISOString() };
  }
  /**
   * Returns remaining budget and estimated API calls available.
   * Used for smart session planning.
   */
  async getBudgetStatus(cap) {
    const store = await this.getStore();
    const usage = store.get("usageData");
    const currentSpend = usage?.currentMonthSpend || 0;
    const remaining = Math.max(0, cap - currentSpend);
    const COST_PER_VISION_CALL = 0.01;
    const estimatedCallsRemaining = Math.floor(remaining / COST_PER_VISION_CALL);
    return { currentSpend, remaining, estimatedCallsRemaining };
  }
  /**
   * Quick check if we can afford at least one more Vision API call.
   */
  async canAffordVisionCall(cap) {
    const COST_PER_VISION_CALL = 0.01;
    return !await this.isOverBudget(cap, COST_PER_VISION_CALL);
  }
};

// src/main/services/SchedulerService.ts
var import_electron4 = require("electron");
var import_fs3 = __toESM(require("fs"), 1);
var import_path3 = __toESM(require("path"), 1);
var import_child_process = require("child_process");

// src/main/services/LoremIpsumGenerator.ts
var LoremIpsumGenerator = class {
  static TITLES = [
    "The Digital Frontier",
    "Silicon Valley Morning",
    "The Cupertino Dispatch",
    "Tech & Culture Weekly",
    "The Midnight Protocol",
    "Future Tense",
    "The Analog Revival"
  ];
  static SUBTITLES = [
    "Exploring the intersection of humanity and algorithms.",
    "A deep dive into the week's events and their impact.",
    "Why the next big thing might be smaller than you think.",
    "Reflections on privacy, connection, and the digital self.",
    "Navigating the noise of the information age."
  ];
  static HEADINGS = [
    "The AI Revolution",
    "Market Shifts",
    "Global Perspectives",
    "Design Patterns",
    "Community & Core",
    "The New Normal",
    "Sustainable Futures"
  ];
  static PARAGRAPHS = [
    "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.",
    "Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.",
    "Sed ut perspiciatis unde omnis iste natus error sit voluptatem accusantium doloremque laudantium, totam rem aperiam, eaque ipsa quae ab illo inventore veritatis et quasi architecto beatae vitae dicta sunt explicabo.",
    "At vero eos et accusamus et iusto odio dignissimos ducimus qui blanditiis praesentium voluptatum deleniti atque corrupti quos dolores et quas molestias excepturi sint occaecati cupiditate non provident.",
    "Nam libero tempore, cum soluta nobis est eligendi optio cumque nihil impedit quo minus id quod maxime placeat facere possimus, omnis voluptas assumenda est, omnis dolor repellendus."
  ];
  static getRandom(array) {
    return array[Math.floor(Math.random() * array.length)];
  }
  static generateSection() {
    const numParagraphs = Math.floor(Math.random() * 3) + 1;
    const content = [];
    for (let i = 0; i < numParagraphs; i++) {
      content.push(this.getRandom(this.PARAGRAPHS));
    }
    return {
      heading: this.getRandom(this.HEADINGS),
      content
    };
  }
  static generate(options) {
    const numSections = Math.floor(Math.random() * 2) + 2;
    const sections = [];
    for (let i = 0; i < numSections; i++) {
      sections.push(this.generateSection());
    }
    const date = options?.targetDate ? new Date(options.targetDate) : /* @__PURE__ */ new Date();
    const dayName = date.toLocaleDateString("en-US", { weekday: "long" });
    let title = `The ${dayName} Analysis`;
    if (options?.userName && options.userName.trim().length > 0) {
      const name = options.userName.trim();
      title = `${name}'s ${dayName} Analysis`;
    }
    const location = options?.location || "";
    return {
      title,
      subtitle: this.getRandom(this.SUBTITLES),
      date: date.toISOString(),
      location,
      scheduledTime: options?.scheduledTime || "8:00 AM",
      sections
    };
  }
};

// src/main/services/SchedulerService.ts
var import_uuid = require("uuid");

// node_modules/bezier-js/src/utils.js
var { abs, cos, sin, acos, atan2, sqrt, pow } = Math;
function crt(v) {
  return v < 0 ? -pow(-v, 1 / 3) : pow(v, 1 / 3);
}
var pi = Math.PI;
var tau = 2 * pi;
var quart = pi / 2;
var epsilon = 1e-6;
var nMax = Number.MAX_SAFE_INTEGER || 9007199254740991;
var nMin = Number.MIN_SAFE_INTEGER || -9007199254740991;
var ZERO = { x: 0, y: 0, z: 0 };
var utils = {
  // Legendre-Gauss abscissae with n=24 (x_i values, defined at i=n as the roots of the nth order Legendre polynomial Pn(x))
  Tvalues: [
    -0.06405689286260563,
    0.06405689286260563,
    -0.1911188674736163,
    0.1911188674736163,
    -0.3150426796961634,
    0.3150426796961634,
    -0.4337935076260451,
    0.4337935076260451,
    -0.5454214713888396,
    0.5454214713888396,
    -0.6480936519369755,
    0.6480936519369755,
    -0.7401241915785544,
    0.7401241915785544,
    -0.820001985973903,
    0.820001985973903,
    -0.8864155270044011,
    0.8864155270044011,
    -0.9382745520027328,
    0.9382745520027328,
    -0.9747285559713095,
    0.9747285559713095,
    -0.9951872199970213,
    0.9951872199970213
  ],
  // Legendre-Gauss weights with n=24 (w_i values, defined by a function linked to in the Bezier primer article)
  Cvalues: [
    0.12793819534675216,
    0.12793819534675216,
    0.1258374563468283,
    0.1258374563468283,
    0.12167047292780339,
    0.12167047292780339,
    0.1155056680537256,
    0.1155056680537256,
    0.10744427011596563,
    0.10744427011596563,
    0.09761865210411388,
    0.09761865210411388,
    0.08619016153195327,
    0.08619016153195327,
    0.0733464814110803,
    0.0733464814110803,
    0.05929858491543678,
    0.05929858491543678,
    0.04427743881741981,
    0.04427743881741981,
    0.028531388628933663,
    0.028531388628933663,
    0.0123412297999872,
    0.0123412297999872
  ],
  arcfn: function(t2, derivativeFn) {
    const d = derivativeFn(t2);
    let l = d.x * d.x + d.y * d.y;
    if (typeof d.z !== "undefined") {
      l += d.z * d.z;
    }
    return sqrt(l);
  },
  compute: function(t2, points, _3d) {
    if (t2 === 0) {
      points[0].t = 0;
      return points[0];
    }
    const order = points.length - 1;
    if (t2 === 1) {
      points[order].t = 1;
      return points[order];
    }
    const mt = 1 - t2;
    let p = points;
    if (order === 0) {
      points[0].t = t2;
      return points[0];
    }
    if (order === 1) {
      const ret = {
        x: mt * p[0].x + t2 * p[1].x,
        y: mt * p[0].y + t2 * p[1].y,
        t: t2
      };
      if (_3d) {
        ret.z = mt * p[0].z + t2 * p[1].z;
      }
      return ret;
    }
    if (order < 4) {
      let mt2 = mt * mt, t22 = t2 * t2, a, b, c, d = 0;
      if (order === 2) {
        p = [p[0], p[1], p[2], ZERO];
        a = mt2;
        b = mt * t2 * 2;
        c = t22;
      } else if (order === 3) {
        a = mt2 * mt;
        b = mt2 * t2 * 3;
        c = mt * t22 * 3;
        d = t2 * t22;
      }
      const ret = {
        x: a * p[0].x + b * p[1].x + c * p[2].x + d * p[3].x,
        y: a * p[0].y + b * p[1].y + c * p[2].y + d * p[3].y,
        t: t2
      };
      if (_3d) {
        ret.z = a * p[0].z + b * p[1].z + c * p[2].z + d * p[3].z;
      }
      return ret;
    }
    const dCpts = JSON.parse(JSON.stringify(points));
    while (dCpts.length > 1) {
      for (let i = 0; i < dCpts.length - 1; i++) {
        dCpts[i] = {
          x: dCpts[i].x + (dCpts[i + 1].x - dCpts[i].x) * t2,
          y: dCpts[i].y + (dCpts[i + 1].y - dCpts[i].y) * t2
        };
        if (typeof dCpts[i].z !== "undefined") {
          dCpts[i].z = dCpts[i].z + (dCpts[i + 1].z - dCpts[i].z) * t2;
        }
      }
      dCpts.splice(dCpts.length - 1, 1);
    }
    dCpts[0].t = t2;
    return dCpts[0];
  },
  computeWithRatios: function(t2, points, ratios, _3d) {
    const mt = 1 - t2, r = ratios, p = points;
    let f1 = r[0], f2 = r[1], f3 = r[2], f4 = r[3], d;
    f1 *= mt;
    f2 *= t2;
    if (p.length === 2) {
      d = f1 + f2;
      return {
        x: (f1 * p[0].x + f2 * p[1].x) / d,
        y: (f1 * p[0].y + f2 * p[1].y) / d,
        z: !_3d ? false : (f1 * p[0].z + f2 * p[1].z) / d,
        t: t2
      };
    }
    f1 *= mt;
    f2 *= 2 * mt;
    f3 *= t2 * t2;
    if (p.length === 3) {
      d = f1 + f2 + f3;
      return {
        x: (f1 * p[0].x + f2 * p[1].x + f3 * p[2].x) / d,
        y: (f1 * p[0].y + f2 * p[1].y + f3 * p[2].y) / d,
        z: !_3d ? false : (f1 * p[0].z + f2 * p[1].z + f3 * p[2].z) / d,
        t: t2
      };
    }
    f1 *= mt;
    f2 *= 1.5 * mt;
    f3 *= 3 * mt;
    f4 *= t2 * t2 * t2;
    if (p.length === 4) {
      d = f1 + f2 + f3 + f4;
      return {
        x: (f1 * p[0].x + f2 * p[1].x + f3 * p[2].x + f4 * p[3].x) / d,
        y: (f1 * p[0].y + f2 * p[1].y + f3 * p[2].y + f4 * p[3].y) / d,
        z: !_3d ? false : (f1 * p[0].z + f2 * p[1].z + f3 * p[2].z + f4 * p[3].z) / d,
        t: t2
      };
    }
  },
  derive: function(points, _3d) {
    const dpoints = [];
    for (let p = points, d = p.length, c = d - 1; d > 1; d--, c--) {
      const list = [];
      for (let j = 0, dpt; j < c; j++) {
        dpt = {
          x: c * (p[j + 1].x - p[j].x),
          y: c * (p[j + 1].y - p[j].y)
        };
        if (_3d) {
          dpt.z = c * (p[j + 1].z - p[j].z);
        }
        list.push(dpt);
      }
      dpoints.push(list);
      p = list;
    }
    return dpoints;
  },
  between: function(v, m, M) {
    return m <= v && v <= M || utils.approximately(v, m) || utils.approximately(v, M);
  },
  approximately: function(a, b, precision) {
    return abs(a - b) <= (precision || epsilon);
  },
  length: function(derivativeFn) {
    const z = 0.5, len = utils.Tvalues.length;
    let sum = 0;
    for (let i = 0, t2; i < len; i++) {
      t2 = z * utils.Tvalues[i] + z;
      sum += utils.Cvalues[i] * utils.arcfn(t2, derivativeFn);
    }
    return z * sum;
  },
  map: function(v, ds, de, ts, te) {
    const d1 = de - ds, d2 = te - ts, v2 = v - ds, r = v2 / d1;
    return ts + d2 * r;
  },
  lerp: function(r, v1, v2) {
    const ret = {
      x: v1.x + r * (v2.x - v1.x),
      y: v1.y + r * (v2.y - v1.y)
    };
    if (v1.z !== void 0 && v2.z !== void 0) {
      ret.z = v1.z + r * (v2.z - v1.z);
    }
    return ret;
  },
  pointToString: function(p) {
    let s = p.x + "/" + p.y;
    if (typeof p.z !== "undefined") {
      s += "/" + p.z;
    }
    return s;
  },
  pointsToString: function(points) {
    return "[" + points.map(utils.pointToString).join(", ") + "]";
  },
  copy: function(obj) {
    return JSON.parse(JSON.stringify(obj));
  },
  angle: function(o, v1, v2) {
    const dx1 = v1.x - o.x, dy1 = v1.y - o.y, dx2 = v2.x - o.x, dy2 = v2.y - o.y, cross = dx1 * dy2 - dy1 * dx2, dot = dx1 * dx2 + dy1 * dy2;
    return atan2(cross, dot);
  },
  // round as string, to avoid rounding errors
  round: function(v, d) {
    const s = "" + v;
    const pos = s.indexOf(".");
    return parseFloat(s.substring(0, pos + 1 + d));
  },
  dist: function(p1, p2) {
    const dx = p1.x - p2.x, dy = p1.y - p2.y;
    return sqrt(dx * dx + dy * dy);
  },
  closest: function(LUT, point) {
    let mdist = pow(2, 63), mpos, d;
    LUT.forEach(function(p, idx) {
      d = utils.dist(point, p);
      if (d < mdist) {
        mdist = d;
        mpos = idx;
      }
    });
    return { mdist, mpos };
  },
  abcratio: function(t2, n) {
    if (n !== 2 && n !== 3) {
      return false;
    }
    if (typeof t2 === "undefined") {
      t2 = 0.5;
    } else if (t2 === 0 || t2 === 1) {
      return t2;
    }
    const bottom = pow(t2, n) + pow(1 - t2, n), top = bottom - 1;
    return abs(top / bottom);
  },
  projectionratio: function(t2, n) {
    if (n !== 2 && n !== 3) {
      return false;
    }
    if (typeof t2 === "undefined") {
      t2 = 0.5;
    } else if (t2 === 0 || t2 === 1) {
      return t2;
    }
    const top = pow(1 - t2, n), bottom = pow(t2, n) + top;
    return top / bottom;
  },
  lli8: function(x1, y1, x2, y2, x3, y3, x4, y4) {
    const nx = (x1 * y2 - y1 * x2) * (x3 - x4) - (x1 - x2) * (x3 * y4 - y3 * x4), ny = (x1 * y2 - y1 * x2) * (y3 - y4) - (y1 - y2) * (x3 * y4 - y3 * x4), d = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
    if (d == 0) {
      return false;
    }
    return { x: nx / d, y: ny / d };
  },
  lli4: function(p1, p2, p3, p4) {
    const x1 = p1.x, y1 = p1.y, x2 = p2.x, y2 = p2.y, x3 = p3.x, y3 = p3.y, x4 = p4.x, y4 = p4.y;
    return utils.lli8(x1, y1, x2, y2, x3, y3, x4, y4);
  },
  lli: function(v1, v2) {
    return utils.lli4(v1, v1.c, v2, v2.c);
  },
  makeline: function(p1, p2) {
    return new Bezier(
      p1.x,
      p1.y,
      (p1.x + p2.x) / 2,
      (p1.y + p2.y) / 2,
      p2.x,
      p2.y
    );
  },
  findbbox: function(sections) {
    let mx = nMax, my = nMax, MX = nMin, MY = nMin;
    sections.forEach(function(s) {
      const bbox = s.bbox();
      if (mx > bbox.x.min) mx = bbox.x.min;
      if (my > bbox.y.min) my = bbox.y.min;
      if (MX < bbox.x.max) MX = bbox.x.max;
      if (MY < bbox.y.max) MY = bbox.y.max;
    });
    return {
      x: { min: mx, mid: (mx + MX) / 2, max: MX, size: MX - mx },
      y: { min: my, mid: (my + MY) / 2, max: MY, size: MY - my }
    };
  },
  shapeintersections: function(s1, bbox1, s2, bbox2, curveIntersectionThreshold) {
    if (!utils.bboxoverlap(bbox1, bbox2)) return [];
    const intersections = [];
    const a1 = [s1.startcap, s1.forward, s1.back, s1.endcap];
    const a2 = [s2.startcap, s2.forward, s2.back, s2.endcap];
    a1.forEach(function(l1) {
      if (l1.virtual) return;
      a2.forEach(function(l2) {
        if (l2.virtual) return;
        const iss = l1.intersects(l2, curveIntersectionThreshold);
        if (iss.length > 0) {
          iss.c1 = l1;
          iss.c2 = l2;
          iss.s1 = s1;
          iss.s2 = s2;
          intersections.push(iss);
        }
      });
    });
    return intersections;
  },
  makeshape: function(forward, back, curveIntersectionThreshold) {
    const bpl = back.points.length;
    const fpl = forward.points.length;
    const start = utils.makeline(back.points[bpl - 1], forward.points[0]);
    const end = utils.makeline(forward.points[fpl - 1], back.points[0]);
    const shape = {
      startcap: start,
      forward,
      back,
      endcap: end,
      bbox: utils.findbbox([start, forward, back, end])
    };
    shape.intersections = function(s2) {
      return utils.shapeintersections(
        shape,
        shape.bbox,
        s2,
        s2.bbox,
        curveIntersectionThreshold
      );
    };
    return shape;
  },
  getminmax: function(curve, d, list) {
    if (!list) return { min: 0, max: 0 };
    let min2 = nMax, max2 = nMin, t2, c;
    if (list.indexOf(0) === -1) {
      list = [0].concat(list);
    }
    if (list.indexOf(1) === -1) {
      list.push(1);
    }
    for (let i = 0, len = list.length; i < len; i++) {
      t2 = list[i];
      c = curve.get(t2);
      if (c[d] < min2) {
        min2 = c[d];
      }
      if (c[d] > max2) {
        max2 = c[d];
      }
    }
    return { min: min2, mid: (min2 + max2) / 2, max: max2, size: max2 - min2 };
  },
  align: function(points, line) {
    const tx = line.p1.x, ty = line.p1.y, a = -atan2(line.p2.y - ty, line.p2.x - tx), d = function(v) {
      return {
        x: (v.x - tx) * cos(a) - (v.y - ty) * sin(a),
        y: (v.x - tx) * sin(a) + (v.y - ty) * cos(a)
      };
    };
    return points.map(d);
  },
  roots: function(points, line) {
    line = line || { p1: { x: 0, y: 0 }, p2: { x: 1, y: 0 } };
    const order = points.length - 1;
    const aligned = utils.align(points, line);
    const reduce = function(t2) {
      return 0 <= t2 && t2 <= 1;
    };
    if (order === 2) {
      const a2 = aligned[0].y, b2 = aligned[1].y, c2 = aligned[2].y, d2 = a2 - 2 * b2 + c2;
      if (d2 !== 0) {
        const m1 = -sqrt(b2 * b2 - a2 * c2), m2 = -a2 + b2, v12 = -(m1 + m2) / d2, v2 = -(-m1 + m2) / d2;
        return [v12, v2].filter(reduce);
      } else if (b2 !== c2 && d2 === 0) {
        return [(2 * b2 - c2) / (2 * b2 - 2 * c2)].filter(reduce);
      }
      return [];
    }
    const pa = aligned[0].y, pb = aligned[1].y, pc = aligned[2].y, pd = aligned[3].y;
    let d = -pa + 3 * pb - 3 * pc + pd, a = 3 * pa - 6 * pb + 3 * pc, b = -3 * pa + 3 * pb, c = pa;
    if (utils.approximately(d, 0)) {
      if (utils.approximately(a, 0)) {
        if (utils.approximately(b, 0)) {
          return [];
        }
        return [-c / b].filter(reduce);
      }
      const q3 = sqrt(b * b - 4 * a * c), a2 = 2 * a;
      return [(q3 - b) / a2, (-b - q3) / a2].filter(reduce);
    }
    a /= d;
    b /= d;
    c /= d;
    const p = (3 * b - a * a) / 3, p3 = p / 3, q = (2 * a * a * a - 9 * a * b + 27 * c) / 27, q2 = q / 2, discriminant = q2 * q2 + p3 * p3 * p3;
    let u1, v1, x1, x2, x3;
    if (discriminant < 0) {
      const mp3 = -p / 3, mp33 = mp3 * mp3 * mp3, r = sqrt(mp33), t2 = -q / (2 * r), cosphi = t2 < -1 ? -1 : t2 > 1 ? 1 : t2, phi = acos(cosphi), crtr = crt(r), t1 = 2 * crtr;
      x1 = t1 * cos(phi / 3) - a / 3;
      x2 = t1 * cos((phi + tau) / 3) - a / 3;
      x3 = t1 * cos((phi + 2 * tau) / 3) - a / 3;
      return [x1, x2, x3].filter(reduce);
    } else if (discriminant === 0) {
      u1 = q2 < 0 ? crt(-q2) : -crt(q2);
      x1 = 2 * u1 - a / 3;
      x2 = -u1 - a / 3;
      return [x1, x2].filter(reduce);
    } else {
      const sd = sqrt(discriminant);
      u1 = crt(-q2 + sd);
      v1 = crt(q2 + sd);
      return [u1 - v1 - a / 3].filter(reduce);
    }
  },
  droots: function(p) {
    if (p.length === 3) {
      const a = p[0], b = p[1], c = p[2], d = a - 2 * b + c;
      if (d !== 0) {
        const m1 = -sqrt(b * b - a * c), m2 = -a + b, v1 = -(m1 + m2) / d, v2 = -(-m1 + m2) / d;
        return [v1, v2];
      } else if (b !== c && d === 0) {
        return [(2 * b - c) / (2 * (b - c))];
      }
      return [];
    }
    if (p.length === 2) {
      const a = p[0], b = p[1];
      if (a !== b) {
        return [a / (a - b)];
      }
      return [];
    }
    return [];
  },
  curvature: function(t2, d1, d2, _3d, kOnly) {
    let num, dnm, adk, dk, k = 0, r = 0;
    const d = utils.compute(t2, d1);
    const dd = utils.compute(t2, d2);
    const qdsum = d.x * d.x + d.y * d.y;
    if (_3d) {
      num = sqrt(
        pow(d.y * dd.z - dd.y * d.z, 2) + pow(d.z * dd.x - dd.z * d.x, 2) + pow(d.x * dd.y - dd.x * d.y, 2)
      );
      dnm = pow(qdsum + d.z * d.z, 3 / 2);
    } else {
      num = d.x * dd.y - d.y * dd.x;
      dnm = pow(qdsum, 3 / 2);
    }
    if (num === 0 || dnm === 0) {
      return { k: 0, r: 0 };
    }
    k = num / dnm;
    r = dnm / num;
    if (!kOnly) {
      const pk = utils.curvature(t2 - 1e-3, d1, d2, _3d, true).k;
      const nk = utils.curvature(t2 + 1e-3, d1, d2, _3d, true).k;
      dk = (nk - k + (k - pk)) / 2;
      adk = (abs(nk - k) + abs(k - pk)) / 2;
    }
    return { k, r, dk, adk };
  },
  inflections: function(points) {
    if (points.length < 4) return [];
    const p = utils.align(points, { p1: points[0], p2: points.slice(-1)[0] }), a = p[2].x * p[1].y, b = p[3].x * p[1].y, c = p[1].x * p[2].y, d = p[3].x * p[2].y, v1 = 18 * (-3 * a + 2 * b + 3 * c - d), v2 = 18 * (3 * a - b - 3 * c), v3 = 18 * (c - a);
    if (utils.approximately(v1, 0)) {
      if (!utils.approximately(v2, 0)) {
        let t2 = -v3 / v2;
        if (0 <= t2 && t2 <= 1) return [t2];
      }
      return [];
    }
    const d2 = 2 * v1;
    if (utils.approximately(d2, 0)) return [];
    const trm = v2 * v2 - 4 * v1 * v3;
    if (trm < 0) return [];
    const sq = Math.sqrt(trm);
    return [(sq - v2) / d2, -(v2 + sq) / d2].filter(function(r) {
      return 0 <= r && r <= 1;
    });
  },
  bboxoverlap: function(b1, b2) {
    const dims = ["x", "y"], len = dims.length;
    for (let i = 0, dim, l, t2, d; i < len; i++) {
      dim = dims[i];
      l = b1[dim].mid;
      t2 = b2[dim].mid;
      d = (b1[dim].size + b2[dim].size) / 2;
      if (abs(l - t2) >= d) return false;
    }
    return true;
  },
  expandbox: function(bbox, _bbox) {
    if (_bbox.x.min < bbox.x.min) {
      bbox.x.min = _bbox.x.min;
    }
    if (_bbox.y.min < bbox.y.min) {
      bbox.y.min = _bbox.y.min;
    }
    if (_bbox.z && _bbox.z.min < bbox.z.min) {
      bbox.z.min = _bbox.z.min;
    }
    if (_bbox.x.max > bbox.x.max) {
      bbox.x.max = _bbox.x.max;
    }
    if (_bbox.y.max > bbox.y.max) {
      bbox.y.max = _bbox.y.max;
    }
    if (_bbox.z && _bbox.z.max > bbox.z.max) {
      bbox.z.max = _bbox.z.max;
    }
    bbox.x.mid = (bbox.x.min + bbox.x.max) / 2;
    bbox.y.mid = (bbox.y.min + bbox.y.max) / 2;
    if (bbox.z) {
      bbox.z.mid = (bbox.z.min + bbox.z.max) / 2;
    }
    bbox.x.size = bbox.x.max - bbox.x.min;
    bbox.y.size = bbox.y.max - bbox.y.min;
    if (bbox.z) {
      bbox.z.size = bbox.z.max - bbox.z.min;
    }
  },
  pairiteration: function(c1, c2, curveIntersectionThreshold) {
    const c1b = c1.bbox(), c2b = c2.bbox(), r = 1e5, threshold = curveIntersectionThreshold || 0.5;
    if (c1b.x.size + c1b.y.size < threshold && c2b.x.size + c2b.y.size < threshold) {
      return [
        (r * (c1._t1 + c1._t2) / 2 | 0) / r + "/" + (r * (c2._t1 + c2._t2) / 2 | 0) / r
      ];
    }
    let cc1 = c1.split(0.5), cc2 = c2.split(0.5), pairs = [
      { left: cc1.left, right: cc2.left },
      { left: cc1.left, right: cc2.right },
      { left: cc1.right, right: cc2.right },
      { left: cc1.right, right: cc2.left }
    ];
    pairs = pairs.filter(function(pair) {
      return utils.bboxoverlap(pair.left.bbox(), pair.right.bbox());
    });
    let results = [];
    if (pairs.length === 0) return results;
    pairs.forEach(function(pair) {
      results = results.concat(
        utils.pairiteration(pair.left, pair.right, threshold)
      );
    });
    results = results.filter(function(v, i) {
      return results.indexOf(v) === i;
    });
    return results;
  },
  getccenter: function(p1, p2, p3) {
    const dx1 = p2.x - p1.x, dy1 = p2.y - p1.y, dx2 = p3.x - p2.x, dy2 = p3.y - p2.y, dx1p = dx1 * cos(quart) - dy1 * sin(quart), dy1p = dx1 * sin(quart) + dy1 * cos(quart), dx2p = dx2 * cos(quart) - dy2 * sin(quart), dy2p = dx2 * sin(quart) + dy2 * cos(quart), mx1 = (p1.x + p2.x) / 2, my1 = (p1.y + p2.y) / 2, mx2 = (p2.x + p3.x) / 2, my2 = (p2.y + p3.y) / 2, mx1n = mx1 + dx1p, my1n = my1 + dy1p, mx2n = mx2 + dx2p, my2n = my2 + dy2p, arc = utils.lli8(mx1, my1, mx1n, my1n, mx2, my2, mx2n, my2n), r = utils.dist(arc, p1);
    let s = atan2(p1.y - arc.y, p1.x - arc.x), m = atan2(p2.y - arc.y, p2.x - arc.x), e = atan2(p3.y - arc.y, p3.x - arc.x), _;
    if (s < e) {
      if (s > m || m > e) {
        s += tau;
      }
      if (s > e) {
        _ = e;
        e = s;
        s = _;
      }
    } else {
      if (e < m && m < s) {
        _ = e;
        e = s;
        s = _;
      } else {
        e += tau;
      }
    }
    arc.s = s;
    arc.e = e;
    arc.r = r;
    return arc;
  },
  numberSort: function(a, b) {
    return a - b;
  }
};

// node_modules/bezier-js/src/poly-bezier.js
var PolyBezier = class _PolyBezier {
  constructor(curves) {
    this.curves = [];
    this._3d = false;
    if (!!curves) {
      this.curves = curves;
      this._3d = this.curves[0]._3d;
    }
  }
  valueOf() {
    return this.toString();
  }
  toString() {
    return "[" + this.curves.map(function(curve) {
      return utils.pointsToString(curve.points);
    }).join(", ") + "]";
  }
  addCurve(curve) {
    this.curves.push(curve);
    this._3d = this._3d || curve._3d;
  }
  length() {
    return this.curves.map(function(v) {
      return v.length();
    }).reduce(function(a, b) {
      return a + b;
    });
  }
  curve(idx) {
    return this.curves[idx];
  }
  bbox() {
    const c = this.curves;
    var bbox = c[0].bbox();
    for (var i = 1; i < c.length; i++) {
      utils.expandbox(bbox, c[i].bbox());
    }
    return bbox;
  }
  offset(d) {
    const offset = [];
    this.curves.forEach(function(v) {
      offset.push(...v.offset(d));
    });
    return new _PolyBezier(offset);
  }
};

// node_modules/bezier-js/src/bezier.js
var { abs: abs2, min, max, cos: cos2, sin: sin2, acos: acos2, sqrt: sqrt2 } = Math;
var pi2 = Math.PI;
var Bezier = class _Bezier {
  constructor(coords) {
    let args = coords && coords.forEach ? coords : Array.from(arguments).slice();
    let coordlen = false;
    if (typeof args[0] === "object") {
      coordlen = args.length;
      const newargs = [];
      args.forEach(function(point2) {
        ["x", "y", "z"].forEach(function(d) {
          if (typeof point2[d] !== "undefined") {
            newargs.push(point2[d]);
          }
        });
      });
      args = newargs;
    }
    let higher = false;
    const len = args.length;
    if (coordlen) {
      if (coordlen > 4) {
        if (arguments.length !== 1) {
          throw new Error(
            "Only new Bezier(point[]) is accepted for 4th and higher order curves"
          );
        }
        higher = true;
      }
    } else {
      if (len !== 6 && len !== 8 && len !== 9 && len !== 12) {
        if (arguments.length !== 1) {
          throw new Error(
            "Only new Bezier(point[]) is accepted for 4th and higher order curves"
          );
        }
      }
    }
    const _3d = this._3d = !higher && (len === 9 || len === 12) || coords && coords[0] && typeof coords[0].z !== "undefined";
    const points = this.points = [];
    for (let idx = 0, step = _3d ? 3 : 2; idx < len; idx += step) {
      var point = {
        x: args[idx],
        y: args[idx + 1]
      };
      if (_3d) {
        point.z = args[idx + 2];
      }
      points.push(point);
    }
    const order = this.order = points.length - 1;
    const dims = this.dims = ["x", "y"];
    if (_3d) dims.push("z");
    this.dimlen = dims.length;
    const aligned = utils.align(points, { p1: points[0], p2: points[order] });
    const baselength = utils.dist(points[0], points[order]);
    this._linear = aligned.reduce((t2, p) => t2 + abs2(p.y), 0) < baselength / 50;
    this._lut = [];
    this._t1 = 0;
    this._t2 = 1;
    this.update();
  }
  static quadraticFromPoints(p1, p2, p3, t2) {
    if (typeof t2 === "undefined") {
      t2 = 0.5;
    }
    if (t2 === 0) {
      return new _Bezier(p2, p2, p3);
    }
    if (t2 === 1) {
      return new _Bezier(p1, p2, p2);
    }
    const abc = _Bezier.getABC(2, p1, p2, p3, t2);
    return new _Bezier(p1, abc.A, p3);
  }
  static cubicFromPoints(S, B, E, t2, d1) {
    if (typeof t2 === "undefined") {
      t2 = 0.5;
    }
    const abc = _Bezier.getABC(3, S, B, E, t2);
    if (typeof d1 === "undefined") {
      d1 = utils.dist(B, abc.C);
    }
    const d2 = d1 * (1 - t2) / t2;
    const selen = utils.dist(S, E), lx = (E.x - S.x) / selen, ly = (E.y - S.y) / selen, bx1 = d1 * lx, by1 = d1 * ly, bx2 = d2 * lx, by2 = d2 * ly;
    const e1 = { x: B.x - bx1, y: B.y - by1 }, e2 = { x: B.x + bx2, y: B.y + by2 }, A = abc.A, v1 = { x: A.x + (e1.x - A.x) / (1 - t2), y: A.y + (e1.y - A.y) / (1 - t2) }, v2 = { x: A.x + (e2.x - A.x) / t2, y: A.y + (e2.y - A.y) / t2 }, nc1 = { x: S.x + (v1.x - S.x) / t2, y: S.y + (v1.y - S.y) / t2 }, nc2 = {
      x: E.x + (v2.x - E.x) / (1 - t2),
      y: E.y + (v2.y - E.y) / (1 - t2)
    };
    return new _Bezier(S, nc1, nc2, E);
  }
  static getUtils() {
    return utils;
  }
  getUtils() {
    return _Bezier.getUtils();
  }
  static get PolyBezier() {
    return PolyBezier;
  }
  valueOf() {
    return this.toString();
  }
  toString() {
    return utils.pointsToString(this.points);
  }
  toSVG() {
    if (this._3d) return false;
    const p = this.points, x = p[0].x, y = p[0].y, s = ["M", x, y, this.order === 2 ? "Q" : "C"];
    for (let i = 1, last = p.length; i < last; i++) {
      s.push(p[i].x);
      s.push(p[i].y);
    }
    return s.join(" ");
  }
  setRatios(ratios) {
    if (ratios.length !== this.points.length) {
      throw new Error("incorrect number of ratio values");
    }
    this.ratios = ratios;
    this._lut = [];
  }
  verify() {
    const print = this.coordDigest();
    if (print !== this._print) {
      this._print = print;
      this.update();
    }
  }
  coordDigest() {
    return this.points.map(function(c, pos) {
      return "" + pos + c.x + c.y + (c.z ? c.z : 0);
    }).join("");
  }
  update() {
    this._lut = [];
    this.dpoints = utils.derive(this.points, this._3d);
    this.computedirection();
  }
  computedirection() {
    const points = this.points;
    const angle = utils.angle(points[0], points[this.order], points[1]);
    this.clockwise = angle > 0;
  }
  length() {
    return utils.length(this.derivative.bind(this));
  }
  static getABC(order = 2, S, B, E, t2 = 0.5) {
    const u = utils.projectionratio(t2, order), um = 1 - u, C = {
      x: u * S.x + um * E.x,
      y: u * S.y + um * E.y
    }, s = utils.abcratio(t2, order), A = {
      x: B.x + (B.x - C.x) / s,
      y: B.y + (B.y - C.y) / s
    };
    return { A, B, C, S, E };
  }
  getABC(t2, B) {
    B = B || this.get(t2);
    let S = this.points[0];
    let E = this.points[this.order];
    return _Bezier.getABC(this.order, S, B, E, t2);
  }
  getLUT(steps) {
    this.verify();
    steps = steps || 100;
    if (this._lut.length === steps + 1) {
      return this._lut;
    }
    this._lut = [];
    steps++;
    this._lut = [];
    for (let i = 0, p, t2; i < steps; i++) {
      t2 = i / (steps - 1);
      p = this.compute(t2);
      p.t = t2;
      this._lut.push(p);
    }
    return this._lut;
  }
  on(point, error) {
    error = error || 5;
    const lut = this.getLUT(), hits = [];
    for (let i = 0, c, t2 = 0; i < lut.length; i++) {
      c = lut[i];
      if (utils.dist(c, point) < error) {
        hits.push(c);
        t2 += i / lut.length;
      }
    }
    if (!hits.length) return false;
    return t /= hits.length;
  }
  project(point) {
    const LUT = this.getLUT(), l = LUT.length - 1, closest = utils.closest(LUT, point), mpos = closest.mpos, t1 = (mpos - 1) / l, t2 = (mpos + 1) / l, step = 0.1 / l;
    let mdist = closest.mdist, t3 = t1, ft = t3, p;
    mdist += 1;
    for (let d; t3 < t2 + step; t3 += step) {
      p = this.compute(t3);
      d = utils.dist(point, p);
      if (d < mdist) {
        mdist = d;
        ft = t3;
      }
    }
    ft = ft < 0 ? 0 : ft > 1 ? 1 : ft;
    p = this.compute(ft);
    p.t = ft;
    p.d = mdist;
    return p;
  }
  get(t2) {
    return this.compute(t2);
  }
  point(idx) {
    return this.points[idx];
  }
  compute(t2) {
    if (this.ratios) {
      return utils.computeWithRatios(t2, this.points, this.ratios, this._3d);
    }
    return utils.compute(t2, this.points, this._3d, this.ratios);
  }
  raise() {
    const p = this.points, np = [p[0]], k = p.length;
    for (let i = 1, pi3, pim; i < k; i++) {
      pi3 = p[i];
      pim = p[i - 1];
      np[i] = {
        x: (k - i) / k * pi3.x + i / k * pim.x,
        y: (k - i) / k * pi3.y + i / k * pim.y
      };
    }
    np[k] = p[k - 1];
    return new _Bezier(np);
  }
  derivative(t2) {
    return utils.compute(t2, this.dpoints[0], this._3d);
  }
  dderivative(t2) {
    return utils.compute(t2, this.dpoints[1], this._3d);
  }
  align() {
    let p = this.points;
    return new _Bezier(utils.align(p, { p1: p[0], p2: p[p.length - 1] }));
  }
  curvature(t2) {
    return utils.curvature(t2, this.dpoints[0], this.dpoints[1], this._3d);
  }
  inflections() {
    return utils.inflections(this.points);
  }
  normal(t2) {
    return this._3d ? this.__normal3(t2) : this.__normal2(t2);
  }
  __normal2(t2) {
    const d = this.derivative(t2);
    const q = sqrt2(d.x * d.x + d.y * d.y);
    return { t: t2, x: -d.y / q, y: d.x / q };
  }
  __normal3(t2) {
    const r1 = this.derivative(t2), r2 = this.derivative(t2 + 0.01), q1 = sqrt2(r1.x * r1.x + r1.y * r1.y + r1.z * r1.z), q2 = sqrt2(r2.x * r2.x + r2.y * r2.y + r2.z * r2.z);
    r1.x /= q1;
    r1.y /= q1;
    r1.z /= q1;
    r2.x /= q2;
    r2.y /= q2;
    r2.z /= q2;
    const c = {
      x: r2.y * r1.z - r2.z * r1.y,
      y: r2.z * r1.x - r2.x * r1.z,
      z: r2.x * r1.y - r2.y * r1.x
    };
    const m = sqrt2(c.x * c.x + c.y * c.y + c.z * c.z);
    c.x /= m;
    c.y /= m;
    c.z /= m;
    const R = [
      c.x * c.x,
      c.x * c.y - c.z,
      c.x * c.z + c.y,
      c.x * c.y + c.z,
      c.y * c.y,
      c.y * c.z - c.x,
      c.x * c.z - c.y,
      c.y * c.z + c.x,
      c.z * c.z
    ];
    const n = {
      t: t2,
      x: R[0] * r1.x + R[1] * r1.y + R[2] * r1.z,
      y: R[3] * r1.x + R[4] * r1.y + R[5] * r1.z,
      z: R[6] * r1.x + R[7] * r1.y + R[8] * r1.z
    };
    return n;
  }
  hull(t2) {
    let p = this.points, _p = [], q = [], idx = 0;
    q[idx++] = p[0];
    q[idx++] = p[1];
    q[idx++] = p[2];
    if (this.order === 3) {
      q[idx++] = p[3];
    }
    while (p.length > 1) {
      _p = [];
      for (let i = 0, pt, l = p.length - 1; i < l; i++) {
        pt = utils.lerp(t2, p[i], p[i + 1]);
        q[idx++] = pt;
        _p.push(pt);
      }
      p = _p;
    }
    return q;
  }
  split(t1, t2) {
    if (t1 === 0 && !!t2) {
      return this.split(t2).left;
    }
    if (t2 === 1) {
      return this.split(t1).right;
    }
    const q = this.hull(t1);
    const result = {
      left: this.order === 2 ? new _Bezier([q[0], q[3], q[5]]) : new _Bezier([q[0], q[4], q[7], q[9]]),
      right: this.order === 2 ? new _Bezier([q[5], q[4], q[2]]) : new _Bezier([q[9], q[8], q[6], q[3]]),
      span: q
    };
    result.left._t1 = utils.map(0, 0, 1, this._t1, this._t2);
    result.left._t2 = utils.map(t1, 0, 1, this._t1, this._t2);
    result.right._t1 = utils.map(t1, 0, 1, this._t1, this._t2);
    result.right._t2 = utils.map(1, 0, 1, this._t1, this._t2);
    if (!t2) {
      return result;
    }
    t2 = utils.map(t2, t1, 1, 0, 1);
    return result.right.split(t2).left;
  }
  extrema() {
    const result = {};
    let roots = [];
    this.dims.forEach(
      function(dim) {
        let mfn = function(v) {
          return v[dim];
        };
        let p = this.dpoints[0].map(mfn);
        result[dim] = utils.droots(p);
        if (this.order === 3) {
          p = this.dpoints[1].map(mfn);
          result[dim] = result[dim].concat(utils.droots(p));
        }
        result[dim] = result[dim].filter(function(t2) {
          return t2 >= 0 && t2 <= 1;
        });
        roots = roots.concat(result[dim].sort(utils.numberSort));
      }.bind(this)
    );
    result.values = roots.sort(utils.numberSort).filter(function(v, idx) {
      return roots.indexOf(v) === idx;
    });
    return result;
  }
  bbox() {
    const extrema = this.extrema(), result = {};
    this.dims.forEach(
      function(d) {
        result[d] = utils.getminmax(this, d, extrema[d]);
      }.bind(this)
    );
    return result;
  }
  overlaps(curve) {
    const lbbox = this.bbox(), tbbox = curve.bbox();
    return utils.bboxoverlap(lbbox, tbbox);
  }
  offset(t2, d) {
    if (typeof d !== "undefined") {
      const c = this.get(t2), n = this.normal(t2);
      const ret = {
        c,
        n,
        x: c.x + n.x * d,
        y: c.y + n.y * d
      };
      if (this._3d) {
        ret.z = c.z + n.z * d;
      }
      return ret;
    }
    if (this._linear) {
      const nv = this.normal(0), coords = this.points.map(function(p) {
        const ret = {
          x: p.x + t2 * nv.x,
          y: p.y + t2 * nv.y
        };
        if (p.z && nv.z) {
          ret.z = p.z + t2 * nv.z;
        }
        return ret;
      });
      return [new _Bezier(coords)];
    }
    return this.reduce().map(function(s) {
      if (s._linear) {
        return s.offset(t2)[0];
      }
      return s.scale(t2);
    });
  }
  simple() {
    if (this.order === 3) {
      const a1 = utils.angle(this.points[0], this.points[3], this.points[1]);
      const a2 = utils.angle(this.points[0], this.points[3], this.points[2]);
      if (a1 > 0 && a2 < 0 || a1 < 0 && a2 > 0) return false;
    }
    const n1 = this.normal(0);
    const n2 = this.normal(1);
    let s = n1.x * n2.x + n1.y * n2.y;
    if (this._3d) {
      s += n1.z * n2.z;
    }
    return abs2(acos2(s)) < pi2 / 3;
  }
  reduce() {
    let i, t1 = 0, t2 = 0, step = 0.01, segment, pass1 = [], pass2 = [];
    let extrema = this.extrema().values;
    if (extrema.indexOf(0) === -1) {
      extrema = [0].concat(extrema);
    }
    if (extrema.indexOf(1) === -1) {
      extrema.push(1);
    }
    for (t1 = extrema[0], i = 1; i < extrema.length; i++) {
      t2 = extrema[i];
      segment = this.split(t1, t2);
      segment._t1 = t1;
      segment._t2 = t2;
      pass1.push(segment);
      t1 = t2;
    }
    pass1.forEach(function(p1) {
      t1 = 0;
      t2 = 0;
      while (t2 <= 1) {
        for (t2 = t1 + step; t2 <= 1 + step; t2 += step) {
          segment = p1.split(t1, t2);
          if (!segment.simple()) {
            t2 -= step;
            if (abs2(t1 - t2) < step) {
              return [];
            }
            segment = p1.split(t1, t2);
            segment._t1 = utils.map(t1, 0, 1, p1._t1, p1._t2);
            segment._t2 = utils.map(t2, 0, 1, p1._t1, p1._t2);
            pass2.push(segment);
            t1 = t2;
            break;
          }
        }
      }
      if (t1 < 1) {
        segment = p1.split(t1, 1);
        segment._t1 = utils.map(t1, 0, 1, p1._t1, p1._t2);
        segment._t2 = p1._t2;
        pass2.push(segment);
      }
    });
    return pass2;
  }
  translate(v, d1, d2) {
    d2 = typeof d2 === "number" ? d2 : d1;
    const o = this.order;
    let d = this.points.map((_, i) => (1 - i / o) * d1 + i / o * d2);
    return new _Bezier(
      this.points.map((p, i) => ({
        x: p.x + v.x * d[i],
        y: p.y + v.y * d[i]
      }))
    );
  }
  scale(d) {
    const order = this.order;
    let distanceFn = false;
    if (typeof d === "function") {
      distanceFn = d;
    }
    if (distanceFn && order === 2) {
      return this.raise().scale(distanceFn);
    }
    const clockwise = this.clockwise;
    const points = this.points;
    if (this._linear) {
      return this.translate(
        this.normal(0),
        distanceFn ? distanceFn(0) : d,
        distanceFn ? distanceFn(1) : d
      );
    }
    const r1 = distanceFn ? distanceFn(0) : d;
    const r2 = distanceFn ? distanceFn(1) : d;
    const v = [this.offset(0, 10), this.offset(1, 10)];
    const np = [];
    const o = utils.lli4(v[0], v[0].c, v[1], v[1].c);
    if (!o) {
      throw new Error("cannot scale this curve. Try reducing it first.");
    }
    [0, 1].forEach(function(t2) {
      const p = np[t2 * order] = utils.copy(points[t2 * order]);
      p.x += (t2 ? r2 : r1) * v[t2].n.x;
      p.y += (t2 ? r2 : r1) * v[t2].n.y;
    });
    if (!distanceFn) {
      [0, 1].forEach((t2) => {
        if (order === 2 && !!t2) return;
        const p = np[t2 * order];
        const d2 = this.derivative(t2);
        const p2 = { x: p.x + d2.x, y: p.y + d2.y };
        np[t2 + 1] = utils.lli4(p, p2, o, points[t2 + 1]);
      });
      return new _Bezier(np);
    }
    [0, 1].forEach(function(t2) {
      if (order === 2 && !!t2) return;
      var p = points[t2 + 1];
      var ov = {
        x: p.x - o.x,
        y: p.y - o.y
      };
      var rc = distanceFn ? distanceFn((t2 + 1) / order) : d;
      if (distanceFn && !clockwise) rc = -rc;
      var m = sqrt2(ov.x * ov.x + ov.y * ov.y);
      ov.x /= m;
      ov.y /= m;
      np[t2 + 1] = {
        x: p.x + rc * ov.x,
        y: p.y + rc * ov.y
      };
    });
    return new _Bezier(np);
  }
  outline(d1, d2, d3, d4) {
    d2 = d2 === void 0 ? d1 : d2;
    if (this._linear) {
      const n = this.normal(0);
      const start = this.points[0];
      const end = this.points[this.points.length - 1];
      let s, mid, e;
      if (d3 === void 0) {
        d3 = d1;
        d4 = d2;
      }
      s = { x: start.x + n.x * d1, y: start.y + n.y * d1 };
      e = { x: end.x + n.x * d3, y: end.y + n.y * d3 };
      mid = { x: (s.x + e.x) / 2, y: (s.y + e.y) / 2 };
      const fline = [s, mid, e];
      s = { x: start.x - n.x * d2, y: start.y - n.y * d2 };
      e = { x: end.x - n.x * d4, y: end.y - n.y * d4 };
      mid = { x: (s.x + e.x) / 2, y: (s.y + e.y) / 2 };
      const bline = [e, mid, s];
      const ls2 = utils.makeline(bline[2], fline[0]);
      const le2 = utils.makeline(fline[2], bline[0]);
      const segments2 = [ls2, new _Bezier(fline), le2, new _Bezier(bline)];
      return new PolyBezier(segments2);
    }
    const reduced = this.reduce(), len = reduced.length, fcurves = [];
    let bcurves = [], p, alen = 0, tlen = this.length();
    const graduated = typeof d3 !== "undefined" && typeof d4 !== "undefined";
    function linearDistanceFunction(s, e, tlen2, alen2, slen) {
      return function(v) {
        const f1 = alen2 / tlen2, f2 = (alen2 + slen) / tlen2, d = e - s;
        return utils.map(v, 0, 1, s + f1 * d, s + f2 * d);
      };
    }
    reduced.forEach(function(segment) {
      const slen = segment.length();
      if (graduated) {
        fcurves.push(
          segment.scale(linearDistanceFunction(d1, d3, tlen, alen, slen))
        );
        bcurves.push(
          segment.scale(linearDistanceFunction(-d2, -d4, tlen, alen, slen))
        );
      } else {
        fcurves.push(segment.scale(d1));
        bcurves.push(segment.scale(-d2));
      }
      alen += slen;
    });
    bcurves = bcurves.map(function(s) {
      p = s.points;
      if (p[3]) {
        s.points = [p[3], p[2], p[1], p[0]];
      } else {
        s.points = [p[2], p[1], p[0]];
      }
      return s;
    }).reverse();
    const fs5 = fcurves[0].points[0], fe = fcurves[len - 1].points[fcurves[len - 1].points.length - 1], bs = bcurves[len - 1].points[bcurves[len - 1].points.length - 1], be = bcurves[0].points[0], ls = utils.makeline(bs, fs5), le = utils.makeline(fe, be), segments = [ls].concat(fcurves).concat([le]).concat(bcurves);
    return new PolyBezier(segments);
  }
  outlineshapes(d1, d2, curveIntersectionThreshold) {
    d2 = d2 || d1;
    const outline = this.outline(d1, d2).curves;
    const shapes = [];
    for (let i = 1, len = outline.length; i < len / 2; i++) {
      const shape = utils.makeshape(
        outline[i],
        outline[len - i],
        curveIntersectionThreshold
      );
      shape.startcap.virtual = i > 1;
      shape.endcap.virtual = i < len / 2 - 1;
      shapes.push(shape);
    }
    return shapes;
  }
  intersects(curve, curveIntersectionThreshold) {
    if (!curve) return this.selfintersects(curveIntersectionThreshold);
    if (curve.p1 && curve.p2) {
      return this.lineIntersects(curve);
    }
    if (curve instanceof _Bezier) {
      curve = curve.reduce();
    }
    return this.curveintersects(
      this.reduce(),
      curve,
      curveIntersectionThreshold
    );
  }
  lineIntersects(line) {
    const mx = min(line.p1.x, line.p2.x), my = min(line.p1.y, line.p2.y), MX = max(line.p1.x, line.p2.x), MY = max(line.p1.y, line.p2.y);
    return utils.roots(this.points, line).filter((t2) => {
      var p = this.get(t2);
      return utils.between(p.x, mx, MX) && utils.between(p.y, my, MY);
    });
  }
  selfintersects(curveIntersectionThreshold) {
    const reduced = this.reduce(), len = reduced.length - 2, results = [];
    for (let i = 0, result, left, right; i < len; i++) {
      left = reduced.slice(i, i + 1);
      right = reduced.slice(i + 2);
      result = this.curveintersects(left, right, curveIntersectionThreshold);
      results.push(...result);
    }
    return results;
  }
  curveintersects(c1, c2, curveIntersectionThreshold) {
    const pairs = [];
    c1.forEach(function(l) {
      c2.forEach(function(r) {
        if (l.overlaps(r)) {
          pairs.push({ left: l, right: r });
        }
      });
    });
    let intersections = [];
    pairs.forEach(function(pair) {
      const result = utils.pairiteration(
        pair.left,
        pair.right,
        curveIntersectionThreshold
      );
      if (result.length > 0) {
        intersections = intersections.concat(result);
      }
    });
    return intersections;
  }
  arcs(errorThreshold) {
    errorThreshold = errorThreshold || 0.5;
    return this._iterate(errorThreshold, []);
  }
  _error(pc, np1, s, e) {
    const q = (e - s) / 4, c1 = this.get(s + q), c2 = this.get(e - q), ref = utils.dist(pc, np1), d1 = utils.dist(pc, c1), d2 = utils.dist(pc, c2);
    return abs2(d1 - ref) + abs2(d2 - ref);
  }
  _iterate(errorThreshold, circles) {
    let t_s = 0, t_e = 1, safety;
    do {
      safety = 0;
      t_e = 1;
      let np1 = this.get(t_s), np2, np3, arc, prev_arc;
      let curr_good = false, prev_good = false, done;
      let t_m = t_e, prev_e = 1, step = 0;
      do {
        prev_good = curr_good;
        prev_arc = arc;
        t_m = (t_s + t_e) / 2;
        step++;
        np2 = this.get(t_m);
        np3 = this.get(t_e);
        arc = utils.getccenter(np1, np2, np3);
        arc.interval = {
          start: t_s,
          end: t_e
        };
        let error = this._error(arc, np1, t_s, t_e);
        curr_good = error <= errorThreshold;
        done = prev_good && !curr_good;
        if (!done) prev_e = t_e;
        if (curr_good) {
          if (t_e >= 1) {
            arc.interval.end = prev_e = 1;
            prev_arc = arc;
            if (t_e > 1) {
              let d = {
                x: arc.x + arc.r * cos2(arc.e),
                y: arc.y + arc.r * sin2(arc.e)
              };
              arc.e += utils.angle({ x: arc.x, y: arc.y }, d, this.get(1));
            }
            break;
          }
          t_e = t_e + (t_e - t_s) / 2;
        } else {
          t_e = t_m;
        }
      } while (!done && safety++ < 100);
      if (safety >= 100) {
        break;
      }
      prev_arc = prev_arc ? prev_arc : arc;
      circles.push(prev_arc);
      t_s = prev_e;
    } while (t_e < 1);
    return circles;
  }
};

// src/main/services/GhostMouse.ts
var GhostMouse = class {
  page;
  currentPosition = { x: 0, y: 0 };
  cursorVisible = false;
  constructor(page) {
    this.page = page;
  }
  /**
   * Enable visible cursor for debugging.
   * Uses a custom CSS cursor image (data URI) - no DOM injection.
   * This is safer than injecting elements which could trigger bot detection.
   */
  async enableVisibleCursor() {
    if (this.cursorVisible) return;
    await this.page.addStyleTag({
      content: `
                * {
                    cursor: url('data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><circle cx="16" cy="16" r="12" fill="rgba(255,0,0,0.7)" stroke="white" stroke-width="2"/><circle cx="16" cy="16" r="3" fill="white"/></svg>') 16 16, auto !important;
                }
            `
    });
    this.cursorVisible = true;
    console.log("\u{1F441}\uFE0F Visible cursor enabled (CSS mode)");
  }
  /**
   * Disable visible cursor.
   * Note: CSS cannot be easily removed, so this is a no-op.
   * The cursor will reset on page navigation.
   */
  async disableVisibleCursor() {
    this.cursorVisible = false;
  }
  /**
   * Update the visible cursor position.
   * With CSS cursor mode, no update needed - cursor follows mouse automatically.
   */
  async updateVisibleCursor(_x, _y) {
  }
  /**
   * Move mouse to target with human-like Bezier curve trajectory.
   * Includes variable velocity (acceleration/deceleration).
   */
  async moveTo(target, config = {}) {
    const {
      minSpeed = 2,
      maxSpeed = 8,
      overshootProbability = 0.15,
      jitterAmount = 2
    } = config;
    const controlPoints = this.generateBezierControlPoints(
      this.currentPosition,
      target
    );
    const curve = new Bezier(
      controlPoints.start.x,
      controlPoints.start.y,
      controlPoints.cp1.x,
      controlPoints.cp1.y,
      controlPoints.cp2.x,
      controlPoints.cp2.y,
      controlPoints.end.x,
      controlPoints.end.y
    );
    const points = this.generateVariableVelocityPoints(curve, minSpeed, maxSpeed);
    for (const point of points) {
      const jitteredPoint = this.addJitter(point, jitterAmount);
      await this.page.mouse.move(jitteredPoint.x, jitteredPoint.y);
      await this.updateVisibleCursor(jitteredPoint.x, jitteredPoint.y);
      await this.microDelay(5, 15);
    }
    if (Math.random() < overshootProbability) {
      await this.overshootAndCorrect(target);
    }
    this.currentPosition = target;
  }
  /**
   * Generate Bezier control points that create natural curve.
   * Humans don't move in straight lines - they curve slightly.
   */
  generateBezierControlPoints(start, end) {
    const distance = Math.hypot(end.x - start.x, end.y - start.y);
    const angle = Math.atan2(end.y - start.y, end.x - start.x);
    const perpAngle = angle + Math.PI / 2;
    const curveIntensity = distance * (0.1 + Math.random() * 0.2);
    const curveDirection = Math.random() > 0.5 ? 1 : -1;
    return {
      start,
      cp1: {
        x: start.x + (end.x - start.x) * 0.25 + Math.cos(perpAngle) * curveIntensity * curveDirection,
        y: start.y + (end.y - start.y) * 0.25 + Math.sin(perpAngle) * curveIntensity * curveDirection
      },
      cp2: {
        x: start.x + (end.x - start.x) * 0.75 + Math.cos(perpAngle) * curveIntensity * curveDirection * 0.5,
        y: start.y + (end.y - start.y) * 0.75 + Math.sin(perpAngle) * curveIntensity * curveDirection * 0.5
      },
      end
    };
  }
  /**
   * Generate points with easing (slow start, fast middle, slow end).
   * Mimics human acceleration/deceleration pattern.
   *
   * Uses the cinematic easing curve from animations.ts for consistency
   * with the app's visual language.
   */
  generateVariableVelocityPoints(curve, minSpeed, maxSpeed) {
    const points = [];
    const curveLength = curve.length();
    let t2 = 0;
    while (t2 <= 1) {
      const point = curve.get(t2);
      points.push({ x: point.x, y: point.y });
      const easing = this.easeInOutCinematic(t2);
      const speed = minSpeed + (maxSpeed - minSpeed) * (1 - Math.abs(easing - 0.5) * 2);
      const increment = speed / curveLength;
      t2 += Math.max(increment, 0.01);
    }
    return points;
  }
  /**
   * Easing function adapted from animations.ts cinematic curve.
   * [0.22, 1, 0.36, 1] converted to a function.
   *
   * This creates the characteristic "slow start, fast middle, slow end"
   * that makes mouse movements feel natural.
   */
  easeInOutCinematic(t2) {
    return t2 < 0.5 ? 2 * t2 * t2 : 1 - Math.pow(-2 * t2 + 2, 2) / 2;
  }
  /**
   * Add random micro-jitter to a point.
   * Humans have small involuntary hand movements.
   */
  addJitter(point, amount) {
    return {
      x: point.x + (Math.random() - 0.5) * amount,
      y: point.y + (Math.random() - 0.5) * amount
    };
  }
  /**
   * Simulate human overshoot: move past target, then correct.
   * This happens when moving quickly - we slightly overshoot, then adjust.
   *
   * IMPORTANT: Correction movement uses a micro-curve, NOT a straight line.
   * Straight-line correction is a bot signal (humans don't move perfectly).
   */
  async overshootAndCorrect(target) {
    const overshoot = {
      x: target.x + (Math.random() - 0.5) * 20,
      y: target.y + (Math.random() - 0.5) * 20
    };
    await this.page.mouse.move(overshoot.x, overshoot.y);
    await this.updateVisibleCursor(overshoot.x, overshoot.y);
    await this.microDelay(50, 150);
    const midpoint = {
      x: (overshoot.x + target.x) / 2 + (Math.random() - 0.5) * 5,
      y: (overshoot.y + target.y) / 2 + (Math.random() - 0.5) * 5
    };
    await this.page.mouse.move(midpoint.x, midpoint.y);
    await this.updateVisibleCursor(midpoint.x, midpoint.y);
    await this.microDelay(8, 20);
    await this.page.mouse.move(target.x, target.y);
    await this.updateVisibleCursor(target.x, target.y);
  }
  /**
   * Human-like click with pre-click hover and post-click pause.
   */
  async click(target) {
    await this.moveTo(target);
    await this.microDelay(100, 300);
    await this.page.mouse.down();
    await this.microDelay(50, 150);
    await this.page.mouse.up();
    await this.microDelay(200, 500);
  }
  /**
   * Click an element with randomized offset within its bounds.
   * Humans NEVER click exactly in the center of buttons.
   *
   * @param boundingBox - Element's bounding box
   * @param centerBias - How much to favor center (0.0 = uniform, 1.0 = always center)
   */
  async clickElement(boundingBox, centerBias = 0.3) {
    const offsetX = this.gaussianRandom(centerBias) * boundingBox.width;
    const offsetY = this.gaussianRandom(centerBias) * boundingBox.height;
    let clickPoint = {
      x: boundingBox.x + offsetX,
      y: boundingBox.y + offsetY
    };
    clickPoint.x = Math.max(
      boundingBox.x + 5,
      Math.min(clickPoint.x, boundingBox.x + boundingBox.width - 5)
    );
    clickPoint.y = Math.max(
      boundingBox.y + 5,
      Math.min(clickPoint.y, boundingBox.y + boundingBox.height - 5)
    );
    await this.click(clickPoint);
  }
  /**
   * Generate a random number between 0 and 1 with gaussian-like distribution.
   * centerBias: 0.0 = uniform distribution, 1.0 = always 0.5 (center)
   *
   * This mimics human click patterns: usually near center, but with natural variation.
   */
  gaussianRandom(centerBias = 0.3) {
    const u1 = Math.random();
    const u2 = Math.random();
    const gaussian = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    const normalized = gaussian / 6 + 0.5;
    const clamped = Math.max(0.1, Math.min(0.9, normalized));
    const uniform = 0.1 + Math.random() * 0.8;
    return clamped * centerBias + uniform * (1 - centerBias);
  }
  /**
   * Small random delay for human-like timing variation.
   */
  microDelay(min2, max2) {
    const delay = min2 + Math.random() * (max2 - min2);
    return new Promise((resolve) => setTimeout(resolve, delay));
  }
  /**
   * Get current mouse position.
   */
  getPosition() {
    return { ...this.currentPosition };
  }
  /**
   * Set current position (for initialization or after page navigation).
   */
  setPosition(position) {
    this.currentPosition = { ...position };
  }
};

// src/main/services/HumanScroll.ts
var HumanScroll = class {
  page;
  constructor(page) {
    this.page = page;
  }
  // =========================================================================
  // CDP Helper Methods (Undetectable)
  // =========================================================================
  /**
   * Execute JavaScript via CDP Runtime.evaluate (undetectable).
   * This is different from page.evaluate() which injects scripts.
   */
  async cdpEvaluate(expression) {
    let cdpSession = null;
    try {
      cdpSession = await this.page.context().newCDPSession(this.page);
      const { result } = await cdpSession.send("Runtime.evaluate", {
        expression,
        returnByValue: true
      });
      return result.value;
    } catch {
      return null;
    } finally {
      if (cdpSession) {
        await cdpSession.detach().catch(() => {
        });
      }
    }
  }
  /**
   * Get bounding box for a node using CDP (undetectable).
   */
  async getNodeBoundingBoxByCDP(cdpSession, backendNodeId) {
    try {
      const { model } = await cdpSession.send("DOM.getBoxModel", {
        backendNodeId
      });
      if (!model || !model.content) {
        return null;
      }
      const [x1, y1, x2, , , y3] = model.content;
      return {
        x: x1,
        y: y1,
        width: x2 - x1,
        height: y3 - y1
      };
    } catch {
      return null;
    }
  }
  /**
   * Perform human-like scroll with:
   * - Variable distance (not exact pixels every time)
   * - Smooth acceleration/deceleration
   * - Occasional micro-adjustments (scroll past, then back)
   * - Reading pauses
   */
  async scroll(config = {}) {
    const {
      baseDistance = 400,
      variability = 0.3,
      microAdjustProb = 0.25,
      readingPauseMs = [2e3, 5e3]
    } = config;
    const variation = 1 + (Math.random() - 0.5) * 2 * variability;
    const targetDistance = Math.round(baseDistance * variation);
    await this.smoothScrollWithEasing(targetDistance);
    if (Math.random() < microAdjustProb) {
      await this.microAdjust();
    }
    const pauseDuration = readingPauseMs[0] + Math.random() * (readingPauseMs[1] - readingPauseMs[0]);
    await new Promise((resolve) => setTimeout(resolve, pauseDuration));
  }
  /**
   * Smooth scroll using wheel events with easing.
   * More realistic than window.scrollBy() which is instant.
   *
   * Uses cubic ease-out: fast start, gradual slow down.
   */
  async smoothScrollWithEasing(distance) {
    const steps = 15 + Math.floor(Math.random() * 10);
    const direction = distance > 0 ? 1 : -1;
    const absDistance = Math.abs(distance);
    let scrolled = 0;
    for (let i = 0; i < steps; i++) {
      const progress = i / steps;
      const easing = 1 - Math.pow(1 - progress, 3);
      const targetScrolled = absDistance * easing;
      const stepDistance = (targetScrolled - scrolled) * direction;
      await this.page.mouse.wheel(0, stepDistance);
      scrolled = targetScrolled;
      const delay = 10 + Math.random() * 30;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  /**
   * Micro-adjustment: scroll a bit more, then back up.
   * Simulates "oops, scrolled too far" human behavior.
   *
   * This is common when looking for specific content -
   * we overshoot, then scroll back to find what we want.
   */
  async microAdjust() {
    const overshoot = 50 + Math.random() * 100;
    await this.page.mouse.wheel(0, overshoot);
    await new Promise((resolve) => setTimeout(resolve, 200 + Math.random() * 300));
    const correction = overshoot * (0.8 + Math.random() * 0.4);
    await this.page.mouse.wheel(0, -correction);
    await new Promise((resolve) => setTimeout(resolve, 100 + Math.random() * 200));
  }
  /**
   * Scroll to bring a specific element into view (human-like).
   * Uses CDP to get element position - NO DOM injection.
   *
   * @param backendNodeId - CDP backend node ID from accessibility tree
   * @returns true if scrolled successfully, false otherwise
   */
  async scrollToElementByCDP(backendNodeId) {
    let cdpSession = null;
    try {
      cdpSession = await this.page.context().newCDPSession(this.page);
      const box = await this.getNodeBoundingBoxByCDP(cdpSession, backendNodeId);
      if (!box) return false;
      const viewportHeight = await this.cdpEvaluate("window.innerHeight");
      const currentScroll = await this.cdpEvaluate("window.scrollY");
      if (viewportHeight === null || currentScroll === null) return false;
      const elementCenter = box.y + box.height / 2;
      const viewportCenter = viewportHeight / 2;
      const scrollNeeded = elementCenter - viewportCenter - currentScroll;
      if (Math.abs(scrollNeeded) > 50) {
        await this.scroll({ baseDistance: scrollNeeded });
      }
      return true;
    } catch {
      return false;
    } finally {
      if (cdpSession) {
        await cdpSession.detach().catch(() => {
        });
      }
    }
  }
  /**
   * Quick scroll for navigation (less human-like, but faster).
   * Use sparingly - mostly for getting to starting position.
   *
   * Note: Randomized timing to avoid machine-like patterns.
   */
  async quickScroll(distance) {
    const steps = 5;
    const stepSize = distance / steps;
    for (let i = 0; i < steps; i++) {
      await this.page.mouse.wheel(0, stepSize);
      await new Promise((resolve) => setTimeout(resolve, 15 + Math.random() * 15));
    }
  }
  /**
   * Scroll to top of page (for starting fresh exploration).
   * Uses CDP to get current scroll position - NO DOM injection.
   */
  async scrollToTop() {
    const currentScroll = await this.cdpEvaluate("window.scrollY");
    if (currentScroll && currentScroll > 0) {
      await this.quickScroll(-currentScroll);
      await new Promise((resolve) => setTimeout(resolve, 400 + Math.random() * 200));
    }
  }
  /**
   * Get current scroll position via CDP (undetectable).
   */
  async getScrollPosition() {
    const scrollY = await this.cdpEvaluate("window.scrollY");
    return scrollY ?? 0;
  }
  /**
   * Check if we're near the bottom of the page via CDP (undetectable).
   * Useful for detecting "infinite scroll loaded more content".
   */
  async isNearBottom(threshold = 200) {
    const result = await this.cdpEvaluate(`(function() {
            const scrollTop = window.scrollY;
            const scrollHeight = document.documentElement.scrollHeight;
            const clientHeight = window.innerHeight;
            return scrollTop + clientHeight >= scrollHeight - ${threshold};
        })()`);
    return result ?? false;
  }
  /**
   * Get viewport dimensions via CDP (undetectable).
   */
  async getViewportInfo() {
    const result = await this.cdpEvaluate(`JSON.parse(JSON.stringify({
            width: window.innerWidth,
            height: window.innerHeight,
            scrollHeight: document.documentElement.scrollHeight
        }))`);
    return result ?? { width: 0, height: 0, scrollHeight: 0 };
  }
};

// src/main/services/A11yNavigator.ts
var A11yNavigator = class {
  page;
  constructor(page) {
    this.page = page;
  }
  /**
   * Get content state by analyzing URL only.
   * Cost: $0 (no API calls, no DOM queries)
   *
   * NOTE: This does NOT check auth status. Use BrowserManager.validateSession() for that.
   * For detailed element detection, use ContentVision.
   */
  async getContentState() {
    const url = this.page.url();
    const currentView = this.detectCurrentView(url);
    return {
      hasStories: currentView === "feed" || currentView === "story",
      hasPosts: currentView === "feed" || currentView === "profile",
      currentView
    };
  }
  /**
   * Determine current view/page type from URL.
   */
  detectCurrentView(url) {
    if (url.includes("/accounts/login")) return "login";
    if (url.includes("/stories/")) return "story";
    if (url.includes("/explore")) return "explore";
    const profileMatch = url.match(/instagram\.com\/([^\/\?]+)\/?$/);
    if (profileMatch && !["explore", "reels", "direct"].includes(profileMatch[1])) {
      return "profile";
    }
    if (url === "https://www.instagram.com/" || url.includes("instagram.com/?")) {
      return "feed";
    }
    return "unknown";
  }
  /**
   * Determine if we should stop browsing the feed.
   * Uses multiple signals since "end of feed" text is unreliable
   * (Instagram feeds are often infinite).
   */
  shouldStopBrowsing(scrollCount, extractedCount, startTime, recentDuplicates, config = {
    maxScrolls: 25,
    // ~25 scrolls = 5 min at human pace
    maxPosts: 30,
    // 30 posts is plenty for analysis
    maxDurationMs: 5 * 60 * 1e3,
    // 5 minute hard cap
    duplicateThreshold: 5
    // 5 consecutive dupes = we're looping
  }) {
    if (Date.now() - startTime > config.maxDurationMs) {
      return { shouldStop: true, reason: "TIME_LIMIT" };
    }
    if (scrollCount >= config.maxScrolls) {
      return { shouldStop: true, reason: "SCROLL_LIMIT" };
    }
    if (extractedCount >= config.maxPosts) {
      return { shouldStop: true, reason: "CONTENT_QUOTA" };
    }
    if (recentDuplicates >= config.duplicateThreshold) {
      return { shouldStop: true, reason: "DUPLICATE_LOOP" };
    }
    return { shouldStop: false, reason: "" };
  }
  /**
   * Get current scroll position via CDP (undetectable).
   * Useful for tracking feed progress without DOM queries.
   */
  async getScrollPosition() {
    try {
      const cdpSession = await this.page.context().newCDPSession(this.page);
      const { result } = await cdpSession.send("Runtime.evaluate", {
        expression: "JSON.stringify({ x: window.scrollX, y: window.scrollY })",
        returnByValue: true
      });
      await cdpSession.detach();
      return JSON.parse(result.value);
    } catch {
      return { x: 0, y: 0 };
    }
  }
  /**
   * Get viewport dimensions via CDP (undetectable).
   */
  async getViewportInfo() {
    try {
      const cdpSession = await this.page.context().newCDPSession(this.page);
      const { result } = await cdpSession.send("Runtime.evaluate", {
        expression: `JSON.stringify({
                    width: window.innerWidth,
                    height: window.innerHeight,
                    scrollHeight: document.documentElement.scrollHeight
                })`,
        returnByValue: true
      });
      await cdpSession.detach();
      return JSON.parse(result.value);
    } catch {
      return { width: 0, height: 0, scrollHeight: 0 };
    }
  }
  /**
   * Check if we're currently viewing a story (vs feed).
   * URL-based detection only - completely undetectable.
   */
  isInStoryViewer() {
    const url = this.page.url();
    return url.includes("/stories/");
  }
  /**
   * Check if we're on a profile page and extract username.
   * URL-based detection only.
   */
  getProfileUsername() {
    const url = this.page.url();
    const profileMatch = url.match(/instagram\.com\/([^\/\?]+)\/?$/);
    if (profileMatch && !["explore", "reels", "direct", "stories"].includes(profileMatch[1])) {
      return profileMatch[1];
    }
    return null;
  }
  /**
   * Check if we're on the main feed.
   * URL-based detection only.
   */
  isOnFeed() {
    const url = this.page.url();
    return url === "https://www.instagram.com/" || url.includes("instagram.com/?") || url === "https://www.instagram.com";
  }
  /**
   * Check if we're on the explore page.
   * URL-based detection only.
   */
  isOnExplore() {
    return this.page.url().includes("/explore");
  }
  // =========================================================================
  // CDP Accessibility Tree Methods (Blind Element Finding)
  // =========================================================================
  /**
   * Get the full accessibility tree via CDP.
   * This is undetectable - it reads the browser's internal a11y representation
   * without injecting any scripts or querying the DOM.
   */
  async getAccessibilityTree() {
    let cdpSession = null;
    try {
      cdpSession = await this.page.context().newCDPSession(this.page);
      const response = await cdpSession.send("Accessibility.getFullAXTree");
      return response.nodes || [];
    } catch (error) {
      console.warn("Failed to get accessibility tree:", error);
      return [];
    } finally {
      if (cdpSession) {
        await cdpSession.detach().catch(() => {
        });
      }
    }
  }
  /**
   * Get bounding box for a node using its backendDOMNodeId via CDP.
   * This avoids DOM queries - we use CDP's DOM.getBoxModel directly.
   */
  async getNodeBoundingBox(cdpSession, backendNodeId) {
    try {
      const { model } = await cdpSession.send("DOM.getBoxModel", {
        backendNodeId
      });
      if (!model || !model.content) {
        return null;
      }
      const [x1, y1, x2, , , y3] = model.content;
      return {
        x: x1,
        y: y1,
        width: x2 - x1,
        height: y3 - y1
      };
    } catch {
      return null;
    }
  }
  /**
   * Find all nodes matching a role and name pattern in the accessibility tree.
   */
  findMatchingNodes(nodes, role, namePattern) {
    return nodes.filter((node) => {
      if (node.ignored) return false;
      const nodeRole = node.role?.value?.toLowerCase();
      const nodeName = node.name?.value || "";
      return nodeRole === role.toLowerCase() && namePattern.test(nodeName);
    });
  }
  /**
   * Find interactive element by role and name pattern using CDP accessibility tree.
   * Returns element info with bounding box for clicking - NO DOM selectors used.
   *
   * @param role - Accessibility role (e.g., 'button', 'link')
   * @param namePattern - Regex pattern to match against the accessible name
   */
  async findElement(role, namePattern) {
    const pattern = typeof namePattern === "string" ? new RegExp(namePattern, "i") : namePattern;
    const nodes = await this.getAccessibilityTree();
    const matches = this.findMatchingNodes(nodes, role, pattern);
    if (matches.length === 0) {
      return null;
    }
    const match = matches[0];
    let boundingBox;
    if (match.backendDOMNodeId) {
      let cdpSession = null;
      try {
        cdpSession = await this.page.context().newCDPSession(this.page);
        const box = await this.getNodeBoundingBox(cdpSession, match.backendDOMNodeId);
        if (box) {
          boundingBox = box;
        }
      } finally {
        if (cdpSession) {
          await cdpSession.detach().catch(() => {
          });
        }
      }
    }
    return {
      role: match.role?.value || role,
      name: match.name?.value || "",
      selector: "",
      // No selector - we use coordinates only
      boundingBox
    };
  }
  /**
   * Find all story circles using CDP accessibility tree.
   * Stories appear as buttons with names containing "Story" or "'s story".
   *
   * Returns elements with bounding boxes for clicking - NO DOM selectors used.
   */
  async findStoryCircles() {
    const stories = [];
    const nodes = await this.getAccessibilityTree();
    const storyPattern = /story/i;
    const storyNodes = this.findMatchingNodes(nodes, "button", storyPattern);
    const storyLinks = this.findMatchingNodes(nodes, "link", storyPattern);
    const allStoryNodes = [...storyNodes, ...storyLinks];
    if (allStoryNodes.length === 0) {
      return stories;
    }
    let cdpSession = null;
    try {
      cdpSession = await this.page.context().newCDPSession(this.page);
      for (const node of allStoryNodes.slice(0, 10)) {
        if (!node.backendDOMNodeId) continue;
        const box = await this.getNodeBoundingBox(cdpSession, node.backendDOMNodeId);
        if (box && box.width > 0 && box.height > 0) {
          stories.push({
            role: node.role?.value || "button",
            name: node.name?.value || "Story",
            selector: "",
            // No selector - we use coordinates only
            boundingBox: box
          });
        }
      }
    } catch (error) {
      console.warn("Failed to get story bounding boxes:", error);
    } finally {
      if (cdpSession) {
        await cdpSession.detach().catch(() => {
        });
      }
    }
    return stories;
  }
  /**
   * Find elements by accessible name containing specific text.
   * Useful for finding "Like", "Comment", "Share" buttons without DOM queries.
   */
  async findElementsByName(namePattern) {
    const pattern = typeof namePattern === "string" ? new RegExp(namePattern, "i") : namePattern;
    const nodes = await this.getAccessibilityTree();
    const elements = [];
    const matches = nodes.filter((node) => {
      if (node.ignored) return false;
      const nodeName = node.name?.value || "";
      const nodeRole = node.role?.value?.toLowerCase();
      const interactiveRoles = ["button", "link", "menuitem", "tab", "checkbox", "radio"];
      return interactiveRoles.includes(nodeRole || "") && pattern.test(nodeName);
    });
    if (matches.length === 0) {
      return elements;
    }
    let cdpSession = null;
    try {
      cdpSession = await this.page.context().newCDPSession(this.page);
      for (const node of matches.slice(0, 20)) {
        if (!node.backendDOMNodeId) continue;
        const box = await this.getNodeBoundingBox(cdpSession, node.backendDOMNodeId);
        if (box && box.width > 0 && box.height > 0) {
          elements.push({
            role: node.role?.value || "button",
            name: node.name?.value || "",
            selector: "",
            boundingBox: box
          });
        }
      }
    } finally {
      if (cdpSession) {
        await cdpSession.detach().catch(() => {
        });
      }
    }
    return elements;
  }
  /**
   * Check if stories are present by looking for story-related elements
   * in the accessibility tree. More accurate than URL-only detection.
   */
  async detectStoriesPresent() {
    const nodes = await this.getAccessibilityTree();
    const storyPattern = /story/i;
    return nodes.some((node) => {
      if (node.ignored) return false;
      const nodeName = node.name?.value || "";
      const nodeRole = node.role?.value?.toLowerCase();
      return (nodeRole === "button" || nodeRole === "link") && storyPattern.test(nodeName);
    });
  }
  /**
   * Check if posts are present by looking for Like/Comment buttons
   * in the accessibility tree. More accurate than URL-only detection.
   */
  async detectPostsPresent() {
    const nodes = await this.getAccessibilityTree();
    const hasLikeButton = nodes.some((node) => {
      if (node.ignored) return false;
      const nodeName = node.name?.value?.toLowerCase() || "";
      return nodeName.includes("like") && node.role?.value === "button";
    });
    const hasCommentButton = nodes.some((node) => {
      if (node.ignored) return false;
      const nodeName = node.name?.value?.toLowerCase() || "";
      return nodeName.includes("comment") && node.role?.value === "button";
    });
    return hasLikeButton || hasCommentButton;
  }
  /**
   * Get enhanced content state using both URL and accessibility tree.
   * Slightly more expensive than getContentState() but more accurate.
   */
  async getEnhancedContentState() {
    const url = this.page.url();
    const currentView = this.detectCurrentView(url);
    const [hasStories, hasPosts] = await Promise.all([
      this.detectStoriesPresent(),
      this.detectPostsPresent()
    ]);
    return {
      hasStories,
      hasPosts,
      currentView
    };
  }
  // =========================================================================
  // Search Navigation Methods (Active Research)
  // =========================================================================
  /**
   * Check if we're on the search/explore page.
   * URL-based detection.
   */
  isOnSearchPage() {
    const url = this.page.url();
    return url.includes("/explore") || url.includes("/search");
  }
  /**
   * Find the Search button/link in the sidebar using CDP accessibility tree.
   * Instagram's search is typically a link with name "Search" in the sidebar.
   *
   * Returns element with bounding box for clicking - NO DOM selectors used.
   */
  async findSearchButton() {
    const nodes = await this.getAccessibilityTree();
    const searchPattern = /^search$/i;
    const searchLinks = this.findMatchingNodes(nodes, "link", searchPattern);
    if (searchLinks.length > 0) {
      const match = searchLinks[0];
      if (match.backendDOMNodeId) {
        let cdpSession = null;
        try {
          cdpSession = await this.page.context().newCDPSession(this.page);
          const box = await this.getNodeBoundingBox(cdpSession, match.backendDOMNodeId);
          if (box && box.width > 0 && box.height > 0) {
            return {
              role: match.role?.value || "link",
              name: match.name?.value || "Search",
              selector: "",
              boundingBox: box
            };
          }
        } finally {
          if (cdpSession) {
            await cdpSession.detach().catch(() => {
            });
          }
        }
      }
    }
    const searchButtons = this.findMatchingNodes(nodes, "button", searchPattern);
    if (searchButtons.length > 0) {
      const match = searchButtons[0];
      if (match.backendDOMNodeId) {
        let cdpSession = null;
        try {
          cdpSession = await this.page.context().newCDPSession(this.page);
          const box = await this.getNodeBoundingBox(cdpSession, match.backendDOMNodeId);
          if (box && box.width > 0 && box.height > 0) {
            return {
              role: match.role?.value || "button",
              name: match.name?.value || "Search",
              selector: "",
              boundingBox: box
            };
          }
        } finally {
          if (cdpSession) {
            await cdpSession.detach().catch(() => {
            });
          }
        }
      }
    }
    return null;
  }
  /**
   * Find the search input field using CDP accessibility tree.
   * Instagram's search input is typically a textbox/searchbox with name containing "Search".
   *
   * Returns element with bounding box for clicking - NO DOM selectors used.
   */
  async findSearchInput() {
    const nodes = await this.getAccessibilityTree();
    const searchPattern = /search/i;
    const inputRoles = ["textbox", "searchbox", "combobox"];
    for (const role of inputRoles) {
      const matches = this.findMatchingNodes(nodes, role, searchPattern);
      if (matches.length > 0) {
        const match = matches[0];
        if (match.backendDOMNodeId) {
          let cdpSession = null;
          try {
            cdpSession = await this.page.context().newCDPSession(this.page);
            const box = await this.getNodeBoundingBox(cdpSession, match.backendDOMNodeId);
            if (box && box.width > 0 && box.height > 0) {
              return {
                role: match.role?.value || role,
                name: match.name?.value || "Search",
                selector: "",
                boundingBox: box
              };
            }
          } finally {
            if (cdpSession) {
              await cdpSession.detach().catch(() => {
              });
            }
          }
        }
      }
    }
    return null;
  }
  /**
   * Find search result items using CDP accessibility tree.
   * Returns elements that appear to be search result entries.
   */
  async findSearchResults() {
    const results = [];
    const nodes = await this.getAccessibilityTree();
    const linkNodes = nodes.filter((node) => {
      if (node.ignored) return false;
      const nodeRole = node.role?.value?.toLowerCase();
      const nodeName = node.name?.value || "";
      if (nodeRole !== "link" || !nodeName) return false;
      const navItems = ["home", "search", "explore", "reels", "messages", "notifications", "create", "profile"];
      if (navItems.some((nav) => nodeName.toLowerCase() === nav)) return false;
      return nodeName.startsWith("@") || nodeName.startsWith("#") || nodeName.length > 2;
    });
    if (linkNodes.length === 0) {
      return results;
    }
    let cdpSession = null;
    try {
      cdpSession = await this.page.context().newCDPSession(this.page);
      for (const node of linkNodes.slice(0, 10)) {
        if (!node.backendDOMNodeId) continue;
        const box = await this.getNodeBoundingBox(cdpSession, node.backendDOMNodeId);
        if (box && box.width > 0 && box.height > 0) {
          results.push({
            role: node.role?.value || "link",
            name: node.name?.value || "",
            selector: "",
            boundingBox: box
          });
        }
      }
    } finally {
      if (cdpSession) {
        await cdpSession.detach().catch(() => {
        });
      }
    }
    return results;
  }
  /**
   * Type text into the currently focused input using CDP.
   * This uses Input.insertText which is harder to detect than keyboard events.
   *
   * @param text - The text to type
   * @param humanLike - If true, adds random delays between characters
   */
  async typeText(text, humanLike = true) {
    let cdpSession = null;
    try {
      cdpSession = await this.page.context().newCDPSession(this.page);
      if (humanLike) {
        for (const char of text) {
          await cdpSession.send("Input.insertText", { text: char });
          await new Promise((r) => setTimeout(r, 50 + Math.random() * 100));
        }
      } else {
        await cdpSession.send("Input.insertText", { text });
      }
    } finally {
      if (cdpSession) {
        await cdpSession.detach().catch(() => {
        });
      }
    }
  }
  /**
   * Clear the current input field using CDP.
   * Selects all text and deletes it.
   */
  async clearInput() {
    let cdpSession = null;
    try {
      cdpSession = await this.page.context().newCDPSession(this.page);
      const isMac = process.platform === "darwin";
      const modifier = isMac ? 2 : 4;
      await cdpSession.send("Input.dispatchKeyEvent", {
        type: "keyDown",
        modifiers: modifier,
        key: "a",
        code: "KeyA"
      });
      await cdpSession.send("Input.dispatchKeyEvent", {
        type: "keyUp",
        modifiers: modifier,
        key: "a",
        code: "KeyA"
      });
      await cdpSession.send("Input.dispatchKeyEvent", {
        type: "keyDown",
        key: "Backspace",
        code: "Backspace"
      });
      await cdpSession.send("Input.dispatchKeyEvent", {
        type: "keyUp",
        key: "Backspace",
        code: "Backspace"
      });
    } finally {
      if (cdpSession) {
        await cdpSession.detach().catch(() => {
        });
      }
    }
  }
  /**
   * Press the Escape key using CDP.
   * Useful for closing search panel or dialogs.
   */
  async pressEscape() {
    let cdpSession = null;
    try {
      cdpSession = await this.page.context().newCDPSession(this.page);
      await cdpSession.send("Input.dispatchKeyEvent", {
        type: "keyDown",
        key: "Escape",
        code: "Escape"
      });
      await cdpSession.send("Input.dispatchKeyEvent", {
        type: "keyUp",
        key: "Escape",
        code: "Escape"
      });
    } finally {
      if (cdpSession) {
        await cdpSession.detach().catch(() => {
        });
      }
    }
  }
  /**
   * Press the Enter key using CDP.
   * Used to submit search queries and trigger results loading.
   */
  async pressEnter() {
    let cdpSession = null;
    try {
      cdpSession = await this.page.context().newCDPSession(this.page);
      await cdpSession.send("Input.dispatchKeyEvent", {
        type: "keyDown",
        key: "Enter",
        code: "Enter",
        windowsVirtualKeyCode: 13,
        nativeVirtualKeyCode: 13
      });
      await cdpSession.send("Input.dispatchKeyEvent", {
        type: "keyUp",
        key: "Enter",
        code: "Enter",
        windowsVirtualKeyCode: 13,
        nativeVirtualKeyCode: 13
      });
    } finally {
      if (cdpSession) {
        await cdpSession.detach().catch(() => {
        });
      }
    }
  }
  /**
   * Type text and press Enter to submit search.
   * Combines typeText + pressEnter for convenience.
   *
   * @param text - The search term to type
   * @param humanLike - If true, adds random delays between characters
   */
  async typeAndSubmit(text, humanLike = true) {
    await this.typeText(text, humanLike);
    await new Promise((r) => setTimeout(r, 200 + Math.random() * 300));
    await this.pressEnter();
  }
};

// src/main/services/ContentVision.ts
var ContentVision = class {
  apiKey;
  usageService;
  // NO conversationHistory - each call is stateless
  // Backoff configuration for rate limit handling
  // More resilient: 5 retries with 5s base delay (5s, 10s, 20s, 40s, 60s)
  backoffConfig = {
    maxRetries: 5,
    baseDelayMs: 5e3,
    // Start at 5 seconds (not 1s)
    maxDelayMs: 6e4
    // Cap at 60 seconds
  };
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.usageService = UsageService.getInstance();
  }
  // =========================================================================
  // Exponential Backoff Logic (Prevents Burst Patterns)
  // =========================================================================
  /**
   * Calculate delay for exponential backoff with jitter.
   * Jitter prevents synchronized retry storms.
   *
   * With baseDelayMs=5000:
   * - Attempt 0: ~5s
   * - Attempt 1: ~10s
   * - Attempt 2: ~20s
   * - Attempt 3: ~40s
   * - Attempt 4: ~60s (capped)
   */
  calculateBackoffDelay(attempt) {
    const exponentialDelay = this.backoffConfig.baseDelayMs * Math.pow(2, attempt);
    const cappedDelay = Math.min(exponentialDelay, this.backoffConfig.maxDelayMs);
    const jitter = cappedDelay * 0.25 * (Math.random() * 2 - 1);
    return Math.round(cappedDelay + jitter);
  }
  /**
   * Parse retry-after header value to milliseconds.
   * Handles both seconds (integer) and HTTP date formats.
   */
  parseRetryAfterHeader(retryAfter) {
    if (!retryAfter) return null;
    const seconds = parseInt(retryAfter, 10);
    if (!isNaN(seconds)) {
      return seconds * 1e3;
    }
    const date = Date.parse(retryAfter);
    if (!isNaN(date)) {
      const delayMs = date - Date.now();
      return delayMs > 0 ? delayMs : null;
    }
    return null;
  }
  /**
   * Fetch with exponential backoff retry logic.
   * Handles rate limits gracefully without burst patterns.
   * Respects retry-after header when present.
   */
  async fetchWithBackoff(url, options) {
    let lastError = null;
    for (let attempt = 0; attempt < this.backoffConfig.maxRetries; attempt++) {
      try {
        const response = await fetch(url, options);
        if (response.status === 429) {
          const retryAfterMs = this.parseRetryAfterHeader(response.headers.get("retry-after"));
          const calculatedDelay = this.calculateBackoffDelay(attempt);
          const delay = retryAfterMs && retryAfterMs <= this.backoffConfig.maxDelayMs * 2 ? retryAfterMs : calculatedDelay;
          console.log(`\u23F3 Rate limited (attempt ${attempt + 1}/${this.backoffConfig.maxRetries}). ${retryAfterMs ? `Server says wait ${retryAfterMs}ms. ` : ""}Backing off for ${delay}ms (${(delay / 1e3).toFixed(1)}s)...`);
          await new Promise((r) => setTimeout(r, delay));
          continue;
        }
        if (response.status >= 500) {
          const delay = this.calculateBackoffDelay(attempt);
          console.log(`\u26A0\uFE0F Server error ${response.status} (attempt ${attempt + 1}). Retrying in ${delay}ms (${(delay / 1e3).toFixed(1)}s)...`);
          await new Promise((r) => setTimeout(r, delay));
          continue;
        }
        return response;
      } catch (error) {
        lastError = error;
        const delay = this.calculateBackoffDelay(attempt);
        console.log(`\u{1F50C} Network error (attempt ${attempt + 1}): ${error.message}. Retrying in ${delay}ms (${(delay / 1e3).toFixed(1)}s)...`);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
    throw lastError || new Error("VISION_RATE_LIMITED");
  }
  /**
   * Extract visible posts from current viewport.
   * This is the ONLY function that calls the Vision API for feed content.
   *
   * Cost: ~$0.01 per call (one image + small text response)
   *
   * Error handling: Skip & Continue (no DOM fallback)
   */
  async extractVisibleContent(page) {
    try {
      const screenshot = await page.screenshot({
        fullPage: false,
        type: "jpeg",
        quality: 80
        // Reduce size to minimize API cost
      });
      const base64Image = screenshot.toString("base64");
      const viewport = page.viewportSize();
      if (viewport) {
        const estimatedCost = this.usageService.calculateVisionCost(
          viewport.width,
          viewport.height,
          "low"
        );
        console.log(`\u{1F4F8} Vision API: Estimated cost $${estimatedCost.toFixed(4)}`);
      }
      const response = await this.fetchWithBackoff(
        "https://api.openai.com/v1/chat/completions",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${this.apiKey}`
          },
          body: JSON.stringify({
            model: "gpt-4o-mini",
            // Cheaper than gpt-4-vision
            messages: [{
              role: "user",
              content: [
                {
                  type: "text",
                  text: `Extract all visible Instagram posts from this screenshot.

For each post, provide:
- username: The account that posted (include @ symbol)
- caption: The post caption/text (or empty string if none visible)
- contentType: "post", "story", or "reel"
- isVideoContent: true if this appears to be a video/reel (look for play button, reel icon, video progress bar)
- visualDescription: Brief description of images (SKIP this for videos - just note "Video content")

**Important for Videos/Reels:**
- If you see a play button overlay, reel icon, or video timeline \u2192 mark isVideoContent: true
- For videos, focus on extracting the USERNAME and any visible CAPTION only
- Do NOT try to describe video frames - they're unreliable

Return ONLY valid JSON. Example:
{"posts": [
  {"username": "@example", "caption": "Hello world!", "contentType": "post", "isVideoContent": false},
  {"username": "@creator", "caption": "Check out this reel!", "contentType": "reel", "isVideoContent": true}
]}

If no posts visible, return: {"posts": []}`
                },
                {
                  type: "image_url",
                  image_url: {
                    url: `data:image/jpeg;base64,${base64Image}`,
                    detail: "low"
                    // Lower detail = lower cost
                  }
                }
              ]
            }],
            max_tokens: 1e3,
            response_format: { type: "json_object" }
          })
        }
      );
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        if (errorData.error?.code === "content_policy_violation") {
          console.warn("\u26A0\uFE0F Vision API: Content policy violation - skipping viewport");
          return {
            success: false,
            posts: [],
            skipped: true,
            reason: "CONTENT_POLICY"
          };
        }
        console.warn(`\u26A0\uFE0F Vision API error: ${errorData.error?.message || response.statusText} - skipping`);
        return {
          success: false,
          posts: [],
          skipped: true,
          reason: "API_ERROR"
        };
      }
      const data = await response.json();
      if (data.usage) {
        await this.usageService.incrementUsage(data.usage);
      }
      const content = data.choices[0]?.message?.content;
      const parsed = JSON.parse(content);
      const posts = Array.isArray(parsed) ? parsed : parsed.posts || [];
      return {
        success: true,
        posts: posts.map((p) => ({
          username: p.username || "unknown",
          caption: p.caption || "",
          contentType: p.contentType || "post",
          visualDescription: p.visualDescription,
          isVideoContent: p.isVideoContent || false
        })),
        skipped: false
      };
    } catch (error) {
      if (error.message === "VISION_RATE_LIMITED") {
        throw error;
      }
      console.error("\u274C Vision extraction failed:", error.message);
      return {
        success: false,
        posts: [],
        skipped: true,
        reason: error.message
      };
    }
  }
  /**
   * Extract story content (simpler - usually just username + visual).
   */
  async extractStoryContent(page) {
    try {
      const screenshot = await page.screenshot({
        fullPage: false,
        type: "jpeg",
        quality: 70
      });
      const base64Image = screenshot.toString("base64");
      const response = await this.fetchWithBackoff(
        "https://api.openai.com/v1/chat/completions",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${this.apiKey}`
          },
          body: JSON.stringify({
            model: "gpt-4o-mini",
            messages: [{
              role: "user",
              content: [
                {
                  type: "text",
                  text: `Extract the Instagram story content:
- username: Story author (include @ symbol)
- caption: Any visible text on the story
- visualDescription: Brief description of what's shown

Return ONLY valid JSON: {"username": "", "caption": "", "visualDescription": ""}`
                },
                {
                  type: "image_url",
                  image_url: {
                    url: `data:image/jpeg;base64,${base64Image}`,
                    detail: "low"
                  }
                }
              ]
            }],
            max_tokens: 300,
            response_format: { type: "json_object" }
          })
        }
      );
      if (!response.ok) {
        console.warn("\u26A0\uFE0F Story extraction failed:", response.statusText);
        return null;
      }
      const data = await response.json();
      if (data.usage) {
        await this.usageService.incrementUsage(data.usage);
      }
      let rawContent = data.choices[0]?.message?.content || "{}";
      rawContent = rawContent.replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?```\s*$/i, "").trim();
      const content = JSON.parse(rawContent);
      return {
        username: content.username || "unknown",
        caption: content.caption || "",
        contentType: "story",
        visualDescription: content.visualDescription
      };
    } catch (error) {
      console.error("\u274C Story extraction failed:", error);
      return null;
    }
  }
};

// src/main/services/InstagramScraper.ts
var InstagramScraper = class {
  context;
  apiKey;
  usageCap;
  usageService;
  debugMode;
  // Layer instances (created per-session)
  ghost;
  scroll;
  navigator;
  vision;
  page;
  // Metrics
  visionApiCalls = 0;
  skippedViewports = 0;
  constructor(context, apiKey, usageCap, debugMode = false) {
    this.context = context;
    this.apiKey = apiKey;
    this.usageCap = usageCap;
    this.usageService = UsageService.getInstance();
    this.debugMode = debugMode;
  }
  /**
   * Main scraping entry point - Research Sequence.
   *
   * Executes three phases:
   * 1. Active Search - Search each interest, capture results
   * 2. Story Watch - Watch available stories
   * 3. Feed Scroll - Browse main feed
   *
   * @param targetMinutes - Total browsing time (human-paced), split across phases
   * @param userInterests - Topics to search for in Phase A
   */
  async scrapeFeedAndStories(targetMinutes, userInterests) {
    const budget = await this.usageService.getBudgetStatus(this.usageCap);
    console.log(`\u{1F4B0} Budget Status: $${budget.currentSpend.toFixed(2)} spent, $${budget.remaining.toFixed(2)} remaining (~${budget.estimatedCallsRemaining} calls)`);
    if (budget.estimatedCallsRemaining < 3) {
      console.warn("\u{1F4B8} Budget too low for meaningful session (need at least 3 Vision calls)");
      throw new Error("BUDGET_EXCEEDED");
    }
    const ANALYSIS_RESERVE = 0.02;
    const availableForVision = Math.max(0, budget.remaining - ANALYSIS_RESERVE);
    const maxVisionCalls = Math.floor(availableForVision / 0.01);
    console.log(`\u{1F4CA} Session budget: max ${maxVisionCalls} Vision API calls`);
    const startTime = Date.now();
    this.page = await this.context.newPage();
    this.ghost = new GhostMouse(this.page);
    this.scroll = new HumanScroll(this.page);
    this.navigator = new A11yNavigator(this.page);
    this.vision = new ContentVision(this.apiKey);
    if (this.debugMode) {
      await this.ghost.enableVisibleCursor();
    }
    const feedContent = [];
    const storiesContent = [];
    const searchContent = [];
    try {
      console.log("\u{1F310} Navigating to Instagram...");
      await this.page.goto("https://www.instagram.com/", {
        waitUntil: "domcontentloaded"
      });
      await this.humanDelay(2e3, 4e3);
      const state = await this.navigator.getContentState();
      console.log("\u{1F4CA} Content State:", state);
      if (state.currentView === "login") {
        throw new Error("SESSION_EXPIRED");
      }
      const searchBudget = Math.min(userInterests.length, 5);
      const storyBudget = 5;
      const feedBudget = Math.max(0, maxVisionCalls - searchBudget - storyBudget);
      console.log(`\u{1F4CA} Budget allocation: Search=${searchBudget}, Stories=${storyBudget}, Feed=${feedBudget}`);
      if (userInterests.length > 0 && this.visionApiCalls < maxVisionCalls) {
        console.log("\n\u{1F50D} \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550");
        console.log("\u{1F50D} PHASE A: ACTIVE SEARCH");
        console.log("\u{1F50D} \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\n");
        const searchResults = await this.executeSearchPhase(userInterests, searchBudget);
        for (const result of searchResults) {
          searchContent.push(...result.posts);
        }
      }
      if (state.hasStories && this.visionApiCalls < maxVisionCalls) {
        console.log("\n\u{1F3AC} \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550");
        console.log("\u{1F3AC} PHASE B: STORY WATCH");
        console.log("\u{1F3AC} \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\n");
        await this.returnToHome();
        const stories = await this.exploreStories(storyBudget);
        storiesContent.push(...stories);
      }
      if (this.visionApiCalls < maxVisionCalls) {
        console.log("\n\u{1F4DC} \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550");
        console.log("\u{1F4DC} PHASE C: FEED SCROLL");
        console.log("\u{1F4DC} \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\n");
        await this.returnToHome();
        const elapsedMinutes = (Date.now() - startTime) / 6e4;
        const remainingMinutes = Math.max(2, targetMinutes - elapsedMinutes);
        const feed = await this.exploreFeed(remainingMinutes, feedBudget);
        feedContent.push(...feed);
      }
    } catch (error) {
      console.error("\u274C Scraping error:", error.message);
      if (["SESSION_EXPIRED", "RATE_LIMITED", "VISION_RATE_LIMITED", "BUDGET_EXCEEDED"].includes(error.message)) {
        throw error;
      }
    } finally {
      await this.page.close();
    }
    const combinedFeed = [...searchContent, ...feedContent];
    return {
      feedContent: combinedFeed,
      storiesContent,
      sessionDuration: Date.now() - startTime,
      visionApiCalls: this.visionApiCalls,
      skippedViewports: this.skippedViewports,
      scrapedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
  }
  // =========================================================================
  // PHASE A: ACTIVE SEARCH
  // =========================================================================
  /**
   * Execute Active Search phase.
   * For each user interest:
   * 1. Click Search button
   * 2. Type interest term + press Enter to commit
   * 3. Wait 5-8 seconds for results to load
   * 4. Scroll 1-2 times to trigger lazy loading
   * 5. Capture screenshot with Vision API
   * 6. Close search and repeat
   *
   * @param interests - User interests to search for
   * @param maxCalls - Maximum Vision API calls for this phase
   */
  async executeSearchPhase(interests, maxCalls) {
    const captures = [];
    const interestsToSearch = interests.slice(0, maxCalls);
    for (const interest of interestsToSearch) {
      if (this.visionApiCalls >= maxCalls) {
        console.log("\u{1F4B0} Search phase budget exhausted");
        break;
      }
      console.log(`\u{1F50D} Searching for: "${interest}"`);
      try {
        const searchButton = await this.navigator.findSearchButton();
        if (!searchButton?.boundingBox) {
          console.log("  \u26A0\uFE0F Search button not found, skipping");
          continue;
        }
        await this.ghost.clickElement(searchButton.boundingBox, 0.3);
        await this.humanDelay(1e3, 2e3);
        const searchInput = await this.navigator.findSearchInput();
        if (!searchInput?.boundingBox) {
          console.log("  \u26A0\uFE0F Search input not found, skipping");
          await this.navigator.pressEscape();
          await this.humanDelay(500, 1e3);
          continue;
        }
        await this.ghost.clickElement(searchInput.boundingBox, 0.5);
        await this.humanDelay(300, 600);
        console.log(`  \u2328\uFE0F Typing "${interest}" and pressing Enter...`);
        await this.navigator.typeAndSubmit(interest, true);
        const waitTime = 5e3 + Math.random() * 3e3;
        console.log(`  \u23F3 Waiting ${(waitTime / 1e3).toFixed(1)}s for results to load...`);
        await this.humanDelay(waitTime, waitTime + 500);
        const scrollCount = 1 + Math.floor(Math.random() * 2);
        console.log(`  \u{1F4DC} Scrolling ${scrollCount}x to trigger lazy loading...`);
        for (let i = 0; i < scrollCount; i++) {
          await this.scroll.scroll({
            baseDistance: 200 + Math.random() * 150,
            // Smaller scrolls
            variability: 0.2,
            microAdjustProb: 0.1,
            readingPauseMs: [1e3, 2e3]
            // Shorter pauses
          });
        }
        await this.humanDelay(1e3, 1500);
        const canAfford = await this.usageService.canAffordVisionCall(this.usageCap);
        if (!canAfford) {
          console.log("\u{1F4B8} Budget exhausted during search phase");
          break;
        }
        console.log(`  \u{1F4F8} Capturing search results (Vision API call #${this.visionApiCalls + 1})`);
        const result = await this.vision.extractVisibleContent(this.page);
        this.visionApiCalls++;
        if (result.success && result.posts.length > 0) {
          captures.push({
            interest,
            posts: result.posts.map((p) => ({
              ...p,
              // Tag posts with the search interest for context
              caption: `[SEARCH: ${interest}] ${p.caption || p.visualDescription || ""}`
            })),
            capturedAt: (/* @__PURE__ */ new Date()).toISOString()
          });
          console.log(`  \u2705 Found ${result.posts.length} results for "${interest}"`);
        } else {
          console.log(`  \u{1F4ED} No results captured for "${interest}"`);
          if (result.skipped) {
            this.skippedViewports++;
          }
        }
        await this.navigator.pressEscape();
        await this.humanDelay(1e3, 2e3);
      } catch (error) {
        console.error(`  \u274C Search error for "${interest}":`, error.message);
        await this.navigator.pressEscape().catch(() => {
        });
        await this.humanDelay(500, 1e3);
      }
    }
    console.log(`\u2705 Search phase complete. Captured ${captures.length} interest searches`);
    return captures;
  }
  // =========================================================================
  // PHASE B: STORY WATCH
  // =========================================================================
  /**
   * Stories exploration using Blind Navigation + Vision Extraction.
   *
   * @param maxCalls - Maximum Vision API calls for this phase
   */
  async exploreStories(maxCalls) {
    const stories = [];
    console.log("\u{1F3AC} Exploring stories...");
    const storyCircles = await this.navigator.findStoryCircles();
    if (storyCircles.length === 0) {
      console.log("  No stories found");
      return stories;
    }
    const firstStory = storyCircles[0];
    if (firstStory.boundingBox) {
      await this.ghost.clickElement(firstStory.boundingBox, 0.3);
      await this.humanDelay(2e3, 3e3);
    } else {
      console.log("  Could not click first story (no bounding box)");
      return stories;
    }
    const maxStories = Math.min(maxCalls, storyCircles.length, 8);
    let storiesWatched = 0;
    for (let i = 0; i < maxStories; i++) {
      if (storiesWatched >= maxCalls) {
        console.log("\u{1F4B0} Story phase budget exhausted");
        break;
      }
      if (!this.navigator.isInStoryViewer()) {
        console.log("  Exited story viewer");
        break;
      }
      const canAfford = await this.usageService.canAffordVisionCall(this.usageCap);
      if (!canAfford) {
        console.log("\u{1F4B8} Budget exhausted during story phase");
        break;
      }
      const storyContent = await this.vision.extractStoryContent(this.page);
      this.visionApiCalls++;
      storiesWatched++;
      if (storyContent) {
        stories.push(storyContent);
        console.log(`  \u{1F4D6} Story ${i + 1}: ${storyContent.username}`);
      }
      await this.humanDelay(4e3, 8e3);
      const viewportSize = this.page.viewportSize();
      if (viewportSize) {
        const rightZone = {
          x: viewportSize.width * 0.6,
          y: viewportSize.height * 0.2,
          width: viewportSize.width * 0.35,
          height: viewportSize.height * 0.6
        };
        await this.ghost.clickElement(rightZone, 0.2);
      }
      await this.humanDelay(1e3, 2e3);
    }
    await this.page.keyboard.press("Escape");
    await this.humanDelay(1e3, 2e3);
    console.log(`\u2705 Stories complete. Watched ${stories.length} stories`);
    return stories;
  }
  // =========================================================================
  // PHASE C: FEED SCROLL
  // =========================================================================
  /**
   * Feed exploration using Hybrid Loop:
   * 1. MOVE: Scroll using Physics Layer (FREE)
   * 2. CHECK: Verify content with A11y Layer (FREE)
   * 3. EXTRACT: Call Vision API only when content confirmed (PAID)
   *
   * @param targetMinutes - Time to spend scrolling
   * @param maxCalls - Maximum Vision API calls for this phase
   */
  async exploreFeed(targetMinutes, maxCalls) {
    const startTime = Date.now();
    const endTime = startTime + targetMinutes * 60 * 1e3;
    const extractedContent = [];
    const seenPostKeys = /* @__PURE__ */ new Set();
    let scrollCount = 0;
    let consecutiveDuplicates = 0;
    let feedVisionCalls = 0;
    const maxScrollsBeforeExtract = 3;
    console.log(`\u{1F504} Starting feed exploration for ${targetMinutes.toFixed(1)} minutes (max ${maxCalls} calls)`);
    await this.scroll.scrollToTop();
    await this.humanDelay(1e3, 2e3);
    while (Date.now() < endTime) {
      const termination = this.navigator.shouldStopBrowsing(
        scrollCount,
        extractedContent.length,
        startTime,
        consecutiveDuplicates
      );
      if (termination.shouldStop) {
        console.log(`\u2705 Stopping feed exploration: ${termination.reason}`);
        break;
      }
      if (feedVisionCalls >= maxCalls) {
        console.log(`\u{1F4B0} Feed budget limit reached (${feedVisionCalls}/${maxCalls} calls). Stopping extraction.`);
        break;
      }
      await this.scroll.scroll({
        baseDistance: 300 + Math.random() * 200,
        variability: 0.25,
        microAdjustProb: 0.2,
        readingPauseMs: [3e3, 6e3]
      });
      scrollCount++;
      const state = await this.navigator.getContentState();
      if (!state.hasPosts) {
        console.log("\u26A0\uFE0F No posts detected, waiting...");
        await this.humanDelay(2e3, 3e3);
        continue;
      }
      if (scrollCount % maxScrollsBeforeExtract === 0) {
        const canAfford = await this.usageService.canAffordVisionCall(this.usageCap);
        if (!canAfford) {
          console.log("\u{1F4B8} Real-time budget check failed. Stopping.");
          break;
        }
        console.log(`\u{1F4F8} Extracting content (Vision API call #${this.visionApiCalls + 1})`);
        const result = await this.vision.extractVisibleContent(this.page);
        this.visionApiCalls++;
        feedVisionCalls++;
        if (result.skipped) {
          this.skippedViewports++;
          consecutiveDuplicates++;
          continue;
        }
        if (result.success) {
          let newPostsThisRound = 0;
          for (const post of result.posts) {
            const key = `${post.username}-${post.caption.slice(0, 50)}`;
            if (!seenPostKeys.has(key)) {
              seenPostKeys.add(key);
              extractedContent.push(post);
              newPostsThisRound++;
              console.log(`  \u{1F4DD} Found: ${post.username}`);
            }
          }
          if (newPostsThisRound === 0) {
            consecutiveDuplicates++;
          } else {
            consecutiveDuplicates = 0;
          }
        }
      }
      if (Math.random() < 0.1) {
        console.log("\u2615 Taking a longer pause...");
        await this.humanDelay(5e3, 1e4);
      }
    }
    console.log(`\u2705 Feed exploration complete. Extracted ${extractedContent.length} posts`);
    return extractedContent;
  }
  // =========================================================================
  // UTILITY METHODS
  // =========================================================================
  /**
   * Return to Instagram home page.
   */
  async returnToHome() {
    if (!this.navigator.isOnFeed()) {
      console.log("\u{1F3E0} Returning to home...");
      await this.page.goto("https://www.instagram.com/", {
        waitUntil: "domcontentloaded"
      });
      await this.humanDelay(2e3, 3e3);
    }
  }
  /**
   * Human-like delay with random variation.
   */
  humanDelay(min2, max2) {
    const delay = min2 + Math.random() * (max2 - min2);
    return new Promise((resolve) => setTimeout(resolve, delay));
  }
};

// src/main/services/AnalysisGenerator.ts
var MAX_CAPTION_LENGTH = 280;
var MAX_TOTAL_CONTENT_CHARS = 8e3;
var AnalysisGenerator = class {
  apiKey;
  usageService;
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.usageService = UsageService.getInstance();
  }
  /**
   * Generate a newspaper-style analysis from browsed Instagram content.
   * This is the MAIN entry point called by SchedulerService.
   *
   * @throws Error if generation fails (no fallback - transparent failure)
   */
  async generate(session2, config) {
    const contentSummary = this.prepareContentSummary(session2);
    const analysis = await this.callGenerationAPI(contentSummary, config);
    return {
      ...analysis,
      date: (/* @__PURE__ */ new Date()).toISOString(),
      location: config.location,
      scheduledTime: config.scheduledTime
    };
  }
  /**
   * Prepare a structured summary of browsed content for the LLM.
   * Groups by content type and applies token-aware truncation.
   */
  prepareContentSummary(session2) {
    const sections = [];
    let totalChars = 0;
    if (session2.feedContent.length > 0) {
      sections.push("## Feed Posts");
      for (let i = 0; i < session2.feedContent.length && totalChars < MAX_TOTAL_CONTENT_CHARS; i++) {
        const post = session2.feedContent[i];
        const caption = this.truncateCaption(post.caption || post.visualDescription || "No caption");
        let line;
        if (post.isVideoContent) {
          line = `${i + 1}. ${post.username} [Video/Reel]: "${caption}"`;
        } else {
          line = `${i + 1}. ${post.username}: "${caption}"`;
        }
        if (totalChars + line.length > MAX_TOTAL_CONTENT_CHARS) break;
        sections.push(line);
        totalChars += line.length;
      }
    }
    if (session2.storiesContent.length > 0 && totalChars < MAX_TOTAL_CONTENT_CHARS) {
      sections.push("\n## Stories");
      for (const story of session2.storiesContent.slice(0, 10)) {
        const desc = this.truncateCaption(story.visualDescription || story.caption || "Visual story");
        const line = `- ${story.username}: ${desc}`;
        if (totalChars + line.length > MAX_TOTAL_CONTENT_CHARS) break;
        sections.push(line);
        totalChars += line.length;
      }
    }
    const postsIncluded = sections.filter((s) => /^\d+\./.test(s)).length;
    sections.push(`
## Session Info`);
    sections.push(`- Total posts browsed: ${session2.feedContent.length}`);
    sections.push(`- Total stories viewed: ${session2.storiesContent.length}`);
    sections.push(`- Posts included in summary: ${postsIncluded}`);
    return sections.join("\n");
  }
  /**
   * Truncate caption to reasonable length, preserving meaning.
   */
  truncateCaption(caption) {
    if (!caption) return "";
    const cleaned = caption.replace(/\s+/g, " ").trim();
    if (cleaned.length <= MAX_CAPTION_LENGTH) {
      return cleaned;
    }
    const truncated = cleaned.slice(0, MAX_CAPTION_LENGTH);
    const lastSpace = truncated.lastIndexOf(" ");
    return (lastSpace > 200 ? truncated.slice(0, lastSpace) : truncated) + "...";
  }
  /**
   * Call GPT-4 to generate the newspaper-style analysis.
   * Uses Smart Brevity format with bullet points and insider context.
   */
  async callGenerationAPI(contentSummary, config) {
    const now = /* @__PURE__ */ new Date();
    const dayName = now.toLocaleDateString("en-US", { weekday: "long" });
    const dateStr = now.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
    const interestsList = config.interests.length > 0 ? config.interests.map((i) => `"${i}"`).join(", ") : "General news and trends";
    const prompt = `You are a senior analyst creating a personalized intelligence briefing for ${config.userName}.

\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
USER PROFILE
\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
Name: ${config.userName}
Location: ${config.location || "Not specified"}
PRIORITY INTERESTS: ${interestsList}

\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
TODAY'S RAW INSTAGRAM FEED
\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
${contentSummary}

\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
OUTPUT FORMAT
\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550

# [Punchy Title]
### [One-line insight] \u2014 ${dayName}, ${dateStr}${config.location ? `, ${config.location}` : ""}

## Your Interests
- [First interest-related bullet with SPECIFIC details]
- [Second interest-related bullet with SPECIFIC details]

## [Other Thematic Section]
- Topic: Specific detail from content.
- ...

\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
CRITICAL RULES - READ CAREFULLY
\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550

\u{1F6A8} EXTREME SPECIFICITY (MOST IMPORTANT):
Do NOT generalize. Do NOT abstract. Report EXACTLY what you see.

BAD EXAMPLES (NEVER DO THIS):
  \u274C "A sports figure holding a trophy underscores the importance of winning"
  \u274C "A football player celebrated a victory"
  \u274C "A growing trend in the fitness space..."
  \u274C "One creator highlighted the intersection of..."
  \u274C "A tech company announced new features"

GOOD EXAMPLES (DO THIS):
  \u2705 "Jim Harbaugh celebrated Michigan's 34-13 win over Washington"
  \u2705 "J.J. McCarthy threw for 3 touchdowns in the National Championship"
  \u2705 "Apple announced Vision Pro pre-orders start February 2nd at $3,499"
  \u2705 "Taylor Swift's Eras Tour grossed $1 billion in 2024"

DIRECT REPORTING:
  - If you see a NAME, write the NAME
  - If you see a SCORE, write the SCORE
  - If you see a DATE, write the DATE
  - If you see a PRICE, write the PRICE
  - If you see STATS, write the STATS
  - NEVER replace specific info with vague descriptors

\u{1F3AF} "YOUR INTERESTS" SECTION (REQUIRED FIRST SECTION):
This section MUST contain news matching: ${interestsList}
  - Search results for these interests were captured FIRST
  - Report the SPECIFIC news/updates found for each interest
  - Use real names, scores, dates, announcements
  - If we searched "Indiana Football", write what Indiana Football news was found

HANDLE RULE:
  - Use real names for PUBLIC FIGURES (athletes, celebrities, executives)
  - Use descriptors only for random unknown accounts
  - Exception: Always name authorities in ${config.userName}'s interests

FORMAT:
  - 2-4 sections, 2-4 bullets each
  - Each bullet: Topic + 1-2 sentences with SPECIFIC details
  - NO asterisks or bold markers
  - Standard dash (-) for bullets
  - "Your Interests" section MUST be first

\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550

Return valid JSON:
{
    "title": "string (punchy, specific)",
    "subtitle": "string (insight + date/location)",
    "sections": [
        {
            "heading": "Your Interests",
            "content": ["- Topic: Specific news about user's interests.", "- Topic: More specific details."]
        },
        {
            "heading": "string (thematic)",
            "content": ["- Topic: Specific detail.", "- Topic: More details."]
        }
    ]
}`;
    console.log("\u{1F916} Generating analysis with GPT-4...");
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${this.apiKey}`
      },
      body: JSON.stringify({
        model: "gpt-4-turbo-preview",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 2e3,
        temperature: 0.7,
        // Some creativity
        response_format: { type: "json_object" }
      })
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error("\u274C Generation API error:", errorData);
      throw new Error("GENERATION_FAILED");
    }
    const data = await response.json();
    if (data.usage) {
      await this.usageService.incrementUsage(data.usage);
      console.log(`\u{1F4B0} Generation cost tracked: ${data.usage.total_tokens} tokens`);
    }
    const content = data.choices[0]?.message?.content;
    if (!content) {
      throw new Error("GENERATION_FAILED");
    }
    try {
      const parsed = JSON.parse(content);
      if (!parsed.title || !parsed.sections || !Array.isArray(parsed.sections)) {
        throw new Error("Invalid response structure");
      }
      console.log("\u2705 Analysis generated successfully");
      return {
        title: parsed.title,
        subtitle: parsed.subtitle || "",
        sections: parsed.sections.map((s) => ({
          heading: s.heading || "Untitled Section",
          content: Array.isArray(s.content) ? s.content : [s.content || ""]
        }))
      };
    } catch (parseError) {
      console.error("\u274C Failed to parse generation response:", parseError);
      throw new Error("GENERATION_FAILED");
    }
  }
  // NOTE: No generateFallback() method - we don't generate garbage content.
  // If generation fails, we notify the user and schedule a retry.
};

// src/main/services/SchedulerService.ts
var BAKER_LEAD_TIME_MS = 2 * 60 * 1e3;
var PREP_BUFFER_MS = 15 * 1e3;
var SchedulerService = class _SchedulerService {
  static instance;
  checkInterval = null;
  mainWindow = null;
  alignmentTimeout = null;
  lastWakeTime = /* @__PURE__ */ new Date();
  // Track when app started/woke
  suspensionBlockerId = null;
  constructor() {
  }
  static getInstance() {
    if (!_SchedulerService.instance) {
      _SchedulerService.instance = new _SchedulerService();
    }
    return _SchedulerService.instance;
  }
  getLastWakeTime() {
    return this.lastWakeTime;
  }
  setMainWindow(window) {
    this.mainWindow = window;
  }
  // Helper to dynamically load electron-store (ESM)
  async getStore() {
    const { default: Store } = await import("electron-store");
    return new Store();
  }
  // Format date in LOCAL timezone (avoids UTC conversion issues)
  formatLocalDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }
  // Parse time string (e.g., "8:00 AM") into a Date object for the given reference date
  parseTimeString(timeStr, referenceDate) {
    const [time, modifier] = timeStr.split(" ");
    let [hours, minutes] = time.split(":").map(Number);
    if (modifier === "PM" && hours < 12) hours += 12;
    if (modifier === "AM" && hours === 12) hours = 0;
    const result = new Date(referenceDate);
    result.setHours(hours, minutes, 0, 0);
    return result;
  }
  // Deterministic random offset (0-30 minutes) based on date string hash (djb2 algorithm)
  // This makes bake time vary day-to-day (stealth) but stay fixed within a single day (predictable)
  getDeterministicBakeOffset(dateStr) {
    let hash = 0;
    for (let i = 0; i < dateStr.length; i++) {
      hash = (hash << 5) - hash + dateStr.charCodeAt(i);
      hash = hash & hash;
    }
    const offsetMinutes = Math.abs(hash) % 31;
    return offsetMinutes * 60 * 1e3;
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
    console.log("\u23F0 SchedulerService: Initialized.");
    this.lastWakeTime = /* @__PURE__ */ new Date();
    console.log("\u23F0 Wake Time set to:", this.lastWakeTime.toLocaleString());
    this.suspensionBlockerId = import_electron4.powerSaveBlocker.start("prevent-app-suspension");
    console.log(`\u{1F50B} Power Save Blocker active (ID: ${this.suspensionBlockerId})`);
    this.startHeartbeat();
    import_electron4.powerMonitor.on("resume", () => {
      console.log(`\u26A1\uFE0F System Resumed. Heartbeat active. App Uptime: ${Math.floor(process.uptime() / 60)}m. Last Wake (Start) Time: ${this.lastWakeTime.toLocaleString()}`);
      this.startHeartbeat();
    });
  }
  startHeartbeat() {
    if (this.checkInterval) clearInterval(this.checkInterval);
    if (this.alignmentTimeout) clearTimeout(this.alignmentTimeout);
    this.handleInsomniaState();
    import_electron4.powerMonitor.on("on-ac", () => {
      console.log("\u{1F50C} Power Source: AC. Re-evaluating Insomnia Mode...");
      this.handleInsomniaState();
    });
    import_electron4.powerMonitor.on("on-battery", () => {
      console.log("\u{1FAAB} Power Source: Battery. Disabling Insomnia Mode...");
      this.disableInsomnia();
    });
    const now = /* @__PURE__ */ new Date();
    const msUntilNextMinute = 6e4 - now.getTime() % 6e4;
    this.checkSchedule();
    this.alignmentTimeout = setTimeout(() => {
      this.checkSchedule();
      this.checkInterval = setInterval(() => {
        this.checkSchedule();
      }, 6e4);
    }, msUntilNextMinute);
  }
  // --- INSOMNIA MANAGEMENT ---
  insomniaProcess = null;
  // Type 'ChildProcess' needs import or 'any'
  handleInsomniaState() {
    if (!import_electron4.powerMonitor.isOnBatteryPower()) {
      this.enableInsomnia();
    } else {
      this.disableInsomnia();
    }
  }
  enableInsomnia() {
    if (this.insomniaProcess) return;
    console.log("\u{1F50B} AC Power detected: Insomnia Mode active (Preventing System Sleep)");
    this.insomniaProcess = (0, import_child_process.spawn)("caffeinate", ["-i", "-s", "-w", process.pid.toString()]);
    this.insomniaProcess.on("close", (code) => {
      console.log(`\u2615\uFE0F Insomnia Process exited with code ${code}`);
      this.insomniaProcess = null;
    });
  }
  disableInsomnia() {
    if (this.insomniaProcess) {
      console.log("\u{1FAAB} Battery detected / Stopping: Insomnia Mode disabled");
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
    const settings = store.get("settings") || {};
    if (!settings.hasOnboarded) {
      return null;
    }
    const today = this.formatLocalDate(/* @__PURE__ */ new Date());
    let activeSchedule = store.get("activeSchedule");
    if (!activeSchedule) {
      const canHitToday = this.canScheduleForToday(settings.morningTime || "8:00 AM");
      const nextDate = /* @__PURE__ */ new Date();
      if (!canHitToday) {
        nextDate.setDate(nextDate.getDate() + 1);
      }
      const activeDateStr = this.formatLocalDate(nextDate);
      activeSchedule = {
        morningTime: settings.morningTime || "8:00 AM",
        eveningTime: settings.eveningTime || "4:00 PM",
        digestFrequency: settings.digestFrequency || 1,
        activeDate: activeDateStr
      };
      store.set("activeSchedule", activeSchedule);
      console.log(`\u{1F4C5} First Daily Snapshot Created. Active starting ${activeDateStr}:`, activeSchedule);
      this.mainWindow?.webContents.send("schedule-updated", activeSchedule);
      return activeSchedule;
    }
    if (activeSchedule.activeDate !== today && activeSchedule.activeDate < today) {
      activeSchedule = {
        morningTime: settings.morningTime || "8:00 AM",
        eveningTime: settings.eveningTime || "4:00 PM",
        digestFrequency: settings.digestFrequency || 1,
        activeDate: today
      };
      store.set("activeSchedule", activeSchedule);
      console.log(`\u{1F4C5} Daily Snapshot Refreshed for ${today}:`, activeSchedule);
      this.mainWindow?.webContents.send("schedule-updated", activeSchedule);
    }
    return activeSchedule;
  }
  async checkSchedule() {
    try {
      const store = await this.getStore();
      const activeSchedule = await this.ensureDailySnapshot(store);
      if (!activeSchedule) {
        return;
      }
      const settings = store.get("settings") || {};
      const now = /* @__PURE__ */ new Date();
      const todayStr = this.formatLocalDate(now);
      const analysisStatus = settings.analysisStatus || "idle";
      if (activeSchedule.activeDate !== todayStr) {
        return;
      }
      this.mainWindow?.webContents.send("schedule-updated", activeSchedule);
      if (this.shouldTriggerBaker(now, activeSchedule.morningTime, settings.lastBakeDate)) {
        console.log(`\u{1F950} Baker triggered for Morning slot (Delivery: ${activeSchedule.morningTime})`);
        await this.triggerBaker(now, store, activeSchedule.morningTime);
        return;
      }
      if (this.shouldTriggerDelivery(now, activeSchedule.morningTime, analysisStatus, settings.lastDeliveryDate)) {
        console.log(`\u{1F4EC} Delivery Boy triggered for Morning slot`);
        await this.triggerDelivery(store, activeSchedule.morningTime);
        return;
      }
      if (activeSchedule.digestFrequency === 2) {
        if (this.shouldTriggerBaker(now, activeSchedule.eveningTime, settings.lastBakeDate)) {
          console.log(`\u{1F950} Baker triggered for Evening slot (Delivery: ${activeSchedule.eveningTime})`);
          await this.triggerBaker(now, store, activeSchedule.eveningTime);
          return;
        }
        if (this.shouldTriggerDelivery(now, activeSchedule.eveningTime, analysisStatus, settings.lastDeliveryDate)) {
          console.log(`\u{1F4EC} Delivery Boy triggered for Evening slot`);
          await this.triggerDelivery(store, activeSchedule.eveningTime);
          return;
        }
      }
    } catch (error) {
      console.error("Scheduler Check Failed:", error);
    }
  }
  // catchUpMissedSlots removed for Daemon Mode (Anti-Burst)
  /**
   * Helper to determine if a slot is still viable for TODAY based on time and buffer.
   */
  canScheduleForToday(targetTimeStr) {
    const now = /* @__PURE__ */ new Date();
    const targetDate = this.parseTimeString(targetTimeStr, now);
    if (now >= targetDate) return false;
    const prepTimeMs = targetDate.getTime() - this.lastWakeTime.getTime();
    const uptimeSeconds = process.uptime();
    const prepBufferSeconds = PREP_BUFFER_MS / 1e3;
    if (prepTimeMs < PREP_BUFFER_MS && uptimeSeconds < prepBufferSeconds) {
      console.log(`\u{1F6E1}\uFE0F Initial Snapshot: Skipping Today. Too close to wake/boot. (${Math.floor(uptimeSeconds)}s uptime)`);
      return false;
    }
    return true;
  }
  // ==================== TWO-JOB SCHEDULER (INVISIBLE BUTLER) ====================
  /**
   * BAKER: Determines if we should start the preparation phase.
   * Triggers 2.5-3 hours BEFORE delivery time (with deterministic random offset).
   */
  shouldTriggerBaker(now, deliveryTimeStr, lastBakeIso) {
    if (!deliveryTimeStr) return false;
    const todayStr = this.formatLocalDate(now);
    const deliveryTime = this.parseTimeString(deliveryTimeStr, now);
    const offset = this.getDeterministicBakeOffset(todayStr);
    console.log(`\u{1F3B2} Deterministic offset for ${todayStr}: ${offset / 6e4} minutes`);
    const bakeTime = new Date(deliveryTime.getTime() - BAKER_LEAD_TIME_MS + offset);
    if (now < bakeTime || now >= deliveryTime) return false;
    if (lastBakeIso) {
      const lastBake = new Date(lastBakeIso);
      if (lastBake >= bakeTime) return false;
    }
    const prepTimeMs = bakeTime.getTime() - this.lastWakeTime.getTime();
    const uptimeSeconds = process.uptime();
    const prepBufferSeconds = PREP_BUFFER_MS / 1e3;
    if (prepTimeMs < PREP_BUFFER_MS && uptimeSeconds < prepBufferSeconds) {
      console.log(`\u{1F6E1}\uFE0F Baker: Skipping - machine woke too close to bake time (uptime: ${Math.floor(uptimeSeconds)}s)`);
      return false;
    }
    return true;
  }
  /**
   * DELIVERY BOY: Determines if we should deliver the prepared analysis.
   * Triggers AT or AFTER the exact delivery time - INFINITE WINDOW (no 30-min tolerance).
   * If status === 'pending_delivery' and time has passed, deliver it.
   */
  shouldTriggerDelivery(now, deliveryTimeStr, analysisStatus, lastDeliveryIso) {
    if (!deliveryTimeStr) return false;
    if (analysisStatus !== "pending_delivery") return false;
    const deliveryTime = this.parseTimeString(deliveryTimeStr, now);
    if (now < deliveryTime) return false;
    if (lastDeliveryIso) {
      const lastDelivery = new Date(lastDeliveryIso);
      if (lastDelivery >= deliveryTime) return false;
    }
    return true;
  }
  /**
   * COLLISION HANDLER: Archives any pending undelivered paper before baking a new one.
   * This ensures no paper is ever lost - they go to the Archive.
   */
  async archivePendingAnalysis(store) {
    const settings = store.get("settings") || {};
    if (settings.analysisStatus !== "pending_delivery") return;
    const analyses = store.get("analyses") || [];
    if (analyses.length === 0) return;
    const pendingAnalysis = analyses[0];
    console.log(`\u{1F4E6} Archiving undelivered paper: ${pendingAnalysis.id}`);
    store.set("settings", {
      ...settings,
      analysisStatus: "idle"
    });
    console.log(`\u{1F4E6} Previous paper archived. Ready for new bake.`);
  }
  // ==================== END TWO-JOB SCHEDULER ====================
  // Old shouldTrigger() method removed - replaced by shouldTriggerBaker() and shouldTriggerDelivery()
  async triggerSimulation(now, store, scheduledTime, targetDate, silent = false) {
    const settings = store.get("settings") || {};
    const effectiveDate = targetDate || now;
    const mockAnalysis = LoremIpsumGenerator.generate({
      userName: settings.userName,
      location: settings.location,
      scheduledTime,
      targetDate: effectiveDate
    });
    console.log(`\u{1F311} Background Task Started at ${(/* @__PURE__ */ new Date()).toLocaleString()}`);
    const newRecord = {
      id: `analysis-sim-${Date.now()}-${Math.floor(Math.random() * 1e3)}`,
      // Random suffix to avoid collision in fast loops
      data: mockAnalysis,
      leadStoryPreview: mockAnalysis.sections[0]?.content[0]?.substring(0, 100) + "..." || "No preview available."
    };
    const userDataPath = import_electron4.app.getPath("userData");
    const recordDir = import_path3.default.join(userDataPath, "analysis_records");
    const recordPath = import_path3.default.join(recordDir, `${newRecord.id}.json`);
    const tempPath = import_path3.default.join(recordDir, `${newRecord.id}.tmp`);
    try {
      await import_fs3.default.promises.writeFile(tempPath, JSON.stringify(newRecord, null, 2));
      await import_fs3.default.promises.rename(tempPath, recordPath);
      console.log(`\u{1F4BE} Saved Full Analysis cleanly to disk: ${recordPath}`);
      const metadataRecord = {
        id: newRecord.id,
        // Keep critical fields for sorting/listing
        data: {
          date: newRecord.data.date,
          // Used for sorting
          title: newRecord.data.title,
          scheduledTime: newRecord.data.scheduledTime,
          location: newRecord.data.location
          // REMOVED: sections (heavy text)
        },
        leadStoryPreview: newRecord.leadStoryPreview
      };
      const currentAnalyses = store.get("analyses") || [];
      const updatedAnalyses = [metadataRecord, ...currentAnalyses];
      store.set("analyses", updatedAnalyses);
      const newStatus = silent ? "idle" : "ready";
      store.set("settings", {
        ...settings,
        lastAnalysisDate: effectiveDate.toISOString(),
        analysisStatus: newStatus
      });
      console.log(`\u{1F315} Background Task Completed at ${(/* @__PURE__ */ new Date()).toLocaleString()}`);
      console.log(`\u{1F916} Simulation Complete (${silent ? "Silent/Historical" : "Live"}). Estimated Cost: $0.00`);
      if (!silent && this.mainWindow && !this.mainWindow.isDestroyed()) {
        console.log("\u{1F4E1} Push Notification Sent: analysis-ready (Metadata Only)");
        this.mainWindow.webContents.send("analysis-ready", metadataRecord);
      }
    } catch (e) {
      console.error("\u274C Failed to save analysis to disk (Atomic Write Failed). Aborting metadata update.", e);
      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        this.mainWindow.webContents.send("analysis-error", { message: "Failed to save analysis to disk." });
      }
      try {
        if (import_fs3.default.existsSync(tempPath)) await import_fs3.default.promises.unlink(tempPath);
      } catch (cleanupErr) {
      }
      return;
    }
  }
  /**
   * REAL Analysis Pipeline - Instagram Exploration + GPT-4 Synthesis
   *
   * This is the production method that:
   * 1. Validates Instagram session
   * 2. Launches browser and explores feed/stories
   * 3. Generates newspaper-style analysis via GPT-4
   * 4. Saves and notifies UI
   *
   * Cost: ~$0.08 - $0.12 per session
   */
  async triggerAnalysis(now, store, scheduledTime) {
    const settings = store.get("settings") || {};
    const MINIMUM_POSTS_FOR_ANALYSIS = 5;
    console.log(`\u{1F680} Starting REAL Analysis Pipeline at ${(/* @__PURE__ */ new Date()).toLocaleString()}`);
    const browserManager = BrowserManager.getInstance();
    let context = null;
    try {
      const apiKey = await SecureKeyManager.getInstance().getKey();
      if (!apiKey) {
        throw new Error("NO_API_KEY");
      }
      console.log("\u{1F310} Launching browser (visible mode)...");
      context = await browserManager.launch({ headless: false });
      console.log("\u{1F510} Validating Instagram session...");
      const sessionCheck = await browserManager.validateSession();
      if (!sessionCheck.valid) {
        throw new Error(sessionCheck.reason || "SESSION_EXPIRED");
      }
      console.log("\u{1F4F1} Exploring Instagram feed and stories...");
      const scraper = new InstagramScraper(context, apiKey, settings.usageCap || 10);
      const session2 = await scraper.scrapeFeedAndStories(
        5,
        // 5 minutes of human-paced browsing
        settings.interests || []
      );
      console.log(`\u{1F4CA} Exploration complete: ${session2.feedContent.length} posts, ${session2.storiesContent.length} stories`);
      console.log(`\u{1F4CA} Vision API calls: ${session2.visionApiCalls}, Skipped: ${session2.skippedViewports}`);
      await browserManager.close();
      context = null;
      const totalContent = session2.feedContent.length + session2.storiesContent.length;
      if (totalContent < MINIMUM_POSTS_FOR_ANALYSIS) {
        console.warn(`\u26A0\uFE0F Insufficient content: ${totalContent} items (need ${MINIMUM_POSTS_FOR_ANALYSIS})`);
        throw new Error("INSUFFICIENT_CONTENT");
      }
      console.log("\u{1F916} Generating analysis...");
      const generator = new AnalysisGenerator(apiKey);
      const analysis = await generator.generate(session2, {
        userName: settings.userName || "User",
        interests: settings.interests || [],
        location: settings.location || "",
        scheduledTime
      });
      const recordId = (0, import_uuid.v4)();
      const newRecord = {
        id: recordId,
        data: analysis,
        leadStoryPreview: analysis.sections[0]?.content[0]?.substring(0, 100) + "..." || "No preview available."
      };
      const userDataPath = import_electron4.app.getPath("userData");
      const recordDir = import_path3.default.join(userDataPath, "analysis_records");
      const recordPath = import_path3.default.join(recordDir, `${recordId}.json`);
      const tempPath = import_path3.default.join(recordDir, `${recordId}.tmp`);
      await import_fs3.default.promises.mkdir(recordDir, { recursive: true });
      await import_fs3.default.promises.writeFile(tempPath, JSON.stringify(newRecord, null, 2));
      await import_fs3.default.promises.rename(tempPath, recordPath);
      console.log(`\u{1F4BE} Saved Analysis to disk: ${recordPath}`);
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
      const currentAnalyses = store.get("analyses") || [];
      store.set("analyses", [metadataRecord, ...currentAnalyses]);
      store.set("settings", {
        ...settings,
        lastAnalysisDate: now.toISOString(),
        analysisStatus: "ready"
      });
      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        console.log("\u{1F4E1} Notifying UI: analysis-ready");
        this.mainWindow.webContents.send("analysis-ready", metadataRecord);
      }
      console.log(`\u2705 Analysis Pipeline Complete. Cost: ~$${(session2.visionApiCalls * 0.01 + 0.02).toFixed(2)}`);
    } catch (error) {
      console.error("\u274C Analysis pipeline failed:", error.message);
      if (context) {
        await browserManager.close();
      }
      this.handleAnalysisError(error.message, scheduledTime, store, settings);
    }
  }
  /**
   * Handle errors with user-facing messages and automatic retry scheduling.
   * NO FALLBACK GENERATION - either quality content or transparent failure.
   */
  handleAnalysisError(errorType, scheduledTime, store, settings) {
    const errorMap = {
      "SESSION_EXPIRED": {
        userMessage: "Your Instagram session has expired. Please log in again.",
        canRetry: false
      },
      "CHALLENGE_REQUIRED": {
        userMessage: "Instagram requires verification. Please log in manually.",
        canRetry: false
      },
      "RATE_LIMITED": {
        userMessage: "Instagram is temporarily limiting access. We'll try again later.",
        canRetry: true
      },
      "VISION_RATE_LIMITED": {
        userMessage: "Content analysis service is busy. We'll try again soon.",
        canRetry: true
      },
      "INSUFFICIENT_CONTENT": {
        userMessage: "Not enough content was collected. We'll try again at the next scheduled time.",
        canRetry: true
      },
      "GENERATION_FAILED": {
        userMessage: "Unable to generate your analysis. We'll try again later.",
        canRetry: true
      },
      "NO_API_KEY": {
        userMessage: "API key not found. Please check your settings.",
        canRetry: false
      },
      "NO_CONTEXT": {
        userMessage: "Browser session not available. Please try again.",
        canRetry: true
      },
      "BUDGET_EXCEEDED": {
        userMessage: "Monthly API budget reached. Your next digest will be ready when the new month begins.",
        canRetry: false
      }
    };
    const errorInfo = errorMap[errorType] || {
      userMessage: "Something went wrong. We'll try again later.",
      canRetry: true
    };
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      if (errorType === "SESSION_EXPIRED" || errorType === "CHALLENGE_REQUIRED") {
        this.mainWindow.webContents.send("instagram-session-expired", {});
      } else if (errorType === "RATE_LIMITED") {
        this.mainWindow.webContents.send("instagram-rate-limited", {
          nextRetry: this.calculateNextRetryTime()
        });
      } else if (errorType === "INSUFFICIENT_CONTENT") {
        this.mainWindow.webContents.send("analysis-insufficient-content", {
          collected: 0,
          // We don't have exact count here
          required: 5,
          reason: errorInfo.userMessage,
          nextRetry: this.calculateNextRetryTime()
        });
      } else if (errorType === "BUDGET_EXCEEDED") {
        this.mainWindow.webContents.send("budget-exceeded", {
          message: "Monthly API budget reached. Kowalski will resume next month.",
          canRetry: false
        });
      } else {
        this.mainWindow.webContents.send("analysis-error", {
          message: errorInfo.userMessage,
          canRetry: errorInfo.canRetry,
          nextRetry: errorInfo.canRetry ? this.calculateNextRetryTime() : null
        });
      }
    }
    store.set("settings", {
      ...settings,
      analysisStatus: "idle"
    });
    console.log(`\u{1F4E2} Error notification sent: ${errorInfo.userMessage}`);
  }
  /**
   * Calculate human-readable next retry time.
   */
  calculateNextRetryTime() {
    const retryTime = new Date(Date.now() + 30 * 60 * 1e3);
    return retryTime.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  }
  // ==================== BAKER & DELIVERY BOY METHODS ====================
  /**
   * BAKER: Silently prepares the analysis (scrapes Instagram, generates content).
   * CRUCIAL: This phase must be COMPLETELY SILENT - no notifications!
   */
  async triggerBaker(now, store, scheduledTime) {
    console.log(`\u{1F950} Baker starting at ${(/* @__PURE__ */ new Date()).toLocaleString()} for delivery at ${scheduledTime}`);
    await this.archivePendingAnalysis(store);
    const settings = store.get("settings") || {};
    if (_SchedulerService.USE_REAL_ANALYSIS) {
      await this.triggerBakerReal(now, store, scheduledTime);
    } else {
      await this.triggerBakerSimulation(now, store, scheduledTime);
    }
  }
  /**
   * BAKER (Simulation Mode): Generate mock analysis silently.
   */
  async triggerBakerSimulation(now, store, scheduledTime) {
    const settings = store.get("settings") || {};
    const mockAnalysis = LoremIpsumGenerator.generate({
      userName: settings.userName,
      location: settings.location,
      scheduledTime,
      targetDate: now
    });
    console.log(`\u{1F311} Baker (Simulation) - Background baking started`);
    const newRecord = {
      id: `analysis-sim-${Date.now()}-${Math.floor(Math.random() * 1e3)}`,
      data: mockAnalysis,
      leadStoryPreview: mockAnalysis.sections[0]?.content[0]?.substring(0, 100) + "..." || "No preview available."
    };
    const userDataPath = import_electron4.app.getPath("userData");
    const recordDir = import_path3.default.join(userDataPath, "analysis_records");
    const recordPath = import_path3.default.join(recordDir, `${newRecord.id}.json`);
    const tempPath = import_path3.default.join(recordDir, `${newRecord.id}.tmp`);
    try {
      await import_fs3.default.promises.mkdir(recordDir, { recursive: true });
      await import_fs3.default.promises.writeFile(tempPath, JSON.stringify(newRecord, null, 2));
      await import_fs3.default.promises.rename(tempPath, recordPath);
      console.log(`\u{1F4BE} Baker saved analysis to disk: ${recordPath}`);
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
      const currentAnalyses = store.get("analyses") || [];
      store.set("analyses", [metadataRecord, ...currentAnalyses]);
      store.set("settings", {
        ...store.get("settings"),
        lastBakeDate: now.toISOString(),
        analysisStatus: "pending_delivery"
        // Awaiting delivery time
      });
      console.log(`\u{1F950} Baker complete. Analysis saved, awaiting delivery at ${scheduledTime}`);
    } catch (e) {
      console.error("\u274C Baker failed to save analysis to disk:", e);
      try {
        if (import_fs3.default.existsSync(tempPath)) await import_fs3.default.promises.unlink(tempPath);
      } catch (cleanupErr) {
      }
    }
  }
  /**
   * BAKER (Real Mode): Run Instagram scraping and GPT-4 analysis silently.
   */
  async triggerBakerReal(now, store, scheduledTime) {
    const settings = store.get("settings") || {};
    const MINIMUM_POSTS_FOR_ANALYSIS = 5;
    console.log(`\u{1F950} Baker (Real) - Starting Instagram exploration at ${(/* @__PURE__ */ new Date()).toLocaleString()}`);
    const browserManager = BrowserManager.getInstance();
    let context = null;
    try {
      const apiKey = await SecureKeyManager.getInstance().getKey();
      if (!apiKey) {
        throw new Error("NO_API_KEY");
      }
      console.log("\u{1F310} Baker launching browser (headless)...");
      context = await browserManager.launch({ headless: true });
      console.log("\u{1F510} Baker validating Instagram session...");
      const sessionCheck = await browserManager.validateSession();
      if (!sessionCheck.valid) {
        throw new Error(sessionCheck.reason || "SESSION_EXPIRED");
      }
      console.log("\u{1F4F1} Baker exploring Instagram feed and stories...");
      const scraper = new InstagramScraper(context, apiKey, settings.usageCap || 10);
      const session2 = await scraper.scrapeFeedAndStories(
        5,
        // 5 minutes of human-paced browsing
        settings.interests || []
      );
      console.log(`\u{1F4CA} Baker exploration complete: ${session2.feedContent.length} posts, ${session2.storiesContent.length} stories`);
      await browserManager.close();
      context = null;
      const totalContent = session2.feedContent.length + session2.storiesContent.length;
      if (totalContent < MINIMUM_POSTS_FOR_ANALYSIS) {
        console.warn(`\u26A0\uFE0F Baker: Insufficient content: ${totalContent} items (need ${MINIMUM_POSTS_FOR_ANALYSIS})`);
        throw new Error("INSUFFICIENT_CONTENT");
      }
      console.log("\u{1F916} Baker generating analysis...");
      const generator = new AnalysisGenerator(apiKey);
      const analysis = await generator.generate(session2, {
        userName: settings.userName || "User",
        interests: settings.interests || [],
        location: settings.location || "",
        scheduledTime
      });
      const recordId = (0, import_uuid.v4)();
      const newRecord = {
        id: recordId,
        data: analysis,
        leadStoryPreview: analysis.sections[0]?.content[0]?.substring(0, 100) + "..." || "No preview available."
      };
      const userDataPath = import_electron4.app.getPath("userData");
      const recordDir = import_path3.default.join(userDataPath, "analysis_records");
      const recordPath = import_path3.default.join(recordDir, `${recordId}.json`);
      const tempPath = import_path3.default.join(recordDir, `${recordId}.tmp`);
      await import_fs3.default.promises.mkdir(recordDir, { recursive: true });
      await import_fs3.default.promises.writeFile(tempPath, JSON.stringify(newRecord, null, 2));
      await import_fs3.default.promises.rename(tempPath, recordPath);
      console.log(`\u{1F4BE} Baker saved analysis to disk: ${recordPath}`);
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
      const currentAnalyses = store.get("analyses") || [];
      store.set("analyses", [metadataRecord, ...currentAnalyses]);
      store.set("settings", {
        ...store.get("settings"),
        lastBakeDate: now.toISOString(),
        analysisStatus: "pending_delivery"
      });
      console.log(`\u{1F950} Baker complete. Analysis saved, awaiting delivery at ${scheduledTime}`);
      console.log(`\u2705 Baker Pipeline Complete. Cost: ~$${(session2.visionApiCalls * 0.01 + 0.02).toFixed(2)}`);
    } catch (error) {
      console.error("\u274C Baker pipeline failed:", error.message);
      if (context) {
        await browserManager.close();
      }
      console.log(`\u{1F950} Baker failed silently. No paper to deliver at ${scheduledTime}`);
    }
  }
  /**
   * DELIVERY BOY: Delivers the prepared analysis to the user.
   * This is where we notify the UI - at the user's requested time.
   */
  async triggerDelivery(store, scheduledTime) {
    const settings = store.get("settings") || {};
    const analyses = store.get("analyses") || [];
    const latestAnalysis = analyses[0];
    if (!latestAnalysis) {
      console.warn("\u{1F4EC} Delivery Boy: No analysis found to deliver");
      return;
    }
    store.set("settings", {
      ...settings,
      lastDeliveryDate: (/* @__PURE__ */ new Date()).toISOString(),
      analysisStatus: "ready"
    });
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      console.log(`\u{1F4EC} Delivering analysis (scheduled: ${scheduledTime}, actual: ${(/* @__PURE__ */ new Date()).toLocaleTimeString()})`);
      this.mainWindow.webContents.send("analysis-ready", latestAnalysis);
    }
    console.log(`\u{1F4EC} Delivery complete! User notified.`);
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
  async triggerDebugRun() {
    console.log("\u{1F9EA} Debug Run: Starting Visible Analysis Pipeline");
    const store = await this.getStore();
    const settings = store.get("settings") || {};
    const now = /* @__PURE__ */ new Date();
    const scheduledTime = now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
    const MINIMUM_POSTS_FOR_ANALYSIS = 5;
    const browserManager = BrowserManager.getInstance();
    let context = null;
    try {
      const apiKey = await SecureKeyManager.getInstance().getKey();
      if (!apiKey) {
        console.error("\u{1F9EA} Debug Run: NO API KEY");
        this.mainWindow?.webContents.send("analysis-error", { message: "API key not found." });
        return;
      }
      console.log("\u{1F9EA} Launching browser (VISIBLE mode)...");
      context = await browserManager.launch({ headless: false });
      console.log("\u{1F9EA} Validating Instagram session...");
      const sessionCheck = await browserManager.validateSession();
      if (!sessionCheck.valid) {
        throw new Error(sessionCheck.reason || "SESSION_EXPIRED");
      }
      console.log("\u{1F9EA} Exploring Instagram feed and stories...");
      const scraper = new InstagramScraper(context, apiKey, settings.usageCap || 10, true);
      const session2 = await scraper.scrapeFeedAndStories(
        5,
        // 5 minutes of human-paced browsing
        settings.interests || []
      );
      console.log(`\u{1F9EA} Exploration complete: ${session2.feedContent.length} posts, ${session2.storiesContent.length} stories`);
      await browserManager.close();
      context = null;
      const totalContent = session2.feedContent.length + session2.storiesContent.length;
      if (totalContent < MINIMUM_POSTS_FOR_ANALYSIS) {
        console.warn(`\u{1F9EA} Insufficient content: ${totalContent} items (need ${MINIMUM_POSTS_FOR_ANALYSIS})`);
        throw new Error("INSUFFICIENT_CONTENT");
      }
      console.log("\u{1F9EA} Generating analysis...");
      const generator = new AnalysisGenerator(apiKey);
      const analysis = await generator.generate(session2, {
        userName: settings.userName || "User",
        interests: settings.interests || [],
        location: settings.location || "",
        scheduledTime
      });
      const recordId = (0, import_uuid.v4)();
      const newRecord = {
        id: recordId,
        data: analysis,
        leadStoryPreview: analysis.sections[0]?.content[0]?.substring(0, 100) + "..." || "No preview available."
      };
      const userDataPath = import_electron4.app.getPath("userData");
      const recordDir = import_path3.default.join(userDataPath, "analysis_records");
      const recordPath = import_path3.default.join(recordDir, `${recordId}.json`);
      const tempPath = import_path3.default.join(recordDir, `${recordId}.tmp`);
      await import_fs3.default.promises.mkdir(recordDir, { recursive: true });
      await import_fs3.default.promises.writeFile(tempPath, JSON.stringify(newRecord, null, 2));
      await import_fs3.default.promises.rename(tempPath, recordPath);
      console.log(`\u{1F9EA} Saved analysis to disk: ${recordPath}`);
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
      const currentAnalyses = store.get("analyses") || [];
      store.set("analyses", [metadataRecord, ...currentAnalyses]);
      store.set("settings", {
        ...store.get("settings"),
        lastAnalysisDate: now.toISOString(),
        analysisStatus: "ready"
        // NOT pending_delivery - immediate!
      });
      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        console.log("\u{1F9EA} Notifying UI: analysis-ready");
        this.mainWindow.webContents.send("analysis-ready", metadataRecord);
      }
      console.log(`\u{1F9EA} Debug Run Complete! Cost: ~$${(session2.visionApiCalls * 0.01 + 0.02).toFixed(2)}`);
    } catch (error) {
      console.error("\u{1F9EA} Debug Run Failed:", error.message);
      if (context) {
        await browserManager.close();
      }
      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        this.mainWindow.webContents.send("analysis-error", {
          message: `Debug run failed: ${error.message}`,
          canRetry: true
        });
      }
    }
  }
  // ==================== END DEBUG / TESTING ====================
  /**
   * Switch between simulation mode and real analysis mode.
   * Set USE_REAL_ANALYSIS to true for production.
   */
  static USE_REAL_ANALYSIS = true;
  // LIVE FLIGHT TEST: Real pipeline enabled
};

// src/main/main.ts
var import_module = require("module");
import_electron5.app.commandLine.appendSwitch("ignore-certificate-errors");
import_electron5.app.commandLine.appendSwitch("disable-gpu");
import_electron5.app.commandLine.appendSwitch("disable-software-rasterizer");
import_electron5.app.commandLine.appendSwitch("disable-dev-shm-usage");
import_electron5.app.commandLine.appendSwitch("disable-renderer-backgrounding");
var __filename = (0, import_url.fileURLToPath)(__importMetaUrl);
var __dirname = import_path4.default.dirname(__filename);
var require2 = (0, import_module.createRequire)(__importMetaUrl);
if (!import_electron5.app.getLoginItemSettings().openAtLogin) {
  import_electron5.app.setLoginItemSettings({
    openAtLogin: true,
    openAsHidden: false
    // Optional: could be true if we want silent start
  });
}
if (require2("electron-squirrel-startup")) {
  import_electron5.app.quit();
}
var isQuitting = false;
var mainWindow = null;
var SHARED_PARTITION = "persist:instagram_shared";
var createWindow = () => {
  const width = 1280 + Math.floor(Math.random() * 100);
  const height = 800 + Math.floor(Math.random() * 100);
  mainWindow = new import_electron5.BrowserWindow({
    width,
    height,
    title: "Kowalski",
    backgroundColor: "#F9F8F5",
    // Warm Alabaster for LCD antialiasing
    frame: true,
    // titleBarStyle property removed to use system default
    webPreferences: {
      preload: import_path4.default.join(__dirname, "../preload/preload.cjs"),
      webviewTag: true,
      partition: SHARED_PARTITION
      // Force main window to check this (though webview usually isolates)
    },
    // Set icon for Windows/Linux (and Mac if packaged)
    // Use the processed, standardized icon
    icon: import_path4.default.join(__dirname, "../../build/icon-standard.png")
  });
  if (process.platform === "darwin" && process.env.VITE_DEV_SERVER_URL) {
    const iconPath = import_path4.default.join(__dirname, "../../build/icon-standard.png");
    import_electron5.app.dock?.setIcon(iconPath);
  }
  SchedulerService.getInstance().setMainWindow(mainWindow);
  mainWindow.on("page-title-updated", (e) => {
    e.preventDefault();
  });
  if (process.env.VITE_DEV_SERVER_URL) {
    const url = process.env.VITE_DEV_SERVER_URL;
    console.log("Creating window with URL:", url);
    mainWindow.loadURL(url);
  } else {
    const filePath = import_path4.default.join(__dirname, "../../dist/index.html");
    console.log("Loading file path:", filePath);
    mainWindow.loadFile(filePath);
  }
  mainWindow.webContents.on("did-finish-load", () => {
    console.log("\u2705 did-finish-load: Main window content loaded successfully.");
  });
  mainWindow.webContents.on("did-fail-load", (event, errorCode, errorDescription, validatedURL) => {
    console.error(`\u274C did-fail-load: Error ${errorCode} (${errorDescription}) loading ${validatedURL}`);
  });
  mainWindow.webContents.on("dom-ready", () => {
    console.log("\u2705 dom-ready: DOM is ready.");
  });
  mainWindow.webContents.on("render-process-gone", (event, details) => {
    console.error(`\u{1F480} render-process-gone: Reason: ${details.reason}, Exit Code: ${details.exitCode}`);
  });
  mainWindow.on("close", (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow?.hide();
      return false;
    }
    SchedulerService.getInstance().setMainWindow(null);
  });
};
import_electron5.app.on("ready", () => {
  createWindow();
  console.log("Session persistence enabled.");
  console.log("Session persistence enabled.");
  UsageService.getInstance().initialize();
  SchedulerService.getInstance().initialize();
  import_electron5.globalShortcut.register("CommandOrControl+Shift+H", () => {
    console.log("\u{1F9EA} Testing Shortcut Triggered (Cmd+Shift+H)");
    SchedulerService.getInstance().triggerDebugRun();
  });
  const userDataPath = import_electron5.app.getPath("userData");
  const recordsPath = import_path4.default.join(userDataPath, "analysis_records");
  if (!import_fs4.default.existsSync(recordsPath)) {
    import_fs4.default.mkdirSync(recordsPath, { recursive: true });
    console.log("\u{1F4C2} Created analysis_records directory");
  }
  setupIPCHandlers();
});
import_electron5.app.on("before-quit", () => {
  isQuitting = true;
  import_electron5.globalShortcut.unregisterAll();
  SchedulerService.getInstance().stop();
});
function setupIPCHandlers() {
  import_electron5.ipcMain.handle("reset-session", async () => {
    console.log("\u{1F9F9} Starting session reset...");
    try {
      const userDataPath = import_electron5.app.getPath("userData");
      const sessionPath = import_path4.default.join(userDataPath, "session.json");
      if (import_fs4.default.existsSync(sessionPath)) {
        import_fs4.default.unlinkSync(sessionPath);
        console.log("\u2705 Deleted legacy session.json");
      }
      await BrowserManager.getInstance().clearData();
    } catch (e) {
      console.error("\u26A0\uFE0F Failed to delete session.json:", e);
    }
    try {
      await import_electron5.session.defaultSession.clearStorageData();
      console.log("\u2705 Cleared default session storage");
    } catch (e) {
      console.error("\u26A0\uFE0F Failed to clear default session storage:", e);
    }
    try {
      await import_electron5.session.fromPartition(SHARED_PARTITION).clearStorageData();
      console.log("\u2705 Cleared shared partition storage");
    } catch (e) {
      console.error("\u26A0\uFE0F Failed to clear shared partition storage:", e);
    }
    try {
      const { default: Store } = await import("electron-store");
      const store = new Store();
      store.clear();
      store.delete("analyses");
      store.delete("settings");
      store.delete("activeSchedule");
      console.log("\u2705 Cleared electron-store");
    } catch (e) {
      console.error("\u274C Failed to clear electron-store:", e);
      return false;
    }
    try {
      const userDataPath = import_electron5.app.getPath("userData");
      const recordsPath = import_path4.default.join(userDataPath, "analysis_records");
      if (import_fs4.default.existsSync(recordsPath)) {
        import_fs4.default.rmSync(recordsPath, { recursive: true, force: true });
        console.log("\u2705 Deleted analysis_records folder");
      }
    } catch (e) {
      console.error("\u26A0\uFE0F Failed to delete analysis_records:", e);
    }
    console.log("\u{1F389} Session reset complete");
    return true;
  });
  import_electron5.ipcMain.handle("settings:get", async () => {
    const { default: Store } = await import("electron-store");
    const store = new Store();
    return store.get("settings") || {};
  });
  import_electron5.ipcMain.handle("settings:set", async (_event, newSettings) => {
    const { default: Store } = await import("electron-store");
    const store = new Store();
    store.set("settings", newSettings);
    if (newSettings.hasOnboarded === false) {
      store.delete("activeSchedule");
      console.log("\u{1F9F9} Cleared activeSchedule during reset");
    } else if (newSettings.hasOnboarded === true) {
      const activeSchedule = store.get("activeSchedule");
      if (activeSchedule) {
        const updatedSchedule = {
          ...activeSchedule,
          morningTime: newSettings.morningTime,
          eveningTime: newSettings.eveningTime,
          digestFrequency: newSettings.digestFrequency
        };
        store.set("activeSchedule", updatedSchedule);
        const windows = import_electron5.BrowserWindow.getAllWindows();
        windows.forEach((win) => {
          win.webContents.send("schedule-updated", updatedSchedule);
        });
        console.log("\u{1F525} Hot-Patched Daily Snapshot with new User Settings:", updatedSchedule);
      }
    }
    return true;
  });
  import_electron5.ipcMain.handle("settings:patch", async (_event, updates) => {
    const { default: Store } = await import("electron-store");
    const store = new Store();
    const current = store.get("settings") || {};
    const merged = { ...current, ...updates };
    store.set("settings", merged);
    if ("morningTime" in updates || "eveningTime" in updates || "digestFrequency" in updates) {
      const activeSchedule = store.get("activeSchedule");
      if (activeSchedule) {
        const updatedSchedule = {
          ...activeSchedule,
          morningTime: merged.morningTime,
          eveningTime: merged.eveningTime,
          digestFrequency: merged.digestFrequency
        };
        store.set("activeSchedule", updatedSchedule);
        import_electron5.BrowserWindow.getAllWindows().forEach((win) => {
          win.webContents.send("schedule-updated", updatedSchedule);
        });
        console.log("\u{1F525} Hot-Patched Daily Snapshot (via Patch):", updatedSchedule);
      }
    }
    return merged;
  });
  import_electron5.ipcMain.handle("analyses:get", async () => {
    const { default: Store } = await import("electron-store");
    const store = new Store();
    return store.get("analyses") || [];
  });
  import_electron5.ipcMain.handle("analyses:set", async (_event, analyses) => {
    const { default: Store } = await import("electron-store");
    const store = new Store();
    store.set("analyses", analyses);
    return true;
    return true;
  });
  import_electron5.ipcMain.handle("analyses:get-content", async (_event, id) => {
    try {
      const userDataPath = import_electron5.app.getPath("userData");
      const filePath = import_path4.default.join(userDataPath, "analysis_records", `${id}.json`);
      if (import_fs4.default.existsSync(filePath)) {
        const raw = import_fs4.default.readFileSync(filePath, "utf-8");
        return JSON.parse(raw);
      }
      return null;
    } catch (e) {
      console.error(`\u274C Failed to load analysis content for ${id}:`, e);
      return null;
    }
  });
  import_electron5.ipcMain.handle("settings:get-active-schedule", async () => {
    const { default: Store } = await import("electron-store");
    const store = new Store();
    return store.get("activeSchedule") || null;
  });
  import_electron5.ipcMain.handle("settings:get-wake-time", async () => {
    return SchedulerService.getInstance().getLastWakeTime();
  });
  import_electron5.ipcMain.handle("settings:set-secure", async (_event, { apiKey }) => {
    return SecureKeyManager.getInstance().setKey(apiKey);
  });
  import_electron5.ipcMain.handle("settings:check-key-status", async () => {
    return SecureKeyManager.getInstance().getKeyStatus();
  });
  import_electron5.ipcMain.handle("settings:get-secure", async () => {
    return SecureKeyManager.getInstance().getKey();
  });
  import_electron5.ipcMain.handle("auth:login", async (_event, bounds) => {
    if (!mainWindow) return false;
    return BrowserManager.getInstance().login(bounds, mainWindow);
  });
  import_electron5.ipcMain.handle("test-headless", async () => {
    try {
      console.log("\u{1F916} Starting BrowserManager (Persistent)...");
      const manager = BrowserManager.getInstance();
      const context = await manager.launch({ headless: false });
      const page = await context.newPage();
      console.log("\u{1F30D} Navigating to Instagram...");
      await page.goto("https://www.instagram.com/");
      try {
        await page.waitForSelector('svg[aria-label="Home"]', { timeout: 1e4 });
        console.log("\u2705 INSTAGRAM LOGIN CONFIRMED");
        return "Success: Logged in automatically (Persistent Profile)";
      } catch (e) {
        console.log("\u274C NOT LOGGED IN / SELECTOR TIMEOUT");
        return "Failed: Still on login page. Please log in manually to save territory.";
      }
    } catch (error) {
      console.error("CRITICAL PW ERROR:", error);
      return `Error: ${error.message}`;
    }
  });
  import_electron5.ipcMain.handle("clear-instagram-session", async () => {
    console.log("\u{1F9F9} Clearing Instagram Session only...");
    try {
      const userDataPath = import_electron5.app.getPath("userData");
      const sessionPath = import_path4.default.join(userDataPath, "session.json");
      if (import_fs4.default.existsSync(sessionPath)) {
        import_fs4.default.unlinkSync(sessionPath);
      }
      await import_electron5.session.fromPartition(SHARED_PARTITION).clearStorageData();
      await BrowserManager.getInstance().clearData();
      return true;
    } catch (e) {
      console.error("Clear Instagram Session Error:", e);
      return false;
    }
  });
  import_electron5.ipcMain.handle("check-instagram-session", async () => {
    try {
      const userDataPath = import_electron5.app.getPath("userData");
      const persistentContextPath = import_path4.default.join(userDataPath, "kowalski_browser");
      if (!import_fs4.default.existsSync(persistentContextPath)) {
        return { isActive: false, reason: "no_profile" };
      }
      const cookiesDbPath = import_path4.default.join(persistentContextPath, "Default", "Cookies");
      if (!import_fs4.default.existsSync(cookiesDbPath)) {
        return { isActive: false, reason: "no_cookies_db" };
      }
      try {
        const tempDbPath = import_path4.default.join(userDataPath, "cookies_check_temp.db");
        console.log("\u{1F50D} Session check: Copying cookies from", cookiesDbPath, "to", tempDbPath);
        import_fs4.default.copyFileSync(cookiesDbPath, tempDbPath);
        const Database = require2("better-sqlite3");
        const db = new Database(tempDbPath, { readonly: true });
        const stmt = db.prepare(`
          SELECT name, host_key, value, encrypted_value, expires_utc
          FROM cookies
          WHERE host_key LIKE '%instagram.com' AND name = 'sessionid'
        `);
        const rows = stmt.all();
        console.log("\u{1F50D} Session check: Query returned", rows.length, "rows");
        if (rows.length > 0) {
          console.log("\u{1F50D} Session check: Cookie data:", JSON.stringify(
            rows[0],
            (key, value) => key === "encrypted_value" ? `[Buffer ${value?.length || 0} bytes]` : value
          ));
        }
        db.close();
        try {
          import_fs4.default.unlinkSync(tempDbPath);
        } catch {
        }
        if (rows.length > 0) {
          const cookie = rows[0];
          if (cookie.expires_utc > 0) {
            const chromiumEpochDiff = 116444736e8;
            const expiresMs = (cookie.expires_utc - chromiumEpochDiff) / 1e3;
            console.log("\u{1F50D} Session check: expires_utc =", cookie.expires_utc, "-> expiresMs =", expiresMs, "-> Date.now() =", Date.now());
            if (Date.now() > expiresMs) {
              console.log("\u274C Session check: sessionid cookie EXPIRED");
              return { isActive: false, reason: "session_expired" };
            }
          }
          console.log("\u2705 Session check: sessionid cookie FOUND (valid)");
          return { isActive: true, reason: "sessionid_cookie_valid" };
        } else {
          console.log("\u274C Session check: No sessionid cookie found");
          return { isActive: false, reason: "no_sessionid_cookie" };
        }
      } catch (dbErr) {
        console.error("\u26A0\uFE0F Failed to read cookies database:", dbErr);
        return { isActive: false, reason: "db_read_error" };
      }
    } catch (e) {
      console.error("\u274C Error checking Instagram session:", e);
      return { isActive: false, reason: "error" };
    }
  });
}
import_electron5.app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    import_electron5.app.quit();
  }
});
import_electron5.app.on("activate", () => {
  if (import_electron5.BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  } else {
    mainWindow?.show();
  }
});
//# sourceMappingURL=main.cjs.map
