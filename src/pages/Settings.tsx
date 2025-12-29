import { useState, useEffect, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { ArrowLeft, Eye, EyeOff, Loader2 } from "lucide-react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { PixelSun, PixelMoon } from "@/components/icons/PixelIcons";

const TIME_OPTIONS = [
  "6:00 AM", "6:30 AM", "7:00 AM", "7:30 AM", "8:00 AM", "8:30 AM",
  "9:00 AM", "9:30 AM", "10:00 AM", "10:30 AM", "11:00 AM", "11:30 AM",
  "12:00 PM", "12:30 PM", "1:00 PM", "1:30 PM", "2:00 PM", "2:30 PM",
  "3:00 PM", "3:30 PM", "4:00 PM", "4:30 PM", "5:00 PM", "5:30 PM",
  "6:00 PM", "6:30 PM", "7:00 PM", "7:30 PM", "8:00 PM", "8:30 PM",
  "9:00 PM", "9:30 PM", "10:00 PM"
];

interface SettingsData {
  digestFrequency: 1 | 2;
  morningTime: string;
  eveningTime: string;
  apiKey: string;
  usageCap: number;
  interests: string[];
}

const DEFAULT_SETTINGS: SettingsData = {
  digestFrequency: 1,
  morningTime: "8:00 AM",
  eveningTime: "6:00 PM",
  apiKey: "",
  usageCap: 10,
  interests: [],
};

// Word cloud position grid for non-overlapping placement
const WORD_POSITIONS = [
  { x: 50, y: 20, size: 1.3, rotation: -3 },
  { x: 15, y: 45, size: 1.1, rotation: 2 },
  { x: 75, y: 50, size: 1.2, rotation: -2 },
  { x: 35, y: 70, size: 1.0, rotation: 4 },
  { x: 60, y: 35, size: 1.15, rotation: -1 },
  { x: 25, y: 25, size: 1.05, rotation: 3 },
  { x: 80, y: 75, size: 1.1, rotation: -4 },
  { x: 10, y: 65, size: 1.2, rotation: 1 },
  { x: 70, y: 15, size: 1.0, rotation: -2 },
  { x: 45, y: 55, size: 1.25, rotation: 2 },
  { x: 90, y: 40, size: 1.05, rotation: -3 },
  { x: 5, y: 35, size: 1.15, rotation: 4 },
];

const Settings = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const fromScreen = (location.state as { from?: string })?.from || "agent";
  const [settings, setSettings] = useState<SettingsData>(DEFAULT_SETTINGS);
  const [showApiKey, setShowApiKey] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [keyError, setKeyError] = useState<string | null>(null);
  const [interestInput, setInterestInput] = useState("");
  const originalApiKeyRef = useRef<string>("");

  const handleBack = () => {
    navigate("/", { state: { screen: fromScreen } });
  };

  useEffect(() => {
    const saved = localStorage.getItem("kowalski-settings");
    // Also check for interests from onboarding localStorage key
    const onboardingSettings = localStorage.getItem("kowalski_settings");
    let onboardingInterests: string[] = [];
    
    if (onboardingSettings) {
      try {
        const parsed = JSON.parse(onboardingSettings);
        onboardingInterests = parsed.interests || [];
      } catch (e) {
        console.error("Failed to parse onboarding settings:", e);
      }
    }
    
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        // Merge interests from both sources, preferring settings if they exist
        const mergedInterests = parsed.interests?.length > 0 
          ? parsed.interests 
          : onboardingInterests;
        setSettings({ ...DEFAULT_SETTINGS, ...parsed, interests: mergedInterests });
        originalApiKeyRef.current = parsed.apiKey || "";
      } catch (e) {
        console.error("Failed to parse settings:", e);
      }
    } else if (onboardingInterests.length > 0) {
      setSettings(prev => ({ ...prev, interests: onboardingInterests }));
    }
  }, []);

  const handleAddInterest = () => {
    const trimmed = interestInput.trim();
    if (trimmed && !settings.interests.includes(trimmed)) {
      setSettings({ ...settings, interests: [...settings.interests, trimmed] });
      setInterestInput("");
    }
  };

  const handleRemoveInterest = (interest: string) => {
    setSettings({ ...settings, interests: settings.interests.filter(i => i !== interest) });
  };

  const handleSave = async () => {
    const apiKeyChanged = settings.apiKey !== originalApiKeyRef.current;
    
    // Only validate if API key has changed and is not empty
    if (apiKeyChanged && settings.apiKey) {
      setIsValidating(true);
      setKeyError(null);
      
      try {
        const response = await fetch('https://api.openai.com/v1/models', {
          headers: { 'Authorization': `Bearer ${settings.apiKey}` }
        });
        
        if (response.status === 401) {
          setKeyError('Invalid API key. Please check and try again.');
          setIsValidating(false);
          return;
        }
      } catch (error) {
        setKeyError('Could not validate key. Check your connection.');
        setIsValidating(false);
        return;
      }
      
      setIsValidating(false);
    }
    
    localStorage.setItem("kowalski-settings", JSON.stringify(settings));
    originalApiKeyRef.current = settings.apiKey;
    toast.success("Settings saved");
  };

  return (
    <div className="min-h-screen bg-background text-foreground py-16 px-6 relative">
      {/* Back Button */}
      <Button
        variant="ghost"
        size="icon"
        onClick={handleBack}
        className="absolute top-6 left-6 text-muted-foreground hover:bg-transparent opacity-60 hover:opacity-100 transition-opacity h-14 w-14"
      >
        <ArrowLeft className="w-6 h-6" />
      </Button>

      <div className="max-w-md mx-auto space-y-8 text-center">
        {/* Header */}
        <h1 className="text-5xl md:text-6xl font-serif text-foreground mb-4 tracking-tight">Preferences</h1>

        {/* Analysis Frequency */}
        <div className="space-y-3">
          <Label className="text-sm text-foreground font-sans">Analysis Frequency</Label>
          <div className="grid grid-cols-2 gap-4">
            {/* Once a day */}
            <motion.button
              whileHover={{ y: -2, boxShadow: "0 4px 12px rgba(0,0,0,0.08)" }}
              transition={{ duration: 0.2 }}
              onClick={() => setSettings({ ...settings, digestFrequency: 1 })}
              className={`aspect-square border-2 p-6 flex flex-col items-center justify-center gap-4
                         transition-colors duration-200 bg-card ${
                           settings.digestFrequency === 1 
                             ? "border-foreground" 
                             : "border-foreground/20 hover:border-foreground"
                         }`}
            >
              <PixelSun size={40} color="charcoal" />
              <span className="font-sans text-foreground text-base">Once a day</span>
            </motion.button>

            {/* Twice a day */}
            <motion.button
              whileHover={{ y: -2, boxShadow: "0 4px 12px rgba(0,0,0,0.08)" }}
              transition={{ duration: 0.2 }}
              onClick={() => setSettings({ ...settings, digestFrequency: 2 })}
              className={`aspect-square border-2 p-6 flex flex-col items-center justify-center gap-4
                         transition-colors duration-200 bg-card ${
                           settings.digestFrequency === 2 
                             ? "border-foreground" 
                             : "border-foreground/20 hover:border-foreground"
                         }`}
            >
              <div className="flex items-center gap-1">
                <PixelSun size={32} color="charcoal" />
                <PixelMoon size={32} color="charcoal" />
              </div>
              <span className="font-sans text-foreground text-base">Twice a day</span>
            </motion.button>
          </div>
        </div>

        {/* Morning Time */}
        <div className="space-y-3">
          <Label className="text-sm text-foreground font-sans flex items-center justify-center gap-2">
            {settings.digestFrequency === 2 && <PixelSun size={16} color="charcoal" />}
            {settings.digestFrequency === 1 ? "Delivery Time" : "Morning Analysis"}
          </Label>
          <select
            value={settings.morningTime}
            onChange={(e) => setSettings({ ...settings, morningTime: e.target.value })}
            className="w-full bg-background border-2 border-foreground/20 px-6 py-3 font-sans text-foreground text-center
                       focus:border-foreground outline-none transition-colors cursor-pointer"
          >
            {TIME_OPTIONS.map((time) => (
              <option key={time} value={time} className="bg-background">
                {time}
              </option>
            ))}
          </select>
        </div>

        {/* Evening Time (only if twice daily) */}
        {settings.digestFrequency === 2 && (
          <div className="space-y-3">
            <Label className="text-sm text-foreground font-sans flex items-center justify-center gap-2">
              <PixelMoon size={16} color="charcoal" />
              Evening Analysis
            </Label>
            <select
              value={settings.eveningTime}
              onChange={(e) => setSettings({ ...settings, eveningTime: e.target.value })}
              className="w-full bg-background border-2 border-foreground/20 px-6 py-3 font-sans text-foreground text-center
                         focus:border-foreground outline-none transition-colors cursor-pointer"
            >
              {TIME_OPTIONS.map((time) => (
                <option key={time} value={time} className="bg-background">
                  {time}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* API Key */}
        <div className="space-y-3">
          <Label className="text-sm text-foreground font-sans">OpenAI API Key</Label>
          <div className="relative">
            <input
              type={showApiKey ? "text" : "password"}
              value={settings.apiKey}
              onChange={(e) => {
                setSettings({ ...settings, apiKey: e.target.value });
                setKeyError(null);
              }}
              placeholder="sk-..."
              className={`w-full input-dotted text-foreground placeholder:text-foreground/30 text-left
                         font-sans text-lg tracking-wider pr-12 py-4 ${keyError ? 'border-destructive' : ''}`}
            />
            <button
              type="button"
              onClick={() => setShowApiKey(!showApiKey)}
              className="absolute right-0 top-1/2 -translate-y-1/2 p-3 text-muted-foreground transition-colors"
            >
              {showApiKey ? <EyeOff size={20} /> : <Eye size={20} />}
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
        </div>

        {/* Monthly Usage Cap */}
        <div className="space-y-4">
          <div className="space-y-1">
            <Label className="text-sm text-foreground font-sans">
              Monthly Usage Cap: ${settings.usageCap}
            </Label>
            <p className="text-sm text-muted-foreground font-sans">
              Kowalski will stop processing requests once this limit is reached
            </p>
          </div>
          <div className="relative px-1">
            <input
              type="range"
              min={5}
              max={15}
              value={settings.usageCap}
              onChange={(e) => setSettings({ ...settings, usageCap: Number(e.target.value) })}
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
        </div>

        {/* Interests */}
        <div className="space-y-4">
          <Label className="text-sm text-foreground font-sans">Interests</Label>
          
          {/* Input row */}
          <div className="flex gap-2">
            <input
              type="text"
              value={interestInput}
              onChange={(e) => setInterestInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAddInterest()}
              placeholder="Add an interest..."
              className="flex-1 input-dotted text-foreground placeholder:text-foreground/30 text-left
                         font-sans text-base py-3"
            />
            <button
              onClick={handleAddInterest}
              className="px-4 py-2 border-2 border-foreground text-foreground font-sans text-sm 
                         hover:bg-foreground hover:text-background transition-colors"
            >
              Add
            </button>
          </div>
          
          {/* Clear all button - always reserves space */}
          <button
            onClick={() => setSettings({ ...settings, interests: [] })}
            className={`text-sm font-sans transition-colors underline underline-offset-2 h-5
                       ${settings.interests.length > 0 
                         ? "text-muted-foreground hover:text-foreground" 
                         : "text-transparent pointer-events-none"}`}
          >
            Clear all
          </button>
          
          {/* Word Cloud */}
          <div className="relative h-48 w-full overflow-hidden">
            {settings.interests.map((interest, index) => {
              const pos = WORD_POSITIONS[index % WORD_POSITIONS.length];
              return (
                <motion.button
                  key={interest}
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  onClick={() => handleRemoveInterest(interest)}
                  className="absolute font-serif text-foreground cursor-pointer select-none
                             hover:line-through hover:text-foreground/50 transition-all duration-200"
                  style={{
                    left: `${pos.x}%`,
                    top: `${pos.y}%`,
                    transform: `translate(-50%, -50%) rotate(${pos.rotation}deg) scale(${pos.size})`,
                    fontSize: `${1 + pos.size * 0.3}rem`,
                  }}
                >
                  {interest}
                </motion.button>
              );
            })}
            
            {settings.interests.length === 0 && (
              <div className="absolute inset-0 flex items-center justify-center">
                <p className="text-muted-foreground/50 font-sans text-sm italic">
                  No interests added yet
                </p>
              </div>
            )}
          </div>
        </div>

        <div className="space-y-3">
          <button
            onClick={handleSave}
            disabled={isValidating}
            className={`w-full inline-flex items-center justify-center gap-3 px-8 py-4 border-2 border-foreground 
                       font-sans text-sm tracking-wider uppercase transition-all duration-200
                       ${isValidating 
                         ? 'text-foreground/50 cursor-not-allowed' 
                         : 'text-foreground hover:bg-foreground hover:text-background'}`}
          >
            {isValidating ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                <span>Validating...</span>
              </>
            ) : (
              <span>Save</span>
            )}
          </button>
          <button
            onClick={() => {
              setSettings(DEFAULT_SETTINGS);
              setKeyError(null);
              toast.success("Settings reset to defaults");
            }}
            className="w-full inline-flex items-center justify-center gap-3 px-8 py-4 border-2 border-foreground/20 
                       text-muted-foreground font-sans text-sm tracking-wider uppercase
                       hover:border-foreground hover:text-foreground transition-all duration-200"
          >
            Reset to Defaults
          </button>
        </div>
      </div>
    </div>
  );
};

export default Settings;
