import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import Dashboard from "./pages/Dashboard";
import BiasCheck from "./pages/BiasCheck";
import AutoJournal from "./pages/AutoJournal";
import MindsetMirror from "./pages/MindsetMirror";
import Journals from "./pages/Journals";
import JournalDetail from "./pages/JournalDetail";
import SessionDetail from "./pages/SessionDetail";
import TradeNotes from "./pages/TradeNotes";
import NotFound from "./pages/NotFound";
import Auth from "./pages/Auth";
import PlaybookManager from "./pages/PlaybookManager";
import { AuthProvider } from "./components/AuthProvider";
import ProtectedRoute from "./components/ProtectedRoute";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 3,
      staleTime: 1000 * 60 * 5, // 5 minutes
      gcTime: 1000 * 60 * 10, // 10 minutes (formerly cacheTime)
    },
  },
});

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <AuthProvider>
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/auth" element={<Auth />} />
              
              <Route element={<ProtectedRoute />}>
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/bias-check" element={<BiasCheck />} />
                <Route path="/auto-journal" element={<AutoJournal />} />
                <Route path="/mindset-mirror" element={<MindsetMirror />} />
                <Route path="/journals" element={<Journals />} />
                <Route path="/journals/:journalId" element={<JournalDetail />} />
                <Route path="/journals/:journalId/sessions/:sessionId" element={<SessionDetail />} />
                <Route path="/trade-notes/:tradeId" element={<TradeNotes />} />
                <Route path="/playbooks" element={<PlaybookManager />} />
              </Route>
              
              {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
              <Route path="*" element={<NotFound />} />
            </Routes>
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;