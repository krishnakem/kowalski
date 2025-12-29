import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Settings, Archive } from "lucide-react";
import { WavingPenguin } from "../icons/PixelIcons";
import { Button } from "@/components/ui/button";
import PageHeader from "@/components/layouts/PageHeader";
import { ease, duration, spring } from "@/lib/animations";
import { useSettings } from "@/hooks/useSettings";
import { getTimeOfDayGreeting, getNextAnalysisTime } from "@/lib/timeUtils";


interface AnalysisReadyScreenProps {
  onViewAnalysis: () => void;
  lastAnalysisDate?: string;
}

const AnalysisReadyScreen = ({ onViewAnalysis, lastAnalysisDate }: AnalysisReadyScreenProps) => {
  const navigate = useNavigate();
  const { settings } = useSettings();

  const greeting = getTimeOfDayGreeting();
  const nextAnalysis = getNextAnalysisTime(settings);

  const title = settings.userName?.trim() 
    ? `${greeting}, ${settings.userName.trim()}` 
    : greeting;

  const leftAction = (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => navigate("/archive", { state: { from: "ready" } })}
      className="text-muted-foreground hover:bg-transparent opacity-60 hover:opacity-100 transition-opacity h-14 w-14"
    >
      <Archive className="w-8 h-8" />
    </Button>
  );

  const rightAction = (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => navigate("/settings", { state: { from: "ready" } })}
      className="text-muted-foreground hover:bg-transparent opacity-60 hover:opacity-100 transition-opacity h-14 w-14"
    >
      <Settings className="w-8 h-8" />
    </Button>
  );

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 bg-background relative">
      <PageHeader 
        title="" 
        leftAction={leftAction}
        rightAction={rightAction}
      />

      {/* Penguin */}
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ ...spring.gentle, delay: 0.1 }}
        className="mb-8"
      >
        <WavingPenguin size={160} />
      </motion.div>

      {/* Content */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2, duration: duration.slow, ease: ease.cinematic }}
        className="text-center max-w-sm space-y-4"
      >
        <h1 className="text-4xl font-serif text-foreground">
          {title}
        </h1>
        
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3, duration: duration.slow }}
          className="text-lg text-muted-foreground"
        >
          Your analysis is ready
        </motion.p>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.6 }}
          transition={{ delay: 0.5, duration: duration.slow }}
          className="text-sm text-muted-foreground"
        >
          Next update: {nextAnalysis}
        </motion.p>
        
        <motion.button
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: duration.slow, ease: ease.cinematic, delay: 0.6 }}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={onViewAnalysis}
          className="inline-flex items-center gap-3 px-8 py-4 border-2 border-foreground 
                     text-foreground font-sans text-sm tracking-wider uppercase
                     hover:bg-foreground hover:text-background transition-all duration-200 mt-4"
        >
          View Analysis
        </motion.button>
      </motion.div>
    </div>
  );
};

export default AnalysisReadyScreen;
