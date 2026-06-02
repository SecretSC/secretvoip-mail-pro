import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Wallet, Send, CheckCircle2, XCircle, TrendingUp } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";

export const Route = createFileRoute("/app/")({
  head: () => ({
    meta: [{ title: "Overview — SecretVoIP Mail" }],
  }),
  component: OverviewPage,
});

function OverviewPage() {
  const { user } = useAuth();
  const { data, isLoading } = useQuery({
    queryKey: ["customer-stats"],
    queryFn: api.customerStats,
    retry: false,
  });

  const stats = data || {
    balance: user?.balance ?? 0,
    sentToday: 0,
    sentThisMonth: 0,
    totalSpent: 0,
    successRate: 0,
    failureRate: 0,
  };

  return (
    <div className="p-8 md:p-10 space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
            Platform overview
          </h1>
          <p className="mt-2 text-muted-foreground">
            Real-time view of your wallet, sends and delivery health.
          </p>
        </div>
        <div className="glass rounded-xl px-4 py-2.5 text-sm flex items-center gap-2 border border-success/30">
          <span className="h-2 w-2 rounded-full bg-success" />
          Welcome back, {user?.fullName}
        </div>
      </header>

      <section className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard
          label="Wallet balance"
          value={`${stats.balance.toFixed(2)} €`}
          icon={Wallet}
          accent="primary"
        />
        <StatCard
          label="Sent today"
          value={stats.sentToday.toLocaleString()}
          icon={Send}
          accent="info"
        />
        <StatCard
          label="Sent this month"
          value={stats.sentThisMonth.toLocaleString()}
          icon={TrendingUp}
          accent="info"
        />
        <StatCard
          label="Success rate"
          value={`${stats.successRate.toFixed(1)}%`}
          icon={CheckCircle2}
          accent="success"
        />
        <StatCard
          label="Failure rate"
          value={`${stats.failureRate.toFixed(1)}%`}
          icon={XCircle}
          accent="destructive"
        />
      </section>

      <section className="glass card-ring-primary rounded-2xl p-6">
        <div className="flex items-center gap-2 mb-4">
          <div className="h-2 w-2 rounded-full bg-primary animate-pulse" />
          <h2 className="text-lg font-semibold">Recent activity</h2>
        </div>
        {isLoading ? (
          <div className="text-sm text-muted-foreground py-10 text-center">
            Loading…
          </div>
        ) : (
          <div className="text-sm text-muted-foreground py-10 text-center">
            No recent campaigns yet. Send your first email from the{" "}
            <span className="text-foreground font-medium">Send Email</span> tab.
          </div>
        )}
      </section>
    </div>
  );
}

interface StatCardProps {
  label: string;
  value: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  accent: "primary" | "info" | "success" | "destructive";
}

function StatCard({ label, value, icon: Icon, accent }: StatCardProps) {
  const accentMap: Record<string, string> = {
    primary: "text-primary border-primary/30",
    info: "text-info border-info/30",
    success: "text-success border-success/30",
    destructive: "text-destructive border-destructive/30",
  };
  return (
    <div className={`glass rounded-2xl p-5 border ${accentMap[accent]}`}>
      <div className="flex items-center justify-between text-[0.625rem] font-semibold tracking-[0.18em] uppercase text-muted-foreground">
        {label}
        <Icon size={16} className={accentMap[accent].split(" ")[0]} />
      </div>
      <div className="mt-3 text-2xl md:text-3xl font-bold text-foreground tabular-nums">
        {value}
      </div>
    </div>
  );
}
