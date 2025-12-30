import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('api', {
    startAgent: () => ipcRenderer.invoke('start-agent'),
    resetSession: () => ipcRenderer.invoke('reset-session'),
    saveLoginSession: () => ipcRenderer.invoke('save-login-session'),
});
