import { useState, useEffect } from 'react';

export const useSystemWakeTime = () => {
    const [wakeTime, setWakeTime] = useState<Date | null>(null);

    useEffect(() => {
        const fetchWakeTime = async () => {
            try {
                const date = await window.api.settings.getWakeTime();
                if (date) {
                    setWakeTime(new Date(date));
                }
            } catch (error) {
                console.error("Failed to fetch wake time:", error);
            }
        };

        fetchWakeTime();
    }, []);

    return { wakeTime };
};
