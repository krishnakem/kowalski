import type { AnalysisData } from "@/components/screens/GazetteScreen";
import type { SettingsData } from "@/hooks/useSettings";

// Sample data pools for generating varied analyses
const circleUpdatePool = [
  { name: "Sarah", update: "got engaged in Kyoto" },
  { name: "Mike", update: "posted 3 photos from the launch" },
  { name: "Elena", update: "started a new role at Stripe" },
  { name: "James", update: "is traveling through Portugal" },
  { name: "Lisa", update: "launched her new podcast" },
  { name: "Carlos", update: "shared photos from his family gathering" },
  { name: "Priya", update: "ran her first 10K" },
  { name: "David", update: "shared holiday photos from Colorado" },
  { name: "Anna", update: "announced her engagement" },
  { name: "Tom", update: "completed his marathon goal" },
  { name: "Rachel", update: "got promoted to senior engineer" },
  { name: "Chris", update: "moved to Seattle" },
  { name: "Nina", update: "completed her morning yoga streak - 100 days!" },
  { name: "Alex", update: "launched a new startup" },
];

const worldUpdatePool = [
  { source: "The Verge", summary: "Apple's latest AI features transform how users interact with their devices, bringing contextual awareness to everyday tasks." },
  { source: "Bloomberg", summary: "Tech stocks rally as investors bet on continued AI momentum heading into the new year." },
  { source: "Wired", summary: "The future of wearables looks increasingly health-focused as new sensors enable continuous monitoring." },
  { source: "NYT", summary: "Morning markets show optimism as Asian trading closes higher across the board." },
  { source: "TechCrunch", summary: "Early reports suggest holiday gadget sales exceeded expectations." },
  { source: "Reuters", summary: "Supply chain improvements lead to shorter delivery times this holiday season." },
  { source: "Engadget", summary: "Smart home devices dominate post-holiday returns as gift recipients upgrade." },
  { source: "Ars Technica", summary: "New open-source language models challenge proprietary alternatives in benchmark tests." },
  { source: "The Verge", summary: "Gaming consoles see record holiday sales as new exclusive titles drive demand." },
  { source: "Bloomberg", summary: "Asian markets open strong following Christmas holiday break." },
  { source: "TechCrunch", summary: "The startup ecosystem sees renewed investor confidence as AI companies demonstrate sustainable business models." },
  { source: "Wired", summary: "Holiday tech gifts trend toward privacy-focused devices as consumers become more security conscious." },
];

// Shuffle array and pick n items
const pickRandom = <T>(arr: T[], count: number): T[] => {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
};

// Parse time string like "8:00 AM" to hours and minutes
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

// Generate a single analysis for a specific date/time
const generateAnalysis = (date: Date, location: string): AnalysisData => {
  return {
    date,
    location,
    circleUpdates: pickRandom(circleUpdatePool, 2 + Math.floor(Math.random() * 3)),
    worldUpdates: pickRandom(worldUpdatePool, 3),
  };
};

/**
 * Generate demo analyses based on user schedule settings.
 * Creates analyses for the past N days based on the user's digest frequency.
 */
export const generateScheduledDemoAnalyses = (
  settings: SettingsData,
  daysBack: number = 7
): AnalysisData[] => {
  const analyses: AnalysisData[] = [];
  const now = new Date();
  const location = settings.location || "Cupertino";
  
  const morningTime = parseTime(settings.morningTime);
  const eveningTime = parseTime(settings.eveningTime);
  
  // Generate analyses for past days (not including today)
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
