export interface CircleUpdate {
  name: string;
  update: string;
}

export interface WorldUpdate {
  source: string;
  summary: string;
}

export const defaultCircleUpdates: CircleUpdate[] = [
  { name: "Sarah", update: "got engaged in Kyoto" },
  { name: "Mike", update: "posted 3 photos from the launch" },
  { name: "Elena", update: "started a new role at Stripe" },
  { name: "James", update: "is traveling through Portugal" },
];

export const defaultWorldUpdates: WorldUpdate[] = [
  {
    source: "The Verge",
    summary: "Apple announced the M4 chip lineup with significant improvements to neural engine performance, promising 2x faster on-device AI processing.",
  },
  {
    source: "Bloomberg",
    summary: "OpenAI reportedly in talks for a new funding round that would value the company at $150 billion, marking a significant increase from previous valuations.",
  },
  {
    source: "Wired",
    summary: "The EU's Digital Services Act takes full effect today, requiring major platforms to provide algorithmic transparency and content moderation appeals.",
  },
];
