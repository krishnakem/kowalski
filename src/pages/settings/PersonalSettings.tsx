import { useState, useEffect } from "react";
import { MapPin, Loader2 } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { useSettings } from "@/hooks/useSettings";
// import { useFromScreen } from "@/hooks/useFromScreen"; // Unused
import SettingsLayout from "@/components/layouts/SettingsLayout";
import { InstagramConnectModal } from "@/components/modals/InstagramConnectModal";

const PersonalSettings = () => {
  const navigate = useNavigate();
  // const { navigateBack } = useFromScreen();
  const { settings, isLoaded, patchSettings } = useSettings();

  const [editName, setEditName] = useState("");
  const [editLocation, setEditLocation] = useState("");
  const [isDetectingLocation, setIsDetectingLocation] = useState(false);
  const [isLoginOpen, setIsLoginOpen] = useState(false);

  // Sync state when settings are loaded
  useEffect(() => {
    if (isLoaded) {
      console.log("Settings loaded:", { userName: settings.userName, location: settings.location });
      setEditName(settings.userName);
      setEditLocation(settings.location);
    }
  }, [isLoaded, settings.userName, settings.location]);

  const handleSave = () => {
    patchSettings({ userName: editName, location: editLocation });
    toast.success("Personal info saved");
  };

  const handleDetectLocation = async () => {
    setIsDetectingLocation(true);

    try {
      // Use IP-based geolocation for Electron compatibility
      // This doesn't require GPS permissions and works reliably
      const response = await fetch('https://ipapi.co/json/');

      if (!response.ok) {
        throw new Error('Failed to fetch location');
      }

      const data = await response.json();
      const city = data.city;

      if (city) {
        setEditLocation(city);
        toast.success(`Location detected: ${city}`);
      } else {
        toast.error("Couldn't determine your city");
      }
    } catch (error) {
      console.error('Location detection error:', error);
      toast.error("Failed to detect location");
    } finally {
      setIsDetectingLocation(false);
    }
  };

  return (
    <SettingsLayout title="Personal">
      <div className="space-y-8 text-left">
        <div className="space-y-3">
          <Label htmlFor="name" className="text-sm text-foreground font-sans">Name</Label>
          <input
            id="name"
            type="text"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            placeholder="Your name"
            className="input-dotted w-full text-center font-serif text-xl"
          />
        </div>

        <div className="space-y-3">
          <Label htmlFor="location" className="text-sm text-foreground font-sans">Location</Label>
          <div className="flex gap-2 items-end">
            <input
              id="location"
              type="text"
              value={editLocation}
              onChange={(e) => setEditLocation(e.target.value)}
              placeholder="e.g. Cupertino"
              className="input-dotted flex-1 text-center font-serif text-xl"
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={handleDetectLocation}
              disabled={isDetectingLocation}
              title="Detect my location"
              className="mb-1"
            >
              {isDetectingLocation ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <MapPin className="h-4 w-4" />
              )}
            </Button>
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

        {/* Instagram Switch Account */}
        <div className="pt-8 border-t border-border space-y-4">
          <Label className="text-sm text-foreground font-sans">Instagram Account</Label>
          <div className="bg-card p-4 flex items-center justify-between border border-border/50">
            <div className="flex items-center gap-3">
              <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              <span className="font-sans text-sm text-muted-foreground">Session Active</span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={async () => {
                try {
                  await (window as any).api.clearInstagramSession();
                  toast.success("Logged out. Please sign in.");
                  setIsLoginOpen(true); // Open Modal
                } catch (e) {
                  toast.error("Failed to switch account");
                }
              }}
              className="text-xs h-8"
            >
              SWITCH ACCOUNT
            </Button>
          </div>
        </div>

        {/* Debug Tools (Temporary) */}
        <div className="mt-10 pt-4 border-t border-dashed border-border/40">
          <Label className="text-[10px] uppercase tracking-widest text-muted-foreground/70 font-sans mb-3 block">
            Debug Tools (Temporary)
          </Label>
          <Button
            variant="ghost"
            size="sm"
            onClick={async () => {
              try {
                // @ts-ignore
                const result = await window.api.testHeadless();
                toast.info("Test Result: " + result);
              } catch (e) {
                toast.error("Test failed");
              }
            }}
            className="text-xs h-8 text-muted-foreground hover:text-foreground hover:bg-transparent px-0 justify-start"
          >
            ▶ TEST CONNECTION (HEADED)
          </Button>
        </div>

        {/* Login Modal */}
        <InstagramConnectModal
          isOpen={isLoginOpen}
          onClose={() => setIsLoginOpen(false)}
          onSuccess={() => {
            // Session captured.
            // We wait for auto-close (handled by modal prop)
            // But we might want to refresh checking status?
            // The UI says "Session Active" statically right now, which is fine since we just logged in.
          }}
          autoCloseDelay={2500} // 2.5 Seconds wait
        />
      </div>
    </SettingsLayout>
  );
};

export default PersonalSettings;
