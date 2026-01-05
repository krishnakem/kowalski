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

// Update Props Interface
interface GazetteScreenProps {
  analysisData?: AnalysisObject;
  analysisId?: string; // New Prop
  isArchived?: boolean;
  onClose?: () => void;
}

// ...

// Local Transitions
const buttonEntranceTransition = { duration: duration.normal, ease: ease.cinematic };
const articleEntranceTransition = { duration: duration.slow, ease: ease.cinematic };
const headerTransition = { duration: duration.normal, ease: ease.cinematic, delay: 0.1 };
const sectionTransition = { duration: duration.normal, ease: ease.cinematic };

const GazetteScreen = memo(({ onClose, analysisData: propData, analysisId: propId, isArchived: propIsArchived = false }: GazetteScreenProps) => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>(); // Valid for route /archive/:id
  const location = useLocation();
  const { settings } = useSettings();
  const { analyses, isLoaded: archivesLoaded, hasPastAnalyses } = useArchivedAnalyses();

  // Determine effective data
  const [effectiveData, setEffectiveData] = useState<AnalysisObject | null>(propData || null);
  const [effectiveId, setEffectiveId] = useState<string | null>(propId || null);
  const [isArchived, setIsArchived] = useState(propIsArchived);

  useEffect(() => {
    if (propData) {
      setEffectiveData(propData);
      // UPDATE: Capture Prop ID if available
      if (propId) {
        setEffectiveId(propId);
      }
      setIsArchived(propIsArchived);
      return;
    }
    // ...
  }, [id, propData, propId, propIsArchived, analyses, archivesLoaded, navigate]);

  useEffect(() => {
    if (propData) return;

    // Waiting for archives to load is usually good, BUT
    // if we have a specific ID, we should try to fetch it regardless of the list state.
    // This bypasses the race condition where the list is stale.
    if (!archivesLoaded && !id) return;

    if (id) {
      const found = analyses.find(a => a.id === id);
      if (found) {
        setEffectiveData(found.data);
        setEffectiveId(found.id);
        setIsArchived(true);
      } else {
        // ID provided but not found in list. 
        // INSTANT FIX: Trust the ID and try to fetch it directly later.
        console.warn(`GazetteScreen: ID ${id} not found in list. Attempting direct fetch.`);
        setEffectiveId(id);
        // Set placeholder to prevent "No Analysis Found" flash
        setEffectiveData({ id, title: "Loading...", date: new Date().toISOString(), sections: [] } as any);
      }
    } else if (archivesLoaded) {
      // Only fallback to latest if we have NO ID and list is ready.
      if (analyses.length > 0) {
        setEffectiveData(analyses[0].data);
        setEffectiveId(analyses[0].id);
        setIsArchived(false);
      }
    }
  }, [id, propData, analyses, archivesLoaded, navigate]);

  // CONTENT FETCHING LOGIC (Lazy Load from File)
  const [isFetchingContent, setIsFetchingContent] = useState(false);

  useEffect(() => {
    const fetchContent = async () => {
      // We rely on effectiveId as the source of truth
      if (!effectiveId) return;

      // Only fetch if data is missing or incomplete
      const needsFetch = !effectiveData || !effectiveData.sections || effectiveData.sections.length === 0;

      if (needsFetch) {
        setIsFetchingContent(true);
        try {
          console.log("GazetteScreen: Fetching content for ", effectiveId);
          const fullContent = await window.api.analyses.getContent(effectiveId);

          if (fullContent && fullContent.data) {
            setEffectiveData(fullContent.data);
          } else {
            console.error("Fetched content was empty or invalid for ID:", effectiveId);
            // If direct fetch fails AND we aren't viewing a valid archive item, then we can redirect
            if (!analyses.find(a => a.id === effectiveId)) {
              // navigate('/archive', { replace: true }); 
            }
          }
        } catch (e) {
          console.error("Failed to fetch content:", e);
        } finally {
          setIsFetchingContent(false);
        }
      }
    };
    fetchContent();
  }, [effectiveData, effectiveId]);


  const hasArchivedAnalyses = archivesLoaded && hasPastAnalyses;

  // Parallax scroll effects
  const { scrollY } = useScroll();
  const headerY = useTransform(scrollY, [0, 300], [0, 50]);
  const headerOpacity = useTransform(scrollY, [0, 200], [1, 0.3]);
  const headerScale = useTransform(scrollY, [0, 300], [1, 0.95]);

  // Three-Hub Architecture: Back always goes to Archive List (with specific state)
  const handleClose = useCallback(() => {
    console.log("GazetteScreen: Back button clicked. Navigating to Archive Hierarchically.");

    // If used inline (e.g., from AnalysisArchive modal), call the provided callback
    if (onClose) {
      onClose();
    } else {
      // Route-based: Navigate "Up" to the specific Calendar View (L3)
      const d = effectiveData?.date ? new Date(effectiveData.date) : new Date();
      const year = d.getFullYear();
      const month = d.getMonth();

      navigate("/archive", {
        state: {
          viewMode: 'calendar',
          year,
          month
        }
      });
    }
  }, [onClose, navigate, effectiveData]);

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
  // Loading state (Moved AFTER hooks)
  // Fix: Check if sections are missing. If so, treat as loading (waiting for fetch)
  // This prevents AnalysisRenderer from crashing on undefined 'sections'
  const isDataIncomplete = effectiveData && (!effectiveData.sections || effectiveData.sections.length === 0);

  if (!effectiveData || isFetchingContent || isDataIncomplete) {
    if (!archivesLoaded || isFetchingContent || isDataIncomplete) {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-background">
          <div className="animate-pulse flex flex-col items-center">
            <div className="h-12 w-12 bg-muted rounded-full mb-4"></div>
            <div className="h-4 w-32 bg-muted rounded"></div>
          </div>
        </div>
      );
    }
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
