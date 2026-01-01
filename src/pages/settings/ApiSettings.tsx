import { useState } from "react";
import { Eye, EyeOff, Loader2, Lock, Unlock, AlertTriangle } from "lucide-react";
import { motion } from "framer-motion";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { useSettings } from "@/hooks/useSettings";
import { useFromScreen } from "@/hooks/useFromScreen";
import SettingsLayout from "@/components/layouts/SettingsLayout";

const ApiSettings = () => {
  const { navigateBack } = useFromScreen();
  const { settings, setSettings, saveSettings, keyStatus } = useSettings();
  const [showApiKey, setShowApiKey] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [keyError, setKeyError] = useState<string | null>(null);
  const [keyChanged, setKeyChanged] = useState(false); // Track if API key was edited

  const handleSave = async () => {
    const apiKeyToSave = (settings.apiKey || "").trim();

    // Only validate if the user actually changed the API key
    if (keyChanged) {
      // Require a non-empty API key if user is trying to update it
      if (!apiKeyToSave) {
        setKeyError('Please enter an API key.');
        return;
      }

      // Validate the API key
      setIsValidating(true);
      setKeyError(null);

      try {
        const response = await fetch('https://api.openai.com/v1/models', {
          headers: { 'Authorization': `Bearer ${apiKeyToSave}` }
        });

        // Any non-OK response means invalid key
        if (!response.ok) {
          setKeyError('Invalid API key. Please check and try again.');
          setIsValidating(false);
          return;
        }
      } catch (error) {
        // Network error - could be connection or CORS issue
        console.error('API validation error:', error);
        setKeyError('Invalid API key. Please check and try again.');
        setIsValidating(false);
        return;
      }

      setIsValidating(false);
    }

    // Save settings (apiKey will be included only if changed, or pass current)
    saveSettings({ ...settings, apiKey: keyChanged ? apiKeyToSave : settings.apiKey });
    toast.success("API Settings Saved");
    setKeyChanged(false); // Reset after save
  };

  return (
    <SettingsLayout title="API & Usage">
      {/* API Key */}
      <div className="space-y-3">
        <Label className="text-sm text-foreground font-sans">OpenAI API Key</Label>
        <div className="relative">
          <input
            key={showApiKey ? "text" : "password"} // Force re-render to ensure type switch works
            type={showApiKey ? "text" : "password"}
            value={settings.apiKey}
            onChange={(e) => {
              setSettings({ ...settings, apiKey: e.target.value });
              setKeyError(null);
              setKeyChanged(true); // Mark that the key was edited
            }}
            placeholder="sk-..."
            autoComplete="off"
            autoCorrect="off"
            spellCheck="false"
            className={`w-full input-dotted text-foreground placeholder:text-foreground/30 text-left
                       font-sans text-lg tracking-wider pr-12 py-4 ${keyError ? 'border-destructive' : ''}`}
          />
          <div
            onClick={async (e) => {
              e.preventDefault();
              e.stopPropagation();

              if (!showApiKey) {
                // About to show key. If it's a placeholder, fetch the real one.
                const isPlaceholder = settings.apiKey === '••••••••••••••••';
                if (isPlaceholder || (keyStatus === 'secured' && !keyChanged)) {
                  try {
                    const realKey = await window.api.settings.getSecureKey();
                    if (realKey) {
                      setSettings(prev => ({ ...prev, apiKey: realKey }));
                    }
                  } catch (err: any) {
                    console.error("Unmask error:", err);
                    toast.error(`Error: ${err.message || "Failed to unmask"}`);
                  }
                }
              }

              setShowApiKey(prev => !prev);
            }}
            className="absolute right-0 top-1/2 -translate-y-1/2 p-3 text-muted-foreground transition-colors z-50 cursor-pointer hover:text-foreground"
          >
            {showApiKey ? <EyeOff size={20} /> : <Eye size={20} />}
          </div>
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
    </SettingsLayout>
  );
};

export default ApiSettings;
