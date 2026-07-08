import { useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { api, clearAdminToken, getAdminToken } from "../api.js";

export default function RequireAdmin({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const [verified, setVerified] = useState<boolean | null>(null);

  useEffect(() => {
    if (!getAdminToken()) {
      setVerified(false);
      return;
    }
    let cancelled = false;
    api
      .adminVerify()
      .then(() => {
        if (!cancelled) setVerified(true);
      })
      .catch(() => {
        if (!cancelled) {
          clearAdminToken();
          setVerified(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!getAdminToken() || verified === false) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return <>{children}</>;
}
