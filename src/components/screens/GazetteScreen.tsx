import { useRef, useMemo, useCallback, memo, useEffect, useState } from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import { motion, useScroll, useTransform } from "framer-motion";
import { Settings, ArrowLeft, Archive } from "lucide-react";
import { PixelPin, PixelClose, WavingPenguin } from "../icons/PixelIcons";
import { Button } from "@/components/ui/button";
import { useSettings } from "@/hooks/useSettings";
import { useArchivedAnalyses } from "@/hooks/useArchivedAnalyses";
import { ease, duration, spring, stagger } from "@/lib/animations";
import type { AnalysisObject } from "@/types/analysis";
import { AnalysisRenderer } from "@/components/gazette/AnalysisRenderer";

interface GazetteScreenProps {
  // Props for legacy/inline usage (e.g., AnalysisArchive modal)
  analysisData?: AnalysisObject;
  isArchived?: boolean;
  onClose?: () => void; // Used by AnalysisArchive inline modal
}

// Animation transitions defined outside component
const buttonEntranceTransition = { delay: 0.3, duration: duration.slow, ease: ease.cinematic };
const articleEntranceTransition = { duration: duration.slower, ease: ease.cinematic };
const headerTransition = { delay: 0.15, duration: duration.slow, ease: ease.cinematic };
const dividerTransition = { duration: duration.slow, ease: ease.cinematic };
const sectionTransition = { duration: duration.slow, ease: ease.cinematic };

const GazetteScreen = memo(({ onClose, analysisData: propData, isArchived: propIsArchived = false }: GazetteScreenProps) => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const locationState = useLocation().state as { from?: string } | null;
  const { settings, patchSettings } = useSettings();
  const { analyses, hasPastAnalyses, isLoaded: archivesLoaded } = useArchivedAnalyses();
  const containerRef = useRef<HTMLDivElement>(null);

  // Determine effective data: props -> param id -> fallback (latest)
  const [effectiveData, setEffectiveData] = useState<AnalysisObject | null>(propData || null);
  const [isArchived, setIsArchived] = useState(propIsArchived);

  useEffect(() => {
    if (propData) {
      setEffectiveData(propData);
      setIsArchived(propIsArchived);
      return;
    }

    if (!archivesLoaded) return;

    if (id) {
      const found = analyses.find(a => a.id === id);
      if (found) {
        setEffectiveData(found.data);
        setIsArchived(true); // If accessed by ID, it's considered archived/persistent
      } else {
        // ID provided but not found? Redirect to archive list
        navigate('/archive', { replace: true });
      }
    } else {
      // No ID, No Props. Show Latest Analysis (Active)
      if (analyses.length > 0) {
        setEffectiveData(analyses[0].data);
        setIsArchived(false);
      }
    }
  }, [id, propData, propIsArchived, analyses, archivesLoaded, navigate]);


  const hasArchivedAnalyses = archivesLoaded && hasPastAnalyses;

  // Parallax scroll effects
  const { scrollY } = useScroll();
  const headerY = useTransform(scrollY, [0, 300], [0, 50]);
  const headerOpacity = useTransform(scrollY, [0, 200], [1, 0.3]);
  const headerScale = useTransform(scrollY, [0, 300], [1, 0.95]);

  // Three-Hub Architecture: Back always goes to Archive List
  const handleClose = useCallback(() => {
    console.log("GazetteScreen: Back button clicked. Navigating to Archive List.");
    // If used inline (e.g., from AnalysisArchive modal), call the provided callback
    if (onClose) {
      onClose();
    } else {
      // Route-based: Navigate to Archive List
      navigate("/archive");
    }
  }, [onClose, navigate]);

  const handleNavigateToSettings = useCallback(() => {
    navigate("/settings", { state: { from: "gazette" } });
  }, [navigate]);


  // Hydrate date if it's a string (Handle null effectiveData gracefully by checking specific usage or defaulting)
  const dateStr = effectiveData?.date || new Date().toISOString();
  const date = dateStr instanceof Date ? dateStr : new Date(dateStr);

  // Memoize expensive string operations
  const { dayName, monthDay } = useMemo(() => ({
    dayName: date.toLocaleDateString("en-US", { weekday: "long" }),
    monthDay: date.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
  }), [date]);

  // Loading state (Moved AFTER hooks)
  if (!effectiveData) {
    if (!archivesLoaded) return <div className="min-h-screen bg-background" />; // Loading...
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background text-muted-foreground">
        <p>No analysis found.</p>
        <Button variant="link" onClick={() => navigate('/archive')}>Go to Archive</Button>
      </div>
    );
  }

  // Prefer data provided in analysis, fallback to settings (if legacy data)
  const locationVal = effectiveData.location; // Can be empty string now
  const displayTitle = effectiveData.title || `The ${dayName} Analysis`;

  // Format Time: Use the stored scheduledTime from the analysis data
  const timeStr = effectiveData.scheduledTime || "8:00 AM";
  const displayTime = `${timeStr} Analysis`;

  return (
    <div className="min-h-screen flex flex-col items-center py-16 px-6 bg-background relative">

      {/* Back Button / Archive Button Logic */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={buttonEntranceTransition}
        className="absolute top-6 left-6 z-50"
      >
        <Button
          variant="ghost"
          size="icon"
          onClick={handleClose}
          className="text-muted-foreground hover:bg-transparent opacity-60 hover:opacity-100 transition-opacity h-14 w-14"
        >
          {/* Always show ArrowLeft as per request if 'onClose' meant 'live view' which now goes to archive?
              Actually, the user said 'Back Arrow... leads to Archive'.
              If isArchived (browsing history), Back usually goes back to list (Archive). 
              If Live View, Back now goes to Archive.
              So basically, it always goes to Archive. */}
          <ArrowLeft className="w-6 h-6" />
        </Button>
      </motion.div>

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
          }}
          className="text-center mb-12"
        >
          <h1 className="text-5xl md:text-6xl font-serif text-foreground mb-4 tracking-tight">
            {displayTitle}
          </h1>
          <div className="flex items-center justify-center gap-3 text-muted-foreground text-sm font-serif italic mb-6">
            <PixelPin size={14} />

            {/* Conditional Location Display from Metadata */}
            <span>
              {monthDay} · {displayTime}
              {locationVal ? ` · ${locationVal}` : ''}
            </span>
          </div>
          <div className="divider max-w-[120px] mx-auto opacity-60" />
        </motion.header>

        {/* Render Analysis Content */}
        <AnalysisRenderer data={effectiveData} />

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
