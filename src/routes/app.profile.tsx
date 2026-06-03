import { createFileRoute } from "@tanstack/react-router";
import { Wallet, MessageCircle } from "lucide-react";
import { useAuth } from "@/lib/auth-context";

export const Route = createFileRoute("/app/profile")({
  head: () => ({ meta: [{ title: "Profile — SecretVoIP Mail" }] }),
  component: ProfilePage,
});

function ProfilePage() {
  const { user } = useAuth();

  return (
    <div className="p-8 md:p-10 space-y-6">
      <header>
        <h1 className="text-3xl md:text-4xl font-bold tracking-tight">Profile</h1>
        <p className="mt-2 text-muted-foreground">
          Manage your account, balance and credentials.
        </p>
      </header>

      <div className="glass card-ring-primary rounded-2xl p-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div
            className="h-14 w-14 rounded-2xl flex items-center justify-center glow-primary"
            style={{ background: "var(--gradient-primary)" }}
          >
            <Wallet size={22} className="text-primary-foreground" />
          </div>
          <div>
            <div className="text-[0.625rem] font-semibold tracking-[0.18em] uppercase text-muted-foreground">
              Wallet balance
            </div>
            <div className="text-3xl font-bold tabular-nums">
              {(user?.balance ?? 0).toFixed(2)}{" "}
              <span className="text-base text-muted-foreground font-normal">€</span>
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              Top-ups are processed manually by the admin.
            </div>
          </div>
        </div>
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold text-primary-foreground glow-primary"
          style={{ background: "var(--gradient-primary)" }}
        >
          <MessageCircle size={16} /> Top up via support
        </button>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <div className="glass rounded-2xl p-6">
          <div className="text-[0.625rem] font-semibold tracking-[0.18em] uppercase text-muted-foreground">
            Account
          </div>
          <dl className="mt-4 space-y-3 text-sm">
            <Row k="Username" v={user?.username || "—"} />
            <Row k="Name" v={user?.fullName || "—"} />
            <Row k="Role" v={user?.role || "—"} />
            <Row k="Status" v={user?.status || "—"} />
          </dl>
        </div>

        <div className="glass rounded-2xl p-6">
          <div className="text-[0.625rem] font-semibold tracking-[0.18em] uppercase text-muted-foreground">
            Change password
          </div>
          <p className="mt-4 text-sm text-muted-foreground">
            Password changes are handled by your administrator. Contact support
            to request a reset.
          </p>
        </div>
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-muted-foreground">{k}</dt>
      <dd className="font-medium text-foreground">{v}</dd>
    </div>
  );
}
