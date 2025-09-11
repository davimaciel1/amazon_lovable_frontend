import React from "react";

function AppTest() {
  return (
    <div style={{ padding: "20px", fontFamily: "sans-serif" }}>
      <h1>Frontend Funcionando!</h1>
      <p>Se você está vendo esta mensagem, o React está funcionando.</p>
      <div style={{ marginTop: "20px" }}>
        <h2>Links de Teste:</h2>
        <ul>
          <li><a href="/auth">Página de Login</a></li>
          <li><a href="/sales">Página de Vendas</a></li>
        </ul>
      </div>
    </div>
  );
}

export default AppTest;