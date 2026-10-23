import React, { useSyncExternalStore } from "react";
import { getLocale, localeOptions, subscribeLocale } from "../i18n/locale";
import { changeSiteLanguage } from "../features/preferences/preferencesApi";

export default function LanguageSelector() {
  const locale = useSyncExternalStore(subscribeLocale, getLocale, getLocale);
  return (
    <div className="nk-language-selector" aria-label="Idioma da interface" title="Idioma da interface">
      {localeOptions.map((option) => (
        <button key={option.code} type="button" className={locale === option.code ? "is-active" : ""}
          aria-label={option.code} aria-pressed={locale === option.code} onClick={() => changeSiteLanguage(option.code)}>
          <span aria-hidden="true">{option.flag}</span><small>{option.short}</small>
        </button>
      ))}
    </div>
  );
}
