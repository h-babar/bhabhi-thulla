import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App.js";
import { AuthProvider } from "./components/auth/AuthProvider.js";
import { VoiceChatProvider } from "./voice/VoiceChatProvider.js";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AuthProvider>
      <VoiceChatProvider>
        <App />
      </VoiceChatProvider>
    </AuthProvider>
  </React.StrictMode>
);
