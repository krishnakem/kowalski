/**
 * Generates randomized "Lorem Ipsum" analyses for simulation.
 */
export class LoremIpsumGenerator {
    static TITLES = [
        "The Digital Frontier",
        "Silicon Valley Morning",
        "The Cupertino Dispatch",
        "Tech & Culture Weekly",
        "The Midnight Protocol",
        "Future Tense",
        "The Analog Revival"
    ];
    static SUBTITLES = [
        "Exploring the intersection of humanity and algorithms.",
        "A deep dive into the week's events and their impact.",
        "Why the next big thing might be smaller than you think.",
        "Reflections on privacy, connection, and the digital self.",
        "Navigating the noise of the information age."
    ];
    static HEADINGS = [
        "The AI Revolution",
        "Market Shifts",
        "Global Perspectives",
        "Design Patterns",
        "Community & Core",
        "The New Normal",
        "Sustainable Futures"
    ];
    static PARAGRAPHS = [
        "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.",
        "Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.",
        "Sed ut perspiciatis unde omnis iste natus error sit voluptatem accusantium doloremque laudantium, totam rem aperiam, eaque ipsa quae ab illo inventore veritatis et quasi architecto beatae vitae dicta sunt explicabo.",
        "At vero eos et accusamus et iusto odio dignissimos ducimus qui blanditiis praesentium voluptatum deleniti atque corrupti quos dolores et quas molestias excepturi sint occaecati cupiditate non provident.",
        "Nam libero tempore, cum soluta nobis est eligendi optio cumque nihil impedit quo minus id quod maxime placeat facere possimus, omnis voluptas assumenda est, omnis dolor repellendus."
    ];
    static getRandom(array) {
        return array[Math.floor(Math.random() * array.length)];
    }
    static generateSection() {
        const numParagraphs = Math.floor(Math.random() * 3) + 1; // 1-3 paragraphs
        const content = [];
        for (let i = 0; i < numParagraphs; i++) {
            content.push(this.getRandom(this.PARAGRAPHS));
        }
        return {
            heading: this.getRandom(this.HEADINGS),
            content
        };
    }
    static generate(options) {
        const numSections = Math.floor(Math.random() * 2) + 2; // 2-3 sections
        const sections = [];
        for (let i = 0; i < numSections; i++) {
            sections.push(this.generateSection());
        }
        // Title Logic: [User Name]'s [Day] Analysis
        // Use provided targetDate (for back-dating) or current date
        const date = options?.targetDate ? new Date(options.targetDate) : new Date();
        const dayName = date.toLocaleDateString("en-US", { weekday: "long" });
        let title = `The ${dayName} Analysis`; // Default fallback
        if (options?.userName && options.userName.trim().length > 0) {
            const name = options.userName.trim();
            title = `${name}'s ${dayName} Analysis`;
        }
        // Location Logic: Use provided location or empty string (UI will hide if empty)
        const location = options?.location || "";
        return {
            title: title,
            subtitle: this.getRandom(this.SUBTITLES),
            date: date.toISOString(),
            location: location,
            scheduledTime: options?.scheduledTime || "8:00 AM",
            sections
        };
    }
}
