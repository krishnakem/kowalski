import { motion } from "framer-motion";

interface HeroCardProps {
    title: string;
    imageUrl?: string;
    date: string;
    time: string;
    location?: string;
    onImageError?: () => void;
}

/**
 * Hero Card Component - Apple News Style
 *
 * Full-width featured image with title overlay and gradient.
 * Falls back to solid color background if no image.
 */
export function HeroCard({
    title,
    imageUrl,
    date,
    time,
    location
}: HeroCardProps) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            className="relative w-full overflow-hidden rounded-lg mb-6"
        >
            {/* Image or fallback background */}
            <div className="relative aspect-[16/10] bg-gradient-to-br from-slate-800 to-slate-900">
                {imageUrl && (
                    <img
                        src={imageUrl}
                        alt="Featured post"
                        className="absolute inset-0 w-full h-full object-cover"
                        onError={(e) => {
                            // Hide image on error, show fallback gradient
                            (e.target as HTMLImageElement).style.display = 'none';
                        }}
                    />
                )}

                {/* Gradient overlay */}
                <div
                    className="absolute inset-0"
                    style={{
                        background: 'linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.4) 40%, transparent 100%)'
                    }}
                />

                {/* Content overlay */}
                <div className="absolute bottom-0 left-0 right-0 p-5">
                    {/* Title */}
                    <h1 className="font-serif text-3xl md:text-4xl text-white leading-tight mb-3">
                        {title}
                    </h1>

                    {/* Metadata */}
                    <div className="flex items-center gap-2 text-white/70 text-sm font-sans">
                        <span>{date}</span>
                        <span className="text-white/40">·</span>
                        <span>{time}</span>
                        {location && (
                            <>
                                <span className="text-white/40">·</span>
                                <span>{location}</span>
                            </>
                        )}
                    </div>
                </div>
            </div>
        </motion.div>
    );
}
