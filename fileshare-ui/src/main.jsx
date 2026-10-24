import React from "react";
import {BrowserRouter , Routes,Route} from "react-router-dom";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import Signup from "./pages/signup.jsx";
import Login from "./pages/login.jsx";
import "./App.css";

import { SocketProvider } from "./context/Socket.jsx";

ReactDOM.createRoot(document.getElementById("root")).render(
  <BrowserRouter>
  <SocketProvider>
    <Routes>
      <Route path="/App" element={<App/>}/>
      <Route path="/signup" element={<Signup/>}/>
      <Route path="/login" element={<Login/>}/>
    </Routes>
    
  </SocketProvider>
  </BrowserRouter>
  
);
