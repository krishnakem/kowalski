import { useRef, useMemo, useCallback, memo } from "react";
import { useNavigate } from "react-router-dom";
import { motion, useScroll, useTransform } from "framer-motion";
import { Settings, ArrowLeft, Archive } from "lucide-react";
import { PixelPin, PixelClose, WavingPenguin } from "../icons/PixelIcons";
import { Button } from "@/components/ui/button";
import { useSettings } from "@/hooks/useSettings";
import { useArchivedAnalyses } from "@/hooks/useArchivedAnalyses";
import { ease, duration, spring, stagger } from "@/lib/animations";
import { defaultCircleUpdates, defaultWorldUpdates, type CircleUpdate, type WorldUpdate } from "@/lib/data/gazetteData";

export interface AnalysisData {
  date: Date;
  location: string;
  circleUpdates: CircleUpdate[];
  worldUpdates: WorldUpdate[];
}

interface GazetteScreenProps {
  onClose: () => void;
  analysisData?: AnalysisData;
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
  const { analyses, isLoaded: archivesLoaded } = useArchivedAnalyses();
  const hasArchivedAnalyses = archivesLoaded && analyses.length > 0;
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
  
  const date = analysisData?.date || new Date();
  const location = analysisData?.location || settings.location || "Cupertino";
  const circleUpdates = analysisData?.circleUpdates || defaultCircleUpdates;
  const worldUpdates = analysisData?.worldUpdates || defaultWorldUpdates;

  // Memoize expensive string operations
  const { dayName, monthDay } = useMemo(() => ({
    dayName: date.toLocaleDateString("en-US", { weekday: "long" }),
    monthDay: date.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
  }), [date]);

  // Get first letter for drop cap - memoized
  const { firstLetter, restOfFirst, firstUpdate } = useMemo(() => {
    const update = worldUpdates[0];
    return {
      firstUpdate: update,
      firstLetter: update.summary.charAt(0),
      restOfFirst: update.summary.slice(1),
    };
  }, [worldUpdates]);

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
            willChange: "transform, opacity"
          }}
          className="text-center mb-12"
        >
          <h1 className="text-5xl md:text-6xl font-serif text-foreground mb-4 tracking-tight">
            {settings.userName?.trim() ? `${settings.userName.trim()}'s Analysis` : `The ${dayName} Analysis`}
          </h1>
          <div className="flex items-center justify-center gap-3 text-muted-foreground text-sm font-serif italic">
            <PixelPin size={14} />
            <span>{monthDay} · {settings.morningTime || "8:00 AM"} · {location}</span>
          </div>
        </motion.header>

        {/* Divider */}
        <motion.div 
          initial={{ scaleX: 0 }}
          whileInView={{ scaleX: 1 }}
          viewport={{ once: true, margin: "-50px" }}
          transition={dividerTransition}
          className="divider mb-12 origin-left"
        />

        {/* Lead Story with Drop Cap */}
        <motion.section
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={sectionTransition}
          className="mb-12"
        >
          <p className="text-xs text-accent font-sans tracking-widest uppercase mb-3">
            {firstUpdate.source}
          </p>
          <p className="text-foreground font-sans leading-relaxed text-lg">
            <span className="float-left text-7xl font-serif leading-none mr-3 mt-1 text-foreground">
              {firstLetter}
            </span>
            {restOfFirst}
          </p>
        </motion.section>

        {/* Divider */}
        <motion.div 
          initial={{ scaleX: 0 }}
          whileInView={{ scaleX: 1 }}
          viewport={{ once: true, margin: "-50px" }}
          transition={dividerTransition}
          className="divider mb-12 origin-left"
        />

        {/* The Circle Section */}
        <motion.section
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={sectionTransition}
          className="mb-12"
        >
          <h2 className="text-2xl font-serif text-foreground mb-2">
            The Circle
          </h2>
          <p className="text-muted-foreground text-sm mb-6 font-sans">
            Updates from people you care about
          </p>

          <ul className="space-y-3">
            {circleUpdates.map((item, index) => (
              <motion.li
                key={index}
                initial={{ opacity: 0, x: -20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true, margin: "-30px" }}
                transition={{ 
                  delay: index * stagger.normal, 
                  ...spring.gentle 
                }}
                className="flex items-start gap-3 text-foreground font-sans"
              >
                <span className="text-accent mt-0.5">•</span>
                <p>
                  <span className="font-medium">{item.name}</span>
                  <span className="text-muted-foreground"> {item.update}</span>
                </p>
              </motion.li>
            ))}
          </ul>
        </motion.section>

        {/* Divider */}
        <motion.div 
          initial={{ scaleX: 0 }}
          whileInView={{ scaleX: 1 }}
          viewport={{ once: true, margin: "-50px" }}
          transition={dividerTransition}
          className="divider mb-12 origin-left"
        />

        {/* The World Section */}
        <motion.section
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={sectionTransition}
          className="mb-12"
        >
          <h2 className="text-2xl font-serif text-foreground mb-2">
            The World
          </h2>
          <p className="text-muted-foreground text-sm mb-6 font-sans">
            High-signal updates from creators and news
          </p>

          <div className="space-y-8">
            {worldUpdates.slice(1).map((item, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-50px" }}
                transition={{ 
                  delay: index * stagger.slow, 
                  ...spring.gentle 
                }}
              >
                <p className="text-xs text-accent font-sans tracking-widest uppercase mb-2">
                  {item.source}
                </p>
                <p className="text-foreground font-sans leading-relaxed">
                  {item.summary}
                </p>
              </motion.div>
            ))}
          </div>
        </motion.section>

        {/* Divider */}
        <motion.div 
          initial={{ scaleX: 0 }}
          whileInView={{ scaleX: 1 }}
          viewport={{ once: true, margin: "-50px" }}
          transition={dividerTransition}
          className="divider mb-12 origin-left"
        />

        {/* Footer - All Caught Up */}
        <motion.footer
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={sectionTransition}
          className="text-center"
        >
          <div className="flex flex-col items-center gap-4">
            <WavingPenguin size={48} />
            <p className="text-xl font-serif text-foreground italic tracking-tight">
              You are all caught up.
            </p>
            <p className="text-muted-foreground text-sm font-sans">
              Go do something meaningful.
            </p>

            {!isArchived && (
              <motion.button
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ ...spring.snappy, delay: 0.8 }}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={handleClose}
                className="mt-6 btn-ghost flex items-center gap-3"
              >
                <PixelClose size={16} />
                <span>Close App</span>
              </motion.button>
            )}
          </div>
        </motion.footer>
      </motion.article>
    </div>
  );
});

GazetteScreen.displayName = "GazetteScreen";

export default GazetteScreen;
