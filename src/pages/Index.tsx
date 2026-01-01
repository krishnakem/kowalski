import { useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import ZeroStateScreen from "@/components/screens/ZeroStateScreen";
import AgentActiveScreen from "@/components/screens/AgentActiveScreen";
import AnalysisReadyScreen from "@/components/screens/AnalysisReadyScreen";
import { useSettings } from "@/hooks/useSettings";
import { useArchivedAnalyses } from "@/hooks/useArchivedAnalyses";
import { pageTransition } from "@/lib/animations";

// Three-Hub Architecture: Index manages only zero, agent, ready.
// The "gazette" view is now a route under /archive/:id
type Screen = "zero" | "agent" | "ready";

const Index = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { settings, isLoaded, patchSettings } = useSettings();
  const { analyses, isLoaded: archivesLoaded } = useArchivedAnalyses();
  const [currentScreen, setCurrentScreen] = useState<Screen | null>(null);
  const [latestAnalysisId, setLatestAnalysisId] = useState<string | null>(null);

  // Determine initial screen based on user state - only runs once on initial load
  useEffect(() => {
    console.log("Index useEffect triggered:", { isLoaded, archivesLoaded, currentScreen, hasOnboarded: settings.hasOnboarded });

    // Wait for both settings and archives to load before making decisions
    if (!isLoaded || !archivesLoaded || currentScreen !== null) {
      console.log("Waiting for data or screen already set...");
      return;
    }

    console.log("Screen determination logic running...", { status: settings.analysisStatus });

    // STRICT GATE: If user has onboarded, NEVER show zero state unless settings were wiped.
    if (settings.hasOnboarded) {
      if (settings.analysisStatus === "ready") {
        setCurrentScreen("ready");
      } else {
        setCurrentScreen("agent");
      }
      return;
    }

    // If NOT onboarded, default to zero
    setCurrentScreen("zero");

  }, [isLoaded, archivesLoaded, currentScreen, settings.hasOnboarded, settings.analysisStatus]);

  // Listen for Background Analysis Generation (Silent Update -> UI Update)
  useEffect(() => {
    const unsubscribe = window.api.settings.onAnalysisReady((newAnalysis: any) => {
      console.log("🔔 Incoming Analysis (Background):", newAnalysis.id);

      // GUARD: Ignore if user hasn't completed onboarding
      if (!settings.hasOnboarded) {
        console.log("⚠️ Ignoring analysis-ready event: User not onboarded yet.");
        return;
      }

      // Capture the ID for direct navigation (fixes deep link bug)
      if (newAnalysis.id) {
        setLatestAnalysisId(newAnalysis.id);
      }

      // Update Global Settings
      patchSettings({
        analysisStatus: 'ready',
        lastAnalysisDate: new Date().toISOString()
      });

      // Update Local State (Immediate transition if app is open)
      setCurrentScreen("ready");
    });

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [patchSettings, settings.hasOnboarded]);


  const handleContinue = () => {
    patchSettings({ hasOnboarded: true, analysisStatus: "idle" });
    setCurrentScreen("agent");
  };

  // AgentActiveScreen's onComplete is no longer used for demo mode.
  // It can remain for legacy/testing or be removed entirely.
  const handleAgentComplete = () => {
    // No-op for now - Scheduler handles real generation
    console.log("Agent complete (no-op in production)");
  };

  const handleViewAnalysis = () => {
    // Navigate to the latest analysis in the Archive hub
    // Prioritize the ID received from the background event (latestAnalysisId)
    // as hooks might be stale immediately after generation.
    const targetId = latestAnalysisId || (analyses.length > 0 ? analyses[0].id : null);

    if (targetId) {
      patchSettings({ analysisStatus: "idle" });
      navigate(`/archive/${targetId}`);
    } else {
      // Fallback: go to archive list
      navigate("/archive");
    }
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
      </AnimatePresence>
    </div>
  );
};

export default Index;
