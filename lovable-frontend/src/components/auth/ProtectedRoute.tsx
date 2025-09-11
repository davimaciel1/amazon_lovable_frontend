import { useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredRole?: 'owner' | 'admin' | 'manager' | 'analyst' | 'viewer';
}

const ProtectedRoute = ({ children, requiredRole }: ProtectedRouteProps) => {
  const { user, profile, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !user) {
      navigate('/auth');
    }
  }, [user, loading, navigate]);

  // Show loading spinner while checking auth
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center space-y-4">
          <Loader2 className="h-8 w-8 animate-spin" />
          <p className="text-sm text-muted-foreground">Verificando autenticação...</p>
        </div>
      </div>
    );
  }

  // Redirect to auth if not logged in
  if (!user) {
    return null;
  }

  // Check role permissions if required
  if (requiredRole && profile) {
    const roleHierarchy = {
      'viewer': 1,
      'analyst': 2,
      'manager': 3,
      'admin': 4,
      'owner': 5
    };

    const userLevel = roleHierarchy[profile.role];
    const requiredLevel = roleHierarchy[requiredRole];

    if (userLevel < requiredLevel) {
      return (
        <div className="min-h-screen flex items-center justify-center">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-destructive mb-2">Acesso Negado</h1>
            <p className="text-muted-foreground">
              Você não tem permissão para acessar esta página.
            </p>
            <p className="text-sm text-muted-foreground mt-2">
              Nível necessário: {requiredRole} | Seu nível: {profile.role}
            </p>
          </div>
        </div>
      );
    }
  }

  return <>{children}</>;
};

export default ProtectedRoute;