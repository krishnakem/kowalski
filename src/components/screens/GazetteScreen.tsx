import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Settings, ArrowLeft, Archive } from "lucide-react";
import { PixelPin, PixelClose, WavingPenguin } from "../icons/PixelIcons";
import { Button } from "@/components/ui/button";

interface CircleUpdate {
  name: string;
  update: string;
}

interface WorldUpdate {
  source: string;
  summary: string;
}

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

const defaultCircleUpdates: CircleUpdate[] = [
  { name: "Sarah", update: "got engaged in Kyoto" },
  { name: "Mike", update: "posted 3 photos from the launch" },
  { name: "Elena", update: "started a new role at Stripe" },
  { name: "James", update: "is traveling through Portugal" },
];

const defaultWorldUpdates: WorldUpdate[] = [
  {
    source: "The Verge",
    summary: "Apple announced the M4 chip lineup with significant improvements to neural engine performance, promising 2x faster on-device AI processing.",
  },
  {
    source: "Bloomberg",
    summary: "OpenAI reportedly in talks for a new funding round that would value the company at $150 billion, marking a significant increase from previous valuations.",
  },
  {
    source: "Wired",
    summary: "The EU's Digital Services Act takes full effect today, requiring major platforms to provide algorithmic transparency and content moderation appeals.",
  },
];

const GazetteScreen = ({ onClose, analysisData, isArchived = false }: GazetteScreenProps) => {
  const navigate = useNavigate();
  
  const date = analysisData?.date || new Date();
  const location = analysisData?.location || "Sunnyvale";
  const circleUpdates = analysisData?.circleUpdates || defaultCircleUpdates;
  const worldUpdates = analysisData?.worldUpdates || defaultWorldUpdates;

  const dayName = date.toLocaleDateString("en-US", { weekday: "long" });
  const monthDay = date.toLocaleDateString("en-US", { 
    month: "short", 
    day: "numeric"
  });

  // Get first letter for drop cap
  const firstUpdate = worldUpdates[0];
  const firstLetter = firstUpdate.summary.charAt(0);
  const restOfFirst = firstUpdate.summary.slice(1);

  return (
    <div className="min-h-screen flex flex-col items-center py-16 px-6 bg-background relative">
      {/* Back Button (for archived view) OR Archive Button (for live view) */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: isArchived ? 0.3 : 1, duration: 0.5 }}
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
            onClick={() => navigate("/archive", { state: { from: "gazette" } })}
            className="text-muted-foreground hover:bg-transparent opacity-60 hover:opacity-100 transition-opacity h-14 w-14"
          >
            <Archive className="w-8 h-8" />
          </Button>
        )}
      </motion.div>

      {/* Settings Button */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1, duration: 0.5 }}
        className="absolute top-6 right-6"
      >
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate("/settings", { state: { from: "gazette" } })}
          className="text-muted-foreground hover:bg-transparent opacity-60 hover:opacity-100 transition-opacity h-14 w-14"
        >
          <Settings className="w-8 h-8" />
        </Button>
      </motion.div>

      <motion.article
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8 }}
        className="max-w-[650px] w-full"
      >
        {/* Masthead */}
        <motion.header
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2, duration: 0.6 }}
          className="text-center mb-12"
        >
        <h1 className="text-5xl md:text-6xl font-serif text-foreground mb-4 tracking-tight">
            The {dayName} Analysis
          </h1>
          <div className="flex items-center justify-center gap-3 text-muted-foreground text-sm font-serif italic">
            <PixelPin size={14} />
            <span>{monthDay} • {location}</span>
          </div>
        </motion.header>

        {/* Divider */}
        <div className="divider mb-12" />

        {/* Lead Story with Drop Cap */}
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4, duration: 0.6 }}
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
        <div className="divider mb-12" />

        {/* The Circle Section */}
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5, duration: 0.6 }}
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
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.6 + index * 0.1, duration: 0.4 }}
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
        <div className="divider mb-12" />

        {/* The World Section */}
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.8, duration: 0.6 }}
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
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.9 + index * 0.15, duration: 0.4 }}
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
        <div className="divider mb-12" />

        {/* Footer - All Caught Up */}
        <motion.footer
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.2, duration: 0.6 }}
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
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={onClose}
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
};

export default GazetteScreen;
