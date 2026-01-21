// src/preload/preload.cts
var import_electron = require("electron");
import_electron.contextBridge.exposeInMainWorld("api", {
  startAgent: () => import_electron.ipcRenderer.invoke("start-agent"),
  startLogin: (bounds) => import_electron.ipcRenderer.invoke("auth:login", bounds),
  resetSession: () => import_electron.ipcRenderer.invoke("reset-session"),
  clearInstagramSession: () => import_electron.ipcRenderer.invoke("clear-instagram-session"),
  checkInstagramSession: () => import_electron.ipcRenderer.invoke("check-instagram-session"),
  saveLoginSession: () => import_electron.ipcRenderer.invoke("save-login-session"),
  onLoginSuccess: (callback) => {
    const subscription = (_event, _args) => callback();
    import_electron.ipcRenderer.on("login-success", subscription);
    return () => {
      import_electron.ipcRenderer.removeListener("login-success", subscription);
    };
  },
  testHeadless: () => import_electron.ipcRenderer.invoke("test-headless"),
  saveSessionDirectly: (cookies) => import_electron.ipcRenderer.invoke("save-session-directly", cookies),
  manualSessionSave: () => import_electron.ipcRenderer.send("manual-session-save"),
  settings: {
    get: () => import_electron.ipcRenderer.invoke("settings:get"),
    set: (value) => import_electron.ipcRenderer.invoke("settings:set", value),
    patch: (updates) => import_electron.ipcRenderer.invoke("settings:patch", updates),
    getActiveSchedule: () => import_electron.ipcRenderer.invoke("settings:get-active-schedule"),
    getWakeTime: () => import_electron.ipcRenderer.invoke("settings:get-wake-time"),
    setSecure: (apiKey) => import_electron.ipcRenderer.invoke("settings:set-secure", { apiKey }),
    checkKeyStatus: () => import_electron.ipcRenderer.invoke("settings:check-key-status"),
    getSecureKey: () => import_electron.ipcRenderer.invoke("settings:get-secure"),
    onAnalysisReady: (callback) => {
      const subscription = (_event, analysis) => callback(analysis);
      import_electron.ipcRenderer.on("analysis-ready", subscription);
      return () => import_electron.ipcRenderer.removeListener("analysis-ready", subscription);
    },
    onScheduleUpdated: (callback) => {
      const subscription = (_event, schedule) => callback(schedule);
      import_electron.ipcRenderer.on("schedule-updated", subscription);
      return () => import_electron.ipcRenderer.removeListener("schedule-updated", subscription);
    },
    // New error event listeners for Instagram automation
    onAnalysisError: (callback) => {
      const subscription = (_event, error) => callback(error);
      import_electron.ipcRenderer.on("analysis-error", subscription);
      return () => import_electron.ipcRenderer.removeListener("analysis-error", subscription);
    },
    onSessionExpired: (callback) => {
      const subscription = () => callback();
      import_electron.ipcRenderer.on("instagram-session-expired", subscription);
      return () => import_electron.ipcRenderer.removeListener("instagram-session-expired", subscription);
    },
    onRateLimited: (callback) => {
      const subscription = (_event, info) => callback(info);
      import_electron.ipcRenderer.on("instagram-rate-limited", subscription);
      return () => import_electron.ipcRenderer.removeListener("instagram-rate-limited", subscription);
    },
    onInsufficientContent: (callback) => {
      const subscription = (_event, info) => callback(info);
      import_electron.ipcRenderer.on("analysis-insufficient-content", subscription);
      return () => import_electron.ipcRenderer.removeListener("analysis-insufficient-content", subscription);
    }
  },
  analyses: {
    get: () => import_electron.ipcRenderer.invoke("analyses:get"),
    set: (value) => import_electron.ipcRenderer.invoke("analyses:set", value),
    getContent: (id) => import_electron.ipcRenderer.invoke("analyses:get-content", id)
  }
});
//# sourceMappingURL=preload.cjs.map
