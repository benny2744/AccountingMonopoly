import { Link } from "react-router-dom";

export default function LandingPage() {
  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-lg p-10 max-w-md w-full text-center">
        <h1 className="text-3xl font-bold text-slate-800 mb-2">Accounting Monopoly</h1>
        <p className="text-slate-500 mb-8">A classroom game for learning accounting through play.</p>
        <div className="flex flex-col gap-3">
          <Link to="/create" className="bg-indigo-600 text-white py-3 rounded-lg font-semibold hover:bg-indigo-700">
            Create Teacher Room
          </Link>
          <Link to="/join" className="bg-white border border-slate-300 text-slate-700 py-3 rounded-lg font-semibold hover:bg-slate-50">
            Join as Student
          </Link>
        </div>
        <p className="text-xs text-slate-400 mt-6">
          Teachers: create a room, then share the room code or join URL with students.
          A projector view is available at <code className="font-mono">/display/&lt;code&gt;</code>.
        </p>
      </div>
    </div>
  );
}
