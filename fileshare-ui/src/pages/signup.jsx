import React, { useState } from "react";
import axios from "axios";
import conf from "../conf/conf";
import { useNavigate, Link } from "react-router-dom";
import "./Signup.css";

function Signup() {
  const [myName, setMyName] = useState("");
  const [password, setPassword] = useState("");
  const [Mail, setMail] = useState("");

  const navigate = useNavigate();

  const handleAccountCreate = async (e) => {
    e.preventDefault();

    try {
      await axios.post(`${conf.path}/api/signin`, {
        userName: myName,
        email: Mail,
        password: password,
      });

      navigate("/login");
    } catch (err) {
      console.error(err);
      alert(err.response?.data?.message || "Unable to create account.");
    }
  };

  return (
    <div className="signup-page">
      <div className="signup-card">
        <div className="signup-brand">
          <div className="signup-brand-icon">FS</div>
          <div className="signup-brand-name">File Share</div>
        </div>

        <h2 className="signup-heading">Create your account</h2>

        <p className="signup-subtitle">
          Join File Share to upload, download, and manage your files.
        </p>

        <form onSubmit={handleAccountCreate}>
          <label className="signup-label" htmlFor="signup-email">
            Email address
          </label>

          <input
            id="signup-email"
            type="email"
            value={Mail}
            onChange={(e) => setMail(e.target.value)}
            className="signup-input"
            placeholder="you@example.com"
            autoComplete="email"
            required
          />

          <label className="signup-label" htmlFor="signup-name">
            Your name
          </label>

          <input
            id="signup-name"
            type="text"
            value={myName}
            onChange={(e) => setMyName(e.target.value)}
            className="signup-input"
            placeholder="Enter your name"
            autoComplete="name"
            required
          />

          <label className="signup-label" htmlFor="signup-password">
            Password
          </label>

          <input
            id="signup-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="signup-input"
            placeholder="Create a password"
            autoComplete="new-password"
            required
          />

          <button type="submit" className="signup-button">
            Create account
          </button>
        </form>

        <div className="signup-footer">
          Already have an account?
          <Link to="/login" className="signup-login-link">
            Log in
          </Link>
        </div>
      </div>
    </div>
  );
}

export default Signup;