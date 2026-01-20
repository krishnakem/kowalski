import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence, useMotionValue, useSpring, useTransform } from "framer-motion";
import { Eye, EyeOff, Instagram, Check, Loader2 } from "lucide-react";
import {
  PixelSun,
  PixelMoon,
  PixelArrow,
  WavingPenguin
} from "../icons/PixelIcons";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import { useSettings } from "@/hooks/useSettings";
import { TIME_OPTIONS, MORNING_TIME_OPTIONS, EVENING_TIME_OPTIONS } from "@/lib/constants";
import { getValidEveningOptions } from "@/utils/timeValidation";

interface ZeroStateScreenProps {
  onContinue: () => void;
}

type DigestCount = 1 | 2;
type Step = "hook" | "name" | "routine" | "interests" | "key" | "instagram";
type InstagramPhase = "trigger" | "connecting" | "success";

const TypewriterText = ({
  text,
  onComplete,
  speed = 90
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

    const typeNext = () => {
      if (index < text.length) {
        setDisplayedText(text.slice(0, index + 1));
        const char = text[index];
        index++;

        // Variable delay for natural feel
        let delay = speed + Math.random() * 30; // Base + slight randomness
        if (char === '.' || char === ',' || char === '!') delay += 150; // Pause after punctuation
        if (char === ' ') delay -= 10; // Faster for spaces

        setTimeout(typeNext, delay);
      } else {
        setIsComplete(true);
        onComplete();
      }
    };

    typeNext();
  }, [text, speed, onComplete]);

  return (
    <span className="font-serif text-foreground">
      {displayedText}
      <motion.span
        animate={{ opacity: isComplete ? 0 : [1, 0] }}
        transition={isComplete
          ? { duration: 0.3 }
          : { duration: 0.5, repeat: Infinity, repeatType: "reverse" }
        }
        className="inline-block w-[3px] h-10 md:h-12 bg-foreground ml-1 align-middle"
      />
    </span>
  );
};

const ZeroStateScreen = ({ onContinue }: ZeroStateScreenProps) => {
  const { settings, patchSettings, isLoaded } = useSettings();
  const [step, setStep] = useState<Step>("hook");
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [digestCount, setDigestCount] = useState<DigestCount | null>(null);
  const [firstLineComplete, setFirstLineComplete] = useState(false);
  const [typingComplete, setTypingComplete] = useState(false);
  const [showBegin, setShowBegin] = useState(false);
  const [morningTime, setMorningTime] = useState("8:00 AM");
  const [eveningTime, setEveningTime] = useState("6:00 PM");
  const [instagramPhase, setInstagramPhase] = useState<InstagramPhase>("trigger");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [usageCap, setUsageCap] = useState(10);
  const [isValidating, setIsValidating] = useState(false);
  const [keyError, setKeyError] = useState<string | null>(null);
  const [interests, setInterests] = useState<string[]>([]);
  const [interestInput, setInterestInput] = useState("");
  const [userName, setUserName] = useState("");
  const [nameQuestionComplete, setNameQuestionComplete] = useState(false);

  // Hydrate from settings once loaded
  useEffect(() => {
    if (isLoaded) {
      if (settings.userName) setUserName(settings.userName);
      if (settings.apiKey) setApiKey(settings.apiKey);
      if (settings.interests?.length) setInterests(settings.interests);
      if (settings.digestFrequency) setDigestCount(settings.digestFrequency as DigestCount);
      if (settings.morningTime) setMorningTime(settings.morningTime);
      if (settings.eveningTime) setEveningTime(settings.eveningTime);
      if (settings.usageCap) setUsageCap(settings.usageCap);
    }
  }, [isLoaded, settings]);

  useEffect(() => {
    if (!typingComplete) {
      setShowBegin(false);
      return;
    }

    const t = window.setTimeout(() => setShowBegin(true), 600);
    return () => window.clearTimeout(t);
  }, [typingComplete]);

  // Smooth penguin animation using springs
  const mouseX = useMotionValue(0);
  const smoothX = useSpring(mouseX, { stiffness: 100, damping: 20, mass: 0.5 });
  const penguinX = useTransform(smoothX, (v) => v * 12);
  const penguinRotate = useTransform(smoothX, (v) => v * 8);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      // Calculate offset from center of screen, normalized to -1 to 1
      const x = (e.clientX / window.innerWidth - 0.5) * 2;
      mouseX.set(x);
    };

    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, [mouseX]);

  const handleBegin = () => {
    setStep("name");
  };

  const handleNameContinue = () => {
    patchSettings({ userName: userName.trim() });
    setStep("routine");
  };

  const handleRoutineSelect = (count: DigestCount) => {
    setDigestCount(count);

    // Clamp times to valid ranges when switching to twice daily
    if (count === 2) {
      if (!MORNING_TIME_OPTIONS.includes(morningTime)) {
        setMorningTime("8:00 AM");
      }

      const currentValidEvening = getValidEveningOptions(morningTime, EVENING_TIME_OPTIONS);
      if (!currentValidEvening.includes(eveningTime)) {
        setEveningTime(currentValidEvening[0] || "6:00 PM");
      }
    }
  };

  // Calculate valid evening options dynamically
  const validEveningTimes = getValidEveningOptions(morningTime, EVENING_TIME_OPTIONS);

  // Auto-correct loop: If Morning changes and makes Evening invalid, snap to nearest valid
  useEffect(() => {
    if (digestCount === 2 && !validEveningTimes.includes(eveningTime)) {
      if (validEveningTimes.length > 0) {
        setEveningTime(validEveningTimes[0]);
      }
    }
  }, [morningTime, digestCount, validEveningTimes, eveningTime]);

  const handleRoutineContinue = () => {
    // Save schedule settings before moving to interests
    patchSettings({
      digestFrequency: digestCount || 1,
      morningTime,
      eveningTime,
    });
    setStep("interests");
  };

  const handleAddInterest = () => {
    const trimmed = interestInput.trim();
    if (trimmed && !interests.includes(trimmed)) {
      setInterests([...interests, trimmed]);
      setInterestInput("");
    }
  };

  const handleRemoveInterest = (interest: string) => {
    setInterests(interests.filter((i) => i !== interest));
  };

  const handleInterestsContinue = () => {
    // Save interests before moving to API key step
    patchSettings({ interests });
    setStep("key");
  };

  const handleInitialize = async () => {
    if (!apiKey) return;

    setIsValidating(true);
    setKeyError(null);

    try {
      const response = await fetch('https://api.openai.com/v1/models', {
        headers: { 'Authorization': `Bearer ${apiKey}` }
      });

      if (response.status === 401) {
        setKeyError('Invalid API key. Please check and try again.');
        return;
      }

      // Valid key - save and proceed
      patchSettings({ apiKey, usageCap });
      setStep("instagram");
    } catch (error) {
      setKeyError('Could not validate key. Check your connection.');
    } finally {
      setIsValidating(false);
    }
  };

  // const webviewRef = useRef<Electron.WebviewTag>(null);
  const loginTargetRef = useRef<HTMLDivElement>(null);
  const hasLaunchedRef = useRef(false);

  // EFFECT 1: Handle Login Success (Global Listener)
  // Independent of webview Ref - listens as soon as dialog opens
  useEffect(() => {
    if (!dialogOpen) return;

    console.log("👂 Frontend: Attaching 'login-success' listener...");

    // @ts-ignore
    const removeListener = window.api.onLoginSuccess(() => {
      console.log("🎉 FRONTEND RECEIVED SUCCESS SIGNAL! Transitioning...");
      setInstagramPhase("success");
    });

    return () => {
      console.log("Frontend: Removing 'login-success' listener");
      if (removeListener) removeListener();
    };
  }, [dialogOpen]);

  // EFFECT 1.5: Auto-proceed after success screen displays for 2.5 seconds
  useEffect(() => {
    if (instagramPhase !== "success") return;

    const timer = setTimeout(() => {
      console.log("⏰ Auto-proceeding from Connection Established screen...");

      // Navigate FIRST while dialog still covers the screen
      // The dialog will be unmounted when ZeroStateScreen unmounts
      patchSettings({ hasOnboarded: true, analysisStatus: "working" });
      onContinue();
      // Note: No need to close dialog - component unmounts and dialog goes with it

    }, 2500);

    return () => clearTimeout(timer);
  }, [instagramPhase, patchSettings, onContinue]);

  // EFFECT 2: Webview Setup (Ref dependent) - REMOVED (Replaced by Overlay)

  // EFFECT 2.5: Trigger Overlay Logic
  useEffect(() => {
    // Only trigger if dialog is open, we are in 'connecting' phase, and haven't launched yet
    if (!dialogOpen || instagramPhase !== 'connecting' || hasLaunchedRef.current) return;

    const startOverlay = async () => {
      if (!loginTargetRef.current) return;
      hasLaunchedRef.current = true; // Lock

      // Calculate Screen Coordinates for the Overlay
      const rect = loginTargetRef.current.getBoundingClientRect();
      const bounds = {
        x: Math.round(window.screenX + rect.left),
        y: Math.round(window.screenY + rect.top),
        width: Math.round(rect.width),
        height: Math.round(rect.height)
      };

      console.log("🚀 ZeroState: Triggering Overlay Login at:", bounds);

      try {
        // @ts-ignore
        const success = await window.api.startLogin(bounds);
        if (success) {
          // Main process handles closing the overlay. We just update state.
          console.log("✅ ZeroState: Login Success returned from Main.");
          setInstagramPhase("success");
        } else {
          console.log("⚠️ ZeroState: Login returned false/cancelled.");
          hasLaunchedRef.current = false; // Allow retry?
        }
      } catch (e) {
        console.error("ZeroState Overlay Error:", e);
        hasLaunchedRef.current = false;
      }
    };

    // Small delay to ensure render layout
    setTimeout(startOverlay, 500);

  }, [dialogOpen, instagramPhase]);

  const handleConnectClick = () => {
    setDialogOpen(true);
    setInstagramPhase("connecting");
    // No longer calling startAgent here, the webview handles it
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 bg-background relative">
      {/* Waving Penguin in bottom left - on all steps */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.3 }}
        style={{ x: penguinX, rotate: penguinRotate }}
        className="fixed bottom-8 left-8"
      >
        <WavingPenguin size={80} />
      </motion.div>
      <AnimatePresence mode="wait">
        {/* Step 1: The Hook */}
        {step === "hook" && (
          <motion.div
            key="hook"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            className="max-w-lg w-full text-center space-y-12"
          >
            <div className="text-5xl leading-relaxed space-y-2">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.5, delay: 0.2 }}
              >
                <TypewriterText
                  text="Social Media is a drug."
                  onComplete={() => setFirstLineComplete(true)}
                />
              </motion.div>
              {firstLineComplete && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.5 }}
                >
                  <TypewriterText
                    text="Kowalski gets high for you."
                    onComplete={() => setTypingComplete(true)}
                  />
                </motion.div>
              )}
            </div>

            <div className="flex justify-center min-h-[56px]">
              <motion.button
                initial={false}
                animate={{ opacity: showBegin ? 1 : 0 }}
                transition={{ duration: 0.5, ease: "easeOut" }}
                onClick={handleBegin}
                tabIndex={showBegin ? 0 : -1}
                aria-hidden={!showBegin}
                className={
                  "inline-flex items-center gap-3 px-8 py-4 border-2 border-foreground " +
                  "text-foreground font-sans text-sm tracking-wider uppercase " +
                  "hover:bg-foreground hover:text-background transition-colors duration-200" +
                  (showBegin ? "" : " pointer-events-none")
                }
              >
                <span>Begin</span>
                <PixelArrow size={16} color="charcoal" />
              </motion.button>
            </div>
          </motion.div>
        )}

        {/* Step 2: Name */}
        {step === "name" && (
          <motion.div
            key="name"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            className="max-w-2xl w-full text-center flex flex-col items-center"
          >
            {/* Typewriter question - fixed position */}
            <div className="text-4xl md:text-5xl leading-relaxed mb-8">
              <TypewriterText
                text="What's your name?"
                onComplete={() => setNameQuestionComplete(true)}
                speed={80}
              />
            </div>

            {/* Input section - reserved space to prevent layout shift */}
            <div className="h-16 flex items-center justify-center mb-8">
              <AnimatePresence>
                {nameQuestionComplete && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.3, delay: 0.2 }}
                    className="inline-flex items-center justify-center"
                  >
                    <input
                      type="text"
                      value={userName}
                      onChange={(e) => setUserName(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleNameContinue()}
                      placeholder=""
                      autoFocus
                      className="bg-transparent border-none outline-none 
                                 font-serif text-4xl md:text-5xl text-foreground
                                 text-center caret-transparent"
                      style={{ width: `${Math.max(2, userName.length + 1)}ch` }}
                    />
                    {/* Blinking cursor - matches TypewriterText cursor */}
                    <motion.span
                      animate={{ opacity: [1, 0] }}
                      transition={{ duration: 0.5, repeat: Infinity, repeatType: "reverse" }}
                      className="inline-block w-[3px] h-10 md:h-12 bg-foreground ml-1 align-middle"
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Button section - reserved space */}
            <div className="h-16 flex items-center justify-center">
              <AnimatePresence mode="wait">
                {nameQuestionComplete && userName.trim() && (
                  <motion.button
                    key="continue-btn"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.3 }}
                    onClick={handleNameContinue}
                    className="inline-flex items-center gap-3 px-8 py-4 border-2 border-foreground 
                               text-foreground font-sans text-sm tracking-wider uppercase
                               hover:bg-foreground hover:text-background transition-all duration-200"
                  >
                    <span>Continue</span>
                    <PixelArrow size={16} color="charcoal" />
                  </motion.button>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        )}

        {/* Step 3: The Routine */}
        {step === "routine" && (
          <motion.div
            key="routine"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            className="max-w-xl w-full text-center space-y-12"
          >
            <motion.h2
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
              className="text-5xl font-serif text-foreground"
            >
              {userName.trim() ? `${userName.trim()}, when` : "When"} do you want your analysis?
            </motion.h2>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.25, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
              className="grid grid-cols-2 gap-6"
            >
              {/* Card A: Once a day */}
              <motion.button
                whileHover={{ y: -4, boxShadow: "0 8px 24px rgba(0,0,0,0.1)" }}
                transition={{ duration: 0.2 }}
                onClick={() => handleRoutineSelect(1)}
                className={`aspect-square border-2 p-8 flex flex-col items-center justify-center gap-6
                           transition-colors duration-200 bg-card ${digestCount === 1
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
                           transition-colors duration-200 bg-card ${digestCount === 2
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
                  transition={{ duration: 0.5 }}
                  className="space-y-8"
                >
                  <div className="space-y-6">
                    {/* Morning/Single Time */}
                    <div className="flex flex-col items-center gap-3">
                      <label className="text-sm text-muted-foreground font-sans flex items-center gap-2">
                        {digestCount === 2 && <PixelSun size={16} color="charcoal" />}
                        {digestCount === 1 ? "Delivery time" : "Morning analysis"}
                      </label>
                      <select
                        value={morningTime}
                        onChange={(e) => setMorningTime(e.target.value)}
                        className="bg-transparent border-2 border-foreground/20 px-6 py-3 font-sans text-foreground 
                                   focus:border-foreground outline-none transition-colors cursor-pointer"
                      >
                        {(digestCount === 2 ? MORNING_TIME_OPTIONS : TIME_OPTIONS).map((time) => (
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
                          Evening analysis
                        </label>
                        <select
                          value={eveningTime}
                          onChange={(e) => setEveningTime(e.target.value)}
                          className="bg-transparent border-2 border-foreground/20 px-6 py-3 font-sans text-foreground 
                                     focus:border-foreground outline-none transition-colors cursor-pointer"
                        >
                          {validEveningTimes.map((time) => (
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
                    transition={{ delay: 0.2, duration: 0.5 }}
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

        {/* Step 3: Interests */}
        {step === "interests" && (
          <motion.div
            key="interests"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            className="max-w-xl w-full text-center space-y-10"
          >
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
              className="space-y-4"
            >
              <h2 className="text-5xl font-serif text-foreground">
                {userName.trim() ? `${userName.trim()}, what` : "What"} should Kowalski watch for?
              </h2>
              <p className="text-muted-foreground text-sm font-sans">
                Add people, topics, or anything you want included in your analysis
              </p>
            </motion.div>

            {/* Input */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.25, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
              className="flex flex-col items-center gap-3"
            >
              <div className="flex gap-3">
                <input
                  type="text"
                  value={interestInput}
                  onChange={(e) => setInterestInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleAddInterest()}
                  placeholder="e.g., Taylor Swift, AI news, NBA..."
                  className="input-dotted text-foreground placeholder:text-foreground/30 font-sans text-lg w-80 py-3"
                />
                <button
                  onClick={handleAddInterest}
                  disabled={!interestInput.trim()}
                  className={`px-6 py-3 border-2 font-sans text-sm tracking-wider uppercase transition-all duration-200
                             ${interestInput.trim()
                      ? "border-foreground text-foreground hover:bg-foreground hover:text-background"
                      : "border-foreground/20 text-foreground/30 cursor-not-allowed"}`}
                >
                  Add
                </button>
              </div>
              <button
                onClick={() => setInterests([])}
                className={`text-sm font-sans transition-colors underline underline-offset-2 h-5
                           ${interests.length > 0
                    ? "text-muted-foreground hover:text-foreground"
                    : "text-transparent pointer-events-none"}`}
              >
                Clear all
              </button>
            </motion.div>

            {/* Word Cloud */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.35, duration: 0.5 }}
              className="relative h-[280px] w-full"
            >
              <AnimatePresence>
                {interests.map((interest, index) => {
                  // Predefined positions to avoid overlap while staying close
                  const positions = [
                    { x: 50, y: 30 },  // top center
                    { x: 25, y: 45 },  // left
                    { x: 75, y: 45 },  // right
                    { x: 40, y: 60 },  // bottom left
                    { x: 60, y: 60 },  // bottom right
                    { x: 50, y: 75 },  // bottom center
                    { x: 30, y: 25 },  // top left
                    { x: 70, y: 25 },  // top right
                    { x: 20, y: 65 },  // far left bottom
                    { x: 80, y: 65 },  // far right bottom
                  ];
                  const pos = positions[index % positions.length];
                  const posX = pos.x + ((index * 3) % 7) - 3; // slight offset
                  const posY = pos.y + ((index * 5) % 5) - 2; // slight offset

                  // Consistent rotation and sizing
                  const rotation = ((index * 7) % 25) - 12; // -12 to +12 degrees
                  const sizeClass = index % 3 === 0 ? "text-3xl" : index % 3 === 1 ? "text-2xl" : "text-xl";

                  // Unique floating animation parameters per word
                  const floatDuration = 3 + (index % 3); // 3-5 seconds
                  const floatDelay = (index * 0.4) % 2; // staggered start
                  const floatX = ((index * 3) % 7) - 3; // -3 to +3 px
                  const floatY = ((index * 5) % 9) - 4; // -4 to +4 px

                  return (
                    <motion.span
                      key={interest}
                      initial={{ opacity: 0, scale: 0.5 }}
                      animate={{
                        opacity: 1,
                        scale: 1,
                        x: [0, floatX, -floatX * 0.5, 0],
                        y: [0, floatY, -floatY * 0.5, 0],
                      }}
                      exit={{ opacity: 0, scale: 0.5 }}
                      transition={{
                        opacity: { duration: 0.3 },
                        scale: { duration: 0.3, ease: [0.22, 1, 0.36, 1] },
                        x: { duration: floatDuration, repeat: Infinity, ease: "easeInOut", delay: floatDelay },
                        y: { duration: floatDuration * 1.1, repeat: Infinity, ease: "easeInOut", delay: floatDelay },
                      }}
                      onClick={() => handleRemoveInterest(interest)}
                      style={{
                        position: 'absolute',
                        left: `${posX}%`,
                        top: `${posY}%`,
                        rotate: rotation,
                        transform: 'translate(-50%, -50%)',
                      }}
                      className={`word-cloud-item font-serif ${sizeClass} text-foreground select-none whitespace-nowrap`}
                    >
                      {interest}
                    </motion.span>
                  );
                })}
              </AnimatePresence>

              {interests.length === 0 && (
                <span className="absolute inset-0 flex items-center justify-center text-muted-foreground/50 font-sans text-sm italic">
                  Your interests will appear here...
                </span>
              )}
            </motion.div>

            {/* Continue Button */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4, duration: 0.5 }}
              className="flex justify-center"
            >
              <button
                onClick={handleInterestsContinue}
                className="inline-flex items-center gap-3 px-8 py-4 border-2 border-foreground text-foreground font-sans text-sm tracking-wider uppercase transition-all duration-200
                           hover:bg-foreground hover:text-background cursor-pointer"
              >
                <span>{interests.length > 0 ? "Continue" : "Skip"}</span>
                <PixelArrow size={16} color="charcoal" />
              </button>
            </motion.div>
          </motion.div>
        )}

        {/* Step 4: The Key */}
        {step === "key" && (
          <motion.div
            key="key"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            className="max-w-md w-full space-y-12 relative"
          >
            {/* Temporary dev skip button - DELETE BEFORE SHIPPING */}
            <button
              onClick={() => {
                patchSettings({ usageCap });
                setStep("instagram");
              }}
              className="absolute -top-8 right-0 text-xs text-muted-foreground/50 hover:text-muted-foreground underline"
            >
              Skip (dev only)
            </button>
            {/* Headline */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
              className="text-center space-y-4"
            >
              <h2 className="text-5xl font-serif text-foreground">
                {userName.trim() ? `${userName.trim()}, what` : "What"} is your OpenAI API Key?
              </h2>
              <p className="text-muted-foreground text-sm font-sans leading-relaxed max-w-sm mx-auto">
                Kowalski is private by design. Your data is processed using your personal OpenAI account and stored locally on your device.
              </p>
            </motion.div>

            {/* API Key Input */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.25, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
              className="space-y-2"
            >
              <div className="relative">
                <input
                  type={showKey ? "text" : "password"}
                  value={apiKey}
                  onChange={(e) => {
                    setApiKey(e.target.value);
                    setKeyError(null);
                  }}
                  placeholder="sk-..."
                  className={`w-full input-dotted text-foreground placeholder:text-foreground/30
                             font-sans text-lg tracking-wider pr-12 py-4 ${keyError ? 'border-destructive' : ''}`}
                />
                <button
                  onClick={() => setShowKey(!showKey)}
                  className="absolute right-0 top-1/2 -translate-y-1/2 p-3 text-muted-foreground transition-colors"
                >
                  {showKey ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>
              {keyError && (
                <motion.p
                  initial={{ opacity: 0, y: -5 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="text-destructive text-sm font-sans text-center"
                >
                  {keyError}
                </motion.p>
              )}
            </motion.div>

            {/* Safety Limit Slider */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.35, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
              className="space-y-4 pt-2"
            >
              <div className="text-center space-y-1">
                <label className="block text-sm font-sans">
                  <span className="font-semibold text-foreground">Monthly Usage Cap:</span>{" "}
                  <span className="text-foreground">${usageCap}</span>
                </label>
                <p className="text-sm text-muted-foreground font-sans">
                  Kowalski will stop processing requests once this limit is reached
                </p>
              </div>
              <div className="relative px-1">
                <input
                  type="range"
                  min={5}
                  max={15}
                  value={usageCap}
                  onChange={(e) => setUsageCap(Number(e.target.value))}
                  className="w-full h-0.5 bg-transparent appearance-none cursor-pointer
                             [&::-webkit-slider-runnable-track]:h-0.5 
                             [&::-webkit-slider-runnable-track]:bg-[repeating-linear-gradient(90deg,hsl(var(--foreground)/0.3)_0px,hsl(var(--foreground)/0.3)_4px,transparent_4px,transparent_8px)]
                             [&::-webkit-slider-thumb]:appearance-none 
                             [&::-webkit-slider-thumb]:w-4 
                             [&::-webkit-slider-thumb]:h-4 
                             [&::-webkit-slider-thumb]:rounded-full 
                             [&::-webkit-slider-thumb]:bg-foreground 
                             [&::-webkit-slider-thumb]:-mt-[7px]
                             [&::-webkit-slider-thumb]:cursor-pointer
                             [&::-moz-range-track]:h-0.5 
                             [&::-moz-range-track]:bg-[repeating-linear-gradient(90deg,hsl(var(--foreground)/0.3)_0px,hsl(var(--foreground)/0.3)_4px,transparent_4px,transparent_8px)]
                             [&::-moz-range-thumb]:appearance-none 
                             [&::-moz-range-thumb]:w-4 
                             [&::-moz-range-thumb]:h-4 
                             [&::-moz-range-thumb]:rounded-full 
                             [&::-moz-range-thumb]:bg-foreground 
                             [&::-moz-range-thumb]:border-0
                             [&::-moz-range-thumb]:cursor-pointer"
                />
              </div>
            </motion.div>

            {/* Next Button */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3, duration: 0.5 }}
              className="flex justify-center"
            >
              <button
                onClick={handleInitialize}
                disabled={!apiKey || isValidating}
                className={`inline-flex items-center gap-3 px-8 py-4 border-2 font-sans text-sm tracking-wider uppercase transition-all duration-200
                           ${apiKey && !isValidating
                    ? "border-foreground text-foreground hover:bg-foreground hover:text-background cursor-pointer"
                    : "border-foreground/20 text-foreground/30 cursor-not-allowed"
                  }`}
              >
                {isValidating ? (
                  <>
                    <Loader2 size={16} className="animate-spin text-foreground" />
                    <span className="text-foreground">Validating...</span>
                  </>
                ) : (
                  <>
                    <span>Next</span>
                    <PixelArrow size={16} color="charcoal" />
                  </>
                )}
              </button>
            </motion.div>
          </motion.div>
        )}

        {/* Step 4: Instagram Connect */}
        {step === "instagram" && (
          <motion.div
            key="instagram"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            className="max-w-sm w-full"
          >
            {/* Trigger Card - hidden during success phase to prevent flash on exit */}
            {instagramPhase !== "success" && (
              <motion.div
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                className="bg-background rounded-3xl p-12 flex flex-col items-center gap-12"
              >
                <motion.div
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.3, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                >
                  <Instagram className="w-16 h-16 text-foreground" strokeWidth={1.5} />
                </motion.div>

                <motion.div
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.4, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                  className="text-center space-y-4"
                >
                  <h2 className="text-4xl md:text-5xl font-serif text-foreground leading-tight">
                    Last step{userName.trim() ? ` ${userName.trim()}` : ""},<br />
                    <span className="whitespace-nowrap">Connect your Instagram.</span>
                  </h2>
                  <p className="text-muted-foreground text-sm font-sans">
                    Kowalski interacts with Instagram in a local sandbox. Your credentials never leave your device.
                  </p>
                </motion.div>

                <motion.button
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.5, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                  onClick={handleConnectClick}
                  className="inline-flex items-center gap-3 px-8 py-4 border-2 border-foreground
                             text-foreground font-sans text-sm tracking-wider uppercase
                             hover:bg-foreground hover:text-background transition-all duration-200"
                >
                  Connect Account
                  <PixelArrow size={16} color="charcoal" />
                </motion.button>
              </motion.div>
            )}

            {/* Browser View Dialog */}
            <Dialog open={dialogOpen} onOpenChange={() => { }}>
              <DialogContent className="border-0 p-0 w-screen h-screen max-w-none bg-background rounded-none overflow-hidden [&>button]:hidden shadow-none" overlayClassName="bg-transparent backdrop-blur-none">
                <AnimatePresence mode="wait">
                  {instagramPhase === "connecting" && (
                    <motion.div
                      key="connecting"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.3 }}
                      className="w-full h-full flex flex-col"
                    >
                      <div className="flex-1 w-full h-full bg-transparent flex items-center justify-center overflow-hidden">
                        <div
                          ref={loginTargetRef}
                          id="login-placeholder"
                          style={{ width: '100%', height: '100%' }}
                          className="bg-transparent" // Transparent so we see the overlay
                        />
                      </div>
                    </motion.div>
                  )}

                  {instagramPhase === "success" && (
                    <motion.div
                      key="success"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.3 }}
                      className="w-full h-full bg-paper text-ink flex flex-col items-center justify-center p-8 text-center"
                    >
                      {/* Icon & Text Block */}
                      <div className="flex flex-col items-center space-y-6">
                        <div className="p-4 border-2 border-ink/10 rounded-full">
                          <Check className="w-12 h-12 text-ink" strokeWidth={1.5} />
                        </div>
                        <div className="space-y-2">
                          <h2 className="text-4xl font-serif tracking-tight text-ink">Connection Established</h2>
                          <p className="text-lg text-ink/60 font-sans tracking-wide uppercase text-sm">Secure session captured</p>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </DialogContent>
            </Dialog>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default ZeroStateScreen;
