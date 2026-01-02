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

import type { ActiveSchedule } from "@/types/schedule";

/**
 * Calculates when the next analysis will be ready based on locked schedule and completion status.
 *
 * Truth Source Logic:
 * 1. Active Schedule (Daily Snapshot) is the authority.
 * 2. If Today's slots are completed (checked via lastAnalysisDate), show Tomorrow.
 * 3. Fallback to Settings only if Active Schedule is missing (should not happen after onboarding).
 */
export const getNextAnalysisTime = (
  settings: SettingsData,
  activeSchedule: ActiveSchedule | null,
  isFirstDay: boolean = false,
  wakeTime: Date | null = null
): string => {
  // Use locked schedule if available, else fallback to settings
  const morningTimeStr = activeSchedule?.morningTime || settings.morningTime;
  const eveningTimeStr = activeSchedule?.eveningTime || settings.eveningTime;
  const frequency = activeSchedule?.digestFrequency || settings.digestFrequency;

  const morning = parseTimeString(morningTimeStr);
  const evening = parseTimeString(eveningTimeStr);

  // Buffer Logic Helper
  // Returns TRUE if the target slot is "buffered out" (too close to wake time)
  // Logic: Target (Today/Tomorrow) - WakeTime < 3 Hours
  const isBuffered = (targetTime: { hours: number, minutes: number }, isTargetTomorrow: boolean): boolean => {
    if (!wakeTime) return false;

    const now = new Date();
    const targetDate = new Date(now);
    targetDate.setHours(targetTime.hours, targetTime.minutes, 0, 0);
    if (isTargetTomorrow) {
      targetDate.setDate(targetDate.getDate() + 1);
    } else {
      // If target is today but time has passed, this logic is moot as we wouldn't pick it anyway.
      // But if it's future, we check.
    }

    const prepTimeMs = targetDate.getTime() - wakeTime.getTime();
    // TEST OVERRIDE: 15 seconds instead of 3 hours
    const threeHoursMs = 15 * 1000;

    const buffered = prepTimeMs < threeHoursMs;
    if (buffered) {
      console.log(`🛡️ UI BUFFERED: PrepTime=${Math.floor(prepTimeMs / 1000)}s needed=15s. Target=${targetDate.toLocaleTimeString()} Wake=${wakeTime.toLocaleTimeString()}`);
    }
    return buffered;
  };

  // If this is the first day (just onboarded), schedule starts tomorrow
  if (isFirstDay) {
    const formattedTime = formatTime(morning.hours, morning.minutes);
    return `Tomorrow at ${formattedTime}`;
  }

  const now = new Date();

  // COMPLETION CHECK: Has the user already received today's analysis?
  if (settings.lastAnalysisDate) {
    // ... [Existing Completion Logic] ...
    // Note: If we are "done for the day", the result is usually "Tomorrow".
    // We should theoretically check if "Tomorrow Morning" is buffered too?
    // Unlikely (launch > 21 hours before tomorrow morning), but possible if freq=2 and we just woke up late?
    // Let's assume Tomorrow logic is safe for now, or apply buffer check there too.

    // For simplicity, let's inject buffering into the standard flow below, 
    // OR just return standard "Tomorrow" if completed.
    // If we are strictly "Done", we are done.

    const lastDate = new Date(settings.lastAnalysisDate);
    const isLastAnalysisToday = lastDate.toDateString() === now.toDateString();

    if (isLastAnalysisToday) {
      if (frequency === 1) {
        const formattedTime = formatTime(morning.hours, morning.minutes);
        return `Tomorrow at ${formattedTime}`;
      }
      // Freq 2 logic
      const lastMinutes = lastDate.getHours() * 60 + lastDate.getMinutes();
      if (lastMinutes >= 12 * 60) {
        // Evening done -> Tomorrow Morning
        const formattedTime = formatTime(morning.hours, morning.minutes);
        return `Tomorrow at ${formattedTime}`;
      } else {
        // Morning done -> Tonight Evening
        // Check Buffer for Evening
        if (isBuffered(evening, false)) {
          // Evening buffered out -> Alert user it's Tomorrow Morning instead
          const formattedTime = formatTime(morning.hours, morning.minutes);
          return `Tomorrow at ${formattedTime}`;
        }
        const formattedTime = formatTime(evening.hours, evening.minutes);
        return `Today at ${formattedTime}`;
      }
    }
  }

  // STANDARD CHECK (No analysis today yet)
  const currentHour = now.getHours();
  const currentMinute = now.getMinutes();
  const nowMinutes = currentHour * 60 + currentMinute;
  const morningMinutes = morning.hours * 60 + morning.minutes;
  const eveningMinutes = evening.hours * 60 + evening.minutes;

  let nextTime: { hours: number; minutes: number };
  let isToday = true;

  if (frequency === 1) {
    // Once daily - only morning time
    // Fix: Use <= to ensure that during the 8:00 AM minute, we still say "Today"
    if (nowMinutes <= morningMinutes && !isBuffered(morning, false)) {
      nextTime = morning;
    } else {
      nextTime = morning;
      isToday = false;
    }
  } else {
    // Twice daily - morning and evening
    if (nowMinutes <= morningMinutes && !isBuffered(morning, false)) {
      nextTime = morning;
    } else if (nowMinutes <= eveningMinutes && !isBuffered(evening, false)) {
      // It's before evening. Is evening buffered?
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
