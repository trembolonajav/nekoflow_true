import React from "react";
import { createRoot } from "react-dom/client";
import "./styles/base.css";
import "./styles/pseudo.generated.css";
import "./styles/mobile.css";
import App from "./app/App";
import { installDocumentLocalization } from "./i18n/locale";
import { installAccountLanguageSync } from "./features/preferences/preferencesApi";
// Reaproveita a raiz no hot reload do Vite (evita duas raízes no mesmo elemento).
const el = document.getElementById("dc-root");
installDocumentLocalization();
installAccountLanguageSync();
el.__root = el.__root || createRoot(el);
el.__root.render(<App />);
