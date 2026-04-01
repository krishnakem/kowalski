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
            getSecureKey: () => Promise<string | null>;
            validateApiKey: (apiKey: string) => Promise<{ valid: boolean; error?: string }>;
            onAnalysisReady: (callback: (analysis: any) => void) => () => void;
            onAnalysisError: (callback: (error: { message: string; canRetry: boolean; nextRetry: string | null }) => void) => () => void;
            onSessionExpired: (callback: () => void) => () => void;
            onRateLimited: (callback: (info: { nextRetry: string }) => void) => () => void;
            onInsufficientContent: (callback: (info: { collected: number; required: number; reason: string; nextRetry: string }) => void) => () => void;
            onRunStarted: (callback: (info: { durationMs: number; startTime: number }) => void) => () => void;
            onRunComplete: (callback: () => void) => () => void;
        };
        run: {
            start: () => Promise<void>;
            stop: () => Promise<void>;
            getStatus: () => Promise<'idle' | 'running'>;
        };
        analyses: {
            get: () => Promise<any[]>;
            set: (value: any[]) => Promise<boolean>;
            getContent: (id: string) => Promise<any | null>;
        };
    }
}
