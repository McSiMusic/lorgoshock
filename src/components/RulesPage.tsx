"use client";

import { useState } from "react";
import RulesContent from "./RulesContent";

export default function RulesPage() {
  const [language, setLanguage] = useState<"en" | "ru">("en");
  return (
    <main className="rules-page">
      <header className="rules-page-header">
        <a className="rules-page-brand" href="../" aria-label="Lorgoshock — home">
          <img src="../icon-512.png" alt="" />
          <span>Lorgoshock<small>OPEN TO WORK</small></span>
        </a>
        <div className="rules-page-controls">
          <div className="language-switch" role="group" aria-label="Language">
            <button type="button" className={language === "en" ? "active" : ""} onClick={() => setLanguage("en")}>EN</button>
            <button type="button" className={language === "ru" ? "active" : ""} onClick={() => setLanguage("ru")}>RU</button>
          </div>
          <a className="rules-back-link" href="../">{language === "en" ? "← BACK TO GAME" : "← К ИГРЕ"}</a>
        </div>
      </header>
      <RulesContent language={language} assetPrefix="../" />
      <footer className="rules-page-footer">
        <span>© LORGOSHOCK</span>
        <span>{language === "en" ? "A strategy of sharp minds and questionable HR." : "Стратегия острых умов и сомнительных HR-решений."}</span>
      </footer>
    </main>
  );
}
