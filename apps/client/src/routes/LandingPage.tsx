import { Link } from "react-router-dom";
import { useTranslation } from "../i18n/useTranslation.js";
import { LanguageToggle } from "../i18n/LanguageToggle.js";

export default function LandingPage() {
  const { t } = useTranslation();
  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-lg p-10 max-w-md w-full text-center">
        <h1 className="text-3xl font-bold text-slate-800 mb-2">{t("app.title")}</h1>
        <p className="text-slate-500 mb-8">{t("app.subtitle")}</p>
        <div className="flex flex-col gap-3">
          <Link to="/games" className="bg-slate-800 text-white py-3 rounded-lg font-semibold hover:bg-slate-900">
            {t("landingPage.myGames")}
          </Link>
          <Link to="/create" className="bg-indigo-600 text-white py-3 rounded-lg font-semibold hover:bg-indigo-700">
            {t("landingPage.createRoom")}
          </Link>
          <Link to="/join" className="bg-white border border-slate-300 text-slate-700 py-3 rounded-lg font-semibold hover:bg-slate-50">
            {t("landingPage.joinAsStudent")}
          </Link>
        </div>
        <p className="text-xs text-slate-400 mt-6">
          {t("landingPage.teacherHint")}{" "}
          {t("landingPage.displayHint")}
        </p>
        <div className="mt-6 flex justify-center">
          <LanguageToggle />
        </div>
      </div>
    </div>
  );
}
