/// <reference types="vite/client" />

interface Window {
    api: {
        startAgent: () => Promise<void>;
        resetSession: () => Promise<boolean>;
        clearInstagramSession: () => Promise<boolean>;
        saveLoginSession: () => Promise<void>;
        onLoginSuccess: (callback: () => void) => () => void;
        testHeadless: () => Promise<string>;
        saveSessionDirectly: (cookies: string) => Promise<void>;
        manualSessionSave: () => void;
        settings: {
            get: () => Promise<any>;
            set: (settings: any) => Promise<boolean>;
            patch: (updates: any) => Promise<any>;
            getActiveSchedule: () => Promise<any>;
            getWakeTime: () => Promise<Date>;
            setSecure: (apiKey: string) => Promise<boolean>;
            checkKeyStatus: () => Promise<'locked' | 'secured' | 'missing'>;
            getSecureKey: () => Promise<string | null>;
            onAnalysisReady: (callback: (analysis: any) => void) => () => void;
            onScheduleUpdated: (callback: (schedule: any) => void) => () => void;
            // Debug run timer events (Cmd+Shift+H)
            onDebugRunStarted: (callback: (info: { durationMs: number; startTime: number }) => void) => () => void;
            onDebugRunComplete: (callback: () => void) => () => void;
        };
        analyses: {
            get: () => Promise<any[]>;
            set: (value: any[]) => Promise<boolean>;
            getContent: (id: string) => Promise<any | null>;
        };
    }
}
