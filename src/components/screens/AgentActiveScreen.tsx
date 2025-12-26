import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AnimatedPixelEye, PixelArrow } from "../icons/PixelIcons";

interface AgentActiveScreenProps {
  onComplete: () => void;
}

const logMessages = [
  "> Initializing Vision Loop...",
  "> Connecting to viewport...",
  "> Scrolling feed (1/3)...",
  "> Detecting ads (3 blocked)...",
  "> Scrolling feed (2/3)...",
  "> Analyzing visual content...",
  "> Scrolling feed (3/3)...",
  "> Extracting story metadata...",
  "> Summarizing engagement...",
  "> Compiling digest...",
  "> Done. Preparing your brief.",
];

const AgentActiveScreen = ({ onComplete }: AgentActiveScreenProps) => {
  const [displayedLogs, setDisplayedLogs] = useState<string[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    if (currentIndex < logMessages.length) {
      const timer = setTimeout(() => {
        setDisplayedLogs((prev) => [...prev, logMessages[currentIndex]]);
        setCurrentIndex((prev) => prev + 1);
      }, 800 + Math.random() * 400);

      return () => clearTimeout(timer);
    } else {
      const completeTimer = setTimeout(onComplete, 1500);
      return () => clearTimeout(completeTimer);
    }
  }, [currentIndex, onComplete]);

  const progress = (currentIndex / logMessages.length) * 100;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 bg-background">
      {/* Animated Pixel Eye */}
      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.6 }}
        className="relative mb-12"
      >
        <div className="w-32 h-32 border-2 border-foreground/20 bg-card flex items-center justify-center">
          <AnimatedPixelEye size={64} />
        </div>
        
        {/* Scan line effect */}
        <motion.div
          animate={{ y: [0, 128, 0] }}
          transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
          className="absolute top-0 left-0 right-0 h-0.5 bg-accent/50"
        />
      </motion.div>

      {/* Status Text */}
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3 }}
        className="text-muted-foreground text-sm font-sans tracking-widest uppercase mb-8"
      >
        Vision Agent Active
      </motion.p>

      {/* Progress Bar */}
      <motion.div
        initial={{ opacity: 0, width: 0 }}
        animate={{ opacity: 1, width: "100%" }}
        transition={{ delay: 0.5 }}
        className="max-w-md w-full mb-10"
      >
        <div className="h-1 bg-border overflow-hidden">
          <motion.div
            className="h-full bg-foreground"
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.3 }}
          />
        </div>
      </motion.div>

      {/* Terminal Log */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="max-w-lg w-full terminal"
      >
        {/* Terminal header */}
        <div className="flex items-center gap-2 mb-4 pb-3 border-b border-border">
          <div className="w-2 h-2 bg-foreground" />
          <div className="w-2 h-2 bg-foreground/30" />
          <div className="w-2 h-2 bg-foreground/30" />
          <span className="ml-3 text-xs text-muted-foreground font-mono">agent.log</span>
        </div>

        {/* Log content */}
        <div className="h-52 overflow-hidden font-mono text-sm space-y-2">
          <AnimatePresence mode="popLayout">
            {displayedLogs.map((log, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.2 }}
                className={`${
                  index === displayedLogs.length - 1 
                    ? "terminal-line-active" 
                    : "terminal-line"
                }`}
              >
                {log}
                {index === displayedLogs.length - 1 && currentIndex < logMessages.length && (
                  <span className="inline-block w-2 h-4 bg-foreground ml-1 animate-blink" />
                )}
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </motion.div>

      {/* Skip hint */}
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.5 }}
        transition={{ delay: 2 }}
        className="mt-8 text-xs text-muted-foreground font-sans flex items-center gap-2"
      >
        Please wait while we scan your feed
        <PixelArrow size={14} />
      </motion.p>
    </div>
  );
};

export default AgentActiveScreen;
