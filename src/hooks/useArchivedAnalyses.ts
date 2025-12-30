import { useState, useEffect, useCallback, useMemo } from "react";
import type { AnalysisData } from "@/components/screens/GazetteScreen";
import { MONTHS } from "@/lib/data/archiveData";
import type { SettingsData } from "@/hooks/useSettings";

export interface ArchivedAnalysis {
  id: string;
  data: AnalysisData;
  leadStoryPreview: string;
}

const STORAGE_KEY = "kowalski-archived-analyses";
const MAX_ANALYSES_PER_DAY = 2;

// Memoize today's start time at module level (reset on page refresh)
let cachedTodayStart: number | null = null;
const getTodayStart = (): number => {
  if (cachedTodayStart === null) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    cachedTodayStart = today.getTime();
  }
  return cachedTodayStart;
};

const getDayKey = (date: Date): string => {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
};

const enforceMaxPerDay = (analyses: ArchivedAnalysis[]): ArchivedAnalysis[] => {
  const dayMap = new Map<string, ArchivedAnalysis[]>();

  for (const analysis of analyses) {
    const key = getDayKey(analysis.data.date);
    const existing = dayMap.get(key);
    if (existing) {
      existing.push(analysis);
    } else {
      dayMap.set(key, [analysis]);
    }
  }

  const flattened: ArchivedAnalysis[] = [];
  dayMap.forEach((group) => {
    if (group.length <= MAX_ANALYSES_PER_DAY) {
      flattened.push(...group);
    } else {
      group.sort((a, b) => b.data.date.getTime() - a.data.date.getTime());
      flattened.push(...group.slice(0, MAX_ANALYSES_PER_DAY));
    }
  });

  return flattened.sort((a, b) => b.data.date.getTime() - a.data.date.getTime());
};

const serializeAnalyses = (analyses: ArchivedAnalysis[]): string => {
  return JSON.stringify(
    analyses.map((a) => ({
      ...a,
      data: { ...a.data, date: a.data.date.toISOString() },
    }))
  );
};

const deserializeAnalyses = (json: string): ArchivedAnalysis[] => {
  try {
    const parsed = JSON.parse(json);
    return parsed.map(
      (a: { id: string; data: AnalysisData & { date: string }; leadStoryPreview: string }) => ({
        ...a,
        data: { ...a.data, date: new Date(a.data.date) },
      })
    );
  } catch {
    return [];
  }
};

// Lazy initializer for useState (only runs once)
const getInitialAnalyses = (): ArchivedAnalysis[] => {
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored ? deserializeAnalyses(stored) : [];
};

export const useArchivedAnalyses = () => {
  // Use lazy initializer to avoid reading localStorage on every render
  const [analyses, setAnalyses] = useState<ArchivedAnalysis[]>(getInitialAnalyses);
  const [isLoaded, setIsLoaded] = useState(true); // Already loaded via lazy init

  const addAnalysis = useCallback((analysisData: AnalysisData) => {
    const newAnalysis: ArchivedAnalysis = {
      id: `analysis-${Date.now()}`,
      data: analysisData,
      leadStoryPreview: analysisData.worldUpdates[0]?.summary || "No summary available",
    };

    setAnalyses((prev) => {
      const updated = enforceMaxPerDay([newAnalysis, ...prev]);
      localStorage.setItem(STORAGE_KEY, serializeAnalyses(updated));
      return updated;
    });

    return newAnalysis;
  }, []);

  const clearAnalyses = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setAnalyses([]);
  }, []);

  const seedDemoAnalyses = useCallback(async (settings: SettingsData, daysBack: number = 7) => {
    // Lazy import to avoid loading demo generator in production bundles
    const { generateScheduledDemoAnalyses } = await import("@/lib/generateDemoAnalyses");
    const demoData = generateScheduledDemoAnalyses(settings, daysBack);
    const newAnalyses: ArchivedAnalysis[] = demoData.map((data, index) => ({
      id: `analysis-demo-${Date.now()}-${index}`,
      data,
      leadStoryPreview: data.worldUpdates[0]?.summary || "No summary available",
    }));

    setAnalyses((prev) => {
      const updated = enforceMaxPerDay([...newAnalyses, ...prev]);
      localStorage.setItem(STORAGE_KEY, serializeAnalyses(updated));
      return updated;
    });
  }, []);

  // Memoized derived state
  const availableYears = useMemo((): number[] => {
    const yearsSet = new Set<number>();
    for (const analysis of analyses) {
      yearsSet.add(analysis.data.date.getFullYear());
    }
    return Array.from(yearsSet).sort((a, b) => b - a);
  }, [analyses]);

  const hasPastAnalyses = useMemo(() => {
    const todayStart = getTodayStart();
    return analyses.some((analysis) => {
      const d = new Date(analysis.data.date);
      d.setHours(0, 0, 0, 0);
      return d.getTime() < todayStart;
    });
  }, [analyses]);

  // Stable reference for getAvailableYears
  const getAvailableYears = useCallback(() => availableYears, [availableYears]);

  return {
    analyses,
    addAnalysis,
    clearAnalyses,
    seedDemoAnalyses,
    hasPastAnalyses,
    isLoaded,
    getAvailableYears,
    MONTHS,
  };
};
