import type { Session } from "@supabase/supabase-js";
import { createContext, type ReactNode, use, useEffect, useMemo, useState } from "react";
import { getSupabaseClient } from "./supabase";

type SessionState = {
  session: Session | null;
  /** True until the persisted session has been read back from SecureStore. */
  isLoading: boolean;
};

const SessionContext = createContext<SessionState>({ session: null, isLoading: true });

/**
 * Holds the Supabase session and keeps it in sync with auth state changes
 * (sign-in, sign-out, token refresh, OAuth deep-link callback).
 */
export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    getSupabaseClient()
      .auth.getSession()
      .then(({ data }) => setSession(data.session))
      .finally(() => setIsLoading(false));

    const { data: subscription } = getSupabaseClient().auth.onAuthStateChange(
      (_event, nextSession) => {
        setSession(nextSession);
      },
    );

    return () => subscription.subscription.unsubscribe();
  }, []);

  const value = useMemo(() => ({ session, isLoading }), [session, isLoading]);

  return <SessionContext value={value}>{children}</SessionContext>;
}

export function useSession(): SessionState {
  return use(SessionContext);
}
