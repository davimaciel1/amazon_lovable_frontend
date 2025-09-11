import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  BarChart3, 
  ShoppingCart, 
  DollarSign, 
  TrendingUp, 
  LogOut,
  Package,
  Users,
  Activity
} from "lucide-react";
import { api } from "@/services/api";

const DashboardStyled = () => {
  const navigate = useNavigate();
  // Clerk removed; provide mock dev user
  const user: any = { id: 'dev', fullName: 'Dev User', primaryEmailAddress: { emailAddress: 'dev@example.com' } };
  const [dashboardData, setDashboardData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDashboard();
  }, []);

  const fetchDashboard = async () => {
    try {
      const result = await api.getDashboard();
      if (result.data) {
        setDashboardData(result.data);
      }
    } catch (error) {
      console.error('Error fetching dashboard:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    navigate('/');
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500 mx-auto"></div>
          <p className="mt-4 text-gray-600">Carregando dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <div className="flex items-center">
              <BarChart3 className="h-8 w-8 text-orange-500 mr-3" />
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
                <p className="text-sm text-gray-500">
                  Bem-vindo, {user?.fullName || user?.primaryEmailAddress?.emailAddress || 'Usuário'}
                </p>
              </div>
            </div>
            <Button 
              onClick={handleLogout}
              variant="destructive"
              className="flex items-center gap-2"
            >
              <LogOut className="h-4 w-4" />
              Sair
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Success Alert */}
        <Card className="mb-6 bg-green-50 border-green-200">
          <CardContent className="pt-6">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <Badge className="bg-green-500">✓</Badge>
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-green-800">
                  Login realizado com sucesso!
                </h3>
                <p className="mt-1 text-sm text-green-600">
                  Você está conectado ao sistema. Explore o dashboard para ver suas métricas.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* KPI Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Vendas Hoje
              </CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">
                R$ {dashboardData?.kpi?.todaySales?.toLocaleString('pt-BR') || '12.847,32'}
              </div>
              <p className="text-xs text-muted-foreground flex items-center mt-1">
                <TrendingUp className="h-3 w-3 mr-1 text-green-500" />
                +12% em relação a ontem
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Total de Pedidos
              </CardTitle>
              <ShoppingCart className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {dashboardData?.kpi?.totalOrders || 142}
              </div>
              <p className="text-xs text-muted-foreground">
                28 novos pedidos hoje
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Ticket Médio
              </CardTitle>
              <Activity className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                R$ {dashboardData?.kpi?.averageOrderValue?.toFixed(2) || '90,47'}
              </div>
              <p className="text-xs text-muted-foreground">
                Meta: R$ 100,00
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Taxa de Conversão
              </CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {dashboardData?.kpi?.conversionRate || 3.2}%
              </div>
              <p className="text-xs text-muted-foreground">
                +0.5% esta semana
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Quick Actions */}
        <Card>
          <CardHeader>
            <CardTitle>Ações Rápidas</CardTitle>
            <CardDescription>
              Navegue para outras áreas do sistema
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Button 
                onClick={() => navigate('/sales')}
                className="w-full justify-start"
                variant="outline"
              >
                <Package className="h-4 w-4 mr-2" />
                Ver Vendas
              </Button>
              <Button 
                onClick={() => navigate('/ai')}
                className="w-full justify-start"
                variant="outline"
              >
                <Activity className="h-4 w-4 mr-2" />
                AI Query (Vanna)
              </Button>
              <Button 
                onClick={() => navigate('/analytics')}
                className="w-full justify-start"
                variant="outline"
              >
                <BarChart3 className="h-4 w-4 mr-2" />
                Analytics
              </Button>
              <Button 
                onClick={() => navigate('/')}
                className="w-full justify-start"
                variant="outline"
              >
                <BarChart3 className="h-4 w-4 mr-2" />
                Página Inicial
              </Button>
              <Button 
                onClick={() => navigate('/auth')}
                className="w-full justify-start"
                variant="outline"
              >
                <Users className="h-4 w-4 mr-2" />
                Gerenciar Conta
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* User Info */}
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Informações da Conta</CardTitle>
            <CardDescription>
              Seus dados de usuário
            </CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="space-y-2">
              <div className="flex justify-between">
                <dt className="text-sm text-gray-600">ID:</dt>
                <dd className="text-sm font-medium">{user?.id}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-sm text-gray-600">Email:</dt>
                <dd className="text-sm font-medium">{user?.primaryEmailAddress?.emailAddress || 'dev@example.com'}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-sm text-gray-600">Nome:</dt>
                <dd className="text-sm font-medium">{user?.fullName || 'Não informado'}</dd>
              </div>
            </dl>
          </CardContent>
        </Card>
      </main>
    </div>
  );
};

export default DashboardStyled;
