import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Settings, Archive } from "lucide-react";
import { WavingPenguin } from "../icons/PixelIcons";
import { Button } from "@/components/ui/button";
import { ease, duration, spring } from "@/lib/animations";
import { useSettings } from "@/hooks/useSettings";


interface AnalysisReadyScreenProps {
  onViewAnalysis: () => void;
  lastAnalysisDate?: string;
}

const AnalysisReadyScreen = ({ onViewAnalysis, lastAnalysisDate }: AnalysisReadyScreenProps) => {
  const navigate = useNavigate();
  const { settings } = useSettings();

  const formattedDate = lastAnalysisDate
    ? new Date(lastAnalysisDate).toLocaleString("en-US", {
        weekday: "long",
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      })
    : null;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 bg-background relative">

      {/* Archive Button */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3, duration: duration.slow, ease: ease.cinematic }}
        className="absolute top-6 left-6"
      >
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate("/archive", { state: { from: "ready" } })}
          className="text-muted-foreground hover:bg-transparent opacity-60 hover:opacity-100 transition-opacity h-14 w-14"
        >
          <Archive className="w-8 h-8" />
        </Button>
      </motion.div>

      {/* Settings Button */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3, duration: duration.slow, ease: ease.cinematic }}
        className="absolute top-6 right-6"
      >
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate("/settings", { state: { from: "ready" } })}
          className="text-muted-foreground hover:bg-transparent opacity-60 hover:opacity-100 transition-opacity h-14 w-14"
        >
          <Settings className="w-8 h-8" />
        </Button>
      </motion.div>

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
        className="text-center max-w-sm space-y-6"
      >
        <h1 className="text-4xl font-serif text-foreground">
          {settings.userName?.trim() ? `${settings.userName.trim()}, your` : "Your"} analysis is ready
        </h1>
        
        <motion.button
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: duration.slow, ease: ease.cinematic, delay: 0.4 }}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={onViewAnalysis}
          className="inline-flex items-center gap-3 px-8 py-4 border-2 border-foreground 
                     text-foreground font-sans text-sm tracking-wider uppercase
                     hover:bg-foreground hover:text-background transition-all duration-200"
        >
          View Analysis
        </motion.button>
      </motion.div>
    </div>
  );
};

export default AnalysisReadyScreen;
