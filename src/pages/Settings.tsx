import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { ArrowLeft, Eye, EyeOff } from "lucide-react";
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
}

const DEFAULT_SETTINGS: SettingsData = {
  digestFrequency: 1,
  morningTime: "8:00 AM",
  eveningTime: "6:00 PM",
  apiKey: "",
  usageCap: 10,
};

const Settings = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const fromScreen = (location.state as { from?: string })?.from || "agent";
  const [settings, setSettings] = useState<SettingsData>(DEFAULT_SETTINGS);
  const [showApiKey, setShowApiKey] = useState(false);

  const handleBack = () => {
    navigate("/", { state: { screen: fromScreen } });
  };

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

  const handleSave = () => {
    localStorage.setItem("kowalski-settings", JSON.stringify(settings));
    toast.success("Settings saved");
    handleBack();
  };

  return (
    <div className="min-h-screen bg-background text-foreground p-6 md:p-12">
      <div className="max-w-md mx-auto space-y-8">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={handleBack}
            className="text-muted-foreground hover:bg-transparent focus:ring-0 focus-visible:ring-0 active:bg-transparent"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h1 className="font-serif text-4xl md:text-5xl">Settings</h1>
        </div>

        {/* Analysis Frequency */}
        <div className="space-y-3">
          <Label className="text-xl font-serif">Analysis Frequency</Label>
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
          <Label className="text-xl font-serif">
            {settings.digestFrequency === 1 ? "Delivery Time" : "Morning Analysis"}
          </Label>
          <select
            value={settings.morningTime}
            onChange={(e) => setSettings({ ...settings, morningTime: e.target.value })}
            className="w-full bg-background border border-border rounded-md px-3 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
          >
            {TIME_OPTIONS.map((time) => (
              <option key={time} value={time}>
                {time}
              </option>
            ))}
          </select>
        </div>

        {/* Evening Time (only if twice daily) */}
        {settings.digestFrequency === 2 && (
          <div className="space-y-3">
            <Label className="text-xl font-serif">Evening Analysis</Label>
            <select
              value={settings.eveningTime}
              onChange={(e) => setSettings({ ...settings, eveningTime: e.target.value })}
              className="w-full bg-background border border-border rounded-md px-3 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            >
              {TIME_OPTIONS.map((time) => (
                <option key={time} value={time}>
                  {time}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* API Key */}
        <div className="space-y-3">
          <Label className="text-xl font-serif">OpenAI API Key</Label>
          <div className="relative">
            <input
              type={showApiKey ? "text" : "password"}
              value={settings.apiKey}
              onChange={(e) => setSettings({ ...settings, apiKey: e.target.value })}
              placeholder="sk-..."
              className="w-full input-dotted text-foreground placeholder:text-foreground/30
                         font-sans text-lg tracking-wider pr-12 py-4"
            />
            <button
              type="button"
              onClick={() => setShowApiKey(!showApiKey)}
              className="absolute right-0 top-1/2 -translate-y-1/2 p-3 text-muted-foreground transition-colors"
            >
              {showApiKey ? <EyeOff size={20} /> : <Eye size={20} />}
            </button>
          </div>
        </div>

        {/* Monthly Usage Cap */}
        <div className="space-y-4">
          <div className="space-y-1">
            <Label className="text-xl font-serif">
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

        <Button onClick={handleSave} className="w-full" size="lg">
          Save Settings
        </Button>
      </div>
    </div>
  );
};

export default Settings;
