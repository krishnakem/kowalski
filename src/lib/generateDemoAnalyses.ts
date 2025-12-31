import type { AnalysisObject, AnalysisSection } from "@/types/analysis";
import type { SettingsData } from "@/hooks/useSettings";

// Sample data pools
const circleUpdatePool = [
  "Sarah got engaged in Kyoto",
  "Mike posted 3 photos from the launch",
  "Elena started a new role at Stripe",
  "James is traveling through Portugal",
  "Lisa launched her new podcast",
  "Carlos shared photos from his family gathering",
  "Priya ran her first 10K",
  "David shared holiday photos from Colorado",
  "Anna announced her engagement",
  "Tom completed his marathon goal",
  "Rachel got promoted to senior engineer",
  "Chris moved to Seattle",
  "Nina completed her morning yoga streak - 100 days!",
  "Alex launched a new startup",
];

const worldUpdatePool = [
  "Apple's latest AI features transform how users interact with their devices, bringing contextual awareness to everyday tasks.",
  "Tech stocks rally as investors bet on continued AI momentum heading into the new year.",
  "The future of wearables looks increasingly health-focused as new sensors enable continuous monitoring.",
  "Morning markets show optimism as Asian trading closes higher across the board.",
  "Early reports suggest holiday gadget sales exceeded expectations.",
  "Supply chain improvements lead to shorter delivery times this holiday season.",
  "Smart home devices dominate post-holiday returns as gift recipients upgrade.",
  "New open-source language models challenge proprietary alternatives in benchmark tests.",
  "Gaming consoles see record holiday sales as new exclusive titles drive demand.",
  "Asian markets open strong following Christmas holiday break.",
  "The startup ecosystem sees renewed investor confidence as AI companies demonstrate sustainable business models.",
  "Holiday tech gifts trend toward privacy-focused devices as consumers become more security conscious.",
];

const pickRandom = <T>(arr: T[], count: number): T[] => {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
};

const parseTime = (timeStr: string): { hours: number; minutes: number } => {
  const match = timeStr.match(/(\d+):(\d+)\s*(AM|PM)/i);
  if (!match) return { hours: 8, minutes: 0 };

  let hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  const period = match[3].toUpperCase();

  if (period === "PM" && hours !== 12) hours += 12;
  if (period === "AM" && hours === 12) hours = 0;

  return { hours, minutes };
};

const generateAnalysis = (date: Date, location: string): AnalysisObject => {
  // Generate Sections
  const circleUpdates = pickRandom(circleUpdatePool, 3);
  const worldUpdates = pickRandom(worldUpdatePool, 3);

  const sections: AnalysisSection[] = [
    {
      heading: "The Circle",
      content: circleUpdates.map(u => `• ${u}`)
    },
    {
      heading: "The World",
      content: worldUpdates
    }
  ];

  const dayName = date.toLocaleDateString("en-US", { weekday: "long" });

  return {
    title: `The ${dayName} Analysis`,
    subtitle: `${date.toLocaleDateString()} · ${location}`,
    date: date.toISOString(),
    location,
    sections
  };
};

export const generateScheduledDemoAnalyses = (
  settings: SettingsData,
  daysBack: number = 7
): AnalysisObject[] => {
  const analyses: AnalysisObject[] = [];
  const now = new Date();
  const location = settings.location || "Cupertino";

  const morningTime = parseTime(settings.morningTime);
  const eveningTime = parseTime(settings.eveningTime);

  for (let daysAgo = 1; daysAgo <= daysBack; daysAgo++) {
    const date = new Date(now);
    date.setDate(date.getDate() - daysAgo);

    // Morning analysis
    const morningDate = new Date(date);
    morningDate.setHours(morningTime.hours, morningTime.minutes, 0, 0);
    analyses.push(generateAnalysis(morningDate, location));

    // Evening analysis (only if twice daily)
    if (settings.digestFrequency === 2) {
      const eveningDate = new Date(date);
      eveningDate.setHours(eveningTime.hours, eveningTime.minutes, 0, 0);
      analyses.push(generateAnalysis(eveningDate, location));
    }
  }

  return analyses;
};
