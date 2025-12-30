import { useState, useEffect, useCallback } from "react";
import type { AnalysisData } from "@/components/screens/GazetteScreen";
import { archivedAnalyses as mockData, MONTHS, getAvailableYears } from "@/lib/data/archiveData";

export interface ArchivedAnalysis {
  id: string;
  data: AnalysisData;
  leadStoryPreview: string;
}

const STORAGE_KEY = "kowalski-archived-analyses";

// Serialize analyses for localStorage (dates need special handling)
const serializeAnalyses = (analyses: ArchivedAnalysis[]): string => {
  return JSON.stringify(analyses.map(a => ({
    ...a,
    data: {
      ...a.data,
      date: a.data.date.toISOString()
    }
  })));
};

// Deserialize analyses from localStorage
const deserializeAnalyses = (json: string): ArchivedAnalysis[] => {
  try {
    const parsed = JSON.parse(json);
    return parsed.map((a: { id: string; data: AnalysisData & { date: string }; leadStoryPreview: string }) => ({
      ...a,
      data: {
        ...a.data,
        date: new Date(a.data.date)
      }
    }));
  } catch {
    return [];
  }
};

// Initialize with mock data, converting dates properly
const getInitialAnalyses = (): ArchivedAnalysis[] => {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) {
    const analyses = deserializeAnalyses(stored);
    if (analyses.length > 0) return analyses;
  }
  // First time: seed with mock data
  localStorage.setItem(STORAGE_KEY, serializeAnalyses(mockData));
  return mockData;
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
      leadStoryPreview: analysisData.worldUpdates[0]?.summary || "No summary available"
    };

    setAnalyses(prev => {
      // Allow multiple analyses per day - just prepend the new one
      const updated = [newAnalysis, ...prev];
      localStorage.setItem(STORAGE_KEY, serializeAnalyses(updated));
      return updated;
    });

    return newAnalysis;
  }, []);

  const getAvailableYearsFromAnalyses = useCallback((): number[] => {
    const yearsSet = new Set<number>();
    analyses.forEach((analysis) => {
      yearsSet.add(analysis.data.date.getFullYear());
    });
    return Array.from(yearsSet).sort((a, b) => b - a);
  }, [analyses]);

  return { 
    analyses, 
    addAnalysis, 
    isLoaded,
    getAvailableYears: getAvailableYearsFromAnalyses,
    MONTHS 
  };
};
