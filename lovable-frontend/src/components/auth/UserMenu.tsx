import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { LogOut, Settings, User } from "lucide-react";

const UserMenu = () => {
  const { user, profile, signOut } = useAuth();

  // Se não houver user/profile, criar um fallback
  const displayUser = user || { email: 'test@example.com' };
  const displayProfile = profile || { 
    full_name: 'Test User',
    role: 'admin' as const,
    avatar_url: null,
    job_title: null
  };

  const getInitials = (name: string | null) => {
    if (!name) return displayUser.email?.[0]?.toUpperCase() || 'U';
    return name
      .split(' ')
      .map(word => word[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const getRoleColor = (role: string) => {
    switch (role) {
      case 'owner': return 'destructive';
      case 'admin': return 'default';
      case 'manager': return 'secondary';
      case 'analyst': return 'outline';
      case 'viewer': return 'outline';
      default: return 'outline';
    }
  };

  const getRoleLabel = (role: string) => {
    switch (role) {
      case 'owner': return 'Proprietário';
      case 'admin': return 'Administrador';
      case 'manager': return 'Gerente';
      case 'analyst': return 'Analista';
      case 'viewer': return 'Visualizador';
      default: return role;
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="relative h-10 w-10 rounded-full hover:bg-white/20 text-white">
          <Avatar className="h-10 w-10">
            <AvatarImage src={displayProfile.avatar_url || ''} alt={displayProfile.full_name || 'User'} />
            <AvatarFallback className="bg-primary text-primary-foreground">
              {getInitials(displayProfile.full_name)}
            </AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-64" align="end" forceMount>
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium leading-none">
                {displayProfile.full_name || 'Usuário'}
              </p>
              <Badge variant={getRoleColor(displayProfile.role)} className="text-xs">
                {getRoleLabel(displayProfile.role)}
              </Badge>
            </div>
            <p className="text-xs leading-none text-muted-foreground">
              {displayUser.email}
            </p>
            {displayProfile.job_title && (
              <p className="text-xs leading-none text-muted-foreground">
                {displayProfile.job_title}
              </p>
            )}
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem>
          <User className="mr-2 h-4 w-4" />
          <span>Perfil</span>
        </DropdownMenuItem>
        <DropdownMenuItem>
          <Settings className="mr-2 h-4 w-4" />
          <span>Configurações</span>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem 
          className="text-destructive focus:text-destructive"
          onClick={signOut}
        >
          <LogOut className="mr-2 h-4 w-4" />
          <span>Sair</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default UserMenu;