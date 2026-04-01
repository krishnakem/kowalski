import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('api', {
    startAgent: () => ipcRenderer.invoke('start-agent'),
    startLogin: (bounds: any) => ipcRenderer.invoke('auth:login', bounds),
    resetSession: () => ipcRenderer.invoke('reset-session'),
    clearInstagramSession: () => ipcRenderer.invoke('clear-instagram-session'),
    checkInstagramSession: () => ipcRenderer.invoke('check-instagram-session'),
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
        setSecure: (apiKey: string) => ipcRenderer.invoke('settings:set-secure', { apiKey }),
        checkKeyStatus: () => ipcRenderer.invoke('settings:check-key-status'),
        getSecureKey: () => ipcRenderer.invoke('settings:get-secure'),
        validateApiKey: (apiKey: string) => ipcRenderer.invoke('settings:validate-api-key', { apiKey }),
        onAnalysisReady: (callback: (analysis: any) => void) => {
            const subscription = (_event: any, analysis: any) => callback(analysis);
            ipcRenderer.on('analysis-ready', subscription);
            return () => ipcRenderer.removeListener('analysis-ready', subscription);
        },
        onAnalysisError: (callback: (error: { message: string; canRetry: boolean; nextRetry: string | null }) => void) => {
            const subscription = (_event: any, error: any) => callback(error);
            ipcRenderer.on('analysis-error', subscription);
            return () => ipcRenderer.removeListener('analysis-error', subscription);
        },
        onSessionExpired: (callback: () => void) => {
            const subscription = () => callback();
            ipcRenderer.on('instagram-session-expired', subscription);
            return () => ipcRenderer.removeListener('instagram-session-expired', subscription);
        },
        onRateLimited: (callback: (info: { nextRetry: string }) => void) => {
            const subscription = (_event: any, info: any) => callback(info);
            ipcRenderer.on('instagram-rate-limited', subscription);
            return () => ipcRenderer.removeListener('instagram-rate-limited', subscription);
        },
        onInsufficientContent: (callback: (info: { collected: number; required: number; reason: string; nextRetry: string }) => void) => {
            const subscription = (_event: any, info: any) => callback(info);
            ipcRenderer.on('analysis-insufficient-content', subscription);
            return () => ipcRenderer.removeListener('analysis-insufficient-content', subscription);
        },
        onRunStarted: (callback: (info: { durationMs: number; startTime: number }) => void) => {
            const subscription = (_event: any, info: any) => callback(info);
            ipcRenderer.on('run-started', subscription);
            return () => ipcRenderer.removeListener('run-started', subscription);
        },
        onRunComplete: (callback: () => void) => {
            const subscription = () => callback();
            ipcRenderer.on('run-complete', subscription);
            return () => ipcRenderer.removeListener('run-complete', subscription);
        }
    },
    run: {
        start: () => ipcRenderer.invoke('run:start'),
        stop: () => ipcRenderer.invoke('run:stop'),
        getStatus: () => ipcRenderer.invoke('run:status'),
    },
    analyses: {
        get: () => ipcRenderer.invoke('analyses:get'),
        set: (value: any) => ipcRenderer.invoke('analyses:set', value),
        getContent: (id: string) => ipcRenderer.invoke('analyses:get-content', id),
    }
});
