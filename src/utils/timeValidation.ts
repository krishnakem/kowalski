/**
 * Utility for parsing time strings and validating schedule gaps.
 * Format expected: "8:00 AM", "4:30 PM", etc.
 */

/**
 * Converts a time string (e.g., "8:30 AM") into minutes from midnight.
 * Returns -1 if invalid format.
 */
export const parseMinutes = (timeStr: string): number => {
    const match = timeStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
    if (!match) return -1;

    let hours = parseInt(match[1], 10);
    const minutes = parseInt(match[2], 10);
    const period = match[3].toUpperCase();

    if (period === 'PM' && hours !== 12) hours += 12;
    if (period === 'AM' && hours === 12) hours = 0;

    return hours * 60 + minutes; // 0 to 1439
};

/**
 * Returns a filtered list of evening options that are at least 3 hours (180 mins)
 * after the selected morning time.
 * @param morningTime The current morning selection (e.g., "8:00 AM")
 * @param allEveningOptions The full list of potential evening slots
 */
export const getValidEveningOptions = (morningTime: string, allEveningOptions: string[]): string[] => {
    const morningMins = parseMinutes(morningTime);
    if (morningMins === -1) return allEveningOptions; // Fallback if parse fails

    const minGap = 180; // 3 hours in minutes

    return allEveningOptions.filter(option => {
        const eveningMins = parseMinutes(option);
        if (eveningMins === -1) return false;

        // Ensure strictly >= 3 hours after
        return eveningMins >= morningMins + minGap;
    });
};
