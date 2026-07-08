import { Routes, Route, Navigate } from "react-router-dom";
import { I18nProvider } from "./i18n/I18nProvider.js";
import LandingPage from "./routes/LandingPage.js";
import CreateRoomPage from "./routes/CreateRoomPage.js";
import JoinPage from "./routes/JoinPage.js";
import LobbyPage from "./routes/LobbyPage.js";
import TeamDashboard from "./routes/TeamDashboard.js";
import TeacherDashboard from "./routes/TeacherDashboard.js";
import DisplayPage from "./routes/DisplayPage.js";
import TeacherGamesPage from "./routes/TeacherGamesPage.js";
import AdminLoginPage from "./routes/AdminLoginPage.js";
import RequireAdmin from "./components/RequireAdmin.js";
import GameErrorToast from "./components/GameErrorToast.js";
import ConnectionBanner from "./components/ConnectionBanner.js";

export default function App() {
  return (
    <I18nProvider>
      <ConnectionBanner />
      <GameErrorToast />
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<AdminLoginPage />} />
        <Route path="/games" element={<RequireAdmin><TeacherGamesPage /></RequireAdmin>} />
        <Route path="/create" element={<RequireAdmin><CreateRoomPage /></RequireAdmin>} />
        <Route path="/join" element={<JoinPage />} />
        <Route path="/join/:code" element={<JoinPage />} />
        <Route path="/lobby/:roomCode" element={<RequireAdmin><LobbyPage /></RequireAdmin>} />
        <Route path="/game/:roomCode" element={<TeamDashboard />} />
        <Route path="/teacher/:roomCode" element={<RequireAdmin><TeacherDashboard /></RequireAdmin>} />
        <Route path="/display/:roomCode" element={<DisplayPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </I18nProvider>
  );
}
