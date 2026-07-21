import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";

// ============================================================
// window.storage shim
// App.jsx was originally built to run inside a Claude.ai artifact,
// which provides a built-in `window.storage` API (get/set/delete/list)
// backed by Anthropic's servers. That API doesn't exist in a normal
// deployed website, so this shim recreates the exact same interface
// using the browser's built-in localStorage instead. Because the
// shapes match, App.jsx didn't need any of its ~40 window.storage
// call sites changed — this one shim is the entire adaptation.
// ============================================================
window.storage = {
  async get(key) {
    const raw = localStorage.getItem(key);
    if (raw === null) return null;
    return { key, value: raw };
  },
  async set(key, value) {
    localStorage.setItem(key, value);
    return { key, value };
  },
  async delete(key) {
    localStorage.removeItem(key);
    return { key, deleted: true };
  },
  async list(prefix) {
    const keys = Object.keys(localStorage).filter((k) => !prefix || k.startsWith(prefix));
    return { keys };
  },
};

// Catches errors that happen before/during React's first render and
// shows them directly on the page as plain text, instead of a silent
// blank screen. This matters a lot for debugging on mobile, where
// there's no easy way to open a JS console to see what actually failed.
function showFatalError(err) {
  const root = document.getElementById("root");
  if (root) {
    root.innerHTML =
      '<pre style="color:#ff6b6b;background:#0B0E1A;padding:20px;white-space:pre-wrap;font-size:13px;line-height:1.5;font-family:monospace;margin:0;min-height:100vh;box-sizing:border-box;">' +
      "Zynora Prime failed to start:\n\n" +
      (err?.stack || err?.message || String(err)) +
      "</pre>";
  }
}

window.addEventListener("error", (e) => showFatalError(e.error || e.message));
window.addEventListener("unhandledrejection", (e) => showFatalError(e.reason));

try {
  ReactDOM.createRoot(document.getElementById("root")).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
} catch (err) {
  showFatalError(err);
}

// Registering the service worker enables offline app-shell loading and
// is required for the browser to consider the app installable. Wrapped
// in a feature check + try/catch since older browsers may not support
// it at all — the app works fine without it, just without those two
// perks.
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}
