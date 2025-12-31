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

  const handleSave = async () => {
    const apiKeyToSave = (settings.apiKey || "").trim();

    // If there's an API key, validate it first (same as onboarding)
    if (apiKeyToSave) {
      setIsValidating(true);
      setKeyError(null);

      try {
        const response = await fetch('https://api.openai.com/v1/models', {
          headers: { 'Authorization': `Bearer ${apiKeyToSave}` }
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

    // Valid key (or empty) - save and proceed
    saveSettings({ ...settings, apiKey: apiKeyToSave });
    toast.success("API settings saved");
    navigateBack("/settings");
  };

  return (
    <SettingsLayout title="API & Usage">
      {/* API Key */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label className="text-sm text-foreground font-sans">OpenAI API Key</Label>
          {keyStatus === 'secured' && (
            <div className="flex items-center gap-1.5 text-xs text-green-600 font-sans font-medium">
              <Lock size={12} />
              <span>Encrypted on Disk</span>
            </div>
          )}
          {keyStatus === 'missing' && (
            <div className="flex items-center gap-1.5 text-xs text-amber-600 font-sans font-medium">
              <AlertTriangle size={12} />
              <span>Not Configured</span>
            </div>
          )}
          {keyStatus === 'locked' && (
            <div className="flex items-center gap-1.5 text-xs text-destructive font-sans font-medium">
              <Unlock size={12} />
              <span>Keychain Locked</span>
            </div>
          )}
        </div>
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
