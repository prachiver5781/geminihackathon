import React from "react";
import { createRoot } from "react-dom/client";
import VoiceAndOpsConsole from "./modules/VoiceAndOpsConsole.jsx";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <VoiceAndOpsConsole />
  </React.StrictMode>,
);
