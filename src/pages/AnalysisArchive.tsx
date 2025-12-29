import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, ChevronDown, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { WavingPenguin } from "@/components/icons/PixelIcons";
import GazetteScreen, { AnalysisData } from "@/components/screens/GazetteScreen";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface ArchivedAnalysis {
  id: string;
  data: AnalysisData;
  leadStoryPreview: string;
}

// Mock data for demo purposes - expanded with more months
const archivedAnalyses: ArchivedAnalysis[] = [
  {
    id: "1",
    data: {
      date: new Date("2025-12-27"),
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
      date: new Date("2025-12-26"),
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
      date: new Date("2025-12-25"),
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
  },
  {
    id: "4",
    data: {
      date: new Date("2025-11-15"),
      location: "Sunnyvale",
      circleUpdates: [
        { name: "Rachel", update: "got promoted to senior engineer" },
        { name: "Chris", update: "moved to Seattle" },
      ],
      worldUpdates: [
        {
          source: "TechCrunch",
          summary: "November sees record venture capital deployment as investors rush to close end-of-year deals."
        },
        {
          source: "Bloomberg",
          summary: "Tech layoffs slow as companies stabilize after year of restructuring."
        },
        {
          source: "Wired",
          summary: "New AI regulations proposed in Congress spark industry debate."
        }
      ]
    },
    leadStoryPreview: "November sees record venture capital deployment as investors rush to close end-of-year deals."
  },
  {
    id: "5",
    data: {
      date: new Date("2025-10-20"),
      location: "Sunnyvale",
      circleUpdates: [
        { name: "Alex", update: "launched a new startup" },
      ],
      worldUpdates: [
        {
          source: "The Verge",
          summary: "October brings major product launches as tech giants compete for holiday shopping season."
        },
        {
          source: "Reuters",
          summary: "Smartphone sales rebound after two-year decline."
        },
        {
          source: "Ars Technica",
          summary: "New browser technologies promise faster, more private web experience."
        }
      ]
    },
    leadStoryPreview: "October brings major product launches as tech giants compete for holiday shopping season."
  }
];

const MONTHS = [
  { short: "Jan", full: "January", index: 0 },
  { short: "Feb", full: "February", index: 1 },
  { short: "Mar", full: "March", index: 2 },
  { short: "Apr", full: "April", index: 3 },
  { short: "May", full: "May", index: 4 },
  { short: "Jun", full: "June", index: 5 },
  { short: "Jul", full: "July", index: 6 },
  { short: "Aug", full: "August", index: 7 },
  { short: "Sep", full: "September", index: 8 },
  { short: "Oct", full: "October", index: 9 },
  { short: "Nov", full: "November", index: 10 },
  { short: "Dec", full: "December", index: 11 },
];

// Dynamically get years that have analyses
const getAvailableYears = (): number[] => {
  const yearsSet = new Set<number>();
  archivedAnalyses.forEach((analysis) => {
    yearsSet.add(analysis.data.date.getFullYear());
  });
  return Array.from(yearsSet).sort((a, b) => b - a); // Sort descending
};

const AVAILABLE_YEARS = getAvailableYears();

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

type ViewMode = "months" | "analyses";

const AnalysisArchive = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [selectedAnalysis, setSelectedAnalysis] = useState<ArchivedAnalysis | null>(null);
  const [selectedYear, setSelectedYear] = useState(2024);
  const [selectedMonth, setSelectedMonth] = useState<number | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("months");
  const [searchQuery, setSearchQuery] = useState("");

  // Search filter function
  const matchesSearch = (analysis: ArchivedAnalysis, query: string): boolean => {
    if (!query.trim()) return true;
    
    const q = query.toLowerCase();
    const dateStr = formatDate(analysis.data.date).toLowerCase();
    const weekdayTitle = getWeekdayTitle(analysis.data.date).toLowerCase();
    const location = analysis.data.location.toLowerCase();
    const leadStory = analysis.leadStoryPreview.toLowerCase();
    const sources = analysis.data.worldUpdates.map(u => u.source.toLowerCase()).join(" ");
    const summaries = analysis.data.worldUpdates.map(u => u.summary.toLowerCase()).join(" ");
    const circleNames = analysis.data.circleUpdates.map(u => u.name.toLowerCase()).join(" ");
    
    return (
      dateStr.includes(q) ||
      weekdayTitle.includes(q) ||
      location.includes(q) ||
      leadStory.includes(q) ||
      sources.includes(q) ||
      summaries.includes(q) ||
      circleNames.includes(q)
    );
  };

  const handleBack = () => {
    if (viewMode === "analyses") {
      setViewMode("months");
      setSelectedMonth(null);
      return;
    }
    const from = location.state?.from;
    if (from === "agent") {
      navigate("/", { state: { screen: "agent" } });
    } else if (from === "gazette") {
      navigate("/", { state: { screen: "gazette" } });
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

  const handleMonthClick = (monthIndex: number) => {
    setSelectedMonth(monthIndex);
    setViewMode("analyses");
  };

  // Get analyses for selected month/year with search filter
  const getAnalysesForMonth = (year: number, month: number) => {
    return archivedAnalyses.filter((analysis) => {
      const date = analysis.data.date;
      const matchesDate = date.getFullYear() === year && date.getMonth() === month;
      return matchesDate && matchesSearch(analysis, searchQuery);
    });
  };

  // Get months that have analyses for the selected year (with search filter)
  const getMonthsWithAnalyses = (year: number) => {
    const monthsMap = new Map<number, number>();
    archivedAnalyses.forEach((analysis) => {
      const date = analysis.data.date;
      if (date.getFullYear() === year && matchesSearch(analysis, searchQuery)) {
        const month = date.getMonth();
        monthsMap.set(month, (monthsMap.get(month) || 0) + 1);
      }
    });
    return monthsMap;
  };

  const monthsWithAnalyses = getMonthsWithAnalyses(selectedYear);
  const currentMonthAnalyses = selectedMonth !== null 
    ? getAnalysesForMonth(selectedYear, selectedMonth) 
    : [];

  const selectedMonthName = selectedMonth !== null 
    ? MONTHS[selectedMonth].full 
    : "";

  // Get all matching analyses across all years when searching
  const getAllMatchingAnalyses = () => {
    return archivedAnalyses
      .filter((analysis) => matchesSearch(analysis, searchQuery))
      .sort((a, b) => b.data.date.getTime() - a.data.date.getTime());
  };

  const isSearching = searchQuery.trim().length > 0;
  const searchResults = isSearching ? getAllMatchingAnalyses() : [];

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
          className="min-h-screen bg-background relative py-16 px-6"
        >
          {/* Back Button */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3, duration: 0.5 }}
            className="absolute top-6 left-6 z-10"
          >
            <Button
              variant="ghost"
              size="icon"
              onClick={handleBack}
              className="text-muted-foreground hover:bg-transparent opacity-60 hover:opacity-100 transition-opacity h-14 w-14"
            >
              <ArrowLeft className="w-6 h-6" />
            </Button>
          </motion.div>

          {/* Header */}
          <motion.header
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2, duration: 0.6 }}
            className="text-center mb-12"
          >
            <h1 className="text-5xl md:text-6xl font-serif text-foreground mb-4 tracking-tight">
              {isSearching 
                ? "Search Results" 
                : viewMode === "months" 
                  ? "Analysis Archive" 
                  : `${selectedMonthName} ${selectedYear}`}
            </h1>
            {isSearching && (
              <p className="font-sans text-muted-foreground">
                {searchResults.length} {searchResults.length === 1 ? "analysis" : "analyses"} found
              </p>
            )}
          </motion.header>

          {/* Search Bar */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15, duration: 0.4 }}
            className="max-w-2xl mx-auto px-6 mb-6"
          >
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Search by date, source, or topic..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 bg-background border-border font-sans"
              />
            </div>
          </motion.div>

          {isSearching ? (
            /* Search Results - Flat list of all matching analyses */
            <main className="max-w-2xl mx-auto px-6 py-8">
              {searchResults.length === 0 ? (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2, duration: 0.5 }}
                  className="flex flex-col items-center justify-center py-20 text-center"
                >
                  <Search className="w-12 h-12 text-muted-foreground mb-4" />
                  <h2 className="font-serif text-xl text-foreground mb-3">
                    No Results Found
                  </h2>
                  <p className="text-muted-foreground font-sans text-sm max-w-xs leading-relaxed">
                    No analyses match "{searchQuery}".
                  </p>
                </motion.div>
              ) : (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.2, duration: 0.4 }}
                  className="space-y-6"
                >
                  {searchResults.map((analysis, index) => (
                    <motion.article
                      key={analysis.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.05 * (index + 1), duration: 0.4 }}
                      className="group cursor-pointer"
                      onClick={() => handleAnalysisClick(analysis)}
                    >
                      <div className="pb-6 border-b border-border">
                        <h2 className="font-serif text-xl text-foreground group-hover:text-primary transition-colors mb-1">
                          {getWeekdayTitle(analysis.data.date)}
                        </h2>
                        <p className="font-sans text-xs text-muted-foreground uppercase tracking-wider mb-4">
                          {formatDate(analysis.data.date)} • {analysis.data.location}
                        </p>
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
          ) : viewMode === "months" ? (
            <>
              {/* Year Dropdown */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2, duration: 0.4 }}
                className="max-w-2xl mx-auto px-6 mb-8"
              >
                <div className="flex justify-center">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="outline"
                        className="font-sans text-lg px-6 py-2 border-2 border-foreground/20 hover:border-foreground bg-background"
                      >
                        {selectedYear}
                        <ChevronDown className="ml-2 w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent className="bg-background border-border z-50">
                      {AVAILABLE_YEARS.map((year) => (
                        <DropdownMenuItem
                          key={year}
                          onClick={() => setSelectedYear(year)}
                          className={`font-sans cursor-pointer ${
                            year === selectedYear ? "font-medium" : ""
                          }`}
                        >
                          {year}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </motion.div>

              {/* Month Grid - Only show months with analyses */}
              <main className="max-w-2xl mx-auto px-6 py-4">
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.3, duration: 0.4 }}
                  className="grid grid-cols-3 md:grid-cols-4 gap-4"
                >
                  {MONTHS.filter(month => monthsWithAnalyses.has(month.index)).map((month, index) => {
                    const analysesCount = monthsWithAnalyses.get(month.index) || 0;
                    
                    return (
                      <motion.button
                        key={month.short}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.05 * index, duration: 0.3 }}
                        whileHover={{ y: -2, boxShadow: "0 4px 12px rgba(0,0,0,0.08)" }}
                        onClick={() => handleMonthClick(month.index)}
                        className="aspect-square border-2 p-4 flex flex-col items-center justify-center gap-2
                          transition-colors duration-200 bg-card border-foreground/20 hover:border-foreground cursor-pointer"
                      >
                        <span className="font-serif text-2xl md:text-3xl text-foreground">
                          {month.short}
                        </span>
                        <span className="font-sans text-xs text-muted-foreground">
                          {analysesCount} {analysesCount === 1 ? "analysis" : "analyses"}
                        </span>
                      </motion.button>
                    );
                  })}
                </motion.div>

                {/* No analyses for year or search */}
                {monthsWithAnalyses.size === 0 && (
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2, duration: 0.5 }}
                    className="flex flex-col items-center justify-center py-12 text-center"
                  >
                    {searchQuery.trim() ? (
                      <>
                        <Search className="w-12 h-12 text-muted-foreground mb-4" />
                        <h2 className="font-serif text-xl text-foreground mb-3">
                          No Results Found
                        </h2>
                        <p className="text-muted-foreground font-sans text-sm max-w-xs leading-relaxed">
                          No analyses match "{searchQuery}" in {selectedYear}.
                        </p>
                      </>
                    ) : (
                      <>
                        <WavingPenguin size={80} />
                        <h2 className="font-serif text-xl text-foreground mt-6 mb-3">
                          No Analyses in {selectedYear}
                        </h2>
                        <p className="text-muted-foreground font-sans text-sm max-w-xs leading-relaxed">
                          Try selecting a different year.
                        </p>
                      </>
                    )}
                  </motion.div>
                )}
              </main>
            </>
          ) : (
            /* Analyses List for Selected Month */
            <main className="max-w-2xl mx-auto px-6 py-8">
              {currentMonthAnalyses.length === 0 ? (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2, duration: 0.5 }}
                  className="flex flex-col items-center justify-center py-20 text-center"
                >
                  {searchQuery.trim() ? (
                    <>
                      <Search className="w-12 h-12 text-muted-foreground mb-4" />
                      <h2 className="font-serif text-xl text-foreground mb-3">
                        No Results Found
                      </h2>
                      <p className="text-muted-foreground font-sans text-sm max-w-xs leading-relaxed">
                        No analyses match "{searchQuery}" in {selectedMonthName} {selectedYear}.
                      </p>
                    </>
                  ) : (
                    <>
                      <WavingPenguin size={120} />
                      <h2 className="font-serif text-xl text-foreground mt-8 mb-3">
                        No Analyses
                      </h2>
                      <p className="text-muted-foreground font-sans text-sm max-w-xs leading-relaxed">
                        No analyses found for {selectedMonthName} {selectedYear}.
                      </p>
                    </>
                  )}
                </motion.div>
              ) : (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.2, duration: 0.4 }}
                  className="space-y-6"
                >
                  {currentMonthAnalyses.map((analysis, index) => (
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
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default AnalysisArchive;
