// Session + org membership. A user can belong to several laundries; the app
// keeps one "active org" (remembered per browser).
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./lib/supabase";
import type { Membership } from "./lib/types";

interface Auth {
  session: Session | null;
  loading: boolean;
  memberships: Membership[];
  active: Membership | null;
  setActiveOrg: (orgId: string) => void;
  reloadMemberships: () => Promise<void>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<Auth | null>(null);
const ACTIVE_KEY = "veloxa_active_org";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [sessionLoaded, setSessionLoaded] = useState(false);
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [membershipsLoaded, setMembershipsLoaded] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(() => {
    try {
      return localStorage.getItem(ACTIVE_KEY);
    } catch {
      return null;
    }
  });

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setSessionLoaded(true);
    });
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  const userId = session?.user.id;

  const reloadMemberships = useCallback(async () => {
    if (!userId) {
      setMemberships([]);
      setMembershipsLoaded(true);
      return;
    }
    const { data, error } = await supabase
      .from("memberships")
      .select("org_id, user_id, role, display_name, organizations(*)")
      .eq("user_id", userId)
      .order("created_at");
    if (error) console.error(error);
    setMemberships((data as unknown as Membership[]) ?? []);
    setMembershipsLoaded(true);
  }, [userId]);

  useEffect(() => {
    setMembershipsLoaded(false);
    reloadMemberships();
  }, [reloadMemberships]);

  const setActiveOrg = (orgId: string) => {
    setActiveId(orgId);
    try {
      localStorage.setItem(ACTIVE_KEY, orgId);
    } catch {
      /* private mode */
    }
  };

  const active = memberships.find((m) => m.org_id === activeId) ?? memberships[0] ?? null;

  return (
    <Ctx.Provider
      value={{
        session,
        loading: !sessionLoaded || (!!session && !membershipsLoaded),
        memberships,
        active,
        setActiveOrg,
        reloadMemberships,
        signOut: async () => {
          await supabase.auth.signOut();
        },
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
