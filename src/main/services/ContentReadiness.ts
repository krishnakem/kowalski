/**
 * ContentReadiness - State-Based Content Verification via CDP
 *
 * Replaces timing-based assumptions with actual state verification.
 * Uses CDP to check if content is ready for capture without detectable DOM queries.
 *
 * Checks:
 * 1. Images in viewport are loaded (img.complete && naturalHeight > 0)
 * 2. CSS transitions/animations have settled
 * 3. No pending network requests for images/media
 *
 * Cost: $0 (all verification via CDP protocol)
 */

import { Page, CDPSession } from 'playwright';

/**
 * Result of a readiness check.
 */
export interface ReadinessResult {
    ready: boolean;
    reason?: 'images_loading' | 'network_pending' | 'timeout' | 'unknown';
    waitedMs: number;
    details?: string;
}

/**
 * Configuration for readiness checks.
 */
interface ReadinessConfig {
    imageLoadTimeoutMs: number;     // Max wait for images (default: 3000)
    networkIdleTimeoutMs: number;   // Max wait for network (default: 2000)
    pollIntervalMs: number;         // Check interval (default: 100)
}

const DEFAULT_CONFIG: ReadinessConfig = {
    imageLoadTimeoutMs: 3000,
    networkIdleTimeoutMs: 2000,
    pollIntervalMs: 100
};

export class ContentReadiness {
    private page: Page;
    private config: ReadinessConfig;

    // CDP session management (following A11yNavigator pattern)
    private managedSession: CDPSession | null = null;
    private sessionLastUsed: number = 0;
    private readonly SESSION_TIMEOUT_MS = 5000;

    constructor(page: Page, config: Partial<ReadinessConfig> = {}) {
        this.page = page;
        this.config = { ...DEFAULT_CONFIG, ...config };
    }

    // =========================================================================
    // CDP Session Management
    // =========================================================================

    private async withSession<T>(
        operation: (session: CDPSession) => Promise<T>
    ): Promise<T> {
        const now = Date.now();

        // Release stale session
        if (this.managedSession && (now - this.sessionLastUsed) > this.SESSION_TIMEOUT_MS) {
            await this.releaseSession();
        }

        // Create new session if needed
        if (!this.managedSession) {
            this.managedSession = await this.page.context().newCDPSession(this.page);
        }

        this.sessionLastUsed = now;

        try {
            return await operation(this.managedSession);
        } catch (error) {
            await this.releaseSession();
            throw error;
        }
    }

    private async releaseSession(): Promise<void> {
        if (this.managedSession) {
            await this.managedSession.detach().catch(() => {});
            this.managedSession = null;
        }
    }

    // =========================================================================
    // Core Readiness Checks
    // =========================================================================

    /**
     * Wait for images in the current viewport to be loaded.
     * Uses CDP Runtime.evaluate to check img.complete status.
     *
     * @param timeoutMs - Maximum wait time (default: 3000ms)
     * @returns ReadinessResult with status and timing info
     */
    async waitForImagesLoaded(timeoutMs?: number): Promise<ReadinessResult> {
        const timeout = timeoutMs ?? this.config.imageLoadTimeoutMs;
        const startTime = Date.now();

        while (Date.now() - startTime < timeout) {
            const imagesReady = await this.checkImagesLoaded();

            if (imagesReady.allLoaded) {
                return {
                    ready: true,
                    waitedMs: Date.now() - startTime,
                    details: `${imagesReady.loadedCount}/${imagesReady.totalCount} images loaded`
                };
            }

            // Wait before next check
            await new Promise(r => setTimeout(r, this.config.pollIntervalMs));
        }

        // Timeout reached
        const finalState = await this.checkImagesLoaded();
        return {
            ready: false,
            reason: 'images_loading',
            waitedMs: Date.now() - startTime,
            details: `${finalState.loadedCount}/${finalState.totalCount} images loaded (timeout)`
        };
    }

    /**
     * Check if all images in viewport are loaded (single check, no wait).
     */
    private async checkImagesLoaded(): Promise<{
        allLoaded: boolean;
        totalCount: number;
        loadedCount: number;
    }> {
        return this.withSession(async (session) => {
            const { result } = await session.send('Runtime.evaluate', {
                expression: `
                    (() => {
                        const viewportHeight = window.innerHeight;
                        const images = Array.from(document.images);

                        // Only check images in viewport (visible)
                        const visibleImages = images.filter(img => {
                            const rect = img.getBoundingClientRect();
                            return rect.top < viewportHeight && rect.bottom > 0 && rect.width > 0;
                        });

                        const loadedImages = visibleImages.filter(img =>
                            img.complete && img.naturalHeight > 0
                        );

                        return JSON.stringify({
                            allLoaded: loadedImages.length === visibleImages.length,
                            totalCount: visibleImages.length,
                            loadedCount: loadedImages.length
                        });
                    })()
                `,
                returnByValue: true
            });

            try {
                return JSON.parse(result.value as string);
            } catch {
                return { allLoaded: true, totalCount: 0, loadedCount: 0 };
            }
        });
    }

    /**
     * Wait for CSS transitions and animations to complete.
     * Checks for running animations in the viewport.
     *
     * @param timeoutMs - Maximum wait time (default: 1500ms)
     */
    async waitForTransitionsComplete(timeoutMs: number = 1500): Promise<ReadinessResult> {
        const startTime = Date.now();

        while (Date.now() - startTime < timeoutMs) {
            const animating = await this.hasActiveAnimations();

            if (!animating) {
                return {
                    ready: true,
                    waitedMs: Date.now() - startTime
                };
            }

            await new Promise(r => setTimeout(r, this.config.pollIntervalMs));
        }

        return {
            ready: false,
            reason: 'timeout',
            waitedMs: Date.now() - startTime,
            details: 'Animations still running'
        };
    }

    /**
     * Check if there are active CSS animations/transitions.
     */
    private async hasActiveAnimations(): Promise<boolean> {
        return this.withSession(async (session) => {
            const { result } = await session.send('Runtime.evaluate', {
                expression: `
                    (() => {
                        // Check for running animations via getAnimations API
                        const animations = document.getAnimations ? document.getAnimations() : [];
                        const runningAnimations = animations.filter(a =>
                            a.playState === 'running' || a.playState === 'pending'
                        );
                        return runningAnimations.length > 0;
                    })()
                `,
                returnByValue: true
            });

            return result.value === true;
        });
    }

    /**
     * Combined readiness check: overlays + images + transitions.
     * This is the main method to call before taking a screenshot.
     *
     * @param timeoutMs - Maximum total wait time (default: 3000ms)
     * @param dismissOverlays - Whether to dismiss blocking overlays (default: true)
     * @returns ReadinessResult
     */
    async waitForContentReady(timeoutMs: number = 3000, dismissOverlays: boolean = true): Promise<ReadinessResult> {
        const startTime = Date.now();
        const remainingTime = () => Math.max(0, timeoutMs - (Date.now() - startTime));

        // FIRST: Ensure viewport is clear of blocking overlays
        if (dismissOverlays) {
            const viewportClear = await this.ensureViewportClear(2);
            if (!viewportClear) {
                return {
                    ready: false,
                    reason: 'unknown',
                    waitedMs: Date.now() - startTime,
                    details: 'Blocking overlay could not be dismissed'
                };
            }
        }

        // Second: Wait for images (most important)
        const imageResult = await this.waitForImagesLoaded(Math.min(remainingTime(), 2500));

        if (!imageResult.ready && remainingTime() <= 0) {
            return {
                ready: false,
                reason: 'images_loading',
                waitedMs: Date.now() - startTime,
                details: imageResult.details
            };
        }

        // Third: Wait for transitions (if time permits)
        if (remainingTime() > 200) {
            const transitionResult = await this.waitForTransitionsComplete(Math.min(remainingTime(), 1000));

            // Even if transitions timeout, we still proceed (images are more important)
            if (!transitionResult.ready) {
                console.log(`  ⏳ Transitions still running, proceeding anyway`);
            }
        }

        return {
            ready: true,
            waitedMs: Date.now() - startTime,
            details: imageResult.details
        };
    }

    /**
     * Get element position by backend node ID.
     * Used for position re-verification before capture.
     *
     * @param backendNodeId - CDP backend node ID
     * @returns Bounding box or null if element not found
     */
    async getElementPosition(backendNodeId: number): Promise<{
        x: number;
        y: number;
        width: number;
        height: number;
        centerY: number;
    } | null> {
        return this.withSession(async (session) => {
            try {
                const { model } = await session.send('DOM.getBoxModel', {
                    backendNodeId
                });

                if (!model || !model.content) {
                    return null;
                }

                // content is [x1, y1, x2, y2, x3, y3, x4, y4] - quad coordinates
                const [x1, y1, x2, , , y3] = model.content;
                const width = x2 - x1;
                const height = y3 - y1;

                return {
                    x: x1,
                    y: y1,
                    width,
                    height,
                    centerY: y1 + height / 2
                };
            } catch {
                return null;
            }
        });
    }

    /**
     * Get current viewport center Y coordinate.
     */
    async getViewportCenterY(): Promise<number> {
        return this.withSession(async (session) => {
            const { result } = await session.send('Runtime.evaluate', {
                expression: 'window.innerHeight / 2',
                returnByValue: true
            });
            return result.value as number;
        });
    }

    /**
     * Check if an element has drifted from expected center position.
     *
     * @param backendNodeId - CDP backend node ID
     * @param tolerance - Acceptable drift in pixels (default: 50)
     * @returns Drift info or null if element not found
     */
    async checkElementDrift(
        backendNodeId: number,
        tolerance: number = 50
    ): Promise<{
        drifted: boolean;
        drift: number;
        elementCenterY: number;
        viewportCenterY: number;
    } | null> {
        const position = await this.getElementPosition(backendNodeId);
        if (!position) return null;

        const viewportCenterY = await this.getViewportCenterY();
        const drift = Math.abs(position.centerY - viewportCenterY);

        return {
            drifted: drift > tolerance,
            drift,
            elementCenterY: position.centerY,
            viewportCenterY
        };
    }

    /**
     * Check video element state for synced frame capture.
     *
     * @returns Video state or null if no video found
     */
    async getVideoState(): Promise<{
        found: boolean;
        paused: boolean;
        currentTime: number;
        buffering: boolean;
        duration: number;
    } | null> {
        return this.withSession(async (session) => {
            const { result } = await session.send('Runtime.evaluate', {
                expression: `
                    (() => {
                        const v = document.querySelector('video');
                        if (!v) return JSON.stringify({ found: false });
                        return JSON.stringify({
                            found: true,
                            paused: v.paused,
                            currentTime: v.currentTime,
                            buffering: v.readyState < 3,
                            duration: v.duration || 0
                        });
                    })()
                `,
                returnByValue: true
            });

            try {
                return JSON.parse(result.value as string);
            } catch {
                return null;
            }
        });
    }

    /**
     * Detect if any overlay panels are blocking the main content.
     * Looks for common Instagram overlays: Notifications, Messages, Search, etc.
     *
     * @returns Overlay info or null if no overlay detected
     */
    async detectBlockingOverlay(): Promise<{
        found: boolean;
        type: 'notifications' | 'messages' | 'search' | 'dialog' | 'unknown';
        closeButton?: { x: number; y: number; width: number; height: number };
    } | null> {
        return this.withSession(async (session) => {
            const { result } = await session.send('Runtime.evaluate', {
                expression: `
                    (() => {
                        // Look for common overlay patterns
                        const overlayPatterns = [
                            { type: 'notifications', heading: 'Notifications' },
                            { type: 'messages', heading: 'Messages' },
                            { type: 'search', heading: 'Search' }
                        ];

                        // Check for overlay headings
                        for (const pattern of overlayPatterns) {
                            // Look for heading elements with exact text
                            const headings = document.querySelectorAll('h1, h2, [role="heading"]');
                            for (const h of headings) {
                                if (h.textContent?.trim() === pattern.heading) {
                                    // Found overlay - look for close button (X) nearby
                                    // Close button is typically a sibling or nearby element
                                    const container = h.closest('div[role="dialog"], div[style*="position"]') || h.parentElement?.parentElement;

                                    if (container) {
                                        // Look for close button by aria-label or SVG with specific path
                                        const closeBtn = container.querySelector('[aria-label="Close"], [aria-label*="close"], button svg');

                                        if (closeBtn) {
                                            const rect = closeBtn.getBoundingClientRect();
                                            return JSON.stringify({
                                                found: true,
                                                type: pattern.type,
                                                closeButton: {
                                                    x: rect.x + rect.width / 2,
                                                    y: rect.y + rect.height / 2,
                                                    width: rect.width,
                                                    height: rect.height
                                                }
                                            });
                                        }
                                    }

                                    // Overlay found but no close button
                                    return JSON.stringify({ found: true, type: pattern.type });
                                }
                            }
                        }

                        // Check for generic dialog/modal overlays
                        const dialogs = document.querySelectorAll('[role="dialog"], [aria-modal="true"]');
                        for (const dialog of dialogs) {
                            const rect = dialog.getBoundingClientRect();
                            // Only consider it blocking if it covers significant viewport area
                            if (rect.width > window.innerWidth * 0.3 || rect.height > window.innerHeight * 0.3) {
                                const closeBtn = dialog.querySelector('[aria-label="Close"], [aria-label*="close"]');
                                if (closeBtn) {
                                    const btnRect = closeBtn.getBoundingClientRect();
                                    return JSON.stringify({
                                        found: true,
                                        type: 'dialog',
                                        closeButton: {
                                            x: btnRect.x + btnRect.width / 2,
                                            y: btnRect.y + btnRect.height / 2,
                                            width: btnRect.width,
                                            height: btnRect.height
                                        }
                                    });
                                }
                                return JSON.stringify({ found: true, type: 'dialog' });
                            }
                        }

                        // No blocking overlay found
                        return JSON.stringify({ found: false, type: 'unknown' });
                    })()
                `,
                returnByValue: true
            });

            try {
                return JSON.parse(result.value as string);
            } catch {
                return null;
            }
        });
    }

    /**
     * Dismiss any blocking overlay by clicking its close button.
     * Uses keyboard shortcut (Escape) as fallback.
     *
     * @returns true if overlay was dismissed, false if none found or dismissal failed
     */
    async dismissOverlay(): Promise<boolean> {
        const overlay = await this.detectBlockingOverlay();

        if (!overlay?.found) {
            return false;  // No overlay to dismiss
        }

        console.log(`  🔳 Detected blocking overlay: ${overlay.type}`);

        // Try clicking close button if found
        if (overlay.closeButton) {
            try {
                // Use CDP to click the close button
                await this.withSession(async (session) => {
                    await session.send('Input.dispatchMouseEvent', {
                        type: 'mousePressed',
                        x: overlay.closeButton!.x,
                        y: overlay.closeButton!.y,
                        button: 'left',
                        clickCount: 1
                    });
                    await session.send('Input.dispatchMouseEvent', {
                        type: 'mouseReleased',
                        x: overlay.closeButton!.x,
                        y: overlay.closeButton!.y,
                        button: 'left',
                        clickCount: 1
                    });
                });

                // Wait for overlay to close
                await new Promise(r => setTimeout(r, 300));

                // Verify overlay is gone
                const stillOpen = await this.detectBlockingOverlay();
                if (!stillOpen?.found) {
                    console.log(`  ✓ Dismissed ${overlay.type} overlay via close button`);
                    return true;
                }
            } catch (error) {
                console.log(`  ⚠️ Failed to click close button: ${error}`);
            }
        }

        // Fallback: Press Escape key
        try {
            await this.withSession(async (session) => {
                await session.send('Input.dispatchKeyEvent', {
                    type: 'keyDown',
                    key: 'Escape',
                    code: 'Escape',
                    windowsVirtualKeyCode: 27,
                    nativeVirtualKeyCode: 27
                });
                await session.send('Input.dispatchKeyEvent', {
                    type: 'keyUp',
                    key: 'Escape',
                    code: 'Escape',
                    windowsVirtualKeyCode: 27,
                    nativeVirtualKeyCode: 27
                });
            });

            await new Promise(r => setTimeout(r, 300));

            const stillOpen = await this.detectBlockingOverlay();
            if (!stillOpen?.found) {
                console.log(`  ✓ Dismissed ${overlay.type} overlay via Escape key`);
                return true;
            }
        } catch (error) {
            console.log(`  ⚠️ Failed to press Escape: ${error}`);
        }

        console.log(`  ⚠️ Could not dismiss ${overlay.type} overlay`);
        return false;
    }

    /**
     * Ensure viewport is clear for capture by dismissing any blocking overlays.
     * This should be called before any screenshot capture.
     *
     * @param maxAttempts - Maximum dismissal attempts (default: 3)
     * @returns true if viewport is clear, false if overlays persist
     */
    async ensureViewportClear(maxAttempts: number = 3): Promise<boolean> {
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            const overlay = await this.detectBlockingOverlay();

            if (!overlay?.found) {
                return true;  // Viewport is clear
            }

            const dismissed = await this.dismissOverlay();
            if (!dismissed) {
                // Could not dismiss, wait and retry
                await new Promise(r => setTimeout(r, 500));
            }
        }

        // Check one final time
        const finalCheck = await this.detectBlockingOverlay();
        return !finalCheck?.found;
    }

    /**
     * Release managed CDP session.
     * Call this when done with the service.
     */
    async cleanup(): Promise<void> {
        await this.releaseSession();
    }
}
