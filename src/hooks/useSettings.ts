import { useState, useEffect, useCallback } from "react";
import { z } from "zod";
import { getApiKey, setApiKey as setSecureApiKey, clearSecureData } from "@/lib/secureStorage";

export const SETTINGS_KEY = "kowalski-settings";

export type AnalysisStatus = "idle" | "working" | "ready";

export interface SettingsData {
  userName: string;
  digestFrequency: 1 | 2;
  morningTime: string;
  eveningTime: string;
  apiKey: string;
  usageCap: number;
  interests: string[];
  hasOnboarded: boolean;
  analysisStatus: AnalysisStatus;
  lastAnalysisDate?: string;
  location: string;
}

export const DEFAULT_SETTINGS: SettingsData = {
  userName: "",
  digestFrequency: 1,
  morningTime: "8:00 AM",
  eveningTime: "6:00 PM",
  apiKey: "",
  usageCap: 10,
  interests: [],
  hasOnboarded: false,
  analysisStatus: "idle",
  location: "Cupertino",
};

// Zod schema for validation and coercion
const settingsSchema = z.object({
  userName: z.string().catch(""),
  digestFrequency: z.coerce.number().pipe(z.union([z.literal(1), z.literal(2)])).catch(1),
  morningTime: z.string().catch("8:00 AM"),
  eveningTime: z.string().catch("6:00 PM"),
  apiKey: z.string().catch(""),
  usageCap: z.coerce.number().min(1).catch(10),
  interests: z.array(z.string()).catch([]),
  hasOnboarded: z.boolean().catch(false),
  analysisStatus: z.enum(["idle", "working", "ready"]).catch("idle"),
  lastAnalysisDate: z.string().optional(),
  location: z.string().catch(""),
});

const normalizeSettings = (raw: unknown): SettingsData => {
  const parsed = settingsSchema.safeParse(raw);
  if (parsed.success) {
    return { ...DEFAULT_SETTINGS, ...parsed.data };
  }
  return DEFAULT_SETTINGS;
};

/**
 * Separate API key from other settings for storage.
 * API key goes to sessionStorage (secure), everything else to localStorage.
 */
const separateApiKey = (data: SettingsData): { apiKey: string; rest: Omit<SettingsData, 'apiKey'> & { apiKey: '' } } => {
  const { apiKey, ...rest } = data;
  return { apiKey, rest: { ...rest, apiKey: '' } };
};

export const useSettings = () => {
  const [settings, setSettings] = useState<SettingsData>(DEFAULT_SETTINGS);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    // Load non-sensitive settings from localStorage
    const saved = localStorage.getItem(SETTINGS_KEY);
    let loadedSettings = DEFAULT_SETTINGS;
    
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        loadedSettings = normalizeSettings(parsed);
      } catch (e) {
        console.error("Failed to parse settings:", e);
      }
    }
    
    // Load API key from secure sessionStorage
    const secureApiKey = getApiKey();
    setSettings({ ...loadedSettings, apiKey: secureApiKey });
    setIsLoaded(true);
  }, []);

  const saveSettings = (newSettings?: SettingsData) => {
    const toSave = newSettings || settings;
    const { apiKey, rest } = separateApiKey(toSave);
    
    // Save non-sensitive data to localStorage (without API key)
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(rest));
    
    // Save API key to secure sessionStorage
    setSecureApiKey(apiKey);
    
    if (newSettings) setSettings(newSettings);
  };

  const resetSettings = () => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(DEFAULT_SETTINGS));
    clearSecureData(); // Clear API key from sessionStorage
    setSettings(DEFAULT_SETTINGS);
  };

  /**
   * Patch settings with partial updates - merges with existing settings and saves.
   * Useful for incremental saves during onboarding.
   */
  const patchSettings = useCallback((updates: Partial<SettingsData>) => {
    const existing = localStorage.getItem(SETTINGS_KEY);
    const current = existing ? JSON.parse(existing) : DEFAULT_SETTINGS;
    
    // Get current API key from secure storage
    const currentApiKey = getApiKey();
    const currentWithApiKey = { ...current, apiKey: currentApiKey };
    
    const merged = normalizeSettings({ ...currentWithApiKey, ...updates });
    const { apiKey, rest } = separateApiKey(merged);
    
    // Save non-sensitive data to localStorage
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(rest));
    
    // Save API key to secure sessionStorage
    setSecureApiKey(apiKey);
    
    setSettings(merged);
  }, []);

  return { settings, setSettings, saveSettings, resetSettings, patchSettings, isLoaded };
};
