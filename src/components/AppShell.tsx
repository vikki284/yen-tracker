import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { useEffect } from "react";
import { LogOut, LayoutDashboard, Receipt, FileText, BarChart3, Send } from "lucide-react";

const NAV = [
  { to: "/", label: "Overview", icon: LayoutDashboard },
  { to: "/expenses", label: "Expenses", icon: FileText },
  { to: "/receipts", label: "Receipts", icon: Receipt },
  { to: "/wise", label: "Wise", icon: Send },
  { to: "/reports", label: "Reports", icon: BarChart3 },
] as const;

export function AppShell({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (!loading && !session) navigate({ to: "/auth" });
  }, [loading, session, navigate]);

  if (loading || !session) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Loading ledger…</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-paper/80 backdrop-blur sticky top-0 z-40">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-4">
          <Link to="/" className="flex items-baseline gap-2">
            <span className="font-display text-2xl font-bold tracking-tight">帳簿</span>
            <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Chōbo</span>
          </Link>
          <nav className="hidden md:flex items-center gap-1">
            {NAV.map((n) => {
              const active = location.pathname === n.to;
              return (
                <Link
                  key={n.to}
                  to={n.to}
                  className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition ${
                    active ? "bg-foreground text-background" : "text-foreground hover:bg-paper-mute"
                  }`}
                >
                  <n.icon className="size-4" /> {n.label}
                </Link>
              );
            })}
          </nav>
          <button
            onClick={async () => { await supabase.auth.signOut(); navigate({ to: "/auth" }); }}
            className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-xs font-medium hover:bg-paper-mute"
          >
            <LogOut className="size-3.5" /> Sign out
          </button>
        </div>
        <nav className="md:hidden flex items-center gap-1 overflow-x-auto px-4 pb-3">
          {NAV.map((n) => {
            const active = location.pathname === n.to;
            return (
              <Link key={n.to} to={n.to}
                className={`flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium ${
                  active ? "bg-foreground text-background" : "text-foreground bg-paper-mute"
                }`}>
                <n.icon className="size-3.5" /> {n.label}
              </Link>
            );
          })}
        </nav>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-10">{children}</main>
      <footer className="mx-auto max-w-6xl px-6 pb-10 pt-4 font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
        — end of slip —
      </footer>
    </div>
  );
}
