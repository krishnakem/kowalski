import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('api', {
    startAgent: () => ipcRenderer.invoke('start-agent'),
    startLogin: (bounds: any) => ipcRenderer.invoke('auth:login', bounds),
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
    settings: {
        get: () => ipcRenderer.invoke('settings:get'),
        set: (value: any) => ipcRenderer.invoke('settings:set', value),
        patch: (updates: any) => ipcRenderer.invoke('settings:patch', updates),
        getActiveSchedule: () => ipcRenderer.invoke('settings:get-active-schedule'),
        getWakeTime: () => ipcRenderer.invoke('settings:get-wake-time'),
        setSecure: (apiKey: string) => ipcRenderer.invoke('settings:set-secure', { apiKey }),
        checkKeyStatus: () => ipcRenderer.invoke('settings:check-key-status'),
        getSecureKey: () => ipcRenderer.invoke('settings:get-secure'),
        onAnalysisReady: (callback: (analysis: any) => void) => {
            const subscription = (_event: any, analysis: any) => callback(analysis);
            ipcRenderer.on('analysis-ready', subscription);
            // Return unsubscribe function
            // Return unsubscribe function
            return () => ipcRenderer.removeListener('analysis-ready', subscription);
        },
        onScheduleUpdated: (callback: (schedule: any) => void) => {
            const subscription = (_event: any, schedule: any) => callback(schedule);
            ipcRenderer.on('schedule-updated', subscription);
            return () => ipcRenderer.removeListener('schedule-updated', subscription);
        }
    },
    analyses: {
        get: () => ipcRenderer.invoke('analyses:get'),
        set: (value: any) => ipcRenderer.invoke('analyses:set', value),
        getContent: (id: string) => ipcRenderer.invoke('analyses:get-content', id),
    }
});
