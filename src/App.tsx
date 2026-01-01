import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useNavigate } from "react-router-dom";
import { lazy, Suspense, useEffect } from "react";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";

// Lazy-loaded routes for better initial bundle size
const Settings = lazy(() => import("./pages/Settings"));
const ScheduleSettings = lazy(() => import("./pages/settings/ScheduleSettings"));
const ApiSettings = lazy(() => import("./pages/settings/ApiSettings"));
const InterestsSettings = lazy(() => import("./pages/settings/InterestsSettings"));
const PersonalSettings = lazy(() => import("./pages/settings/PersonalSettings"));
const AnalysisArchive = lazy(() => import("./pages/AnalysisArchive"));
const GazetteScreen = lazy(() => import("./components/screens/GazetteScreen"));

const queryClient = new QueryClient();

// Minimal loading fallback
const PageLoading = () => (
  <div className="min-h-screen bg-background" />
);

const AppRoutes = () => {
  const navigate = useNavigate();


  // Global listeners and state checks moved to Index.tsx to prevent hijacking navigation

  return (
    <Suspense fallback={<PageLoading />}>
      <Routes>
        <Route path="/" element={<Index />} />
        <Route path="/onboarding" element={<Index />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/settings/personal" element={<PersonalSettings />} />
        <Route path="/settings/schedule" element={<ScheduleSettings />} />
        <Route path="/settings/api" element={<ApiSettings />} />
        <Route path="/settings/interests" element={<InterestsSettings />} /> {/* Added missing route */}
        <Route path="/archive/:id" element={<GazetteScreen />} />
        <Route path="/archive" element={<AnalysisArchive />} />
        {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  );
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
