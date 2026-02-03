import { useState, useEffect, useRef } from "react";

/**
 * Global type declaration for Instagram embed API.
 */
declare global {
    interface Window {
        instgrm?: {
            Embeds: {
                process: () => void;
            };
        };
    }
}

interface InstagramEmbedProps {
    postId: string;
    permalink: string;
    fallbackSrc?: string;  // Screenshot URL for fallback
}

/**
 * Instagram Embed Component
 *
 * Renders a native Instagram embed for featured posts.
 * Falls back to screenshot image if:
 * - User is offline
 * - Embed script fails to load
 * - Post has been deleted
 */
export function InstagramEmbed({ postId, permalink, fallbackSrc }: InstagramEmbedProps) {
    const [embedFailed, setEmbedFailed] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const containerRef = useRef<HTMLDivElement>(null);
    const scriptLoadedRef = useRef(false);

    useEffect(() => {
        // Check if we're offline
        if (!navigator.onLine) {
            setEmbedFailed(true);
            setIsLoading(false);
            return;
        }

        // Load Instagram embed script if not already loaded
        if (!window.instgrm && !scriptLoadedRef.current) {
            scriptLoadedRef.current = true;
            const script = document.createElement('script');
            script.src = '//www.instagram.com/embed.js';
            script.async = true;

            script.onload = () => {
                setIsLoading(false);
                // Process embeds after script loads
                setTimeout(() => {
                    window.instgrm?.Embeds.process();
                }, 100);
            };

            script.onerror = () => {
                console.warn('Instagram embed script failed to load');
                setEmbedFailed(true);
                setIsLoading(false);
            };

            document.body.appendChild(script);
        } else if (window.instgrm) {
            // Script already loaded, just process
            setIsLoading(false);
            setTimeout(() => {
                window.instgrm?.Embeds.process();
            }, 100);
        }

        // Set a timeout for embed loading (fallback if it takes too long)
        const timeout = setTimeout(() => {
            if (isLoading) {
                console.warn('Instagram embed timed out');
                setEmbedFailed(true);
                setIsLoading(false);
            }
        }, 10000); // 10 second timeout

        return () => clearTimeout(timeout);
    }, [postId, isLoading]);

    // Listen for online/offline events
    useEffect(() => {
        const handleOnline = () => {
            if (embedFailed) {
                setEmbedFailed(false);
                setIsLoading(true);
            }
        };

        const handleOffline = () => {
            setEmbedFailed(true);
        };

        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, [embedFailed]);

    // Fallback to screenshot if embed fails or offline
    if (embedFailed) {
        if (fallbackSrc) {
            return (
                <div className="instagram-embed-fallback">
                    <img
                        src={fallbackSrc}
                        alt={`Instagram post ${postId}`}
                        className="max-w-full max-h-[80vh] object-contain rounded-lg"
                    />
                    <p className="text-xs text-white/50 text-center mt-2">
                        {navigator.onLine ? 'Embed unavailable' : 'Offline - showing screenshot'}
                    </p>
                </div>
            );
        }
        return (
            <div className="text-white/50 text-center p-4">
                Embed unavailable
            </div>
        );
    }

    return (
        <div ref={containerRef} className="instagram-embed-container">
            {isLoading && (
                <div className="flex items-center justify-center p-8">
                    <div className="animate-pulse text-white/50">
                        Loading Instagram post...
                    </div>
                </div>
            )}
            <blockquote
                className="instagram-media"
                data-instgrm-permalink={permalink}
                data-instgrm-version="14"
                style={{
                    background: '#FFF',
                    border: '0',
                    borderRadius: '3px',
                    boxShadow: '0 0 1px 0 rgba(0,0,0,0.5), 0 1px 10px 0 rgba(0,0,0,0.15)',
                    margin: '1px',
                    maxWidth: '540px',
                    minWidth: '326px',
                    padding: '0',
                    width: '100%',
                    display: isLoading ? 'none' : 'block'
                }}
            >
                <a
                    href={permalink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-400 hover:underline"
                >
                    View on Instagram
                </a>
            </blockquote>
        </div>
    );
}
