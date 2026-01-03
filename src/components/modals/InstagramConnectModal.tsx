import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Check } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface InstagramConnectModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess?: () => void;
    autoCloseDelay?: number; // If set, will auto-close after success
}

type InstagramPhase = "trigger" | "connecting" | "success";

export const InstagramConnectModal = ({
    isOpen,
    onClose,
    onSuccess,
    autoCloseDelay
}: InstagramConnectModalProps) => {
    const [phase, setPhase] = useState<InstagramPhase>("connecting");
    const loginTargetRef = useRef<HTMLDivElement>(null);
    const hasLaunchedRef = useRef(false);

    // Reset phase when opened
    useEffect(() => {
        if (isOpen) {
            setPhase("connecting");
        }
    }, [isOpen]);

    // Trigger Login Flow on Mount (Once)
    useEffect(() => {
        if (!isOpen || phase !== 'connecting' || hasLaunchedRef.current) return;

        const startOverlay = async () => {
            if (!loginTargetRef.current) return;
            hasLaunchedRef.current = true;

            // Calculate Screen Coordinates for the Overlay
            const rect = loginTargetRef.current.getBoundingClientRect();
            // Convert to integer screen coordinates (Main process expects integers)
            const bounds = {
                x: Math.round(window.screenX + rect.left),
                y: Math.round(window.screenY + rect.top),
                width: Math.round(rect.width),
                height: Math.round(rect.height)
            };

            console.log("🚀 Triggering Overlay Login at:", bounds);

            try {
                // @ts-ignore
                const success = await window.api.startLogin(bounds);
                if (success) {
                    setPhase("success");
                    if (onSuccess) onSuccess();
                    if (autoCloseDelay) {
                        setTimeout(() => onClose(), autoCloseDelay);
                    }
                } else {
                    // Start Over / Error
                    hasLaunchedRef.current = false; // Allow retry?
                    // Maybe show error state
                }
            } catch (e) {
                console.error("Overlay Login Error:", e);
                hasLaunchedRef.current = false;
            }
        };

        // Small delay to ensure render layout
        setTimeout(startOverlay, 500);

    }, [isOpen, phase]);

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="border-0 p-0 w-screen h-screen max-w-none bg-background rounded-none overflow-hidden [&>button]:hidden shadow-none" overlayClassName="bg-transparent backdrop-blur-none">
                <AnimatePresence mode="wait">

                    {/* PHASE 1: CONNECTING (WEBVIEW) */}
                    {phase === "connecting" && (
                        <motion.div
                            key="connecting"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.3 }}
                            className="w-full h-full flex flex-col bg-transparent" // CHANGED: Transparent background
                        >
                            <div
                                ref={loginTargetRef}
                                id="login-placeholder"
                                style={{ width: '100%', height: '100%' }}
                                className="bg-transparent" // Transparent so we see the overlay
                            />
                        </motion.div>
                    )}

                    {/* PHASE 2: SUCCESS */}
                    {phase === "success" && (
                        <motion.div
                            key="success"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.3 }}
                            className="w-full h-full bg-paper text-ink flex flex-col items-center justify-center p-8 text-center"
                        >
                            <div className="flex flex-col items-center space-y-6 mb-12">
                                <div className="p-4 border-2 border-ink/10 rounded-full">
                                    <Check className="w-12 h-12 text-ink" strokeWidth={1.5} />
                                </div>
                                <div className="space-y-2">
                                    <h2 className="text-4xl font-serif tracking-tight text-ink">Connection Established</h2>
                                    <p className="text-lg text-ink/60 font-sans tracking-wide uppercase text-sm">Secure session captured</p>
                                </div>
                            </div>

                            {/* Only show buttons if NOT auto-closing */}
                            {!autoCloseDelay && (
                                <div className="flex flex-col gap-4 w-full max-w-xs">
                                    <Button
                                        variant="ghost"
                                        onClick={async () => {
                                            // @ts-ignore
                                            const result = await window.api.testHeadless();
                                            alert(result);
                                        }}
                                        className="w-full"
                                    >
                                        Test Headless Mode
                                    </Button>

                                    <Button
                                        variant="default"
                                        onClick={() => {
                                            // Standard Onboarding Flow: Leave it to parent to handle transition
                                            if (onSuccess) onSuccess();
                                            // We don't close here automatically, the parent logic usually handles it
                                            // checking ZeroStateScreen logic: it closes manually.
                                            // Actually, let's keep it simple: the parent passed onSuccess, let parent decide.
                                            // BUT for the existing 'Continue' button, we need a trigger.
                                            // Let's just create a 'Continue' button that calls onClose() if no autoCloseDelay.
                                            onClose();
                                        }}
                                        className="w-full"
                                    >
                                        Continue to App
                                    </Button>
                                </div>
                            )}
                        </motion.div>
                    )}
                </AnimatePresence>
            </DialogContent>
        </Dialog>
    );
};
