import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

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

const InterestsSettings = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const fromScreen = (location.state as { from?: string })?.from;
  const [settings, setSettings] = useState<SettingsData>(DEFAULT_SETTINGS);
  const [interestInput, setInterestInput] = useState("");

  useEffect(() => {
    const saved = localStorage.getItem("kowalski-settings");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setSettings({ ...DEFAULT_SETTINGS, ...parsed });
      } catch (e) {
        console.error("Failed to parse settings:", e);
      }
    }
  }, []);

  const handleBack = () => {
    navigate("/settings", { state: { from: fromScreen } });
  };

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

  const handleSave = () => {
    localStorage.setItem("kowalski-settings", JSON.stringify(settings));
    toast.success("Interests saved");
    handleBack();
  };

  return (
    <div className="min-h-screen bg-background text-foreground py-16 px-6 relative">
      <Button
        variant="ghost"
        size="icon"
        onClick={handleBack}
        className="absolute top-6 left-6 text-muted-foreground hover:bg-transparent opacity-60 hover:opacity-100 transition-opacity h-14 w-14"
      >
        <ArrowLeft className="w-6 h-6" />
      </Button>

      <div className="max-w-md mx-auto space-y-8 text-center">
        <h1 className="text-5xl md:text-6xl font-serif text-foreground mb-4 tracking-tight">Interests</h1>

        {/* Interests */}
        <div className="space-y-4">
          <Label className="text-sm text-foreground font-sans">Your Topics</Label>
          
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
          
          {/* Clear all button */}
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

        <button
          onClick={handleSave}
          className="w-full inline-flex items-center justify-center gap-3 px-8 py-4 border-2 border-foreground 
                     font-sans text-sm tracking-wider uppercase transition-all duration-200
                     text-foreground hover:bg-foreground hover:text-background"
        >
          Save
        </button>
      </div>
    </div>
  );
};

export default InterestsSettings;
