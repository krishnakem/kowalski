import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Settings, Archive } from "lucide-react";
import { AnimatedPixelPenguin } from "../icons/PixelIcons";
import { Button } from "@/components/ui/button";
import { useSettings } from "@/hooks/useSettings";

interface AgentActiveScreenProps {
  onComplete: () => void;
}

const AgentActiveScreen = ({ onComplete }: AgentActiveScreenProps) => {
  const navigate = useNavigate();
  const { patchSettings, resetSettings } = useSettings();

  const handleDevReset = () => {
    resetSettings();
    window.location.reload();
  };

  useEffect(() => {
    // Set status to working when screen mounts
    patchSettings({ analysisStatus: "working" });
    
    // Auto-complete after 5 seconds
    const timer = setTimeout(onComplete, 5000);
    return () => clearTimeout(timer);
  }, [onComplete, patchSettings]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 bg-background relative">
      {/* Dev Reset Button */}
      <button
        onClick={handleDevReset}
        className="absolute top-6 left-1/2 -translate-x-1/2 text-xs text-muted-foreground/50 hover:text-muted-foreground underline"
      >
        Reset (dev only)
      </button>

      {/* Archive Button */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1, duration: 0.5 }}
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
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1, duration: 0.5 }}
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
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.6 }}
        className="mb-12"
      >
        <AnimatedPixelPenguin size={200} />
      </motion.div>

      {/* Status Text */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3, duration: 0.5 }}
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
