import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import "./index.css";

const root = document.getElementById("root")!;

const tree = (
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);

// Pages are prerendered at build time (scripts/prerender.mjs), so #root already
// holds the real markup. Hydrating adopts it; createRoot would throw it away
// and re-render, which shows a visible flash on a slow connection. Falls back
// to createRoot when there is nothing to adopt — `npm run dev` serves the plain
// shell, and so does any route the prerender step skipped.
if (root.firstElementChild) {
  ReactDOM.hydrateRoot(root, tree);
} else {
  ReactDOM.createRoot(root).render(tree);
}
