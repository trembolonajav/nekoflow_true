import React, { useSyncExternalStore } from "react";
import { getLocale, localeOptions, setLocale, subscribeLocale } from "../i18n/locale";

export default function LanguageSelector() {
  const locale = useSyncExternalStore(subscribeLocale, getLocale, getLocale);
  return (
    <div className="nk-language-selector" aria-label="Idioma da interface" title="Idioma da interface">
      {localeOptions.map((option) => (
        <button key={option.code} type="button" className={locale === option.code ? "is-active" : ""}
          aria-label={option.code} aria-pressed={locale === option.code} onClick={() => setLocale(option.code)}>
          <span aria-hidden="true">{option.flag}</span><small>{option.short}</small>
        </button>
      ))}
    </div>
  );
}
