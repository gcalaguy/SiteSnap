import { createRoot } from "react-dom/client";
import App from "./App";
import { installGlobalErrorReporting } from "./lib/errorReporting";
import "./index.css";

installGlobalErrorReporting();

createRoot(document.getElementById("root")!).render(<App />);
