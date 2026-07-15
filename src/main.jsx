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

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
