
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
var import_electron6 = require("electron");
var import_path5 = __toESM(require("path"), 1);
var import_url = require("url");
var import_fs5 = __toESM(require("fs"), 1);

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
var GPU_PROFILES = [
  { vendor: "Intel Inc.", renderer: "Intel Iris OpenGL Engine" },
  { vendor: "Intel Inc.", renderer: "Intel HD Graphics 630" },
  { vendor: "Intel Inc.", renderer: "Intel UHD Graphics 620" },
  { vendor: "Apple Inc.", renderer: "Apple M1" },
  { vendor: "Apple Inc.", renderer: "Apple M2" },
  { vendor: "Google Inc. (Apple)", renderer: "ANGLE (Apple, Apple M1, OpenGL 4.1)" }
];
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
      } else {
        extraArgs.push("--window-size=1080,1920");
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
      const selectedGpu = GPU_PROFILES[Math.floor(Math.random() * GPU_PROFILES.length)];
      console.log(`\u{1F3AE} WebGL Fingerprint: ${selectedGpu.vendor} / ${selectedGpu.renderer}`);
      await this.browserContext.addInitScript((gpu) => {
        const getParameterProto = WebGLRenderingContext.prototype.getParameter;
        WebGLRenderingContext.prototype.getParameter = function(parameter) {
          if (parameter === 37445) {
            return gpu.vendor;
          }
          if (parameter === 37446) {
            return gpu.renderer;
          }
          return getParameterProto.call(this, parameter);
        };
        const getParameterProto2 = WebGL2RenderingContext.prototype.getParameter;
        WebGL2RenderingContext.prototype.getParameter = function(parameter) {
          if (parameter === 37445) {
            return gpu.vendor;
          }
          if (parameter === 37446) {
            return gpu.renderer;
          }
          return getParameterProto2.call(this, parameter);
        };
      }, selectedGpu);
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
  // $2.50 / 1M tokens
  CACHED_INPUT_TOKEN: 125e-8,
  // $1.25 / 1M tokens
  OUTPUT_TOKEN: 1e-5
  // $10.00 / 1M tokens
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
var import_electron5 = require("electron");
var import_fs4 = __toESM(require("fs"), 1);
var import_path4 = __toESM(require("path"), 1);
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
    const fs8 = fcurves[0].points[0], fe = fcurves[len - 1].points[fcurves[len - 1].points.length - 1], bs = bcurves[len - 1].points[bcurves[len - 1].points.length - 1], be = bcurves[0].points[0], ls = utils.makeline(bs, fs8), le = utils.makeline(fe, be), segments = [ls].concat(fcurves).concat([le]).concat(bcurves);
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
  // Session-level entropy (randomized once per GhostMouse instance)
  // This ensures timing patterns vary across sessions, defeating pattern analysis
  sessionTimingMultiplier;
  sessionJitterMultiplier;
  // Session-level hesitation probability (3-7% per session, not fixed 5%)
  sessionHesitationProb;
  constructor(page) {
    this.page = page;
    this.sessionTimingMultiplier = 0.7 + Math.random() * 0.6;
    this.sessionJitterMultiplier = 0.6 + Math.random() * 0.8;
    this.sessionHesitationProb = 0.03 + Math.random() * 0.04;
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
    const movementDistance = Math.hypot(
      target.x - this.currentPosition.x,
      target.y - this.currentPosition.y
    );
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
    const effectiveJitter = jitterAmount * this.sessionJitterMultiplier;
    for (let i = 0; i < points.length; i++) {
      const jitteredPoint = this.addJitter(points[i], effectiveJitter);
      await this.page.mouse.move(jitteredPoint.x, jitteredPoint.y);
      await this.updateVisibleCursor(jitteredPoint.x, jitteredPoint.y);
      const baseMin = 12 * this.sessionTimingMultiplier;
      const baseMax = 45 * this.sessionTimingMultiplier;
      await this.microDelay(baseMin, baseMax);
      if (i > 0 && i < points.length - 1 && Math.random() < this.sessionHesitationProb) {
        await this.microDelay(80 * this.sessionTimingMultiplier, 200 * this.sessionTimingMultiplier);
      }
    }
    if (Math.random() < overshootProbability) {
      await this.overshootAndCorrect(target, movementDistance);
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
   * Add random micro-jitter to a point with layered noise.
   * Humans have small involuntary hand movements at multiple frequencies.
   *
   * Layer 1: Base jitter (primary hand tremor)
   * Layer 2: Micro-tremor (higher frequency, smaller amplitude neurological noise)
   *
   * This two-layer approach defeats bot detection that looks for
   * geometrically perfect Bezier curves.
   */
  addJitter(point, amount) {
    const baseJitter = {
      x: (Math.random() - 0.5) * amount,
      y: (Math.random() - 0.5) * amount
    };
    const tremor = {
      x: (Math.random() - 0.5) * (amount * 0.3),
      y: (Math.random() - 0.5) * (amount * 0.3)
    };
    return {
      x: point.x + baseJitter.x + tremor.x,
      y: point.y + baseJitter.y + tremor.y
    };
  }
  /**
   * Simulate human overshoot: move past target, then correct.
   * This happens when moving quickly - we slightly overshoot, then adjust.
   *
   * Physics-based: Faster movements = more overshoot (human momentum).
   *
   * IMPORTANT: Correction movement uses a micro-curve, NOT a straight line.
   * Straight-line correction is a bot signal (humans don't move perfectly).
   *
   * @param target - The intended target point
   * @param movementDistance - Distance traveled to reach target (affects overshoot magnitude)
   */
  async overshootAndCorrect(target, movementDistance = 100) {
    const baseOvershoot = Math.min(30, Math.max(5, movementDistance * 0.08));
    const overshootAmount = baseOvershoot * (0.5 + Math.random());
    const overshootAngle = Math.random() * Math.PI * 2;
    const overshoot = {
      x: target.x + Math.cos(overshootAngle) * overshootAmount,
      y: target.y + Math.sin(overshootAngle) * overshootAmount
    };
    await this.page.mouse.move(overshoot.x, overshoot.y);
    await this.updateVisibleCursor(overshoot.x, overshoot.y);
    await this.microDelay(50, 180);
    const midpoint = {
      x: (overshoot.x + target.x) / 2 + (Math.random() - 0.5) * 8,
      y: (overshoot.y + target.y) / 2 + (Math.random() - 0.5) * 8
    };
    await this.page.mouse.move(midpoint.x, midpoint.y);
    await this.updateVisibleCursor(midpoint.x, midpoint.y);
    await this.microDelay(10, 30);
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
   * Hover over a target for a duration without clicking.
   * Used to verify element actionability before clicking (e.g., carousel buttons).
   *
   * @param target - Point to hover over
   * @param durationMs - How long to hover (in milliseconds)
   */
  async hover(target, durationMs = 1e3) {
    await this.moveTo(target);
    const jitterDuration = durationMs * 0.8;
    const jitterInterval = 150;
    let elapsed = 0;
    while (elapsed < jitterDuration) {
      await this.microDelay(jitterInterval * 0.8, jitterInterval * 1.2);
      const microMove = {
        x: target.x + (Math.random() - 0.5) * 3,
        y: target.y + (Math.random() - 0.5) * 3
      };
      await this.page.mouse.move(microMove.x, microMove.y);
      elapsed += jitterInterval;
    }
    await this.page.mouse.move(target.x, target.y);
    await this.microDelay(durationMs * 0.15, durationMs * 0.25);
  }
  /**
   * Hover over an element with randomized offset within its bounds.
   *
   * @param boundingBox - Element's bounding box
   * @param durationMs - How long to hover
   * @param centerBias - How much to favor center (0.0 = uniform, 1.0 = always center). Randomized 0.2-0.4 if not specified.
   */
  async hoverElement(boundingBox, durationMs = 1e3, centerBias) {
    const effectiveBias = centerBias ?? this.getRandomizedCenterBias();
    const offsetX = this.gaussianRandom(effectiveBias) * boundingBox.width;
    const offsetY = this.gaussianRandom(effectiveBias) * boundingBox.height;
    let hoverPoint = {
      x: boundingBox.x + offsetX,
      y: boundingBox.y + offsetY
    };
    hoverPoint.x = Math.max(
      boundingBox.x + 5,
      Math.min(hoverPoint.x, boundingBox.x + boundingBox.width - 5)
    );
    hoverPoint.y = Math.max(
      boundingBox.y + 5,
      Math.min(hoverPoint.y, boundingBox.y + boundingBox.height - 5)
    );
    await this.hover(hoverPoint, durationMs);
  }
  /**
   * Click an element with randomized offset within its bounds.
   * Humans NEVER click exactly in the center of buttons.
   *
   * @param boundingBox - Element's bounding box
   * @param centerBias - How much to favor center (0.0 = uniform, 1.0 = always center). Randomized 0.2-0.4 if not specified.
   */
  async clickElement(boundingBox, centerBias) {
    const effectiveBias = centerBias ?? this.getRandomizedCenterBias();
    const offsetX = this.gaussianRandom(effectiveBias) * boundingBox.width;
    const offsetY = this.gaussianRandom(effectiveBias) * boundingBox.height;
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
   * Get a randomized center bias value (0.2-0.4 range).
   * Avoids using fixed 0.3 which creates detectable patterns.
   */
  getRandomizedCenterBias() {
    return 0.2 + Math.random() * 0.2;
  }
  /**
   * Generate a random number between 0 and 1 with gaussian-like distribution.
   * centerBias: 0.0 = uniform distribution, 1.0 = always 0.5 (center)
   *
   * This mimics human click patterns: usually near center, but with natural variation.
   */
  gaussianRandom(centerBias) {
    const effectiveBias = centerBias ?? this.getRandomizedCenterBias();
    const u1 = Math.random();
    const u2 = Math.random();
    const gaussian = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    const normalized = gaussian / 6 + 0.5;
    const clamped = Math.max(0.1, Math.min(0.9, normalized));
    const uniform = 0.1 + Math.random() * 0.8;
    return clamped * effectiveBias + uniform * (1 - effectiveBias);
  }
  /**
   * Small random delay for human-like timing variation.
   * Applies session-level timing multiplier for cross-session variation,
   * defeating pattern analysis that looks for consistent timing signatures.
   */
  microDelay(min2, max2) {
    const baseDelay = min2 + Math.random() * (max2 - min2);
    const sessionAdjustedDelay = baseDelay * this.sessionTimingMultiplier;
    return new Promise((resolve) => setTimeout(resolve, sessionAdjustedDelay));
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
  // =========================================================================
  // Gaze-Lag Execution System (Human-like "Look, then Move")
  // =========================================================================
  /**
   * Randomized value within a range - NO fixed values allowed.
   */
  randomInRange(min2, max2) {
    return min2 + Math.random() * (max2 - min2);
  }
  /**
   * Get element-specific hover duration based on role.
   * Different element types require different amounts of visual processing.
   *
   * @param role - The accessibility role of the element
   * @returns Randomized hover duration in milliseconds
   */
  getHoverDurationForRole(role) {
    const roleLower = role.toLowerCase();
    const ranges = {
      button: [50, 150],
      // Large, easy targets
      link: [150, 300],
      // Precision required
      textbox: [200, 400],
      // Cognitive preparation for typing
      searchbox: [200, 400],
      // Same as textbox
      combobox: [180, 350],
      // Dropdown interaction
      image: [100, 250],
      // Visual inspection
      img: [100, 250],
      // Same as image
      menuitem: [120, 280],
      // Menu navigation
      tab: [100, 220],
      // Tab switching
      checkbox: [80, 180],
      // Quick toggle
      radio: [80, 180]
      // Quick selection
    };
    const [min2, max2] = ranges[roleLower] || [100, 300];
    return this.randomInRange(min2, max2) * this.sessionTimingMultiplier;
  }
  /**
   * Human-like click with element-specific timing.
   * Varies pre-click hover based on element role.
   *
   * @param target - Point to click
   * @param role - Accessibility role for timing adjustment
   */
  async clickWithRole(target, role = "button") {
    await this.moveTo(target);
    const hoverDuration = this.getHoverDurationForRole(role);
    await new Promise((r) => setTimeout(r, hoverDuration));
    await this.page.mouse.down();
    await this.microDelay(50, 150);
    await this.page.mouse.up();
    await this.microDelay(200, 500);
  }
  /**
   * Click an element with gaze-aware role-specific timing.
   *
   * @param boundingBox - Element's bounding box
   * @param role - Accessibility role for timing adjustment
   * @param centerBias - How much to favor center (0.0 = uniform, 1.0 = always center). Randomized 0.2-0.4 if not specified.
   */
  async clickElementWithRole(boundingBox, role = "button", centerBias) {
    const effectiveBias = centerBias ?? this.getRandomizedCenterBias();
    const offsetX = this.gaussianRandom(effectiveBias) * boundingBox.width;
    const offsetY = this.gaussianRandom(effectiveBias) * boundingBox.height;
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
    await this.clickWithRole(clickPoint, role);
  }
  /**
   * Get the session timing multiplier (for external coordination).
   */
  getSessionTimingMultiplier() {
    return this.sessionTimingMultiplier;
  }
};

// src/main/services/HumanScroll.ts
var HumanScroll = class {
  page;
  // Session-level timing multiplier for cross-session variance
  sessionTimingMultiplier;
  constructor(page) {
    this.page = page;
    this.sessionTimingMultiplier = 0.7 + Math.random() * 0.6;
  }
  /**
   * Randomized value within a range - NO fixed values allowed.
   */
  randomInRange(min2, max2) {
    return min2 + Math.random() * (max2 - min2);
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
      const scrollNeeded = elementCenter - viewportCenter;
      if (Math.abs(scrollNeeded) > 50) {
        await this.preciseScroll(scrollNeeded);
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
   * Scroll to center an element with verification and retry.
   * Ensures the post is actually centered after scrolling.
   *
   * This is the recommended method for post-centered browsing.
   *
   * @param backendNodeId - CDP backend node ID from accessibility tree
   * @param maxRetries - Maximum centering attempts (default: 2)
   * @returns Object with success status and final offset from center
   */
  async scrollToElementCentered(backendNodeId, maxRetries = 2) {
    const TOLERANCE = 80 + Math.random() * 40;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      let cdpSession = null;
      try {
        cdpSession = await this.page.context().newCDPSession(this.page);
        const box = await this.getNodeBoundingBoxByCDP(cdpSession, backendNodeId);
        if (!box) {
          return { success: false, finalOffset: Infinity };
        }
        const viewportHeight = await this.cdpEvaluate("window.innerHeight");
        if (!viewportHeight) {
          return { success: false, finalOffset: Infinity };
        }
        const elementCenterY = box.y + box.height / 2;
        const viewportCenterY = viewportHeight / 2;
        const offset = elementCenterY - viewportCenterY;
        if (Math.abs(offset) <= TOLERANCE) {
          console.log(`  \u2713 Post centered (offset: ${Math.round(offset)}px, attempt: ${attempt})`);
          return { success: true, finalOffset: offset };
        }
        console.log(`  \u{1F4CD} Centering post (offset: ${Math.round(offset)}px, attempt: ${attempt + 1}/${maxRetries + 1})`);
        await this.preciseScroll(offset);
        const basePause = 150 + Math.random() * 100;
        await new Promise((r) => setTimeout(r, basePause * this.sessionTimingMultiplier));
      } finally {
        if (cdpSession) {
          await cdpSession.detach().catch(() => {
          });
        }
      }
    }
    const finalOffset = await this.checkElementCenterOffset(backendNodeId);
    const success = Math.abs(finalOffset) <= TOLERANCE;
    if (!success) {
      console.log(`  \u26A0\uFE0F Centering incomplete after ${maxRetries + 1} attempts (final offset: ${Math.round(finalOffset)}px)`);
    }
    return { success, finalOffset };
  }
  /**
   * Check how far an element is from viewport center.
   * Helper method for scroll verification.
   */
  async checkElementCenterOffset(backendNodeId) {
    let cdpSession = null;
    try {
      cdpSession = await this.page.context().newCDPSession(this.page);
      const box = await this.getNodeBoundingBoxByCDP(cdpSession, backendNodeId);
      if (!box) return Infinity;
      const viewportHeight = await this.cdpEvaluate("window.innerHeight");
      if (!viewportHeight) return Infinity;
      const elementCenterY = box.y + box.height / 2;
      const viewportCenterY = viewportHeight / 2;
      return elementCenterY - viewportCenterY;
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
   * Precise scroll for centering operations.
   * Unlike scroll(), this does NOT add variability - we need exact positioning.
   * Still uses easing for human-like feel.
   *
   * @param distance - Exact pixels to scroll (positive = down, negative = up)
   */
  async preciseScroll(distance) {
    const steps = 12 + Math.floor(Math.random() * 6);
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
      const baseDelay = 10 + Math.random() * 30;
      await new Promise((resolve) => setTimeout(resolve, baseDelay * this.sessionTimingMultiplier));
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
  // =========================================================================
  // Intent-Driven Scrolling (Content-Aware)
  // =========================================================================
  /**
   * Get scroll parameters based on content type.
   * Text-heavy content = smaller scrolls, longer pauses
   * Image-heavy content = larger scrolls, shorter pauses
   *
   * All values are randomized within ranges - NO fixed values.
   */
  getScrollParamsForContent(contentType) {
    const params = {
      "text-heavy": {
        distance: [200, 300],
        // Smaller scrolls for reading
        pause: [3e3, 6e3]
        // Longer pauses to read
      },
      "image-heavy": {
        distance: [500, 700],
        // Larger scrolls for visual scanning
        pause: [1500, 3e3]
        // Shorter pauses (quick visual scan)
      },
      "mixed": {
        distance: [350, 450],
        // Balanced scrolls
        pause: [2e3, 5e3]
        // Moderate pauses
      }
    };
    const { distance, pause } = params[contentType];
    return {
      distance: this.randomInRange(distance[0], distance[1]) * this.sessionTimingMultiplier,
      pauseMs: [
        pause[0] * this.sessionTimingMultiplier,
        pause[1] * this.sessionTimingMultiplier
      ]
    };
  }
  /**
   * Intent-driven scroll that adapts to content density.
   *
   * This is the "smart" scroll that:
   * 1. Analyzes the current viewport content via A11y tree
   * 2. Adjusts scroll distance based on content type
   * 3. Adjusts reading pause based on content density
   * 4. AUDIT: Logs scroll delta and verifies scroll actually occurred
   *
   * @param navigator - A11yNavigator instance for content analysis
   * @param config - Optional scroll configuration overrides
   */
  async scrollWithIntent(navigator, config = {}) {
    const contentDensity = await navigator.analyzeContentDensity();
    const contentType = contentDensity.type;
    const adaptiveParams = this.getScrollParamsForContent(contentType);
    const {
      baseDistance = adaptiveParams.distance,
      variability = 0.3,
      microAdjustProb = 0.25,
      readingPauseMs = adaptiveParams.pauseMs
    } = config;
    const variation = 1 + (Math.random() - 0.5) * 2 * variability;
    const targetDistance = Math.round(baseDistance * variation);
    const scrollYBefore = await this.getScrollPosition();
    await this.smoothScrollWithEasing(targetDistance);
    const scrollYAfter = await this.getScrollPosition();
    const actualDelta = scrollYAfter - scrollYBefore;
    console.log(`  \u{1F4DC} SCROLL AUDIT: Target=${targetDistance}px, Actual Delta=${actualDelta}px, ContentType=${contentType}`);
    console.log(`  \u{1F4CA} Session Multiplier: ${this.sessionTimingMultiplier.toFixed(2)}x, Pause Range: [${Math.round(readingPauseMs[0])}-${Math.round(readingPauseMs[1])}]ms`);
    let scrollFailed = false;
    if (actualDelta === 0 && targetDistance > 50) {
      console.log("  \u26A0\uFE0F CRITICAL WARNING: Scroll Failed - Page may be stuck or reached bottom!");
      console.log(`  \u26A0\uFE0F ScrollY unchanged at ${scrollYBefore}px after attempting ${targetDistance}px scroll`);
      scrollFailed = true;
    } else if (Math.abs(actualDelta) < targetDistance * 0.3) {
      console.log(`  \u26A0\uFE0F WARNING: Scroll undershot significantly (${Math.round(actualDelta / targetDistance * 100)}% of target)`);
    }
    const adjustedMicroProb = contentType === "text-heavy" ? microAdjustProb * 1.3 : contentType === "image-heavy" ? microAdjustProb * 0.7 : microAdjustProb;
    if (Math.random() < adjustedMicroProb) {
      await this.microAdjust();
    }
    const pauseDuration = this.randomInRange(readingPauseMs[0], readingPauseMs[1]);
    console.log(`  \u23F1\uFE0F Reading pause: ${Math.round(pauseDuration)}ms`);
    await new Promise((resolve) => setTimeout(resolve, pauseDuration));
    return {
      contentType,
      scrollDistance: targetDistance,
      actualDelta,
      scrollFailed
    };
  }
  /**
   * Multiple intent-driven scrolls with cumulative content analysis.
   * Useful for browsing sessions where content type may change.
   *
   * @param navigator - A11yNavigator instance for content analysis
   * @param count - Number of scrolls to perform
   * @param config - Optional scroll configuration overrides
   */
  async scrollMultipleWithIntent(navigator, count, config = {}) {
    const contentTypes = [];
    let totalDistance = 0;
    for (let i = 0; i < count; i++) {
      const result = await this.scrollWithIntent(navigator, config);
      contentTypes.push(result.contentType);
      totalDistance += result.scrollDistance;
    }
    return {
      scrollCount: count,
      contentTypes,
      totalDistance
    };
  }
  /**
   * Get the session timing multiplier (for external coordination).
   */
  getSessionTimingMultiplier() {
    return this.sessionTimingMultiplier;
  }
};

// src/main/services/A11yNavigator.ts
var A11yNavigator = class {
  page;
  // Session-level timing multiplier for cross-session variance in typing delays
  sessionTimingMultiplier;
  // === CDP Session Management ===
  // Reduces session churn by reusing sessions within a short window
  managedSession = null;
  sessionLastUsed = 0;
  SESSION_TIMEOUT_MS = 5e3;
  // Auto-detach after 5s idle
  constructor(page) {
    this.page = page;
    this.sessionTimingMultiplier = 0.7 + Math.random() * 0.6;
  }
  // =========================================================================
  // CDP Session Management (Reduce Session Churn)
  // =========================================================================
  /**
   * Execute an operation with a managed CDP session.
   * Sessions are reused within a short window to reduce overhead and staleness.
   *
   * @param operation - Async function that uses the CDP session
   * @returns Result of the operation
   */
  async withSession(operation) {
    const now = Date.now();
    if (this.managedSession && now - this.sessionLastUsed > this.SESSION_TIMEOUT_MS) {
      await this.forceReleaseSession();
    }
    if (!this.managedSession) {
      this.managedSession = await this.page.context().newCDPSession(this.page);
    }
    this.sessionLastUsed = now;
    try {
      return await operation(this.managedSession);
    } catch (error) {
      await this.forceReleaseSession();
      throw error;
    }
  }
  /**
   * Force-release the managed session (e.g., on navigation or error).
   */
  async forceReleaseSession() {
    if (this.managedSession) {
      await this.managedSession.detach().catch(() => {
      });
      this.managedSession = null;
    }
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
    if (url.includes("/p/") || url.includes("/reel/")) {
      return "post_detail";
    }
    const profileMatch = url.match(/instagram\.com\/([^\/\?]+)\/?$/);
    if (profileMatch && !["explore", "reels", "direct"].includes(profileMatch[1])) {
      return "profile";
    }
    if (url === "https://www.instagram.com/" || url.includes("instagram.com/?")) {
      return "feed";
    }
    return "unknown";
  }
  // ============================================================================
  // Deep Engagement Detection
  // ============================================================================
  /**
   * Detect current engagement level for LLM context.
   * Determines if we're in feed, post modal, comments, or profile view.
   * Cost: $0 (URL analysis + optional accessibility tree check)
   */
  async detectEngagementLevel() {
    const url = this.page.url();
    if (url.includes("/p/") || url.includes("/reel/")) {
      const postMatch = url.match(/\/(p|reel)\/([A-Za-z0-9_-]+)/);
      const postUrl = postMatch ? `https://www.instagram.com/p/${postMatch[2]}/` : void 0;
      const tree = await this.buildAccessibilityTree();
      if (tree) {
        const hasDialog = Array.from(tree.nodeMap.values()).some(
          (node) => node.role?.value?.toLowerCase() === "dialog"
        );
        return {
          level: "post_modal",
          postUrl
        };
      }
      return { level: "post_modal", postUrl };
    }
    const profileMatch = url.match(/instagram\.com\/([^\/\?]+)\/?$/);
    if (profileMatch && !["explore", "reels", "direct", "p"].includes(profileMatch[1])) {
      return {
        level: "profile",
        username: profileMatch[1]
      };
    }
    return { level: "feed" };
  }
  /**
   * Extract engagement metrics from visible post elements.
   * Looks for like counts, comment counts, carousel indicators.
   * Cost: $0 (accessibility tree analysis)
   */
  async extractPostEngagementMetrics() {
    const tree = await this.buildAccessibilityTree();
    if (!tree) return { hasVideo: false };
    let likeCount;
    let commentCount;
    let hasVideo = false;
    let username;
    for (const node of tree.nodeMap.values()) {
      if (node.ignored) continue;
      const name = node.name?.value || "";
      const role = node.role?.value?.toLowerCase() || "";
      if (/^[\d,]+\s*likes?$/i.test(name)) {
        likeCount = name;
      }
      if (/view\s*(all\s*)?\d+\s*comments?/i.test(name) || /^\d+\s*comments?$/i.test(name)) {
        commentCount = name;
      }
      if (role === "video" || /video|play|pause|mute|unmute/i.test(name)) {
        hasVideo = true;
      }
      if (role === "link" && /^@?\w+$/.test(name) && name.length > 2 && name.length < 30) {
        if (!username || name.length < username.length) {
          username = name.replace(/^@/, "");
        }
      }
    }
    const carouselIndicator = await this.getCarouselSlideIndicator();
    const carouselState = carouselIndicator ? {
      currentSlide: carouselIndicator.current,
      totalSlides: carouselIndicator.total
    } : void 0;
    return {
      likeCount,
      commentCount,
      carouselState,
      hasVideo,
      username
    };
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
      for (const node of allStoryNodes) {
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
   * Find Instagram post elements (<article>) in the viewport.
   * Used for post-centered scrolling - each screenshot should contain ONE post.
   *
   * Returns posts sorted by vertical position (top to bottom).
   * Includes backendNodeId for CDP scroll-to-element operations.
   *
   * @returns Array of InteractiveElements representing posts with bounding boxes
   */
  async findPostElements() {
    const posts = [];
    const nodes = await this.getAccessibilityTree();
    const articleNodes = nodes.filter((node) => {
      if (node.ignored) return false;
      const role = node.role?.value?.toLowerCase();
      return role === "article";
    });
    if (articleNodes.length === 0) {
      return posts;
    }
    let cdpSession = null;
    try {
      cdpSession = await this.page.context().newCDPSession(this.page);
      const viewport = await this.getViewportInfo();
      for (const node of articleNodes) {
        if (!node.backendDOMNodeId) continue;
        const box = await this.getNodeBoundingBox(cdpSession, node.backendDOMNodeId);
        if (!box || box.width <= 0 || box.height <= 0) continue;
        if (box.width < viewport.width * 0.05 || box.height < viewport.height * 0.05) continue;
        const isNearViewport = box.y < viewport.height * 2 && box.y + box.height > -viewport.height;
        if (!isNearViewport) continue;
        posts.push({
          role: "article",
          name: node.name?.value || "Post",
          selector: "",
          // No selector - we use coordinates only
          boundingBox: box,
          backendNodeId: node.backendDOMNodeId
        });
      }
    } catch (error) {
      console.warn("Failed to get post bounding boxes:", error);
    } finally {
      if (cdpSession) {
        await cdpSession.detach().catch(() => {
        });
      }
    }
    return posts.sort((a, b) => (a.boundingBox?.y || 0) - (b.boundingBox?.y || 0));
  }
  /**
   * Find post elements with bounding boxes in a SINGLE CDP session.
   * Prevents staleness between tree query and box retrieval.
   *
   * This is the recommended method for post-centered scrolling.
   * Unlike findPostElements(), this uses withSession() to ensure
   * all operations happen atomically.
   *
   * @returns Posts with fresh bounding boxes from same CDP session
   */
  async findPostElementsAtomic() {
    return this.withSession(async (cdpSession) => {
      const posts = [];
      const response = await cdpSession.send("Accessibility.getFullAXTree");
      const nodes = response.nodes || [];
      const articleNodes = nodes.filter((node) => {
        if (node.ignored) return false;
        const role = node.role?.value?.toLowerCase();
        return role === "article";
      });
      if (articleNodes.length === 0) {
        return posts;
      }
      const viewportResult = await cdpSession.send("Runtime.evaluate", {
        expression: `JSON.stringify({
                    height: window.innerHeight,
                    scrollY: window.scrollY
                })`,
        returnByValue: true
      });
      const viewport = JSON.parse(viewportResult.result.value);
      for (const node of articleNodes) {
        if (!node.backendDOMNodeId) continue;
        try {
          const { model } = await cdpSession.send("DOM.getBoxModel", {
            backendNodeId: node.backendDOMNodeId
          });
          if (!model?.content) continue;
          const [x1, y1, x2, , , y3] = model.content;
          const box = {
            x: x1,
            y: y1,
            width: x2 - x1,
            height: y3 - y1
          };
          if (box.width < viewport.width * 0.05 || box.height < viewport.height * 0.05) continue;
          const isNearViewport = box.y < viewport.height * 2 && box.y + box.height > -viewport.height;
          if (!isNearViewport) continue;
          posts.push({
            role: "article",
            name: node.name?.value || "Post",
            selector: "",
            boundingBox: box,
            backendNodeId: node.backendDOMNodeId
          });
        } catch {
          continue;
        }
      }
      return posts.sort((a, b) => (a.boundingBox?.y || 0) - (b.boundingBox?.y || 0));
    });
  }
  /**
   * Find the primary post content area for capture.
   * Returns the bounding box of the main article element.
   * Works for both feed view and post detail modal.
   *
   * In modal view: returns the single main article
   * In feed view: returns the article closest to viewport center
   */
  async findPostContentBounds() {
    const articles = await this.findPostElementsAtomic();
    if (articles.length === 0) return null;
    const viewport = await this.getViewportInfo();
    const viewportCenter = viewport.height / 2;
    let bestArticle = articles[0];
    let bestDistance = Infinity;
    for (const article of articles) {
      if (!article.boundingBox) continue;
      const articleCenter = article.boundingBox.y + article.boundingBox.height / 2;
      const distance = Math.abs(articleCenter - viewportCenter);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestArticle = article;
      }
    }
    return bestArticle.boundingBox || null;
  }
  /**
   * Find carousel "Next" button for multi-image posts.
   * Instagram uses a button with name containing "Next" or arrow patterns.
   *
   * @returns InteractiveElement with bounding box, or null if not found
   */
  // =========================================================================
  // DEPRECATED: Hardcoded button finders removed
  // Use getAllInteractiveElements() with pattern matching instead.
  // Example:
  //   const elements = await navigator.getAllInteractiveElements();
  //   const nextBtn = elements.find(el => /next|skip|forward/i.test(el.name));
  // =========================================================================
  /**
   * Find ALL buttons on the current page.
   * This mimics what a screen reader can highlight - every interactive button.
   * Useful for discovery and debugging.
   *
   * @returns Array of InteractiveElements with bounding boxes
   */
  async findAllButtons() {
    return this.withSession(async (cdpSession) => {
      const buttons = [];
      const viewport = await this.getViewportInfo();
      const response = await cdpSession.send("Accessibility.getFullAXTree");
      const nodes = response.nodes || [];
      const buttonNodes = nodes.filter((node) => {
        if (node.ignored) return false;
        const role = node.role?.value?.toLowerCase();
        return role === "button";
      });
      for (const node of buttonNodes) {
        if (!node.backendDOMNodeId) continue;
        try {
          const box = await this.getNodeBoundingBox(cdpSession, node.backendDOMNodeId);
          if (!box) continue;
          if (box.width > viewport.width * 5e-3 && box.height > viewport.height * 5e-3) {
            buttons.push({
              role: "button",
              name: node.name?.value || "[unnamed]",
              selector: "",
              boundingBox: box,
              backendNodeId: node.backendDOMNodeId
            });
          }
        } catch {
          continue;
        }
      }
      return buttons;
    });
  }
  // =========================================================================
  // SCREEN READER APPROACH - Generic Element Discovery
  // =========================================================================
  // -------------------------------------------------------------------------
  // Hierarchy-Aware Navigation (Screen Reader-Like Tree Traversal)
  // -------------------------------------------------------------------------
  /**
   * Interactive roles that screen readers expose for navigation.
   */
  INTERACTIVE_ROLES = [
    "button",
    "link",
    "menuitem",
    "tab",
    "checkbox",
    "radio",
    "switch",
    "textbox",
    "searchbox",
    "slider",
    "img"
    // Include images (may be clickable)
  ];
  /**
   * Build a navigable tree from the flat CDP accessibility response.
   * Establishes parent-child relationships for hierarchy queries.
   *
   * This is the foundation for screen reader-like navigation:
   * - Enables "find button inside THIS container" queries
   * - Supports ancestor lookups (e.g., "what article contains this button?")
   * - Provides O(1) lookup by nodeId or backendDOMNodeId
   *
   * @returns AXTree with nodeMap and backendMap for O(1) lookups, or null if failed
   */
  async buildAccessibilityTree() {
    return this.withSession(async (cdpSession) => {
      const response = await cdpSession.send("Accessibility.getFullAXTree");
      const nodes = response.nodes || [];
      if (nodes.length === 0) return null;
      const nodeMap = /* @__PURE__ */ new Map();
      const backendMap = /* @__PURE__ */ new Map();
      for (const node of nodes) {
        const treeNode = { ...node, depth: 0 };
        nodeMap.set(node.nodeId, treeNode);
        if (node.backendDOMNodeId) {
          backendMap.set(node.backendDOMNodeId, treeNode);
        }
      }
      for (const node of nodes) {
        const parentNode = nodeMap.get(node.nodeId);
        if (!parentNode || !node.childIds) continue;
        for (const childId of node.childIds) {
          const childNode = nodeMap.get(childId);
          if (childNode) {
            childNode.parentId = node.nodeId;
            childNode.depth = parentNode.depth + 1;
          }
        }
      }
      const root = nodeMap.get(nodes[0].nodeId);
      if (!root) return null;
      return { root, nodeMap, backendMap };
    });
  }
  // =========================================================================
  // Tree Summary for LLM Dynamic Reasoning
  // =========================================================================
  /**
   * Build a rich accessibility tree summary for LLM reasoning.
   * Does NOT interpret the tree - just provides structured context.
   * The LLM infers what page it's on and what's safe to do.
   */
  async buildTreeSummaryForLLM() {
    const tree = await this.buildAccessibilityTree();
    if (!tree) return { containers: [], inputs: [], landmarks: [] };
    const containers = [];
    const inputs = [];
    const landmarkSet = /* @__PURE__ */ new Set();
    for (const node of tree.nodeMap.values()) {
      if (node.ignored) continue;
      const role = node.role?.value?.toLowerCase() || "";
      const name = node.name?.value || "";
      if ([
        "region",
        "dialog",
        "main",
        "navigation",
        "complementary",
        "alertdialog",
        "group",
        "list",
        "form",
        "toolbar",
        "tablist"
      ].includes(role)) {
        containers.push({
          role,
          name: name || "[unnamed]",
          childCount: node.childIds?.length || 0
        });
      }
      if (["textbox", "searchbox", "input", "combobox", "slider", "spinbutton"].includes(role)) {
        const parentChain = this.getParentContainerChain(tree, node);
        inputs.push({
          role,
          name: name || "[unnamed input]",
          parentContainers: parentChain
        });
      }
      if (name && name.length > 2 && name.length < 120) {
        landmarkSet.add(name);
      }
    }
    return {
      containers,
      inputs,
      landmarks: Array.from(landmarkSet)
    };
  }
  /**
   * Get the chain of parent container names for an element.
   * Used to give input fields context (e.g., "Search" inside "Direct Messages").
   */
  getParentContainerChain(tree, node) {
    const chain = [];
    let current = node.parentId ? tree.nodeMap.get(node.parentId) : null;
    while (current && chain.length < 10) {
      const name = current.name?.value;
      const role = current.role?.value?.toLowerCase();
      if (name && name.length > 2 && ["region", "dialog", "main", "navigation", "complementary", "alertdialog", "article"].includes(role || "")) {
        chain.push(name);
      }
      current = current.parentId ? tree.nodeMap.get(current.parentId) : null;
    }
    return chain;
  }
  /**
   * Check if a node is a descendant of another node.
   * Walks up the tree from child to ancestor.
   *
   * @param tree - The accessibility tree
   * @param childNodeId - The potential descendant's nodeId
   * @param ancestorNodeId - The potential ancestor's nodeId
   * @returns true if childNodeId is a descendant of ancestorNodeId
   */
  isDescendantOf(tree, childNodeId, ancestorNodeId) {
    let current = tree.nodeMap.get(childNodeId);
    while (current?.parentId) {
      if (current.parentId === ancestorNodeId) return true;
      current = tree.nodeMap.get(current.parentId);
    }
    return false;
  }
  /**
   * Find ancestor matching one of the given roles.
   * Useful for finding "the article containing this button".
   *
   * @param tree - The accessibility tree
   * @param nodeId - Starting node's nodeId
   * @param roles - Array of roles to search for (e.g., ['article', 'region', 'dialog'])
   * @returns First ancestor matching a role, or null
   */
  findAncestorByRole(tree, nodeId, roles) {
    let current = tree.nodeMap.get(nodeId);
    while (current?.parentId) {
      current = tree.nodeMap.get(current.parentId);
      if (current) {
        const role = current.role?.value?.toLowerCase();
        if (role && roles.includes(role)) return current;
      }
    }
    return null;
  }
  /**
   * Get all interactive descendants of a container.
   * Returns elements that are hierarchically inside the container.
   *
   * This is the key method for scoped searches:
   * - "Find all buttons inside this carousel"
   * - "Find all links inside this article"
   *
   * @param tree - The accessibility tree
   * @param ancestorNodeId - The container's nodeId
   * @param roleFilter - Optional array of roles to filter (e.g., ['button', 'link'])
   * @returns Array of InteractiveElements that are descendants of the container
   */
  async getDescendantElements(tree, ancestorNodeId, roleFilter) {
    const elements = [];
    const ancestorNode = tree.nodeMap.get(ancestorNodeId);
    if (!ancestorNode) return elements;
    const descendantNodeIds = [];
    const collectDescendants = (nodeId) => {
      const node = tree.nodeMap.get(nodeId);
      if (!node || node.ignored) return;
      const role = node.role?.value?.toLowerCase();
      if (role && this.INTERACTIVE_ROLES.includes(role)) {
        if (!roleFilter || roleFilter.includes(role)) {
          descendantNodeIds.push(nodeId);
        }
      }
      if (node.childIds) {
        for (const childId of node.childIds) {
          collectDescendants(childId);
        }
      }
    };
    if (ancestorNode.childIds) {
      for (const childId of ancestorNode.childIds) {
        collectDescendants(childId);
      }
    }
    return this.withSession(async (cdpSession) => {
      for (const nodeId of descendantNodeIds) {
        const node = tree.nodeMap.get(nodeId);
        if (!node?.backendDOMNodeId) continue;
        try {
          const box = await this.getNodeBoundingBox(cdpSession, node.backendDOMNodeId);
          if (box && box.width > 0 && box.height > 0) {
            elements.push({
              role: node.role?.value?.toLowerCase() || "unknown",
              name: node.name?.value || "[unnamed]",
              selector: "",
              boundingBox: box,
              backendNodeId: node.backendDOMNodeId
            });
          }
        } catch {
        }
      }
      return elements;
    });
  }
  /**
   * Find the semantic container (article, region, dialog, figure) for an element.
   * Essential for scoped searches - "find buttons inside THIS post".
   *
   * @param backendNodeId - The backendDOMNodeId of the element
   * @returns Container info with nodeId and role, or null if no container found
   */
  async findContainerForElement(backendNodeId) {
    const tree = await this.buildAccessibilityTree();
    if (!tree) return null;
    const elementNode = tree.backendMap.get(backendNodeId);
    if (!elementNode) return null;
    const containerRoles = ["article", "region", "dialog", "main", "navigation", "figure"];
    const container = this.findAncestorByRole(tree, elementNode.nodeId, containerRoles);
    if (!container) return null;
    return {
      containerNodeId: container.nodeId,
      containerRole: container.role?.value || "unknown",
      backendNodeId: container.backendDOMNodeId || 0
    };
  }
  /**
   * Find the story viewer container (dialog/modal).
   * Stories open in a modal overlay with specific characteristics.
   *
   * @returns Container nodeId if found, or null
   */
  async findStoryViewerContainer() {
    const tree = await this.buildAccessibilityTree();
    if (!tree) return null;
    for (const [nodeId, node] of tree.nodeMap) {
      const role = node.role?.value?.toLowerCase();
      if (role === "dialog" || role === "region") {
        const descendants = await this.getDescendantElements(tree, nodeId, ["button"]);
        const hasStoryNav = descendants.some(
          (d) => /close|next|previous|pause|story/i.test(d.name)
        );
        if (hasStoryNav && descendants.length >= 2) {
          console.log(`  \u{1F3AF} Found story container: ${role} with ${descendants.length} buttons`);
          return nodeId;
        }
      }
    }
    return null;
  }
  // -------------------------------------------------------------------------
  // End Hierarchy-Aware Navigation
  // -------------------------------------------------------------------------
  /**
   * Get ALL interactive elements on the page with full semantic information.
   * This is how screen readers discover clickable content.
   *
   * NO hardcoded patterns - returns raw A11y tree data.
   * Let the caller decide what to interact with.
   *
   * @returns Array of all interactive elements with semantic info
   */
  async getAllInteractiveElements() {
    return this.withSession(async (cdpSession) => {
      const response = await cdpSession.send("Accessibility.getFullAXTree");
      const nodes = response.nodes || [];
      const elements = [];
      for (const node of nodes) {
        if (node.ignored) continue;
        const role = node.role?.value?.toLowerCase();
        if (!this.INTERACTIVE_ROLES.includes(role || "")) continue;
        const state = this.extractElementState(node);
        if (!node.backendDOMNodeId) continue;
        try {
          const box = await this.getNodeBoundingBox(cdpSession, node.backendDOMNodeId);
          if (!box || box.width < 1 || box.height < 1) continue;
          elements.push({
            role: role || "unknown",
            name: node.name?.value || "[unnamed]",
            description: node.description?.value || "",
            value: node.value?.value || "",
            state,
            selector: "",
            boundingBox: box,
            backendNodeId: node.backendDOMNodeId
          });
        } catch {
          continue;
        }
      }
      return elements;
    });
  }
  /**
   * Extract state information from a node's properties.
   * Screen readers use this to determine element state.
   */
  extractElementState(node) {
    const state = {};
    if (!node.properties) return state;
    for (const prop of node.properties) {
      const key = prop.name.toLowerCase();
      const val = prop.value?.value;
      if (key === "disabled") state.disabled = Boolean(val);
      if (key === "checked") state.checked = Boolean(val);
      if (key === "selected") state.selected = Boolean(val);
      if (key === "expanded") state.expanded = Boolean(val);
      if (key === "pressed") state.pressed = Boolean(val);
    }
    return state;
  }
  /**
   * Filter elements by role.
   * Example: getAllButtons() is just filterByRole('button')
   */
  async filterByRole(role) {
    const all = await this.getAllInteractiveElements();
    return all.filter((el) => el.role === role);
  }
  /**
   * Filter elements matching a name pattern.
   * Example: Find "Next" or "Skip" buttons
   */
  async filterByNamePattern(pattern) {
    const all = await this.getAllInteractiveElements();
    return all.filter((el) => pattern.test(el.name));
  }
  /**
   * Filter elements in a specific screen region.
   * Example: Find buttons in the right half of the screen
   */
  async filterByRegion(region) {
    const all = await this.getAllInteractiveElements();
    return all.filter((el) => {
      if (!el.boundingBox) return false;
      const box = el.boundingBox;
      return box.x >= region.x && box.x + box.width <= region.x + region.width && box.y >= region.y && box.y + box.height <= region.y + region.height;
    });
  }
  /**
   * Dump all interactive elements for debugging.
   * Use this to learn what elements Instagram actually has.
   */
  async dumpInteractiveElements() {
    const elements = await this.getAllInteractiveElements();
    console.log("\n=== A11y Element Discovery (Screen Reader Mode) ===");
    console.log(`Found ${elements.length} interactive elements:
`);
    for (const el of elements) {
      const box = el.boundingBox;
      const stateStr = Object.entries(el.state || {}).filter(([, v]) => v).map(([k]) => k).join(", ");
      console.log(
        `  [${el.role}] "${el.name}"` + (el.description ? ` - ${el.description}` : "") + (stateStr ? ` (${stateStr})` : "") + ` at (${box?.x?.toFixed(0)}, ${box?.y?.toFixed(0)}) ${box?.width?.toFixed(0)}x${box?.height?.toFixed(0)}`
      );
    }
    console.log("===================================================\n");
  }
  // Legacy alias for backward compatibility
  async findAllInteractiveElements() {
    return this.getAllInteractiveElements();
  }
  // Legacy alias for backward compatibility
  async dumpAllButtonsForDiscovery() {
    return this.dumpInteractiveElements();
  }
  /**
   * Detect if current viewport contains video content.
   * Uses STRICT criteria to avoid false positives on stories.
   *
   * Video detection signals (must have at least one):
   * 1. Mute/unmute/volume button - indicates audio track (videos only)
   * 2. Video element role - actual video player element
   * 3. Scrubber/timeline WITH duration display - video player controls
   *
   * Explicitly IGNORING (present in all stories, causes false positives):
   * - Progress bars (story progress indicator)
   * - Generic pause button (tap-to-pause on stories)
   *
   * @returns Object with isVideo and hasAudio flags
   */
  async detectVideoContent() {
    const elements = await this.getAllInteractiveElements();
    const hasMuteControl = elements.some(
      (el) => el.role === "button" && /mute|unmute|volume/i.test(el.name)
    );
    const hasVideoElement = elements.some(
      (el) => el.role === "video" || el.role === "application" && /video|player/i.test(el.name)
    );
    const hasScrubber = elements.some(
      (el) => /scrub|timeline|slider|seek/i.test(el.name) || el.role === "slider" && /video|time/i.test(el.name)
    );
    const hasDuration = elements.some(
      (el) => /\d+:\d+/.test(el.name) || /duration|remaining/i.test(el.name)
    );
    const isVideo = hasMuteControl || hasVideoElement || hasScrubber && hasDuration;
    if (isVideo) {
      console.log(`  \u{1F3AC} Video detected: mute=${hasMuteControl}, videoEl=${hasVideoElement}, scrubber=${hasScrubber}`);
    }
    return {
      isVideo,
      hasAudio: hasMuteControl
    };
  }
  /**
   * Get the first element from a list of nodes that has a valid bounding box.
   * Used by button-finding methods to return actionable elements.
   *
   * @param nodes - Array of CDPAXNodes to check
   * @returns InteractiveElement with bounding box, or null if none found
   */
  async getFirstElementWithBoundingBox(nodes) {
    let cdpSession = null;
    try {
      cdpSession = await this.page.context().newCDPSession(this.page);
      for (const node of nodes) {
        if (!node.backendDOMNodeId) continue;
        const box = await this.getNodeBoundingBox(cdpSession, node.backendDOMNodeId);
        if (box && box.width > 0 && box.height > 0) {
          return {
            role: node.role?.value || "unknown",
            name: node.name?.value || "[unnamed]",
            selector: "",
            boundingBox: box,
            backendNodeId: node.backendDOMNodeId
          };
        }
      }
      return null;
    } finally {
      if (cdpSession) {
        await cdpSession.detach().catch(() => {
        });
      }
    }
  }
  /**
   * Find Story Highlights on a profile page.
   * Highlights appear as circular buttons below the bio, similar to stories.
   *
   * @returns Array of InteractiveElements with bounding boxes
   */
  async findHighlights() {
    const highlights = [];
    const nodes = await this.getAccessibilityTree();
    const highlightPattern = /highlight/i;
    const highlightNodes = nodes.filter((node) => {
      if (node.ignored) return false;
      const role = node.role?.value?.toLowerCase();
      const name = (node.name?.value || "").toLowerCase();
      if (role !== "button" && role !== "link") return false;
      return highlightPattern.test(name) || // Also match buttons in the highlight tray area (usually short names)
      role === "button" && name.length > 0 && name.length < 30 && !name.includes("follow");
    });
    if (highlightNodes.length === 0) {
      return highlights;
    }
    const viewport = await this.getViewportInfo();
    const minHighlight = viewport.width * 0.015;
    const maxHighlight = viewport.width * 0.15;
    let cdpSession = null;
    try {
      cdpSession = await this.page.context().newCDPSession(this.page);
      for (const node of highlightNodes) {
        if (!node.backendDOMNodeId) continue;
        const box = await this.getNodeBoundingBox(cdpSession, node.backendDOMNodeId);
        if (box && box.width > 0 && box.height > 0) {
          if (box.width >= minHighlight && box.width <= maxHighlight && box.height >= minHighlight && box.height <= maxHighlight) {
            highlights.push({
              role: node.role?.value || "button",
              name: node.name?.value || "Highlight",
              selector: "",
              boundingBox: box
            });
          }
        }
      }
    } finally {
      if (cdpSession) {
        await cdpSession.detach().catch(() => {
        });
      }
    }
    return highlights;
  }
  /**
   * Get the current carousel slide indicator (e.g., "Slide 2 of 5").
   * Used to verify carousel navigation actually occurred.
   *
   * @returns Object with current slide number, total slides, and raw text, or null if not found
   */
  async getCarouselSlideIndicator() {
    const nodes = await this.getAccessibilityTree();
    const slidePatterns = [
      /slide\s*(\d+)\s*of\s*(\d+)/i,
      /photo\s*(\d+)\s*of\s*(\d+)/i,
      /(\d+)\s*of\s*(\d+)/i,
      /(\d+)\/(\d+)/
      // 2/5 format
    ];
    for (const node of nodes) {
      if (node.ignored) continue;
      const name = node.name?.value || "";
      for (const pattern of slidePatterns) {
        const match = name.match(pattern);
        if (match) {
          return {
            current: parseInt(match[1], 10),
            total: parseInt(match[2], 10),
            raw: name
          };
        }
      }
    }
    return null;
  }
  // =========================================================================
  // SPATIAL DISCOVERY: Position-based Element Finding
  // =========================================================================
  /**
   * Find a button positioned on the edge of content using spatial reasoning.
   * Uses tiered strategy: 1) Image-relative search, 2) Viewport-center fallback
   *
   * For carousel navigation:
   * - Button on RIGHT edge = likely "next"
   * - Button on LEFT edge = likely "previous"
   *
   * Key insight: Carousel buttons are ALWAYS in the content area (center of screen),
   * NEVER in sidebars. This allows safe fallback when image detection fails.
   *
   * NEW: Supports hierarchy-first search when containerNodeId provided.
   * Falls back to spatial search for backward compatibility.
   *
   * @param side - 'right' for next, 'left' for previous
   * @param options - Optional EdgeButtonOptions with contentArea and/or containerNodeId
   * @returns Button element positioned on the specified side, or null
   */
  async findEdgeButton(side, options) {
    const viewport = await this.getViewportInfo();
    if (options?.containerNodeId) {
      const tree = await this.buildAccessibilityTree();
      if (tree) {
        const descendants = await this.getDescendantElements(
          tree,
          options.containerNodeId,
          ["button", "link"]
        );
        if (descendants.length > 0) {
          const centerX = viewport.width / 2;
          const sideButtons = descendants.filter((btn) => {
            const box = btn.boundingBox;
            const btnCenterX = box.x + box.width / 2;
            return side === "right" ? btnCenterX > centerX : btnCenterX < centerX;
          });
          if (sideButtons.length > 0) {
            const inStory = this.isInStoryViewer();
            sideButtons.sort((a, b) => {
              const aX = a.boundingBox.x;
              const bX = b.boundingBox.x;
              return inStory ? side === "right" ? aX - bX : bX - aX : side === "right" ? bX - aX : aX - bX;
            });
            console.log(`  \u{1F3AF} Hierarchy: found ${sideButtons.length} ${side} button(s) in container, using "${sideButtons[0].name}"`);
            return sideButtons[0];
          }
        }
        console.log(`  \u{1F3AF} Hierarchy: no ${side} buttons in container, falling back to spatial`);
      }
    }
    const elements = await this.getAllInteractiveElements();
    const clickables = elements.filter(
      (el) => (el.role === "button" || el.role === "link") && el.boundingBox && el.boundingBox.width > 0
    );
    if (clickables.length === 0) return null;
    const contentArea = options?.contentArea;
    if (contentArea) {
      const edgeMargin = contentArea.width * 0.3;
      const overflow = contentArea.width * 0.05;
      if (side === "right") {
        const rightZoneStart = contentArea.x + contentArea.width - edgeMargin;
        const rightZoneEnd = contentArea.x + contentArea.width + overflow;
        const rightButtons = clickables.filter((btn) => {
          const box = btn.boundingBox;
          const buttonCenterX = box.x + box.width / 2;
          const buttonCenterY = box.y + box.height / 2;
          const inRightZone = buttonCenterX >= rightZoneStart && buttonCenterX <= rightZoneEnd;
          const inVerticalBounds = buttonCenterY >= contentArea.y - 20 && buttonCenterY <= contentArea.y + contentArea.height + 20;
          return inRightZone && inVerticalBounds;
        }).sort((a, b) => b.boundingBox.x - a.boundingBox.x);
        if (rightButtons.length > 0) {
          console.log(`  \u{1F3AF} Spatial (image): found ${rightButtons.length} button(s), using "${rightButtons[0].name}" at x=${rightButtons[0].boundingBox.x}`);
          return rightButtons[0];
        }
      } else {
        const leftZoneStart = contentArea.x - overflow;
        const leftZoneEnd = contentArea.x + edgeMargin;
        const leftButtons = clickables.filter((btn) => {
          const box = btn.boundingBox;
          const buttonCenterX = box.x + box.width / 2;
          const buttonCenterY = box.y + box.height / 2;
          const inLeftZone = buttonCenterX >= leftZoneStart && buttonCenterX <= leftZoneEnd;
          const inVerticalBounds = buttonCenterY >= contentArea.y - 20 && buttonCenterY <= contentArea.y + contentArea.height + 20;
          return inLeftZone && inVerticalBounds;
        }).sort((a, b) => a.boundingBox.x - b.boundingBox.x);
        if (leftButtons.length > 0) {
          console.log(`  \u{1F3AF} Spatial (image): found ${leftButtons.length} button(s), using "${leftButtons[0].name}" at x=${leftButtons[0].boundingBox.x}`);
          return leftButtons[0];
        }
      }
    }
    const viewportCenterX = viewport.width / 2;
    const inStoryViewer = this.isInStoryViewer();
    if (inStoryViewer) {
      const storyZoneStart = viewport.width * 0.28;
      const storyZoneEnd = viewport.width * 0.72;
      if (side === "right") {
        const rightButtons = clickables.filter((btn) => {
          const box = btn.boundingBox;
          const buttonCenterX = box.x + box.width / 2;
          return buttonCenterX > viewportCenterX && buttonCenterX < storyZoneEnd;
        }).sort((a, b) => a.boundingBox.x - b.boundingBox.x);
        if (rightButtons.length > 0) {
          console.log(`  \u{1F3AF} Spatial (story): found ${rightButtons.length} button(s), using "${rightButtons[0].name}" at x=${Math.round(rightButtons[0].boundingBox.x)}`);
          return rightButtons[0];
        }
      } else {
        const leftButtons = clickables.filter((btn) => {
          const box = btn.boundingBox;
          const buttonCenterX = box.x + box.width / 2;
          return buttonCenterX > storyZoneStart && buttonCenterX < viewportCenterX;
        }).sort((a, b) => b.boundingBox.x - a.boundingBox.x);
        if (leftButtons.length > 0) {
          console.log(`  \u{1F3AF} Spatial (story): found ${leftButtons.length} button(s), using "${leftButtons[0].name}" at x=${Math.round(leftButtons[0].boundingBox.x)}`);
          return leftButtons[0];
        }
      }
      console.log(`  \u{1F3AF} Spatial (story): no button found in ${side} zone`);
      return null;
    }
    const safeZoneStart = viewport.width * 0.15;
    const safeZoneEnd = viewport.width * 0.85;
    if (side === "right") {
      const rightButtons = clickables.filter((btn) => {
        const box = btn.boundingBox;
        const buttonCenterX = box.x + box.width / 2;
        return buttonCenterX > viewportCenterX && buttonCenterX < safeZoneEnd;
      }).sort((a, b) => b.boundingBox.x - a.boundingBox.x);
      if (rightButtons.length > 0) {
        console.log(`  \u{1F3AF} Spatial (fallback): found ${rightButtons.length} button(s), using "${rightButtons[0].name}" at x=${Math.round(rightButtons[0].boundingBox.x)}`);
        return rightButtons[0];
      }
    } else {
      const leftButtons = clickables.filter((btn) => {
        const box = btn.boundingBox;
        const buttonCenterX = box.x + box.width / 2;
        return buttonCenterX > safeZoneStart && buttonCenterX < viewportCenterX;
      }).sort((a, b) => a.boundingBox.x - b.boundingBox.x);
      if (leftButtons.length > 0) {
        console.log(`  \u{1F3AF} Spatial (fallback): found ${leftButtons.length} button(s), using "${leftButtons[0].name}" at x=${Math.round(leftButtons[0].boundingBox.x)}`);
        return leftButtons[0];
      }
    }
    console.log(`  \u{1F3AF} Spatial: no button found in ${side} zone`);
    return null;
  }
  /**
   * Find navigation controls for carousel/gallery using spatial reasoning.
   * Returns next/previous buttons based on position, not text patterns.
   *
   * Uses expanded image detection (img, figure, graphic roles) and passes
   * contentArea to findEdgeButton which will use fallback if needed.
   */
  async findCarouselControls() {
    const elements = await this.getAllInteractiveElements();
    const imageElements = elements.filter(
      (el) => (el.role === "img" || el.role === "figure" || el.role === "graphic") && el.boundingBox && el.boundingBox.width > 100
    );
    let mainImage;
    let maxArea = 0;
    for (const img of imageElements) {
      const area = (img.boundingBox?.width || 0) * (img.boundingBox?.height || 0);
      if (area > maxArea) {
        maxArea = area;
        mainImage = img;
      }
    }
    const contentArea = mainImage?.boundingBox;
    let containerNodeId;
    if (mainImage?.backendNodeId) {
      const tree = await this.buildAccessibilityTree();
      if (tree) {
        const imageNode = tree.backendMap.get(mainImage.backendNodeId);
        if (imageNode) {
          const container = this.findAncestorByRole(tree, imageNode.nodeId, ["article", "figure", "region"]);
          containerNodeId = container?.nodeId;
          if (containerNodeId) {
            console.log(`  \u{1F3AF} Found carousel container: ${container?.role?.value}`);
          }
        }
      }
    }
    if (contentArea) {
      console.log(`  \u{1F3AF} Using image bounds: ${Math.round(contentArea.width)}x${Math.round(contentArea.height)} at (${Math.round(contentArea.x)}, ${Math.round(contentArea.y)})`);
    } else {
      console.log(`  \u{1F3AF} No image found, using viewport-center fallback`);
    }
    const options = { contentArea, containerNodeId };
    return {
      next: await this.findEdgeButton("right", options),
      previous: await this.findEdgeButton("left", options)
    };
  }
  /**
   * Find post caption text in the accessibility tree.
   * Instagram captions appear as StaticText nodes below the post content.
   *
   * @returns Caption text or null if not found
   */
  async findPostCaption() {
    const nodes = await this.getAccessibilityTree();
    const captionCandidates = [];
    for (const node of nodes) {
      if (node.ignored) continue;
      const role = node.role?.value?.toLowerCase();
      const name = node.name?.value || "";
      if (name.length < 5) continue;
      if (role === "button" || role === "link" || role === "textbox") continue;
      if (/^(home|search|explore|reels|messages|notifications|create|profile)$/i.test(name)) continue;
      if (name.includes("#") || name.includes("@")) {
        captionCandidates.unshift(name);
      } else if (name.length > 5) {
        captionCandidates.push(name);
      }
    }
    return captionCandidates.length > 0 ? captionCandidates[0] : null;
  }
  /**
   * Find the "more" button for truncated captions.
   * Instagram shows "more" or "... more" for long captions.
   *
   * @returns InteractiveElement with bounding box, or null if not found
   */
  async findMoreButton() {
    const nodes = await this.getAccessibilityTree();
    const morePatterns = [
      /^more$/i,
      /^…\s*more$/i,
      /^\.{3}\s*more$/i,
      /^see\s*more$/i
    ];
    for (const pattern of morePatterns) {
      const matches = this.findMatchingNodes(nodes, "button", pattern);
      if (matches.length > 0) {
        const match = matches[0];
        if (match.backendDOMNodeId) {
          let cdpSession = null;
          try {
            cdpSession = await this.page.context().newCDPSession(this.page);
            const box = await this.getNodeBoundingBox(cdpSession, match.backendDOMNodeId);
            if (box && box.width > 0 && box.height > 0) {
              return {
                role: match.role?.value || "button",
                name: match.name?.value || "more",
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
    for (const pattern of morePatterns) {
      const matches = this.findMatchingNodes(nodes, "link", pattern);
      if (matches.length > 0) {
        const match = matches[0];
        if (match.backendDOMNodeId) {
          let cdpSession = null;
          try {
            cdpSession = await this.page.context().newCDPSession(this.page);
            const box = await this.getNodeBoundingBox(cdpSession, match.backendDOMNodeId);
            if (box && box.width > 0 && box.height > 0) {
              return {
                role: match.role?.value || "link",
                name: match.name?.value || "more",
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
      return this.INTERACTIVE_ROLES.includes(nodeRole || "") && pattern.test(nodeName);
    });
    if (matches.length === 0) {
      return elements;
    }
    let cdpSession = null;
    try {
      cdpSession = await this.page.context().newCDPSession(this.page);
      for (const node of matches.slice(0, 100)) {
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
   * Detect if the current viewport shows an ad/sponsored content.
   * Uses accessibility tree to find ad indicators without Vision API.
   *
   * Detection signals:
   * - "Sponsored" label (below username in post header)
   * - "Learn more" button (common in ads)
   * - "Shop now" button
   * - "Paid partnership" text
   *
   * @returns Object with isAd flag and reason
   */
  async detectAdContent() {
    const nodes = await this.getAccessibilityTree();
    for (const node of nodes) {
      if (node.ignored) continue;
      const nodeName = node.name?.value?.toLowerCase() || "";
      const nodeRole = node.role?.value?.toLowerCase() || "";
      if (nodeName === "sponsored") {
        return { isAd: true, reason: "Sponsored label detected" };
      }
      if ((nodeRole === "button" || nodeRole === "link") && nodeName.includes("learn more")) {
        return { isAd: true, reason: "Learn more button detected" };
      }
      if ((nodeRole === "button" || nodeRole === "link") && nodeName.includes("shop now")) {
        return { isAd: true, reason: "Shop now button detected" };
      }
      if (nodeName.includes("paid partnership")) {
        return { isAd: true, reason: "Paid partnership detected" };
      }
    }
    return { isAd: false };
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
      for (const node of linkNodes.slice(0, 50)) {
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
        const vowels = "aeiouAEIOU";
        const punctuation = `.,!?;:'"()[]{}`;
        for (const char of text) {
          await cdpSession.send("Input.insertText", { text: char });
          let baseDelay = (50 + Math.random() * 100) * this.sessionTimingMultiplier;
          if (vowels.includes(char)) {
            baseDelay *= 0.8 + Math.random() * 0.2;
          } else if (punctuation.includes(char)) {
            baseDelay *= 1.2 + Math.random() * 0.3;
          } else if (char === " ") {
            baseDelay *= 0.6 + Math.random() * 0.2;
          }
          await new Promise((r) => setTimeout(r, baseDelay));
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
  // =========================================================================
  // Human Search Method (Type-Wait-Click)
  // =========================================================================
  /**
   * Human-like delay with random variation.
   */
  humanDelay(min2, max2) {
    const delay = min2 + Math.random() * (max2 - min2);
    return new Promise((resolve) => setTimeout(resolve, delay));
  }
  /**
   * Human-like search: Type term, wait for dropdown, click matching result.
   *
   * This mimics how a human searches:
   * 1. Type the search term (character by character)
   * 2. Wait for autocomplete dropdown to appear (2.5-3.5 seconds)
   * 3. Scan dropdown for matching result in accessibility tree
   * 4. Click the result using GhostMouse (or press Enter as fallback)
   *
   * This is MORE human-like than typing + pressing Enter because:
   * - Humans typically click on dropdown suggestions
   * - The interaction with the dropdown is visible and natural
   * - Avoids the "instant Enter press" pattern that bots use
   *
   * @param term - The search term to enter
   * @param ghost - GhostMouse instance for human-like clicking
   * @returns SearchInteractionResult with navigation status
   */
  async enterSearchTerm(term, ghost) {
    console.log(`  \u{1F524} Typing search term: "${term}"`);
    await this.typeText(term, true);
    const waitTime = 2500 + Math.random() * 1e3;
    console.log(`  \u23F3 Waiting ${(waitTime / 1e3).toFixed(1)}s for dropdown...`);
    await this.humanDelay(waitTime, waitTime + 200);
    const nodes = await this.getAccessibilityTree();
    const termLower = term.toLowerCase();
    const navItems = ["home", "search", "explore", "reels", "messages", "notifications", "create", "profile", "more"];
    const matchingResults = nodes.filter((node) => {
      if (node.ignored) return false;
      const role = node.role?.value?.toLowerCase();
      const name = (node.name?.value || "").toLowerCase();
      if (role !== "link" && role !== "button") return false;
      if (navItems.some((nav) => name === nav)) return false;
      return name.includes(termLower) && name.length > 2;
    });
    const dropdownResults = nodes.filter((node) => {
      if (node.ignored) return false;
      const role = node.role?.value?.toLowerCase();
      const name = node.name?.value || "";
      if (role !== "link" || !name) return false;
      if (navItems.some((nav) => name.toLowerCase() === nav)) return false;
      return name.length > 2 && name.length < 100;
    });
    let cdpSession = null;
    try {
      cdpSession = await this.page.context().newCDPSession(this.page);
      const targetNode = matchingResults[0] || dropdownResults[0];
      if (targetNode?.backendDOMNodeId) {
        const box = await this.getNodeBoundingBox(cdpSession, targetNode.backendDOMNodeId);
        if (box && box.width > 0 && box.height > 0) {
          const resultName = targetNode.name?.value || "Unknown";
          console.log(`  \u{1F3AF} Clicking dropdown result: "${resultName}"`);
          await ghost.clickElement(box, 0.3);
          await this.humanDelay(500, 1e3);
          return {
            success: true,
            navigated: true,
            matchedResult: resultName,
            fallbackUsed: false
          };
        }
      }
      console.log("  \u26A0\uFE0F No dropdown result found, pressing Enter as fallback...");
      await this.pressEnter();
      return {
        success: true,
        navigated: false,
        matchedResult: void 0,
        fallbackUsed: true
      };
    } catch (error) {
      console.error("  \u274C Search interaction error:", error.message);
      try {
        await this.pressEnter();
      } catch {
      }
      return {
        success: false,
        navigated: false,
        matchedResult: void 0,
        fallbackUsed: true
      };
    } finally {
      if (cdpSession) {
        await cdpSession.detach().catch(() => {
        });
      }
    }
  }
  // =========================================================================
  // Gaze Simulation Methods (Human-like Visual Attention)
  // =========================================================================
  /**
   * Randomized value within a range - NO fixed values allowed.
   */
  randomInRange(min2, max2) {
    return min2 + Math.random() * (max2 - min2);
  }
  /**
   * Score an element's visual salience (how likely a human would look at it).
   * Higher scores = more visually interesting.
   *
   * Scoring factors:
   * - Role priority: image > button > link > heading > text
   * - Position: Center-weighted (elements near viewport center score higher)
   * - Size: Larger elements = more visually prominent
   * - Uniqueness: Common labels ("Like", "Share") score lower
   */
  scoreElementSalience(node, box, viewportWidth, viewportHeight) {
    let score = 0;
    const role = node.role?.value?.toLowerCase() || "";
    const name = (node.name?.value || "").toLowerCase();
    const roleScores = {
      "image": [0.7, 0.9],
      "img": [0.7, 0.9],
      "figure": [0.65, 0.85],
      "button": [0.5, 0.7],
      "link": [0.4, 0.6],
      "heading": [0.35, 0.55],
      "text": [0.2, 0.4],
      "statictext": [0.15, 0.35]
    };
    const [minRole, maxRole] = roleScores[role] || [0.1, 0.3];
    score += this.randomInRange(minRole, maxRole);
    const centerX = viewportWidth / 2;
    const centerY = viewportHeight / 2;
    const elementCenterX = box.x + box.width / 2;
    const elementCenterY = box.y + box.height / 2;
    const distX = Math.abs(elementCenterX - centerX) / centerX;
    const distY = Math.abs(elementCenterY - centerY) / centerY;
    const centerDistance = Math.sqrt(distX * distX + distY * distY) / Math.sqrt(2);
    score += this.randomInRange(0.1, 0.3) * (1 - centerDistance);
    const area = box.width * box.height;
    const viewportArea = viewportWidth * viewportHeight;
    const sizeRatio = Math.min(area / viewportArea, 0.3);
    score += this.randomInRange(0.05, 0.15) * (sizeRatio / 0.3);
    const commonLabels = ["like", "comment", "share", "save", "more", "follow", "following"];
    if (commonLabels.some((label) => name.includes(label))) {
      score *= this.randomInRange(0.4, 0.6);
    }
    if (name.includes("#") || name.includes("@")) {
      score *= this.randomInRange(1.1, 1.3);
    }
    return Math.min(score, 1);
  }
  /**
   * Analyze content density for intent-driven scrolling.
   * Determines if viewport is text-heavy, image-heavy, or mixed.
   *
   * @returns ContentDensity with type classification and counts
   */
  async analyzeContentDensity() {
    const nodes = await this.getAccessibilityTree();
    const textRoles = ["paragraph", "text", "heading", "statictext", "label"];
    const textNodes = nodes.filter((node) => {
      if (node.ignored) return false;
      const role = node.role?.value?.toLowerCase() || "";
      return textRoles.includes(role);
    });
    const imageRoles = ["image", "img", "figure", "graphics-symbol"];
    const imageNodes = nodes.filter((node) => {
      if (node.ignored) return false;
      const role = node.role?.value?.toLowerCase() || "";
      return imageRoles.includes(role);
    });
    const textCount = textNodes.length;
    const imageCount = imageNodes.length;
    const total = textCount + imageCount;
    const textRatio = total > 0 ? textCount / total : 0.5;
    const textHeavyThreshold = this.randomInRange(0.65, 0.75);
    const imageHeavyThreshold = this.randomInRange(0.25, 0.35);
    let type;
    if (textRatio > textHeavyThreshold) {
      type = "text-heavy";
    } else if (textRatio < imageHeavyThreshold) {
      type = "image-heavy";
    } else {
      type = "mixed";
    }
    return {
      type,
      textCount,
      imageCount,
      textRatio
    };
  }
  /**
   * Expose getAccessibilityTree for external use (e.g., by HumanScroll).
   * Returns the raw CDP accessibility tree.
   */
  async getFullAccessibilityTree() {
    return this.getAccessibilityTree();
  }
  // =========================================================================
  // UNIVERSAL ACCESSIBILITY (Screen Reader-Like Capabilities)
  // =========================================================================
  /**
   * Find ANY element by role and name pattern - NO size filters, NO limits.
   * This is the screen reader equivalent - can find any element in the tree.
   *
   * @param role - Accessibility role (e.g., 'button', 'link', 'image', 'textbox')
   * @param namePattern - Regex pattern to match against accessible name
   * @returns First matching element with bounding box, or null
   */
  async findAnyElement(role, namePattern) {
    const pattern = typeof namePattern === "string" ? new RegExp(namePattern, "i") : namePattern;
    const nodes = await this.getAccessibilityTree();
    const match = nodes.find((node) => {
      if (node.ignored) return false;
      const nodeRole = node.role?.value?.toLowerCase();
      const nodeName = node.name?.value || "";
      return nodeRole === role.toLowerCase() && pattern.test(nodeName);
    });
    if (!match?.backendDOMNodeId) return null;
    let cdpSession = null;
    try {
      cdpSession = await this.page.context().newCDPSession(this.page);
      const box = await this.getNodeBoundingBox(cdpSession, match.backendDOMNodeId);
      if (box && box.width > 0 && box.height > 0) {
        return {
          role: match.role?.value || role,
          name: match.name?.value || "",
          selector: "",
          boundingBox: box,
          backendNodeId: match.backendDOMNodeId
        };
      }
    } finally {
      if (cdpSession) {
        await cdpSession.detach().catch(() => {
        });
      }
    }
    return null;
  }
  /**
   * Find ALL elements matching role and pattern - NO limits.
   * Returns every match in the accessibility tree.
   *
   * @param role - Accessibility role (e.g., 'button', 'link')
   * @param namePattern - Regex pattern to match against accessible name
   * @returns Array of all matching elements with bounding boxes
   */
  async findAllElements(role, namePattern) {
    const pattern = typeof namePattern === "string" ? new RegExp(namePattern, "i") : namePattern;
    const nodes = await this.getAccessibilityTree();
    const elements = [];
    const matches = nodes.filter((node) => {
      if (node.ignored) return false;
      const nodeRole = node.role?.value?.toLowerCase();
      const nodeName = node.name?.value || "";
      return nodeRole === role.toLowerCase() && pattern.test(nodeName);
    });
    if (matches.length === 0) return elements;
    let cdpSession = null;
    try {
      cdpSession = await this.page.context().newCDPSession(this.page);
      for (const match of matches) {
        if (!match.backendDOMNodeId) continue;
        const box = await this.getNodeBoundingBox(cdpSession, match.backendDOMNodeId);
        if (box && box.width > 0 && box.height > 0) {
          elements.push({
            role: match.role?.value || role,
            name: match.name?.value || "",
            selector: "",
            boundingBox: box,
            backendNodeId: match.backendDOMNodeId
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
   * Find element WITHIN a specific container (e.g., find Like button inside a post).
   * Uses childIds to traverse the tree contextually like a screen reader.
   *
   * @param containerNodeId - The backendNodeId of the container element
   * @param role - Role to search for within container
   * @param namePattern - Name pattern to match
   * @returns Matching element within the container, or null
   */
  async findElementInContainer(containerNodeId, role, namePattern) {
    const pattern = typeof namePattern === "string" ? new RegExp(namePattern, "i") : namePattern;
    const nodes = await this.getAccessibilityTree();
    const nodeMap = /* @__PURE__ */ new Map();
    for (const node of nodes) {
      nodeMap.set(node.nodeId, node);
    }
    const container = nodes.find((n) => n.backendDOMNodeId === containerNodeId);
    if (!container) return null;
    const searchChildren = (nodeId) => {
      const node = nodeMap.get(nodeId);
      if (!node) return null;
      if (!node.ignored && node.role?.value?.toLowerCase() === role.toLowerCase() && pattern.test(node.name?.value || "")) {
        return node;
      }
      for (const childId of node.childIds || []) {
        const found = searchChildren(childId);
        if (found) return found;
      }
      return null;
    };
    const match = searchChildren(container.nodeId);
    if (!match?.backendDOMNodeId) return null;
    let cdpSession = null;
    try {
      cdpSession = await this.page.context().newCDPSession(this.page);
      const box = await this.getNodeBoundingBox(cdpSession, match.backendDOMNodeId);
      if (box && box.width > 0 && box.height > 0) {
        return {
          role: match.role?.value || role,
          name: match.name?.value || "",
          selector: "",
          boundingBox: box,
          backendNodeId: match.backendDOMNodeId
        };
      }
    } finally {
      if (cdpSession) {
        await cdpSession.detach().catch(() => {
        });
      }
    }
    return null;
  }
  /**
   * Get all child elements of a node - enables tree traversal like screen readers.
   *
   * @param parentNodeId - The backendNodeId of the parent element
   * @returns Array of child elements with their roles, names, and bounding boxes
   */
  async getChildElements(parentNodeId) {
    const nodes = await this.getAccessibilityTree();
    const children = [];
    const nodeMap = /* @__PURE__ */ new Map();
    for (const node of nodes) {
      nodeMap.set(node.nodeId, node);
    }
    const parent = nodes.find((n) => n.backendDOMNodeId === parentNodeId);
    if (!parent || !parent.childIds) return children;
    let cdpSession = null;
    try {
      cdpSession = await this.page.context().newCDPSession(this.page);
      for (const childId of parent.childIds) {
        const child = nodeMap.get(childId);
        if (!child || child.ignored || !child.backendDOMNodeId) continue;
        const box = await this.getNodeBoundingBox(cdpSession, child.backendDOMNodeId);
        if (box && box.width > 0 && box.height > 0) {
          children.push({
            role: child.role?.value || "unknown",
            name: child.name?.value || "",
            selector: "",
            boundingBox: box,
            backendNodeId: child.backendDOMNodeId
          });
        }
      }
    } finally {
      if (cdpSession) {
        await cdpSession.detach().catch(() => {
        });
      }
    }
    return children;
  }
  /**
   * Extract metadata from a post container.
   * Traverses the post's children to find username, timestamp, counts, etc.
   *
   * @param postNodeId - The backendNodeId of the post (article) element
   * @returns PostMetadata object with extracted info, or null
   */
  async extractPostMetadata(postNodeId) {
    const nodes = await this.getAccessibilityTree();
    const nodeMap = /* @__PURE__ */ new Map();
    for (const node of nodes) {
      nodeMap.set(node.nodeId, node);
    }
    const container = nodes.find((n) => n.backendDOMNodeId === postNodeId);
    if (!container) return null;
    const metadata = {};
    const searchMetadata = (nodeId) => {
      const node = nodeMap.get(nodeId);
      if (!node || node.ignored) return;
      const name = node.name?.value || "";
      const role = node.role?.value?.toLowerCase() || "";
      if (/\d+\s*(second|minute|hour|day|week|month)s?\s*ago/i.test(name) || /^(january|february|march|april|may|june|july|august|september|october|november|december)\s+\d+/i.test(name)) {
        metadata.timestamp = name;
      }
      if (/^[\d,]+\s*likes?$/i.test(name)) {
        metadata.likeCount = name;
      }
      if (/view\s*(all\s*)?\d+\s*comments?/i.test(name)) {
        metadata.commentCount = name;
      }
      if (role === "link" && (name.startsWith("@") || /^[a-z0-9._]+$/i.test(name))) {
        if (!metadata.username) {
          metadata.username = name.startsWith("@") ? name : `@${name}`;
        }
      }
      for (const childId of node.childIds || []) {
        searchMetadata(childId);
      }
    };
    searchMetadata(container.nodeId);
    return metadata;
  }
  /**
   * Dump the full accessibility tree to console for debugging.
   * Shows exactly what a screen reader would see.
   */
  async dumpAccessibilityTree() {
    const nodes = await this.getAccessibilityTree();
    console.log("\n========== ACCESSIBILITY TREE DUMP ==========\n");
    console.log(`Total nodes: ${nodes.length}
`);
    const byRole = /* @__PURE__ */ new Map();
    for (const node of nodes) {
      if (node.ignored) continue;
      const role = node.role?.value || "unknown";
      if (!byRole.has(role)) {
        byRole.set(role, []);
      }
      byRole.get(role).push(node);
    }
    console.log("=== SUMMARY BY ROLE ===");
    for (const [role, roleNodes] of byRole.entries()) {
      console.log(`  ${role}: ${roleNodes.length} elements`);
    }
    console.log("\n=== INTERACTIVE ELEMENTS ===");
    const interactiveRoles = ["button", "link", "textbox", "searchbox", "checkbox", "radio", "menuitem"];
    for (const role of interactiveRoles) {
      const roleNodes = byRole.get(role) || [];
      if (roleNodes.length > 0) {
        console.log(`
[${role.toUpperCase()}] (${roleNodes.length} found)`);
        for (const node of roleNodes.slice(0, 20)) {
          const name = node.name?.value || "[no name]";
          const hasBox = !!node.backendDOMNodeId;
          console.log(`  \u2022 "${name.slice(0, 50)}${name.length > 50 ? "..." : ""}" ${hasBox ? "\u2713" : "\u2717"}`);
        }
        if (roleNodes.length > 20) {
          console.log(`  ... and ${roleNodes.length - 20} more`);
        }
      }
    }
    console.log("\n========== END DUMP ==========\n");
  }
  /**
   * Draw a simple marker at a specific point (for debugging click locations).
   *
   * @param point - Point to mark
   * @param color - CSS color for the marker
   * @param label - Optional label text
   */
  async drawPointMarker(point, color = "yellow", label) {
    try {
      await this.page.evaluate(({ x, y, markerColor, markerLabel }) => {
        const marker = document.createElement("div");
        marker.style.cssText = `
                    position: fixed;
                    left: ${x - 8}px;
                    top: ${y - 8}px;
                    width: 16px;
                    height: 16px;
                    border: 2px solid ${markerColor};
                    border-radius: 50%;
                    background: rgba(255, 255, 0, 0.3);
                    pointer-events: none;
                    z-index: 999998;
                `;
        if (markerLabel) {
          const labelEl = document.createElement("div");
          labelEl.style.cssText = `
                        position: fixed;
                        left: ${x + 12}px;
                        top: ${y - 8}px;
                        background: rgba(0, 0, 0, 0.8);
                        color: ${markerColor};
                        padding: 2px 4px;
                        border-radius: 2px;
                        font-size: 10px;
                        font-family: monospace;
                        pointer-events: none;
                        z-index: 999998;
                    `;
          labelEl.textContent = markerLabel;
          document.body.appendChild(labelEl);
          setTimeout(() => labelEl.remove(), 1500);
        }
        document.body.appendChild(marker);
        setTimeout(() => marker.remove(), 1500);
      }, { x: point.x, y: point.y, markerColor: color, markerLabel: label });
    } catch {
    }
  }
  // =========================================================================
  // AI NAVIGATION SUPPORT (NavigationLLM Integration)
  // =========================================================================
  /**
   * Get elements formatted for NavigationLLM consumption.
   *
   * Returns elements with:
   * - Unique IDs for action reference
   * - Normalized coordinates (0-1000)
   * - Container context from accessibility tree hierarchy
   * - State information (expanded, selected, etc.)
   *
   * The LLM uses container context to discover layout patterns
   * (e.g., "buttons inside 'Stories' region are story circles").
   *
   * @param maxElements - Maximum elements to return (for token efficiency)
   * @returns Array of NavigationElement objects
   */
  async getNavigationElements(maxElements = 1e3) {
    const elements = [];
    const viewport = await this.getViewportInfo();
    const tree = await this.buildAccessibilityTree();
    if (!tree) {
      return elements;
    }
    const interactiveNodes = [];
    const relevantRoles = [
      "button",
      "link",
      "image",
      "img",
      "figure",
      "article",
      "heading",
      "textbox",
      "searchbox",
      "menuitem",
      "listitem",
      "tab",
      "checkbox",
      "radio",
      "switch",
      "slider",
      "combobox"
    ];
    for (const node of tree.nodeMap.values()) {
      if (node.ignored) continue;
      const role = node.role?.value?.toLowerCase() || "";
      if (relevantRoles.includes(role) && node.backendDOMNodeId) {
        interactiveNodes.push(node);
      }
    }
    if (interactiveNodes.length === 0) {
      return elements;
    }
    let cdpSession = null;
    try {
      cdpSession = await this.page.context().newCDPSession(this.page);
      let idCounter = 1;
      for (const node of interactiveNodes) {
        if (elements.length >= maxElements) break;
        if (!node.backendDOMNodeId) continue;
        const box = await this.getNodeBoundingBox(cdpSession, node.backendDOMNodeId);
        if (!box || box.width <= 0 || box.height <= 0) continue;
        if (box.y + box.height < -viewport.height || box.y > viewport.height * 2) continue;
        if (box.width < viewport.width * 5e-3 || box.height < viewport.height * 5e-3) continue;
        const role = node.role?.value || "unknown";
        const name = node.name?.value || "";
        const normalizeX = (x) => Math.round(x / viewport.width * 1e3);
        const normalizeY = (y) => Math.round(y / viewport.height * 1e3);
        const container = this.findNearestContainer(tree, node);
        const siblingCount = container ? this.countSiblings(tree, node, container) : 0;
        const semanticHint = this.inferForbiddenActionHint(name);
        const state = this.extractElementState(node);
        const isArticle = role.toLowerCase() === "article";
        const isInArticle = container?.role?.value?.toLowerCase() === "article";
        let contentPreview;
        if (isArticle) {
          contentPreview = this.extractContentPreviewFromNode(tree, node);
        } else if (isInArticle && container) {
          contentPreview = this.extractContentPreviewFromNode(tree, container);
        }
        elements.push({
          id: idCounter++,
          role: role.toLowerCase(),
          name: name.slice(0, 300),
          position: {
            x: normalizeX(box.x),
            y: normalizeY(box.y),
            w: normalizeX(box.width),
            h: normalizeY(box.height)
          },
          containerRole: container?.role?.value?.toLowerCase(),
          containerName: container?.name?.value?.slice(0, 200),
          depth: node.depth,
          siblingCount,
          semanticHint: semanticHint !== "unknown" ? semanticHint : void 0,
          state: Object.keys(state).length > 0 ? state : void 0,
          backendNodeId: node.backendDOMNodeId,
          boundingBox: box,
          contentPreview
        });
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
   * Find the nearest container ancestor in the accessibility tree.
   * Containers are elements like region, navigation, list, article, dialog.
   */
  findNearestContainer(tree, node) {
    const containerRoles = [
      "region",
      "navigation",
      "main",
      "complementary",
      "list",
      "listbox",
      "article",
      "dialog",
      "alertdialog",
      "group",
      "toolbar",
      "menu",
      "menubar",
      "tablist"
    ];
    let current = node.parentId ? tree.nodeMap.get(node.parentId) : null;
    while (current) {
      const role = current.role?.value?.toLowerCase();
      if (role && containerRoles.includes(role)) {
        return current;
      }
      current = current.parentId ? tree.nodeMap.get(current.parentId) : null;
    }
    return null;
  }
  /**
   * Count siblings within the same container.
   * Helps LLM understand element clusters (e.g., "8 buttons in Stories").
   */
  countSiblings(tree, node, container) {
    if (!container.childIds) return 0;
    let count = 0;
    const nodeRole = node.role?.value?.toLowerCase();
    const countInContainer = (parentNode) => {
      let total = 0;
      if (!parentNode.childIds) return 0;
      for (const childId of parentNode.childIds) {
        const child = tree.nodeMap.get(childId);
        if (!child) continue;
        const childRole = child.role?.value?.toLowerCase();
        if (childRole === nodeRole) {
          total++;
        }
        const isContainer = ["region", "list", "article", "dialog", "group"].includes(childRole || "");
        if (!isContainer) {
          total += countInContainer(child);
        }
      }
      return total;
    };
    count = countInContainer(container);
    return count;
  }
  /**
   * Detect only forbidden action hints (like, comment, share, save, follow).
   * No position-based detection - let the LLM discover patterns from container context.
   */
  inferForbiddenActionHint(name) {
    const nameLower = name.toLowerCase();
    if (/^search$/i.test(nameLower)) {
      return "search_input";
    }
    if (/^close$|^x$|dismiss/i.test(nameLower)) {
      return "close_button";
    }
    if (/^like$/i.test(nameLower)) return "like_button";
    if (/^comment$/i.test(nameLower)) return "comment_button";
    if (/^share$/i.test(nameLower)) return "share_button";
    if (/^save$/i.test(nameLower)) return "save_button";
    if (/^follow$/i.test(nameLower)) return "follow_button";
    return "unknown";
  }
  // =========================================================================
  // Content Preview Extraction (for LLM value assessment)
  // =========================================================================
  /**
   * Extract hashtags from text content.
   * @param text - Text to search for hashtags
   * @param max - Maximum hashtags to return
   * @returns Array of hashtags (without # prefix)
   */
  extractHashtags(text, max2) {
    if (!text) return [];
    const matches = text.match(/#\w+/g) || [];
    return matches.slice(0, max2).map((tag) => tag.substring(1));
  }
  /**
   * Extract content preview from an article node and its descendants.
   * Used to give NavigationLLM context about post value WITHOUT Vision API.
   *
   * @param tree - The accessibility tree
   * @param articleNode - The article/container node to extract from
   * @returns Content preview object or undefined if no content found
   */
  extractContentPreviewFromNode(tree, articleNode) {
    let captionText;
    let likes;
    let comments;
    let altText;
    const collectFromDescendants = (node) => {
      if (node.ignored) return;
      const name = node.name?.value || "";
      const role = node.role?.value?.toLowerCase() || "";
      const description = node.description?.value;
      if ((role === "image" || role === "img" || role === "figure") && description) {
        if (!altText && description.length > 5) {
          altText = description.slice(0, 500);
        }
      }
      if (!likes && /^[\d,]+\s*likes?$/i.test(name)) {
        likes = name;
      }
      if (!comments && (/view\s*(all\s*)?\d+\s*comments?/i.test(name) || /^\d+\s*comments?$/i.test(name))) {
        comments = name;
      }
      if (!captionText && name.length >= 5) {
        if (role !== "button" && role !== "link" && role !== "textbox") {
          if (!/^(home|search|explore|reels|messages|notifications|create|profile)$/i.test(name)) {
            if (name.includes("#") || name.includes("@")) {
              captionText = name;
            } else if (name.length > 5) {
              captionText = name;
            }
          }
        }
      }
      if (node.childIds) {
        for (const childId of node.childIds) {
          const child = tree.nodeMap.get(childId);
          if (child) {
            collectFromDescendants(child);
          }
        }
      }
    };
    collectFromDescendants(articleNode);
    if (!captionText && !likes && !comments && !altText) {
      return void 0;
    }
    const hashtags = this.extractHashtags(captionText, 30);
    return {
      captionText: captionText?.slice(0, 1e3),
      altText,
      engagement: likes || comments ? { likes, comments } : void 0,
      hasHashtags: hashtags.length > 0,
      hashtags: hashtags.length > 0 ? hashtags : void 0
    };
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
            model: "gpt-4o",
            // Best vision model
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
            model: "gpt-4o",
            // Best vision model
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

// src/main/services/ScreenshotCollector.ts
var import_crypto = require("crypto");
var fs3 = __toESM(require("fs"), 1);
var path3 = __toESM(require("path"), 1);
var DEFAULT_CONFIG = {
  maxCaptures: 200,
  // Generous limit — LLM controls capture decisions
  jpegQuality: 85,
  // Good balance of quality and size
  minScrollDelta: 100
  // Must scroll at least 100px for new capture
};
var STORY_CROP_CONFIG = {
  topMargin: 65,
  // Crop out progress bar and header
  bottomMargin: 70
  // Crop out reply box
};
var ScreenshotCollector = class {
  page;
  captures = [];
  config;
  lastScrollPosition = 0;
  outputDir = null;
  // Deduplication tracking
  capturedPostIds = /* @__PURE__ */ new Set();
  // Track by Instagram post ID
  capturedHashes = /* @__PURE__ */ new Set();
  // Track by image hash (for carousel/story)
  capturedPositions = /* @__PURE__ */ new Set();
  // Track by scroll position bucket (100px)
  constructor(page, config = {}) {
    this.page = page;
    this.config = { ...DEFAULT_CONFIG, ...config };
    if (this.config.saveToDirectory) {
      const sessionTimestamp = (/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-").slice(0, 19);
      this.outputDir = path3.join(this.config.saveToDirectory, `session_${sessionTimestamp}`);
      this.ensureOutputDir();
      console.log(`\u{1F4F8} Debug screenshots will be saved to: ${this.outputDir}`);
    }
  }
  /**
   * Ensure the output directory exists for saving screenshots.
   */
  ensureOutputDir() {
    if (this.outputDir && !fs3.existsSync(this.outputDir)) {
      fs3.mkdirSync(this.outputDir, { recursive: true });
    }
  }
  /**
   * Save a screenshot to disk for debugging.
   * Only saves if outputDir is configured.
   */
  saveScreenshotToDisk(screenshot, source, id) {
    if (!this.outputDir) return;
    const filename = `${id.toString().padStart(3, "0")}_${source}.jpg`;
    const filepath = path3.join(this.outputDir, filename);
    fs3.writeFileSync(filepath, screenshot);
    console.log(`  \u{1F4BE} Saved: ${filename}`);
  }
  /**
   * Capture the current viewport as a post screenshot.
   * Called after each scroll/story view when content is visible.
   *
   * @param source - Where this content came from (feed, story, search, etc.)
   * @param interest - For search results, which interest triggered this capture
   * @returns true if captured, false if skipped (max reached or duplicate position)
   */
  async captureCurrentPost(source, interest) {
    if (this.captures.length >= this.config.maxCaptures) {
      console.log(`\u{1F4F8} Max captures (${this.config.maxCaptures}) reached, skipping`);
      return false;
    }
    const scrollPosition = await this.getScrollPosition();
    const postId = this.extractPostId();
    if (postId && this.capturedPostIds.has(postId)) {
      console.log(`\u{1F4F8} Skipping duplicate post: ${postId}`);
      return false;
    }
    const positionBucket = Math.round(scrollPosition / 75);
    if (source !== "carousel" && source !== "story" && this.capturedPositions.has(positionBucket)) {
      console.log(`\u{1F4F8} Skipping duplicate position: bucket ${positionBucket} (scroll ~${scrollPosition}px)`);
      return false;
    }
    if (source === "feed" && Math.abs(scrollPosition - this.lastScrollPosition) < this.config.minScrollDelta) {
      console.log(`\u{1F4F8} Scroll delta too small (${Math.abs(scrollPosition - this.lastScrollPosition)}px), skipping duplicate`);
      return false;
    }
    try {
      const viewport = this.page.viewportSize();
      let screenshot;
      if (source === "story" && viewport) {
        const clipHeight = viewport.height - STORY_CROP_CONFIG.topMargin - STORY_CROP_CONFIG.bottomMargin;
        screenshot = await this.page.screenshot({
          type: "jpeg",
          quality: this.config.jpegQuality,
          clip: {
            x: 0,
            y: STORY_CROP_CONFIG.topMargin,
            width: viewport.width,
            height: Math.max(clipHeight, 100)
            // Ensure minimum height
          }
        });
        console.log(`\u{1F4F8} Story cropped: removed top ${STORY_CROP_CONFIG.topMargin}px and bottom ${STORY_CROP_CONFIG.bottomMargin}px`);
      } else {
        screenshot = await this.page.screenshot({
          type: "jpeg",
          quality: this.config.jpegQuality,
          fullPage: false
          // Viewport only
        });
      }
      const hash = this.computeImageHash(screenshot);
      if (this.capturedHashes.has(hash)) {
        console.log(`\u{1F4F8} Skipping duplicate (hash match): ${hash.slice(0, 8)}...`);
        return false;
      }
      this.captures.push({
        id: this.captures.length + 1,
        screenshot,
        source,
        interest,
        postId,
        // For Instagram embed rendering
        timestamp: Date.now(),
        scrollPosition
      });
      if (postId) {
        this.capturedPostIds.add(postId);
      }
      this.capturedHashes.add(hash);
      this.capturedPositions.add(positionBucket);
      if (source === "feed") {
        this.lastScrollPosition = scrollPosition;
      }
      this.saveScreenshotToDisk(screenshot, source, this.captures.length);
      console.log(`\u{1F4F8} Captured #${this.captures.length} (${source}${interest ? `: ${interest}` : ""}${postId ? ` [postId: ${postId}]` : ""})`);
      return true;
    } catch (error) {
      console.error("\u{1F4F8} Screenshot capture failed:", error);
      return false;
    }
  }
  /**
   * Capture a specific element that the LLM focused on.
   * Takes a cropped screenshot centered on the element for high-quality captures.
   *
   * @param elementBox - Bounding box of the focused element
   * @param source - Where this content came from (feed, story, search, etc.)
   * @param interest - For search results, which interest triggered this capture
   * @param reason - Why the LLM decided to capture this (for logging)
   * @returns The captured post, or null if capture failed/skipped
   */
  async captureFocusedElement(elementBox, source, interest, reason) {
    if (this.captures.length >= this.config.maxCaptures) {
      console.log(`\u{1F4F8} Max captures (${this.config.maxCaptures}) reached, skipping focused capture`);
      return null;
    }
    let viewport = this.page.viewportSize();
    if (!viewport) {
      await new Promise((r) => setTimeout(r, 100));
      viewport = this.page.viewportSize();
    }
    if (!viewport) {
      console.log("\u{1F4F8} Viewport unavailable, using default dimensions (1080x1920)");
      viewport = { width: 1080, height: 1920 };
    }
    try {
      const padding = 50;
      const captureRegion = {
        x: Math.max(0, elementBox.x - padding),
        y: Math.max(0, elementBox.y - padding),
        width: Math.min(elementBox.width + padding * 2, viewport.width),
        height: Math.min(elementBox.height + padding * 2, viewport.height)
      };
      if (captureRegion.x + captureRegion.width > viewport.width) {
        captureRegion.width = viewport.width - captureRegion.x;
      }
      if (captureRegion.y + captureRegion.height > viewport.height) {
        captureRegion.height = viewport.height - captureRegion.y;
      }
      captureRegion.width = Math.max(captureRegion.width, 100);
      captureRegion.height = Math.max(captureRegion.height, 100);
      const screenshot = await this.page.screenshot({
        type: "jpeg",
        quality: this.config.jpegQuality,
        clip: captureRegion
      });
      const hash = this.computeImageHash(screenshot);
      if (this.capturedHashes.has(hash)) {
        console.log(`  \u{1F4F8} Capture skipped (duplicate hash)`);
        return null;
      }
      this.capturedHashes.add(hash);
      const postId = this.extractPostId();
      if (postId) {
        if (this.capturedPostIds.has(postId)) {
          console.log(`  \u{1F4F8} Capture skipped (duplicate postId: ${postId})`);
          return null;
        }
        this.capturedPostIds.add(postId);
      }
      const captured = {
        id: this.captures.length + 1,
        screenshot,
        source,
        interest,
        postId,
        timestamp: Date.now(),
        scrollPosition: elementBox.y
        // Use element Y as position
      };
      this.captures.push(captured);
      this.saveScreenshotToDisk(screenshot, source, captured.id);
      console.log(`
\u{1F4F8} === CAPTURED #${captured.id} ===`);
      console.log(`   Target: (${elementBox.x}, ${elementBox.y}, ${elementBox.width}x${elementBox.height})`);
      console.log(`   Reason: ${reason || "LLM focus"}`);
      console.log(`   Crop: ${captureRegion.width}x${captureRegion.height}px`);
      console.log(`   Source: ${source}${interest ? `: ${interest}` : ""}`);
      console.log(`==============================
`);
      return captured;
    } catch (error) {
      console.error("\u{1F4F8} Focused capture failed:", error);
      return null;
    }
  }
  /**
   * Get all captured screenshots for batch processing.
   */
  getCaptures() {
    return this.captures;
  }
  /**
   * Get capture count.
   */
  getCaptureCount() {
    return this.captures.length;
  }
  /**
   * Get source breakdown for logging.
   */
  getSourceBreakdown() {
    const breakdown = {
      feed: 0,
      story: 0,
      search: 0,
      profile: 0,
      carousel: 0
    };
    for (const capture of this.captures) {
      breakdown[capture.source]++;
    }
    return breakdown;
  }
  /**
   * Get approximate memory usage in bytes.
   */
  getMemoryUsage() {
    return this.captures.reduce((total, c) => total + c.screenshot.length, 0);
  }
  /**
   * Clear all captures (call after processing to free memory).
   */
  clear() {
    this.captures = [];
    this.lastScrollPosition = 0;
    this.capturedPostIds.clear();
    this.capturedHashes.clear();
    this.capturedPositions.clear();
    console.log("\u{1F4F8} Collector cleared");
  }
  /**
   * Reset scroll tracking (useful when navigating to new context).
   */
  resetScrollTracking() {
    this.lastScrollPosition = 0;
  }
  /**
   * Capture multiple frames during video playback.
   * Called when video content is detected. Simulates natural video watching
   * by capturing frames at intervals during the watch duration.
   *
   * @param source - Where this content came from (feed, story, etc.)
   * @param watchDurationMs - How long to watch (human-like: 8-20 seconds)
   * @param frameIntervalMs - Interval between frames (2-3 seconds)
   * @returns Number of unique frames captured
   */
  async captureVideoFrames(source, watchDurationMs = 12e3, frameIntervalMs = 2500) {
    const videoId = this.extractPostId() || `video_${Date.now()}`;
    const maxFrames = Math.floor(watchDurationMs / frameIntervalMs);
    let capturedFrames = 0;
    let lastCapturedTime = -1;
    const startTime = Date.now();
    console.log(`\u{1F3AC} Starting video frame capture: up to ${maxFrames} frames over ${(watchDurationMs / 1e3).toFixed(1)}s`);
    while (Date.now() - startTime < watchDurationMs) {
      if (this.captures.length >= this.config.maxCaptures) {
        console.log(`\u{1F4F8} Max captures reached, stopping video frames`);
        break;
      }
      if (capturedFrames >= maxFrames) {
        break;
      }
      const videoState = await this.getVideoState();
      if (!videoState?.found) {
        console.log(`\u{1F3AC} No video found, waiting...`);
        await this.delay(500);
        continue;
      }
      if (videoState.paused) {
        console.log(`\u{1F3AC} Video paused, waiting...`);
        await this.delay(500);
        continue;
      }
      if (videoState.buffering) {
        console.log(`\u{1F3AC} Video buffering, waiting...`);
        await this.delay(300);
        continue;
      }
      const minTimeAdvance = 2;
      if (lastCapturedTime >= 0 && videoState.currentTime - lastCapturedTime < minTimeAdvance) {
        await this.delay(200);
        continue;
      }
      try {
        const screenshot = await this.page.screenshot({
          type: "jpeg",
          quality: this.config.jpegQuality,
          fullPage: false
        });
        const hash = this.computeImageHash(screenshot);
        if (this.capturedHashes.has(hash)) {
          console.log(`\u{1F3AC} Frame at ${videoState.currentTime.toFixed(1)}s: duplicate, skipping`);
          lastCapturedTime = videoState.currentTime;
          await this.delay(frameIntervalMs);
          continue;
        }
        this.capturedHashes.add(hash);
        this.captures.push({
          id: this.captures.length + 1,
          screenshot,
          source,
          postId: this.extractPostId(),
          timestamp: Date.now(),
          scrollPosition: 0,
          isVideoFrame: true,
          videoId,
          frameIndex: capturedFrames + 1,
          totalFrames: maxFrames
        });
        this.saveScreenshotToDisk(screenshot, source, this.captures.length);
        capturedFrames++;
        lastCapturedTime = videoState.currentTime;
        console.log(`\u{1F3AC} Frame ${capturedFrames} captured at ${videoState.currentTime.toFixed(1)}s`);
        await this.delay(frameIntervalMs);
      } catch (error) {
        console.error(`\u{1F3AC} Frame capture failed:`, error);
        await this.delay(500);
      }
    }
    this.captures.filter((c) => c.videoId === videoId).forEach((c) => c.totalFrames = capturedFrames);
    console.log(`\u{1F3AC} Video complete: ${capturedFrames} unique frames captured`);
    return capturedFrames;
  }
  /**
   * Get the current count of captured photos/screenshots.
   * Used by LLM to track capture progress.
   */
  getPhotoCount() {
    return this.captures.length;
  }
  /**
   * Simple delay helper for video frame timing.
   */
  delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
  /**
   * Extract Instagram post ID from current URL.
   * Post URLs follow pattern: instagram.com/p/{POST_ID}/
   * Returns undefined for non-post pages (stories, feed, etc.)
   */
  extractPostId() {
    const url = this.page.url();
    const match = url.match(/\/p\/([A-Za-z0-9_-]+)\//);
    return match?.[1];
  }
  /**
   * Compute a simple hash of the screenshot for deduplication.
   * Uses MD5 on the entire buffer - fast enough for our needs.
   */
  computeImageHash(screenshot) {
    return (0, import_crypto.createHash)("md5").update(screenshot).digest("hex");
  }
  /**
   * Get current scroll Y position via CDP (no page.evaluate needed).
   */
  async getScrollPosition() {
    try {
      const client = await this.page.context().newCDPSession(this.page);
      const result = await client.send("Runtime.evaluate", {
        expression: "window.scrollY",
        returnByValue: true
      });
      await client.detach();
      return result.result.value;
    } catch {
      return await this.page.evaluate(() => window.scrollY);
    }
  }
  /**
   * Get video element state via CDP for synced frame capture.
   * Returns null if no video found on page.
   */
  async getVideoState() {
    try {
      const client = await this.page.context().newCDPSession(this.page);
      const result = await client.send("Runtime.evaluate", {
        expression: `
                    (() => {
                        const v = document.querySelector('video');
                        if (!v) return JSON.stringify({ found: false });
                        return JSON.stringify({
                            found: true,
                            paused: v.paused,
                            currentTime: v.currentTime,
                            buffering: v.readyState < 3,
                            duration: v.duration || 0
                        });
                    })()
                `,
        returnByValue: true
      });
      await client.detach();
      return JSON.parse(result.result.value);
    } catch {
      return null;
    }
  }
  /**
   * Log summary of captured content.
   */
  logSummary() {
    const breakdown = this.getSourceBreakdown();
    const memoryMB = (this.getMemoryUsage() / (1024 * 1024)).toFixed(2);
    console.log(`
\u{1F4F8} Screenshot Collection Summary:`);
    console.log(`   Total: ${this.captures.length} captures`);
    console.log(`   Feed: ${breakdown.feed}, Stories: ${breakdown.story}, Search: ${breakdown.search}`);
    console.log(`   Memory: ${memoryMB}MB`);
    console.log("");
  }
};

// src/main/services/ContentReadiness.ts
var DEFAULT_CONFIG2 = {
  imageLoadTimeoutMs: 3e3,
  networkIdleTimeoutMs: 2e3,
  pollIntervalMs: 100
};
var ContentReadiness = class {
  page;
  config;
  // CDP session management (following A11yNavigator pattern)
  managedSession = null;
  sessionLastUsed = 0;
  SESSION_TIMEOUT_MS = 5e3;
  constructor(page, config = {}) {
    this.page = page;
    this.config = { ...DEFAULT_CONFIG2, ...config };
  }
  // =========================================================================
  // CDP Session Management
  // =========================================================================
  async withSession(operation) {
    const now = Date.now();
    if (this.managedSession && now - this.sessionLastUsed > this.SESSION_TIMEOUT_MS) {
      await this.releaseSession();
    }
    if (!this.managedSession) {
      this.managedSession = await this.page.context().newCDPSession(this.page);
    }
    this.sessionLastUsed = now;
    try {
      return await operation(this.managedSession);
    } catch (error) {
      await this.releaseSession();
      throw error;
    }
  }
  async releaseSession() {
    if (this.managedSession) {
      await this.managedSession.detach().catch(() => {
      });
      this.managedSession = null;
    }
  }
  // =========================================================================
  // Core Readiness Checks
  // =========================================================================
  /**
   * Wait for images in the current viewport to be loaded.
   * Uses CDP Runtime.evaluate to check img.complete status.
   *
   * @param timeoutMs - Maximum wait time (default: 3000ms)
   * @returns ReadinessResult with status and timing info
   */
  async waitForImagesLoaded(timeoutMs) {
    const timeout = timeoutMs ?? this.config.imageLoadTimeoutMs;
    const startTime = Date.now();
    while (Date.now() - startTime < timeout) {
      const imagesReady = await this.checkImagesLoaded();
      if (imagesReady.allLoaded) {
        return {
          ready: true,
          waitedMs: Date.now() - startTime,
          details: `${imagesReady.loadedCount}/${imagesReady.totalCount} images loaded`
        };
      }
      await new Promise((r) => setTimeout(r, this.config.pollIntervalMs));
    }
    const finalState = await this.checkImagesLoaded();
    return {
      ready: false,
      reason: "images_loading",
      waitedMs: Date.now() - startTime,
      details: `${finalState.loadedCount}/${finalState.totalCount} images loaded (timeout)`
    };
  }
  /**
   * Check if all images in viewport are loaded (single check, no wait).
   */
  async checkImagesLoaded() {
    return this.withSession(async (session2) => {
      const { result } = await session2.send("Runtime.evaluate", {
        expression: `
                    (() => {
                        const viewportHeight = window.innerHeight;
                        const images = Array.from(document.images);

                        // Only check images in viewport (visible)
                        const visibleImages = images.filter(img => {
                            const rect = img.getBoundingClientRect();
                            return rect.top < viewportHeight && rect.bottom > 0 && rect.width > 0;
                        });

                        const loadedImages = visibleImages.filter(img =>
                            img.complete && img.naturalHeight > 0
                        );

                        return JSON.stringify({
                            allLoaded: loadedImages.length === visibleImages.length,
                            totalCount: visibleImages.length,
                            loadedCount: loadedImages.length
                        });
                    })()
                `,
        returnByValue: true
      });
      try {
        return JSON.parse(result.value);
      } catch {
        return { allLoaded: true, totalCount: 0, loadedCount: 0 };
      }
    });
  }
  /**
   * Wait for CSS transitions and animations to complete.
   * Checks for running animations in the viewport.
   *
   * @param timeoutMs - Maximum wait time (default: 1500ms)
   */
  async waitForTransitionsComplete(timeoutMs = 1500) {
    const startTime = Date.now();
    while (Date.now() - startTime < timeoutMs) {
      const animating = await this.hasActiveAnimations();
      if (!animating) {
        return {
          ready: true,
          waitedMs: Date.now() - startTime
        };
      }
      await new Promise((r) => setTimeout(r, this.config.pollIntervalMs));
    }
    return {
      ready: false,
      reason: "timeout",
      waitedMs: Date.now() - startTime,
      details: "Animations still running"
    };
  }
  /**
   * Check if there are active CSS animations/transitions.
   */
  async hasActiveAnimations() {
    return this.withSession(async (session2) => {
      const { result } = await session2.send("Runtime.evaluate", {
        expression: `
                    (() => {
                        // Check for running animations via getAnimations API
                        const animations = document.getAnimations ? document.getAnimations() : [];
                        const runningAnimations = animations.filter(a =>
                            a.playState === 'running' || a.playState === 'pending'
                        );
                        return runningAnimations.length > 0;
                    })()
                `,
        returnByValue: true
      });
      return result.value === true;
    });
  }
  /**
   * Combined readiness check: overlays + images + transitions.
   * This is the main method to call before taking a screenshot.
   *
   * @param timeoutMs - Maximum total wait time (default: 3000ms)
   * @param dismissOverlays - Whether to dismiss blocking overlays (default: true)
   * @returns ReadinessResult
   */
  async waitForContentReady(timeoutMs = 3e3, dismissOverlays = true) {
    const startTime = Date.now();
    const remainingTime = () => Math.max(0, timeoutMs - (Date.now() - startTime));
    if (dismissOverlays) {
      const viewportClear = await this.ensureViewportClear(2);
      if (!viewportClear) {
        return {
          ready: false,
          reason: "unknown",
          waitedMs: Date.now() - startTime,
          details: "Blocking overlay could not be dismissed"
        };
      }
    }
    const imageResult = await this.waitForImagesLoaded(Math.min(remainingTime(), 2500));
    if (!imageResult.ready && remainingTime() <= 0) {
      return {
        ready: false,
        reason: "images_loading",
        waitedMs: Date.now() - startTime,
        details: imageResult.details
      };
    }
    if (remainingTime() > 200) {
      const transitionResult = await this.waitForTransitionsComplete(Math.min(remainingTime(), 1e3));
      if (!transitionResult.ready) {
        console.log(`  \u23F3 Transitions still running, proceeding anyway`);
      }
    }
    return {
      ready: true,
      waitedMs: Date.now() - startTime,
      details: imageResult.details
    };
  }
  /**
   * Get element position by backend node ID.
   * Used for position re-verification before capture.
   *
   * @param backendNodeId - CDP backend node ID
   * @returns Bounding box or null if element not found
   */
  async getElementPosition(backendNodeId) {
    return this.withSession(async (session2) => {
      try {
        const { model } = await session2.send("DOM.getBoxModel", {
          backendNodeId
        });
        if (!model || !model.content) {
          return null;
        }
        const [x1, y1, x2, , , y3] = model.content;
        const width = x2 - x1;
        const height = y3 - y1;
        return {
          x: x1,
          y: y1,
          width,
          height,
          centerY: y1 + height / 2
        };
      } catch {
        return null;
      }
    });
  }
  /**
   * Get current viewport center Y coordinate.
   */
  async getViewportCenterY() {
    return this.withSession(async (session2) => {
      const { result } = await session2.send("Runtime.evaluate", {
        expression: "window.innerHeight / 2",
        returnByValue: true
      });
      return result.value;
    });
  }
  /**
   * Check if an element has drifted from expected center position.
   *
   * @param backendNodeId - CDP backend node ID
   * @param tolerance - Acceptable drift in pixels (default: 50)
   * @returns Drift info or null if element not found
   */
  async checkElementDrift(backendNodeId, tolerance = 50) {
    const position = await this.getElementPosition(backendNodeId);
    if (!position) return null;
    const viewportCenterY = await this.getViewportCenterY();
    const drift = Math.abs(position.centerY - viewportCenterY);
    return {
      drifted: drift > tolerance,
      drift,
      elementCenterY: position.centerY,
      viewportCenterY
    };
  }
  /**
   * Check video element state for synced frame capture.
   *
   * @returns Video state or null if no video found
   */
  async getVideoState() {
    return this.withSession(async (session2) => {
      const { result } = await session2.send("Runtime.evaluate", {
        expression: `
                    (() => {
                        const v = document.querySelector('video');
                        if (!v) return JSON.stringify({ found: false });
                        return JSON.stringify({
                            found: true,
                            paused: v.paused,
                            currentTime: v.currentTime,
                            buffering: v.readyState < 3,
                            duration: v.duration || 0
                        });
                    })()
                `,
        returnByValue: true
      });
      try {
        return JSON.parse(result.value);
      } catch {
        return null;
      }
    });
  }
  /**
   * Detect if any overlay panels are blocking the main content.
   * Looks for common Instagram overlays: Notifications, Messages, Search, etc.
   *
   * @returns Overlay info or null if no overlay detected
   */
  async detectBlockingOverlay() {
    return this.withSession(async (session2) => {
      const { result } = await session2.send("Runtime.evaluate", {
        expression: `
                    (() => {
                        // Look for common overlay patterns
                        const overlayPatterns = [
                            { type: 'notifications', heading: 'Notifications' },
                            { type: 'messages', heading: 'Messages' },
                            { type: 'search', heading: 'Search' }
                        ];

                        // Check for overlay headings
                        for (const pattern of overlayPatterns) {
                            // Look for heading elements with exact text
                            const headings = document.querySelectorAll('h1, h2, [role="heading"]');
                            for (const h of headings) {
                                if (h.textContent?.trim() === pattern.heading) {
                                    // Found overlay - look for close button (X) nearby
                                    // Close button is typically a sibling or nearby element
                                    const container = h.closest('div[role="dialog"], div[style*="position"]') || h.parentElement?.parentElement;

                                    if (container) {
                                        // Look for close button by aria-label or SVG with specific path
                                        const closeBtn = container.querySelector('[aria-label="Close"], [aria-label*="close"], button svg');

                                        if (closeBtn) {
                                            const rect = closeBtn.getBoundingClientRect();
                                            return JSON.stringify({
                                                found: true,
                                                type: pattern.type,
                                                closeButton: {
                                                    x: rect.x + rect.width / 2,
                                                    y: rect.y + rect.height / 2,
                                                    width: rect.width,
                                                    height: rect.height
                                                }
                                            });
                                        }
                                    }

                                    // Overlay found but no close button
                                    return JSON.stringify({ found: true, type: pattern.type });
                                }
                            }
                        }

                        // Check for generic dialog/modal overlays
                        const dialogs = document.querySelectorAll('[role="dialog"], [aria-modal="true"]');
                        for (const dialog of dialogs) {
                            const rect = dialog.getBoundingClientRect();
                            // Only consider it blocking if it covers significant viewport area
                            if (rect.width > window.innerWidth * 0.3 || rect.height > window.innerHeight * 0.3) {
                                const closeBtn = dialog.querySelector('[aria-label="Close"], [aria-label*="close"]');
                                if (closeBtn) {
                                    const btnRect = closeBtn.getBoundingClientRect();
                                    return JSON.stringify({
                                        found: true,
                                        type: 'dialog',
                                        closeButton: {
                                            x: btnRect.x + btnRect.width / 2,
                                            y: btnRect.y + btnRect.height / 2,
                                            width: btnRect.width,
                                            height: btnRect.height
                                        }
                                    });
                                }
                                return JSON.stringify({ found: true, type: 'dialog' });
                            }
                        }

                        // No blocking overlay found
                        return JSON.stringify({ found: false, type: 'unknown' });
                    })()
                `,
        returnByValue: true
      });
      try {
        return JSON.parse(result.value);
      } catch {
        return null;
      }
    });
  }
  /**
   * Dismiss any blocking overlay by clicking its close button.
   * Uses keyboard shortcut (Escape) as fallback.
   *
   * @returns true if overlay was dismissed, false if none found or dismissal failed
   */
  async dismissOverlay() {
    const overlay = await this.detectBlockingOverlay();
    if (!overlay?.found) {
      return false;
    }
    console.log(`  \u{1F533} Detected blocking overlay: ${overlay.type}`);
    if (overlay.closeButton) {
      try {
        await this.withSession(async (session2) => {
          await session2.send("Input.dispatchMouseEvent", {
            type: "mousePressed",
            x: overlay.closeButton.x,
            y: overlay.closeButton.y,
            button: "left",
            clickCount: 1
          });
          await session2.send("Input.dispatchMouseEvent", {
            type: "mouseReleased",
            x: overlay.closeButton.x,
            y: overlay.closeButton.y,
            button: "left",
            clickCount: 1
          });
        });
        await new Promise((r) => setTimeout(r, 300));
        const stillOpen = await this.detectBlockingOverlay();
        if (!stillOpen?.found) {
          console.log(`  \u2713 Dismissed ${overlay.type} overlay via close button`);
          return true;
        }
      } catch (error) {
        console.log(`  \u26A0\uFE0F Failed to click close button: ${error}`);
      }
    }
    try {
      await this.withSession(async (session2) => {
        await session2.send("Input.dispatchKeyEvent", {
          type: "keyDown",
          key: "Escape",
          code: "Escape",
          windowsVirtualKeyCode: 27,
          nativeVirtualKeyCode: 27
        });
        await session2.send("Input.dispatchKeyEvent", {
          type: "keyUp",
          key: "Escape",
          code: "Escape",
          windowsVirtualKeyCode: 27,
          nativeVirtualKeyCode: 27
        });
      });
      await new Promise((r) => setTimeout(r, 300));
      const stillOpen = await this.detectBlockingOverlay();
      if (!stillOpen?.found) {
        console.log(`  \u2713 Dismissed ${overlay.type} overlay via Escape key`);
        return true;
      }
    } catch (error) {
      console.log(`  \u26A0\uFE0F Failed to press Escape: ${error}`);
    }
    console.log(`  \u26A0\uFE0F Could not dismiss ${overlay.type} overlay`);
    return false;
  }
  /**
   * Ensure viewport is clear for capture by dismissing any blocking overlays.
   * This should be called before any screenshot capture.
   *
   * @param maxAttempts - Maximum dismissal attempts (default: 3)
   * @returns true if viewport is clear, false if overlays persist
   */
  async ensureViewportClear(maxAttempts = 3) {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const overlay = await this.detectBlockingOverlay();
      if (!overlay?.found) {
        return true;
      }
      const dismissed = await this.dismissOverlay();
      if (!dismissed) {
        await new Promise((r) => setTimeout(r, 500));
      }
    }
    const finalCheck = await this.detectBlockingOverlay();
    return !finalCheck?.found;
  }
  /**
   * Release managed CDP session.
   * Call this when done with the service.
   */
  async cleanup() {
    await this.releaseSession();
  }
};

// src/main/services/InstagramScraper.ts
var fs5 = __toESM(require("fs"), 1);
var path5 = __toESM(require("path"), 1);
var os = __toESM(require("os"), 1);
var import_crypto2 = require("crypto");

// src/main/services/NavigationLLM.ts
var DEFAULT_CONFIG3 = {
  model: "gpt-4o-mini",
  maxTokens: 800,
  temperature: 0.5
};
var NavigationLLM = class {
  apiKey;
  model;
  maxTokens;
  temperature;
  debug;
  // Track calls for cost logging
  decisionCount = 0;
  // Session-level randomization for gaze jitter
  sessionJitter;
  constructor(config) {
    this.apiKey = config.apiKey;
    this.model = config.model || DEFAULT_CONFIG3.model;
    this.maxTokens = config.maxTokens || DEFAULT_CONFIG3.maxTokens;
    this.temperature = config.temperature || DEFAULT_CONFIG3.temperature;
    this.debug = config.debug ?? true;
    this.sessionJitter = 0.85 + Math.random() * 0.3;
  }
  /**
   * Get the system prompt for navigation decisions.
   */
  getSystemPrompt() {
    return `You are a FULLY AUTONOMOUS navigation agent for an Instagram browser session. You have COMPLETE STRATEGIC CONTROL over the session - you decide what to do, when to switch activities, and when to end.

YOU CONTROL:
1. TACTICAL: What action to take next (click, scroll, type, press, wait)
2. STRATEGIC: When to switch phases, when to capture, when to terminate

WEB UI REASONING:
You can understand ANY web page by analyzing the accessibility tree structure:

1. LAYOUT DETECTION: Elements in "navigation" containers are nav menus. Elements in "main" are primary content. Elements in "complementary" are sidebars. Use container roles to understand page layout.

2. NAVIGATION DISCOVERY: Look for links/buttons inside "navigation" containers \u2014 these let you move between sections. Read their names to understand where they lead.

3. PAGE CONTEXT: Infer your location from container names, URL, and element patterns:
   - Many "article" containers = content feed
   - A grid of images = gallery/explore view
   - Profile stats (followers, posts) = user profile
   - A dialog/modal container = overlay on top of main content

4. WORKFLOW COMPLETION: When performing multi-step tasks (like searching), complete the full workflow:
   - After typing in a search field, WAIT for results to appear as links, then CLICK one
   - After opening content, explore it before moving on
   - Use navigation links to move between sections, don't just scroll hoping to find things

5. SPATIAL REASONING: Use Y position to understand vertical layout. Elements at Y < 100 are likely headers/nav. Elements at Y > 900 are footers. Group elements by similar Y values to understand rows.

UNDERSTANDING THE ACCESSIBILITY TREE:
Elements are grouped by their container from the accessibility tree:
- "Stories" region near top = story circles to watch
- "article" container = parts of a post (images, text, buttons)
- "navigation" container = nav links (Home, Explore, Messages, etc.)
- "dialog" container = modal/popup content

PATTERN RECOGNITION:
- Multiple small buttons with usernames = carousel (stories, suggestions)
- Buttons inside "article" containers = post interaction buttons
- textbox inside "dialog" = input field in modal/popup
- Use siblingCount to understand clusters

DYNAMIC PAGE AWARENESS (infer from tree context):
YOU must infer where you are from the accessibility tree. Look at:
1. TREE CONTEXT section - shows containers, inputs, and their parent chains
2. Container names reveal your location:
   \u2022 "Direct Messages", "Inbox", "Chat" \u2192 You're in messaging!
   \u2022 "Stories", "Story" \u2192 You're viewing stories
   \u2022 "Search", "Explore" \u2192 You're in search/explore
   \u2022 "Posts", "Followers", "Following" \u2192 You're on a profile
   \u2022 Multiple "article" containers \u2192 You're in the feed

INPUT FIELD SAFETY (critical!):
Before typing, ALWAYS check the input's parent containers:
- If parents include "message", "direct", "inbox", "chat" \u2192 DO NOT TYPE (sends DMs!)
- If parents include "comment", "reply" \u2192 DO NOT TYPE (posts comments!)
- If parents include "Search" in navigation context \u2192 Safe to type search queries

EXAMPLE REASONING:
"I see textbox 'Search' with parents [Message thread \u2192 Direct Messages].
This is a search within messaging, NOT the main search bar.
Typing here could send a message. I'll press Escape to exit first."

CONTENT ASSESSMENT (from accessibility tree):
Elements may include contentPreview data extracted directly from the page:
- Caption: Post caption text (first 100 chars) - USE THIS to match content
- Engagement: Like counts, comment counts - higher = more interesting
- Tags: Extracted hashtags - MATCH THESE to user interests
- Alt: Image description/alt text

USE CONTENT TO MAKE SMART DECISIONS:
\u2705 Caption/hashtags match user interests \u2192 engage deeply, capture
\u2705 High engagement (thousands of likes) + relevant \u2192 priority capture
\u2705 Hashtags like #photography when user likes photography \u2192 explore
\u274C No relevance to user interests \u2192 scroll past quickly
\u274C Sponsored/ad content \u2192 skip immediately
\u274C Generic content with low engagement \u2192 don't capture

EXAMPLE: User interests: ["coffee", "travel", "photography"]
- Post with Caption: "Morning espresso \u2615 #coffee #barista" \u2192 HIGH RELEVANCE, capture!
- Post with Caption: "New workout routine \u{1F4AA} #fitness" \u2192 LOW RELEVANCE, scroll past
- Post with Tags: #travel, #wanderlust \u2192 MATCHES, engage deeper

AVAILABLE TACTICAL ACTIONS:
- click(id): Click element by ID
- hover(id): Hover over element (reveals hidden menus, tooltips, preview content)
- scroll(direction, amount): direction='up'|'down'|'left'|'right', amount='small'|'medium'|'large'|'xlarge'
- type(text): Type text into focused input
- press(key): Press any key - Escape, Enter, Backspace, Delete, Space, ArrowRight, ArrowLeft, ArrowUp, ArrowDown, Tab, Home, End, PageUp, PageDown
- clear(): Clear the currently focused input field (select all + delete)
- back(): Go back to the previous page (browser back button)
- wait(seconds): Wait 1-5 seconds

USE CASES:
- hover: Reveal hidden UI, preview content, trigger dropdowns, see tooltips
- back: Return to feed after visiting a profile, exit search results page
- clear: Clear search input to type a new search term (instead of manual backspacing)
- scroll(left/right): Scroll stories carousel, navigate horizontal content
- press(Backspace): Delete last character in input
- press(Space): Play/pause video
- press(Home/End): Jump to top/bottom of page

STRATEGIC DECISIONS (YOU CONTROL THESE):
Include a "strategic" field to make session-level decisions:

1. APPROACH \u2014 You have full freedom to explore this account however you see fit:
   - Browse the feed, watch stories, search for topics, explore profiles
   - Any combination, any order \u2014 allocate your time based on what you find
   - Use "switchPhase" to log what you're doing: "search" | "stories" | "feed"

2. SESSION TERMINATION - You decide when you're done:
   - "terminateSession": true \u2192 end the session (content exhausted, time's up, goal achieved)

3. CAPTURE CONTROL - You decide what's worth screenshotting:
   - "captureNow": true \u2192 take a screenshot of current view

4. PACING CONTROL - You decide how long to linger:
   - "lingerDuration": "short" (1s) | "medium" (3s) | "long" (6s) | "xlong" (12s)
   - Use "long" for interesting content, "short" for navigation

WHEN TO TERMINATE:
- \u2705 Time is almost up (< 30 seconds remaining)
- \u2705 Content is exhausted (seeing lots of duplicates)
- \u2705 Collected enough content (good variety of captures)
- \u2705 Stuck and can't recover

WHEN TO CAPTURE:
- \u2705 Interesting post visible that matches user interests
- \u2705 Story content visible (before advancing)
- \u2705 Search results showing relevant content
- \u274C Don't capture: navigation screens, loading states, empty feeds

VIDEO HANDLING:
When you see a video playing (videoState in context):
- Decide how long to watch based on content type
- Use lingerDuration: "long" for interesting videos, "short" for ads
- Capture multiple frames by staying on video (system auto-captures)

ADS:
- Ads rarely contain useful content \u2014 skip them unless they relate to user interests.
- Sponsored indicators: "Sponsored", "Paid partnership", "Shop now", "Learn more"
- Use lingerDuration: "short" and scroll past when not relevant

FORBIDDEN ACTIONS:
- NEVER click: like_button, comment_button, share_button, save_button, follow_button
- Read-only browsing only

STAGNATION DETECTION:
- Check RECENT ACTIONS for scrollY values. If scrollY is unchanged across 2+ scrolls, you are STUCK at the page bottom or blocked by an overlay.
- If stuck scrolling: try press(Escape) to close overlays, back() to go to previous page, or click a navigation link (Home, Explore) to change context.
- If "no change detected" appears 3+ times in recent actions, STOP repeating the same action and switch strategy completely.
- If SESSION MEMORY is available, use past session patterns to avoid known dead-ends.

DEEP ENGAGEMENT:
You can engage deeply with posts to understand them better. This is OPTIONAL but encouraged for interesting content.

ENGAGEMENT LEVELS:
1. FEED LEVEL (default): Scrolling through posts in main feed
2. POST MODAL LEVEL: Clicked on a post, viewing full content with comments visible
3. COMMENTS LEVEL: Scrolled down in modal to read more comments
4. PROFILE LEVEL: Clicked on username to explore their content

HOW TO ENGAGE DEEPLY:
1. Click on a post image/video to open the post modal (detail view)
2. In the modal, you can:
   - Navigate carousel slides using ArrowRight/ArrowLeft keys
   - Scroll down to see comments
   - Click username to visit their profile
3. Close modal by pressing Escape key

WHEN TO ENGAGE DEEPLY (signals):
\u2705 High engagement visible (many likes/comments like "1,234 likes", "View all 42 comments")
\u2705 Content relevant to user interests (keywords in caption/username match)
\u2705 Carousel post detected (slide indicators like "1 of 4")
\u2705 Interesting caption snippet visible
\u2705 Good visual content (nature, photography, etc.)
\u274C Already explored this post (check deeplyExploredPosts count)
\u274C Low engagement / not relevant
\u274C Ad or sponsored content
\u274C Time pressure (need to cover more ground)

ENGAGEMENT DEPTH:
- Adjust engagement time based on content relevance
- A few seconds for irrelevant content, longer for high-value content
- You decide the duration \u2014 there are no fixed time buckets

Include engagement decisions in your strategic field:
- "engageDepth": "quick" | "moderate" | "deep" | null
- "closeEngagement": true  // Signal to exit current modal and return to feed

CAROUSEL NAVIGATION IN MODAL:
- Use press(ArrowRight) to go to next slide
- Use press(ArrowLeft) to go to previous slide
- The engagementState.carouselState tells you current position (e.g., "Slide 2/5")
- Capture each interesting slide before moving on

DIFFERENTIATING OVERLAYS FROM NORMAL CONTENT:

Not everything with avatars is an overlay! Read the structural differences:

STORIES ROW (NOT an overlay - this is normal feed content):
- Buttons at TOP of screen (Y position < 200)
- SHORT names - just usernames or "[name]'s story"
- Part of the main feed, don't close it
- Example: id:5 button "johndoe's story" Y=80

MESSAGES PANEL (IS an overlay - close it before doing anything else):
- Buttons with LONG names (>50 chars) that include message preview text
- Names like "User avatar [name] [message preview snippet]..."
- Usually in a sidebar position or list container
- Has "Close", "Expand", "New message" buttons nearby
- Example: id:19 button "User avatar neel And 2) motherfuckers be taking yo" Y=507
- Action: Press Escape to close, THEN proceed with your goal

SEARCH RESULTS (IS a dropdown - CLICK one to navigate):
- LINKS (role=link, NOT buttons!)
- Names include follower counts, "Verified", profile descriptions
- Pattern: "username Info \u2022 297K followers"
- Appear AFTER you typed something (check RECENT ACTIONS)
- Example: id:26 link "umichathletics Michigan Athletics \u2022 297K followers" Y=466
- Action: CLICK the most relevant link to navigate to that profile

HOW TO REASON:
1. Check the ROLE: link vs button
2. Check the POSITION: top (stories) vs middle (dropdown) vs sidebar (messages)
3. Check the NAME LENGTH: short (stories) vs long with preview text (messages)
4. Check RECENT ACTIONS: did you just type? \u2192 links are probably search results
5. Check for CLOSE/EXPAND buttons nearby \u2192 something is open as overlay

EXAMPLE REASONING:
"I see buttons with 'User avatar' prefix and very long names including
message text like '...And 2) motherfuckers be taking yo'. These are message
thread previews, not stories. Stories would have short names at the top
of the screen. I should press Escape to close this messages panel."

EXAMPLE REASONING 2:
"I see links like 'umichathletics Michigan Athletics \u2022 297K followers'.
These are LINKS (not buttons) with follower counts. I just typed 'michigan
athletics' in my recent actions. These are my search results!
I should click one to navigate to that profile."

SEARCH WORKFLOW (complete the flow!):
1. Type search term \u2713
2. Look for LINKS appearing (not buttons!) with profile info and follower counts
3. CLICK a relevant link \u2192 This navigates to that profile
4. THEN browse that profile's content and capture screenshots

COMMON SEARCH FAILURE:
Typing \u2192 seeing result links \u2192 scrolling away or typing again
WHY: You never clicked a result, so you never navigated anywhere!
FIX: After typing, look for links with follower counts and CLICK one.

PROFILE EXPLORATION (after clicking a search result):
When you land on a profile page, generally explore it before leaving:
1. Scroll down to see the profile's posts grid
2. Capture screenshots of interesting content (use captureNow: true)
3. Click individual posts to see them in detail, capture, then close (Escape)
4. Keep scrolling and capturing until you've collected enough content
5. Leaving too quickly wastes the navigation effort it took to get here

COMMON PROFILE FAILURE:
Search \u2192 click profile \u2192 immediately go back \u2192 search again (infinite loop!)
WHY: You left the profile before exploring it. The search is useless without capturing content.
FIX: Explore the profile and capture content before navigating away.

OUTPUT FORMAT (JSON only):
{
  "reasoning": "Explain your decision",
  "action": "click|hover|scroll|type|press|clear|back|wait",
  "params": { ... },
  NOTE: For click/hover, params MUST include "expectedName" \u2014 the element name you expect to interact with.
  Example: "params": {"id": 5, "expectedName": "Search"}
  This prevents clicking the wrong element if you mix up IDs.
  "expectedOutcome": "What should happen",
  "confidence": 0.0-1.0,
  "capture": {
    "shouldCapture": true,
    "targetId": <element ID>,
    "reason": "Why this is worth capturing"
  },
  "strategic": {
    "switchPhase": "search"|"stories"|"feed"|null,
    "terminateSession": false,
    "captureNow": true,
    "lingerDuration": "short"|"medium"|"long"|"xlong",
    "engageDepth": "quick"|"moderate"|"deep"|null,
    "closeEngagement": false,
    "reason": "Strategic reasoning"
  }
}

STRATEGIC DECISION EXAMPLES:

1. Starting a session, want to search first:
{
  "reasoning": "Session just started, will search for user interests first",
  "action": "click",
  "params": {"id": 3, "expectedName": "Search"},
  "expectedOutcome": "Search panel opens",
  "strategic": {
    "switchPhase": "search",
    "lingerDuration": "short",
    "reason": "Beginning with search phase to find targeted content"
  }
}

2. Found good content, want to capture and linger:
{
  "reasoning": "Found a beautiful nature photo matching user interests",
  "action": "scroll",
  "params": {"direction": "down", "amount": "small"},
  "expectedOutcome": "Center the post in view",
  "strategic": {
    "captureNow": true,
    "lingerDuration": "long",
    "reason": "High-quality content worth studying"
  }
}

3. Content exhausted, switching phases:
{
  "reasoning": "Seeing repeated posts, time to watch stories",
  "action": "scroll",
  "params": {"direction": "up", "amount": "large"},
  "expectedOutcome": "Return to top to find stories",
  "strategic": {
    "switchPhase": "stories",
    "reason": "Feed content exhausted, trying stories"
  }
}

4. Session complete:
{
  "reasoning": "Collected 15 posts, watched 5 stories, time running low",
  "action": "wait",
  "params": {"seconds": 1},
  "expectedOutcome": "Session ends",
  "strategic": {
    "terminateSession": true,
    "reason": "Session goals achieved, time nearly up"
  }
}

5. Engaging deeply with an interesting post:
{
  "reasoning": "Post has 5,234 likes and is a carousel with 4 slides - worth exploring",
  "action": "click",
  "params": {"id": 12, "expectedName": "Photo by username"},
  "expectedOutcome": "Post modal opens for detailed view",
  "strategic": {
    "engageDepth": "moderate",
    "lingerDuration": "medium",
    "reason": "High engagement carousel, will navigate all slides"
  }
}

6. Navigating carousel in post modal:
{
  "reasoning": "On slide 2/4, interesting content continues",
  "action": "press",
  "params": {"key": "ArrowRight"},
  "expectedOutcome": "Move to slide 3",
  "strategic": {
    "captureNow": true,
    "lingerDuration": "short",
    "reason": "Capturing each carousel slide"
  }
}

7. Closing engagement and returning to feed:
{
  "reasoning": "Explored all 4 slides and read comments, done with this post",
  "action": "press",
  "params": {"key": "Escape"},
  "expectedOutcome": "Modal closes, return to feed",
  "strategic": {
    "closeEngagement": true,
    "reason": "Fully explored this post"
  }
}

Remember: YOU are in control. Make intelligent decisions about the entire session, not just individual actions. Engage deeply with interesting content - don't just scroll past everything!`;
  }
  /**
   * Build the user prompt with current context and elements.
   */
  buildUserPrompt(context, elements) {
    const recentActionsStr = context.recentActions.slice(-15).map((a, i) => {
      let line = `${i + 1}. ${a.action}(${JSON.stringify(a.params)}) \u2192 ${a.success ? "success" : "FAILED"}`;
      const parts = [];
      if (a.clickedElementName) parts.push(`element="${a.clickedElementName}"`);
      if (a.verified && a.verified !== "not_verified") parts.push(a.verified.replace(/_/g, " "));
      if (a.scrollY !== void 0) parts.push(`scrollY=${a.scrollY}`);
      if (parts.length > 0) line += ` [${parts.join(", ")}]`;
      return line;
    }).join("\n") || "None yet";
    let goalDesc = "";
    switch (context.currentGoal.type) {
      case "search_interest":
        goalDesc = `Search for posts about "${context.currentGoal.target}"`;
        break;
      case "watch_stories":
        goalDesc = "Watch stories from followed accounts";
        break;
      case "browse_feed":
        goalDesc = "Browse the home feed and collect interesting posts";
        break;
      case "explore_profile":
        goalDesc = `Explore profile: ${context.currentGoal.target}`;
        break;
      case "analyze_account":
        goalDesc = "Create a comprehensive digest of this account \u2014 you decide the approach";
        break;
      default:
        goalDesc = "General browsing - YOU decide what to do";
    }
    const elementsByContainer = this.groupElementsByContainer(elements);
    const overlays = this.detectActiveOverlays(elements);
    const overlayInfo = overlays.length > 0 ? `- Active dialogs: ${overlays.join(", ")}
` : "";
    const elapsedSec = Math.round((Date.now() - context.startTime) / 1e3);
    const targetSec = Math.round(context.targetDurationMs / 1e3);
    const remainingSec = Math.max(0, targetSec - elapsedSec);
    const interestsStr = context.userInterests.length > 0 ? context.userInterests.join(", ") : "None specified";
    let phaseHistoryStr = "None yet";
    if (context.phaseHistory && context.phaseHistory.length > 0) {
      phaseHistoryStr = context.phaseHistory.map((p) => `${p.phase}: ${Math.round(p.durationMs / 1e3)}s, ${p.itemsCollected} items`).join("; ");
    }
    let videoStr = "No video playing";
    if (context.videoState) {
      const vs = context.videoState;
      videoStr = vs.isPlaying ? `Playing: ${vs.currentTime.toFixed(1)}s / ${vs.duration.toFixed(1)}s` : "Video paused";
    }
    let contentStatsStr = "No stats yet";
    if (context.contentStats) {
      const cs = context.contentStats;
      contentStatsStr = `Unique: ${(cs.uniquePostsRatio * 100).toFixed(0)}%, Ads: ${(cs.adRatio * 100).toFixed(0)}%, Quality: ${cs.engagementLevel}`;
    }
    return `YOU HAVE FULL STRATEGIC CONTROL. Decide what to do next.

CURRENT GOAL: ${goalDesc}

USER INTERESTS (topics the user cares about): ${interestsStr}

SESSION STATUS:
- Current activity: ${context.currentPhase || "exploring"}
- Time: ${elapsedSec}s elapsed, ${remainingSec}s remaining (of ${targetSec}s total)
- Collected: ${context.postsCollected} posts, ${context.storiesWatched} stories
- Captures: ${context.captureCount || 0} screenshots taken

ACTIVITY HISTORY: ${phaseHistoryStr}

CURRENT STATE:
- URL: ${context.url}
- View: ${context.view}
- Video: ${videoStr}
- Content: ${contentStatsStr}
- Scroll position: ${context.scrollPosition !== void 0 ? `${context.scrollPosition}px from top` : "unknown"}
- Content freshness: ${context.elementFingerprint || "unknown"}
${overlayInfo}
${this.formatTreeContext(context)}

ENGAGEMENT STATE:
${this.formatEngagementState(context)}
${context.sessionMemoryDigest ? `
SESSION MEMORY (from past sessions):
${context.sessionMemoryDigest}
` : ""}
ACCESSIBILITY TREE (${elements.length} elements, grouped by container):
${elementsByContainer}

RECENT ACTIONS:
${recentActionsStr}
${context.loopWarning ? `
\u26A0\uFE0F LOOP DETECTED (${context.loopWarning.severity}): ${context.loopWarning.reason}
WARNING #${context.loopWarning.consecutiveWarnings} \u2014 You are repeating actions with no effect. Change your approach NOW.
${context.loopWarning.consecutiveWarnings >= 2 ? "CRITICAL: Auto-recovery will override your next action if you do not change strategy." : ""}
` : ""}
Make your decision. Include strategic decisions to signal captures, activity changes, or session termination.`;
  }
  /**
   * Detect active overlays from container roles in the accessibility tree.
   * Returns descriptions of any dialogs/overlays that might intercept scrolls.
   */
  detectActiveOverlays(elements) {
    const overlays = [];
    const seenContainers = /* @__PURE__ */ new Set();
    for (const elem of elements) {
      if (!elem.containerRole) continue;
      const key = `${elem.containerRole}:${elem.containerName || ""}`;
      if (seenContainers.has(key)) continue;
      seenContainers.add(key);
      if (elem.containerRole === "dialog" || elem.containerRole === "alertdialog") {
        overlays.push(`${elem.containerRole}: "${elem.containerName || "unnamed"}"`);
      }
      if (elem.containerRole === "region" && elem.containerName) {
        const name = elem.containerName.toLowerCase();
        if (name.includes("message") || name.includes("inbox") || name.includes("chat") || name.includes("direct")) {
          overlays.push(`messaging panel: "${elem.containerName}"`);
        }
      }
    }
    return overlays;
  }
  /**
   * Format engagement state for LLM context.
   */
  formatEngagementState(context) {
    if (!context.engagementState) {
      return "- Level: feed (not in deep engagement)\n- Posts explored: 0";
    }
    const es = context.engagementState;
    const lines = [];
    lines.push(`- Level: ${es.level}`);
    if (es.currentPost) {
      const postInfo = [];
      if (es.currentPost.username) postInfo.push(`by @${es.currentPost.username}`);
      if (es.currentPost.postUrl) postInfo.push(`(${es.currentPost.postUrl})`);
      if (postInfo.length > 0) {
        lines.push(`- Current post: ${postInfo.join(" ")}`);
      }
    }
    if (es.carouselState) {
      const cs = es.carouselState;
      lines.push(`- Carousel: Slide ${cs.currentSlide}/${cs.totalSlides}${cs.fullyExplored ? " (fully explored)" : ""}`);
    }
    if (es.postMetrics) {
      const pm = es.postMetrics;
      const metrics = [];
      if (pm.likeCount) metrics.push(pm.likeCount);
      if (pm.commentCount) metrics.push(pm.commentCount);
      if (pm.hasVideo) metrics.push("has video");
      if (metrics.length > 0) {
        lines.push(`- Metrics: ${metrics.join(", ")}`);
      }
    }
    const levelDuration = Math.round((Date.now() - es.levelEnteredAt) / 1e3);
    lines.push(`- Time in ${es.level}: ${levelDuration}s`);
    const exploredCount = es.deeplyExploredPostUrls?.length || 0;
    lines.push(`- Posts already explored: ${exploredCount}`);
    return lines.join("\n");
  }
  /**
   * Format tree context for LLM dynamic reasoning.
   * Shows containers, inputs with parent chains, and landmarks.
   */
  formatTreeContext(context) {
    if (!context.treeSummary) {
      return "TREE CONTEXT: Not available";
    }
    const ts = context.treeSummary;
    const lines = [];
    lines.push("TREE CONTEXT (use this to infer where you are):");
    if (ts.containers.length > 0) {
      lines.push("\nContainers found:");
      for (const c of ts.containers) {
        lines.push(`- ${c.role}: "${c.name}" (${c.childCount} children)`);
      }
    }
    if (ts.inputs.length > 0) {
      lines.push("\nInput fields (CHECK PARENTS BEFORE TYPING!):");
      for (const inp of ts.inputs) {
        lines.push(`- ${inp.role}: "${inp.name}"`);
        if (inp.parentContainers.length > 0) {
          lines.push(`  Parents: [${inp.parentContainers.join(" \u2192 ")}]`);
        }
      }
    }
    if (ts.landmarks.length > 0) {
      lines.push(`
Key landmarks: ${ts.landmarks.join(", ")}`);
    }
    return lines.join("\n");
  }
  /**
   * Group elements by their container from the accessibility tree.
   * This lets the LLM discover patterns like "buttons in Stories region".
   * Now includes content preview for interest matching.
   */
  groupElementsByContainer(elements) {
    const containers = /* @__PURE__ */ new Map();
    for (const elem of elements) {
      const containerKey = elem.containerRole ? `${elem.containerRole}${elem.containerName ? ` "${elem.containerName}"` : ""}` : "root";
      if (!containers.has(containerKey)) {
        containers.set(containerKey, []);
      }
      containers.get(containerKey).push(elem);
    }
    const parts = [];
    for (const [containerKey, elems] of containers) {
      const siblingInfo = elems[0]?.siblingCount ? ` (${elems[0].siblingCount} siblings)` : "";
      parts.push(`[${containerKey}${siblingInfo}]`);
      for (const e of elems) {
        const hint = e.semanticHint ? ` \u26A0\uFE0F${e.semanticHint}` : "";
        const depth = e.depth !== void 0 ? ` depth=${e.depth}` : "";
        parts.push(`  id:${e.id} ${e.role} "${e.name}" Y=${e.position.y}${hint}${depth}`);
        if (e.contentPreview) {
          const cp = e.contentPreview;
          if (cp.captionText) {
            parts.push(`    Caption: "${cp.captionText}"`);
          }
          if (cp.engagement) {
            const engParts = [];
            if (cp.engagement.likes) engParts.push(cp.engagement.likes);
            if (cp.engagement.comments) engParts.push(cp.engagement.comments);
            if (engParts.length > 0) {
              parts.push(`    Engagement: ${engParts.join(", ")}`);
            }
          }
          if (cp.hashtags && cp.hashtags.length > 0) {
            parts.push(`    Tags: #${cp.hashtags.join(", #")}`);
          }
          if (cp.altText) {
            parts.push(`    Alt: "${cp.altText}"`);
          }
        }
      }
      parts.push("");
    }
    return parts.join("\n").trim();
  }
  /**
   * Make a navigation decision using the LLM.
   *
   * @param context - Current navigation context
   * @param elements - Visible elements from accessibility tree
   * @returns Navigation decision or fallback if LLM fails
   */
  async decideAction(context, elements) {
    if (elements.length === 0) {
      return this.fallbackDecision(context, elements, "No elements visible");
    }
    try {
      const rawDecision = await this.callLLM(context, elements);
      this.decisionCount++;
      const estimatedCost = this.decisionCount * 1e-3;
      const validated = this.validateDecision(rawDecision, elements);
      if (this.debug) {
        console.log("\n\u{1F9E0} === LLM REASONING ===");
        console.log(`Decision #${this.decisionCount} (est. cost: $${estimatedCost.toFixed(4)})`);
        if (rawDecision.action !== validated.action) {
          console.log(`Action: ${rawDecision.action} \u2192 ${validated.action} (safety modified)`);
        } else {
          console.log(`Action: ${validated.action}`);
        }
        console.log(`Reasoning: ${validated.reasoning}`);
        console.log(`Expected: ${validated.expectedOutcome}`);
        console.log(`Confidence: ${validated.confidence ?? "N/A"}`);
        if (validated.capture) {
          console.log(`\u{1F4F8} Capture: ${validated.capture.shouldCapture ? "YES" : "NO"} - ${validated.capture.reason || "no reason"}`);
        } else {
          console.log(`\u{1F4F8} Capture: NOT SIGNALED`);
        }
        if (validated.strategic) {
          console.log("\u{1F3AF} === STRATEGIC DECISIONS ===");
          if (validated.strategic.switchPhase) {
            console.log(`  Phase: SWITCH TO ${validated.strategic.switchPhase}`);
          }
          if (validated.strategic.terminateSession) {
            console.log(`  \u23F9\uFE0F TERMINATE SESSION`);
          }
          if (validated.strategic.captureNow) {
            console.log(`  \u{1F4F8} Capture viewport NOW`);
          }
          if (validated.strategic.lingerDuration) {
            console.log(`  \u23F1\uFE0F Linger: ${validated.strategic.lingerDuration}`);
          }
          if (validated.strategic.reason) {
            console.log(`  Reason: ${validated.strategic.reason}`);
          }
        }
        console.log("========================\n");
      }
      return validated;
    } catch (error) {
      console.warn("NavigationLLM call failed, using fallback:", error);
      return this.fallbackDecision(context, elements, String(error));
    }
  }
  /**
   * Call the LLM API.
   */
  async callLLM(context, elements) {
    const userPrompt = this.buildUserPrompt(context, elements);
    if (this.debug) {
      console.log("\n\u{1F4CA} === ACCESSIBILITY CONTEXT FOR LLM ===");
      console.log(userPrompt);
      console.log("========================================\n");
    }
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${this.apiKey}`
      },
      body: JSON.stringify({
        model: this.model,
        messages: [
          { role: "system", content: this.getSystemPrompt() },
          { role: "user", content: userPrompt }
        ],
        response_format: { type: "json_object" },
        max_tokens: this.maxTokens,
        temperature: this.temperature
      })
    });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`LLM API error: ${response.status} - ${errorText}`);
    }
    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error("Empty LLM response");
    }
    const parsed = JSON.parse(content);
    return parsed;
  }
  /**
   * Validate and sanitize the LLM decision.
   */
  validateDecision(decision, elements) {
    const validActions = ["click", "scroll", "type", "press", "wait", "hover", "back", "clear"];
    if (!validActions.includes(decision.action)) {
      return {
        ...decision,
        action: "wait",
        params: { seconds: 2 },
        reasoning: `Invalid action "${decision.action}", defaulting to wait`
      };
    }
    if (decision.action === "click") {
      const clickParams = decision.params;
      const targetElement = elements.find((e) => e.id === clickParams.id);
      if (!targetElement) {
        return {
          ...decision,
          action: "scroll",
          params: { direction: "down", amount: "medium" },
          reasoning: `Click target id=${clickParams.id} not found, scrolling instead`
        };
      }
      const forbiddenHints = [
        "like_button",
        "comment_button",
        "share_button",
        "save_button",
        "follow_button"
      ];
      if (targetElement.semanticHint && forbiddenHints.includes(targetElement.semanticHint)) {
        console.log(`  \u{1F6E1}\uFE0F Safety: click on ${targetElement.semanticHint} \u2192 scroll (forbidden element)`);
        return {
          ...decision,
          action: "scroll",
          params: { direction: "down", amount: "small" },
          reasoning: `SAFETY: Blocked interaction with ${targetElement.semanticHint}, scrolling instead`
        };
      }
      if (!decision.capture) {
        const nameLower = targetElement.name.toLowerCase();
        const isPostLike = nameLower.includes("photo") || nameLower.includes("video") || nameLower.includes("shared by") || targetElement.containerRole === "article";
        if (isPostLike) {
          decision.capture = {
            shouldCapture: true,
            targetId: clickParams.id,
            reason: `Auto-capture: clicked post element "${targetElement.name.slice(0, 30)}..."`
          };
          console.log(`\u{1F4F8} Auto-added capture for post click: id=${clickParams.id}`);
        }
      }
    }
    if (decision.action === "type") {
      for (const elem of elements) {
        if (elem.role === "textbox" || elem.role === "searchbox") {
          const containerName = elem.containerName?.toLowerCase() || "";
          const inputName = elem.name?.toLowerCase() || "";
          if (containerName.includes("message") || containerName.includes("direct") || containerName.includes("inbox") || containerName.includes("chat")) {
            console.log(`  \u{1F6E1}\uFE0F Safety: type in "${elem.containerName}" \u2192 Escape (message context)`);
            return {
              ...decision,
              action: "press",
              params: { key: "Escape" },
              reasoning: `SAFETY: Blocked typing in message context "${elem.containerName}", pressing Escape to exit`
            };
          }
          if (containerName.includes("comment") || inputName.includes("comment") || inputName.includes("reply") || inputName.includes("add a comment")) {
            console.log(`  \u{1F6E1}\uFE0F Safety: type in "${inputName}" \u2192 Escape (comment context)`);
            return {
              ...decision,
              action: "press",
              params: { key: "Escape" },
              reasoning: `SAFETY: Blocked typing in comment context "${inputName}", pressing Escape to exit`
            };
          }
        }
      }
    }
    if (decision.action === "scroll") {
      const scrollParams = decision.params;
      if (!["up", "down", "left", "right"].includes(scrollParams.direction)) {
        scrollParams.direction = "down";
      }
      if (!["small", "medium", "large", "xlarge"].includes(scrollParams.amount)) {
        scrollParams.amount = "medium";
      }
    }
    if (decision.action === "press") {
      const pressParams = decision.params;
      const validKeys = [
        "Escape",
        "Enter",
        "Backspace",
        "Delete",
        "Space",
        "ArrowRight",
        "ArrowLeft",
        "ArrowUp",
        "ArrowDown",
        "Tab",
        "Home",
        "End",
        "PageUp",
        "PageDown"
      ];
      if (!validKeys.includes(pressParams.key)) {
        return {
          ...decision,
          action: "wait",
          params: { seconds: 1 },
          reasoning: `Invalid key "${pressParams.key}", defaulting to wait`
        };
      }
    }
    if (decision.action === "hover") {
      const hoverParams = decision.params;
      const targetElement = elements.find((e) => e.id === hoverParams.id);
      if (!targetElement) {
        return {
          ...decision,
          action: "wait",
          params: { seconds: 1 },
          reasoning: `Hover target id=${hoverParams.id} not found, defaulting to wait`
        };
      }
    }
    if (decision.action === "wait") {
      const waitParams = decision.params;
      waitParams.seconds = Math.max(1, Math.min(5, waitParams.seconds || 2));
    }
    return decision;
  }
  /**
   * Fallback decision when LLM fails or is unavailable.
   * Uses escalating strategies based on recent action patterns.
   */
  fallbackDecision(context, elements, reason) {
    const recent = context.recentActions.slice(-15);
    const scrollPositions = recent.filter((a) => a.scrollY !== void 0).map((a) => a.scrollY);
    const scrollStagnant = scrollPositions.length >= 2 && scrollPositions.every((p) => p === scrollPositions[0]);
    if (scrollStagnant) {
      return {
        reasoning: `Fallback: ${reason}. Scroll position stuck, trying escape.`,
        action: "press",
        params: { key: "Escape" },
        expectedOutcome: "Close any blocking overlay",
        confidence: 0.3
      };
    }
    const recentFailures = recent.filter((a) => !a.success).length;
    if (recentFailures >= 3) {
      return {
        reasoning: `Fallback: ${reason}. Multiple failures, navigating back.`,
        action: "back",
        params: {},
        expectedOutcome: "Return to previous page",
        confidence: 0.2
      };
    }
    return {
      reasoning: `Fallback: ${reason}. Scrolling to find more content.`,
      action: "scroll",
      params: { direction: "down", amount: "medium" },
      expectedOutcome: "More content should become visible",
      confidence: 0.3
    };
  }
  /**
   * Get the number of decisions made this session.
   */
  getDecisionCount() {
    return this.decisionCount;
  }
  /**
   * Get estimated cost based on decisions made.
   */
  getEstimatedCost() {
    return this.decisionCount * 1e-3;
  }
  /**
   * Reset decision count (for new session).
   */
  reset() {
    this.decisionCount = 0;
    this.sessionJitter = 0.85 + Math.random() * 0.3;
  }
};

// src/main/services/NavigationExecutor.ts
var SCROLL_AMOUNTS = {
  small: 150,
  medium: 400,
  large: 700,
  xlarge: 1200
};
var LINGER_DURATIONS = {
  short: 1e3,
  // 1 second - for navigation, skipping
  medium: 3e3,
  // 3 seconds - normal engagement
  long: 6e3,
  // 6 seconds - deep engagement, videos
  xlong: 12e3
  // 12 seconds - very deep engagement
};
var NavigationExecutor = class {
  page;
  ghost;
  scroll;
  navigator;
  // Action history for loop detection
  actionHistory = [];
  maxHistorySize = 50;
  // Session-level timing randomization
  sessionDelayMultiplier;
  constructor(page, ghost, scroll, navigator) {
    this.page = page;
    this.ghost = ghost;
    this.scroll = scroll;
    this.navigator = navigator;
    this.sessionDelayMultiplier = 0.75 + Math.random() * 0.5;
  }
  /**
   * Execute a navigation decision.
   *
   * @param decision - The LLM's navigation decision
   * @param elements - Current visible elements (for click target lookup)
   * @returns Execution result with success status and details
   */
  async execute(decision, elements) {
    const startTime = Date.now();
    try {
      switch (decision.action) {
        case "click":
          return await this.executeClick(decision, elements, startTime);
        case "scroll":
          return await this.executeScroll(decision, startTime);
        case "type":
          return await this.executeType(decision, startTime);
        case "press":
          return await this.executePress(decision, startTime);
        case "wait":
          return await this.executeWait(decision, startTime);
        case "hover":
          return await this.executeHover(decision, elements, startTime);
        case "back":
          return await this.executeBack(decision, startTime);
        case "clear":
          return await this.executeClear(decision, startTime);
        default:
          return this.failureResult(
            decision,
            startTime,
            `Unknown action: ${decision.action}`
          );
      }
    } catch (error) {
      return this.failureResult(
        decision,
        startTime,
        error instanceof Error ? error.message : String(error)
      );
    }
  }
  /**
   * Execute a click action with optional gaze anchors.
   * Returns the clicked element info for potential capture.
   * Includes post-click verification to detect if click caused a state change.
   */
  async executeClick(decision, elements, startTime) {
    const params = decision.params;
    let target = elements.find((e) => e.id === params.id);
    if (!target) {
      return this.failureResult(decision, startTime, `Element id=${params.id} not found`);
    }
    if (params.expectedName) {
      const expectedLower = params.expectedName.toLowerCase();
      const targetLower = target.name.toLowerCase();
      const nameMatches = targetLower.includes(expectedLower) || expectedLower.includes(targetLower);
      if (!nameMatches) {
        const byName = elements.find(
          (e) => e.name.toLowerCase().includes(expectedLower) || expectedLower.includes(e.name.toLowerCase())
        );
        if (byName) {
          console.warn(`\u26A0\uFE0F Element ID mismatch: id:${params.id} is "${target.name}", but LLM expected "${params.expectedName}". Corrected to id:${byName.id} "${byName.name}"`);
          target = byName;
        } else {
          console.warn(`\u26A0\uFE0F Element ID mismatch: id:${params.id} is "${target.name}", LLM expected "${params.expectedName}". No name match found, using original ID.`);
        }
      }
    }
    const boundingBox = target.boundingBox;
    if (!boundingBox) {
      return this.failureResult(decision, startTime, `Element id=${params.id} has no bounding box`);
    }
    const preClickUrl = this.page.url();
    const preClickState = await this.getQuickDOMSignature();
    await this.ghost.clickElement(boundingBox);
    await this.humanDelay(200, 500);
    const postClickUrl = this.page.url();
    const postClickState = await this.getQuickDOMSignature();
    let verified = "no_change_detected";
    if (preClickUrl !== postClickUrl) {
      verified = "url_changed";
    } else if (preClickState !== postClickState) {
      verified = "dom_changed";
    }
    const record = this.recordAction(decision, true, void 0, {
      url: postClickUrl,
      verified,
      clickedElementName: target.name
    });
    return {
      success: true,
      actionTaken: "click",
      params,
      resultingUrl: postClickUrl,
      durationMs: Date.now() - startTime,
      // Return the clicked element info for capture
      focusedElement: {
        id: target.id,
        boundingBox,
        name: target.name
      },
      verified
    };
  }
  /**
   * Execute a scroll action.
   */
  async executeScroll(decision, startTime) {
    const params = decision.params;
    const baseDistance = SCROLL_AMOUNTS[params.amount] || SCROLL_AMOUNTS.medium;
    if (params.direction === "left" || params.direction === "right") {
      const deltaX = params.direction === "right" ? baseDistance : -baseDistance;
      await this.page.mouse.wheel(deltaX, 0);
      await this.humanDelay(300, 600);
    } else {
      const direction = params.direction === "up" ? -1 : 1;
      await this.scroll.scroll({
        baseDistance: baseDistance * direction,
        variability: 0.3,
        readingPauseMs: [500, 1500]
        // Shorter pause for navigation
      });
    }
    const scrollYAfter = await this.scroll.getScrollPosition();
    this.recordAction(decision, true, void 0, {
      scrollY: scrollYAfter,
      url: this.page.url()
    });
    return {
      success: true,
      actionTaken: "scroll",
      params,
      resultingUrl: this.page.url(),
      durationMs: Date.now() - startTime
    };
  }
  /**
   * Execute a type action.
   */
  async executeType(decision, startTime) {
    const params = decision.params;
    const focusedInput = await this.page.evaluate(() => {
      const el = document.activeElement;
      if (!el) return null;
      const tag = el.tagName.toLowerCase();
      const role = el.getAttribute("role");
      const isEditable = el.getAttribute("contenteditable") === "true";
      const isInput = tag === "input" || tag === "textarea" || role === "textbox" || role === "searchbox" || role === "combobox" || isEditable;
      return isInput ? el.getAttribute("aria-label") || el.getAttribute("placeholder") || tag : null;
    }).catch(() => null);
    if (!focusedInput) {
      console.warn(`\u26A0\uFE0F Type action failed: no text input is focused. Text "${params.text}" would go nowhere.`);
      this.recordAction(decision, false, "No text input focused", { url: this.page.url(), verified: "no_change_detected" });
      return {
        success: false,
        actionTaken: "type",
        params,
        errorMessage: "No text input focused \u2014 click a search/text field first",
        resultingUrl: this.page.url(),
        durationMs: Date.now() - startTime,
        verified: "no_change_detected"
      };
    }
    const preTypeState = await this.getQuickDOMSignature();
    for (const char of params.text) {
      await this.page.keyboard.type(char);
      await this.humanDelay(50, 150);
    }
    await this.humanDelay(300, 600);
    const postTypeState = await this.getQuickDOMSignature();
    const verified = preTypeState !== postTypeState ? "dom_changed" : "no_change_detected";
    this.recordAction(decision, true, void 0, { url: this.page.url(), verified });
    return {
      success: true,
      actionTaken: "type",
      params,
      resultingUrl: this.page.url(),
      durationMs: Date.now() - startTime,
      verified
    };
  }
  /**
   * Execute a key press action.
   */
  async executePress(decision, startTime) {
    const params = decision.params;
    await this.page.keyboard.press(params.key);
    await this.humanDelay(200, 400);
    this.recordAction(decision, true, void 0, { url: this.page.url() });
    return {
      success: true,
      actionTaken: "press",
      params,
      resultingUrl: this.page.url(),
      durationMs: Date.now() - startTime
    };
  }
  /**
   * Execute a wait action.
   */
  async executeWait(decision, startTime) {
    const params = decision.params;
    const waitMs = params.seconds * 1e3 * this.sessionDelayMultiplier;
    await new Promise((resolve) => setTimeout(resolve, waitMs));
    this.recordAction(decision, true, void 0, { url: this.page.url() });
    return {
      success: true,
      actionTaken: "wait",
      params,
      resultingUrl: this.page.url(),
      durationMs: Date.now() - startTime
    };
  }
  /**
   * Execute a hover action using GhostMouse.
   */
  async executeHover(decision, elements, startTime) {
    const params = decision.params;
    let target = elements.find((e) => e.id === params.id);
    if (!target) {
      return this.failureResult(decision, startTime, `Element id=${params.id} not found`);
    }
    if (params.expectedName) {
      const expectedLower = params.expectedName.toLowerCase();
      const targetLower = target.name.toLowerCase();
      const nameMatches = targetLower.includes(expectedLower) || expectedLower.includes(targetLower);
      if (!nameMatches) {
        const byName = elements.find(
          (e) => e.name.toLowerCase().includes(expectedLower) || expectedLower.includes(e.name.toLowerCase())
        );
        if (byName) {
          console.warn(`\u26A0\uFE0F Hover ID mismatch: id:${params.id} is "${target.name}", but LLM expected "${params.expectedName}". Corrected to id:${byName.id} "${byName.name}"`);
          target = byName;
        }
      }
    }
    const boundingBox = target.boundingBox;
    if (!boundingBox) {
      return this.failureResult(decision, startTime, `Element id=${params.id} has no bounding box`);
    }
    await this.ghost.hoverElement(boundingBox);
    this.recordAction(decision, true, void 0, { url: this.page.url(), clickedElementName: target.name });
    return {
      success: true,
      actionTaken: "hover",
      params,
      resultingUrl: this.page.url(),
      durationMs: Date.now() - startTime,
      focusedElement: {
        id: target.id,
        boundingBox,
        name: target.name
      }
    };
  }
  /**
   * Execute a browser back navigation.
   */
  async executeBack(decision, startTime) {
    await this.page.goBack({ waitUntil: "domcontentloaded" });
    await this.humanDelay(500, 1e3);
    this.recordAction(decision, true, void 0, { url: this.page.url() });
    return {
      success: true,
      actionTaken: "back",
      params: {},
      resultingUrl: this.page.url(),
      durationMs: Date.now() - startTime
    };
  }
  /**
   * Execute a clear action (select all + delete on currently focused input).
   */
  async executeClear(decision, startTime) {
    const modifier = process.platform === "darwin" ? "Meta" : "Control";
    await this.page.keyboard.press(`${modifier}+a`);
    await this.humanDelay(50, 150);
    await this.page.keyboard.press("Backspace");
    await this.humanDelay(200, 400);
    this.recordAction(decision, true, void 0, { url: this.page.url() });
    return {
      success: true,
      actionTaken: "clear",
      params: {},
      resultingUrl: this.page.url(),
      durationMs: Date.now() - startTime
    };
  }
  /**
   * Create a failure result.
   */
  failureResult(decision, startTime, errorMessage) {
    this.recordAction(decision, false, errorMessage);
    return {
      success: false,
      actionTaken: decision.action,
      params: decision.params,
      errorMessage,
      durationMs: Date.now() - startTime
    };
  }
  /**
   * Record an action to history with optional state context.
   */
  recordAction(decision, success, errorMessage, stateContext) {
    const record = {
      timestamp: Date.now(),
      action: decision.action,
      params: decision.params,
      success,
      errorMessage,
      ...stateContext || {}
    };
    this.actionHistory.push(record);
    if (this.actionHistory.length > this.maxHistorySize) {
      this.actionHistory = this.actionHistory.slice(-this.maxHistorySize);
    }
    return record;
  }
  /**
   * Get recent action history.
   */
  getRecentActions(count = 10) {
    return this.actionHistory.slice(-count);
  }
  /**
   * Check if we're in a loop (repeating same actions).
   * Returns severity level for escalating recovery.
   */
  isInLoop(lookback = 6) {
    if (this.actionHistory.length < lookback) return { inLoop: false, severity: "mild" };
    const recent = this.actionHistory.slice(-lookback);
    const scrollActions = recent.filter((a) => a.action === "scroll" && a.scrollY !== void 0);
    if (scrollActions.length >= 3) {
      const positions = scrollActions.map((a) => a.scrollY);
      const allSamePosition = positions.every((p) => p === positions[0]);
      if (allSamePosition) return { inLoop: true, severity: "severe" };
    }
    const noChangeActions = recent.filter((a) => a.verified === "no_change_detected");
    if (noChangeActions.length >= 4) return { inLoop: true, severity: "moderate" };
    const allSameAction = recent.every((a) => a.action === recent[0].action);
    if (allSameAction && recent[0].action !== "scroll") {
      const failureRate = recent.filter((a) => !a.success).length / recent.length;
      if (failureRate > 0.5) return { inLoop: true, severity: "moderate" };
    }
    const clickFailures = recent.filter((a) => a.action === "click" && !a.success);
    if (clickFailures.length >= 3) return { inLoop: true, severity: "moderate" };
    return { inLoop: false, severity: "mild" };
  }
  /**
   * Get escalating recovery action based on loop severity.
   */
  getRecoveryAction(severity) {
    switch (severity) {
      case "mild":
        return { action: "press", key: "Escape", reason: "Close any overlay" };
      case "moderate":
        return { action: "back", reason: "Navigate back to previous page" };
      case "severe":
        return { action: "navigate_home", reason: "Return to feed - page is stuck" };
    }
  }
  /**
   * Human-like delay with session variance.
   */
  humanDelay(minMs, maxMs) {
    const baseDelay = minMs + Math.random() * (maxMs - minMs);
    const adjustedDelay = baseDelay * this.sessionDelayMultiplier;
    return new Promise((resolve) => setTimeout(resolve, adjustedDelay));
  }
  /**
   * Get a quick DOM state signature for click verification.
   * Captures lightweight signals: dialog count, article count, and scroll position.
   * Cost: ~1-2ms (single evaluate call)
   */
  async getQuickDOMSignature() {
    try {
      return await this.page.evaluate(() => {
        const dialogs = document.querySelectorAll('[role="dialog"]').length;
        const articles = document.querySelectorAll("article").length;
        const scrollY = Math.round(window.scrollY / 50);
        return `d${dialogs}:a${articles}:s${scrollY}`;
      });
    } catch {
      return "unknown";
    }
  }
  /**
   * Reset executor state (for new session).
   */
  reset() {
    this.actionHistory = [];
    this.sessionDelayMultiplier = 0.75 + Math.random() * 0.5;
  }
  /**
   * Get action history for debugging.
   */
  getActionHistory() {
    return [...this.actionHistory];
  }
  /**
   * Execute linger duration from strategic decision.
   * This is the LLM-controlled pacing mechanism.
   *
   * @param strategic - The strategic decision containing linger duration
   */
  async executeLinger(strategic) {
    if (!strategic?.lingerDuration) {
      return;
    }
    const baseDuration = LINGER_DURATIONS[strategic.lingerDuration] || LINGER_DURATIONS.medium;
    const duration = baseDuration * this.sessionDelayMultiplier;
    console.log(`  \u23F1\uFE0F Lingering for ${(duration / 1e3).toFixed(1)}s (${strategic.lingerDuration})`);
    await new Promise((resolve) => setTimeout(resolve, duration));
  }
  /**
   * Get the linger duration in milliseconds for a given level.
   *
   * @param level - 'short' | 'medium' | 'long'
   * @returns Duration in milliseconds with session variance
   */
  getLingerDurationMs(level) {
    const baseDuration = LINGER_DURATIONS[level] || LINGER_DURATIONS.medium;
    return baseDuration * this.sessionDelayMultiplier;
  }
};

// src/main/services/DebugOverlay.ts
var DEFAULT_CONFIG4 = {
  showElementHighlights: false,
  highlightDurationMs: 500,
  panelPosition: "top-right"
};
var DEBUG_PANEL_CSS = `
#kowalski-debug-panel {
    position: fixed;
    top: 10px;
    right: 10px;
    width: 320px;
    max-height: 90vh;
    overflow-y: auto;
    background: rgba(0, 0, 0, 0.92);
    color: #00ffff;
    font-family: 'SF Mono', 'Monaco', 'Menlo', 'Consolas', monospace;
    font-size: 11px;
    line-height: 1.4;
    padding: 12px;
    border: 2px solid #00ffff;
    border-radius: 8px;
    z-index: 99999;
    pointer-events: none;
    box-shadow: 0 0 20px rgba(0, 255, 255, 0.3);
}

#kowalski-debug-panel .debug-header {
    font-size: 13px;
    font-weight: bold;
    margin-bottom: 10px;
    padding-bottom: 8px;
    border-bottom: 1px solid #00ffff;
    display: flex;
    align-items: center;
    gap: 8px;
}

#kowalski-debug-panel .debug-section {
    margin-bottom: 10px;
    padding-bottom: 8px;
    border-bottom: 1px solid rgba(0, 255, 255, 0.3);
}

#kowalski-debug-panel .debug-section:last-child {
    border-bottom: none;
    margin-bottom: 0;
    padding-bottom: 0;
}

#kowalski-debug-panel .debug-label {
    color: #888;
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-bottom: 2px;
}

#kowalski-debug-panel .debug-value {
    color: #fff;
    font-size: 12px;
}

#kowalski-debug-panel .debug-value.highlight {
    color: #00ff00;
}

#kowalski-debug-panel .debug-value.warning {
    color: #ffff00;
}

#kowalski-debug-panel .debug-value.error {
    color: #ff4444;
}

#kowalski-debug-panel .debug-row {
    display: flex;
    justify-content: space-between;
    margin-bottom: 4px;
}

#kowalski-debug-panel .debug-reasoning {
    color: #aaa;
    font-style: italic;
    font-size: 10px;
    word-wrap: break-word;
    max-height: 60px;
    overflow-y: auto;
}

#kowalski-debug-panel .debug-target-box {
    background: rgba(0, 255, 255, 0.1);
    border: 1px solid rgba(0, 255, 255, 0.5);
    border-radius: 4px;
    padding: 6px;
    margin-top: 6px;
}

#kowalski-debug-canvas {
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    z-index: 99998;
    pointer-events: none;
}
`;
var DebugOverlay = class {
  page;
  enabled = false;
  config;
  constructor(page, config) {
    this.page = page;
    this.config = { ...DEFAULT_CONFIG4, ...config };
  }
  /**
   * Enable the debug overlay by injecting CSS and canvas.
   */
  async enable() {
    if (this.enabled) return;
    try {
      await this.page.addStyleTag({ content: DEBUG_PANEL_CSS });
      await this.page.evaluate(() => {
        const existing = document.getElementById("kowalski-debug-panel");
        if (existing) existing.remove();
        const panel = document.createElement("div");
        panel.id = "kowalski-debug-panel";
        panel.innerHTML = `
                    <div class="debug-header">
                        \u{1F50D} KOWALSKI DEBUG
                    </div>
                    <div class="debug-content">
                        <div class="debug-section">
                            <div class="debug-label">Status</div>
                            <div class="debug-value">Initializing...</div>
                        </div>
                    </div>
                `;
        document.body.appendChild(panel);
      });
      await this.page.evaluate(() => {
        const existing = document.getElementById("kowalski-debug-canvas");
        if (existing) existing.remove();
        const canvas = document.createElement("canvas");
        canvas.id = "kowalski-debug-canvas";
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
        document.body.appendChild(canvas);
        window.addEventListener("resize", () => {
          canvas.width = window.innerWidth;
          canvas.height = window.innerHeight;
        });
      });
      this.enabled = true;
      console.log("  \u{1F50D} Debug overlay enabled");
    } catch (error) {
      console.error("  \u274C Failed to enable debug overlay:", error);
    }
  }
  /**
   * Disable and remove the debug overlay.
   */
  async disable() {
    if (!this.enabled) return;
    try {
      await this.page.evaluate(() => {
        const panel = document.getElementById("kowalski-debug-panel");
        if (panel) panel.remove();
        const canvas = document.getElementById("kowalski-debug-canvas");
        if (canvas) canvas.remove();
      });
      this.enabled = false;
      console.log("  \u{1F50D} Debug overlay disabled");
    } catch (error) {
    }
  }
  /**
   * Update the debug panel with current state.
   */
  async updateState(state) {
    if (!this.enabled) return;
    const html = this.formatStateHtml(state);
    try {
      await this.page.evaluate((htmlContent) => {
        const panel = document.getElementById("kowalski-debug-panel");
        if (panel) {
          const content = panel.querySelector(".debug-content");
          if (content) {
            content.innerHTML = htmlContent;
          }
        }
      }, html);
    } catch (error) {
    }
  }
  /**
   * Format state into HTML for the debug panel.
   */
  formatStateHtml(state) {
    const timeRemaining = Math.max(0, Math.floor(state.timeRemainingMs / 1e3));
    const minutes = Math.floor(timeRemaining / 60);
    const seconds = timeRemaining % 60;
    const timeStr = `${minutes}:${seconds.toString().padStart(2, "0")}`;
    const timeClass = timeRemaining < 60 ? "warning" : timeRemaining < 30 ? "error" : "";
    const engagementEmoji = {
      "feed": "\u{1F4DC}",
      "post_modal": "\u{1F5BC}\uFE0F",
      "comments": "\u{1F4AC}",
      "profile": "\u{1F464}"
    }[state.engagementLevel] || "\u2753";
    const phaseEmoji = {
      "search": "\u{1F50D}",
      "stories": "\u{1F4D6}",
      "feed": "\u{1F4DC}",
      "complete": "\u2705"
    }[state.phase] || "\u2753";
    const actionEmoji = {
      "click": "\u{1F446}",
      "scroll": "\u{1F4DC}",
      "type": "\u2328\uFE0F",
      "press": "\u23CE",
      "wait": "\u23F3"
    }[state.action] || "\u2753";
    const confidence = state.confidence ?? 0;
    const confidencePercent = Math.round(confidence * 100);
    const confidenceClass = confidence >= 0.8 ? "highlight" : confidence >= 0.5 ? "" : "warning";
    let carouselStr = "";
    if (state.carouselState) {
      carouselStr = `Slide ${state.carouselState.currentSlide}/${state.carouselState.totalSlides}`;
    }
    return `
            <!-- Session Section -->
            <div class="debug-section">
                <div class="debug-row">
                    <span><span class="debug-label">Phase</span> ${phaseEmoji} ${state.phase.toUpperCase()}</span>
                    <span class="${timeClass}">${timeStr}</span>
                </div>
                <div class="debug-row">
                    <span><span class="debug-label">Captures</span> ${state.captureCount}</span>
                    <span><span class="debug-label">Posts</span> ${state.postsCollected}</span>
                </div>
                <div class="debug-row">
                    <span><span class="debug-label">Actions left</span> ${state.actionsRemaining}</span>
                </div>
            </div>

            <!-- Engagement Section -->
            <div class="debug-section">
                <div class="debug-label">Engagement</div>
                <div class="debug-value">${engagementEmoji} ${state.engagementLevel}</div>
                ${carouselStr ? `<div class="debug-value">\u{1F3A0} ${carouselStr}</div>` : ""}
                ${state.currentPostUsername ? `<div class="debug-value">\u{1F464} @${state.currentPostUsername}</div>` : ""}
            </div>

            <!-- Action Section -->
            <div class="debug-section">
                <div class="debug-label">Action</div>
                <div class="debug-value highlight">${actionEmoji} ${state.action.toUpperCase()}</div>
                ${state.targetId !== void 0 ? `
                    <div class="debug-target-box">
                        <div class="debug-row">
                            <span class="debug-label">Target ID</span>
                            <span class="debug-value">#${state.targetId}</span>
                        </div>
                        ${state.targetRole ? `
                            <div class="debug-row">
                                <span class="debug-label">Role</span>
                                <span class="debug-value">${state.targetRole}</span>
                            </div>
                        ` : ""}
                        ${state.targetName ? `
                            <div class="debug-row">
                                <span class="debug-label">Name</span>
                                <span class="debug-value" style="word-break: break-word;">"${this.truncate(state.targetName, 40)}"</span>
                            </div>
                        ` : ""}
                    </div>
                ` : ""}
                <div class="debug-row" style="margin-top: 6px;">
                    <span class="debug-label">Confidence</span>
                    <span class="debug-value ${confidenceClass}">${confidencePercent}%</span>
                </div>
            </div>

            <!-- Reasoning Section -->
            <div class="debug-section">
                <div class="debug-label">Reasoning</div>
                <div class="debug-reasoning">${this.escapeHtml(state.reasoning)}</div>
            </div>
        `;
  }
  /**
   * Highlight a specific element with a colored rectangle.
   */
  async highlightElement(bounds, label, color = "#00ffff") {
    if (!this.enabled) return;
    try {
      await this.page.evaluate(({ bounds: bounds2, label: label2, color: color2 }) => {
        const canvas = document.getElementById("kowalski-debug-canvas");
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.strokeStyle = color2;
        ctx.lineWidth = 3;
        ctx.setLineDash([5, 5]);
        ctx.strokeRect(bounds2.x, bounds2.y, bounds2.width, bounds2.height);
        ctx.font = "bold 12px monospace";
        const textMetrics = ctx.measureText(label2);
        const textHeight = 16;
        const padding = 4;
        const labelX = bounds2.x;
        const labelY = bounds2.y - textHeight - padding * 2;
        ctx.fillStyle = "rgba(0, 0, 0, 0.8)";
        ctx.fillRect(
          labelX - padding,
          labelY - padding,
          textMetrics.width + padding * 2,
          textHeight + padding * 2
        );
        ctx.fillStyle = color2;
        ctx.fillText(label2, labelX, labelY + textHeight - 2);
      }, { bounds, label, color });
    } catch (error) {
    }
  }
  /**
   * Show a crosshair at the click target point.
   */
  async showClickTarget(point, label) {
    if (!this.enabled) return;
    try {
      await this.page.evaluate(({ x, y, label: label2 }) => {
        const canvas = document.getElementById("kowalski-debug-canvas");
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        const crosshairSize = 20;
        const color = "#ff0000";
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(x - crosshairSize, y);
        ctx.lineTo(x + crosshairSize, y);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x, y - crosshairSize);
        ctx.lineTo(x, y + crosshairSize);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(x, y, 8, 0, Math.PI * 2);
        ctx.stroke();
        if (label2) {
          ctx.font = "bold 11px monospace";
          ctx.fillStyle = "rgba(0, 0, 0, 0.8)";
          ctx.fillRect(x + 15, y - 8, ctx.measureText(label2).width + 8, 18);
          ctx.fillStyle = color;
          ctx.fillText(label2, x + 19, y + 5);
        }
      }, { x: point.x, y: point.y, label });
    } catch (error) {
    }
  }
  /**
   * Draw trajectory arrow from current position to target.
   */
  async showTrajectory(from, to) {
    if (!this.enabled) return;
    try {
      await this.page.evaluate(({ from: from2, to: to2 }) => {
        const canvas = document.getElementById("kowalski-debug-canvas");
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.strokeStyle = "rgba(255, 255, 0, 0.6)";
        ctx.lineWidth = 2;
        ctx.setLineDash([8, 4]);
        ctx.beginPath();
        ctx.moveTo(from2.x, from2.y);
        ctx.lineTo(to2.x, to2.y);
        ctx.stroke();
        const angle = Math.atan2(to2.y - from2.y, to2.x - from2.x);
        const arrowSize = 12;
        ctx.setLineDash([]);
        ctx.fillStyle = "rgba(255, 255, 0, 0.8)";
        ctx.beginPath();
        ctx.moveTo(to2.x, to2.y);
        ctx.lineTo(
          to2.x - arrowSize * Math.cos(angle - Math.PI / 6),
          to2.y - arrowSize * Math.sin(angle - Math.PI / 6)
        );
        ctx.lineTo(
          to2.x - arrowSize * Math.cos(angle + Math.PI / 6),
          to2.y - arrowSize * Math.sin(angle + Math.PI / 6)
        );
        ctx.closePath();
        ctx.fill();
      }, { from, to });
    } catch (error) {
    }
  }
  /**
   * Highlight multiple elements (for showing all visible elements).
   */
  async highlightAllElements(elements) {
    if (!this.enabled || !this.config.showElementHighlights) return;
    try {
      await this.page.evaluate((els) => {
        const canvas = document.getElementById("kowalski-debug-canvas");
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        for (const el of els) {
          if (!el.boundingBox) continue;
          let color = "rgba(100, 100, 100, 0.3)";
          if (el.role === "button") color = "rgba(0, 255, 255, 0.3)";
          else if (el.role === "link") color = "rgba(255, 255, 0, 0.3)";
          else if (el.role === "textbox") color = "rgba(255, 100, 100, 0.3)";
          ctx.strokeStyle = color;
          ctx.lineWidth = 1;
          ctx.setLineDash([]);
          ctx.strokeRect(
            el.boundingBox.x,
            el.boundingBox.y,
            el.boundingBox.width,
            el.boundingBox.height
          );
          ctx.font = "9px monospace";
          ctx.fillStyle = color;
          ctx.fillText(`#${el.id}`, el.boundingBox.x + 2, el.boundingBox.y + 10);
        }
      }, elements);
    } catch (error) {
    }
  }
  /**
   * Clear all highlights from the canvas.
   */
  async clearHighlights() {
    if (!this.enabled) return;
    try {
      await this.page.evaluate(() => {
        const canvas = document.getElementById("kowalski-debug-canvas");
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
      });
    } catch (error) {
    }
  }
  /**
   * Show a temporary message on the canvas.
   */
  async showMessage(message, type = "info") {
    if (!this.enabled) return;
    const colors = {
      info: "#00ffff",
      success: "#00ff00",
      warning: "#ffff00",
      error: "#ff4444"
    };
    try {
      await this.page.evaluate(({ message: message2, color }) => {
        const canvas = document.getElementById("kowalski-debug-canvas");
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.font = "bold 14px monospace";
        const textWidth = ctx.measureText(message2).width;
        const x = (canvas.width - textWidth) / 2;
        const y = canvas.height - 40;
        ctx.fillStyle = "rgba(0, 0, 0, 0.8)";
        ctx.fillRect(x - 12, y - 18, textWidth + 24, 28);
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.strokeRect(x - 12, y - 18, textWidth + 24, 28);
        ctx.fillStyle = color;
        ctx.fillText(message2, x, y);
      }, { message, color: colors[type] });
      setTimeout(() => this.clearHighlights(), 2e3);
    } catch (error) {
    }
  }
  /**
   * Check if overlay is enabled.
   */
  isEnabled() {
    return this.enabled;
  }
  /**
   * Truncate string for display.
   */
  truncate(str, maxLen) {
    if (str.length <= maxLen) return str;
    return str.substring(0, maxLen - 3) + "...";
  }
  /**
   * Escape HTML for safe insertion.
   */
  escapeHtml(str) {
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
  }
};

// src/main/services/SessionMemory.ts
var import_electron4 = require("electron");
var import_fs3 = __toESM(require("fs"), 1);
var import_path3 = __toESM(require("path"), 1);
var MAX_SUMMARIES = 20;
var DIGEST_SUMMARIES = 5;
var SessionMemory = class {
  storagePath;
  summaries = [];
  constructor() {
    const userDataPath = import_electron4.app.getPath("userData");
    this.storagePath = import_path3.default.join(userDataPath, "session_memory", "summaries.json");
  }
  /**
   * Load session summaries from disk.
   * Call this before a browsing session starts.
   */
  async loadMemory() {
    try {
      const data = await import_fs3.default.promises.readFile(this.storagePath, "utf-8");
      this.summaries = JSON.parse(data);
      console.log(`\u{1F9E0} Loaded ${this.summaries.length} session memories`);
    } catch {
      this.summaries = [];
    }
    return this.summaries;
  }
  /**
   * Save a session summary to disk.
   * Call this after a browsing session completes.
   * Trims to MAX_SUMMARIES, keeping most recent.
   */
  async saveSession(summary) {
    this.summaries.push(summary);
    if (this.summaries.length > MAX_SUMMARIES) {
      this.summaries = this.summaries.slice(-MAX_SUMMARIES);
    }
    const dir = import_path3.default.dirname(this.storagePath);
    const tempPath = this.storagePath + ".tmp";
    try {
      await import_fs3.default.promises.mkdir(dir, { recursive: true });
      await import_fs3.default.promises.writeFile(tempPath, JSON.stringify(this.summaries, null, 2));
      await import_fs3.default.promises.rename(tempPath, this.storagePath);
      console.log(`\u{1F9E0} Saved session memory (${this.summaries.length} sessions)`);
    } catch (err) {
      console.error("Failed to save session memory:", err);
    }
  }
  /**
   * Generate a compact LLM-ready digest from recent sessions.
   * Returns ~150 tokens summarizing patterns and lessons learned.
   */
  generateDigest() {
    const recent = this.summaries.slice(-DIGEST_SUMMARIES);
    if (recent.length === 0) return "";
    const lines = [`SESSION MEMORY (last ${recent.length} sessions):`];
    const interestStats = this.getInterestStats(recent);
    if (interestStats.length > 0) {
      const ranked = interestStats.sort((a, b) => b.avgCaptures - a.avgCaptures).slice(0, 5).map((s) => `"${s.interest}" avg ${s.avgCaptures.toFixed(1)} captures (${s.quality})`).join(", ");
      lines.push(`- Interest productivity: ${ranked}`);
    }
    const phaseStats = this.getPhaseStats(recent);
    if (phaseStats.length > 0) {
      const phaseSummary = phaseStats.map((p) => `${p.phase} ${p.avgTimePct.toFixed(0)}% time \u2192 ${p.avgCapturesPct.toFixed(0)}% captures`).join(", ");
      lines.push(`- Phase split: ${phaseSummary}`);
    }
    const stagnationInfo = this.getStagnationPatterns(recent);
    if (stagnationInfo) {
      lines.push(`- ${stagnationInfo}`);
    }
    const avgCaptures = recent.reduce((sum, s) => sum + s.totalCaptures, 0) / recent.length;
    const avgActions = recent.reduce((sum, s) => sum + s.totalActions, 0) / recent.length;
    lines.push(`- Avg session: ${avgCaptures.toFixed(1)} captures in ${avgActions.toFixed(0)} actions`);
    return lines.join("\n");
  }
  /**
   * Get interest productivity rankings.
   */
  getInterestPriority() {
    const stats = this.getInterestStats(this.summaries.slice(-DIGEST_SUMMARIES));
    const priority = /* @__PURE__ */ new Map();
    for (const stat of stats) {
      priority.set(stat.interest, stat.avgCaptures);
    }
    return priority;
  }
  getInterestStats(summaries) {
    const interestMap = /* @__PURE__ */ new Map();
    for (const session2 of summaries) {
      for (const result of session2.interestResults) {
        const existing = interestMap.get(result.interest) || { totalCaptures: 0, count: 0 };
        existing.totalCaptures += result.captureCount;
        existing.count++;
        interestMap.set(result.interest, existing);
      }
    }
    return Array.from(interestMap.entries()).map(([interest, data]) => {
      const avg = data.totalCaptures / data.count;
      return {
        interest,
        avgCaptures: avg,
        quality: avg >= 5 ? "HIGH" : avg >= 2 ? "MEDIUM" : "LOW"
      };
    });
  }
  getPhaseStats(summaries) {
    const phaseMap = /* @__PURE__ */ new Map();
    for (const session2 of summaries) {
      const totalDuration = session2.phaseBreakdown.reduce((sum, p) => sum + p.durationMs, 0) || 1;
      const totalCaptures = session2.phaseBreakdown.reduce((sum, p) => sum + p.capturesProduced, 0) || 1;
      for (const phase of session2.phaseBreakdown) {
        const existing = phaseMap.get(phase.phase) || { totalTimePct: 0, totalCapturesPct: 0, count: 0 };
        existing.totalTimePct += phase.durationMs / totalDuration * 100;
        existing.totalCapturesPct += phase.capturesProduced / totalCaptures * 100;
        existing.count++;
        phaseMap.set(phase.phase, existing);
      }
    }
    return Array.from(phaseMap.entries()).map(([phase, data]) => ({
      phase,
      avgTimePct: data.totalTimePct / data.count,
      avgCapturesPct: data.totalCapturesPct / data.count
    }));
  }
  getStagnationPatterns(summaries) {
    const allEvents = summaries.flatMap((s) => s.stagnationEvents);
    if (allEvents.length === 0) return null;
    const scrollYValues = allEvents.map((e) => e.scrollY);
    const avgStagnationY = scrollYValues.reduce((a, b) => a + b, 0) / scrollYValues.length;
    const recoverySuccess = /* @__PURE__ */ new Map();
    for (const event of allEvents) {
      const existing = recoverySuccess.get(event.recoveryAction) || { success: 0, total: 0 };
      existing.total++;
      if (event.recoveredSuccessfully) existing.success++;
      recoverySuccess.set(event.recoveryAction, existing);
    }
    const bestRecovery = Array.from(recoverySuccess.entries()).sort((a, b) => b[1].success / b[1].total - a[1].success / a[1].total).map(([action, stats]) => `${action} (${Math.round(stats.success / stats.total * 100)}% effective)`).slice(0, 2).join(", ");
    return `Stagnation: avg at ${Math.round(avgStagnationY)}px scrollY, recovery: ${bestRecovery}`;
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
  screenshotCollector;
  contentReadiness;
  page;
  // AI Navigation
  navigationLLM;
  navigationExecutor;
  debugOverlay;
  sessionMemory = new SessionMemory();
  // Track current view for gaze planning
  lastKnownView = "unknown";
  // Metrics
  visionApiCalls = 0;
  skippedViewports = 0;
  // =========================================================================
  // DEBUGGING & LOOP DETECTION STATE
  // =========================================================================
  loopDetection = {
    lastActions: [],
    repeatCount: 0
  };
  decisionLog = [];
  diagnosticsDir = "";
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
   * [LEGACY] Hardcoded three-phase flow. Still used by SchedulerService for text-extraction pipeline.
   * TODO: Migrate SchedulerService to browseAndCapture() + screenshot-based analysis.
   * Once migrated, this method and all its helpers can be removed.
   *
   * @param targetMinutes - Total browsing time (human-paced), split across phases
   * @param userInterests - Topics to search for in Phase A
   * @deprecated Use browseAndCapture() for AI-driven navigation
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
    const existingPages = this.context.pages();
    this.page = existingPages.length > 0 ? existingPages[0] : await this.context.newPage();
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
  // SCREENSHOT-FIRST BROWSING (NEW ARCHITECTURE)
  // =========================================================================
  /**
   * Screenshot-First Browsing Session.
   *
   * Now delegates to AI-driven navigation for intelligent browsing.
   * The AI decides what to click, scroll, and type based on the
   * accessibility tree and current goals.
   *
   * @param targetMinutes - Total browsing time
   * @param userInterests - Topics to search for
   * @returns BrowsingSession with all captured screenshots
   */
  async browseAndCapture(targetMinutes, userInterests) {
    return this.browseWithAINavigation(targetMinutes, userInterests);
  }
  /**
   * [DEPRECATED] Original hardcoded browsing session.
   * Kept for reference but no longer used.
   */
  async browseAndCaptureHardcoded(targetMinutes, userInterests) {
    const startTime = Date.now();
    this.page = await this.context.newPage();
    this.ghost = new GhostMouse(this.page);
    this.scroll = new HumanScroll(this.page);
    this.navigator = new A11yNavigator(this.page);
    this.vision = new ContentVision(this.apiKey);
    this.screenshotCollector = new ScreenshotCollector(this.page, {
      maxCaptures: 150,
      jpegQuality: 85,
      minScrollDelta: 200,
      saveToDirectory: path5.join(os.homedir(), "Documents", "Kowalski", "debug-screenshots")
    });
    this.contentReadiness = new ContentReadiness(this.page);
    if (this.debugMode) {
      await this.ghost.enableVisibleCursor();
    }
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
      if (userInterests.length > 0) {
        console.log("\n\u{1F50D} \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550");
        console.log("\u{1F50D} PHASE A: INTEREST SEARCH (Screenshot-First)");
        console.log("\u{1F50D} \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\n");
        for (const interest of userInterests.slice(0, 3)) {
          await this.searchAndCaptureScreenshot(interest);
        }
      }
      if (state.hasStories) {
        console.log("\n\u{1F3AC} \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550");
        console.log("\u{1F3AC} PHASE B: STORY WATCH (Screenshot-First)");
        console.log("\u{1F3AC} \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\n");
        await this.returnToHome();
        await this.watchAndCaptureStories();
      }
      console.log("\n\u{1F4DC} \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550");
      console.log("\u{1F4DC} PHASE C: FEED BROWSE (Screenshot-First)");
      console.log("\u{1F4DC} \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\n");
      await this.returnToHome();
      const elapsedMinutes = (Date.now() - startTime) / 6e4;
      const remainingMinutes = Math.max(2, targetMinutes - elapsedMinutes);
      await this.browseFeedWithCapture(remainingMinutes);
    } catch (error) {
      console.error("\u274C Browsing error:", error.message);
      if (["SESSION_EXPIRED", "RATE_LIMITED"].includes(error.message)) {
        throw error;
      }
    } finally {
      this.screenshotCollector.logSummary();
      await this.page.close();
    }
    return {
      captures: this.screenshotCollector.getCaptures(),
      sessionDuration: Date.now() - startTime,
      captureCount: this.screenshotCollector.getCaptureCount(),
      scrapedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
  }
  /**
   * Search for an interest and capture screenshot (no Vision API).
   */
  async searchAndCaptureScreenshot(interest) {
    console.log(`\u{1F50D} Searching for: "${interest}"`);
    try {
      const searchButton = await this.navigator.findSearchButton();
      if (!searchButton?.boundingBox) {
        console.log("  \u26A0\uFE0F Search button not found, skipping");
        return;
      }
      await this.clickWithGaze(searchButton.boundingBox, "link", "search");
      await this.humanDelay(1e3, 2e3);
      const searchInput = await this.navigator.findSearchInput();
      if (!searchInput?.boundingBox) {
        console.log("  \u26A0\uFE0F Search input not found, skipping");
        await this.navigator.pressEscape();
        return;
      }
      await this.ghost.clickElementWithRole(searchInput.boundingBox, "searchbox", 0.5);
      await this.humanDelay(300, 600);
      const searchResult = await this.navigator.enterSearchTerm(interest, this.ghost);
      if (searchResult.matchedResult) {
        console.log(`  \u2705 Clicked dropdown result: "${searchResult.matchedResult}"`);
      }
      await this.humanDelay(3e3, 5e3);
      await this.contentReadiness.ensureViewportClear();
      const currentView = await this.navigator.getContentState();
      if (currentView.currentView === "profile") {
        console.log(`  \u{1F4CD} On profile page, capturing...`);
        await this.screenshotCollector.captureCurrentPost("profile", interest);
        for (let i = 0; i < 2; i++) {
          await this.scroll.scrollWithIntent(this.navigator);
          await this.humanDelay(1500, 3e3);
          await this.screenshotCollector.captureCurrentPost("profile", interest);
        }
      } else {
        await this.screenshotCollector.captureCurrentPost("search", interest);
        await this.scroll.scrollWithIntent(this.navigator);
        await this.humanDelay(1500, 2500);
        await this.screenshotCollector.captureCurrentPost("search", interest);
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
  /**
   * Watch stories and capture each one (no Vision API).
   */
  async watchAndCaptureStories(maxStories = 8) {
    console.log("\u{1F3AC} Watching stories...");
    const storyCircles = await this.navigator.findStoryCircles();
    if (storyCircles.length === 0 || !storyCircles[0].boundingBox) {
      console.log("  No stories found");
      return;
    }
    await this.clickWithGaze(storyCircles[0].boundingBox, "button", "watch_story");
    await this.humanDelay(2e3, 3e3);
    if (this.debugMode) {
      console.log("  \u{1F50D} Discovering story viewer buttons...");
      await this.navigator.dumpInteractiveElements();
    }
    let lastStoryHash = "";
    let stuckCount = 0;
    let storiesWatched = 0;
    for (let i = 0; i < maxStories; i++) {
      if (!this.navigator.isInStoryViewer()) {
        console.log("  \u{1F4F1} Exited story viewer");
        break;
      }
      const currentHash = await this.getQuickViewportHash();
      if (currentHash === lastStoryHash) {
        stuckCount++;
        console.log(`  \u26A0\uFE0F Same story as before (${stuckCount}/3)`);
        if (stuckCount >= 3) {
          console.log("  \u{1F4F1} Stuck on same story, exiting");
          break;
        }
        await this.advanceStory();
        await this.humanDelay(800, 1200);
        continue;
      }
      stuckCount = 0;
      lastStoryHash = currentHash;
      await this.contentReadiness.ensureViewportClear();
      const videoInfo = await this.navigator.detectVideoContent();
      if (videoInfo.isVideo) {
        console.log(`  \u{1F3AC} Video story - capturing frames`);
        const watchDuration = 3e3 + Math.random() * 2e3;
        await this.screenshotCollector.captureVideoFrames("story", watchDuration, 1500);
      } else {
        await this.screenshotCollector.captureCurrentPost("story");
        await this.humanDelay(500, 1e3);
      }
      storiesWatched++;
      console.log(`  \u{1F4F8} Story ${storiesWatched} captured`);
      const advanced = await this.advanceStory();
      if (!advanced) {
        console.log("  \u{1F4F1} Could not advance, may be at end of stories");
        stuckCount++;
      }
      await this.humanDelay(800, 1200);
    }
    await this.navigator.pressEscape();
    await this.humanDelay(500, 1e3);
    console.log(`\u2705 Stories complete: ${storiesWatched} captured`);
  }
  /**
   * Advance to next story by clicking the right arrow button.
   * Falls back to keyboard if button not found.
   *
   * @returns true if advancement was attempted
   */
  async advanceStory() {
    const storyContainer = await this.navigator.findStoryViewerContainer();
    const nextBtn = await this.navigator.findEdgeButton("right", {
      containerNodeId: storyContainer || void 0
    });
    if (nextBtn?.boundingBox) {
      console.log(`  \u27A1\uFE0F Clicking next: "${nextBtn.name}" at x=${Math.round(nextBtn.boundingBox.x)}`);
      await this.ghost.clickElement(nextBtn.boundingBox, 0.3);
      return true;
    }
    console.log("  \u27A1\uFE0F Button not found, trying arrow key");
    await this.page.keyboard.press("ArrowRight");
    return true;
  }
  /**
   * Quick viewport hash for change detection (low quality = fast).
   * Used to detect if story/content actually changed after navigation.
   */
  async getQuickViewportHash() {
    const screenshot = await this.page.screenshot({
      type: "jpeg",
      quality: 20,
      // Low quality for speed
      fullPage: false
    });
    return (0, import_crypto2.createHash)("md5").update(screenshot).digest("hex").slice(0, 12);
  }
  /**
   * Explore a post deeply before capturing.
   *
   * This method implements "deep exploration" as requested:
   * 1. Expand truncated captions (click "more" button)
   * 2. Check for carousel posts and capture all slides
   *
   * @returns Object with number of slides captured (1 if not a carousel) and whether it's a carousel
   */
  async explorePostDeeply() {
    let capturedSlides = 0;
    let isCarousel = false;
    let isVideo = false;
    const moreButton = await this.navigator.findMoreButton();
    if (moreButton?.boundingBox) {
      console.log("  \u{1F4DD} Expanding truncated caption...");
      await this.ghost.clickElement(moreButton.boundingBox, 0.3);
      await this.humanDelay(800, 1200);
      const stillTruncated = await this.navigator.findMoreButton();
      if (stillTruncated?.boundingBox) {
        console.log("  \u{1F4DD} Caption still truncated, trying again...");
        await this.ghost.clickElement(stillTruncated.boundingBox, 0.3);
        await this.humanDelay(500, 800);
      }
    }
    const videoInfo = await this.navigator.detectVideoContent();
    if (videoInfo.isVideo) {
      isVideo = true;
      console.log(`  \u{1F3AC} Video post detected${videoInfo.hasAudio ? " (with audio)" : ""}`);
      const watchDuration = 8e3 + Math.random() * 12e3;
      const frames = await this.screenshotCollector.captureVideoFrames("feed", watchDuration);
      capturedSlides = frames;
      return { capturedSlides, isCarousel, isVideo };
    }
    const { next: carouselNext } = await this.navigator.findCarouselControls();
    if (!carouselNext) {
      const elements = await this.navigator.getAllInteractiveElements();
      const buttons = elements.filter((e) => e.role === "button").map((e) => `"${e.name}"`).slice(0, 8);
      if (buttons.length > 0) {
        console.log(`  \u{1F4CB} Available buttons: ${buttons.join(", ")}`);
      }
    }
    if (carouselNext?.boundingBox) {
      isCarousel = true;
      console.log(`  \u{1F3A0} Carousel detected: "${carouselNext.name}" [${carouselNext.role}]`);
      await this.screenshotCollector.captureCurrentPost("carousel");
      capturedSlides++;
      const maxSlides = 10;
      let slideCount = 1;
      let previousSlideIndicator = await this.navigator.getCarouselSlideIndicator();
      if (previousSlideIndicator) {
        console.log(`  \u{1F3A0} Starting at slide ${previousSlideIndicator.current} of ${previousSlideIndicator.total}`);
      }
      while (slideCount < maxSlides) {
        const { next: nextBtn } = await this.navigator.findCarouselControls();
        if (!nextBtn?.boundingBox) {
          console.log(`  \u{1F3A0} No next button found via spatial discovery`);
          break;
        }
        await this.ghost.clickElement(nextBtn.boundingBox, 0.3);
        const transitionStart = Date.now();
        const maxTransitionWait = 3e3;
        let slideTransitioned = false;
        while (Date.now() - transitionStart < maxTransitionWait) {
          const currentSlideIndicator = await this.navigator.getCarouselSlideIndicator();
          if (currentSlideIndicator && previousSlideIndicator && currentSlideIndicator.current !== previousSlideIndicator.current) {
            const readiness = await this.contentReadiness.waitForImagesLoaded(2e3);
            if (!readiness.ready) {
              console.log(`  \u{1F3A0} Slide image not fully loaded (${readiness.details})`);
            }
            previousSlideIndicator = currentSlideIndicator;
            slideTransitioned = true;
            break;
          }
          await this.humanDelay(100, 200);
        }
        if (!slideTransitioned) {
          console.log(`  \u{1F3A0} Slide unchanged after ${maxTransitionWait}ms, stopping carousel`);
          break;
        }
        await this.humanDelay(200, 400);
        await this.screenshotCollector.captureCurrentPost("carousel");
        slideCount++;
        capturedSlides++;
      }
      console.log(`  \u{1F3A0} Captured ${capturedSlides} carousel slides`);
    }
    return { capturedSlides, isCarousel, isVideo };
  }
  /**
   * Browse feed with POST-CENTERED capture and DEEP EXPLORATION (no Vision API).
   *
   * This method ensures each screenshot contains ONE post only by:
   * 1. Detecting post elements via accessibility tree
   * 2. Centering each post in the viewport before capturing
   * 3. Tracking captured posts by ABSOLUTE position (scroll + element Y) to avoid duplicates
   * 4. Deep exploration: expanding captions, exploring carousel slides
   *
   * FIXES APPLIED:
   * - Uses absolute Y position (scrollY + element.y) for deduplication (stable across scrolls)
   * - Single centering calculation (let scrollToElementByCDP handle it)
   * - Scroll verification to detect stuck situations
   */
  async browseFeedWithCapture(targetMinutes) {
    const startTime = Date.now();
    const endTime = startTime + targetMinutes * 60 * 1e3;
    const capturedPostAbsoluteYs = /* @__PURE__ */ new Set();
    let consecutiveEmpty = 0;
    const maxConsecutiveEmpty = 3;
    console.log(`\u{1F504} Browsing feed (deep exploration mode) for ${targetMinutes.toFixed(1)} minutes...`);
    await this.scroll.scrollToTop();
    await this.humanDelay(1e3, 2e3);
    const viewportInfo = await this.scroll.getViewportInfo();
    const viewportHeight = viewportInfo.height;
    while (Date.now() < endTime) {
      if (this.screenshotCollector.getCaptureCount() >= 150) {
        console.log("\u{1F4F8} Max captures reached, stopping browse");
        break;
      }
      const viewportClear = await this.contentReadiness.ensureViewportClear();
      if (!viewportClear) {
        console.log("  \u26A0\uFE0F Could not clear blocking overlay, attempting to continue...");
      }
      const currentScrollY = await this.scroll.getScrollPosition();
      const posts = await this.navigator.findPostElementsAtomic();
      let targetPost = null;
      for (const post of posts) {
        if (!post.boundingBox || !post.backendNodeId) continue;
        const absoluteY = Math.round((currentScrollY + post.boundingBox.y) / 100);
        const postTop = post.boundingBox.y;
        const postBottom = postTop + post.boundingBox.height;
        const isVisible = postTop < viewportHeight && postBottom > 0;
        if (isVisible && !capturedPostAbsoluteYs.has(absoluteY)) {
          targetPost = { ...post, absoluteY };
          break;
        }
      }
      if (targetPost && targetPost.boundingBox && targetPost.backendNodeId) {
        const centerResult = await this.scroll.scrollToElementCentered(
          targetPost.backendNodeId,
          2
          // max 2 retry attempts
        );
        if (!centerResult.success) {
          console.log(`  \u26A0\uFE0F Centering incomplete (offset: ${Math.round(centerResult.finalOffset)}px), using fallback`);
          await this.scroll.scroll({ baseDistance: 350 });
        }
        const readiness = await this.contentReadiness.waitForContentReady(2500);
        if (!readiness.ready) {
          console.log(`  \u23F3 Content not fully ready: ${readiness.reason} (waited ${readiness.waitedMs}ms)`);
        }
        await this.humanDelay(200, 400);
        const adCheck = await this.navigator.detectAdContent();
        if (adCheck.isAd) {
          console.log(`  \u{1F6AB} Skipping ad: ${adCheck.reason}`);
          capturedPostAbsoluteYs.add(targetPost.absoluteY);
          consecutiveEmpty = 0;
          continue;
        }
        const exploration = await this.explorePostDeeply();
        const driftCheck = await this.contentReadiness.checkElementDrift(
          targetPost.backendNodeId,
          80
          // tolerance: 80px (matches centering tolerance)
        );
        if (driftCheck?.drifted) {
          console.log(`  \u{1F4CD} Element drifted ${Math.round(driftCheck.drift)}px, re-centering...`);
          await this.scroll.scrollToElementCentered(targetPost.backendNodeId, 1);
          await this.contentReadiness.waitForImagesLoaded(1e3);
        }
        if (!exploration.isCarousel) {
          await this.screenshotCollector.captureCurrentPost("feed");
        }
        capturedPostAbsoluteYs.add(targetPost.absoluteY);
        consecutiveEmpty = 0;
        const postHeight = targetPost.boundingBox.height;
        const readingTime = postHeight > 600 ? 2500 + Math.random() * 3e3 : 1500 + Math.random() * 2e3;
        await this.humanDelay(readingTime, readingTime + 500);
        if (Math.random() < 0.12) {
          const pauseTime = 3e3 + Math.random() * 4e3;
          console.log(`  \u2615 Reading pause (${(pauseTime / 1e3).toFixed(1)}s)...`);
          await this.humanDelay(pauseTime, pauseTime + 500);
        }
        const captureCount = this.screenshotCollector.getCaptureCount();
        if (captureCount % 5 === 0) {
          console.log(`  \u{1F4CA} Captured ${captureCount} screenshots, ${capturedPostAbsoluteYs.size} unique posts`);
        }
      } else {
        consecutiveEmpty++;
        if (consecutiveEmpty >= maxConsecutiveEmpty) {
          console.log("  \u{1F4DC} No new posts found after multiple attempts, ending browse");
          break;
        }
        console.log(`  \u{1F4DC} No new posts visible, scrolling down (attempt ${consecutiveEmpty}/${maxConsecutiveEmpty})...`);
        await this.scroll.scrollWithIntent(this.navigator, {
          baseDistance: 500,
          variability: 0.2,
          microAdjustProb: 0.15
        });
        await this.humanDelay(1500, 2500);
      }
    }
    console.log(`\u2705 Feed browse complete. Captured ${this.screenshotCollector.getCaptureCount()} screenshots (${capturedPostAbsoluteYs.size} unique posts)`);
  }
  // =========================================================================
  // PHASE A: ACTIVE SEARCH (LEGACY - for backward compatibility)
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
        const stateSummary = await this.getCurrentStateSummary();
        this.logDecision({
          phase: "SEARCH",
          action: `Search for "${interest}"`,
          objective: `Find content related to user interest: ${interest}`,
          currentState: stateSummary,
          rationale: `User specified "${interest}" as an interest. Searching to find relevant accounts and posts.`,
          verificationMarker: `Search results panel opens AND results for "${interest}" are visible`
        });
        const searchButton = await this.navigator.findSearchButton();
        if (!searchButton?.boundingBox) {
          console.log("  \u26A0\uFE0F Search button not found, skipping");
          continue;
        }
        await this.clickWithGaze(searchButton.boundingBox, "link", "search");
        await this.humanDelay(1e3, 2e3);
        const searchInput = await this.navigator.findSearchInput();
        if (!searchInput?.boundingBox) {
          console.log("  \u26A0\uFE0F Search input not found, skipping");
          await this.navigator.pressEscape();
          await this.humanDelay(500, 1e3);
          continue;
        }
        await this.ghost.clickElementWithRole(searchInput.boundingBox, "searchbox", 0.5);
        await this.humanDelay(300, 600);
        console.log(`  \u2328\uFE0F Typing "${interest}" and selecting from dropdown...`);
        const searchResult = await this.navigator.enterSearchTerm(interest, this.ghost);
        if (searchResult.matchedResult) {
          console.log(`  \u2705 Clicked dropdown result: "${searchResult.matchedResult}"`);
        } else if (searchResult.fallbackUsed) {
          console.log(`  \u26A0\uFE0F Used Enter key fallback (no dropdown match)`);
        }
        const waitTime = 3e3 + Math.random() * 2e3;
        console.log(`  \u23F3 Waiting ${(waitTime / 1e3).toFixed(1)}s for results to load...`);
        await this.humanDelay(waitTime, waitTime + 500);
        const currentView = await this.navigator.getContentState();
        if (currentView.currentView === "profile") {
          const profileUsername = this.navigator.getProfileUsername() || interest;
          console.log(`  \u{1F4CD} Detected profile page: ${profileUsername}`);
          const deepContent = await this.exploreProfileDeep(interest, profileUsername);
          if (deepContent.length > 0) {
            captures.push({
              interest,
              posts: deepContent,
              capturedAt: (/* @__PURE__ */ new Date()).toISOString()
            });
            console.log(`  \u2705 Deep-dive captured ${deepContent.length} items from ${profileUsername}`);
          }
          await this.returnToHome();
          continue;
        }
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
      await this.clickWithGaze(firstStory.boundingBox, "button", "watch_story");
      await this.humanDelay(2e3, 3e3);
    } else {
      console.log("  Could not click first story (no bounding box)");
      return stories;
    }
    const maxStories = Math.min(maxCalls, storyCircles.length, 12);
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
      const isTextHeavy = storyContent?.caption && storyContent.caption.length > 50;
      const isVideo = storyContent?.isVideoContent;
      if (isVideo) {
        console.log(`  \u{1F3AC} Video story - watching...`);
        await this.humanDelay(5e3, 15e3);
      } else if (isTextHeavy) {
        console.log(`  \u{1F4DD} Text-heavy story - reading...`);
        await this.humanDelay(6e3, 1e4);
      } else {
        console.log(`  \u{1F4F7} Photo story - quick view...`);
        await this.humanDelay(2e3, 4e3);
      }
      const nextStoryBtn = await this.navigator.findEdgeButton("right");
      if (nextStoryBtn?.boundingBox) {
        console.log(`  \u{1F3AF} Found next via spatial: "${nextStoryBtn.name}" at x=${nextStoryBtn.boundingBox.x}`);
        await this.ghost.clickElement(nextStoryBtn.boundingBox, 0.3);
      } else {
        console.log("  \u27A1\uFE0F No button found, using keyboard to advance");
        await this.page.keyboard.press("ArrowRight");
      }
      await this.humanDelay(1e3, 2e3);
    }
    await this.navigator.pressEscape();
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
      if (scrollCount % 3 === 0 || scrollCount === 0) {
        const stateSummary = await this.getCurrentStateSummary();
        this.logDecision({
          phase: "FEED",
          action: `Scroll #${scrollCount + 1}`,
          objective: "Discover new content by scrolling feed",
          currentState: stateSummary,
          rationale: `Content type is ${stateSummary.contentType || "unknown"}. Adapting scroll distance and pause accordingly.`,
          verificationMarker: `ScrollY increases AND new posts become visible (not same posts as before)`
        });
      }
      const scrollPosBefore = await this.scroll.getScrollPosition();
      const scrollResult = await this.scroll.scrollWithIntent(this.navigator, {
        variability: 0.25,
        microAdjustProb: 0.2
        // baseDistance and readingPauseMs determined by content density
      });
      await this.trackActionForLoopDetection("scroll", void 0, scrollPosBefore);
      scrollCount++;
      if (scrollCount % 5 === 1) {
        console.log(`  \u{1F4CA} Content type: ${scrollResult.contentType} (scrolled ${scrollResult.scrollDistance}px)`);
      }
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
          const { next: carouselNext } = await this.navigator.findCarouselControls();
          if (carouselNext?.boundingBox) {
            console.log(`  \u{1F3A0} Carousel detected via spatial at x=${carouselNext.boundingBox.x}`);
            const carouselSlides = await this.exploreCarousel("feed", "feed_carousel");
            for (const slide of carouselSlides) {
              const slideKey = `${slide.username}-${slide.caption.slice(0, 50)}`;
              if (!seenPostKeys.has(slideKey)) {
                seenPostKeys.add(slideKey);
                extractedContent.push(slide);
              }
            }
          }
        }
      }
      if (Math.random() < 0.12) {
        console.log("\u2615 Taking a longer pause...");
        await this.humanDelay(8e3, 15e3);
      }
    }
    console.log(`\u2705 Feed exploration complete. Extracted ${extractedContent.length} posts`);
    return extractedContent;
  }
  // =========================================================================
  // RECURSIVE EXPLORATION METHODS
  // =========================================================================
  /**
   * Explore a carousel post by clicking through all slides.
   * Captures each slide with Vision API.
   *
   * FIXED: Proper actionability checks with hover, animation buffer, and slide verification.
   *
   * @param context - Context label for the carousel (e.g., "feed", interest name)
   * @param slidePrefix - Prefix for slide labels
   * @returns Array of captured slides as ExtractedPosts
   */
  async exploreCarousel(context, slidePrefix) {
    const slides = [];
    let slideNumber = 1;
    const maxSlides = 10;
    const maxRetries = 2;
    console.log(`    \u{1F3A0} Exploring carousel for "${context}"...`);
    let previousSlideIndicator = await this.navigator.getCarouselSlideIndicator();
    if (previousSlideIndicator) {
      console.log(`    \u{1F3A0} Starting at slide ${previousSlideIndicator.current} of ${previousSlideIndicator.total}`);
    }
    while (slideNumber <= maxSlides) {
      const { next: nextButton } = await this.navigator.findCarouselControls();
      if (!nextButton?.boundingBox) {
        console.log(`    \u{1F3A0} Carousel complete (${slideNumber - 1} slides) - no next button found`);
        break;
      }
      const hoverDuration = 800 + Math.random() * 700;
      console.log(`    \u{1F3A0} Hovering over button at x=${nextButton.boundingBox.x}`);
      await this.ghost.hoverElement(nextButton.boundingBox, hoverDuration, 0.3);
      const { next: nextButtonAfterHover } = await this.navigator.findCarouselControls();
      if (!nextButtonAfterHover?.boundingBox) {
        console.log(`    \u26A0\uFE0F Button disappeared after hover, skipping`);
        break;
      }
      let navigationSucceeded = false;
      for (let attempt = 0; attempt < maxRetries; attempt++) {
        await this.ghost.clickElementWithRole(nextButtonAfterHover.boundingBox, "button", 0.3);
        await this.humanDelay(1500, 3e3);
        const currentSlideIndicator = await this.navigator.getCarouselSlideIndicator();
        if (currentSlideIndicator) {
          if (!previousSlideIndicator || currentSlideIndicator.current !== previousSlideIndicator.current) {
            console.log(`    \u{1F3A0} Navigation verified: now on slide ${currentSlideIndicator.current} of ${currentSlideIndicator.total}`);
            previousSlideIndicator = currentSlideIndicator;
            navigationSucceeded = true;
            break;
          } else {
            console.log(`    \u26A0\uFE0F Slide indicator unchanged (attempt ${attempt + 1}/${maxRetries}), retrying...`);
            await this.humanDelay(500, 800);
          }
        } else {
          console.log(`    \u{1F3A0} No slide indicator found, assuming navigation succeeded`);
          navigationSucceeded = true;
          break;
        }
      }
      if (!navigationSucceeded) {
        console.log(`    \u26A0\uFE0F Failed to navigate after ${maxRetries} attempts, stopping carousel`);
        break;
      }
      const canAfford = await this.usageService.canAffordVisionCall(this.usageCap);
      if (!canAfford) {
        console.log("    \u{1F4B8} Budget exhausted during carousel");
        break;
      }
      const moreButton = await this.navigator.findMoreButton();
      if (moreButton?.boundingBox) {
        console.log(`    \u{1F4DD} Expanding truncated caption...`);
        await this.ghost.clickElement(moreButton.boundingBox, 0.3);
        await this.humanDelay(500, 800);
      }
      const rawCaption = await this.navigator.findPostCaption();
      const result = await this.vision.extractVisibleContent(this.page);
      this.visionApiCalls++;
      if (result.success && result.posts.length > 0) {
        for (const post of result.posts) {
          const captionText = rawCaption || post.caption || post.visualDescription || "";
          slides.push({
            ...post,
            caption: `[CAROUSEL: ${context} slide ${slideNumber}] ${captionText}`
          });
        }
        console.log(`    \u{1F3A0} Captured slide ${slideNumber}${rawCaption ? " (with caption)" : ""}`);
      }
      slideNumber++;
    }
    return slides;
  }
  /**
   * Deep exploration of a profile page.
   * 1. Scroll through recent posts grid (2 minutes)
   * 2. Explore first 2 Story Highlights (30s each)
   *
   * @param interest - The search interest (for labeling)
   * @param profileUsername - Username being explored
   * @returns Array of captured content as ExtractedPosts
   */
  async exploreProfileDeep(interest, profileUsername) {
    const content = [];
    const startTime = Date.now();
    const profileDuration = (90 + Math.random() * 60) * 1e3;
    const highlightDuration = (25 + Math.random() * 15) * 1e3;
    console.log(`    \u{1F464} Deep-diving into ${profileUsername}'s profile...`);
    let scrollCount = 0;
    const maxGridScrolls = 6;
    while (Date.now() - startTime < profileDuration && scrollCount < maxGridScrolls) {
      await this.scroll.scroll({
        baseDistance: 250 + Math.random() * 150,
        variability: 0.2,
        microAdjustProb: 0.1,
        readingPauseMs: [2e3, 4e3]
      });
      scrollCount++;
      if (scrollCount % 2 === 0) {
        const canAfford = await this.usageService.canAffordVisionCall(this.usageCap);
        if (!canAfford) {
          console.log("    \u{1F4B8} Budget exhausted during profile grid");
          break;
        }
        const result = await this.vision.extractVisibleContent(this.page);
        this.visionApiCalls++;
        if (result.success && result.posts.length > 0) {
          for (const post of result.posts) {
            content.push({
              ...post,
              caption: `[PROFILE: ${profileUsername}] ${post.caption || post.visualDescription || ""}`
            });
          }
          console.log(`    \u{1F464} Captured ${result.posts.length} grid posts`);
        }
      }
    }
    await this.scroll.scrollToTop();
    await this.humanDelay(1500, 2500);
    const highlights = await this.navigator.findHighlights();
    const highlightsToExplore = Math.min(highlights.length, 2);
    console.log(`    \u2728 Found ${highlights.length} highlights, exploring ${highlightsToExplore}...`);
    for (let i = 0; i < highlightsToExplore; i++) {
      const highlight = highlights[i];
      if (!highlight.boundingBox) continue;
      console.log(`    \u2728 Opening highlight: "${highlight.name}"`);
      await this.clickWithGaze(highlight.boundingBox, "button");
      await this.humanDelay(2e3, 3e3);
      const highlightStart = Date.now();
      let captureCount = 0;
      while (Date.now() - highlightStart < highlightDuration && captureCount < 3) {
        const canAfford = await this.usageService.canAffordVisionCall(this.usageCap);
        if (!canAfford) break;
        const result = await this.vision.extractVisibleContent(this.page);
        this.visionApiCalls++;
        captureCount++;
        if (result.success && result.posts.length > 0) {
          for (const post of result.posts) {
            content.push({
              ...post,
              caption: `[HIGHLIGHT: ${profileUsername} - ${highlight.name}] ${post.caption || post.visualDescription || ""}`
            });
          }
        }
        const nextBtn = await this.navigator.findEdgeButton("right");
        if (nextBtn?.boundingBox) {
          await this.ghost.clickElement(nextBtn.boundingBox, 0.3);
        } else {
          console.log("  \u27A1\uFE0F No button found, using keyboard to advance");
          await this.page.keyboard.press("ArrowRight");
        }
        await this.humanDelay(5e3, 8e3);
      }
      await this.navigator.pressEscape();
      await this.humanDelay(1e3, 1500);
    }
    console.log(`    \u{1F464} Profile deep-dive complete. Captured ${content.length} items`);
    return content;
  }
  // =========================================================================
  // DEBUGGING & AUDIT TRAIL SYSTEM
  // =========================================================================
  /**
   * Log a Decision Block to terminal and internal log.
   * Provides conversational audit trail explaining the "Why" behind every "How".
   */
  logDecision(decision) {
    const block = {
      ...decision,
      timestamp: (/* @__PURE__ */ new Date()).toISOString()
    };
    this.decisionLog.push(block);
    console.log("\n\u250C\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500");
    console.log(`\u2502 \u{1F4CB} DECISION BLOCK [${block.phase}]`);
    console.log("\u251C\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500");
    console.log(`\u2502 \u{1F3AF} OBJECTIVE: ${block.objective}`);
    console.log(`\u2502 \u{1F4CD} ACTION: ${block.action}`);
    console.log(`\u2502 \u{1F4CA} STATE: View=${block.currentState.view}` + (block.currentState.scrollPosition !== void 0 ? `, ScrollY=${block.currentState.scrollPosition}px` : "") + (block.currentState.contentType ? `, Content=${block.currentState.contentType}` : ""));
    if (block.currentState.visibleElements && block.currentState.visibleElements.length > 0) {
      console.log(`\u2502 \u{1F441}\uFE0F VISIBLE: ${block.currentState.visibleElements.slice(0, 5).join(", ")}${block.currentState.visibleElements.length > 5 ? "..." : ""}`);
    }
    console.log(`\u2502 \u{1F4AD} RATIONALE: ${block.rationale}`);
    console.log(`\u2502 \u2713 VERIFY: ${block.verificationMarker}`);
    console.log("\u2514\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n");
  }
  /**
   * Track action for loop detection.
   * If the same action is repeated 3 times without state change, trigger diagnostic.
   */
  async trackActionForLoopDetection(action, coordinate, scrollPosition) {
    const now = Date.now();
    this.loopDetection.lastActions.push({
      action,
      coordinate,
      scrollPosition,
      timestamp: now
    });
    if (this.loopDetection.lastActions.length > 10) {
      this.loopDetection.lastActions.shift();
    }
    const last3 = this.loopDetection.lastActions.slice(-3);
    if (last3.length === 3) {
      const allSame = last3.every((a) => {
        const first = last3[0];
        const actionMatch = a.action === first.action;
        const coordMatch = !a.coordinate && !first.coordinate || a.coordinate && first.coordinate && Math.abs(a.coordinate.x - first.coordinate.x) < 50 && Math.abs(a.coordinate.y - first.coordinate.y) < 50;
        const scrollMatch = a.scrollPosition === void 0 || first.scrollPosition === void 0 || Math.abs((a.scrollPosition || 0) - (first.scrollPosition || 0)) < 50;
        return actionMatch && coordMatch && scrollMatch;
      });
      if (allSame) {
        this.loopDetection.repeatCount++;
        if (this.loopDetection.repeatCount >= 3) {
          await this.triggerDiagnosticSnapshot(action, coordinate);
        }
      } else {
        this.loopDetection.repeatCount = 0;
      }
    }
  }
  /**
   * Trigger a diagnostic snapshot when a navigation loop is detected.
   * Saves screenshot and A11y tree dump for debugging.
   */
  async triggerDiagnosticSnapshot(action, coordinate) {
    console.log("\n\u26A0\uFE0F \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550");
    console.log("\u26A0\uFE0F NAVIGATION LOOP DETECTED");
    console.log("\u26A0\uFE0F \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\n");
    if (!this.diagnosticsDir) {
      this.diagnosticsDir = path5.join(process.cwd(), "diagnostics");
      if (!fs5.existsSync(this.diagnosticsDir)) {
        fs5.mkdirSync(this.diagnosticsDir, { recursive: true });
      }
    }
    const timestamp = (/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-");
    try {
      const screenshotPath = path5.join(this.diagnosticsDir, `loop_detected_screen_${timestamp}.png`);
      await this.page.screenshot({ path: screenshotPath, fullPage: false });
      console.log(`\u{1F4F8} Screenshot saved: ${screenshotPath}`);
      const a11yTree = await this.navigator.getFullAccessibilityTree();
      const treePath = path5.join(this.diagnosticsDir, `loop_diagnostic_tree_${timestamp}.json`);
      fs5.writeFileSync(treePath, JSON.stringify({
        timestamp,
        action,
        coordinate,
        repeatCount: this.loopDetection.repeatCount,
        lastActions: this.loopDetection.lastActions,
        decisionLog: this.decisionLog.slice(-10),
        accessibilityTree: a11yTree.slice(0, 100)
        // Limit to first 100 nodes
      }, null, 2));
      console.log(`\u{1F4CB} A11y tree dump saved: ${treePath}`);
      const coordStr = coordinate ? `(${coordinate.x}, ${coordinate.y})` : "N/A";
      throw new Error(`Navigation Loop Detected: LLM repeated [${action}] at [${coordStr}] without page progress. Diagnostics saved to ${this.diagnosticsDir}`);
    } catch (error) {
      if (error.message.includes("Navigation Loop Detected")) {
        throw error;
      }
      console.error("\u274C Failed to save diagnostic snapshot:", error.message);
    }
  }
  /**
   * Get current state summary for decision logging.
   */
  async getCurrentStateSummary() {
    try {
      const contentState = await this.navigator.getContentState();
      const scrollPos = await this.scroll.getScrollPosition();
      const contentDensity = await this.navigator.analyzeContentDensity();
      return {
        view: contentState.currentView,
        scrollPosition: scrollPos,
        contentType: contentDensity.type,
        visibleElements: []
        // Simplified - no longer tracking gaze targets
      };
    } catch {
      return { view: "unknown" };
    }
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
      this.lastKnownView = "feed";
    }
  }
  /**
   * Human-like delay with random variation.
   */
  humanDelay(min2, max2) {
    const delay = min2 + Math.random() * (max2 - min2);
    return new Promise((resolve) => setTimeout(resolve, delay));
  }
  // =========================================================================
  // HUMAN-LIKE INTERACTION METHODS
  // =========================================================================
  /**
   * Click an element with human-like behavior.
   *
   * Uses Bezier curve movement, Gaussian click positioning, and role-specific
   * timing for natural interaction.
   *
   * @param boundingBox - Element to click
   * @param role - Accessibility role for timing adjustment
   * @param _action - Optional action description (unused, kept for compatibility)
   */
  async clickWithGaze(boundingBox, role = "button", _action) {
    try {
      await this.ghost.clickElementWithRole(boundingBox, role, 0.3);
    } catch (error) {
      console.warn("  \u26A0\uFE0F Gaze-aware click failed, using fallback:", error);
      await this.ghost.clickElement(boundingBox, 0.3);
    }
  }
  /**
   * Scroll with content-aware timing.
   * Uses the HumanScroll.scrollWithIntent for intelligent scroll behavior.
   *
   * @param config - Optional scroll configuration overrides
   */
  async scrollWithIntent(config) {
    return this.scroll.scrollWithIntent(this.navigator, config);
  }
  // =========================================================================
  // AI-DRIVEN NAVIGATION (Replaces hardcoded phase logic)
  // =========================================================================
  /**
   * Browse Instagram using AI-driven navigation.
   *
   * Instead of hardcoded phases (search → stories → feed), this method
   * uses an LLM to decide each navigation action based on the current
   * accessibility tree and session goals.
   *
   * @param targetMinutes - Total browsing time
   * @param userInterests - Topics to search for
   * @param config - Navigation loop configuration
   * @returns BrowsingSession with captured screenshots
   */
  async browseWithAINavigation(targetMinutes, userInterests, config) {
    const startTime = Date.now();
    const targetDurationMs = targetMinutes * 60 * 1e3;
    this.page = await this.context.newPage();
    this.ghost = new GhostMouse(this.page);
    this.scroll = new HumanScroll(this.page);
    this.navigator = new A11yNavigator(this.page);
    this.vision = new ContentVision(this.apiKey);
    this.screenshotCollector = new ScreenshotCollector(this.page, {
      maxCaptures: 150,
      jpegQuality: 85,
      minScrollDelta: 200,
      saveToDirectory: path5.join(os.homedir(), "Documents", "Kowalski", "debug-screenshots")
    });
    this.contentReadiness = new ContentReadiness(this.page);
    this.navigationLLM = new NavigationLLM({ apiKey: this.apiKey });
    this.navigationExecutor = new NavigationExecutor(
      this.page,
      this.ghost,
      this.scroll,
      this.navigator
    );
    if (this.debugMode) {
      await this.ghost.enableVisibleCursor();
      this.debugOverlay = new DebugOverlay(this.page);
      await this.debugOverlay.enable();
    }
    const loopConfig = {
      maxActions: config?.maxActions || 500,
      // LLM controls termination via strategic decisions
      maxDurationMs: config?.maxDurationMs || 5 * 60 * 1e3,
      // 5 minutes default
      minPostsForCompletion: config?.minPostsForCompletion || 5,
      // LLM decides actual completion
      actionDelayMs: config?.actionDelayMs || [300, 1e3]
      // Faster - LLM controls pacing via linger
    };
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
      console.log("\n\u{1F916} \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550");
      console.log("\u{1F916} AI NAVIGATION MODE ACTIVE");
      console.log("\u{1F916} \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\n");
      await this.sessionMemory.loadMemory();
      const sessionMemoryDigest = this.sessionMemory.generateDigest();
      await this.runNavigationLoop(
        userInterests,
        loopConfig,
        startTime,
        sessionMemoryDigest
      );
    } catch (error) {
      console.error("\u274C AI Navigation error:", error.message);
      if (["SESSION_EXPIRED", "RATE_LIMITED"].includes(error.message)) {
        throw error;
      }
    } finally {
      if (this.debugOverlay) {
        await this.debugOverlay.disable();
      }
      console.log(`
\u{1F4CA} AI Navigation Summary:`);
      console.log(`   - Decisions made: ${this.navigationLLM.getDecisionCount()}`);
      console.log(`   - Estimated LLM cost: $${this.navigationLLM.getEstimatedCost().toFixed(4)}`);
      console.log(`   - Screenshots captured: ${this.screenshotCollector.getCaptureCount()}`);
      this.screenshotCollector.logSummary();
      await this.page.close();
    }
    return {
      captures: this.screenshotCollector.getCaptures(),
      sessionDuration: Date.now() - startTime,
      captureCount: this.screenshotCollector.getCaptureCount(),
      scrapedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
  }
  /**
   * LLM-DRIVEN NAVIGATION LOOP
   *
   * The LLM has FULL STRATEGIC CONTROL over:
   * - Phase transitions (search/stories/feed)
   * - Session termination
   * - Capture timing
   * - Pacing (linger duration)
   *
   * No hardcoded phase sequence, time budgets, or termination thresholds.
   * The LLM decides everything based on content quality and session context.
   */
  async runNavigationLoop(userInterests, config, startTime, sessionMemoryDigest) {
    let actionCount = 0;
    let postsCollected = 0;
    let storiesWatched = 0;
    const interestsSearched = [];
    let currentPhase = "feed";
    const phaseHistory = [];
    let phaseStartTime = Date.now();
    let phaseItemsCollected = 0;
    let totalPostsSeen = 0;
    const uniquePosts = /* @__PURE__ */ new Set();
    let adsSkipped = 0;
    const stagnationEvents = [];
    let consecutiveLoopWarnings = 0;
    const engagementState = {
      level: "feed",
      levelEnteredAt: Date.now(),
      deeplyExploredPostUrls: []
    };
    console.log("\n\u{1F916} LLM-DRIVEN NAVIGATION LOOP STARTED");
    console.log(`   Total budget: ${(config.maxDurationMs / 1e3 / 60).toFixed(1)} minutes`);
    console.log(`   Interests: ${userInterests.join(", ")}`);
    while (actionCount < config.maxActions) {
      const elapsed = Date.now() - startTime;
      if (elapsed >= config.maxDurationMs) {
        console.log("\u23F0 Time limit reached, stopping navigation");
        break;
      }
      const loopStatus = this.navigationExecutor.isInLoop();
      let loopWarning = void 0;
      if (loopStatus.inLoop) {
        consecutiveLoopWarnings++;
        const recovery = this.navigationExecutor.getRecoveryAction(loopStatus.severity);
        loopWarning = {
          severity: loopStatus.severity,
          reason: recovery.reason,
          consecutiveWarnings: consecutiveLoopWarnings
        };
        console.log(`  \u26A0\uFE0F Loop warning #${consecutiveLoopWarnings} (${loopStatus.severity}): ${recovery.reason}`);
      } else {
        consecutiveLoopWarnings = 0;
      }
      const state = await this.navigator.getContentState();
      const elements = await this.navigator.getNavigationElements();
      const treeSummary = await this.navigator.buildTreeSummaryForLLM();
      const context = {
        sessionId: `session-${startTime}`,
        startTime,
        targetDurationMs: config.maxDurationMs,
        url: this.page.url(),
        view: state.currentView,
        currentGoal: this.getGoalForPhase(currentPhase, userInterests, interestsSearched, state.currentView, this.page.url()),
        userInterests,
        postsCollected,
        storiesWatched,
        interestsSearched,
        actionsRemaining: config.maxActions - actionCount,
        recentActions: this.navigationExecutor.getRecentActions(15),
        // Strategic context for LLM decision-making
        timeRemainingMs: config.maxDurationMs - elapsed,
        currentPhase,
        phaseHistory,
        captureCount: this.screenshotCollector.getPhotoCount(),
        videoState: state.hasVideo ? {
          isPlaying: true,
          // Assume playing if detected
          duration: 0,
          // Unknown without CDP query
          currentTime: 0
        } : void 0,
        contentStats: {
          uniquePostsRatio: totalPostsSeen > 0 ? uniquePosts.size / totalPostsSeen : 1,
          adRatio: totalPostsSeen > 0 ? adsSkipped / totalPostsSeen : 0,
          engagementLevel: this.estimateEngagementLevel(postsCollected, elapsed)
        },
        // Deep engagement state
        engagementState,
        // Tree summary for dynamic page awareness
        treeSummary,
        // Stagnation awareness
        scrollPosition: await this.scroll.getScrollPosition(),
        elementFingerprint: elements.slice(0, 25).map((e) => `${e.role}:${e.name?.slice(0, 30)}`).join("|"),
        // Cross-session memory
        sessionMemoryDigest,
        // Loop warning (LLM decides recovery, auto-recovery only as last resort)
        loopWarning
      };
      const decision = await this.navigationLLM.decideAction(context, elements);
      console.log(`  \u{1F916} Decision: ${decision.action} - ${decision.reasoning}`);
      if (decision.strategic) {
        if (decision.strategic.switchPhase) {
          console.log(`  \u{1F3AF} Strategic: Switch to ${decision.strategic.switchPhase} phase`);
        }
        if (decision.strategic.terminateSession) {
          console.log(`  \u{1F3AF} Strategic: Terminate session - ${decision.strategic.reason}`);
        }
        if (decision.strategic.captureNow) {
          console.log(`  \u{1F3AF} Strategic: Capture now`);
        }
        if (decision.strategic.lingerDuration) {
          console.log(`  \u{1F3AF} Strategic: Linger ${decision.strategic.lingerDuration}`);
        }
        if (decision.strategic.engageDepth) {
          console.log(`  \u{1F50D} Strategic: Engage at depth ${decision.strategic.engageDepth}`);
        }
        if (decision.strategic.closeEngagement) {
          console.log(`  \u{1F6AA} Strategic: Close engagement`);
        }
      }
      if (this.debugOverlay) {
        let targetElement = void 0;
        if (decision.action === "click") {
          const clickParams = decision.params;
          targetElement = elements.find((e) => e.id === clickParams.id);
        }
        const debugState = {
          phase: currentPhase,
          timeRemainingMs: config.maxDurationMs - elapsed,
          captureCount: this.screenshotCollector.getPhotoCount(),
          engagementLevel: engagementState.level,
          carouselState: engagementState.carouselState ? {
            currentSlide: engagementState.carouselState.currentSlide,
            totalSlides: engagementState.carouselState.totalSlides
          } : void 0,
          currentPostUsername: engagementState.currentPost?.username,
          action: decision.action,
          targetId: targetElement?.id,
          targetName: targetElement?.name,
          targetRole: targetElement?.role,
          confidence: decision.confidence,
          reasoning: decision.reasoning,
          postsCollected,
          actionsRemaining: config.maxActions - actionCount
        };
        await this.debugOverlay.updateState(debugState);
        if (decision.action === "click" && targetElement?.boundingBox) {
          await this.debugOverlay.clearHighlights();
          await this.debugOverlay.highlightElement(
            targetElement.boundingBox,
            `#${targetElement.id} ${targetElement.role}: "${targetElement.name?.slice(0, 25)}..."`
          );
          const clickPoint = {
            x: targetElement.boundingBox.x + targetElement.boundingBox.width / 2,
            y: targetElement.boundingBox.y + targetElement.boundingBox.height / 2
          };
          await this.debugOverlay.showClickTarget(clickPoint, "CLICK");
          await this.humanDelay(300, 500);
        }
      }
      if (decision.strategic?.terminateSession) {
        console.log(`
\u2705 LLM terminated session: ${decision.strategic.reason || "Content exhausted"}`);
        break;
      }
      if (decision.strategic?.switchPhase && decision.strategic.switchPhase !== currentPhase) {
        const newPhase = decision.strategic.switchPhase;
        phaseHistory.push({
          phase: currentPhase,
          durationMs: Date.now() - phaseStartTime,
          itemsCollected: phaseItemsCollected
        });
        console.log(`
\u{1F504} LLM Phase transition: ${currentPhase} \u2192 ${newPhase}`);
        console.log(`   Reason: ${decision.strategic.reason || "LLM decision"}`);
        currentPhase = newPhase;
        phaseStartTime = Date.now();
        phaseItemsCollected = 0;
        if (newPhase === "complete") {
          console.log("\u2705 LLM signaled session complete");
          break;
        }
      }
      const result = await this.navigationExecutor.execute(decision, elements);
      if (this.debugOverlay) {
        await this.debugOverlay.clearHighlights();
      }
      if (result.success) {
        if (result.verified) {
          const verifyLabel = result.verified === "url_changed" ? "URL changed" : result.verified === "dom_changed" ? "DOM changed" : result.verified === "no_change_detected" ? "no state change detected" : "";
          console.log(`  \u2705 Action succeeded (${result.actionTaken}${verifyLabel ? ` - ${verifyLabel}` : ""})`);
        } else {
          console.log(`  \u2705 Action succeeded (${result.actionTaken})`);
        }
        const currentUrl = result.resultingUrl || "";
        const isPostView = currentUrl.includes("/p/") || currentUrl.includes("/reel/");
        const isStoryView = currentUrl.includes("/stories/");
        const isCaptureAction = decision.capture?.shouldCapture || decision.strategic?.captureNow;
        if (isPostView || isStoryView || isCaptureAction) {
          totalPostsSeen++;
          const postId = this.extractPostIdFromUrl(currentUrl) || `action-${actionCount}`;
          uniquePosts.add(postId);
        }
        const newState = await this.navigator.getContentState();
        if (newState.currentView === "story") {
          storiesWatched++;
          phaseItemsCollected++;
        }
        if (newState.currentView === "profile") {
          const currentInterest = userInterests.find((i) => !interestsSearched.includes(i));
          if (currentInterest && !interestsSearched.includes(currentInterest)) {
            interestsSearched.push(currentInterest);
            console.log(`  \u{1F4CD} Landed on profile \u2014 marked "${currentInterest}" as searched (${interestsSearched.length}/${userInterests.length})`);
          }
        }
        const shouldCapture = decision.capture?.shouldCapture && result.focusedElement || decision.strategic?.captureNow;
        if (shouldCapture) {
          await this.humanDelay(500, 800);
          let source = "feed";
          if (newState.currentView === "story") {
            source = "story";
          } else if (newState.currentView === "profile") {
            source = "profile";
          } else if (this.page.url().includes("/explore") || this.page.url().includes("search")) {
            source = "search";
          }
          const postBounds = await this.navigator.findPostContentBounds();
          const captureBounds = postBounds || result.focusedElement?.boundingBox;
          if (captureBounds) {
            const captureReason = decision.capture?.reason || decision.strategic?.reason || "LLM strategic capture";
            const captured = await this.screenshotCollector.captureFocusedElement(
              captureBounds,
              source,
              context.currentGoal.target,
              captureReason
            );
            if (captured) {
              postsCollected++;
              phaseItemsCollected++;
              console.log(`  \u{1F4F8} Capture: ${captureReason}${postBounds ? " (full post)" : " (element)"}`);
            }
          }
        }
        if (decision.strategic?.lingerDuration) {
          await this.navigationExecutor.executeLinger(decision.strategic);
        }
        const engagementLevel = await this.navigator.detectEngagementLevel();
        if (engagementLevel.level !== engagementState.level) {
          console.log(`  \u{1F4CD} Engagement: ${engagementState.level} \u2192 ${engagementLevel.level}`);
          engagementState.level = engagementLevel.level;
          engagementState.levelEnteredAt = Date.now();
          if (engagementLevel.level === "post_modal" && engagementLevel.postUrl) {
            engagementState.currentPost = {
              postUrl: engagementLevel.postUrl,
              username: engagementLevel.username
            };
            engagementState.entryAction = "clicked_post";
          }
          if (engagementLevel.level === "profile") {
            engagementState.currentPost = {
              username: engagementLevel.username
            };
            engagementState.entryAction = "clicked_username";
          }
        }
        if (engagementState.level === "post_modal") {
          const metrics = await this.navigator.extractPostEngagementMetrics();
          engagementState.postMetrics = {
            likeCount: metrics.likeCount,
            commentCount: metrics.commentCount,
            hasVideo: metrics.hasVideo
          };
          if (metrics.carouselState) {
            const prevSlide = engagementState.carouselState?.currentSlide || 0;
            engagementState.carouselState = {
              currentSlide: metrics.carouselState.currentSlide,
              totalSlides: metrics.carouselState.totalSlides,
              fullyExplored: metrics.carouselState.currentSlide === metrics.carouselState.totalSlides
            };
            if (prevSlide !== metrics.carouselState.currentSlide) {
              console.log(`  \u{1F3A0} Carousel: Slide ${metrics.carouselState.currentSlide}/${metrics.carouselState.totalSlides}`);
            }
          }
        }
        if (decision.strategic?.closeEngagement) {
          if (engagementState.currentPost?.postUrl) {
            engagementState.deeplyExploredPostUrls.push(engagementState.currentPost.postUrl);
            console.log(`  \u2713 Added to explored posts (${engagementState.deeplyExploredPostUrls.length} total)`);
          }
          if (decision.action === "press" && decision.params.key === "Escape") {
            engagementState.level = "feed";
            engagementState.currentPost = void 0;
            engagementState.carouselState = void 0;
            engagementState.postMetrics = void 0;
            engagementState.entryAction = void 0;
            engagementState.levelEnteredAt = Date.now();
          }
        }
      } else {
        console.log(`  \u274C Action failed: ${result.errorMessage}`);
      }
      actionCount++;
      if (consecutiveLoopWarnings >= 3) {
        const recovery = this.navigationExecutor.getRecoveryAction(loopStatus.severity);
        console.log(`  \u{1F6A8} Auto-recovery (LLM failed to recover after ${consecutiveLoopWarnings} warnings): ${recovery.reason}`);
        const scrollYBefore = await this.scroll.getScrollPosition();
        if (recovery.action === "press" && recovery.key) {
          await this.page.keyboard.press(recovery.key);
        } else if (recovery.action === "back") {
          await this.page.goBack({ waitUntil: "domcontentloaded", timeout: 5e3 }).catch(() => {
          });
        } else if (recovery.action === "navigate_home") {
          await this.page.goto("https://www.instagram.com/", { waitUntil: "domcontentloaded", timeout: 1e4 }).catch(() => {
          });
        }
        await this.humanDelay(1e3, 2e3);
        consecutiveLoopWarnings = 0;
        const scrollYAfter = await this.scroll.getScrollPosition();
        stagnationEvents.push({
          scrollY: scrollYBefore,
          phase: currentPhase,
          recoveryAction: recovery.action,
          recoveredSuccessfully: scrollYAfter !== scrollYBefore || recovery.action === "navigate_home"
        });
      }
      if (!decision.strategic?.lingerDuration) {
        const [minDelay, maxDelay] = config.actionDelayMs;
        await this.humanDelay(minDelay / 2, maxDelay / 2);
      }
    }
    phaseHistory.push({
      phase: currentPhase,
      durationMs: Date.now() - phaseStartTime,
      itemsCollected: phaseItemsCollected
    });
    console.log(`
\u{1F4CA} LLM Navigation Complete:`);
    console.log(`   Actions: ${actionCount}`);
    console.log(`   Posts captured: ${postsCollected}`);
    console.log(`   Stories watched: ${storiesWatched}`);
    console.log(`   Unique content ratio: ${(uniquePosts.size / Math.max(totalPostsSeen, 1) * 100).toFixed(0)}%`);
    console.log(`   Posts deeply explored: ${engagementState.deeplyExploredPostUrls.length}`);
    console.log(`   Phase history: ${phaseHistory.map((p) => `${p.phase}(${(p.durationMs / 1e3).toFixed(0)}s)`).join(" \u2192 ")}`);
    const sessionSummary = {
      id: `session-${startTime}`,
      timestamp: startTime,
      durationMs: Date.now() - startTime,
      interestResults: userInterests.map((interest) => {
        const searchedAt = interestsSearched.indexOf(interest);
        return {
          interest,
          captureCount: Math.round(postsCollected / Math.max(userInterests.length, 1)),
          searchTimeMs: searchedAt >= 0 ? phaseHistory.find((p) => p.phase === "search")?.durationMs || 0 : 0,
          quality: postsCollected / Math.max(userInterests.length, 1) >= 5 ? "high" : postsCollected / Math.max(userInterests.length, 1) >= 2 ? "medium" : "low"
        };
      }),
      phaseBreakdown: phaseHistory.map((p) => ({
        phase: p.phase,
        durationMs: p.durationMs,
        capturesProduced: p.itemsCollected
      })),
      stagnationEvents,
      totalCaptures: postsCollected,
      totalActions: actionCount,
      uniqueContentRatio: uniquePosts.size / Math.max(totalPostsSeen, 1)
    };
    await this.sessionMemory.saveSession(sessionSummary);
  }
  /**
   * Estimate engagement level based on capture rate.
   */
  estimateEngagementLevel(postsCollected, elapsedMs) {
    const capturesPerMinute = postsCollected / (elapsedMs / 6e4);
    if (capturesPerMinute > 3) return "high";
    if (capturesPerMinute > 1) return "medium";
    return "low";
  }
  /**
   * Extract post ID from a URL string.
   * Matches instagram.com/p/{ID}/ or /reel/{ID}/ patterns.
   */
  extractPostIdFromUrl(url) {
    const match = url.match(/\/(p|reel)\/([A-Za-z0-9_-]+)/);
    return match ? match[2] : null;
  }
  /**
   * Get the navigation goal for a given phase.
   * Note: Time allocation is now fully LLM-controlled.
   * These goals provide hints but LLM decides actual duration.
   */
  getGoalForPhase(phase, userInterests, interestsSearched, currentView, currentUrl) {
    if (currentView === "profile") {
      const username = this.navigator.getProfileUsername() || "this profile";
      return {
        type: "explore_profile",
        target: username
      };
    }
    return { type: "analyze_account" };
  }
  // NOTE: shouldTransitionPhase() and getNextPhase() removed
  // LLM now controls phase transitions through strategic decisions
};

// src/main/services/AnalysisGenerator.ts
var MAX_CAPTION_LENGTH = 280;
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
   * Prepare content using explicit POST delimiters for strict atomic pairing.
   * Each post is wrapped in --- POST START --- / --- POST END --- tags
   * to prevent the LLM from mixing captions between posts.
   *
   * EXTRACTION RULE: The LLM is FORBIDDEN from borrowing data across POST boundaries.
   */
  prepareContentSummary(session2) {
    const posts = [];
    let itemId = 1;
    let skippedCount = 0;
    for (const post of session2.feedContent) {
      const caption = post.caption || "";
      let source = "feed";
      let interest;
      let cleanCaption = caption;
      const searchMatch = caption.match(/\[SEARCH: ([^\]]+)\]/);
      const carouselMatch = caption.match(/\[CAROUSEL: ([^\]]+)\]/);
      const profileMatch = caption.match(/\[PROFILE: ([^\]]+)\]/);
      const highlightMatch = caption.match(/\[HIGHLIGHT: ([^\]]+)\]/);
      if (searchMatch) {
        source = "search";
        interest = searchMatch[1];
        cleanCaption = caption.replace(/\[SEARCH: [^\]]+\]\s*/, "");
      } else if (carouselMatch) {
        source = "carousel";
        cleanCaption = caption.replace(/\[CAROUSEL: [^\]]+\]\s*/, "");
      } else if (profileMatch) {
        source = "profile";
        cleanCaption = caption.replace(/\[PROFILE: [^\]]+\]\s*/, "");
      } else if (highlightMatch) {
        source = "highlight";
        cleanCaption = caption.replace(/\[HIGHLIGHT: [^\]]+\]\s*/, "");
      }
      if (this.isLowSaliencyContent(cleanCaption, post.visualDescription || "", post.username)) {
        skippedCount++;
        continue;
      }
      const truncatedCaption = this.truncateCaption(cleanCaption);
      const truncatedImage = this.truncateCaption(post.visualDescription || "");
      let postBlock = `--- POST START ---
ID: ${itemId++}
Handle: @${post.username}
Caption: ${truncatedCaption || "[No caption]"}
Image: ${truncatedImage || "[No description]"}
Content Type: ${post.isVideoContent ? "video" : "image"}
Source: ${source}`;
      if (interest) {
        postBlock += `
Interest: ${interest}`;
      }
      postBlock += "\n--- POST END ---";
      posts.push(postBlock);
    }
    for (const story of session2.storiesContent) {
      if (this.isLowSaliencyContent(story.caption || "", story.visualDescription || "", story.username)) {
        skippedCount++;
        continue;
      }
      const truncatedCaption = this.truncateCaption(story.caption || "");
      const truncatedImage = this.truncateCaption(story.visualDescription || "");
      posts.push(`--- POST START ---
ID: ${itemId++}
Handle: @${story.username}
Caption: ${truncatedCaption || "[No caption]"}
Image: ${truncatedImage || "[No description]"}
Content Type: ${story.isVideoContent ? "video" : "image"}
Source: story
--- POST END ---`);
    }
    const searchCount = posts.filter((p) => p.includes("Source: search")).length;
    const feedCount = posts.filter((p) => p.includes("Source: feed")).length;
    const storyCount = posts.filter((p) => p.includes("Source: story")).length;
    const otherCount = posts.length - searchCount - feedCount - storyCount;
    if (skippedCount > 0) {
      console.log(`\u{1F4CB} Skipped ${skippedCount} low-saliency posts (ads, generic intros)`);
    }
    return `CONTENT DATA (${posts.length} posts total, ${skippedCount} skipped):
- Search results: ${searchCount}
- Feed posts: ${feedCount}
- Stories: ${storyCount}
- Other (carousel/profile/highlight): ${otherCount}

${posts.join("\n\n")}`;
  }
  /**
   * Filter out low-saliency content that adds noise to the analysis.
   * Returns true if the content should be SKIPPED.
   */
  isLowSaliencyContent(caption, imageDesc, username) {
    const captionLower = caption.toLowerCase();
    const imageLower = imageDesc.toLowerCase();
    const combined = `${captionLower} ${imageLower}`;
    const introPatterns = [
      "meet the class",
      "welcome to the class",
      "introducing the class",
      "class of 20",
      "meet our new",
      "welcome our new",
      "join us in welcoming",
      "excited to introduce"
    ];
    if (introPatterns.some((p) => combined.includes(p))) {
      return true;
    }
    const adPatterns = [
      "shop now",
      "limited time",
      "use code",
      "link in bio",
      "swipe up",
      "click the link",
      "free shipping",
      "order now",
      "get yours",
      "don't miss out",
      "sale ends",
      "% off"
    ];
    const adMatchCount = adPatterns.filter((p) => combined.includes(p)).length;
    if (adMatchCount >= 2 && caption.length < 150) {
      return true;
    }
    if (!caption.trim() && (!imageDesc.trim() || imageLower.includes("generic") || imageLower.includes("stock photo"))) {
      return true;
    }
    return false;
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
    const prompt = `You are a HIGH-DENSITY RESEARCH JOURNALIST and STRATEGIC INTELLIGENCE ANALYST creating a personalized briefing for ${config.userName}.

\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
I. GROUNDING & FIDELITY RULES (VIOLATIONS = FAILURE)
\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550

EXTRACTION RULE (CRITICAL):
You are an extraction engine. You are FORBIDDEN from mixing data across POST boundaries.
Each post is wrapped in --- POST START --- / --- POST END --- delimiters.
If Post A has no caption, do NOT borrow the caption from Post B.
Use ONLY the data within the specific POST tags.

ATOMIC PAIRING:
- Each {Handle, Image, Caption} is an ISOLATED unit
- NEVER combine data from different POST blocks into the same bullet
- If Post #5 has a sunset and Post #8 has a football game, they are SEPARATE bullets

HANDLE-FIRST ATTRIBUTION:
- Every bullet MUST begin with **@handle** in bold
- Format: "\u2022 **@handle**: [Fact from THIS post only]. [Contextual Analysis if warranted]"
- The handle anchors the bullet to its source - no exceptions

NO HALLUCINATIONS:
- If a post has [No caption], describe only what's visible in the Image field
- If you add contextual analysis (trends, implications), label it as [Contextual Analysis: ...]
- NEVER invent meaning like "fostering lifelong connections" or "celebrating innovation"

\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
II. ANALYSIS DEPTH (THE "SO WHAT?" PROTOCOL)
\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550

For HIGH-VALUE posts (search results, breaking news, user interests), apply 3-level analysis:

Level 1 - THE EVENT: What's literally in the pixels/caption
Level 2 - THE TREND: What 2026 theme does this connect to?
Level 3 - THE IMPLICATION: Why should the reader care?

Example of proper depth:
\u2022 **@applebees**: Launching the 'O-M-Cheese' burger for $11.99. [Contextual Analysis: This reflects casual dining's 2026 "Premium Value" pivot as chains fight fast-casual competition on price while maintaining perceived quality.]

For LOW-VALUE posts (generic updates, ephemeral stories), use Level 1 only:
\u2022 **@friend_account**: Shared a sunset photo from the beach.

\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
III. NEGATIVE CONSTRAINTS (DO NOT)
\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550

\u274C Do NOT use filler phrases: "The photo shows," "The caption says," "Interestingly,"
\u274C Do NOT summarize 5 posts into 1 bland bullet
\u274C Do NOT generate market analysis for student intro posts
\u274C Do NOT report on generic ads (unless directly relevant to ${interestsList})
\u274C Do NOT invent emotional narrative ("celebrating team spirit," "embracing the journey")
\u274C Do NOT mix handles across bullet points

\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
IV. USER PROFILE
\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550

Name: ${config.userName}
Location: ${config.location || "Not specified"}
Priority Interests: ${interestsList}
Date: ${dayName}, ${dateStr}

\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
V. CONTENT DATA (ATOMIC POST BLOCKS)
\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550

${contentSummary}

\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
VI. OUTPUT STRUCTURE
\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550

BULLET FORMAT (MANDATORY):
\u2022 **@handle**: [Level 1 event]. [Level 2/3 contextual analysis if high-value].

SECTION STRUCTURE:

# [Compelling Title Based on Top Story]
### [Key Strategic Insight] \u2014 ${dayName}, ${dateStr}${config.location ? `, ${config.location}` : ""}

## \u{1F3AF} Strategic Interests: ${interestsList}
[4-6 bullets from search results and interest-matching posts]
[Apply full "So What?" Protocol - Levels 1-3]

## \u{1F30D} Global Intelligence
[3-4 bullets from general newsworthy content]
[Cross-reference with current events where verifiable]

## \u26A1 Lightning Round
[2-3 single-sentence quick hits for remaining notable content]
[Level 1 only - just the facts]

PRIORITY RULES:
- Posts with Source: search are HIGH PRIORITY (match user interests)
- Posts with Source: story are ephemeral (lower priority unless newsworthy)
- Posts with Interest: field should be featured prominently

EXAMPLES:

\u2705 CORRECT (with depth):
\u2022 **@CalFootball**: Posted "Class is in session" with a facility photo. [Contextual Analysis: This aligns with December's early signing period - Cal's 2026 class is ranked #18 nationally.]

\u2705 CORRECT (Level 1 only for low-value):
\u2022 **@personal_friend**: Shared a coffee shop photo in San Francisco.

\u274C WRONG (mixing posts):
\u2022 **@CalFootball** celebrated the Warriors' victory... (NEVER mix handles across posts)

\u274C WRONG (hallucinating):
\u2022 **@UniversityAccount**: "Fostering lifelong connections through education" (if caption just said "Beautiful day")

Return valid JSON:
{
    "title": "string",
    "subtitle": "string",
    "sections": [
        {"heading": "string", "content": ["\u2022 **@handle**: Fact. [Contextual Analysis: Trend and implication].", "\u2022 **@handle**: Fact."]},
        {"heading": "string", "content": ["\u2022 **@handle**: Fact with context."]},
        {"heading": "string", "content": ["\u2022 **@handle**: Quick fact."]}
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
        model: "gpt-4o",
        // Best model for analysis
        messages: [{ role: "user", content: prompt }],
        max_tokens: 2e3,
        temperature: 0.3,
        // Low for factual accuracy, strict attribution
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

// src/main/services/BatchDigestGenerator.ts
var BatchDigestGenerator = class {
  apiKey;
  usageService;
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.usageService = UsageService.getInstance();
  }
  /**
   * Generate a digest from all captured screenshots in one API call.
   * Uses GPT-4o Vision with multiple images.
   *
   * @param captures - Array of captured screenshots from browsing session
   * @param config - User configuration (name, interests, location)
   * @returns Complete analysis object ready for display
   */
  async generateDigest(captures, config) {
    if (captures.length === 0) {
      throw new Error("INSUFFICIENT_CONTENT: No screenshots captured");
    }
    const now = /* @__PURE__ */ new Date();
    const dayName = now.toLocaleDateString("en-US", { weekday: "long" });
    const dateStr = now.toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric"
    });
    const imageContents = captures.map((capture) => ({
      type: "image_url",
      image_url: {
        url: `data:image/jpeg;base64,${capture.screenshot.toString("base64")}`,
        detail: "low"
        // Cost optimization: low detail for social media content
      }
    }));
    const prompt = this.buildDigestPrompt(config, dayName, dateStr, captures);
    console.log(`\u{1F916} Generating digest from ${captures.length} screenshots...`);
    const messageContent = [
      { type: "text", text: prompt },
      ...imageContents
    ];
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${this.apiKey}`
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [{
          role: "user",
          content: messageContent
        }],
        max_tokens: 3e3,
        temperature: 0.3,
        // Low for factual accuracy
        response_format: { type: "json_object" }
      })
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error("\u274C Digest generation API error:", errorData);
      throw new Error("DIGEST_GENERATION_FAILED");
    }
    const data = await response.json();
    if (data.usage) {
      await this.usageService.incrementUsage(data.usage);
      console.log(`\u{1F4B0} Digest cost tracked: ${data.usage.total_tokens} tokens`);
    }
    const content = data.choices[0]?.message?.content;
    if (!content) {
      throw new Error("DIGEST_GENERATION_FAILED: No content in response");
    }
    try {
      return this.parseDigestResponse(content, config, dayName, dateStr);
    } catch (parseError) {
      console.error("\u274C Failed to parse digest response:", parseError);
      throw new Error("DIGEST_GENERATION_FAILED");
    }
  }
  /**
   * Build the system prompt for digest generation.
   */
  buildDigestPrompt(config, dayName, dateStr, captures) {
    const interestsList = config.interests.length > 0 ? config.interests.map((i) => `"${i}"`).join(", ") : "General news and trends";
    const feedCount = captures.filter((c) => c.source === "feed").length;
    const storyCount = captures.filter((c) => c.source === "story").length;
    const searchCount = captures.filter((c) => c.source === "search").length;
    const profileCount = captures.filter((c) => c.source === "profile").length;
    const carouselCount = captures.filter((c) => c.source === "carousel").length;
    const searchInterests = [...new Set(
      captures.filter((c) => c.source === "search" && c.interest).map((c) => c.interest)
    )];
    return `You are a STRATEGIC INTELLIGENCE ANALYST creating a personalized morning briefing for ${config.userName}.

\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
I. YOUR TASK
\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550

You are viewing ${captures.length} Instagram screenshots captured during a browsing session.
- Feed posts: ${feedCount}
- Stories: ${storyCount}
- Search results: ${searchCount}${searchInterests.length > 0 ? ` (searched: ${searchInterests.join(", ")})` : ""}
- Profile views: ${profileCount}
- Carousel slides: ${carouselCount}

Analyze ALL images and synthesize them into ONE comprehensive digest.

\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
II. USER PROFILE
\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550

Name: ${config.userName}
Priority Interests: ${interestsList}
Location: ${config.location || "Not specified"}
Date: ${dayName}, ${dateStr}

\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
III. AD & SPONSORED CONTENT DETECTION (CRITICAL)
\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550

COMPLETELY SKIP and do NOT include in the digest:
- Posts with "Sponsored" label visible
- Posts with "Paid partnership" label
- Ads (product promotions with "Shop Now", "Learn More" buttons)
- Brand accounts pushing products with pricing
- Influencer sponsored content (typically has disclaimers)
- Screenshots that are mostly blank, loading, or unclear

INCLUDE (even if commercial):
- News organization updates (even with subscription CTAs)
- Personal accounts sharing genuine experiences
- Entertainment/sports content (games, shows, events)

\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
IV. ANALYSIS RULES (CRITICAL - VIOLATIONS = FAILURE)
\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550

1. **ATTRIBUTION (MANDATORY)**:
   - Every bullet MUST start with **@handle** in bold (extract username from screenshot)
   - If you cannot read the handle clearly, use **@[unclear]** but still include the content
   - Format: "\u2022 **@handle**: [Fact]. [Contextual Analysis if warranted]."

2. **DEPTH - THE "SO WHAT?" PROTOCOL**:
   For HIGH-VALUE content (news, user interests, breaking updates):
   - Level 1: What's literally in the image
   - Level 2: What trend does this connect to?
   - Level 3: Why should the reader care?

   For LOW-VALUE content (generic updates, lifestyle posts):
   - Level 1 only: Just the facts, one sentence

3. **PRIORITIZATION**:
   - Search results matching "${interestsList}" = HIGH PRIORITY (feature prominently)
   - Breaking news / time-sensitive content = HIGH PRIORITY
   - Stories from friends/followed accounts = HIGH (personal relevance)
   - Generic lifestyle posts = LOW (brief mention or skip)

4. **NO HALLUCINATIONS**:
   - Only report what you can SEE in the screenshots
   - If you can't read text clearly, say "[text unclear]"
   - Label any inference as [Contextual Analysis: ...]
   - NEVER invent emotional narrative ("celebrating team spirit," "fostering connections")

5. **NEGATIVE CONSTRAINTS**:
   \u274C Do NOT use filler phrases: "The photo shows," "The caption says," "Interestingly"
   \u274C Do NOT summarize 5 posts into 1 bland bullet
   \u274C Do NOT mix handles across bullet points
   \u274C Do NOT generate deep analysis for ads or sponsored content
   \u274C Do NOT report on duplicate/similar screenshots multiple times

\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
V. OUTPUT STRUCTURE
\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550

Return valid JSON with this structure:
{
    "title": "[Compelling headline based on top story - be specific and engaging]",
    "subtitle": "[Key strategic insight in one sentence] \u2014 ${dayName}, ${dateStr}",
    "sections": [
        {
            "heading": "[Your chosen heading with emoji - based on content themes you observe]",
            "content": [
                "\u2022 **@handle**: [Fact from screenshot]. [Contextual Analysis: trend/implication].",
                "\u2022 **@handle**: [Another fact with depth]."
            ]
        }
    ]
}

**SECTION RULES** (CRITICAL):
- CREATE YOUR OWN HEADINGS based on the content themes you observe
- Group related content into logical sections with descriptive headings
- Use emojis at the start of each heading (e.g., "\u{1F3C8} Football Updates", "\u{1F310} World News", "\u{1F3AC} Entertainment")
- Do NOT use generic headings like "Section 1" - be specific to the content
- Aim for 2-5 sections depending on content variety
- Each section should have a clear theme that groups related posts

**HEADING EXAMPLES** (create your own based on what you see):
- "\u{1F3C8} Cal Football Recruiting" (if you see multiple football-related posts)
- "\u{1F30D} Breaking News" (for urgent/important news items)
- "\u{1F3AD} Entertainment & Pop Culture" (for entertainment content)
- "\u{1F4F1} Tech & Innovation" (for technology content)
- "\u{1F3E0} Local Bay Area" (for location-specific content)
- "\u{1F465} Friends & Following" (for personal updates from followed accounts)

TARGET: 15-25 high-quality bullets total across sections.
SKIP: Ads, sponsored content, empty/unclear screenshots, duplicate content.

\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
VI. EXAMPLES
\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550

\u2705 CORRECT (with depth):
\u2022 **@CalFootball**: Posted recruiting update showing new 5-star commit. [Contextual Analysis: This brings Cal's 2026 class to #18 nationally during early signing period.]

\u2705 CORRECT (quick hit):
\u2022 **@friend_account**: Shared a sunset photo from Malibu.

\u274C WRONG (missing handle):
\u2022 Someone posted about a new restaurant opening...

\u274C WRONG (hallucinating):
\u2022 **@UniversityAccount**: "Fostering lifelong connections through education" (if you can't read this in the screenshot, don't invent it)

\u2705 CORRECT SECTION HEADING (based on content):
"\u{1F3C8} Cal Football & ACC News" (when you see multiple football posts)

\u274C WRONG SECTION HEADING (generic):
"Strategic Interests" (too generic - be specific to what you observe)`;
  }
  /**
   * Parse the LLM response into a structured AnalysisObject.
   */
  parseDigestResponse(content, config, dayName, dateStr) {
    const parsed = JSON.parse(content);
    if (!parsed.title || !parsed.sections || !Array.isArray(parsed.sections)) {
      throw new Error("Invalid response structure: missing title or sections");
    }
    const sections = parsed.sections.map((s) => ({
      heading: s.heading || "Untitled Section",
      content: Array.isArray(s.content) ? s.content : [s.content || ""]
    }));
    console.log(`\u2705 Digest generated successfully`);
    console.log(`   Sections: ${sections.length}`);
    return {
      title: parsed.title,
      subtitle: parsed.subtitle || `Your Instagram Digest \u2014 ${dayName}, ${dateStr}`,
      sections,
      date: (/* @__PURE__ */ new Date()).toISOString(),
      location: config.location || "",
      scheduledTime: (/* @__PURE__ */ new Date()).toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        hour12: true
      })
    };
  }
};

// src/main/services/ImageTagger.ts
var ImageTagger = class {
  apiKey;
  userInterests;
  usageService;
  constructor(apiKey, userInterests) {
    this.apiKey = apiKey;
    this.userInterests = userInterests;
    this.usageService = UsageService.getInstance();
  }
  /**
   * Batch-tag all captured images in a single API call.
   * Uses gpt-4o-mini for cost efficiency.
   *
   * @param captures - Array of captured screenshots to tag
   * @returns TaggingResult with tags for each image and token usage
   */
  async tagBatch(captures) {
    if (captures.length === 0) {
      console.log("\u{1F3F7}\uFE0F No images to tag");
      return { tags: [], tokensUsed: 0 };
    }
    console.log(`\u{1F3F7}\uFE0F Tagging ${captures.length} images with gpt-4o-mini...`);
    const imageContents = captures.map((capture) => ({
      type: "image_url",
      image_url: {
        url: `data:image/jpeg;base64,${capture.screenshot.toString("base64")}`,
        detail: "low"
        // Cost optimization
      }
    }));
    const prompt = this.buildTaggingPrompt(captures.length);
    const messageContent = [
      { type: "text", text: prompt },
      ...imageContents
    ];
    try {
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${this.apiKey}`
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          // Cost-efficient for tagging
          messages: [{
            role: "user",
            content: messageContent
          }],
          max_tokens: 3e3,
          temperature: 0.1,
          // Low for consistent tagging
          response_format: { type: "json_object" }
        })
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error("\u274C Tagging API error:", errorData);
        throw new Error("TAGGING_FAILED");
      }
      const data = await response.json();
      const tokensUsed = data.usage?.total_tokens || 0;
      if (data.usage) {
        await this.usageService.incrementUsage(data.usage);
        console.log(`\u{1F4B0} Tagging cost tracked: ${tokensUsed} tokens`);
      }
      const content = data.choices[0]?.message?.content;
      if (!content) {
        throw new Error("TAGGING_FAILED: No content in response");
      }
      const tags = this.parseTaggingResponse(content, captures.length);
      const adCount = tags.filter((t2) => t2.isAd).length;
      const blankCount = tags.filter((t2) => t2.isBlank).length;
      const validCount = tags.filter((t2) => !t2.isAd && !t2.isBlank).length;
      console.log(`\u{1F3F7}\uFE0F Tagged ${tags.length} images:`);
      console.log(`   Ads: ${adCount}, Blank: ${blankCount}, Valid: ${validCount}`);
      return { tags, tokensUsed };
    } catch (error) {
      console.error("\u274C Tagging failed:", error.message);
      return { tags: [], tokensUsed: 0 };
    }
  }
  /**
   * Select the best N images based on tags.
   * Filters out ads and blank images, then sorts by relevance + quality.
   *
   * @param captures - Original captured screenshots
   * @param tags - Tags from tagBatch()
   * @param count - Maximum number of images to select (default 25)
   * @returns Selected captures in original chronological order
   */
  selectBest(captures, tags, count = 25) {
    if (tags.length === 0) {
      console.log(`\u{1F3F7}\uFE0F No tags available, using first ${count} captures`);
      return captures.slice(0, count);
    }
    const validTags = tags.filter((t2) => !t2.isAd && !t2.isBlank);
    if (validTags.length === 0) {
      console.warn("\u{1F3F7}\uFE0F All images filtered (ads/blank), using original captures");
      return captures.slice(0, count);
    }
    const sorted = [...validTags].sort((a, b) => {
      const scoreA = a.relevance * 1.5 + a.quality;
      const scoreB = b.relevance * 1.5 + b.quality;
      return scoreB - scoreA;
    });
    const selectedIds = new Set(sorted.slice(0, count).map((t2) => t2.imageId));
    const selected = captures.filter((c) => selectedIds.has(c.id));
    console.log(`\u{1F3F7}\uFE0F Selected ${selected.length} best images from ${captures.length} total`);
    const topTags = sorted.slice(0, 5);
    console.log(`\u{1F3F7}\uFE0F Top selections:`);
    for (const tag of topTags) {
      console.log(`   #${tag.imageId}: relevance=${tag.relevance}, quality=${tag.quality} - ${tag.description.substring(0, 40)}...`);
    }
    return selected;
  }
  /**
   * Build the tagging prompt for gpt-4o-mini.
   */
  buildTaggingPrompt(imageCount) {
    const interests = this.userInterests.length > 0 ? this.userInterests.join(", ") : "general news and updates";
    return `You are analyzing ${imageCount} Instagram screenshots. For each image (numbered 1-${imageCount} in order), provide a brief tag.

USER INTERESTS: ${interests}

For each image, determine:
1. isAd: Is this sponsored content, an ad, or promotional material? (true/false)
2. isBlank: Is this a loading screen, blank, or unreadable? (true/false)
3. relevance: How relevant is this to the user's interests? (0-10, where 10 = directly matches interests)
4. quality: How clear and informative is this screenshot? (0-10, where 10 = perfect quality, readable text)
5. description: One brief sentence describing what's shown (max 50 chars)

DETECTION RULES:

Mark isAd=true for:
- Posts with "Sponsored" label visible
- Posts with "Paid partnership" label
- Product ads with "Shop Now", "Learn More" buttons
- Brand accounts with pricing/promotions
- Influencer sponsored content with disclaimers

Mark isBlank=true for:
- Loading spinners or skeleton UI
- Mostly empty/white screens
- Text too small or blurry to read
- Transition screens between content
- Error states

SCORING GUIDE:

relevance 8-10: Directly matches user interests (e.g., sports team they follow, local news)
relevance 5-7: Generally newsworthy or broadly interesting
relevance 2-4: Personal/lifestyle content, generic posts
relevance 0-1: Off-topic, irrelevant to most users

quality 8-10: Clear image, readable text, complete post visible
quality 5-7: Acceptable quality, some text readable
quality 2-4: Partial content visible, some blur
quality 0-1: Unreadable, severely cropped, or corrupted

Return JSON with this exact format:
{
    "tags": [
        {"imageId": 1, "isAd": false, "isBlank": false, "relevance": 8, "quality": 9, "description": "Cal Football recruiting news"},
        {"imageId": 2, "isAd": true, "isBlank": false, "relevance": 0, "quality": 7, "description": "Sponsored product ad"},
        {"imageId": 3, "isAd": false, "isBlank": true, "relevance": 0, "quality": 0, "description": "Loading screen"}
    ]
}

IMPORTANT: You must return a tag for EVERY image from 1 to ${imageCount}. Do not skip any.`;
  }
  /**
   * Parse the LLM response into ImageTag array.
   * Handles missing tags by filling with defaults.
   */
  parseTaggingResponse(content, expectedCount) {
    try {
      const parsed = JSON.parse(content);
      const rawTags = parsed.tags || [];
      const tagMap = /* @__PURE__ */ new Map();
      for (const tag of rawTags) {
        if (typeof tag.imageId === "number") {
          tagMap.set(tag.imageId, tag);
        }
      }
      const result = [];
      for (let i = 1; i <= expectedCount; i++) {
        const existing = tagMap.get(i);
        if (existing) {
          result.push({
            imageId: i,
            isAd: Boolean(existing.isAd),
            isBlank: Boolean(existing.isBlank),
            relevance: Math.max(0, Math.min(10, Number(existing.relevance) || 0)),
            quality: Math.max(0, Math.min(10, Number(existing.quality) || 0)),
            description: String(existing.description || "No description")
          });
        } else {
          console.warn(`\u{1F3F7}\uFE0F Missing tag for image #${i}, using default`);
          result.push({
            imageId: i,
            isAd: false,
            isBlank: false,
            // Don't exclude, just give low score
            relevance: 3,
            quality: 3,
            description: "Tag missing from LLM response"
          });
        }
      }
      return result;
    } catch (e) {
      console.error("\u274C Failed to parse tagging response:", e);
      return [];
    }
  }
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
  setMainWindow(window2) {
    this.mainWindow = window2;
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
    this.suspensionBlockerId = import_electron5.powerSaveBlocker.start("prevent-app-suspension");
    console.log(`\u{1F50B} Power Save Blocker active (ID: ${this.suspensionBlockerId})`);
    this.startHeartbeat();
    import_electron5.powerMonitor.on("resume", () => {
      console.log(`\u26A1\uFE0F System Resumed. Heartbeat active. App Uptime: ${Math.floor(process.uptime() / 60)}m. Last Wake (Start) Time: ${this.lastWakeTime.toLocaleString()}`);
      this.startHeartbeat();
    });
  }
  startHeartbeat() {
    if (this.checkInterval) clearInterval(this.checkInterval);
    if (this.alignmentTimeout) clearTimeout(this.alignmentTimeout);
    this.handleInsomniaState();
    import_electron5.powerMonitor.on("on-ac", () => {
      console.log("\u{1F50C} Power Source: AC. Re-evaluating Insomnia Mode...");
      this.handleInsomniaState();
    });
    import_electron5.powerMonitor.on("on-battery", () => {
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
    if (!import_electron5.powerMonitor.isOnBatteryPower()) {
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
    const userDataPath = import_electron5.app.getPath("userData");
    const recordDir = import_path4.default.join(userDataPath, "analysis_records");
    const recordPath = import_path4.default.join(recordDir, `${newRecord.id}.json`);
    const tempPath = import_path4.default.join(recordDir, `${newRecord.id}.tmp`);
    try {
      await import_fs4.default.promises.writeFile(tempPath, JSON.stringify(newRecord, null, 2));
      await import_fs4.default.promises.rename(tempPath, recordPath);
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
        if (import_fs4.default.existsSync(tempPath)) await import_fs4.default.promises.unlink(tempPath);
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
      const userDataPath = import_electron5.app.getPath("userData");
      const recordDir = import_path4.default.join(userDataPath, "analysis_records");
      const recordPath = import_path4.default.join(recordDir, `${recordId}.json`);
      const tempPath = import_path4.default.join(recordDir, `${recordId}.tmp`);
      await import_fs4.default.promises.mkdir(recordDir, { recursive: true });
      await import_fs4.default.promises.writeFile(tempPath, JSON.stringify(newRecord, null, 2));
      await import_fs4.default.promises.rename(tempPath, recordPath);
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
      if (_SchedulerService.USE_SCREENSHOT_FIRST) {
        await this.triggerBakerScreenshotFirst(now, store, scheduledTime);
      } else {
        await this.triggerBakerReal(now, store, scheduledTime);
      }
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
    const userDataPath = import_electron5.app.getPath("userData");
    const recordDir = import_path4.default.join(userDataPath, "analysis_records");
    const recordPath = import_path4.default.join(recordDir, `${newRecord.id}.json`);
    const tempPath = import_path4.default.join(recordDir, `${newRecord.id}.tmp`);
    try {
      await import_fs4.default.promises.mkdir(recordDir, { recursive: true });
      await import_fs4.default.promises.writeFile(tempPath, JSON.stringify(newRecord, null, 2));
      await import_fs4.default.promises.rename(tempPath, recordPath);
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
        if (import_fs4.default.existsSync(tempPath)) await import_fs4.default.promises.unlink(tempPath);
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
      const userDataPath = import_electron5.app.getPath("userData");
      const recordDir = import_path4.default.join(userDataPath, "analysis_records");
      const recordPath = import_path4.default.join(recordDir, `${recordId}.json`);
      const tempPath = import_path4.default.join(recordDir, `${recordId}.tmp`);
      await import_fs4.default.promises.mkdir(recordDir, { recursive: true });
      await import_fs4.default.promises.writeFile(tempPath, JSON.stringify(newRecord, null, 2));
      await import_fs4.default.promises.rename(tempPath, recordPath);
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
    if (_SchedulerService.USE_SCREENSHOT_FIRST) {
      await this.triggerDebugRunScreenshotFirst();
    } else {
      await this.triggerDebugRunLegacy();
    }
  }
  /**
   * DEBUG RUN (Screenshot-First): Uses the new screenshot-based architecture.
   */
  async triggerDebugRunScreenshotFirst() {
    console.log("\u{1F9EA} Debug Run (Screenshot-First): Starting Visible Browsing Pipeline");
    const store = await this.getStore();
    const settings = store.get("settings") || {};
    const now = /* @__PURE__ */ new Date();
    const scheduledTime = now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
    const MINIMUM_CAPTURES = 10;
    const BROWSE_DURATION_MS = 5 * 60 * 1e3;
    const browserManager = BrowserManager.getInstance();
    let context = null;
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send("debug-run-started", {
        durationMs: BROWSE_DURATION_MS,
        startTime: Date.now()
      });
    }
    try {
      const apiKey = await SecureKeyManager.getInstance().getKey();
      if (!apiKey) {
        console.error("\u{1F9EA} Debug Run: NO API KEY");
        this.mainWindow?.webContents.send("analysis-error", { message: "API key not found." });
        this.mainWindow?.webContents.send("debug-run-complete", {});
        return;
      }
      console.log("\u{1F9EA} Launching browser (VISIBLE mode)...");
      context = await browserManager.launch({ headless: false });
      console.log("\u{1F9EA} Validating Instagram session...");
      const sessionCheck = await browserManager.validateSession();
      if (!sessionCheck.valid) {
        throw new Error(sessionCheck.reason || "SESSION_EXPIRED");
      }
      console.log("\u{1F9EA} Browsing Instagram (Screenshot-First mode)...");
      const scraper = new InstagramScraper(context, apiKey, settings.usageCap || 10, true);
      const session2 = await scraper.browseAndCapture(
        5,
        // 5 minutes of human-paced browsing
        settings.interests || []
      );
      console.log(`\u{1F9EA} Browsing complete: ${session2.captureCount} screenshots captured`);
      await browserManager.close();
      context = null;
      if (session2.captureCount < MINIMUM_CAPTURES) {
        console.warn(`\u{1F9EA} Insufficient captures: ${session2.captureCount} (need ${MINIMUM_CAPTURES})`);
        throw new Error("INSUFFICIENT_CONTENT");
      }
      console.log("\u{1F9EA} Tagging captured images for smart selection...");
      const tagger = new ImageTagger(apiKey, settings.interests || []);
      const { tags, tokensUsed: taggingTokens } = await tagger.tagBatch(session2.captures);
      const bestCaptures = tagger.selectBest(session2.captures, tags, 25);
      console.log(`\u{1F9EA} Tagging used ${taggingTokens} tokens, selected ${bestCaptures.length} images`);
      console.log("\u{1F9EA} Generating digest from selected screenshots...");
      const digestGenerator = new BatchDigestGenerator(apiKey);
      const analysis = await digestGenerator.generateDigest(bestCaptures, {
        userName: settings.userName || "User",
        interests: settings.interests || [],
        location: settings.location || ""
      });
      const recordId = (0, import_uuid.v4)();
      const userDataPath = import_electron5.app.getPath("userData");
      const recordDir = import_path4.default.join(userDataPath, "analysis_records");
      const imagesDir = import_path4.default.join(recordDir, recordId, "images");
      await import_fs4.default.promises.mkdir(imagesDir, { recursive: true });
      const selectedIds = new Set(bestCaptures.map((c) => c.id));
      const imageMetadata = [];
      for (const capture of bestCaptures) {
        const filename = `${capture.id}.jpg`;
        const imagePath = import_path4.default.join(imagesDir, filename);
        await import_fs4.default.promises.writeFile(imagePath, capture.screenshot);
        const captureTag = tags.find((t2) => t2.imageId === capture.id);
        imageMetadata.push({
          id: capture.id,
          filename,
          source: capture.source,
          interest: capture.interest,
          postId: capture.postId,
          permalink: capture.postId ? `https://www.instagram.com/p/${capture.postId}/` : void 0,
          tag: captureTag ? {
            relevance: captureTag.relevance,
            quality: captureTag.quality,
            description: captureTag.description
          } : void 0
        });
      }
      console.log(`\u{1F5BC}\uFE0F Saved ${imageMetadata.length} selected images to ${imagesDir}`);
      const analysisWithImages = {
        ...analysis,
        images: imageMetadata
      };
      const newRecord = {
        id: recordId,
        data: analysisWithImages,
        leadStoryPreview: analysis.sections[0]?.content[0]?.substring(0, 100) + "..." || "No preview available."
      };
      const recordPath = import_path4.default.join(recordDir, `${recordId}.json`);
      const tempPath = import_path4.default.join(recordDir, `${recordId}.tmp`);
      await import_fs4.default.promises.writeFile(tempPath, JSON.stringify(newRecord, null, 2));
      await import_fs4.default.promises.rename(tempPath, recordPath);
      console.log(`\u{1F9EA} Saved digest to disk: ${recordPath}`);
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
      });
      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        console.log("\u{1F9EA} Notifying UI: analysis-ready");
        this.mainWindow.webContents.send("analysis-ready", metadataRecord);
        this.mainWindow.webContents.send("debug-run-complete", {});
      }
      console.log(`\u{1F9EA} Debug Run (Screenshot-First) Complete! Captures: ${session2.captureCount}`);
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
        this.mainWindow.webContents.send("debug-run-complete", {});
      }
    }
  }
  /**
   * DEBUG RUN (Legacy): Uses the extraction-based architecture.
   */
  async triggerDebugRunLegacy() {
    console.log("\u{1F9EA} Debug Run (Legacy): Starting Visible Analysis Pipeline");
    const store = await this.getStore();
    const settings = store.get("settings") || {};
    const now = /* @__PURE__ */ new Date();
    const scheduledTime = now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
    const MINIMUM_POSTS_FOR_ANALYSIS = 5;
    const BROWSE_DURATION_MS = 5 * 60 * 1e3;
    const browserManager = BrowserManager.getInstance();
    let context = null;
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send("debug-run-started", {
        durationMs: BROWSE_DURATION_MS,
        startTime: Date.now()
      });
    }
    try {
      const apiKey = await SecureKeyManager.getInstance().getKey();
      if (!apiKey) {
        console.error("\u{1F9EA} Debug Run: NO API KEY");
        this.mainWindow?.webContents.send("analysis-error", { message: "API key not found." });
        this.mainWindow?.webContents.send("debug-run-complete", {});
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
      const userDataPath = import_electron5.app.getPath("userData");
      const recordDir = import_path4.default.join(userDataPath, "analysis_records");
      const recordPath = import_path4.default.join(recordDir, `${recordId}.json`);
      const tempPath = import_path4.default.join(recordDir, `${recordId}.tmp`);
      await import_fs4.default.promises.mkdir(recordDir, { recursive: true });
      await import_fs4.default.promises.writeFile(tempPath, JSON.stringify(newRecord, null, 2));
      await import_fs4.default.promises.rename(tempPath, recordPath);
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
        this.mainWindow.webContents.send("debug-run-complete", {});
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
        this.mainWindow.webContents.send("debug-run-complete", {});
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
  /**
   * Switch between extraction-based and screenshot-first approaches.
   * Set USE_SCREENSHOT_FIRST to true for the new Screenshot-First Digest architecture.
   */
  static USE_SCREENSHOT_FIRST = true;
  // NEW: Screenshot-First Digest enabled
  /**
   * BAKER (Screenshot-First Mode): Browse Instagram naturally, capture screenshots,
   * then batch-send to LLM for comprehensive digest generation.
   *
   * This is the new architecture that:
   * - Takes screenshots of each post/story during browsing
   * - No Vision API calls during browsing (all analysis at the end)
   * - LLM sees actual visual content instead of extracted descriptions
   */
  async triggerBakerScreenshotFirst(now, store, scheduledTime) {
    const settings = store.get("settings") || {};
    const MINIMUM_CAPTURES_FOR_DIGEST = 10;
    console.log(`\u{1F950} Baker (Screenshot-First) - Starting Instagram browsing at ${(/* @__PURE__ */ new Date()).toLocaleString()}`);
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
      console.log("\u{1F4F1} Baker browsing Instagram (Screenshot-First mode)...");
      const scraper = new InstagramScraper(context, apiKey, settings.usageCap || 10);
      const session2 = await scraper.browseAndCapture(
        5,
        // 5 minutes of human-paced browsing
        settings.interests || []
      );
      console.log(`\u{1F4F8} Baker browsing complete: ${session2.captureCount} screenshots captured`);
      await browserManager.close();
      context = null;
      if (session2.captureCount < MINIMUM_CAPTURES_FOR_DIGEST) {
        console.warn(`\u26A0\uFE0F Baker: Insufficient captures: ${session2.captureCount} (need ${MINIMUM_CAPTURES_FOR_DIGEST})`);
        throw new Error("INSUFFICIENT_CONTENT");
      }
      console.log("\u{1F3F7}\uFE0F Baker tagging captured images for smart selection...");
      const tagger = new ImageTagger(apiKey, settings.interests || []);
      const { tags, tokensUsed: taggingTokens } = await tagger.tagBatch(session2.captures);
      const bestCaptures = tagger.selectBest(session2.captures, tags, 25);
      console.log(`\u{1F3F7}\uFE0F Baker tagging used ${taggingTokens} tokens, selected ${bestCaptures.length} images`);
      console.log("\u{1F916} Baker generating digest from selected screenshots...");
      const digestGenerator = new BatchDigestGenerator(apiKey);
      const analysis = await digestGenerator.generateDigest(bestCaptures, {
        userName: settings.userName || "User",
        interests: settings.interests || [],
        location: settings.location || ""
      });
      const recordId = (0, import_uuid.v4)();
      const userDataPath = import_electron5.app.getPath("userData");
      const recordDir = import_path4.default.join(userDataPath, "analysis_records");
      const imagesDir = import_path4.default.join(recordDir, recordId, "images");
      await import_fs4.default.promises.mkdir(imagesDir, { recursive: true });
      const imageMetadata = [];
      for (const capture of bestCaptures) {
        const filename = `${capture.id}.jpg`;
        const imagePath = import_path4.default.join(imagesDir, filename);
        await import_fs4.default.promises.writeFile(imagePath, capture.screenshot);
        const captureTag = tags.find((t2) => t2.imageId === capture.id);
        imageMetadata.push({
          id: capture.id,
          filename,
          source: capture.source,
          interest: capture.interest,
          postId: capture.postId,
          permalink: capture.postId ? `https://www.instagram.com/p/${capture.postId}/` : void 0,
          tag: captureTag ? {
            relevance: captureTag.relevance,
            quality: captureTag.quality,
            description: captureTag.description
          } : void 0
        });
      }
      console.log(`\u{1F5BC}\uFE0F Baker saved ${imageMetadata.length} selected images to ${imagesDir}`);
      const analysisWithImages = {
        ...analysis,
        images: imageMetadata
      };
      const newRecord = {
        id: recordId,
        data: analysisWithImages,
        leadStoryPreview: analysis.sections[0]?.content[0]?.substring(0, 100) + "..." || "No preview available."
      };
      const recordPath = import_path4.default.join(recordDir, `${recordId}.json`);
      const tempPath = import_path4.default.join(recordDir, `${recordId}.tmp`);
      await import_fs4.default.promises.writeFile(tempPath, JSON.stringify(newRecord, null, 2));
      await import_fs4.default.promises.rename(tempPath, recordPath);
      console.log(`\u{1F4BE} Baker saved digest to disk: ${recordPath}`);
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
      console.log(`\u{1F950} Baker (Screenshot-First) complete. Digest saved, awaiting delivery at ${scheduledTime}`);
      console.log(`\u2705 Screenshot-First Pipeline Complete. Captures: ${session2.captureCount}`);
    } catch (error) {
      console.error("\u274C Baker (Screenshot-First) pipeline failed:", error.message);
      if (context) {
        await browserManager.close();
      }
      console.log(`\u{1F950} Baker failed silently. No paper to deliver at ${scheduledTime}`);
    }
  }
};

// src/main/main.ts
var import_module = require("module");
import_electron6.app.commandLine.appendSwitch("ignore-certificate-errors");
import_electron6.app.commandLine.appendSwitch("disable-gpu");
import_electron6.app.commandLine.appendSwitch("disable-software-rasterizer");
import_electron6.app.commandLine.appendSwitch("disable-dev-shm-usage");
import_electron6.app.commandLine.appendSwitch("disable-renderer-backgrounding");
var __filename = (0, import_url.fileURLToPath)(__importMetaUrl);
var __dirname = import_path5.default.dirname(__filename);
var require2 = (0, import_module.createRequire)(__importMetaUrl);
if (!import_electron6.app.getLoginItemSettings().openAtLogin) {
  import_electron6.app.setLoginItemSettings({
    openAtLogin: true,
    openAsHidden: false
    // Optional: could be true if we want silent start
  });
}
if (require2("electron-squirrel-startup")) {
  import_electron6.app.quit();
}
import_electron6.protocol.registerSchemesAsPrivileged([
  {
    scheme: "kowalski-local",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      bypassCSP: true
    }
  }
]);
var isQuitting = false;
var mainWindow = null;
var SHARED_PARTITION = "persist:instagram_shared";
var createWindow = () => {
  const width = 1280 + Math.floor(Math.random() * 100);
  const height = 800 + Math.floor(Math.random() * 100);
  mainWindow = new import_electron6.BrowserWindow({
    width,
    height,
    title: "Kowalski",
    backgroundColor: "#F9F8F5",
    // Warm Alabaster for LCD antialiasing
    frame: true,
    // titleBarStyle property removed to use system default
    webPreferences: {
      preload: import_path5.default.join(__dirname, "../preload/preload.cjs"),
      webviewTag: true,
      partition: SHARED_PARTITION
      // Force main window to check this (though webview usually isolates)
    },
    // Set icon for Windows/Linux (and Mac if packaged)
    // Use the processed, standardized icon
    icon: import_path5.default.join(__dirname, "../../build/icon-standard.png")
  });
  if (process.platform === "darwin" && process.env.VITE_DEV_SERVER_URL) {
    const iconPath = import_path5.default.join(__dirname, "../../build/icon-standard.png");
    import_electron6.app.dock?.setIcon(iconPath);
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
    const filePath = import_path5.default.join(__dirname, "../../dist/index.html");
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
import_electron6.app.on("ready", () => {
  const protocolHandler = (request, callback) => {
    const url = new URL(request.url);
    const recordId = url.hostname;
    const filePath = url.pathname.startsWith("/") ? url.pathname.slice(1) : url.pathname;
    const userDataPath2 = import_electron6.app.getPath("userData");
    const fullPath = import_path5.default.join(userDataPath2, "analysis_records", recordId, filePath);
    console.log(`\u{1F4F7} Protocol request: ${request.url}`);
    console.log(`\u{1F4F7} Resolved path: ${fullPath}`);
    if (import_fs5.default.existsSync(fullPath)) {
      console.log(`\u{1F4F7} File exists, serving: ${fullPath}`);
      callback({ path: fullPath });
    } else {
      console.error(`\u274C Protocol error: File not found: ${fullPath}`);
      console.error(`\u274C RecordId: ${recordId}, FilePath: ${filePath}`);
      const recordsDir = import_path5.default.join(userDataPath2, "analysis_records");
      if (import_fs5.default.existsSync(recordsDir)) {
        console.log(`\u{1F4C2} Contents of analysis_records: ${import_fs5.default.readdirSync(recordsDir).join(", ")}`);
        const recordDir = import_path5.default.join(recordsDir, recordId);
        if (import_fs5.default.existsSync(recordDir)) {
          console.log(`\u{1F4C2} Contents of ${recordId}: ${import_fs5.default.readdirSync(recordDir).join(", ")}`);
          const imagesDir = import_path5.default.join(recordDir, "images");
          if (import_fs5.default.existsSync(imagesDir)) {
            console.log(`\u{1F4C2} Contents of images: ${import_fs5.default.readdirSync(imagesDir).join(", ")}`);
          }
        }
      }
      callback({ error: -6 });
    }
  };
  import_electron6.protocol.registerFileProtocol("kowalski-local", protocolHandler);
  console.log("\u2705 Registered kowalski-local protocol on default session");
  import_electron6.session.fromPartition(SHARED_PARTITION).protocol.registerFileProtocol("kowalski-local", protocolHandler);
  console.log(`\u2705 Registered kowalski-local protocol on partition: ${SHARED_PARTITION}`);
  createWindow();
  console.log("Session persistence enabled.");
  console.log("Session persistence enabled.");
  UsageService.getInstance().initialize();
  SchedulerService.getInstance().initialize();
  import_electron6.globalShortcut.register("CommandOrControl+Shift+H", () => {
    console.log("\u{1F9EA} Testing Shortcut Triggered (Cmd+Shift+H)");
    SchedulerService.getInstance().triggerDebugRun();
  });
  const userDataPath = import_electron6.app.getPath("userData");
  const recordsPath = import_path5.default.join(userDataPath, "analysis_records");
  if (!import_fs5.default.existsSync(recordsPath)) {
    import_fs5.default.mkdirSync(recordsPath, { recursive: true });
    console.log("\u{1F4C2} Created analysis_records directory");
  }
  setupIPCHandlers();
});
import_electron6.app.on("before-quit", () => {
  isQuitting = true;
  import_electron6.globalShortcut.unregisterAll();
  SchedulerService.getInstance().stop();
});
function setupIPCHandlers() {
  import_electron6.ipcMain.handle("reset-session", async () => {
    console.log("\u{1F9F9} Starting session reset...");
    try {
      const userDataPath = import_electron6.app.getPath("userData");
      const sessionPath = import_path5.default.join(userDataPath, "session.json");
      if (import_fs5.default.existsSync(sessionPath)) {
        import_fs5.default.unlinkSync(sessionPath);
        console.log("\u2705 Deleted legacy session.json");
      }
      await BrowserManager.getInstance().clearData();
    } catch (e) {
      console.error("\u26A0\uFE0F Failed to delete session.json:", e);
    }
    try {
      await import_electron6.session.defaultSession.clearStorageData();
      console.log("\u2705 Cleared default session storage");
    } catch (e) {
      console.error("\u26A0\uFE0F Failed to clear default session storage:", e);
    }
    try {
      await import_electron6.session.fromPartition(SHARED_PARTITION).clearStorageData();
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
      const userDataPath = import_electron6.app.getPath("userData");
      const recordsPath = import_path5.default.join(userDataPath, "analysis_records");
      if (import_fs5.default.existsSync(recordsPath)) {
        import_fs5.default.rmSync(recordsPath, { recursive: true, force: true });
        console.log("\u2705 Deleted analysis_records folder");
      }
    } catch (e) {
      console.error("\u26A0\uFE0F Failed to delete analysis_records:", e);
    }
    console.log("\u{1F389} Session reset complete");
    return true;
  });
  import_electron6.ipcMain.handle("settings:get", async () => {
    const { default: Store } = await import("electron-store");
    const store = new Store();
    return store.get("settings") || {};
  });
  import_electron6.ipcMain.handle("settings:set", async (_event, newSettings) => {
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
        const windows = import_electron6.BrowserWindow.getAllWindows();
        windows.forEach((win) => {
          win.webContents.send("schedule-updated", updatedSchedule);
        });
        console.log("\u{1F525} Hot-Patched Daily Snapshot with new User Settings:", updatedSchedule);
      }
    }
    return true;
  });
  import_electron6.ipcMain.handle("settings:patch", async (_event, updates) => {
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
        import_electron6.BrowserWindow.getAllWindows().forEach((win) => {
          win.webContents.send("schedule-updated", updatedSchedule);
        });
        console.log("\u{1F525} Hot-Patched Daily Snapshot (via Patch):", updatedSchedule);
      }
    }
    return merged;
  });
  import_electron6.ipcMain.handle("analyses:get", async () => {
    const { default: Store } = await import("electron-store");
    const store = new Store();
    return store.get("analyses") || [];
  });
  import_electron6.ipcMain.handle("analyses:set", async (_event, analyses) => {
    const { default: Store } = await import("electron-store");
    const store = new Store();
    store.set("analyses", analyses);
    return true;
    return true;
  });
  import_electron6.ipcMain.handle("analyses:get-content", async (_event, id) => {
    try {
      const userDataPath = import_electron6.app.getPath("userData");
      const filePath = import_path5.default.join(userDataPath, "analysis_records", `${id}.json`);
      if (import_fs5.default.existsSync(filePath)) {
        const raw = import_fs5.default.readFileSync(filePath, "utf-8");
        return JSON.parse(raw);
      }
      return null;
    } catch (e) {
      console.error(`\u274C Failed to load analysis content for ${id}:`, e);
      return null;
    }
  });
  import_electron6.ipcMain.handle("settings:get-active-schedule", async () => {
    const { default: Store } = await import("electron-store");
    const store = new Store();
    return store.get("activeSchedule") || null;
  });
  import_electron6.ipcMain.handle("settings:get-wake-time", async () => {
    return SchedulerService.getInstance().getLastWakeTime();
  });
  import_electron6.ipcMain.handle("settings:set-secure", async (_event, { apiKey }) => {
    return SecureKeyManager.getInstance().setKey(apiKey);
  });
  import_electron6.ipcMain.handle("settings:check-key-status", async () => {
    return SecureKeyManager.getInstance().getKeyStatus();
  });
  import_electron6.ipcMain.handle("settings:get-secure", async () => {
    return SecureKeyManager.getInstance().getKey();
  });
  import_electron6.ipcMain.handle("auth:login", async (_event, bounds) => {
    if (!mainWindow) return false;
    return BrowserManager.getInstance().login(bounds, mainWindow);
  });
  import_electron6.ipcMain.handle("test-headless", async () => {
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
  import_electron6.ipcMain.handle("clear-instagram-session", async () => {
    console.log("\u{1F9F9} Clearing Instagram Session only...");
    try {
      const userDataPath = import_electron6.app.getPath("userData");
      const sessionPath = import_path5.default.join(userDataPath, "session.json");
      if (import_fs5.default.existsSync(sessionPath)) {
        import_fs5.default.unlinkSync(sessionPath);
      }
      await import_electron6.session.fromPartition(SHARED_PARTITION).clearStorageData();
      await BrowserManager.getInstance().clearData();
      return true;
    } catch (e) {
      console.error("Clear Instagram Session Error:", e);
      return false;
    }
  });
  import_electron6.ipcMain.handle("check-instagram-session", async () => {
    try {
      const userDataPath = import_electron6.app.getPath("userData");
      const persistentContextPath = import_path5.default.join(userDataPath, "kowalski_browser");
      if (!import_fs5.default.existsSync(persistentContextPath)) {
        return { isActive: false, reason: "no_profile" };
      }
      const cookiesDbPath = import_path5.default.join(persistentContextPath, "Default", "Cookies");
      if (!import_fs5.default.existsSync(cookiesDbPath)) {
        return { isActive: false, reason: "no_cookies_db" };
      }
      try {
        const tempDbPath = import_path5.default.join(userDataPath, "cookies_check_temp.db");
        console.log("\u{1F50D} Session check: Copying cookies from", cookiesDbPath, "to", tempDbPath);
        import_fs5.default.copyFileSync(cookiesDbPath, tempDbPath);
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
          import_fs5.default.unlinkSync(tempDbPath);
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
import_electron6.app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    import_electron6.app.quit();
  }
});
import_electron6.app.on("activate", () => {
  if (import_electron6.BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  } else {
    mainWindow?.show();
  }
});
//# sourceMappingURL=main.cjs.map
