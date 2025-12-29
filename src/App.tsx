import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { lazy, Suspense } from "react";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";

// Lazy-loaded routes for better initial bundle size
const Settings = lazy(() => import("./pages/Settings"));
const ScheduleSettings = lazy(() => import("./pages/settings/ScheduleSettings"));
const ApiSettings = lazy(() => import("./pages/settings/ApiSettings"));
const InterestsSettings = lazy(() => import("./pages/settings/InterestsSettings"));
const PersonalSettings = lazy(() => import("./pages/settings/PersonalSettings"));
const AnalysisArchive = lazy(() => import("./pages/AnalysisArchive"));

const queryClient = new QueryClient();

// Minimal loading fallback
const PageLoading = () => (
  <div className="min-h-screen bg-background" />
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Suspense fallback={<PageLoading />}>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/onboarding" element={<Index />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/settings/personal" element={<PersonalSettings />} />
            <Route path="/settings/schedule" element={<ScheduleSettings />} />
            <Route path="/settings/api" element={<ApiSettings />} />
            <Route path="/settings/interests" element={<InterestsSettings />} />
            <Route path="/archive" element={<AnalysisArchive />} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
