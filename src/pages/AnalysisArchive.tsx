import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { WavingPenguin } from "@/components/icons/PixelIcons";
import GazetteScreen, { AnalysisData } from "@/components/screens/GazetteScreen";

interface ArchivedAnalysis {
  id: string;
  data: AnalysisData;
  leadStoryPreview: string;
}

// Mock data for demo purposes
const archivedAnalyses: ArchivedAnalysis[] = [
  {
    id: "1",
    data: {
      date: new Date("2024-12-27"),
      location: "Sunnyvale",
      circleUpdates: [
        { name: "Sarah", update: "got engaged in Kyoto" },
        { name: "Mike", update: "posted 3 photos from the launch" },
        { name: "Elena", update: "started a new role at Stripe" },
      ],
      worldUpdates: [
        {
          source: "The Verge",
          summary: "Apple's latest AI features transform how users interact with their devices, bringing contextual awareness to everyday tasks."
        },
        {
          source: "Bloomberg",
          summary: "Tech stocks rally as investors bet on continued AI momentum heading into the new year."
        },
        {
          source: "Wired",
          summary: "The future of wearables looks increasingly health-focused as new sensors enable continuous monitoring."
        }
      ]
    },
    leadStoryPreview: "Apple's latest AI features transform how users interact with their devices, bringing contextual awareness to everyday tasks."
  },
  {
    id: "2",
    data: {
      date: new Date("2024-12-26"),
      location: "Sunnyvale",
      circleUpdates: [
        { name: "James", update: "is traveling through Portugal" },
        { name: "Lisa", update: "launched her new podcast" },
      ],
      worldUpdates: [
        {
          source: "TechCrunch",
          summary: "The startup ecosystem sees renewed investor confidence as AI companies demonstrate sustainable business models."
        },
        {
          source: "Reuters",
          summary: "Global semiconductor demand expected to surge 15% in 2025 as AI workloads intensify."
        },
        {
          source: "Ars Technica",
          summary: "New open-source language models challenge proprietary alternatives in benchmark tests."
        }
      ]
    },
    leadStoryPreview: "The startup ecosystem sees renewed investor confidence as AI companies demonstrate sustainable business models."
  },
  {
    id: "3",
    data: {
      date: new Date("2024-12-25"),
      location: "Sunnyvale",
      circleUpdates: [
        { name: "David", update: "shared holiday photos from Colorado" },
        { name: "Anna", update: "announced her engagement" },
        { name: "Tom", update: "completed his marathon goal" },
      ],
      worldUpdates: [
        {
          source: "Wired",
          summary: "Holiday tech gifts trend toward privacy-focused devices as consumers become more security conscious."
        },
        {
          source: "The Verge",
          summary: "Gaming consoles see record holiday sales as new exclusive titles drive demand."
        },
        {
          source: "Engadget",
          summary: "Smart home devices become mainstream with over 50% of households now owning at least one."
        }
      ]
    },
    leadStoryPreview: "Holiday tech gifts trend toward privacy-focused devices as consumers become more security conscious."
  }
];

const formatDate = (date: Date): string => {
  return date.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric"
  });
};

const getWeekdayTitle = (date: Date): string => {
  const weekday = date.toLocaleDateString("en-US", { weekday: "long" });
  return `The ${weekday} Analysis`;
};

const AnalysisArchive = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [selectedAnalysis, setSelectedAnalysis] = useState<ArchivedAnalysis | null>(null);

  const handleBack = () => {
    const from = location.state?.from;
    if (from === "agent") {
      navigate("/", { state: { screen: "agent" } });
    } else {
      navigate(-1);
    }
  };

  const handleAnalysisClick = (analysis: ArchivedAnalysis) => {
    setSelectedAnalysis(analysis);
  };

  const handleCloseAnalysis = () => {
    setSelectedAnalysis(null);
  };

  // For demo: toggle between empty and populated state
  const showEmptyState = false; // Change to true to see empty state
  const analyses = showEmptyState ? [] : archivedAnalyses;

  return (
    <AnimatePresence mode="wait">
      {selectedAnalysis ? (
        <motion.div
          key="gazette"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
        >
          <GazetteScreen
            onClose={handleCloseAnalysis}
            analysisData={selectedAnalysis.data}
            isArchived={true}
          />
        </motion.div>
      ) : (
        <motion.div
          key="archive"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="min-h-screen bg-background"
        >
          {/* Header */}
          <motion.header
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="pt-6 pb-8 px-6"
          >
            <div className="max-w-2xl mx-auto relative">
              <Button
                variant="ghost"
                size="icon"
                onClick={handleBack}
                className="absolute left-0 top-1/2 -translate-y-1/2 text-muted-foreground hover:bg-transparent"
              >
                <ArrowLeft className="w-5 h-5" />
              </Button>
              <h1 className="font-serif text-4xl md:text-5xl text-center text-foreground">
                Analysis Archive
              </h1>
            </div>
          </motion.header>

          <main className="max-w-2xl mx-auto px-6 py-8">
            {analyses.length === 0 ? (
              /* Empty State */
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2, duration: 0.5 }}
                className="flex flex-col items-center justify-center py-20 text-center"
              >
                <WavingPenguin size={120} />
                <h2 className="font-serif text-xl text-foreground mt-8 mb-3">
                  No Analyses Yet
                </h2>
                <p className="text-muted-foreground font-sans text-sm max-w-xs leading-relaxed">
                  Your daily analyses will appear here once Kowalski creates them.
                </p>
              </motion.div>
            ) : (
              /* Archive List */
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.2, duration: 0.4 }}
                className="space-y-6"
              >
                {analyses.map((analysis, index) => (
                  <motion.article
                    key={analysis.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 * (index + 1), duration: 0.4 }}
                    className="group cursor-pointer"
                    onClick={() => handleAnalysisClick(analysis)}
                  >
                    <div className="pb-6 border-b border-border">
                      {/* Title */}
                      <h2 className="font-serif text-xl text-foreground group-hover:text-primary transition-colors mb-1">
                        {getWeekdayTitle(analysis.data.date)}
                      </h2>
                      
                      {/* Date & Location */}
                      <p className="font-sans text-xs text-muted-foreground uppercase tracking-wider mb-4">
                        {formatDate(analysis.data.date)} • {analysis.data.location}
                      </p>
                      
                      {/* Lead Story Preview */}
                      <div className="flex gap-2">
                        <span className="font-sans text-xs font-medium text-muted-foreground uppercase tracking-wide">
                          {analysis.data.worldUpdates[0].source}:
                        </span>
                        <p className="font-serif text-sm text-foreground/80 leading-relaxed line-clamp-2">
                          {analysis.leadStoryPreview}
                        </p>
                      </div>
                    </div>
                  </motion.article>
                ))}
              </motion.div>
            )}
          </main>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default AnalysisArchive;
