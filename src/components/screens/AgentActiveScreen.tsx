import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Settings, Archive } from "lucide-react";
import { AnimatedPixelPenguin } from "../icons/PixelIcons";
import { Button } from "@/components/ui/button";
import { useSettings } from "@/hooks/useSettings";
import { ease, duration, spring } from "@/lib/animations";

interface AgentActiveScreenProps {
  onComplete: () => void;
  autoComplete?: boolean;
}

const AgentActiveScreen = ({ onComplete, autoComplete = true }: AgentActiveScreenProps) => {
  const navigate = useNavigate();
  const { patchSettings } = useSettings();

  useEffect(() => {
    // Set status to working when screen mounts
    patchSettings({ analysisStatus: "working" });
    
    // Only auto-complete after 5 seconds if autoComplete is true
    if (autoComplete) {
      const timer = setTimeout(onComplete, 5000);
      return () => clearTimeout(timer);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onComplete, autoComplete]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 bg-background relative">

      {/* Archive Button */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4, duration: duration.slow, ease: ease.cinematic }}
        className="absolute top-6 left-6"
      >
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate("/archive", { state: { from: "agent" } })}
          className="text-muted-foreground hover:bg-transparent opacity-60 hover:opacity-100 transition-opacity h-14 w-14"
        >
          <Archive className="w-8 h-8" />
        </Button>
      </motion.div>

      {/* Settings Button */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4, duration: duration.slow, ease: ease.cinematic }}
        className="absolute top-6 right-6"
      >
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate("/settings", { state: { from: "agent" } })}
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
        transition={{ delay: 0.25, duration: duration.slow, ease: ease.cinematic }}
        className="text-center max-w-sm"
      >
        <p className="text-foreground font-sans text-lg leading-relaxed">
          Kowalski is working on curating your analysis.
          <br />
          <span className="text-foreground">We'll let you know when it's ready.</span>
        </p>
      </motion.div>
    </div>
  );
};

export default AgentActiveScreen;
