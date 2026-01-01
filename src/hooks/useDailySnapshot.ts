import { useState, useEffect } from 'react';
import type { ActiveSchedule } from '@/types/schedule';

export const useDailySnapshot = () => {
    const [snapshot, setSnapshot] = useState<ActiveSchedule | null>(null);
    const [isLoaded, setIsLoaded] = useState(false);

    useEffect(() => {
        const fetchSnapshot = async () => {
            try {
                const data = await window.api.settings.getActiveSchedule();
                if (data) {
                    setSnapshot(data);
                }
            } catch (error) {
                console.error("Failed to fetch daily snapshot:", error);
            } finally {
                setIsLoaded(true);
            }
        };

        fetchSnapshot();

        // Optional: We could listen for updates, but snapshots only change on new days or first launch.
        // A reload handles that.
    }, []);

    return { snapshot, isLoaded };
};
