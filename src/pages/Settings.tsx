import { useNavigate, useLocation } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { PixelSun, PixelMoon, PixelKey, PixelLightbulb } from "@/components/icons/PixelIcons";
import { useSettings } from "@/hooks/useSettings";

const Settings = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const fromScreen = (location.state as { from?: string })?.from || "agent";
  const { settings, isLoaded } = useSettings();

  const handleBack = () => {
    navigate("/", { state: { screen: fromScreen } });
  };

  if (!isLoaded) {
    return <div className="min-h-screen bg-background" />;
  }


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
      <Button
        variant="ghost"
        size="icon"
        onClick={handleBack}
        className="absolute top-6 left-6 text-muted-foreground hover:bg-transparent opacity-60 hover:opacity-100 transition-opacity h-14 w-14"
      >
        <ArrowLeft className="w-6 h-6" />
      </Button>

      <div className="max-w-md mx-auto space-y-8 text-center">
        <h1 className="text-5xl md:text-6xl font-serif text-foreground mb-4 tracking-tight">Preferences</h1>

        {/* Cards Grid */}
        <motion.div 
          className="grid grid-cols-2 gap-4"
          initial="hidden"
          animate="visible"
          variants={{
            hidden: {},
            visible: {
              transition: {
                staggerChildren: 0.08,
                delayChildren: 0.1,
              }
            }
          }}
        >
          {cards.map((card, index) => (
            <motion.button
              key={card.title}
              variants={{
                hidden: { opacity: 0, y: 12, scale: 0.98 },
                visible: { 
                  opacity: 1, 
                  y: 0, 
                  scale: 1,
                  transition: {
                    type: "spring",
                    stiffness: 400,
                    damping: 25,
                  }
                }
              }}
              whileHover={{ y: -3, boxShadow: "0 6px 16px rgba(0,0,0,0.08)" }}
              whileTap={{ scale: 0.98 }}
              onClick={() => navigate(card.path, { state: { from: fromScreen } })}
              className={`aspect-square border-2 p-6 flex flex-col items-center justify-center gap-3
                         transition-colors duration-200 bg-card border-foreground/20 hover:border-foreground cursor-pointer
                         ${index === 2 ? "col-span-2 !aspect-auto py-8" : ""}`}
            >
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.2 + index * 0.08, type: "spring", stiffness: 300 }}
              >
                {card.icon}
              </motion.div>
              <span className="font-sans text-foreground text-base">{card.title}</span>
              <span className="font-sans text-muted-foreground text-sm">{card.summary}</span>
            </motion.button>
          ))}
        </motion.div>

      </div>
    </div>
  );
};

export default Settings;
