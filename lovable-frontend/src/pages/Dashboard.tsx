import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/services/api";

const Dashboard = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState<any>(null);
  const [dashboardData, setDashboardData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Verificar se está autenticado
    const token = localStorage.getItem('access_token');
    const storedUser = localStorage.getItem('user');
    
    if (!token) {
      navigate('/auth-test');
      return;
    }

    if (storedUser) {
      setUser(JSON.parse(storedUser));
    }

    // Buscar dados do dashboard
    fetchDashboard();
  }, [navigate]);

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

  const handleLogout = () => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('user');
    navigate('/auth-test');
  };

  if (loading) {
    return (
      <div style={{ padding: "20px", textAlign: "center" }}>
        <h2>Carregando...</h2>
      </div>
    );
  }

  return (
    <div style={{ 
      padding: "20px", 
      maxWidth: "1200px", 
      margin: "0 auto", 
      fontFamily: "sans-serif" 
    }}>
      {/* Header */}
      <div style={{ 
        display: "flex", 
        justifyContent: "space-between", 
        alignItems: "center",
        marginBottom: "30px",
        borderBottom: "2px solid #eee",
        paddingBottom: "10px"
      }}>
        <div>
          <h1 style={{ margin: 0 }}>Dashboard</h1>
          {user && (
            <p style={{ color: "#666", margin: "5px 0" }}>
              Bem-vindo, {user.fullName || user.email}!
            </p>
          )}
        </div>
        <button 
          onClick={handleLogout}
          style={{ 
            padding: "10px 20px",
            backgroundColor: "#dc3545",
            color: "white",
            border: "none",
            borderRadius: "4px",
            cursor: "pointer"
          }}
        >
          Sair
        </button>
      </div>

      {/* Success Message */}
      <div style={{ 
        backgroundColor: "#d4edda",
        border: "1px solid #c3e6cb",
        color: "#155724",
        padding: "15px",
        borderRadius: "4px",
        marginBottom: "30px"
      }}>
        ✅ Login realizado com sucesso! Você está autenticado.
      </div>

      {/* KPI Cards */}
      <div style={{ 
        display: "grid", 
        gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))",
        gap: "20px",
        marginBottom: "30px"
      }}>
        <div style={{ 
          backgroundColor: "#f8f9fa",
          padding: "20px",
          borderRadius: "8px",
          boxShadow: "0 2px 4px rgba(0,0,0,0.1)"
        }}>
          <h3 style={{ margin: "0 0 10px 0", color: "#495057" }}>Vendas Hoje</h3>
          <p style={{ fontSize: "24px", fontWeight: "bold", color: "#28a745", margin: 0 }}>
            R$ {dashboardData?.kpi?.todaySales?.toLocaleString('pt-BR') || '12.847,32'}
          </p>
        </div>

        <div style={{ 
          backgroundColor: "#f8f9fa",
          padding: "20px",
          borderRadius: "8px",
          boxShadow: "0 2px 4px rgba(0,0,0,0.1)"
        }}>
          <h3 style={{ margin: "0 0 10px 0", color: "#495057" }}>Total de Pedidos</h3>
          <p style={{ fontSize: "24px", fontWeight: "bold", color: "#007bff", margin: 0 }}>
            {dashboardData?.kpi?.totalOrders || 142}
          </p>
        </div>

        <div style={{ 
          backgroundColor: "#f8f9fa",
          padding: "20px",
          borderRadius: "8px",
          boxShadow: "0 2px 4px rgba(0,0,0,0.1)"
        }}>
          <h3 style={{ margin: "0 0 10px 0", color: "#495057" }}>Ticket Médio</h3>
          <p style={{ fontSize: "24px", fontWeight: "bold", color: "#6610f2", margin: 0 }}>
            R$ {dashboardData?.kpi?.averageOrderValue?.toFixed(2) || '90,47'}
          </p>
        </div>

        <div style={{ 
          backgroundColor: "#f8f9fa",
          padding: "20px",
          borderRadius: "8px",
          boxShadow: "0 2px 4px rgba(0,0,0,0.1)"
        }}>
          <h3 style={{ margin: "0 0 10px 0", color: "#495057" }}>Conversão</h3>
          <p style={{ fontSize: "24px", fontWeight: "bold", color: "#fd7e14", margin: 0 }}>
            {dashboardData?.kpi?.conversionRate || 3.2}%
          </p>
        </div>
      </div>

      {/* Navigation Links */}
      <div style={{ 
        backgroundColor: "#fff",
        padding: "20px",
        borderRadius: "8px",
        boxShadow: "0 2px 4px rgba(0,0,0,0.1)"
      }}>
        <h2>Navegação</h2>
        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
          <button 
            onClick={() => navigate('/sales')}
            style={{ 
              padding: "10px 20px",
              backgroundColor: "#007bff",
              color: "white",
              border: "none",
              borderRadius: "4px",
              cursor: "pointer"
            }}
          >
            Vendas
          </button>
          <button 
            onClick={() => navigate('/')}
            style={{ 
              padding: "10px 20px",
              backgroundColor: "#6c757d",
              color: "white",
              border: "none",
              borderRadius: "4px",
              cursor: "pointer"
            }}
          >
            Página Inicial
          </button>
          <button 
            onClick={() => navigate('/auth-test')}
            style={{ 
              padding: "10px 20px",
              backgroundColor: "#17a2b8",
              color: "white",
              border: "none",
              borderRadius: "4px",
              cursor: "pointer"
            }}
          >
            Teste de Login
          </button>
        </div>
      </div>

      {/* User Info */}
      <div style={{ 
        marginTop: "30px",
        padding: "15px",
        backgroundColor: "#e9ecef",
        borderRadius: "4px",
        fontSize: "14px",
        color: "#495057"
      }}>
        <strong>Informações do Usuário:</strong>
        <pre style={{ margin: "10px 0", fontFamily: "monospace" }}>
          {JSON.stringify(user, null, 2)}
        </pre>
      </div>
    </div>
  );
};

export default Dashboard;