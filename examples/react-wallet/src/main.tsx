import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.tsx";
import { HardKASProvider } from "@hardkas/react";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <HardKASProvider baseUrl="http://127.0.0.1:7420" timeout={10000}>
      <App />
    </HardKASProvider>
  </React.StrictMode>
);
