import { useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import ZeroStateScreen from "@/components/screens/ZeroStateScreen";
import AgentActiveScreen from "@/components/screens/AgentActiveScreen";
import GazetteScreen from "@/components/screens/GazetteScreen";
import AnalysisReadyScreen from "@/components/screens/AnalysisReadyScreen";
import { useSettings } from "@/hooks/useSettings";
import { useArchivedAnalyses } from "@/hooks/useArchivedAnalyses";
import { pageTransition } from "@/lib/animations";
import type { AnalysisObject } from "@/types/analysis";
import { generateScheduledDemoAnalyses } from "@/lib/generateDemoAnalyses";

type Screen = "zero" | "agent" | "ready" | "gazette";

const Index = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { settings, isLoaded, patchSettings } = useSettings();
  const { addAnalysis, analyses, isLoaded: archivesLoaded } = useArchivedAnalyses();
  const [currentScreen, setCurrentScreen] = useState<Screen | null>(null);
  const [currentAnalysis, setCurrentAnalysis] = useState<AnalysisObject | null>(null);

  // Determine initial screen based on user state - only runs once on initial load
  useEffect(() => {
    console.log("Index useEffect triggered:", { isLoaded, archivesLoaded, currentScreen, hasOnboarded: settings.hasOnboarded });

    // Wait for both settings and archives to load before making decisions
    if (!isLoaded || !archivesLoaded || currentScreen !== null) {
      console.log("Waiting for data or screen already set...");
      return;
    }

    const screenFromState = (location.state as { screen?: Screen })?.screen;
    console.log("Screen determination logic running...", { screenFromState, status: settings.analysisStatus });

    // Helper to recover analysis if missing
    const recoverAnalysis = () => {
      if (!currentAnalysis && analyses.length > 0) {
        // Analyses are sorted new->old by hook, so take first
        setCurrentAnalysis(analyses[0].data);
      }
    };

    // STRICT GATE: If user has onboarded, NEVER show zero state unless settings were wiped.
    // We ignore navigation overrides that try to force "zero" if we are already onboarded.
    if (settings.hasOnboarded) {
      // If we are onboarded, we default to agent or ready, regardless of what state says regarding 'zero'.
      // If state requests 'gazette', we honor it.
      if (screenFromState === "gazette") {
        recoverAnalysis();
        setCurrentScreen("gazette");
      } else if (settings.analysisStatus === "ready") {
        recoverAnalysis();
        setCurrentScreen("ready");
      } else {
        setCurrentScreen("agent");
      }
      return;
    }

    // If NOT onboarded, honor state or default to zero
    if (screenFromState === "zero") {
      setCurrentScreen("zero");
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
          recoverAnalysis();
          setCurrentScreen("ready");
          break;
        default:
          setCurrentScreen("zero");
      }
    }
  }, [isLoaded, archivesLoaded, currentScreen, location.state, settings.hasOnboarded, settings.analysisStatus, analyses, currentAnalysis]);

  const handleContinue = () => {
    patchSettings({ hasOnboarded: true, analysisStatus: "working" });
    setCurrentScreen("agent");
  };

  const handleAgentComplete = () => {
    // Generate a new analysis when agent completes
    // For now, we generate a demo analysis on the fly
    const demoAnalyses = generateScheduledDemoAnalyses(settings, 1);
    const newAnalysis: AnalysisObject = demoAnalyses[0];

    // Save to archive
    addAnalysis(newAnalysis);
    setCurrentAnalysis(newAnalysis);

    patchSettings({
      analysisStatus: "ready",
      lastAnalysisDate: new Date().toISOString()
    });
    setCurrentScreen("ready");
  };

  const handleViewAnalysis = () => {
    // Push new history state so "Back" from Settings returns here
    navigate(".", { state: { screen: "gazette" } });
    setCurrentScreen("gazette");
  };

  const handleClose = () => {
    // User closed gazette - show agent screen
    patchSettings({ analysisStatus: "working" });
    // Go back in history if we pushed "gazette", or replace state
    navigate(".", { replace: true, state: { screen: "agent" } });
  };

  // Show nothing until we determine the screen
  if (!currentScreen) {
    console.log("Render: Returning null (loading)...");
    return <div className="min-h-screen bg-background" />;
  }

  console.log("Render: Rendering screen:", currentScreen);

  return (
    <div className="min-h-screen bg-background overflow-hidden">
      <AnimatePresence mode="wait">
        {currentScreen === "zero" && (
          <motion.div
            key="zero"
            initial={pageTransition.initial}
            animate={pageTransition.animate}
            exit={pageTransition.exit}
          >
            <ZeroStateScreen onContinue={handleContinue} />
          </motion.div>
        )}

        {currentScreen === "agent" && (
          <motion.div
            key="agent"
            initial={pageTransition.initial}
            animate={pageTransition.animate}
            exit={pageTransition.exit}
          >
            <AgentActiveScreen onComplete={handleAgentComplete} />
          </motion.div>
        )}

        {currentScreen === "ready" && (
          <motion.div
            key="ready"
            initial={pageTransition.initial}
            animate={pageTransition.animate}
            exit={pageTransition.exit}
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
            initial={pageTransition.initial}
            animate={pageTransition.animate}
            exit={pageTransition.exit}
          >
            <GazetteScreen
              onClose={handleClose}
              analysisData={currentAnalysis!}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default Index;
