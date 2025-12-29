import { useState, useEffect } from "react";

export const SETTINGS_KEY = "kowalski-settings";

export type AnalysisStatus = "idle" | "working" | "ready";

export interface SettingsData {
  digestFrequency: 1 | 2;
  morningTime: string;
  eveningTime: string;
  apiKey: string;
  usageCap: number;
  interests: string[];
  hasOnboarded: boolean;
  analysisStatus: AnalysisStatus;
  lastAnalysisDate?: string;
}

export const DEFAULT_SETTINGS: SettingsData = {
  digestFrequency: 1,
  morningTime: "8:00 AM",
  eveningTime: "6:00 PM",
  apiKey: "",
  usageCap: 10,
  interests: [],
  hasOnboarded: false,
  analysisStatus: "idle",
};

export const useSettings = () => {
  const [settings, setSettings] = useState<SettingsData>(DEFAULT_SETTINGS);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem(SETTINGS_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setSettings({ ...DEFAULT_SETTINGS, ...parsed });
      } catch (e) {
        console.error("Failed to parse settings:", e);
      }
    }
    setIsLoaded(true);
  }, []);

  const saveSettings = (newSettings?: SettingsData) => {
    const toSave = newSettings || settings;
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(toSave));
    if (newSettings) setSettings(newSettings);
  };

  const resetSettings = () => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(DEFAULT_SETTINGS));
    setSettings(DEFAULT_SETTINGS);
  };

  /**
   * Patch settings with partial updates - merges with existing settings and saves.
   * Useful for incremental saves during onboarding.
   */
  const patchSettings = (updates: Partial<SettingsData>) => {
    const existing = localStorage.getItem(SETTINGS_KEY);
    const current = existing ? JSON.parse(existing) : DEFAULT_SETTINGS;
    const merged = { ...DEFAULT_SETTINGS, ...current, ...updates };
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(merged));
    setSettings(merged);
  };

  return { settings, setSettings, saveSettings, resetSettings, patchSettings, isLoaded };
};
