import { motion } from "framer-motion";
import { CheckCircle2, X } from "lucide-react";

interface GazetteScreenProps {
  onClose: () => void;
}

const circleUpdates = [
  { name: "Sarah", update: "got engaged in Kyoto", avatar: "S" },
  { name: "Mike", update: "posted 3 photos from the launch", avatar: "M" },
  { name: "Elena", update: "started a new role at Stripe", avatar: "E" },
  { name: "James", update: "is traveling through Portugal", avatar: "J" },
];

const worldUpdates = [
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

const GazetteScreen = ({ onClose }: GazetteScreenProps) => {
  const today = new Date();
  const dayName = today.toLocaleDateString("en-US", { weekday: "long" });
  const fullDate = today.toLocaleDateString("en-US", { 
    month: "long", 
    day: "numeric",
    year: "numeric"
  });

  return (
    <div className="min-h-screen flex flex-col items-center py-16 px-6">
      <motion.article
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8 }}
        className="max-w-[650px] w-full"
      >
        {/* Header */}
        <motion.header
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2, duration: 0.6 }}
          className="text-center mb-16 pb-8 border-b border-border/10"
        >
          <h1 className="text-4xl md:text-5xl font-serif text-foreground mb-4">
            The {dayName} Brief
          </h1>
          <p className="text-muted-foreground text-sm font-sans tracking-wide">
            {fullDate} • 3 min read • Sunnyvale
          </p>
        </motion.header>

        {/* The Circle Section */}
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4, duration: 0.6 }}
          className="mb-16"
        >
          <h2 className="text-2xl font-serif text-foreground mb-6 flex items-center gap-3">
            <span className="w-8 h-px bg-border/20" />
            The Circle
          </h2>
          <p className="text-muted-foreground text-sm mb-6 font-sans">
            Updates from people you care about
          </p>

          <ul className="space-y-4">
            {circleUpdates.map((item, index) => (
              <motion.li
                key={index}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.5 + index * 0.1, duration: 0.4 }}
                className="flex items-center gap-4 py-3"
              >
                <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center 
                                text-xs font-sans text-muted-foreground grayscale">
                  {item.avatar}
                </div>
                <p className="text-foreground font-sans">
                  <span className="font-medium">{item.name}</span>
                  <span className="text-muted-foreground"> {item.update}</span>
                </p>
              </motion.li>
            ))}
          </ul>
        </motion.section>

        {/* The World Section */}
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.8, duration: 0.6 }}
          className="mb-16"
        >
          <h2 className="text-2xl font-serif text-foreground mb-6 flex items-center gap-3">
            <span className="w-8 h-px bg-border/20" />
            The World
          </h2>
          <p className="text-muted-foreground text-sm mb-6 font-sans">
            High-signal updates from creators and news
          </p>

          <div className="space-y-8">
            {worldUpdates.map((item, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.9 + index * 0.15, duration: 0.4 }}
                className="pb-6 border-b border-border/5 last:border-0"
              >
                <p className="text-xs text-accent/80 font-sans tracking-wider uppercase mb-2">
                  {item.source}
                </p>
                <p className="text-foreground/90 font-sans leading-relaxed">
                  {item.summary}
                </p>
              </motion.div>
            ))}
          </div>
        </motion.section>

        {/* Footer - All Caught Up */}
        <motion.footer
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.4, duration: 0.6 }}
          className="text-center pt-12 border-t border-border/10"
        >
          <div className="flex flex-col items-center gap-6">
            <CheckCircle2 
              size={32} 
              strokeWidth={1} 
              className="text-accent/60" 
            />
            <p className="text-xl font-serif text-foreground/80 italic">
              You are all caught up.
            </p>
            <p className="text-muted-foreground/50 text-sm font-sans">
              Go do something meaningful.
            </p>

            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={onClose}
              className="mt-8 group inline-flex items-center gap-3 px-8 py-4 
                         border border-border/20 rounded-xl
                         text-foreground/80 font-sans text-sm tracking-widest uppercase
                         hover:border-accent/30 hover:bg-accent/5
                         transition-all duration-300"
            >
              <X size={16} strokeWidth={1.5} />
              <span>Close App</span>
            </motion.button>
          </div>
        </motion.footer>
      </motion.article>
    </div>
  );
};

export default GazetteScreen;