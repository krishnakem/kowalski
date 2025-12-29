import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { ArrowLeft, MapPin, Loader2 } from "lucide-react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { PixelSun, PixelMoon, PixelKey, PixelLightbulb, PixelUser } from "@/components/icons/PixelIcons";
import { useSettings } from "@/hooks/useSettings";
import { ease, duration, spring, stagger } from "@/lib/animations";

const Settings = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const fromScreen = (location.state as { from?: string })?.from || "agent";
  const { settings, patchSettings, resetSettings, isLoaded } = useSettings();
  
  const [isPersonalOpen, setIsPersonalOpen] = useState(false);
  const [editName, setEditName] = useState(settings.userName);
  const [editLocation, setEditLocation] = useState(settings.location);
  const [isDetectingLocation, setIsDetectingLocation] = useState(false);

  const handleDevReset = () => {
    resetSettings();
    navigate("/onboarding", { replace: true, state: {} });
  };

  const handleBack = () => {
    navigate("/", { state: { screen: fromScreen } });
  };

  const handlePersonalSave = () => {
    patchSettings({ userName: editName, location: editLocation });
    setIsPersonalOpen(false);
    toast.success("Personal info updated");
  };

  const openPersonalDialog = () => {
    setEditName(settings.userName);
    setEditLocation(settings.location);
    setIsPersonalOpen(true);
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
          
          // Try to get city, town, or village name
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

  if (!isLoaded) {
    return <div className="min-h-screen bg-background" />;
  }

  const getPersonalSummary = () => {
    if (settings.userName && settings.location) {
      return `${settings.userName} · ${settings.location}`;
    }
    if (settings.userName) return settings.userName;
    if (settings.location) return settings.location;
    return "Not set";
  };

  const getScheduleSummary = () => {
    if (settings.digestFrequency === 1) {
      return `Once daily at ${settings.morningTime}`;
    }
    return `Twice daily`;
  };

  const getApiSummary = () => {
    if (settings.apiKey) {
      return `$${settings.usageCap} cap`;
    }
    return "No API key set";
  };

  const getInterestsSummary = () => {
    const count = settings.interests.length;
    if (count === 0) return "No topics";
    if (count === 1) return "1 topic";
    return `${count} topics`;
  };

  const cards = [
    {
      title: "Personal",
      summary: getPersonalSummary(),
      icon: <PixelUser size={40} color="charcoal" />,
      onClick: openPersonalDialog,
    },
    {
      title: "Schedule",
      summary: getScheduleSummary(),
      icon: settings.digestFrequency === 1 ? (
        <PixelSun size={40} color="charcoal" />
      ) : (
        <div className="flex items-center gap-1">
          <PixelSun size={32} color="charcoal" />
          <PixelMoon size={32} color="charcoal" />
        </div>
      ),
      path: "/settings/schedule",
    },
    {
      title: "API & Usage",
      summary: getApiSummary(),
      icon: <PixelKey size={40} color="charcoal" />,
      path: "/settings/api",
    },
    {
      title: "Interests",
      summary: getInterestsSummary(),
      icon: <PixelLightbulb size={40} color="charcoal" />,
      path: "/settings/interests",
    },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground py-16 px-6 relative">
      <motion.div
        initial={{ opacity: 0, x: -10 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: duration.normal, ease: ease.cinematic }}
      >
        <Button
          variant="ghost"
          size="icon"
          onClick={handleBack}
          className="absolute top-6 left-6 text-muted-foreground hover:bg-transparent opacity-60 hover:opacity-100 transition-opacity h-14 w-14"
        >
          <ArrowLeft className="w-6 h-6" />
        </Button>
      </motion.div>

      <div className="max-w-md mx-auto space-y-8 text-center">
        <motion.h1 
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: duration.slow, ease: ease.cinematic }}
          className="text-5xl md:text-6xl font-serif text-foreground mb-4 tracking-tight"
        >
          Preferences
        </motion.h1>

        {/* Cards Grid */}
        <motion.div 
          className="grid grid-cols-2 gap-4"
          initial="hidden"
          animate="visible"
          variants={{
            hidden: { opacity: 0 },
            visible: {
              opacity: 1,
              transition: {
                staggerChildren: stagger.fast,
                delayChildren: 0.15,
              }
            }
          }}
        >
          {cards.map((card, index) => (
            <motion.button
              key={card.title}
              variants={{
                hidden: { opacity: 0, y: 15, scale: 0.98 },
                visible: { 
                  opacity: 1, 
                  y: 0, 
                  scale: 1,
                  transition: spring.gentle,
                }
              }}
              whileHover={{ y: -4, boxShadow: "0 8px 24px rgba(0,0,0,0.1)" }}
              whileTap={{ scale: 0.98 }}
              onClick={() => card.onClick ? card.onClick() : navigate(card.path!, { state: { from: fromScreen } })}
              className="aspect-square border-2 p-6 flex flex-col items-center justify-center gap-3
                         transition-colors duration-200 bg-card border-foreground/20 hover:border-foreground cursor-pointer"
            >
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ ...spring.bouncy, delay: 0.25 + index * stagger.fast }}
              >
                {card.icon}
              </motion.div>
              <span className="font-sans text-foreground text-base">{card.title}</span>
              <span className="font-sans text-muted-foreground text-sm">{card.summary}</span>
            </motion.button>
          ))}
        </motion.div>

        {/* Dev Reset Button */}
        <button
          onClick={handleDevReset}
          className="text-xs text-muted-foreground/50 hover:text-muted-foreground underline mt-8"
        >
          Reset (dev only)
        </button>
      </div>

      {/* Personal Info Dialog */}
      <Dialog open={isPersonalOpen} onOpenChange={setIsPersonalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-serif text-2xl">Personal Info</DialogTitle>
          </DialogHeader>
          <div className="space-y-6 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="Your name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="location">Location</Label>
              <div className="flex gap-2">
                <Input
                  id="location"
                  value={editLocation}
                  onChange={(e) => setEditLocation(e.target.value)}
                  placeholder="e.g. Cupertino"
                  className="flex-1"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={handleDetectLocation}
                  disabled={isDetectingLocation}
                  title="Detect my location"
                >
                  {isDetectingLocation ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <MapPin className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>
            <Button onClick={handlePersonalSave} className="w-full">
              Save
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Settings;
