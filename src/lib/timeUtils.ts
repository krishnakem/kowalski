import { SettingsData } from "@/hooks/useSettings";

/**
 * Returns a greeting based on the current time of day
 */
export const getTimeOfDayGreeting = (): string => {
  const hour = new Date().getHours();

  if (hour >= 5 && hour < 12) {
    return "Good morning";
  } else if (hour >= 12 && hour < 18) {
    return "Good afternoon";
  } else {
    return "Good evening";
  }
};

/**
 * Parses a time string like "8:00 AM" into hours and minutes
 */
export const parseTimeString = (timeStr: string): { hours: number; minutes: number } => {
  const match = timeStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (!match) {
    return { hours: 8, minutes: 0 }; // Default fallback
  }

  let hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  const period = match[3].toUpperCase();

  if (period === "PM" && hours !== 12) {
    hours += 12;
  } else if (period === "AM" && hours === 12) {
    hours = 0;
  }

  return { hours, minutes };
};

/**
 * Calculates when the next analysis will be ready based on user settings.
 * If isFirstDay is true (fresh onboarding), always returns tomorrow's morning time
 * to account for the "next-day effect" where schedules activate the day after setup.
 */
export const getNextAnalysisTime = (settings: SettingsData, isFirstDay: boolean = false): string => {
  const morning = parseTimeString(settings.morningTime);

  // If this is the first day (just onboarded), schedule starts tomorrow
  if (isFirstDay) {
    const formattedTime = formatTime(morning.hours, morning.minutes);
    return `Tomorrow at ${formattedTime}`;
  }

  const now = new Date();
  const currentHour = now.getHours();
  const currentMinute = now.getMinutes();

  const evening = parseTimeString(settings.eveningTime);

  // Convert to minutes since midnight for easy comparison
  const nowMinutes = currentHour * 60 + currentMinute;
  const morningMinutes = morning.hours * 60 + morning.minutes;
  const eveningMinutes = evening.hours * 60 + evening.minutes;

  let nextTime: { hours: number; minutes: number };
  let isToday = true;

  if (settings.digestFrequency === 1) {
    // Once daily - only morning time
    if (nowMinutes < morningMinutes) {
      nextTime = morning;
    } else {
      nextTime = morning;
      isToday = false;
    }
  } else {
    // Twice daily - morning and evening
    if (nowMinutes < morningMinutes) {
      nextTime = morning;
    } else if (nowMinutes < eveningMinutes) {
      nextTime = evening;
    } else {
      nextTime = morning;
      isToday = false;
    }
  }

  // Format the time
  const formattedTime = formatTime(nextTime.hours, nextTime.minutes);
  const dayLabel = isToday ? "Today" : "Tomorrow";

  return `${dayLabel} at ${formattedTime}`;
};

/**
 * Formats hours and minutes into a readable time string
 */
const formatTime = (hours: number, minutes: number): string => {
  const period = hours >= 12 ? "PM" : "AM";
  const displayHours = hours % 12 || 12;
  const displayMinutes = minutes.toString().padStart(2, "0");

  return `${displayHours}:${displayMinutes} ${period}`;
};
