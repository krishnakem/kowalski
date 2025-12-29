import { useState } from "react";
import { motion } from "framer-motion";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { useSettings } from "@/hooks/useSettings";
import { useFromScreen } from "@/hooks/useFromScreen";
import { WORD_POSITIONS } from "@/lib/constants";
import SettingsLayout from "@/components/layouts/SettingsLayout";
import { spring } from "@/lib/animations";

const InterestsSettings = () => {
  const { navigateBack } = useFromScreen();
  const { settings, setSettings, saveSettings, isLoaded } = useSettings();
  const [interestInput, setInterestInput] = useState("");

  if (!isLoaded) {
    return (
      <SettingsLayout title="Interests">
        <div className="flex items-center justify-center h-48">
          <p className="text-muted-foreground font-sans text-sm">Loading...</p>
        </div>
      </SettingsLayout>
    );
  }

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
    saveSettings();
    toast.success("Interests saved");
    navigateBack("/settings");
  };

  return (
    <SettingsLayout title="Interests">
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
                transition={spring.gentle}
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
    </SettingsLayout>
  );
};

export default InterestsSettings;
