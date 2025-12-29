import { useState, useEffect } from "react";
import { MapPin, Loader2 } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useSettings } from "@/hooks/useSettings";
import { useFromScreen } from "@/hooks/useFromScreen";
import SettingsLayout from "@/components/layouts/SettingsLayout";

const PersonalSettings = () => {
  const { navigateBack } = useFromScreen();
  const { settings, isLoaded, patchSettings } = useSettings();
  
  const [editName, setEditName] = useState("");
  const [editLocation, setEditLocation] = useState("");
  const [isDetectingLocation, setIsDetectingLocation] = useState(false);

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
    navigateBack("/settings");
  };

  const handleDetectLocation = async () => {
    if (!navigator.geolocation) {
      toast.error("Geolocation is not supported by your browser");
      return;
    }

    setIsDetectingLocation(true);

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const { latitude, longitude } = position.coords;
          const response = await fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json`
          );
          const data = await response.json();
          
          const city = data.address?.city || 
                       data.address?.town || 
                       data.address?.village || 
                       data.address?.municipality ||
                       data.address?.county;
          
          if (city) {
            setEditLocation(city);
            toast.success(`Location detected: ${city}`);
          } else {
            toast.error("Couldn't determine your city");
          }
        } catch (error) {
          toast.error("Failed to detect location");
        } finally {
          setIsDetectingLocation(false);
        }
      },
      (error) => {
        setIsDetectingLocation(false);
        switch (error.code) {
          case error.PERMISSION_DENIED:
            toast.error("Location access denied");
            break;
          case error.POSITION_UNAVAILABLE:
            toast.error("Location unavailable");
            break;
          case error.TIMEOUT:
            toast.error("Location request timed out");
            break;
          default:
            toast.error("Failed to get location");
        }
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 }
    );
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
      </div>
    </SettingsLayout>
  );
};

export default PersonalSettings;
