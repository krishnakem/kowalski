import { useEffect, useCallback, memo } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Settings, Archive } from "lucide-react";
import { AnimatedPixelPenguin } from "../icons/PixelIcons";
import { Button } from "@/components/ui/button";
import { useSettings } from "@/hooks/useSettings";
import { useArchivedAnalyses } from "@/hooks/useArchivedAnalyses";
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

  // If no past analyses, this is the first day after onboarding - schedule starts tomorrow
  const isFirstDay = archivesLoaded && !hasPastAnalyses;
  const nextAnalysis = getNextAnalysisTime(settings, isFirstDay);
  const showArchiveButton = archivesLoaded && hasPastAnalyses;

  // Purely visual component - navigation is handled by global listeners in Index.tsx
  useEffect(() => {
    // Optional: Ensure status is 'working' if we want to enforce it, 
    // but preventing side-effects is cleaner. 
    // patchSettings({ analysisStatus: "working" });
  }, [patchSettings]);

  const handleNavigateToArchive = useCallback(() => {
    navigate("/archive", { state: { from: "agent" } });
  }, [navigate]);

  const handleNavigateToSettings = useCallback(() => {
    navigate("/settings", { state: { from: "agent" } });
  }, [navigate]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 bg-background relative">

      {/* Archive Button - only show if there are past analyses in the archive */}
      {showArchiveButton && (
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
