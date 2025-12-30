"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
electron_1.contextBridge.exposeInMainWorld('api', {
    startAgent: () => electron_1.ipcRenderer.invoke('start-agent'),
    resetSession: () => electron_1.ipcRenderer.invoke('reset-session'),
    saveLoginSession: () => electron_1.ipcRenderer.invoke('save-login-session'),
});
