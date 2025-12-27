import { useEffect } from "react";
import { motion } from "framer-motion";
import { AnimatedPixelPenguin } from "../icons/PixelIcons";

interface AgentActiveScreenProps {
  onComplete: () => void;
}

const AgentActiveScreen = ({ onComplete }: AgentActiveScreenProps) => {
  useEffect(() => {
    // Auto-complete after 5 seconds
    const timer = setTimeout(onComplete, 5000);
    return () => clearTimeout(timer);
  }, [onComplete]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 bg-background">
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
          Kowalski is working on curating your digest.
          <br />
          <span className="text-muted-foreground">We'll let you know when it's ready.</span>
        </p>
      </motion.div>
    </div>
  );
};

export default AgentActiveScreen;
