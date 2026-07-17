import React from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";
import { getRouter } from "./router";
import "./styles.css";

// Restore the real path after the public/404.html → index.html?p=... redirect
// (Catalyst's Web Client Hosting has no SPA fallback rule, so 404.html does
// this trick for direct/deep links like /app/login — see public/404.html).
// Must run before the router is created so it picks up the correct location.
(function restoreRedirectedPath() {
  const params = new URLSearchParams(window.location.search);
  const redirectPath = params.get("p");
  if (redirectPath) {
    const q = params.get("q");
    const restored = redirectPath + (q ? `?${q}` : "") + window.location.hash;
    window.history.replaceState(null, "", restored);
  }
})();

const router = getRouter();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>
);
