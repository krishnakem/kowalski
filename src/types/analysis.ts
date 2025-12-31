export interface AnalysisSection {
    heading: string;
    content: string[]; // Array of paragraphs
}

export interface AnalysisObject {
    title: string;
    subtitle: string;
    date: string | Date; // ISO string for storage, Date object in runtime
    location: string;
    sections: AnalysisSection[];
}

export interface ArchivedAnalysis {
    id: string;
    data: AnalysisObject;
    leadStoryPreview: string; // for quick display in lists
}
