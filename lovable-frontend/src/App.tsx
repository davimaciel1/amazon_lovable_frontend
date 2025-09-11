import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
// import { 
//   SignedIn, 
//   SignedOut, 
//   RedirectToSignIn,
//   useAuth
// } from "@clerk/clerk-react";
import { ApiProvider } from "@/components/ApiProvider";
import { CopilotProvider } from "@/components/copilot/CopilotProvider";
import { CopilotChat } from "@/components/copilot/CopilotChat";
import Index from "./pages/Index";
import Sales from "./pages/Sales";
import DashboardStyled from "./pages/DashboardStyled";
import SignIn from "./pages/SignIn";
import SignUp from "./pages/SignUp";
import NotFound from "./pages/NotFound";
import AIQuery from "./pages/AIQuery";
import Analytics from "./pages/Analytics";
import MLOrders from "./pages/MLOrders";

const queryClient = new QueryClient();

// Temporarily disabled Clerk protection for testing
const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  // const { isSignedIn, isLoaded } = useAuth();
  
  // if (!isLoaded) {
  //   return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  // }
  
  // if (!isSignedIn) {
  //   return <Navigate to="/sign-in" replace />;
  // }
  
  return <>{children}</>;
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ApiProvider>
      <CopilotProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <Routes>
              {/* Public routes */}
              <Route path="/" element={<Index />} />
              <Route path="/sign-in/*" element={<SignIn />} />
              <Route path="/sign-up/*" element={<SignUp />} />
              
              {/* Redirect /auth to /sign-in for backward compatibility */}
              <Route path="/auth" element={<Navigate to="/sign-in" replace />} />
              
              {/* Protected Routes - Require Authentication */}
              <Route path="/dashboard" element={
                <ProtectedRoute>
                  <DashboardStyled />
                </ProtectedRoute>
              } />
              
              <Route path="/sales" element={
                <ProtectedRoute>
                  <Sales />
                </ProtectedRoute>
              } />
              <Route path="/ai" element={
                <ProtectedRoute>
                  <AIQuery />
                </ProtectedRoute>
              } />
              <Route path="/analytics" element={
                <ProtectedRoute>
                  <Analytics />
                </ProtectedRoute>
              } />
              <Route path="/ml/orders" element={
                <ProtectedRoute>
                  <MLOrders />
                </ProtectedRoute>
              } />
              
              {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
          {/* CopilotKit Chat Widget - Available on all pages */}
          <CopilotChat />
        </TooltipProvider>
      </CopilotProvider>
    </ApiProvider>
  </QueryClientProvider>
);

export default App;
