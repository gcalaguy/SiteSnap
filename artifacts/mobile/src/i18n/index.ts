import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import * as Localization from "expo-localization";

import en from "./en.json";
import it from "./it.json";
import pt from "./pt.json";
import es from "./es.json";

const resources = { en, it, pt, es };

const locales = Localization.getLocales();
const deviceLocale = locales[0]?.languageCode ?? "en";
const supportedLocales = ["en", "it", "pt", "es"] as const;
const fallbackLocale = supportedLocales.includes(deviceLocale as any) ? deviceLocale : "en";

i18n.use(initReactI18next).init({
  resources,
  lng: fallbackLocale,
  fallbackLng: "en",
  interpolation: { escapeValue: false },
  compatibilityJSON: "v4",
});

export function setAppLanguage(locale: string) {
  if (supportedLocales.includes(locale as any)) {
    i18n.changeLanguage(locale);
  }
}

export default i18n;
