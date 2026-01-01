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
            setSecure: (apiKey: string) => Promise<boolean>;
            checkKeyStatus: () => Promise<'locked' | 'secured' | 'missing'>;
            onAnalysisReady: (callback: (analysis: any) => void) => () => void;
        };
        analyses: {
            get: () => Promise<any[]>;
            set: (value: any[]) => Promise<boolean>;
        };
    }
}
