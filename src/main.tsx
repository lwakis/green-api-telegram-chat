import { StrictMode } from "react"
import { createRoot } from "react-dom/client"

import { App } from "./App"
import "./styles.css"

if (import.meta.env.DEV) {
  void import("react-grab")
  void import("react-scan")
}

const rootElement = document.getElementById("root")

if (rootElement === null) {
  throw new Error("The application root element is missing.")
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
