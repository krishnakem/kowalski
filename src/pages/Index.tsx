import { useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import ZeroStateScreen from "@/components/screens/ZeroStateScreen";
import AgentActiveScreen from "@/components/screens/AgentActiveScreen";
import AnalysisReadyScreen from "@/components/screens/AnalysisReadyScreen";
import LoginScreen from "@/components/screens/LoginScreen";
import { useSettings } from "@/hooks/useSettings";
import { useArchivedAnalyses } from "@/hooks/useArchivedAnalyses";
import { pageTransition } from "@/lib/animations";

// Four-Hub Architecture: zero → login → agent → ready.
// "login" is shown when an onboarded user's Instagram session has expired.
type Screen = "zero" | "login" | "agent" | "ready";

const Index = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { settings, isLoaded, patchSettings } = useSettings();
  const { analyses, isLoaded: archivesLoaded } = useArchivedAnalyses();
  const [currentScreen, setCurrentScreen] = useState<Screen | null>(null);
  const [latestAnalysisId, setLatestAnalysisId] = useState<string | null>(null);

  // Determine initial screen based on user state — check IG session for onboarded users
  useEffect(() => {
    console.log("Index useEffect triggered:", { isLoaded, archivesLoaded, currentScreen, hasOnboarded: settings.hasOnboarded });

    if (!isLoaded || !archivesLoaded) {
      console.log("Waiting for data...");
      return;
    }

    console.log("Screen determination logic running...", { status: settings.analysisStatus });

    if (settings.hasOnboarded) {
      if (settings.analysisStatus === "ready") {
        setCurrentScreen("ready");
        return;
      }

      // Check if the Instagram session is still valid before showing the agent screen.
      // If expired, show the login screen so the user can re-authenticate.
      window.api.checkInstagramSession().then((result: any) => {
        if (result.isActive) {
          setCurrentScreen("agent");
        } else {
          console.log("Instagram session expired, showing login screen. Reason:", result.reason);
          setCurrentScreen("login");
        }
      }).catch(() => {
        // If the check fails, optimistically show agent — the run will detect
        // SESSION_EXPIRED and the user can re-login then.
        setCurrentScreen("agent");
      });
      return;
    }

    setCurrentScreen("zero");

  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded, archivesLoaded, settings.hasOnboarded, settings.analysisStatus]);




  const handleContinue = () => {
    patchSettings({ hasOnboarded: true, analysisStatus: "idle" });
    // Go directly to the screencast login screen — at onboarding time there's
    // never a session, so there's no point checking first.
    setCurrentScreen("login");
  };

  const handleLoginSuccess = () => {
    console.log("Login success — transitioning to agent screen");
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

        {currentScreen === "login" && (
          <motion.div
            key="login"
            initial={pageTransition.initial}
            animate={pageTransition.animate}
            exit={pageTransition.exit}
          >
            <LoginScreen onLoginSuccess={handleLoginSuccess} />
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
