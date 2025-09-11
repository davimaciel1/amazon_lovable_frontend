import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/services/api";

const AuthTest = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [message, setMessage] = useState("");
  const [isLogin, setIsLogin] = useState(true);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage("Processing...");

    try {
      let result;
      if (isLogin) {
        result = await api.login(email, password);
        if (result.data) {
          setMessage("Login successful! Token: " + result.data.accessToken.substring(0, 20) + "...");
          // Redirecionar após 1 segundo
          setTimeout(() => {
            navigate('/dashboard');
          }, 1000);
        } else {
          setMessage("Login failed: " + (result.error || "Unknown error"));
        }
      } else {
        result = await api.register(email, password, fullName);
        if (result.data) {
          setMessage("Registration successful! User ID: " + result.data.user.id);
        } else {
          setMessage("Registration failed: " + (result.error || "Unknown error"));
        }
      }
    } catch (error: any) {
      setMessage("Error: " + error.message);
    }
  };

  return (
    <div style={{ padding: "20px", maxWidth: "400px", margin: "0 auto", fontFamily: "sans-serif" }}>
      <h1>{isLogin ? "Login" : "Register"} Test Page</h1>
      
      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
        {!isLogin && (
          <input
            type="text"
            placeholder="Full Name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            style={{ padding: "8px", border: "1px solid #ccc", borderRadius: "4px" }}
          />
        )}
        
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          style={{ padding: "8px", border: "1px solid #ccc", borderRadius: "4px" }}
        />
        
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          style={{ padding: "8px", border: "1px solid #ccc", borderRadius: "4px" }}
        />
        
        <button 
          type="submit"
          style={{ 
            padding: "10px", 
            backgroundColor: "#007bff", 
            color: "white", 
            border: "none", 
            borderRadius: "4px",
            cursor: "pointer"
          }}
        >
          {isLogin ? "Login" : "Register"}
        </button>
      </form>
      
      <button 
        onClick={() => setIsLogin(!isLogin)}
        style={{ 
          marginTop: "10px",
          padding: "8px",
          backgroundColor: "#6c757d",
          color: "white",
          border: "none",
          borderRadius: "4px",
          cursor: "pointer",
          width: "100%"
        }}
      >
        Switch to {isLogin ? "Register" : "Login"}
      </button>
      
      {message && (
        <div style={{ 
          marginTop: "20px", 
          padding: "10px", 
          backgroundColor: message.includes("successful") ? "#d4edda" : "#f8d7da",
          color: message.includes("successful") ? "#155724" : "#721c24",
          borderRadius: "4px",
          wordBreak: "break-all"
        }}>
          {message}
        </div>
      )}
      
      <div style={{ marginTop: "20px", fontSize: "12px", color: "#666" }}>
        <p>Test credentials:</p>
        <p>Email: test@example.com</p>
        <p>Password: 123456</p>
      </div>
    </div>
  );
};

export default AuthTest;