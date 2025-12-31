import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('api', {
    startAgent: () => ipcRenderer.invoke('start-agent'),
    resetSession: () => ipcRenderer.invoke('reset-session'),
    clearInstagramSession: () => ipcRenderer.invoke('clear-instagram-session'),
    saveLoginSession: () => ipcRenderer.invoke('save-login-session'),
    onLoginSuccess: (callback: () => void) => {
        const subscription = (_event: any, _args: any) => callback();
        ipcRenderer.on('login-success', subscription);
        return () => {
            ipcRenderer.removeListener('login-success', subscription);
        };
    },
    testHeadless: () => ipcRenderer.invoke('test-headless'),
    saveSessionDirectly: (cookies: string) => ipcRenderer.invoke('save-session-directly', cookies),
    manualSessionSave: () => ipcRenderer.send('manual-session-save'),
});
