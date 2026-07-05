import { Routes, Route } from "react-router-dom";
import LandingPage from "./routes/LandingPage.js";
import CreateRoomPage from "./routes/CreateRoomPage.js";
import GamePage from "./routes/GamePage.js";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/create" element={<CreateRoomPage />} />
      <Route path="/game/:gameId" element={<GamePage />} />
    </Routes>
  );
}
