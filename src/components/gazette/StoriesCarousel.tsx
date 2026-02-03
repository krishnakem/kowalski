import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, ChevronLeft, ChevronRight } from "lucide-react";
import type { StoryHighlight, DigestImage } from "@/types/analysis";

interface StoriesCarouselProps {
    highlights: StoryHighlight[];
    images: DigestImage[];
    recordId: string;
}

/**
 * Stories Carousel Component
 *
 * Displays a horizontal scrollable carousel of story cards.
 * Each card shows the story image with the account name overlaid.
 * Clicking a story opens a lightbox view.
 * Only shows interesting, LLM-curated stories (no ads).
 */
export function StoriesCarousel({ highlights, images, recordId }: StoriesCarouselProps) {
    const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

    const openLightbox = useCallback((index: number) => {
        setSelectedIndex(index);
    }, []);

    const closeLightbox = useCallback(() => {
        setSelectedIndex(null);
    }, []);

    const goToPrevious = useCallback(() => {
        if (selectedIndex !== null && selectedIndex > 0) {
            setSelectedIndex(selectedIndex - 1);
        }
    }, [selectedIndex]);

    const goToNext = useCallback(() => {
        if (selectedIndex !== null && selectedIndex < highlights.length - 1) {
            setSelectedIndex(selectedIndex + 1);
        }
    }, [selectedIndex, highlights.length]);

    // Get image for a story highlight
    const getImageForHighlight = (highlight: StoryHighlight): DigestImage | undefined => {
        return images.find(img => img.id === highlight.imageId);
    };

    if (highlights.length === 0) {
        return null;
    }

    const selectedHighlight = selectedIndex !== null ? highlights[selectedIndex] : null;
    const selectedImage = selectedHighlight ? getImageForHighlight(selectedHighlight) : null;

    return (
        <>
            {/* Stories Carousel */}
            <div className="mb-6">
                {/* Section Header */}
                <div className="px-4 mb-3">
                    <h2 className="font-sans font-semibold text-sm uppercase tracking-wide text-muted-foreground">
                        Stories
                    </h2>
                </div>

                {/* Horizontal Scroll Container - Card Carousel */}
                <div className="overflow-x-auto scrollbar-hide">
                    <div className="flex gap-3 px-4 pb-2">
                        {highlights.map((highlight, index) => {
                            const image = getImageForHighlight(highlight);
                            if (!image) return null;

                            return (
                                <motion.button
                                    key={highlight.imageId}
                                    initial={{ opacity: 0, x: 20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    transition={{ delay: index * 0.05 }}
                                    onClick={() => openLightbox(index)}
                                    className="flex-shrink-0 group relative"
                                >
                                    {/* Story Card */}
                                    <div className="relative w-[140px] h-[200px] rounded-xl overflow-hidden shadow-md group-hover:shadow-lg transition-shadow">
                                        {/* Story Image */}
                                        <img
                                            src={`kowalski-local://${recordId}/images/${image.filename}`}
                                            alt={highlight.account}
                                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                                            loading="lazy"
                                        />

                                        {/* Gradient overlay for text readability */}
                                        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />

                                        {/* Account name at bottom */}
                                        <div className="absolute bottom-0 left-0 right-0 p-3">
                                            <p className="text-white font-semibold text-sm truncate">
                                                {highlight.account}
                                            </p>
                                            {highlight.summary && (
                                                <p className="text-white/70 text-xs truncate mt-0.5">
                                                    {highlight.summary}
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                </motion.button>
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* Lightbox */}
            <AnimatePresence>
                {selectedIndex !== null && selectedHighlight && selectedImage && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center"
                        onClick={closeLightbox}
                    >
                        {/* Close button */}
                        <button
                            onClick={closeLightbox}
                            className="absolute top-4 right-4 p-2 text-white/70 hover:text-white transition-colors z-50"
                        >
                            <X className="w-8 h-8" />
                        </button>

                        {/* Navigation arrows */}
                        {selectedIndex > 0 && (
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    goToPrevious();
                                }}
                                className="absolute left-4 p-2 text-white/70 hover:text-white transition-colors"
                            >
                                <ChevronLeft className="w-10 h-10" />
                            </button>
                        )}

                        {selectedIndex < highlights.length - 1 && (
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    goToNext();
                                }}
                                className="absolute right-4 p-2 text-white/70 hover:text-white transition-colors"
                            >
                                <ChevronRight className="w-10 h-10" />
                            </button>
                        )}

                        {/* Story content */}
                        <motion.div
                            key={selectedHighlight.imageId}
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            transition={{ duration: 0.2 }}
                            className="max-w-[400px] max-h-[80vh] relative"
                            onClick={(e) => e.stopPropagation()}
                        >
                            {/* Story image */}
                            <img
                                src={`kowalski-local://${recordId}/images/${selectedImage.filename}`}
                                alt={selectedHighlight.account}
                                className="max-w-full max-h-[70vh] object-contain rounded-xl"
                            />

                            {/* Story info overlay */}
                            <div className="absolute top-0 left-0 right-0 p-4 bg-gradient-to-b from-black/60 to-transparent rounded-t-xl">
                                <div className="flex items-center gap-3">
                                    {/* Mini avatar (reuse thumbnail) */}
                                    <div className="w-10 h-10 rounded-full overflow-hidden border-2 border-white/30">
                                        <img
                                            src={`kowalski-local://${recordId}/images/${selectedImage.filename}`}
                                            alt={selectedHighlight.account}
                                            className="w-full h-full object-cover"
                                        />
                                    </div>
                                    <div>
                                        <p className="text-white font-semibold text-sm">
                                            {selectedHighlight.account}
                                        </p>
                                        {selectedHighlight.summary && (
                                            <p className="text-white/70 text-xs">
                                                {selectedHighlight.summary}
                                            </p>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Progress indicator */}
                            <div className="absolute bottom-4 left-0 right-0 flex justify-center">
                                <div className="flex gap-1">
                                    {highlights.map((_, idx) => (
                                        <div
                                            key={idx}
                                            className={`h-1 rounded-full transition-all ${
                                                idx === selectedIndex
                                                    ? 'w-6 bg-white'
                                                    : 'w-2 bg-white/40'
                                            }`}
                                        />
                                    ))}
                                </div>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </>
    );
}
