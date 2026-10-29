import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";

if (window.location.pathname.replace(/\/$/, "") === "/painel") {
  window.history.replaceState(null, "", "/totem");
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
