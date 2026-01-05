"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
electron_1.contextBridge.exposeInMainWorld('api', {
    startAgent: () => electron_1.ipcRenderer.invoke('start-agent'),
    resetSession: () => electron_1.ipcRenderer.invoke('reset-session'),
    clearInstagramSession: () => electron_1.ipcRenderer.invoke('clear-instagram-session'),
    saveLoginSession: () => electron_1.ipcRenderer.invoke('save-login-session'),
    onLoginSuccess: (callback) => {
        const subscription = (_event, _args) => callback();
        electron_1.ipcRenderer.on('login-success', subscription);
        return () => {
            electron_1.ipcRenderer.removeListener('login-success', subscription);
        };
    },
    testHeadless: () => electron_1.ipcRenderer.invoke('test-headless'),
    saveSessionDirectly: (cookies) => electron_1.ipcRenderer.invoke('save-session-directly', cookies),
    manualSessionSave: () => electron_1.ipcRenderer.send('manual-session-save'),
    settings: {
        get: () => electron_1.ipcRenderer.invoke('settings:get'),
        set: (value) => electron_1.ipcRenderer.invoke('settings:set', value),
        patch: (updates) => electron_1.ipcRenderer.invoke('settings:patch', updates),
        getActiveSchedule: () => electron_1.ipcRenderer.invoke('settings:get-active-schedule'),
        getWakeTime: () => electron_1.ipcRenderer.invoke('settings:get-wake-time'),
        setSecure: (apiKey) => electron_1.ipcRenderer.invoke('settings:set-secure', { apiKey }),
        checkKeyStatus: () => electron_1.ipcRenderer.invoke('settings:check-key-status'),
        getSecureKey: () => electron_1.ipcRenderer.invoke('settings:get-secure'),
        onAnalysisReady: (callback) => {
            const subscription = (_event, analysis) => callback(analysis);
            electron_1.ipcRenderer.on('analysis-ready', subscription);
            // Return unsubscribe function
            // Return unsubscribe function
            return () => electron_1.ipcRenderer.removeListener('analysis-ready', subscription);
        },
        onScheduleUpdated: (callback) => {
            const subscription = (_event, schedule) => callback(schedule);
            electron_1.ipcRenderer.on('schedule-updated', subscription);
            return () => electron_1.ipcRenderer.removeListener('schedule-updated', subscription);
        }
    },
    analyses: {
        get: () => electron_1.ipcRenderer.invoke('analyses:get'),
        set: (value) => electron_1.ipcRenderer.invoke('analyses:set', value),
        getContent: (id) => electron_1.ipcRenderer.invoke('analyses:get-content', id),
    }
});
