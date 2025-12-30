import { useState, useEffect, useCallback, useMemo } from "react";
import type { AnalysisData } from "@/components/screens/GazetteScreen";
import { MONTHS } from "@/lib/data/archiveData";
import { generateScheduledDemoAnalyses } from "@/lib/generateDemoAnalyses";
import type { SettingsData } from "@/hooks/useSettings";

export interface ArchivedAnalysis {
  id: string;
  data: AnalysisData;
  leadStoryPreview: string;
}

const STORAGE_KEY = "kowalski-archived-analyses";
const MAX_ANALYSES_PER_DAY = 2;

const getDayKey = (date: Date): string => {
  // Local day key (matches UI expectations)
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
};

const enforceMaxPerDay = (analyses: ArchivedAnalysis[]): ArchivedAnalysis[] => {
  const dayMap = new Map<string, ArchivedAnalysis[]>();

  analyses.forEach((analysis) => {
    const key = getDayKey(analysis.data.date);
    const existing = dayMap.get(key) || [];
    dayMap.set(key, [...existing, analysis]);
  });

  const flattened: ArchivedAnalysis[] = [];
  dayMap.forEach((group) => {
    const sorted = [...group].sort((a, b) => b.data.date.getTime() - a.data.date.getTime());
    flattened.push(...sorted.slice(0, MAX_ANALYSES_PER_DAY));
  });

  // Keep global ordering newest-first
  return flattened.sort((a, b) => b.data.date.getTime() - a.data.date.getTime());
};

// Serialize analyses for localStorage (dates need special handling)
const serializeAnalyses = (analyses: ArchivedAnalysis[]): string => {
  return JSON.stringify(
    analyses.map((a) => ({
      ...a,
      data: {
        ...a.data,
        date: a.data.date.toISOString(),
      },
    }))
  );
};

// Deserialize analyses from localStorage
const deserializeAnalyses = (json: string): ArchivedAnalysis[] => {
  try {
    const parsed = JSON.parse(json);
    return parsed.map(
      (a: { id: string; data: AnalysisData & { date: string }; leadStoryPreview: string }) => ({
        ...a,
        data: {
          ...a.data,
          date: new Date(a.data.date),
        },
      })
    );
  } catch {
    return [];
  }
};

// Initialize from localStorage only - no auto-seeding of mock data
const getInitialAnalyses = (): ArchivedAnalysis[] => {
  const stored = localStorage.getItem(STORAGE_KEY);

  if (stored) {
    return deserializeAnalyses(stored);
  }

  // No stored data - return empty (user starts fresh)
  return [];
};

export const useArchivedAnalyses = () => {
  const [analyses, setAnalyses] = useState<ArchivedAnalysis[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    setAnalyses(getInitialAnalyses());
    setIsLoaded(true);
  }, []);

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

  /**
   * Generate and seed demo analyses based on user schedule settings.
   * Useful for demo/testing purposes.
   */
  const seedDemoAnalyses = useCallback((settings: SettingsData, daysBack: number = 7) => {
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

  const getAvailableYearsFromAnalyses = useCallback((): number[] => {
    const yearsSet = new Set<number>();
    analyses.forEach((analysis) => {
      yearsSet.add(analysis.data.date.getFullYear());
    });
    return Array.from(yearsSet).sort((a, b) => b - a);
  }, [analyses]);

  const hasPastAnalyses = useMemo(() => {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    return analyses.some((analysis) => {
      const d = new Date(analysis.data.date);
      d.setHours(0, 0, 0, 0);
      return d.getTime() < todayStart.getTime();
    });
  }, [analyses]);

  return { 
    analyses, 
    addAnalysis, 
    clearAnalyses,
    seedDemoAnalyses,
    hasPastAnalyses,
    isLoaded,
    getAvailableYears: getAvailableYearsFromAnalyses,
    MONTHS 
  };
};
