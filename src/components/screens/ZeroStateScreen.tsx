import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Eye, EyeOff } from "lucide-react";
import { 
  PixelSun, 
  PixelMoon, 
  PixelArrow,
  WavingPenguin
} from "../icons/PixelIcons";

interface ZeroStateScreenProps {
  onContinue: () => void;
}

type DigestCount = 1 | 2;
type Step = "hook" | "routine" | "key";

const TIME_OPTIONS = [
  "6:00 AM", "7:00 AM", "8:00 AM", "9:00 AM", "10:00 AM", "11:00 AM", "12:00 PM",
  "1:00 PM", "2:00 PM", "3:00 PM", "4:00 PM", "5:00 PM", "6:00 PM", "7:00 PM", 
  "8:00 PM", "9:00 PM", "10:00 PM"
];

const TypewriterText = ({ 
  text, 
  onComplete,
  speed = 30 
}: { 
  text: string; 
  onComplete: () => void;
  speed?: number;
}) => {
  const [displayedText, setDisplayedText] = useState("");
  const [isComplete, setIsComplete] = useState(false);
  const hasStarted = useRef(false);

  useEffect(() => {
    if (hasStarted.current) return;
    hasStarted.current = true;

    let index = 0;
    const interval = setInterval(() => {
      if (index < text.length) {
        setDisplayedText(text.slice(0, index + 1));
        index++;
      } else {
        clearInterval(interval);
        setIsComplete(true);
        onComplete();
      }
    }, speed);

    return () => clearInterval(interval);
  }, [text, speed, onComplete]);

  return (
    <span className="font-serif text-foreground">
      {displayedText}
      {!isComplete && (
        <motion.span
          animate={{ opacity: [1, 0] }}
          transition={{ duration: 0.5, repeat: Infinity, repeatType: "reverse" }}
          className="inline-block w-3 h-6 bg-foreground ml-1 align-middle"
        />
      )}
    </span>
  );
};

const ZeroStateScreen = ({ onContinue }: ZeroStateScreenProps) => {
  const [step, setStep] = useState<Step>("hook");
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [digestCount, setDigestCount] = useState<DigestCount | null>(null);
  const [typingComplete, setTypingComplete] = useState(false);
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  const [morningTime, setMorningTime] = useState("8:00 AM");
  const [eveningTime, setEveningTime] = useState("6:00 PM");

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      // Calculate offset from center of screen, normalized to -1 to 1
      const x = (e.clientX / window.innerWidth - 0.5) * 2;
      const y = (e.clientY / window.innerHeight - 0.5) * 2;
      setMousePosition({ x, y });
    };

    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, []);

  const handleBegin = () => {
    setStep("routine");
  };

  const handleRoutineSelect = (count: DigestCount) => {
    setDigestCount(count);
  };

  const handleRoutineContinue = () => {
    setStep("key");
  };

  const handleInitialize = () => {
    if (apiKey) {
      onContinue();
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 bg-background relative">
      {/* Waving Penguin in bottom left - only on hook step */}
      <AnimatePresence>
        {step === "hook" && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ 
              opacity: 1, 
              y: 0,
              x: mousePosition.x * 8,
              rotate: mousePosition.x * 5
            }}
            exit={{ opacity: 0, y: 20 }}
            transition={{ 
              opacity: { duration: 0.5, delay: 0.3 },
              y: { duration: 0.5, delay: 0.3 },
              x: { duration: 0.15, ease: "easeOut" },
              rotate: { duration: 0.15, ease: "easeOut" }
            }}
            className="fixed bottom-8 left-8"
          >
            <WavingPenguin size={80} />
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence mode="wait">
        {/* Step 1: The Hook */}
        {step === "hook" && (
          <motion.div
            key="hook"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5 }}
            className="max-w-lg w-full text-center space-y-12"
          >
            <div className="text-2xl md:text-3xl leading-relaxed space-y-2">
              <div className="font-serif text-foreground">Social Media is a drug.</div>
              <TypewriterText 
                text="Let Kowalski get high for you."
                onComplete={() => setTypingComplete(true)}
                speed={30}
              />
            </div>

            <AnimatePresence>
              {typingComplete && (
                <motion.button
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: 0.2 }}
                  onClick={handleBegin}
                  className="inline-flex items-center gap-3 px-8 py-4 border-2 border-foreground 
                             text-foreground font-sans text-sm tracking-wider uppercase
                             hover:bg-foreground hover:text-background transition-all duration-200"
                >
                  <span>Begin</span>
                  <PixelArrow size={16} color="charcoal" />
                </motion.button>
              )}
            </AnimatePresence>
          </motion.div>
        )}

        {/* Step 2: The Routine */}
        {step === "routine" && (
          <motion.div
            key="routine"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.5 }}
            className="max-w-xl w-full text-center space-y-12"
          >
            <motion.h2
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1, duration: 0.4 }}
              className="text-3xl md:text-4xl font-serif text-foreground"
            >
              When do you want your briefing?
            </motion.h2>

            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.2, duration: 0.4 }}
              className="grid grid-cols-2 gap-6"
            >
              {/* Card A: Once a day */}
              <motion.button
                whileHover={{ y: -4, boxShadow: "0 8px 24px rgba(0,0,0,0.1)" }}
                transition={{ duration: 0.2 }}
                onClick={() => handleRoutineSelect(1)}
                className={`aspect-square border-2 p-8 flex flex-col items-center justify-center gap-6
                           transition-colors duration-200 bg-card ${
                             digestCount === 1 
                               ? "border-foreground" 
                               : "border-foreground/20 hover:border-foreground"
                           }`}
              >
                <PixelSun size={48} color="charcoal" />
                <span className="font-sans text-foreground text-lg">Once a day</span>
              </motion.button>

              {/* Card B: Twice a day */}
              <motion.button
                whileHover={{ y: -4, boxShadow: "0 8px 24px rgba(0,0,0,0.1)" }}
                transition={{ duration: 0.2 }}
                onClick={() => handleRoutineSelect(2)}
                className={`aspect-square border-2 p-8 flex flex-col items-center justify-center gap-6
                           transition-colors duration-200 bg-card ${
                             digestCount === 2 
                               ? "border-foreground" 
                               : "border-foreground/20 hover:border-foreground"
                           }`}
              >
                <div className="flex items-center gap-2">
                  <PixelSun size={40} color="charcoal" />
                  <PixelMoon size={40} color="charcoal" />
                </div>
                <span className="font-sans text-foreground text-lg">Twice a day</span>
              </motion.button>
            </motion.div>

            {/* Time Preference Section */}
            <AnimatePresence>
              {digestCount && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.3 }}
                  className="space-y-8"
                >
                  <div className="space-y-6">
                    {/* Morning/Single Time */}
                    <div className="flex flex-col items-center gap-3">
                      <label className="text-sm text-muted-foreground font-sans flex items-center gap-2">
                        <PixelSun size={16} color="charcoal" />
                        {digestCount === 1 ? "Delivery time" : "Morning digest"}
                      </label>
                      <select
                        value={morningTime}
                        onChange={(e) => setMorningTime(e.target.value)}
                        className="bg-transparent border-2 border-foreground/20 px-6 py-3 font-sans text-foreground 
                                   focus:border-foreground outline-none transition-colors cursor-pointer"
                      >
                        {TIME_OPTIONS.map((time) => (
                          <option key={time} value={time} className="bg-background">
                            {time}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Evening Time (only for twice a day) */}
                    {digestCount === 2 && (
                      <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="flex flex-col items-center gap-3"
                      >
                        <label className="text-sm text-muted-foreground font-sans flex items-center gap-2">
                          <PixelMoon size={16} color="charcoal" />
                          Evening digest
                        </label>
                        <select
                          value={eveningTime}
                          onChange={(e) => setEveningTime(e.target.value)}
                          className="bg-transparent border-2 border-foreground/20 px-6 py-3 font-sans text-foreground 
                                     focus:border-foreground outline-none transition-colors cursor-pointer"
                        >
                          {TIME_OPTIONS.map((time) => (
                            <option key={time} value={time} className="bg-background">
                              {time}
                            </option>
                          ))}
                        </select>
                      </motion.div>
                    )}
                  </div>

                  {/* Continue Button */}
                  <motion.button
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.2 }}
                    onClick={handleRoutineContinue}
                    className="inline-flex items-center gap-3 px-8 py-4 border-2 border-foreground 
                               text-foreground font-sans text-sm tracking-wider uppercase
                               hover:bg-foreground hover:text-background transition-all duration-200"
                  >
                    <span>Continue</span>
                    <PixelArrow size={16} color="charcoal" />
                  </motion.button>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}

        {/* Step 3: The Key */}
        {step === "key" && (
          <motion.div
            key="key"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.5 }}
            className="max-w-md w-full space-y-10"
          >
            {/* Headline */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1, duration: 0.4 }}
              className="text-center space-y-4"
            >
              <h2 className="text-4xl md:text-5xl font-serif text-foreground">
                Bring Your Own Key.
              </h2>
              <p className="text-muted-foreground text-sm font-sans leading-relaxed max-w-sm mx-auto">
                Kowalski runs entirely on your local machine. Enter your OpenAI key to start the analysis.
              </p>
            </motion.div>

            {/* API Key Input */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.2, duration: 0.4 }}
              className="space-y-2"
            >
              <div className="relative">
                <input
                  type={showKey ? "text" : "password"}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="sk-..."
                  className="w-full input-dotted text-foreground placeholder:text-foreground/30
                             font-sans text-lg tracking-wider pr-12 py-4"
                />
                <button
                  onClick={() => setShowKey(!showKey)}
                  className="absolute right-0 top-1/2 -translate-y-1/2 p-3 text-muted-foreground 
                             hover:text-foreground transition-colors"
                >
                  {showKey ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>
            </motion.div>

            {/* Initialize Button */}
            <motion.button
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3, duration: 0.4 }}
              onClick={handleInitialize}
              disabled={!apiKey}
              className="w-full py-4 bg-foreground text-background font-sans text-sm tracking-wider uppercase
                        disabled:opacity-30 disabled:cursor-not-allowed
                        hover:bg-foreground/90 transition-colors duration-200"
            >
              Initialize
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default ZeroStateScreen;
