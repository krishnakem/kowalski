import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, ChevronLeft, ChevronRight } from "lucide-react";
import type { DigestImage } from "@/types/analysis";
import { InstagramEmbed } from "./InstagramEmbed";

interface ImageGalleryProps {
    images: DigestImage[];
    recordId: string;
    featuredIds?: number[];
}

/**
 * Image Gallery Component for Digest Display
 *
 * Shows a horizontal scrollable strip of thumbnails.
 * Clicking an image opens a lightbox with navigation.
 */
export function ImageGallery({ images, recordId, featuredIds = [] }: ImageGalleryProps) {
    const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

    // Debug: Log first image URL
    if (images.length > 0) {
        const firstUrl = `kowalski-local://${recordId}/images/${images[0].filename}`;
        console.log('📸 ImageGallery first image URL:', firstUrl);
    }

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
        if (selectedIndex !== null && selectedIndex < images.length - 1) {
            setSelectedIndex(selectedIndex + 1);
        }
    }, [selectedIndex, images.length]);

    // Handle keyboard navigation
    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (e.key === 'Escape') closeLightbox();
        if (e.key === 'ArrowLeft') goToPrevious();
        if (e.key === 'ArrowRight') goToNext();
    }, [closeLightbox, goToPrevious, goToNext]);

    if (!images || images.length === 0) {
        return null;
    }

    const selectedImage = selectedIndex !== null ? images[selectedIndex] : null;

    return (
        <>
            {/* Thumbnail Gallery */}
            <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.2 }}
                className="mb-8"
            >
                <div className="overflow-x-auto pb-2 -mx-4 px-4">
                    <div className="flex gap-2 min-w-min">
                        {images.map((image, index) => {
                            const isFeatured = featuredIds.includes(image.id);
                            return (
                                <motion.button
                                    key={image.id}
                                    initial={{ opacity: 0, scale: 0.9 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    transition={{ duration: 0.3, delay: 0.05 * index }}
                                    onClick={() => openLightbox(index)}
                                    className={`
                                        relative flex-shrink-0 overflow-hidden rounded-lg
                                        transition-all duration-200 hover:ring-2 hover:ring-primary
                                        ${isFeatured ? 'ring-2 ring-primary/50' : ''}
                                    `}
                                    style={{ width: 100, height: 100 }}
                                >
                                    <img
                                        src={`kowalski-local://${recordId}/images/${image.filename}`}
                                        alt={`Screenshot ${image.id}`}
                                        className="w-full h-full object-cover"
                                        loading="lazy"
                                        onError={(e) => {
                                            console.error('❌ Image load error:', {
                                                src: (e.target as HTMLImageElement).src,
                                                filename: image.filename,
                                                recordId
                                            });
                                        }}
                                        onLoad={() => {
                                            console.log('✅ Image loaded:', image.filename);
                                        }}
                                    />
                                    {/* Source badge */}
                                    <div className="absolute bottom-1 left-1 px-1.5 py-0.5 bg-black/60 rounded text-[10px] text-white font-sans">
                                        {image.source}
                                    </div>
                                </motion.button>
                            );
                        })}
                    </div>
                </div>

                {/* Gallery info */}
                <p className="text-xs text-muted-foreground font-sans mt-2 text-center">
                    {images.length} screenshots captured · tap to enlarge
                </p>
            </motion.div>

            {/* Lightbox */}
            <AnimatePresence>
                {selectedImage && selectedIndex !== null && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center"
                        onClick={closeLightbox}
                        onKeyDown={handleKeyDown}
                        tabIndex={0}
                    >
                        {/* Close button */}
                        <button
                            onClick={closeLightbox}
                            className="absolute top-4 right-4 p-2 text-white/70 hover:text-white transition-colors"
                        >
                            <X className="w-8 h-8" />
                        </button>

                        {/* Navigation - Previous */}
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

                        {/* Navigation - Next */}
                        {selectedIndex < images.length - 1 && (
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

                        {/* Main content - Embed for featured posts, Screenshot otherwise */}
                        <motion.div
                            key={selectedImage.id}
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            transition={{ duration: 0.2 }}
                            className="max-w-[90vw] max-h-[80vh] relative"
                            onClick={(e) => e.stopPropagation()}
                        >
                            {/* Check if this is a featured post with embed support */}
                            {featuredIds.includes(selectedImage.id) &&
                             selectedImage.postId &&
                             selectedImage.permalink ? (
                                <InstagramEmbed
                                    postId={selectedImage.postId}
                                    permalink={selectedImage.permalink}
                                    fallbackSrc={`kowalski-local://${recordId}/images/${selectedImage.filename}`}
                                />
                            ) : (
                                <img
                                    src={`kowalski-local://${recordId}/images/${selectedImage.filename}`}
                                    alt={`Screenshot ${selectedImage.id}`}
                                    className="max-w-full max-h-[80vh] object-contain rounded-lg"
                                />
                            )}

                            {/* Image info */}
                            <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/80 to-transparent rounded-b-lg">
                                <div className="flex items-center justify-between text-white">
                                    <div className="flex items-center gap-2">
                                        <span className="px-2 py-0.5 bg-white/20 rounded text-sm">
                                            {selectedImage.source}
                                        </span>
                                        {selectedImage.interest && (
                                            <span className="text-sm text-white/70">
                                                {selectedImage.interest}
                                            </span>
                                        )}
                                        {featuredIds.includes(selectedImage.id) && selectedImage.postId && (
                                            <span className="px-2 py-0.5 bg-gradient-to-r from-purple-500 to-pink-500 rounded text-[10px] text-white font-medium">
                                                FEATURED
                                            </span>
                                        )}
                                    </div>
                                    <span className="text-sm text-white/70">
                                        {selectedIndex + 1} / {images.length}
                                    </span>
                                </div>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </>
    );
}
