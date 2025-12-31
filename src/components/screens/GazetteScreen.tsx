import { useRef, useMemo, useCallback, memo } from "react";
import { useNavigate } from "react-router-dom";
import { motion, useScroll, useTransform } from "framer-motion";
import { Settings, ArrowLeft, Archive } from "lucide-react";
import { PixelPin, PixelClose, WavingPenguin } from "../icons/PixelIcons";
import { Button } from "@/components/ui/button";
import { useSettings } from "@/hooks/useSettings";
import { useArchivedAnalyses } from "@/hooks/useArchivedAnalyses";
import { ease, duration, spring, stagger } from "@/lib/animations";
import type { AnalysisObject } from "@/types/analysis";
import { AnalysisRenderer } from "@/components/gazette/AnalysisRenderer";
// import { sampleAnalysis } from "@/mocks/sampleAnalysis";

interface GazetteScreenProps {
  onClose: () => void;
  analysisData: AnalysisObject;
  isArchived?: boolean;
}

// Animation transitions defined outside component
const buttonEntranceTransition = { delay: 0.3, duration: duration.slow, ease: ease.cinematic };
const articleEntranceTransition = { duration: duration.slower, ease: ease.cinematic };
const headerTransition = { delay: 0.15, duration: duration.slow, ease: ease.cinematic };
const dividerTransition = { duration: duration.slow, ease: ease.cinematic };
const sectionTransition = { duration: duration.slow, ease: ease.cinematic };

const GazetteScreen = memo(({ onClose, analysisData, isArchived = false }: GazetteScreenProps) => {
  const navigate = useNavigate();
  const { settings, patchSettings } = useSettings();
  const { hasPastAnalyses, isLoaded: archivesLoaded } = useArchivedAnalyses();
  const hasArchivedAnalyses = archivesLoaded && hasPastAnalyses;
  const containerRef = useRef<HTMLDivElement>(null);

  // Parallax scroll effects
  const { scrollY } = useScroll();
  const headerY = useTransform(scrollY, [0, 300], [0, 50]);
  const headerOpacity = useTransform(scrollY, [0, 200], [1, 0.3]);
  const headerScale = useTransform(scrollY, [0, 300], [1, 0.95]);

  const handleClose = useCallback(() => {
    patchSettings({ analysisStatus: "idle" });
    onClose();
  }, [patchSettings, onClose]);

  const handleNavigateToArchive = useCallback(() => {
    navigate("/archive", { state: { from: "gazette" } });
  }, [navigate]);

  const handleNavigateToSettings = useCallback(() => {
    navigate("/settings", { state: { from: "gazette" } });
  }, [navigate]);



  // Hydrate date if it's a string
  const date = analysisData ? (analysisData.date instanceof Date ? analysisData.date : new Date(analysisData.date)) : new Date();

  // Memoize expensive string operations
  const { dayName, monthDay } = useMemo(() => ({
    dayName: date.toLocaleDateString("en-US", { weekday: "long" }),
    monthDay: date.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
  }), [date]);

  // Prefer data provided in analysis, fallback to settings
  const location = analysisData?.location || settings.location || "Cupertino";
  const displayTitle = analysisData?.title || (settings.userName?.trim() ? `${settings.userName.trim()}'s Analysis` : `The ${dayName} Analysis`);
  const displaySubtitle = analysisData?.subtitle || null;

  // Get first letter for drop cap - memoized


  return (
    <div className="min-h-screen flex flex-col items-center py-16 px-6 bg-background relative">

      {/* Back Button (for archived view) OR Archive Button (for live view, only if archives exist) */}
      {(isArchived || hasArchivedAnalyses) && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={buttonEntranceTransition}
          className="absolute top-6 left-6"
        >
          {isArchived ? (
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="text-muted-foreground hover:bg-transparent opacity-60 hover:opacity-100 transition-opacity h-14 w-14"
            >
              <ArrowLeft className="w-6 h-6" />
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="icon"
              onClick={handleNavigateToArchive}
              className="text-muted-foreground hover:bg-transparent opacity-60 hover:opacity-100 transition-opacity h-14 w-14"
            >
              <Archive className="w-8 h-8" />
            </Button>
          )}
        </motion.div>
      )}

      {/* Settings Button */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={buttonEntranceTransition}
        className="absolute top-6 right-6"
      >
        <Button
          variant="ghost"
          size="icon"
          onClick={handleNavigateToSettings}
          className="text-muted-foreground hover:bg-transparent opacity-60 hover:opacity-100 transition-opacity h-14 w-14"
        >
          <Settings className="w-8 h-8" />
        </Button>
      </motion.div>

      <motion.article
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={articleEntranceTransition}
        className="max-w-[650px] w-full"
      >
        {/* Masthead with Parallax */}
        <motion.header
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={headerTransition}
          style={{
            y: headerY,
            opacity: headerOpacity,
            scale: headerScale,
            // willChange: "transform, opacity" // REMOVED: Causes fuzzy text on high-DPI
          }}
          className="text-center mb-12"
        >
          <h1 className="text-5xl md:text-6xl font-serif text-foreground mb-4 tracking-tight">
            {displayTitle}
          </h1>
          <div className="flex items-center justify-center gap-3 text-muted-foreground text-sm font-serif italic mb-6">
            <PixelPin size={14} />
            <span>{monthDay} · {settings.morningTime || "8:00 AM"} · {location}</span>
          </div>
          <div className="divider max-w-[120px] mx-auto opacity-60" />
        </motion.header>

        {/* Render Analysis Content */}
        <AnalysisRenderer data={analysisData} />

        {/* Footer - All Caught Up */}
        <motion.footer
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={sectionTransition}
          className="text-center mb-10"
        >
          <div className="flex flex-col items-center gap-4">
            <WavingPenguin size={48} />
            <p className="text-xl font-serif text-foreground italic tracking-tight">
              You are all caught up.
            </p>
          </div>
        </motion.footer>
      </motion.article>
    </div>
  );
});

GazetteScreen.displayName = "GazetteScreen";

export default GazetteScreen;
