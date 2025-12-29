import { useNavigate, useLocation } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { PixelSun, PixelMoon } from "@/components/icons/PixelIcons";
import { useSettings } from "@/hooks/useSettings";

const TIME_OPTIONS = [
  "6:00 AM", "6:30 AM", "7:00 AM", "7:30 AM", "8:00 AM", "8:30 AM",
  "9:00 AM", "9:30 AM", "10:00 AM", "10:30 AM", "11:00 AM", "11:30 AM",
  "12:00 PM", "12:30 PM", "1:00 PM", "1:30 PM", "2:00 PM", "2:30 PM",
  "3:00 PM", "3:30 PM", "4:00 PM", "4:30 PM", "5:00 PM", "5:30 PM",
  "6:00 PM", "6:30 PM", "7:00 PM", "7:30 PM", "8:00 PM", "8:30 PM",
  "9:00 PM", "9:30 PM", "10:00 PM"
];

const ScheduleSettings = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const fromScreen = (location.state as { from?: string })?.from;
  const { settings, setSettings, saveSettings } = useSettings();

  const handleBack = () => {
    navigate("/settings", { state: { from: fromScreen } });
  };

  const handleSave = () => {
    saveSettings();
    toast.success("Schedule saved");
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
        <h1 className="text-5xl md:text-6xl font-serif text-foreground mb-4 tracking-tight">Schedule</h1>

        {/* Analysis Frequency */}
        <div className="space-y-3">
          <Label className="text-sm text-foreground font-sans">Analysis Frequency</Label>
          <div className="grid grid-cols-2 gap-4">
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

export default ScheduleSettings;
