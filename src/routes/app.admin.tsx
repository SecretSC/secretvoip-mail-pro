import { createFileRoute, Outlet, Link, useLocation, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import { Users, Activity, AlertTriangle, Settings, FileSearch, Shield } from "lucide-react";

export const Route = createFileRoute("/app/admin")({
  head: () => ({ meta: [{ title: "Admin — SecretVoIP Mail" }] }),
  component: AdminLayout,
});

const TABS = [
  { to: "/app/admin", label: "Customers", icon: Users, exact: true },
  { to: "/app/admin/diagnostics", label: "Diagnostics", icon: Activity },
  { to: "/app/admin/errors", label: "Error center", icon: AlertTriangle },
  { to: "/app/admin/audit", label: "Audit log", icon: FileSearch },
  { to: "/app/admin/settings", label: "Settings", icon: Settings },
];

function AdminLayout() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (!loading && user && user.role !== "admin") {
      navigate({ to: "/app" });
    }
  }, [loading, user, navigate]);

  if (!user || user.role !== "admin") {
    return (
      <div className="p-10 text-sm text-muted-foreground">Checking access…</div>
    );
  }

  return (
    <div>
      <div className="px-8 md:px-10 pt-8 pb-4 border-b border-border">
        <div className="flex items-center gap-2 text-[0.625rem] uppercase tracking-[0.18em] text-primary font-semibold">
          <Shield size={12} /> Admin console
        </div>
        <nav className="mt-4 flex flex-wrap gap-1">
          {TABS.map((t) => {
            const active = t.exact
              ? location.pathname === t.to
              : location.pathname.startsWith(t.to);
            return (
              <Link
                key={t.to}
                to={t.to}
                className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
                  active
                    ? "bg-primary/15 text-primary-foreground border border-primary/30"
                    : "text-muted-foreground hover:text-foreground hover:bg-card/40 border border-transparent"
                }`}
              >
                <t.icon size={14} /> {t.label}
              </Link>
            );
          })}
        </nav>
      </div>
      <Outlet />
    </div>
  );
}
