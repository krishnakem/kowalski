export interface AnalysisSection {
    heading: string;
    content: string[]; // Array of paragraphs
}

export interface AnalysisObject {
    title: string;
    subtitle: string;
    date: string | Date; // ISO string for storage, Date object in runtime
    location: string;
    scheduledTime: string; // e.g., "10:00 AM" - the slot this was triggered for
    sections: AnalysisSection[];
}

export interface ArchivedAnalysis {
    id: string;
    data: AnalysisObject;
    leadStoryPreview: string; // for quick display in lists
}
