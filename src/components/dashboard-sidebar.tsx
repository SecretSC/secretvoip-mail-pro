import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import {
  LayoutGrid,
  Send,
  Mail,
  FileText,
  HelpCircle,
  Settings,
  User,
  LogOut,
  Shield,
} from "lucide-react";
import { BrandLogo } from "./brand-logo";
import { useAuth } from "@/lib/auth-context";
import { toast } from "sonner";

const NAV = [
  { to: "/app", label: "Overview", icon: LayoutGrid, exact: true },
  { to: "/app/send", label: "Send Email", icon: Send },
  { to: "/app/campaigns", label: "Campaigns", icon: Mail },
  { to: "/app/templates", label: "Templates", icon: FileText },
  { to: "/app/help", label: "Help & Guide", icon: HelpCircle },
  { to: "/app/profile", label: "Profile", icon: Settings },
];

const ADMIN_NAV = [
  { to: "/app/admin", label: "Admin console", icon: Shield, exact: false },
];

export function DashboardSidebar() {
  const { user, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  function handleSignOut() {
    signOut();
    toast.success("Signed out");
    navigate({ to: "/login" });
  }

  return (
    <aside className="w-64 shrink-0 glass-strong border-r border-border flex flex-col h-screen sticky top-0">
      <div className="px-5 py-5 border-b border-border">
        <BrandLogo size="sm" />
      </div>

      <div className="px-5 py-4 text-[0.625rem] font-semibold tracking-[0.2em] text-muted-foreground uppercase">
        Workspace
      </div>

      <nav className="flex-1 px-3 space-y-1 overflow-y-auto">
        {NAV.map((item) => {
          const active = item.exact
            ? location.pathname === item.to
            : location.pathname.startsWith(item.to);
          return (
            <Link
              key={item.to}
              to={item.to}
              className={`group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
                active
                  ? "text-primary-foreground bg-primary/15 border border-primary/30"
                  : "text-muted-foreground hover:text-foreground hover:bg-card/40"
              }`}
            >
              <item.icon
                size={16}
                className={active ? "text-primary" : "text-muted-foreground group-hover:text-foreground"}
              />
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
                <Link
                  key={item.to}
                  to={item.to}
                  className={`group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
                    active
                      ? "text-primary-foreground bg-primary/15 border border-primary/30"
                      : "text-muted-foreground hover:text-foreground hover:bg-card/40"
                  }`}
                >
                  <item.icon
                    size={16}
                    className={active ? "text-primary" : "text-muted-foreground group-hover:text-foreground"}
                  />
                  {item.label}
                </Link>
              );
            })}
          </>
        )}
      </nav>

      <div className="m-3 rounded-xl glass p-3 flex items-center gap-3">
        <div
          className="h-9 w-9 rounded-full flex items-center justify-center text-sm font-bold text-primary-foreground"
          style={{ background: "var(--gradient-primary)" }}
        >
          {user?.fullName?.[0]?.toUpperCase() || <User size={14} />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-foreground truncate">
            {user?.fullName || "—"}
          </div>
          <div className="text-[0.625rem] uppercase tracking-wider text-muted-foreground">
            {user?.role || "customer"}
          </div>
        </div>
        <button
          type="button"
          onClick={handleSignOut}
          aria-label="Sign out"
          className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-card/60 transition-colors"
        >
          <LogOut size={15} />
        </button>
      </div>
    </aside>
  );
}
