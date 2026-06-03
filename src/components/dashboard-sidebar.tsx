import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import {
  LayoutGrid, Send, Mail, FileText, HelpCircle, Settings, User,
  LogOut, Shield, Menu, X, Activity,
} from "lucide-react";
import { useState } from "react";
import { BrandLogo } from "./brand-logo";
import { useAuth } from "@/lib/auth-context";
import { toast } from "sonner";

const NAV = [
  { to: "/app", label: "Overview", icon: LayoutGrid, exact: true },
  { to: "/app/send", label: "Send Email", icon: Send },
  { to: "/app/campaigns", label: "Campaigns", icon: Mail },
  { to: "/app/transmission", label: "Transmission Log", icon: Activity },
  { to: "/app/templates", label: "Templates", icon: FileText },
  { to: "/app/help", label: "Help & Guide", icon: HelpCircle },
  { to: "/app/profile", label: "Profile", icon: Settings },
];

const ADMIN_NAV = [{ to: "/app/admin", label: "Admin console", icon: Shield }];

export function DashboardSidebar() {
  const { user, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  function handleSignOut() {
    signOut();
    toast.success("Signed out");
    navigate({ to: "/login" });
  }

  // Close on route change
  if (open) {
    // We'll close manually on link click below.
  }

  const aside = (
    <aside className={`w-64 shrink-0 glass-strong border-r border-border flex flex-col h-screen
      ${open ? "fixed inset-y-0 left-0 z-50" : "hidden md:flex md:sticky md:top-0"}`}>
      <div className="px-5 py-5 border-b border-border flex items-center justify-between">
        <BrandLogo size="sm" />
        <button className="md:hidden text-muted-foreground" onClick={() => setOpen(false)} aria-label="Close menu">
          <X size={18} />
        </button>
      </div>

      <div className="px-5 py-4 text-[0.625rem] font-semibold tracking-[0.2em] text-muted-foreground uppercase">
        Workspace
      </div>

      <nav className="flex-1 px-3 space-y-1 overflow-y-auto">
        {NAV.map((item) => {
          const active = item.exact ? location.pathname === item.to : location.pathname.startsWith(item.to);
          return (
            <Link key={item.to} to={item.to} onClick={() => setOpen(false)}
              className={`group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
                active ? "text-primary-foreground bg-primary/15 border border-primary/30"
                  : "text-muted-foreground hover:text-foreground hover:bg-card/40"}`}>
              <item.icon size={16} className={active ? "text-primary" : "text-muted-foreground group-hover:text-foreground"} />
              {item.label}
            </Link>
          );
        })}

        {user?.role === "admin" && (
          <>
            <div className="px-3 pt-5 pb-2 text-[0.625rem] font-semibold tracking-[0.2em] text-muted-foreground uppercase">
              Administration
            </div>
            {ADMIN_NAV.map((item) => {
              const active = location.pathname.startsWith(item.to);
              return (
                <Link key={item.to} to={item.to} onClick={() => setOpen(false)}
                  className={`group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
                    active ? "text-primary-foreground bg-primary/15 border border-primary/30"
                      : "text-muted-foreground hover:text-foreground hover:bg-card/40"}`}>
                  <item.icon size={16} className={active ? "text-primary" : "text-muted-foreground group-hover:text-foreground"} />
                  {item.label}
                </Link>
              );
            })}
          </>
        )}
      </nav>

      <div className="m-3 rounded-xl glass p-3 flex items-center gap-3">
        <div className="h-9 w-9 rounded-full flex items-center justify-center text-sm font-bold text-primary-foreground"
          style={{ background: "var(--gradient-primary)" }}>
          {user?.fullName?.[0]?.toUpperCase() || <User size={14} />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold truncate">{user?.username || user?.fullName || "—"}</div>
          <div className="text-[0.625rem] uppercase tracking-wider text-muted-foreground">{user?.role || "customer"}</div>
        </div>
        <button type="button" onClick={handleSignOut} aria-label="Sign out"
          className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-card/60">
          <LogOut size={15} />
        </button>
      </div>
    </aside>
  );

  return (
    <>
      {/* Mobile top bar */}
      <div className="md:hidden sticky top-0 z-30 flex items-center justify-between px-4 py-3 glass-strong border-b border-border">
        <button onClick={() => setOpen(true)} className="text-foreground p-1.5 rounded-md hover:bg-card/60" aria-label="Open menu">
          <Menu size={20} />
        </button>
        <BrandLogo size="sm" />
        <div className="text-xs text-muted-foreground">{(user?.balance ?? 0).toFixed(2)} €</div>
      </div>

      {open && <div className="fixed inset-0 bg-background/60 backdrop-blur-sm z-40 md:hidden" onClick={() => setOpen(false)} />}
      {aside}
    </>
  );
}
