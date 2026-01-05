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
      // LOGIC UPDATE: 'ready' status implies "Unviewed Analysis Available".
      // It does NOT matter if it's from today or yesterday. 
      // If the user hasn't viewed it, show it.
      // Once viewed (in handleViewAnalysis), status becomes 'idle', and we show Agent.
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

  const handleViewAnalysis = async () => {
    // Force-fetch the latest list from the store to avoid stale React state
    try {
      const freshAnalyses = await window.api.analyses.get();
      // Sort by date manually to be absolutely sure (newest first)
      const latest = freshAnalyses.sort((a: any, b: any) =>
        new Date(b.data.date).getTime() - new Date(a.data.date).getTime()
      )[0];

      if (latest && latest.id) {
        console.log("Viewing Latest Analysis (Direct Fetch):", latest.id);
        patchSettings({ analysisStatus: "idle" });
        navigate(`/archive/${latest.id}`);
      } else {
        console.warn("No analyses found in store. Going to archive root.");
        navigate("/archive");
      }
    } catch (e) {
      console.error("Failed to fetch latest analysis for navigation:", e);
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
