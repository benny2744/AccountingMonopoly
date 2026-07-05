import { Routes, Route, Navigate } from "react-router-dom";
import LandingPage from "./routes/LandingPage.js";
import CreateRoomPage from "./routes/CreateRoomPage.js";
import JoinPage from "./routes/JoinPage.js";
import LobbyPage from "./routes/LobbyPage.js";
import TeamDashboard from "./routes/TeamDashboard.js";
import TeacherDashboard from "./routes/TeacherDashboard.js";
import DisplayPage from "./routes/DisplayPage.js";
import GameErrorToast from "./components/GameErrorToast.js";
import ConnectionBanner from "./components/ConnectionBanner.js";

export default function App() {
  return (
    <>
      <ConnectionBanner />
      <GameErrorToast />
      <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/create" element={<CreateRoomPage />} />
      <Route path="/join" element={<JoinPage />} />
      <Route path="/join/:code" element={<JoinPage />} />
      <Route path="/lobby/:roomCode" element={<LobbyPage />} />
      <Route path="/game/:roomCode" element={<TeamDashboard />} />
      <Route path="/teacher/:roomCode" element={<TeacherDashboard />} />
      <Route path="/display/:roomCode" element={<DisplayPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}
