import "./index.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App.jsx";
// Imported for its side effect: start listening for the native install prompt
// before React mounts, since the browser may fire it immediately.
import "./lib/installPrompt.js";

window.addEventListener("vite:preloadError", () => {
  if (sessionStorage.getItem("preloadErrorReloaded") === "1") return;
  sessionStorage.setItem("preloadErrorReloaded", "1");
  window.location.reload();
});
window.addEventListener("load", () => {
  sessionStorage.removeItem("preloadErrorReloaded");
});

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>
);