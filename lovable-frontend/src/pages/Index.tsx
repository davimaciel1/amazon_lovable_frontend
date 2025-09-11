import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { TrendingUp, BarChart3, ShoppingCart, Target, DollarSign, Package, Users, Award, Activity, Zap, Shield, Monitor } from 'lucide-react';
import { CopilotStreamButton } from '@/components/copilot/CopilotStreamButton';
import { CopilotQuickPrompts } from '@/components/copilot/CopilotQuickPrompts';
import { CopilotTables } from '@/components/copilot/CopilotTables';

const Index = () => {
  // const { profile } = useAuth();

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-muted/20 to-background">
      {/* Header */}
      <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50">
        <div className="container mx-auto px-6 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-gradient-to-r from-orange-500 to-orange-600 rounded-lg flex items-center justify-center">
              <BarChart3 className="h-5 w-5 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold bg-gradient-to-r from-foreground to-muted-foreground bg-clip-text text-transparent">
                AppProfit
              </h2>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <Button variant="ghost" asChild>
              <Link to="/dashboard">Dashboard</Link>
            </Button>
            <Button variant="ghost" asChild>
              <Link to="/ai">AI Query</Link>
            </Button>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="container mx-auto px-6 py-16">
        <div className="text-center mb-16">
          <h1 className="text-6xl font-bold mb-6 bg-gradient-to-r from-foreground via-foreground to-muted-foreground bg-clip-text text-transparent">
            O Painel de Controle Definitivo para
            <br />
            <span className="text-orange-500">Vendedores Amazon</span>
          </h1>
          <p className="text-xl text-muted-foreground max-w-3xl mx-auto mb-8 leading-relaxed">
            Monitore suas vendas em tempo real, acompanhe estoque e analise lucros em todos
            os marketplaces com o AppProfit
          </p>
          <div className="flex flex-col sm:flex-row justify-center gap-4 mb-6">
            <Button size="lg" className="gap-2 px-8 py-3 bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700">
              <span>Vai Descomplicada</span>
              <TrendingUp className="h-5 w-5" />
            </Button>
            <Button variant="outline" size="lg" className="gap-2 px-8 py-3 hover:bg-muted/50">
              Ver Demo
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">
            Sem cartão de crédito • Configuração em 2 minutos • Cancele a qualquer momento
          </p>
          {/* Demo rápido do streaming do Copilot */}
          <div className="max-w-5xl mx-auto mt-6 space-y-4">
            <CopilotStreamButton />
            <CopilotQuickPrompts />
          </div>

          {/* Tabelas (dados estruturados) */}
          <div className="max-w-6xl mx-auto mt-6">
            <CopilotTables />
          </div>
        </div>

        {/* Dashboard Preview */}
        <div className="max-w-6xl mx-auto mb-20">
          <Card className="p-8 bg-gradient-to-br from-card via-card to-muted/20 border-2 shadow-2xl">
            <div className="flex items-center justify-between mb-8">
              <div className="flex items-center gap-3">
                <div className="flex gap-2">
                  <div className="w-3 h-3 rounded-full bg-red-500"></div>
                  <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
                  <div className="w-3 h-3 rounded-full bg-green-500"></div>
                </div>
                <span className="text-sm text-muted-foreground ml-4">appprofit Dashboard</span>
              </div>
              <Badge variant="secondary" className="bg-green-500/10 text-green-600 border-green-500/20">
                <div className="w-2 h-2 rounded-full bg-green-500 mr-2"></div>
                Live
              </Badge>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-6 mb-8">
              <Card className="p-4 bg-background/50 backdrop-blur">
                <div className="text-sm text-muted-foreground mb-1">Today's Sales</div>
                <div className="text-2xl font-bold text-green-600">$12,847.32</div>
                <div className="text-xs text-green-600 flex items-center gap-1">
                  <TrendingUp className="h-3 w-3" />
                  ↑ 23% vs yesterday
                </div>
              </Card>

              <Card className="p-4 bg-background/50 backdrop-blur">
                <div className="text-sm text-muted-foreground mb-1">Orders</div>
                <div className="text-2xl font-bold">142</div>
                <div className="text-xs text-blue-600">+28 new</div>
              </Card>

              <Card className="p-4 bg-background/50 backdrop-blur">
                <div className="text-sm text-muted-foreground mb-1">Units Sold</div>
                <div className="text-2xl font-bold">387</div>
                <div className="text-xs text-muted-foreground">2.7 units/order</div>
              </Card>

              <Card className="p-4 bg-background/50 backdrop-blur">
                <div className="text-sm text-muted-foreground mb-1">ACOS</div>
                <div className="text-2xl font-bold text-orange-600">18.4%</div>
                <div className="text-xs text-muted-foreground">Target: 15%</div>
              </Card>

              <Card className="p-4 bg-background/50 backdrop-blur">
                <div className="text-sm text-muted-foreground mb-1">Net Profit</div>
                <div className="text-2xl font-bold text-green-600">$4,231.87</div>
                <div className="text-xs text-green-600">32.9% margin</div>
              </Card>

              <Card className="p-4 bg-background/50 backdrop-blur">
                <div className="text-sm text-muted-foreground mb-1">Active Listings</div>
                <div className="text-2xl font-bold">28</div>
                <div className="text-xs text-red-600">3 low stock</div>
              </Card>
            </div>

            <Card className="p-6 bg-background/30 backdrop-blur">
              <h3 className="text-lg font-semibold mb-4">Top Performing Products</h3>
              <div className="space-y-3">
                <div className="grid grid-cols-6 gap-4 text-sm font-medium text-muted-foreground border-b pb-2">
                  <span>Product</span>
                  <span>Sales</span>
                  <span>Units</span>
                  <span>Revenue</span>
                  <span>Stock</span>
                  <span>Status</span>
                </div>
                <div className="grid grid-cols-6 gap-4 text-sm items-center">
                  <div>
                    <div className="font-medium">Premium Yoga Mat</div>
                    <div className="text-muted-foreground text-xs">B0CMYYZY2Q</div>
                  </div>
                  <span>38</span>
                  <span>52</span>
                  <span className="font-medium">$2,847.23</span>
                  <span>234</span>
                  <Badge variant="secondary" className="bg-green-500/10 text-green-600 text-xs">Active</Badge>
                </div>
                <div className="grid grid-cols-6 gap-4 text-sm items-center">
                  <div>
                    <div className="font-medium">Wireless Earbuds Pro</div>
                    <div className="text-muted-foreground text-xs">B0CHXHY4F4</div>
                  </div>
                  <span>32</span>
                  <span>41</span>
                  <span className="font-medium">$3,182.91</span>
                  <span className="text-orange-600">47</span>
                  <Badge variant="secondary" className="bg-orange-500/10 text-orange-600 text-xs">Low Stock</Badge>
                </div>
              </div>
            </Card>
          </Card>
        </div>
      </section>

      {/* Features Section */}
      <section className="container mx-auto px-6 py-16">
        <div className="text-center mb-16">
          <h2 className="text-4xl font-bold mb-4">Tudo que Você Precisa para Escalar seu Negócio na Amazon</h2>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
          <Card className="p-6 hover:shadow-lg transition-shadow text-center">
            <Monitor className="h-12 w-12 text-blue-500 mb-4 mx-auto" />
            <h3 className="text-xl font-semibold mb-3">Monitoramento em Tempo Real</h3>
            <p className="text-muted-foreground">
              Acompanhe vendas, pedidos e métricas atualizadas a cada minuto
            </p>
          </Card>

          <Card className="p-6 hover:shadow-lg transition-shadow text-center">
            <Package className="h-12 w-12 text-orange-500 mb-4 mx-auto" />
            <h3 className="text-xl font-semibold mb-3">Estoque Inteligente</h3>
            <p className="text-muted-foreground">
              Nunca fique sem estoque com alertas inteligentes
            </p>
          </Card>

          <Card className="p-6 hover:shadow-lg transition-shadow text-center">
            <Activity className="h-12 w-12 text-orange-500 mb-4 mx-auto" />
            <h3 className="text-xl font-semibold mb-3">Multi-marketplaces</h3>
            <p className="text-muted-foreground">
              Gerencie EUA, Reino Unido, Brasil e Europa em um lugar
            </p>
          </Card>

          <Card className="p-6 hover:shadow-lg transition-shadow text-center">
            <DollarSign className="h-12 w-12 text-orange-500 mb-4 mx-auto" />
            <h3 className="text-xl font-semibold mb-3">Análise de Lucro</h3>
            <p className="text-muted-foreground">
              Cálculo detalhado de lucros por ASIN (FBA vs FBM)
            </p>
          </Card>

          <Card className="p-6 hover:shadow-lg transition-shadow text-center">
            <Shield className="h-12 w-12 text-orange-500 mb-4 mx-auto" />
            <h3 className="text-xl font-semibold mb-3">Segurança Bancária</h3>
            <p className="text-muted-foreground">
              Integração oficial OAuth2 com Amazon SP-API
            </p>
          </Card>

          <Card className="p-6 hover:shadow-lg transition-shadow text-center">
            <Zap className="h-12 w-12 text-orange-500 mb-4 mx-auto" />
            <h3 className="text-xl font-semibold mb-3">Quick Setup</h3>
            <p className="text-muted-foreground">
              Conecte sua conta Amazon em menos de 2 minutos
            </p>
          </Card>
        </div>
      </section>

      {/* Testimonial Section */}
      <section className="container mx-auto px-6 py-16">
        <div className="text-center mb-16">
          <h2 className="text-4xl font-bold mb-4">Confiado por Vendedores Amazon em Todo o Mundo</h2>
        </div>

        <div className="grid md:grid-cols-3 gap-8">
          <Card className="p-6 bg-gradient-to-br from-card to-muted/20">
            <div className="flex text-orange-500 mb-4">
              ★★★★★
            </div>
            <p className="text-muted-foreground mb-4 italic">
              "O AppProfit transformou como gerencio meu negócio Amazon. Dados em tempo real me ajudaram a aumentar vendas em 40% em 3 meses!"
            </p>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-gradient-to-r from-blue-500 to-purple-500 flex items-center justify-center text-white font-semibold">
                JS
              </div>
              <div>
                <div className="font-semibold">Julia Silva</div>
                <div className="text-sm text-muted-foreground">Empreendedora E-commerce</div>
              </div>
            </div>
          </Card>

          <Card className="p-6 bg-gradient-to-br from-card to-muted/20">
            <div className="flex text-orange-500 mb-4">
              ★★★★★
            </div>
            <p className="text-muted-foreground mb-4 italic">
              "Os alertas de estoque me salvaram de rupturas múltiplas vezes. Esta ferramenta se paga sozinha!"
            </p>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-gradient-to-r from-green-500 to-teal-500 flex items-center justify-center text-white font-semibold">
                CS
              </div>
              <div>
                <div className="font-semibold">Carlos Santos</div>
                <div className="text-sm text-muted-foreground">Vendedor Amazon FBA</div>
              </div>
            </div>
          </Card>

          <Card className="p-6 bg-gradient-to-br from-card to-muted/20">
            <div className="flex text-orange-500 mb-4">
              ★★★★★
            </div>
            <p className="text-muted-foreground mb-4 italic">
              "Finalmente, um dashboard que realmente funciona! Interface limpa e análise poderosa."
            </p>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-gradient-to-r from-orange-500 to-red-500 flex items-center justify-center text-white font-semibold">
                AR
              </div>
              <div>
                <div className="font-semibold">Ana Costa</div>
                <div className="text-sm text-muted-foreground">Vendedora Multi-marketplace</div>
              </div>
            </div>
          </Card>
        </div>
      </section>

      {/* Pricing Section */}
      <section className="container mx-auto px-6 py-16">
        <div className="text-center mb-16">
          <h2 className="text-4xl font-bold mb-4">Choose Your Perfect Plan</h2>
          <p className="text-muted-foreground">Flexible plans for all types of Amazon sellers</p>
        </div>

        <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
          {/* Starter Plan */}
          <Card className="p-8 relative">
            <div className="text-center">
              <h3 className="text-2xl font-bold mb-2">Starter</h3>
              <p className="text-sm text-muted-foreground mb-6">UP TO 20 ASIN</p>
              <div className="mb-6">
                <span className="text-4xl font-bold">$14.99</span>
                <span className="text-muted-foreground">/month</span>
              </div>
              <ul className="text-left space-y-3 mb-8">
                <li className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-green-500"></div>
                  Monitor up to 50 products
                </li>
                <li className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-green-500"></div>
                  Real-time sale analytics
                </li>
                <li className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-green-500"></div>
                  Inventory tracking
                </li>
                <li className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-green-500"></div>
                  Buy Box alerts
                </li>
                <li className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-green-500"></div>
                  PPC insights
                </li>
                <li className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-green-500"></div>
                  Email support
                </li>
              </ul>
              <Button className="w-full bg-gray-900 hover:bg-gray-800 text-white">
                Get Started
              </Button>
            </div>
          </Card>

          {/* Professional Plan */}
          <Card className="p-8 relative border-2 border-orange-500">
            <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
              <Badge className="bg-orange-500 text-white px-4 py-1">MOST POPULAR</Badge>
            </div>
            <div className="text-center">
              <h3 className="text-2xl font-bold mb-2">Professional</h3>
              <p className="text-sm text-muted-foreground mb-6">UP TO 150 ASIN</p>
              <div className="mb-6">
                <span className="text-4xl font-bold">$29.99</span>
                <span className="text-muted-foreground">/month</span>
              </div>
              <ul className="text-left space-y-3 mb-8">
                <li className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-orange-500"></div>
                  Monitor up to 150 products
                </li>
                <li className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-orange-500"></div>
                  All Starter features
                </li>
                <li className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-orange-500"></div>
                  Advanced metrics
                </li>
                <li className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-orange-500"></div>
                  Detailed profit analysis
                </li>
                <li className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-orange-500"></div>
                  Export reports
                </li>
                <li className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-orange-500"></div>
                  Priority support
                </li>
              </ul>
              <Button className="w-full bg-orange-500 hover:bg-orange-600 text-white">
                Subscribe Now
              </Button>
            </div>
          </Card>

          {/* Enterprise Plan */}
          <Card className="p-8 relative">
            <div className="text-center">
              <h3 className="text-2xl font-bold mb-2">Enterprise</h3>
              <p className="text-sm text-muted-foreground mb-6">UNLIMITED ASIN</p>
              <div className="mb-6">
                <span className="text-4xl font-bold">$79.99</span>
                <span className="text-muted-foreground">/month</span>
              </div>
              <ul className="text-left space-y-3 mb-8">
                <li className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-green-500"></div>
                  Unlimited products
                </li>
                <li className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-green-500"></div>
                  All Professional features
                </li>
                <li className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-green-500"></div>
                  Complete data history
                </li>
                <li className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-green-500"></div>
                  Custom reports
                </li>
                <li className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-green-500"></div>
                  Dedicated support
                </li>
              </ul>
              <Button className="w-full bg-gray-900 hover:bg-gray-800 text-white">
                Subscribe Now
              </Button>
            </div>
          </Card>
        </div>

        <div className="text-center mt-8">
          <p className="text-sm text-muted-foreground">
            ✓ Secure payments processed via Stripe
          </p>
          <p className="text-sm text-muted-foreground">
            All plans include • 7-day free trial • Cancel anytime
          </p>
        </div>
      </section>

      {/* Final CTA Section */}
      <section className="bg-gray-900 text-white py-20">
        <div className="container mx-auto px-6 text-center">
          <h2 className="text-4xl font-bold mb-4">Pronto para Impulsionar suas Vendas na Amazon?</h2>
          <p className="text-xl text-gray-300 mb-8 max-w-2xl mx-auto">
            Junte-se a milhares de vendedores usando o AppProfit para crescer seus negócios
          </p>
          <Button size="lg" className="bg-orange-500 hover:bg-orange-600 text-white px-8 py-3">
            Comece sua Trial Grátis de 7 dias
          </Button>
          <p className="text-sm text-gray-400 mt-4">
            sem cartão de crédito • cancele a qualquer momento
          </p>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t bg-muted/30 backdrop-blur">
        <div className="container mx-auto px-6 py-8">
          <div className="flex flex-col md:flex-row justify-between items-center">
            <div className="flex items-center gap-3 mb-4 md:mb-0">
              <div className="w-8 h-8 bg-gradient-to-r from-orange-500 to-orange-600 rounded-lg flex items-center justify-center">
                <BarChart3 className="h-5 w-5 text-white" />
              </div>
              <span className="text-lg font-bold">AppProfit</span>
            </div>
            <div className="text-sm text-muted-foreground">
              © 2024 AppProfit. All rights reserved.
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Index;
