import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Instagram, Eye, EyeOff, ArrowRight, Clock, Check, Sun, Moon } from "lucide-react";

interface ZeroStateScreenProps {
  onContinue: () => void;
}

type DigestCount = 1 | 2;

const ZeroStateScreen = ({ onContinue }: ZeroStateScreenProps) => {
  const [step, setStep] = useState<"settings" | "instagram">("settings");
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [digestCount, setDigestCount] = useState<DigestCount>(1);
  const [morningTime, setMorningTime] = useState("08:00");
  const [eveningTime, setEveningTime] = useState("18:00");
  const [isConnecting, setIsConnecting] = useState(false);
  const [isConnected, setIsConnected] = useState(false);

  const handleSettingsContinue = () => {
    if (apiKey) {
      setStep("instagram");
    }
  };

  const handleInstagramConnect = () => {
    setIsConnecting(true);
    // Simulate connection
    setTimeout(() => {
      setIsConnecting(false);
      setIsConnected(true);
      setTimeout(onContinue, 800);
    }, 1500);
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6">
      <AnimatePresence mode="wait">
        {step === "settings" && (
          <motion.div
            key="settings"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
            className="max-w-md w-full space-y-12"
          >
            {/* Headline */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1, duration: 0.6 }}
              className="text-center"
            >
              <h1 className="text-4xl md:text-5xl font-serif text-foreground leading-tight mb-4">
                Reclaim Your
                <br />
                <span className="italic">Attention.</span>
              </h1>
              <p className="text-muted-foreground text-sm font-sans">
                Set up your daily digest preferences
              </p>
            </motion.div>

            {/* Digest Count Selection */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.2, duration: 0.5 }}
              className="space-y-4"
            >
              <label className="text-xs text-muted-foreground font-sans tracking-widest uppercase">
                Daily Digests
              </label>
              <div className="flex gap-3">
                <button
                  onClick={() => setDigestCount(1)}
                  className={`flex-1 py-4 px-4 rounded-xl border transition-all duration-300 
                    ${digestCount === 1 
                      ? "border-accent/50 bg-accent/5 text-foreground" 
                      : "border-border/10 text-muted-foreground hover:border-border/20"
                    }`}
                >
                  <div className="flex items-center justify-center gap-3">
                    <Sun size={18} strokeWidth={1.5} />
                    <span className="font-sans text-sm">Once a day</span>
                  </div>
                </button>
                <button
                  onClick={() => setDigestCount(2)}
                  className={`flex-1 py-4 px-4 rounded-xl border transition-all duration-300 
                    ${digestCount === 2 
                      ? "border-accent/50 bg-accent/5 text-foreground" 
                      : "border-border/10 text-muted-foreground hover:border-border/20"
                    }`}
                >
                  <div className="flex items-center justify-center gap-3">
                    <div className="flex -space-x-1">
                      <Sun size={16} strokeWidth={1.5} />
                      <Moon size={16} strokeWidth={1.5} />
                    </div>
                    <span className="font-sans text-sm">Twice a day</span>
                  </div>
                </button>
              </div>
            </motion.div>

            {/* Time Selection */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3, duration: 0.5 }}
              className="space-y-4"
            >
              <label className="text-xs text-muted-foreground font-sans tracking-widest uppercase">
                Delivery Time{digestCount === 2 ? "s" : ""}
              </label>
              <div className={`grid gap-4 ${digestCount === 2 ? "grid-cols-2" : "grid-cols-1"}`}>
                <div className="relative">
                  <Clock 
                    size={16} 
                    className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground/50" 
                  />
                  <input
                    type="time"
                    value={morningTime}
                    onChange={(e) => setMorningTime(e.target.value)}
                    className="w-full bg-secondary/30 border border-border/10 rounded-xl py-4 px-4 pl-11
                               text-foreground font-sans text-sm
                               focus:outline-none focus:border-accent/40 transition-colors
                               [&::-webkit-calendar-picker-indicator]:invert [&::-webkit-calendar-picker-indicator]:opacity-50"
                  />
                  {digestCount === 2 && (
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-muted-foreground/50">
                      Morning
                    </span>
                  )}
                </div>
                
                {digestCount === 2 && (
                  <motion.div
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.3 }}
                    className="relative"
                  >
                    <Clock 
                      size={16} 
                      className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground/50" 
                    />
                    <input
                      type="time"
                      value={eveningTime}
                      onChange={(e) => setEveningTime(e.target.value)}
                      className="w-full bg-secondary/30 border border-border/10 rounded-xl py-4 px-4 pl-11
                                 text-foreground font-sans text-sm
                                 focus:outline-none focus:border-accent/40 transition-colors
                                 [&::-webkit-calendar-picker-indicator]:invert [&::-webkit-calendar-picker-indicator]:opacity-50"
                    />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-muted-foreground/50">
                      Evening
                    </span>
                  </motion.div>
                )}
              </div>
            </motion.div>

            {/* API Key Input */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.4, duration: 0.5 }}
              className="space-y-4"
            >
              <label className="text-xs text-muted-foreground font-sans tracking-widest uppercase">
                OpenAI API Key
              </label>
              <div className="relative">
                <input
                  type={showKey ? "text" : "password"}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="sk-..."
                  className="w-full bg-transparent border-b border-border/20 focus:border-accent/60 
                             py-3 px-1 pr-10 text-foreground placeholder:text-muted-foreground/30
                             focus:outline-none transition-colors duration-300 font-mono text-sm"
                />
                <button
                  onClick={() => setShowKey(!showKey)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground/50 
                             hover:text-foreground transition-colors"
                >
                  {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              <p className="text-xs text-muted-foreground/40 font-sans">
                Your key stays local. We never store it.
              </p>
            </motion.div>

            {/* Continue Button */}
            <motion.button
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5, duration: 0.5 }}
              onClick={handleSettingsContinue}
              disabled={!apiKey}
              className="w-full group inline-flex items-center justify-center gap-3 px-8 py-4 
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
        )}

        {step === "instagram" && (
          <motion.div
            key="instagram"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
            className="max-w-md w-full text-center space-y-12"
          >
            {/* Instagram Icon */}
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.1, duration: 0.5 }}
              className="flex justify-center"
            >
              <div className={`w-24 h-24 rounded-2xl flex items-center justify-center transition-all duration-500
                ${isConnected 
                  ? "bg-accent/20 border border-accent/40" 
                  : "bg-secondary border border-border/10"
                }`}
              >
                {isConnected ? (
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: "spring", stiffness: 200 }}
                  >
                    <Check size={36} className="text-accent" strokeWidth={1.5} />
                  </motion.div>
                ) : (
                  <Instagram size={36} className="text-foreground/60" strokeWidth={1.5} />
                )}
              </div>
            </motion.div>

            {/* Text */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2, duration: 0.5 }}
              className="space-y-4"
            >
              <h2 className="text-3xl font-serif text-foreground">
                {isConnected ? "Connected" : "Connect Instagram"}
              </h2>
              <p className="text-muted-foreground text-sm font-sans max-w-xs mx-auto leading-relaxed">
                {isConnected 
                  ? "Your Vision Agent is now ready to work in the background."
                  : "Allow the Vision Agent to browse your feed silently throughout the day and surface what matters."
                }
              </p>
            </motion.div>

            {/* Info Cards */}
            {!isConnected && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.3, duration: 0.5 }}
                className="space-y-3"
              >
                <div className="glass rounded-xl p-4 text-left">
                  <p className="text-xs text-muted-foreground font-sans leading-relaxed">
                    <span className="text-accent">•</span> Runs silently in the background
                  </p>
                </div>
                <div className="glass rounded-xl p-4 text-left">
                  <p className="text-xs text-muted-foreground font-sans leading-relaxed">
                    <span className="text-accent">•</span> Blocks ads and irrelevant content
                  </p>
                </div>
                <div className="glass rounded-xl p-4 text-left">
                  <p className="text-xs text-muted-foreground font-sans leading-relaxed">
                    <span className="text-accent">•</span> Delivers your digest at{" "}
                    <span className="text-foreground/80 font-mono">
                      {morningTime}
                      {digestCount === 2 && ` & ${eveningTime}`}
                    </span>
                  </p>
                </div>
              </motion.div>
            )}

            {/* Connect Button */}
            {!isConnected && (
              <motion.button
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4, duration: 0.5 }}
                onClick={handleInstagramConnect}
                disabled={isConnecting}
                className="w-full group inline-flex items-center justify-center gap-3 px-8 py-4 
                           bg-foreground text-background rounded-xl
                           font-sans text-sm tracking-widest uppercase
                           hover:bg-foreground/90
                           disabled:opacity-70
                           transition-all duration-300"
              >
                {isConnecting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-background/30 border-t-background rounded-full animate-spin" />
                    <span>Connecting...</span>
                  </>
                ) : (
                  <>
                    <Instagram size={16} />
                    <span>Connect Instagram</span>
                  </>
                )}
              </motion.button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default ZeroStateScreen;