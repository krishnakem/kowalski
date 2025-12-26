import { useState } from "react";
import { motion } from "framer-motion";
import { Instagram, Eye, EyeOff, ArrowRight } from "lucide-react";

interface ZeroStateScreenProps {
  onContinue: () => void;
}

const ZeroStateScreen = ({ onContinue }: ZeroStateScreenProps) => {
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6">
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: "easeOut" }}
        className="max-w-xl w-full text-center space-y-16"
      >
        {/* Headline */}
        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.8 }}
          className="text-5xl md:text-6xl font-serif text-foreground leading-tight"
        >
          Reclaim Your
          <br />
          <span className="italic">Attention.</span>
        </motion.h1>

        {/* API Key Input */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5, duration: 0.6 }}
          className="space-y-8"
        >
          <div className="relative">
            <input
              type={showKey ? "text" : "password"}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="Paste your OpenAI API Key"
              className="w-full bg-transparent border-b border-border/20 focus:border-accent/60 
                         py-3 px-1 text-foreground placeholder:text-muted-foreground/50
                         focus:outline-none transition-colors duration-300 font-sans text-lg"
            />
            <button
              onClick={() => setShowKey(!showKey)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground 
                         hover:text-foreground transition-colors"
            >
              {showKey ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>

          {/* Instagram Status */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.7, duration: 0.6 }}
            className="flex items-center justify-center gap-3 text-muted-foreground/40"
          >
            <Instagram size={18} strokeWidth={1.5} />
            <span className="text-sm font-sans tracking-wide">Connect Instagram</span>
            <div className="w-2 h-2 rounded-full bg-muted-foreground/20" />
          </motion.div>
        </motion.div>

        {/* Continue Button */}
        <motion.button
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.9, duration: 0.6 }}
          onClick={onContinue}
          disabled={!apiKey}
          className="group inline-flex items-center gap-3 px-8 py-4 
                     border border-border/20 rounded-xl
                     text-foreground font-sans text-sm tracking-widest uppercase
                     hover:border-accent/40 hover:bg-accent/5 
                     disabled:opacity-30 disabled:cursor-not-allowed
                     transition-all duration-300"
        >
          <span>Continue</span>
          <ArrowRight 
            size={16} 
            className="transform group-hover:translate-x-1 transition-transform" 
          />
        </motion.button>
      </motion.div>

      {/* Subtle footer */}
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.2, duration: 0.6 }}
        className="absolute bottom-8 text-xs text-muted-foreground/30 font-sans tracking-wider"
      >
        Your key stays local. We never store it.
      </motion.p>
    </div>
  );
};

export default ZeroStateScreen;