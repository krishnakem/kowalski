import { useState, useEffect } from "react";
import { useLocation } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import ZeroStateScreen from "@/components/screens/ZeroStateScreen";
import AgentActiveScreen from "@/components/screens/AgentActiveScreen";
import AnalysisScreen from "@/components/screens/AnalysisScreen";

type Screen = "zero" | "agent" | "gazette";

const Index = () => {
  const location = useLocation();
  const initialScreen = (location.state as { screen?: Screen })?.screen || "zero";
  const [currentScreen, setCurrentScreen] = useState<Screen>(initialScreen);

  useEffect(() => {
    const screenFromState = (location.state as { screen?: Screen })?.screen;
    if (screenFromState) {
      setCurrentScreen(screenFromState);
    }
  }, [location.state]);

  const handleContinue = () => setCurrentScreen("agent");
  const handleAgentComplete = () => setCurrentScreen("gazette");
  const handleClose = () => setCurrentScreen("zero");

  return (
    <div className="min-h-screen bg-background overflow-hidden">
      <AnimatePresence mode="wait">
        {currentScreen === "zero" && (
          <motion.div
            key="zero"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5 }}
          >
            <ZeroStateScreen onContinue={handleContinue} />
          </motion.div>
        )}

        {currentScreen === "agent" && (
          <motion.div
            key="agent"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5 }}
          >
            <AgentActiveScreen onComplete={handleAgentComplete} />
          </motion.div>
        )}

        {currentScreen === "gazette" && (
          <motion.div
            key="gazette"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5 }}
          >
            <AnalysisScreen onClose={handleClose} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default Index;