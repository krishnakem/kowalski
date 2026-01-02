import { useEffect, useCallback, memo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Settings, Archive } from "lucide-react";
import { AnimatedPixelPenguin } from "../icons/PixelIcons";
import { Button } from "@/components/ui/button";
import { useSettings } from "@/hooks/useSettings";
import { useArchivedAnalyses } from "@/hooks/useArchivedAnalyses";
import { useDailySnapshot } from "@/hooks/useDailySnapshot";
import { useSystemWakeTime } from "@/hooks/useSystemWakeTime";
import { ease, duration, spring } from "@/lib/animations";
import { getNextAnalysisTime } from "@/lib/timeUtils";

interface AgentActiveScreenProps {
  onComplete: () => void;
  autoComplete?: boolean;
}

// Animation transitions defined outside component
const buttonEntranceTransition = { delay: 0.4, duration: duration.slow, ease: ease.cinematic };
const contentEntranceTransition = { delay: 0.25, duration: duration.slow, ease: ease.cinematic };
const subtextTransition = { delay: 0.5, duration: duration.slow, ease: ease.cinematic };

const AgentActiveScreen = memo(({ onComplete, autoComplete = true }: AgentActiveScreenProps) => {
  const navigate = useNavigate();
  const { settings, patchSettings } = useSettings();
  const { hasPastAnalyses, isLoaded: archivesLoaded } = useArchivedAnalyses();
  const { snapshot: activeSchedule, refresh: refreshSnapshot } = useDailySnapshot();
  const { wakeTime } = useSystemWakeTime();

  // If no past analyses AND active schedule is not for today, then it's the first day (onboarding day)
  // Fix: If activeSchedule.activeDate IS today, then we are LIVE, regardless of past analyses.
  const todayStr = new Date().getFullYear() + '-' + String(new Date().getMonth() + 1).padStart(2, '0') + '-' + String(new Date().getDate()).padStart(2, '0');
  const isActiveToday = activeSchedule?.activeDate === todayStr;

  // Logic: It is "First Day" (show tomorrow) ONLY IF:
  // 1. We have no archives (new user)
  // 2. AND The active schedule is NOT for today (meaning we onboarded today and wait for tomorrow)
  // Logic: It is "First Day" (show tomorrow) ONLY IF:
  // 1. We have no archives (new user)
  // 2. AND The active schedule is NOT for today (meaning we onboarded today and wait for tomorrow)
  const isFirstDay = archivesLoaded && !hasPastAnalyses && !isActiveToday;
  const nextAnalysis = getNextAnalysisTime(settings, activeSchedule, isFirstDay, wakeTime);

  // DEBUG LOGGING
  console.log("🔍 UI DEBUG:", {
    now: new Date().toLocaleString(),
    todayStr,
    activeDate: activeSchedule?.activeDate,
    isActiveToday,
    isFirstDay,
    wakeTime: wakeTime?.toLocaleString(),
    nextAnalysis
  });

  const showArchiveButton = archivesLoaded && hasPastAnalyses;

  // Purely visual component - navigation is handled by global listeners in Index.tsx

  // UI PULSE: Force re-render every minute to keep relative time strings ("Tomorrow" vs "Today") accurate.
  // This fixes the bug where jumping the system clock leaves the UI stale.
  const [, setTick] = useState(0);

  useEffect(() => {
    // 1. Minute Ticker
    const interval = setInterval(() => {
      setTick(t => t + 1);
    }, 60000); // 1 minute

    // 2. Focus Trigger (Updates immediately when user wakes/tabs back to app)
    const onFocus = () => {
      // console.log("👁️ App Focused: Refreshing UI time...");
      setTick(t => t + 1);
      refreshSnapshot(); // FORCE RE-FETCH from Backend
    };

    window.addEventListener('focus', onFocus);

    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', onFocus);
    };
  }, []);

  // FAIL-SAFE NAVIGATION:
  // If the 'analysis-ready' event was missed but the store updated, navigate anyway.
  useEffect(() => {
    if (settings.analysisStatus === 'ready') {
      console.log("Stale 'AgentActive' screen detected (Status is Ready). Navigating to Gazette...");
      onComplete(); // Triggers parent navigation
    }
  }, [settings.analysisStatus, onComplete]);

  const handleNavigateToArchive = useCallback(() => {
    navigate("/archive", { state: { from: "agent" } });
  }, [navigate]);

  const handleNavigateToSettings = useCallback(() => {
    navigate("/settings", { state: { from: "agent" } });
  }, [navigate]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 bg-background relative">

      {/* Archive Button - Always show for navigation/testing */}
      {archivesLoaded && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={buttonEntranceTransition}
          className="absolute top-6 left-6"
        >
          <Button
            variant="ghost"
            size="icon"
            onClick={handleNavigateToArchive}
            className="text-muted-foreground hover:bg-transparent opacity-60 hover:opacity-100 transition-opacity h-14 w-14"
          >
            <Archive className="w-8 h-8" />
          </Button>
        </motion.div>
      )}

      {/* Settings Button */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={buttonEntranceTransition}
        className="absolute top-6 right-6"
      >
        <Button
          variant="ghost"
          size="icon"
          onClick={handleNavigateToSettings}
          className="text-muted-foreground hover:bg-transparent opacity-60 hover:opacity-100 transition-opacity h-14 w-14"
        >
          <Settings className="w-8 h-8" />
        </Button>
      </motion.div>

      {/* Animated Pixel Penguin */}
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ ...spring.gentle, delay: 0.1 }}
        className="mb-12"
      >
        <AnimatedPixelPenguin size={200} />
      </motion.div>

      {/* Status Text */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={contentEntranceTransition}
        className="text-center max-w-sm"
      >
        <p className="text-foreground font-sans text-lg leading-relaxed">
          Kowalski is working on curating your analysis.
        </p>
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={subtextTransition}
          className="text-muted-foreground text-base mt-4"
        >
          Your analysis will be ready {nextAnalysis.toLowerCase()}.
        </motion.p>
      </motion.div>



    </div>
  );
});

AgentActiveScreen.displayName = "AgentActiveScreen";

export default AgentActiveScreen;
