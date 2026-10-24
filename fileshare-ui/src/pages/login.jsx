import React from "react";
import { useState, useEffect } from "react";
import App from "../App";
import "./Login.css";


import conf from "../conf/conf";
import { useNavigate } from "react-router-dom";
import axios from "axios";


function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
 

 
  
  const handleSubmit = async (e) => {
    e.preventDefault();

    try {
      const res = await axios.post(
        `/api/login`,
        {
          email: email,
          password: password,
        },
        {
          withCredentials: true,
        },
      );

      const token = res.data.token;
      localStorage.setItem("token",token);
       if (res.data.ok) {
      alert("Login successful");
      navigate("/App");
       }

     

      
    } catch (error) {
      if (error.response?.status === 401) {
        alert("Invalid Myname or password ❌");
      } else {
        alert("Server error ⚠️");
      }
    }
  };

  return (
  <div className="login-page">
    <div className="login-card">
      <div className="login-brand">
        <div className="login-brand-icon">FS</div>
        <div className="login-brand-name">File Share</div>
      </div>

      <h2 className="login-heading">Welcome back</h2>

      <p className="login-subtitle">
        Sign in to access your files and manage your server.
      </p>

      <form onSubmit={handleSubmit}>
        <label className="login-label" htmlFor="email">
          Email address
        </label>

        <input
          id="email"
          type="email"
          name="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="login-input"
          placeholder="you@example.com"
          autoComplete="email"
          required
        />

        <label className="login-label" htmlFor="password">
          Password
        </label>

        <input
          id="password"
          type="password"
          name="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="login-input"
          placeholder="Enter your password"
          autoComplete="current-password"
          required
        />

        <button type="submit" className="login-button">
          Login to File Share
        </button>
      </form>

      <div className="login-footer">
        Secure access to your <span>File Share</span> server
      </div>
    </div>
  </div>
);
}

export default Login;