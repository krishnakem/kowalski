
interface UsageData {
    currentMonthSpend: number;
    lastResetDate: string; // ISO String
}

interface OpenAITokenUsage {
    prompt_tokens: number;
    completion_tokens: number;
    prompt_tokens_details?: {
        cached_tokens?: number;
    };
}

const MODEL_RATES = {
    INPUT_TOKEN: 0.0000025,       // $2.50 / 1M
    CACHED_INPUT_TOKEN: 0.00000125, // $1.25 / 1M
    OUTPUT_TOKEN: 0.00001,        // $10.00 / 1M
};

export class UsageService {
    private static instance: UsageService;

    private constructor() { }

    public static getInstance(): UsageService {
        if (!UsageService.instance) {
            UsageService.instance = new UsageService();
        }
        return UsageService.instance;
    }

    // Helper to dynamically load electron-store (ESM)
    private async getStore(): Promise<any> {
        const { default: Store } = await import('electron-store');
        return new Store();
    }

    /**
     * Initializes usage data if not present.
     * Performs monthly reset check on startup.
     */
    public async initialize(): Promise<void> {
        const store = await this.getStore();
        const usage = store.get('usageData') as UsageData;

        if (!usage) {
            const initial: UsageData = {
                currentMonthSpend: 0.00,
                lastResetDate: new Date().toISOString()
            };
            store.set('usageData', initial);
            return;
        }

        await this.checkMonthlyReset();
    }

    /**
     * Resets spending if we have entered a new month relative to lastResetDate.
     */
    public async checkMonthlyReset(): Promise<void> {
        const store = await this.getStore();
        const usage = store.get('usageData') as UsageData;
        if (!usage) return; // Should be handled by initialize

        const lastDate = new Date(usage.lastResetDate);
        const now = new Date();

        // Check if Month or Year is different
        if (lastDate.getMonth() !== now.getMonth() || lastDate.getFullYear() !== now.getFullYear()) {
            console.log('🗓️ Monthly Usage Reset Triggered.');
            const resetData: UsageData = {
                currentMonthSpend: 0.00,
                lastResetDate: now.toISOString()
            };
            store.set('usageData', resetData);
        }
    }

    /**
     * Calculates estimated cost for Vision requests (Pre-flight).
     * Returns cost in Dollars (e.g., 0.0005)
     */
    public calculateVisionCost(width: number, height: number, detail: 'low' | 'high' = 'high'): number {
        let tokens = 0;

        if (detail === 'low') {
            tokens = 85;
        } else {
            // High Detail Logic
            // 1. Maintain aspect ratio, scale to fit within 2048x2048
            let scaledWidth = width;
            let scaledHeight = height;

            if (scaledWidth > 2048 || scaledHeight > 2048) {
                const ratio = Math.min(2048 / scaledWidth, 2048 / scaledHeight);
                scaledWidth = Math.floor(scaledWidth * ratio);
                scaledHeight = Math.floor(scaledHeight * ratio);
            }

            // 2. Scale such that the shortest side is 768px
            const shortestSide = Math.min(scaledWidth, scaledHeight);
            const scaleFactor = 768 / shortestSide;
            scaledWidth = Math.floor(scaledWidth * scaleFactor);
            scaledHeight = Math.floor(scaledHeight * scaleFactor);

            // 3. Count 512x512 tiles needed
            const tilesX = Math.ceil(scaledWidth / 512);
            const tilesY = Math.ceil(scaledHeight / 512);
            const totalTiles = tilesX * tilesY;

            // 4. Formula
            tokens = 85 + (170 * totalTiles);
        }

        return tokens * MODEL_RATES.INPUT_TOKEN;
    }

    /**
     * Adds actual API usage to the accumulator.
     */
    public async incrementUsage(usage: OpenAITokenUsage): Promise<number> {
        const cached = usage.prompt_tokens_details?.cached_tokens || 0;
        const regularInput = Math.max(0, usage.prompt_tokens - cached);
        const output = usage.completion_tokens || 0;

        const cost = (regularInput * MODEL_RATES.INPUT_TOKEN) +
            (cached * MODEL_RATES.CACHED_INPUT_TOKEN) +
            (output * MODEL_RATES.OUTPUT_TOKEN);

        const store = await this.getStore();
        const currentData = store.get('usageData') as UsageData;

        // Safety initialization if missing
        const currentSpend = currentData?.currentMonthSpend || 0;
        const lastReset = currentData?.lastResetDate || new Date().toISOString();

        const newSpend = currentSpend + cost;

        store.set('usageData', {
            currentMonthSpend: newSpend,
            lastResetDate: lastReset
        });

        console.log(`💰 Usage Added: $${cost.toFixed(6)} | Total: $${newSpend.toFixed(4)}`);
        return newSpend;
    }

    /**
     * Checks if current spending + estimated cost exceeds the cap.
     */
    public async isOverBudget(cap: number, estimatedCost: number = 0): Promise<boolean> {
        const store = await this.getStore();
        const usage = store.get('usageData') as UsageData;
        const current = usage?.currentMonthSpend || 0;

        return (current + estimatedCost) >= cap;
    }

    /**
     * Returns current usage data.
     */
    public async getUsage(): Promise<UsageData> {
        const store = await this.getStore();
        return store.get('usageData') || { currentMonthSpend: 0, lastResetDate: new Date().toISOString() };
    }

    /**
     * Returns remaining budget and estimated API calls available.
     * Used for smart session planning.
     */
    public async getBudgetStatus(cap: number): Promise<{
        currentSpend: number;
        remaining: number;
        estimatedCallsRemaining: number;
    }> {
        const store = await this.getStore();
        const usage = store.get('usageData') as UsageData;
        const currentSpend = usage?.currentMonthSpend || 0;
        const remaining = Math.max(0, cap - currentSpend);

        // Estimate: ~$0.01 per Vision API call (low detail mode)
        const COST_PER_VISION_CALL = 0.01;
        const estimatedCallsRemaining = Math.floor(remaining / COST_PER_VISION_CALL);

        return { currentSpend, remaining, estimatedCallsRemaining };
    }

    /**
     * Quick check if we can afford at least one more Vision API call.
     */
    public async canAffordVisionCall(cap: number): Promise<boolean> {
        const COST_PER_VISION_CALL = 0.01;
        return !(await this.isOverBudget(cap, COST_PER_VISION_CALL));
    }
}
