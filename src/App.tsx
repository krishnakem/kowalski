import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import Settings from "./pages/Settings";
import ScheduleSettings from "./pages/settings/ScheduleSettings";
import ApiSettings from "./pages/settings/ApiSettings";
import InterestsSettings from "./pages/settings/InterestsSettings";
import AnalysisArchive from "./pages/AnalysisArchive";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/onboarding" element={<Index />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/settings/schedule" element={<ScheduleSettings />} />
          <Route path="/settings/api" element={<ApiSettings />} />
          <Route path="/settings/interests" element={<InterestsSettings />} />
          <Route path="/archive" element={<AnalysisArchive />} />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
