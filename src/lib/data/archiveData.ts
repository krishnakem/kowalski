import type { AnalysisData } from "@/components/screens/GazetteScreen";

export interface ArchivedAnalysis {
  id: string;
  data: AnalysisData;
  leadStoryPreview: string;
}

// Mock data for demo purposes - expanded with more months
export const archivedAnalyses: ArchivedAnalysis[] = [
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

export const MONTHS = [
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
] as const;

// Dynamically get years that have analyses
export const getAvailableYears = (): number[] => {
  const yearsSet = new Set<number>();
  archivedAnalyses.forEach((analysis) => {
    yearsSet.add(analysis.data.date.getFullYear());
  });
  return Array.from(yearsSet).sort((a, b) => b - a);
};

export const AVAILABLE_YEARS = getAvailableYears();
