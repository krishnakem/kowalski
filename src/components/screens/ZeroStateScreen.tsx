import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Eye, EyeOff } from "lucide-react";
import { 
  PixelSun, 
  PixelMoon, 
  PixelInstagram, 
  PixelCheck, 
  PixelArrow 
} from "../icons/PixelIcons";

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
    setTimeout(() => {
      setIsConnecting(false);
      setIsConnected(true);
      setTimeout(onContinue, 800);
    }, 1500);
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 bg-background">
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
              <h1 className="text-5xl md:text-6xl font-serif text-foreground leading-tight mb-4">
                Reclaim Your
                <br />
                <span className="italic">Attention.</span>
              </h1>
              <p className="text-muted-foreground text-sm font-sans">
                Configure your daily digest preferences
              </p>
            </motion.div>

            {/* Divider */}
            <div className="divider" />

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
              <div className="flex gap-4">
                <button
                  onClick={() => setDigestCount(1)}
                  className={`flex-1 py-4 px-4 border-2 transition-all duration-200 
                    ${digestCount === 1 
                      ? "border-accent bg-accent/5 text-foreground" 
                      : "border-border text-muted-foreground hover:border-foreground/30"
                    }`}
                >
                  <div className="flex items-center justify-center gap-3">
                    <PixelSun size={20} color={digestCount === 1 ? "blue" : "charcoal"} />
                    <span className="font-sans text-sm">Once a day</span>
                  </div>
                </button>
                <button
                  onClick={() => setDigestCount(2)}
                  className={`flex-1 py-4 px-4 border-2 transition-all duration-200 
                    ${digestCount === 2 
                      ? "border-accent bg-accent/5 text-foreground" 
                      : "border-border text-muted-foreground hover:border-foreground/30"
                    }`}
                >
                  <div className="flex items-center justify-center gap-3">
                    <div className="flex -space-x-1">
                      <PixelSun size={18} color={digestCount === 2 ? "blue" : "charcoal"} />
                      <PixelMoon size={18} color={digestCount === 2 ? "blue" : "charcoal"} />
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
              <div className={`grid gap-6 ${digestCount === 2 ? "grid-cols-2" : "grid-cols-1"}`}>
                <div className="relative">
                  <div className="flex items-center gap-3">
                    <PixelSun size={20} />
                    <input
                      type="time"
                      value={morningTime}
                      onChange={(e) => setMorningTime(e.target.value)}
                      className="flex-1 input-underline text-foreground font-mono text-lg
                                [&::-webkit-calendar-picker-indicator]:opacity-50"
                    />
                  </div>
                  {digestCount === 2 && (
                    <span className="absolute -bottom-5 left-9 text-xs text-muted-foreground">
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
                    <div className="flex items-center gap-3">
                      <PixelMoon size={20} />
                      <input
                        type="time"
                        value={eveningTime}
                        onChange={(e) => setEveningTime(e.target.value)}
                        className="flex-1 input-underline text-foreground font-mono text-lg
                                  [&::-webkit-calendar-picker-indicator]:opacity-50"
                      />
                    </div>
                    <span className="absolute -bottom-5 left-9 text-xs text-muted-foreground">
                      Evening
                    </span>
                  </motion.div>
                )}
              </div>
            </motion.div>

            {/* API Key Input - Contract/dotted style */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.4, duration: 0.5 }}
              className="space-y-4 pt-4"
            >
              <label className="text-xs text-muted-foreground font-sans tracking-widest uppercase">
                OpenAI API Key
              </label>
              <div className="relative">
                <input
                  type={showKey ? "text" : "password"}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="sk-................................................"
                  className="w-full input-dotted text-foreground placeholder:text-foreground/20
                             font-mono text-sm tracking-wider pr-10"
                />
                <button
                  onClick={() => setShowKey(!showKey)}
                  className="absolute right-0 top-1/2 -translate-y-1/2 p-2 text-muted-foreground 
                             hover:text-foreground transition-colors"
                >
                  {showKey ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              <p className="text-xs text-muted-foreground font-sans">
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
              className="w-full btn-sharp flex items-center justify-center gap-3
                        disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <span>Continue</span>
              <PixelArrow size={18} color="blue" className="invert" />
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
            className="max-w-md w-full text-center space-y-10"
          >
            {/* Camera Icon */}
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.1, duration: 0.5 }}
              className="flex justify-center"
            >
              <div className={`w-28 h-28 border-2 flex items-center justify-center transition-all duration-500
                ${isConnected 
                  ? "border-accent bg-accent/10" 
                  : "border-foreground/20 bg-card"
                }`}
              >
                {isConnected ? (
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: "spring", stiffness: 200 }}
                  >
                    <PixelCheck size={48} color="blue" />
                  </motion.div>
                ) : (
                  <PixelInstagram size={48} />
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
              <h2 className="text-4xl font-serif text-foreground">
                {isConnected ? "Connected" : "Connect Instagram"}
              </h2>
              <p className="text-muted-foreground text-sm font-sans max-w-xs mx-auto leading-relaxed">
                {isConnected 
                  ? "Kowalski is now ready to work in the background."
                  : "Allow Kowalski to browse your feed silently throughout the day and surface what matters."
                }
              </p>
            </motion.div>

            {/* Info Cards */}
            {!isConnected && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.3, duration: 0.5 }}
                className="space-y-3 text-left"
              >
                <div className="border border-border p-4 bg-card">
                  <p className="text-sm text-foreground font-sans">
                    <span className="text-accent mr-2">•</span>
                    Runs silently in the background
                  </p>
                </div>
                <div className="border border-border p-4 bg-card">
                  <p className="text-sm text-foreground font-sans">
                    <span className="text-accent mr-2">•</span>
                    Blocks ads and irrelevant content
                  </p>
                </div>
                <div className="border border-border p-4 bg-card">
                  <p className="text-sm text-foreground font-sans">
                    <span className="text-accent mr-2">•</span>
                    Delivers your digest at{" "}
                    <span className="font-mono text-accent">
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
                className="w-full btn-sharp flex items-center justify-center gap-3
                          disabled:opacity-70"
              >
                {isConnecting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-accent-foreground/30 border-t-accent-foreground animate-spin" />
                    <span>Connecting...</span>
                  </>
                ) : (
                  <>
                    <PixelInstagram size={18} className="invert" />
                    <span>Connect Instagram</span>
                    <PixelArrow size={18} className="invert" />
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
