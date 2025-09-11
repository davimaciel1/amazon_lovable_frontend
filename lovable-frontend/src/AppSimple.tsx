import { BrowserRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "@/hooks/useAuth";
import { Toaster } from "@/components/ui/toaster";
import Auth from "./pages/Auth";
import AuthTest from "./pages/AuthTest";
import Dashboard from "./pages/Dashboard";
import Index from "./pages/Index";
import Sales from "./pages/Sales";
import NotFound from "./pages/NotFound";
import ProtectedRoute from "./components/auth/ProtectedRoute";

const queryClient = new QueryClient();

function AppSimple() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <Toaster />
          <Routes>
            <Route path="/auth" element={<Auth />} />
            <Route path="/auth-test" element={<AuthTest />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/" element={<Index />} />
            <Route
              path="/sales"
              element={
                <ProtectedRoute>
                  <Sales />
                </ProtectedRoute>
              }
            />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default AppSimple;