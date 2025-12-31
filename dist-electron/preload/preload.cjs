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
});
