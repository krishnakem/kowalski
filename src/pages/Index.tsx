import { useState, useEffect } from "react";
import { useLocation } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import ZeroStateScreen from "@/components/screens/ZeroStateScreen";
import AgentActiveScreen from "@/components/screens/AgentActiveScreen";
import GazetteScreen from "@/components/screens/GazetteScreen";
import AnalysisReadyScreen from "@/components/screens/AnalysisReadyScreen";
import { useSettings } from "@/hooks/useSettings";

type Screen = "zero" | "agent" | "ready" | "gazette";

const Index = () => {
  const location = useLocation();
  const { settings, isLoaded, patchSettings } = useSettings();
  const [currentScreen, setCurrentScreen] = useState<Screen | null>(null);
  const [waitingForNextAnalysis, setWaitingForNextAnalysis] = useState(false);

  // Determine initial screen based on user state
  useEffect(() => {
    if (!isLoaded) return;

    const screenFromState = (location.state as { screen?: Screen })?.screen;

    // Only honor navigation-driven screen overrides for users who have onboarded.
    // This prevents stale history state from forcing "gazette/agent/ready" after a dev reset.
    if (screenFromState && (settings.hasOnboarded || screenFromState === "zero")) {
      setCurrentScreen(screenFromState);
      return;
    }

    // Determine screen based on settings
    if (!settings.hasOnboarded) {
      setCurrentScreen("zero");
    } else {
      switch (settings.analysisStatus) {
        case "working":
          setCurrentScreen("agent");
          break;
        case "ready":
          setCurrentScreen("ready");
          break;
        default:
          // idle - show zero state (waiting for next scheduled analysis)
          setCurrentScreen("zero");
      }
    }
  }, [isLoaded, location.state, settings.hasOnboarded, settings.analysisStatus]);

  const handleContinue = () => {
    patchSettings({ hasOnboarded: true, analysisStatus: "working" });
    setWaitingForNextAnalysis(false);
    setCurrentScreen("agent");
  };

  const handleAgentComplete = () => {
    patchSettings({ 
      analysisStatus: "ready", 
      lastAnalysisDate: new Date().toISOString() 
    });
    setCurrentScreen("ready");
  };

  const handleViewAnalysis = () => {
    setCurrentScreen("gazette");
  };

  const handleClose = () => {
    // User closed gazette - wait for next scheduled analysis
    patchSettings({ analysisStatus: "working" });
    setWaitingForNextAnalysis(true);
    setCurrentScreen("agent");
  };

  // Show nothing until we determine the screen
  if (!currentScreen) {
    return <div className="min-h-screen bg-background" />;
  }

  return (
    <div className="min-h-screen bg-background overflow-hidden">
      <AnimatePresence mode="wait">
        {currentScreen === "zero" && (
          <motion.div
            key="zero"
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5 }}
          >
            <ZeroStateScreen onContinue={handleContinue} />
          </motion.div>
        )}

        {currentScreen === "agent" && (
          <motion.div
            key="agent"
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5 }}
          >
            <AgentActiveScreen 
              onComplete={handleAgentComplete} 
              autoComplete={!waitingForNextAnalysis}
            />
          </motion.div>
        )}

        {currentScreen === "ready" && (
          <motion.div
            key="ready"
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5 }}
          >
            <AnalysisReadyScreen 
              onViewAnalysis={handleViewAnalysis}
              lastAnalysisDate={settings.lastAnalysisDate}
            />
          </motion.div>
        )}

        {currentScreen === "gazette" && (
          <motion.div
            key="gazette"
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5 }}
          >
            <GazetteScreen onClose={handleClose} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default Index;
