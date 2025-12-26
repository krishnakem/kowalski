import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ScanEye } from "lucide-react";

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
      // All logs displayed, wait then transition
      const completeTimer = setTimeout(onComplete, 1500);
      return () => clearTimeout(completeTimer);
    }
  }, [currentIndex, onComplete]);

  const progress = (currentIndex / logMessages.length) * 100;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6">
      {/* Vision Agent Icon */}
      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.6 }}
        className="relative mb-16"
      >
        <div className="w-32 h-32 rounded-full bg-secondary flex items-center justify-center animate-pulse-glow">
          <ScanEye 
            size={48} 
            strokeWidth={1} 
            className="text-accent"
          />
        </div>
        
        {/* Radar rings */}
        <div className="absolute inset-0 -m-4">
          <motion.div
            animate={{ scale: [1, 1.5], opacity: [0.3, 0] }}
            transition={{ duration: 2, repeat: Infinity, ease: "easeOut" }}
            className="w-full h-full rounded-full border border-accent/30"
          />
        </div>
        <div className="absolute inset-0 -m-8">
          <motion.div
            animate={{ scale: [1, 1.8], opacity: [0.2, 0] }}
            transition={{ duration: 2, repeat: Infinity, ease: "easeOut", delay: 0.5 }}
            className="w-full h-full rounded-full border border-accent/20"
          />
        </div>
      </motion.div>

      {/* Status Text */}
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3 }}
        className="text-muted-foreground text-sm font-sans tracking-widest uppercase mb-12"
      >
        Vision Agent Active
      </motion.p>

      {/* Progress Bar */}
      <motion.div
        initial={{ opacity: 0, width: 0 }}
        animate={{ opacity: 1, width: "100%" }}
        transition={{ delay: 0.5 }}
        className="max-w-md w-full mb-12"
      >
        <div className="h-0.5 bg-secondary rounded-full overflow-hidden">
          <motion.div
            className="h-full bg-accent/60"
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
        className="max-w-lg w-full glass rounded-xl p-6"
      >
        <div className="flex items-center gap-2 mb-4 pb-3 border-b border-border/10">
          <div className="w-2.5 h-2.5 rounded-full bg-accent/60" />
          <div className="w-2.5 h-2.5 rounded-full bg-muted-foreground/30" />
          <div className="w-2.5 h-2.5 rounded-full bg-muted-foreground/30" />
          <span className="ml-3 text-xs text-muted-foreground/50 font-mono">agent.log</span>
        </div>

        <div className="h-48 overflow-hidden font-mono text-sm space-y-2">
          <AnimatePresence mode="popLayout">
            {displayedLogs.map((log, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.3 }}
                className={`${
                  index === displayedLogs.length - 1 
                    ? "text-accent" 
                    : "text-muted-foreground/60"
                }`}
              >
                {log}
                {index === displayedLogs.length - 1 && currentIndex < logMessages.length && (
                  <span className="inline-block w-2 h-4 bg-accent ml-1 animate-pulse" />
                )}
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
};

export default AgentActiveScreen;