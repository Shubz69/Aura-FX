import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";

// Suppress Vercel instrumentation warnings in production
if (process.env.NODE_ENV === 'production') {
  const originalWarn = console.warn;
  const originalError = console.error;
  
  console.warn = (...args) => {
    const message = args[0]?.toString() || '';
    // Suppress Vercel instrumentation warnings and timeout errors
    if (
      message.includes('[DEPRECATED] Default export is deprecated') ||
      message.includes('zustand') ||
      message.includes('DialogContent') ||
      message.includes('DialogTitle') ||
      message.includes('aria-describedby') ||
      message.includes('Could not verify user existence') ||
      message.includes('TimeoutError') ||
      message.includes('signal timed out')
    ) {
      return; // Suppress these warnings
    }
    originalWarn.apply(console, args);
  };
  
  console.error = (...args) => {
    const message = args[0]?.toString() || '';
    // Suppress Vercel instrumentation errors (these are warnings, not real errors)
    if (
      message.includes('DialogContent') ||
      message.includes('DialogTitle') ||
      message.includes('aria-describedby') ||
      (message.includes('Fetch failed') && message.includes('feedback.js'))
    ) {
      return; // Suppress these errors
    }
    originalError.apply(console, args);
  };
}

const container = document.getElementById("root");

if (container) {
    const root = ReactDOM.createRoot(container);
    root.render(
        <React.StrictMode>
            <App />
        </React.StrictMode>
    );
} else {
    console.error("Root element not found");
}
