import { motion } from "framer-motion";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { PixelSun, PixelMoon } from "@/components/icons/PixelIcons";
import { useSettings } from "@/hooks/useSettings";
import { useFromScreen } from "@/hooks/useFromScreen";
import { TIME_OPTIONS, MORNING_TIME_OPTIONS, EVENING_TIME_OPTIONS } from "@/lib/constants";
import SettingsLayout from "@/components/layouts/SettingsLayout";
import { spring } from "@/lib/animations";

const ScheduleSettings = () => {
  const { navigateBack } = useFromScreen();
  const { settings, setSettings, saveSettings } = useSettings();

  const handleSave = () => {
    saveSettings();
    toast.success("Schedule saved");
    navigateBack("/settings");
  };

  return (
    <SettingsLayout title="Schedule">
      {/* Analysis Frequency */}
      <div className="space-y-3">
        <Label className="text-sm text-foreground font-sans">Analysis Frequency</Label>
        <div className="grid grid-cols-2 gap-4">
          <motion.button
            whileHover={{ y: -3, boxShadow: "0 8px 20px rgba(0,0,0,0.1)" }}
            whileTap={{ scale: 0.98 }}
            transition={spring.snappy}
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
            whileHover={{ y: -3, boxShadow: "0 8px 20px rgba(0,0,0,0.1)" }}
            whileTap={{ scale: 0.98 }}
            transition={spring.snappy}
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
          {(settings.digestFrequency === 2 ? MORNING_TIME_OPTIONS : TIME_OPTIONS).map((time) => (
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
            {EVENING_TIME_OPTIONS.map((time) => (
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
    </SettingsLayout>
  );
};

export default ScheduleSettings;
