import { useState, useEffect, createContext, useContext } from "react";
import { toast } from "sonner";
import { api } from "@/services/api";

interface User {
  id: string;
  email: string;
  fullName?: string;
  tenantId?: string;
}

interface Profile {
  id: string;
  full_name: string | null;
  username: string | null;
  tenant_id: string | null;
  role: 'owner' | 'admin' | 'manager' | 'analyst' | 'viewer';
  avatar_url: string | null;
  phone: string | null;
  timezone: string;
  language: string;
  job_title: string | null;
  department: string | null;
  two_factor_enabled: boolean;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
}

interface AuthContextType {
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  signOut: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, fullName: string) => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  // Check for existing session on mount
  useEffect(() => {
    const checkAuth = async () => {
      try {
        // Check if we have a stored user and token
        const storedUser = api.getStoredUser();
        if (storedUser && api.isAuthenticated()) {
          // Validate the token by fetching current user
          const result = await api.getCurrentUser();
          if (result.data) {
            setUser(result.data);
            // For now, map user data to profile format
            setProfile({
              id: result.data.id,
              full_name: result.data.fullName || null,
              username: result.data.email?.split('@')[0] || null,
              tenant_id: result.data.tenantId || null,
              role: result.data.role || 'viewer',
              avatar_url: null,
              phone: null,
              timezone: 'America/Sao_Paulo',
              language: 'pt-BR',
              job_title: null,
              department: null,
              two_factor_enabled: false,
              last_login_at: new Date().toISOString(),
              created_at: result.data.createdAt || new Date().toISOString(),
              updated_at: result.data.updatedAt || new Date().toISOString(),
            });
          } else {
            // Token invalid or expired
            api.logout();
            setUser(null);
            setProfile(null);
          }
        }
      } catch (error) {
        console.error('Auth check error:', error);
        api.logout();
        setUser(null);
        setProfile(null);
      } finally {
        setLoading(false);
      }
    };

    checkAuth();
  }, []);

  const signIn = async (email: string, password: string) => {
    try {
      setLoading(true);
      const result = await api.login(email, password);
      
      if (result.error) {
        throw new Error(result.error);
      }
      
      if (result.data) {
        setUser(result.data.user);
        // Map user data to profile format
        setProfile({
          id: result.data.user.id,
          full_name: result.data.user.fullName || null,
          username: result.data.user.email?.split('@')[0] || null,
          tenant_id: result.data.user.tenantId || null,
          role: result.data.user.role || 'viewer',
          avatar_url: null,
          phone: null,
          timezone: 'America/Sao_Paulo',
          language: 'pt-BR',
          job_title: null,
          department: null,
          two_factor_enabled: false,
          last_login_at: new Date().toISOString(),
          created_at: result.data.user.createdAt || new Date().toISOString(),
          updated_at: result.data.user.updatedAt || new Date().toISOString(),
        });
        toast.success("Login realizado com sucesso!");
      }
    } catch (error: any) {
      console.error('Sign in error:', error);
      toast.error(error.message || "Erro ao fazer login");
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const signUp = async (email: string, password: string, fullName: string) => {
    try {
      setLoading(true);
      const result = await api.register(email, password, fullName);
      
      if (result.error) {
        throw new Error(result.error);
      }
      
      if (result.data) {
        setUser(result.data.user);
        // Map user data to profile format
        setProfile({
          id: result.data.user.id,
          full_name: result.data.user.fullName || fullName,
          username: result.data.user.email?.split('@')[0] || null,
          tenant_id: result.data.user.tenantId || null,
          role: result.data.user.role || 'viewer',
          avatar_url: null,
          phone: null,
          timezone: 'America/Sao_Paulo',
          language: 'pt-BR',
          job_title: null,
          department: null,
          two_factor_enabled: false,
          last_login_at: new Date().toISOString(),
          created_at: result.data.user.createdAt || new Date().toISOString(),
          updated_at: result.data.user.updatedAt || new Date().toISOString(),
        });
        toast.success("Conta criada com sucesso!");
      }
    } catch (error: any) {
      console.error('Sign up error:', error);
      if (error.message?.includes("already exists") || error.message?.includes("already registered")) {
        toast.error("Este e-mail já está cadastrado. Tente fazer login.");
      } else {
        toast.error(error.message || "Erro ao criar conta");
      }
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const signOut = async () => {
    try {
      setLoading(true);
      
      // Clean up local state
      setUser(null);
      setProfile(null);
      
      // Clear tokens and localStorage
      await api.logout();
      
      // Redirect to auth page
      window.location.href = '/auth';
    } catch (error: any) {
      console.error('Error during signout:', error);
      toast.error("Erro ao fazer logout");
    } finally {
      setLoading(false);
    }
  };

  const refreshProfile = async () => {
    if (user) {
      try {
        const result = await api.getCurrentUser();
        if (result.data) {
          setUser(result.data);
          // Update profile mapping
          setProfile({
            id: result.data.id,
            full_name: result.data.fullName || null,
            username: result.data.email?.split('@')[0] || null,
            tenant_id: result.data.tenantId || null,
            role: result.data.role || 'viewer',
            avatar_url: null,
            phone: null,
            timezone: 'America/Sao_Paulo',
            language: 'pt-BR',
            job_title: null,
            department: null,
            two_factor_enabled: false,
            last_login_at: new Date().toISOString(),
            created_at: result.data.createdAt || new Date().toISOString(),
            updated_at: result.data.updatedAt || new Date().toISOString(),
          });
        }
      } catch (error) {
        console.error('Error refreshing profile:', error);
      }
    }
  };

  return (
    <AuthContext.Provider value={{
      user,
      profile,
      loading,
      signOut,
      signIn,
      signUp,
      refreshProfile
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};