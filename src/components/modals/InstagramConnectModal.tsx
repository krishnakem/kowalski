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
    const webviewRef = useRef<Electron.WebviewTag>(null);

    // Reset phase when opened
    useEffect(() => {
        if (isOpen) {
            setPhase("connecting");
        }
    }, [isOpen]);

    // Listen for Login Success
    useEffect(() => {
        if (!isOpen) return;

        // @ts-ignore
        const removeListener = window.api.onLoginSuccess(() => {
            console.log("🎉 MODAL RECEIVED SUCCESS SIGNAL!");
            setPhase("success");

            if (onSuccess) onSuccess();

            // Auto-close logic (for Switch Account flow)
            if (autoCloseDelay) {
                setTimeout(() => {
                    onClose(); // Close the modal
                }, autoCloseDelay);
            }
        });

        return () => {
            if (removeListener) removeListener();
        };
    }, [isOpen, onSuccess, autoCloseDelay, onClose]);

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
                            className="w-full h-full flex flex-col bg-black"
                        >
                            <webview
                                partition="persist:instagram_shared"
                                ref={webviewRef}
                                src="https://www.instagram.com/accounts/login/"
                                style={{ width: '100%', height: '100%' }}
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
