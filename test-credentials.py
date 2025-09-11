import requests
import json
from datetime import datetime, timedelta

print("=" * 80)
print("TESTE DE CREDENCIAIS AMAZON SP-API")
print("=" * 80)

# Credenciais do banco
credentials = {
    'client_id': '<AMAZON_CLIENT_ID>',
    'client_secret': '<AMAZON_OAUTH_SECRET>',
    'refresh_token': 'Atzr|IwEBIID-iI4wJ-OcVujiBk4abBTygOyNNi-A839JDkxrL_zlgF5F-2gNHXyP2WY0qGwun4pIvnQ50T04BOZqX9W0_-4s3awyvFAwSr6TQaaNkZey_Q2mzqp6LP1XFqygUV4HyX3qCyRVrPARAej8_bfZczI-qulgniSrKdeQP-8SnOeXq6ZZpLofOkee5zsbLvhy8dOqPllDIL5n1Sj3qJbxoZdPo1LRqbDUHqk_aCc8l4eVs33PZjVEQYANNAKBkLkiJBx8_JiPgWzDU77Nw-xC3268WnDSo5m0Q5LaN4vfSEaps06T9g1XMdMo1HOln3csuoc',
    'marketplace_id': 'ATVPDKIKX0DER',
    'endpoint': 'https://sellingpartnerapi-na.amazon.com',
    'seller_id': '<AMAZON_SELLER_ID>'
}

print("\n1. TESTANDO OBTENÇÃO DE ACCESS TOKEN...")
print("-" * 40)

# Passo 1: Obter Access Token
token_url = "https://api.amazon.com/auth/o2/token"
token_data = {
    'grant_type': 'refresh_token',
    'refresh_token': credentials['refresh_token'],
    'client_id': credentials['client_id'],
    'client_secret': credentials['client_secret']
}

try:
    token_response = requests.post(token_url, data=token_data, timeout=30)
    print(f"Status Code: {token_response.status_code}")
    
    if token_response.status_code == 200:
        token_json = token_response.json()
        access_token = token_json.get('access_token')
        expires_in = token_json.get('expires_in', 0)
        
        print(f"[OK] Access Token obtido com sucesso!")
        print(f"     Token: {access_token[:50]}...")
        print(f"     Expira em: {expires_in} segundos")
        
        # Passo 2: Testar chamada à SP-API
        print("\n2. TESTANDO CHAMADA SP-API (Orders)...")
        print("-" * 40)
        
        # Data de 30 dias atrás
        created_after = (datetime.utcnow() - timedelta(days=30)).strftime('%Y-%m-%dT%H:%M:%SZ')
        
        orders_url = f"{credentials['endpoint']}/orders/v0/orders"
        orders_params = {
            'MarketplaceIds': credentials['marketplace_id'],
            'CreatedAfter': created_after,
            'MaxResultsPerPage': '10'
        }
        orders_headers = {
            'x-amz-access-token': access_token,
            'Accept': 'application/json'
        }
        
        orders_response = requests.get(
            orders_url, 
            params=orders_params, 
            headers=orders_headers,
            timeout=30
        )
        
        print(f"Status Code: {orders_response.status_code}")
        
        if orders_response.status_code == 200:
            orders_json = orders_response.json()
            payload = orders_json.get('payload', {})
            orders = payload.get('Orders', [])
            
            print(f"[OK] Chamada SP-API bem sucedida!")
            print(f"     Pedidos encontrados: {len(orders)}")
            print(f"     Marketplace: {credentials['marketplace_id']} (USA)")
            print(f"     Seller ID: {credentials['seller_id']}")
            
            if orders:
                print(f"\n     Exemplo de pedido:")
                first_order = orders[0]
                print(f"     - Order ID: {first_order.get('AmazonOrderId')}")
                print(f"     - Status: {first_order.get('OrderStatus')}")
                print(f"     - Data: {first_order.get('PurchaseDate')}")
        else:
            print(f"[ERRO] Falha na chamada SP-API")
            print(f"       Resposta: {orders_response.text}")
            
    else:
        print(f"[ERRO] Falha ao obter Access Token")
        print(f"       Resposta: {token_response.text}")
        
except requests.exceptions.Timeout:
    print("[ERRO] Timeout na requisição")
except requests.exceptions.ConnectionError:
    print("[ERRO] Erro de conexão")
except Exception as e:
    print(f"[ERRO] Erro inesperado: {e}")

print("\n" + "=" * 80)
print("RESUMO DA VALIDAÇÃO")
print("=" * 80)

# Resumo
validations = {
    "Client ID formato": credentials['client_id'].startswith('amzn1.application-oa2-client.'),
    "Client Secret formato": credentials['client_secret'].startswith('amzn1.oa2-cs.'),
    "Refresh Token formato": credentials['refresh_token'].startswith('Atzr|'),
    "Marketplace USA": credentials['marketplace_id'] == 'ATVPDKIKX0DER',
    "Endpoint NA": credentials['endpoint'] == 'https://sellingpartnerapi-na.amazon.com',
    "Seller ID formato": len(credentials['seller_id']) == 14 and credentials['seller_id'].startswith('A')
}

for check, result in validations.items():
    status = "[OK]" if result else "[FALHA]"
    print(f"{status} {check}")

print("\n" + "=" * 80)
