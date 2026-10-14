import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const supabaseConfigured = !!(url && anonKey);

// With missing env vars the app renders a setup notice instead of crashing.
export const supabase = createClient(url ?? "http://localhost", anonKey ?? "missing", {
  auth: { persistSession: true, autoRefreshToken: true },
});

export const PHOTO_BUCKET = "item-photos";

/** Turn a PostgREST/Auth error into a short message for staff. */
export function friendlyError(e: unknown): string {
  const err = e as { code?: string; message?: string } | null;
  if (!err) return "Something went wrong.";
  if (err.code === "23505") return "That already exists.";
  if (err.code === "42501") return "You don't have permission to do that.";
  if (err.message?.includes("Failed to fetch")) return "No connection. Check the internet and try again.";
  return err.message ?? "Something went wrong.";
}
