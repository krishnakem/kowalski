import { useEffect, useCallback, memo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Settings, Archive, Search, Square, Eye, RotateCcw } from "lucide-react";
import { AnimatedPixelPenguin } from "../icons/PixelIcons";
import { Button } from "@/components/ui/button";
import { useSettings } from "@/hooks/useSettings";
import { useArchivedAnalyses } from "@/hooks/useArchivedAnalyses";
import { ease, duration, spring } from "@/lib/animations";

interface AgentActiveScreenProps {
  onComplete: () => void;
  autoComplete?: boolean;
}

type RunState = "idle" | "running" | "done";

// Animation transitions defined outside component
const buttonEntranceTransition = { delay: 0.4, duration: duration.slow, ease: ease.cinematic };
const contentEntranceTransition = { delay: 0.25, duration: duration.slow, ease: ease.cinematic };

const AgentActiveScreen = memo(({ onComplete, autoComplete = true }: AgentActiveScreenProps) => {
  const navigate = useNavigate();
  const { settings, patchSettings } = useSettings();
  const { hasPastAnalyses, isLoaded: archivesLoaded } = useArchivedAnalyses();

  const [runState, setRunState] = useState<RunState>("idle");
  const [endTime, setEndTime] = useState<number | null>(null);
  const [remaining, setRemaining] = useState(0);

  // Check initial run status on mount
  useEffect(() => {
    window.api.run.getStatus().then((status) => {
      if (status === 'running') {
        setRunState('running');
      }
    });
  }, []);

  // Listen for run events
  useEffect(() => {
    const unsubStart = window.api.settings.onRunStarted(({ durationMs, startTime }) => {
      setRunState("running");
      setEndTime(startTime + durationMs);
      setRemaining(durationMs);
    });

    const unsubComplete = window.api.settings.onRunComplete(() => {
      setRunState("idle");
      setEndTime(null);
    });

    return () => {
      unsubStart();
      unsubComplete();
    };
  }, []);

  // Countdown ticker
  useEffect(() => {
    if (runState !== "running" || !endTime) return;

    const interval = setInterval(() => {
      const left = Math.max(0, endTime - Date.now());
      setRemaining(left);
      if (left === 0) {
        setRunState("idle");
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [runState, endTime]);

  // Navigate to Gazette when analysis is ready
  useEffect(() => {
    if (settings.analysisStatus === 'ready') {
      onComplete();
    }
  }, [settings.analysisStatus, onComplete]);

  const showArchiveButton = archivesLoaded && hasPastAnalyses;

  const handleRunNow = useCallback(async () => {
    setRunState("running");
    await window.api.run.start();
  }, []);

  const handleStop = useCallback(async () => {
    await window.api.run.stop();
    setRunState("idle");
  }, []);

  const handleNavigateToArchive = useCallback(() => {
    navigate("/archive", { state: { from: "agent" } });
  }, [navigate]);

  const handleNavigateToSettings = useCallback(() => {
    navigate("/settings", { state: { from: "agent" } });
  }, [navigate]);

  // Format milliseconds as MM:SS
  const formatTime = (ms: number) => {
    const totalSeconds = Math.ceil(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 bg-background relative">

      {/* Archive Button */}
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

      {/* Content */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={contentEntranceTransition}
        className="text-center max-w-sm space-y-6"
      >
        {/* Idle State */}
        {runState === "idle" && (
          <>
            <p className="text-foreground font-sans text-lg leading-relaxed">
              Ready when you are.
            </p>
            <button
              onClick={handleRunNow}
              className="inline-flex items-center gap-3 px-8 py-4 border-2 border-foreground
                         text-foreground font-sans text-sm tracking-wider uppercase
                         hover:bg-foreground hover:text-background transition-all duration-200"
            >
              <Search className="w-4 h-4" />
              <span>Run Now</span>
            </button>
            {hasPastAnalyses && (
              <p className="text-muted-foreground text-sm">
                Press Cmd+Shift+H to run anytime.
              </p>
            )}
          </>
        )}

        {/* Running State */}
        {runState === "running" && (
          <>
            <div className="flex items-center justify-center gap-2 text-foreground">
              <span className="animate-pulse">
                <Search className="w-5 h-5" />
              </span>
              <span className="font-mono text-2xl font-semibold">
                Browsing: {formatTime(remaining)}
              </span>
            </div>
            <button
              onClick={handleStop}
              className="inline-flex items-center gap-3 px-8 py-4 border-2 border-foreground/40
                         text-foreground/60 font-sans text-sm tracking-wider uppercase
                         hover:border-foreground hover:text-foreground transition-all duration-200"
            >
              <Square className="w-4 h-4" />
              <span>Stop</span>
            </button>
          </>
        )}
      </motion.div>
    </div>
  );
});

AgentActiveScreen.displayName = "AgentActiveScreen";

export default AgentActiveScreen;
