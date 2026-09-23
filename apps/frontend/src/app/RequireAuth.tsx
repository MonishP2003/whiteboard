import { useEffect, type ReactNode } from "react";
import { Navigate, useLocation } from "react-router";
import { FullPageMessage } from "@/components/FullPage";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/store/authStore";

export interface LoginRedirectState {
  from?: string;
}

/** Checks the session with GET /api/me once, then renders children or redirects to /login. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const status = useAuthStore((s) => s.status);
  const fetchMe = useAuthStore((s) => s.fetchMe);
  const location = useLocation();

  useEffect(() => {
    if (status === "unknown") fetchMe().catch(() => {});
  }, [status, fetchMe]);

  if (status === "authenticated") return children;
  if (status === "anonymous") {
    const state: LoginRedirectState = { from: location.pathname + location.search };
    return <Navigate to="/login" replace state={state} />;
  }
  if (status === "error") {
    return (
      <FullPageMessage>
        <p>Can't reach the server.</p>
        <Button variant="outline" onClick={() => fetchMe().catch(() => {})}>
          Try again
        </Button>
      </FullPageMessage>
    );
  }
  return <FullPageMessage>Loading…</FullPageMessage>;
}
