import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Activity, Database, Clock, RefreshCw } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/app/admin/diagnostics")({
  component: DiagnosticsPage,
});

function DiagnosticsPage() {
  const [data, setData] = useState<Awaited<ReturnType<typeof api.adminDiagnostics>> | null>(null);
  const [loading, setLoading] = useState(false);

  async function run() {
    setLoading(true);
    try {
      setData(await api.adminDiagnostics());
    } catch (e: any) {
      toast.error(e?.message || "Failed");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    run();
  }, []);

  return (
    <div className="p-8 md:p-10 space-y-6">
      <header className="flex items-end justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">System diagnostics</h2>
          <p className="text-sm text-muted-foreground">
            Live health of the API, database and upstream mail provider connection.
          </p>
        </div>
        <button
          onClick={run}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold glass hover:bg-card/60 disabled:opacity-50"
        >
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} /> Re-check
        </button>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card
          icon={Activity}
          label="API server"
          value="Online"
          tone="success"
          hint={data ? `Latency ${data.latencyMs} ms` : "—"}
        />
        <Card
          icon={Database}
          label="Database"
          value={data ? (data.db ? "Connected" : "Down") : "—"}
          tone={data?.db ? "success" : "destructive"}
          hint="Postgres"
        />
        <Card
          icon={Clock}
          label="Uptime"
          value={data ? formatUptime(data.uptimeSec) : "—"}
          tone="info"
          hint={data ? new Date(data.timestamp).toLocaleTimeString() : "—"}
        />
      </div>

      <div className="glass rounded-2xl p-6">
        <h3 className="text-sm font-semibold mb-2">Upstream mail provider</h3>
        <p className="text-xs text-muted-foreground leading-relaxed">
          The backend proxies email sends to <code className="text-foreground">secret.zspoof.com</code>{" "}
          using the <code className="text-foreground">MAIL_PROVIDER_API_KEY</code> set in the server's
          environment. Provider connectivity is exercised on every send — see the Error center for
          recent failures.
        </p>
      </div>
    </div>
  );
}

function Card({
  icon: Icon,
  label,
  value,
  hint,
  tone,
}: {
  icon: any;
  label: string;
  value: string;
  hint?: string;
  tone?: "success" | "destructive" | "info";
}) {
  const color =
    tone === "success" ? "text-success" : tone === "destructive" ? "text-destructive" : "text-info";
  return (
    <div className="glass rounded-2xl p-5">
      <div className="flex items-center justify-between text-[0.625rem] uppercase tracking-[0.18em] font-semibold text-muted-foreground">
        {label}
        <Icon size={14} className={color} />
      </div>
      <div className={`mt-3 text-2xl font-bold ${color}`}>{value}</div>
      {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}

function formatUptime(sec: number) {
  if (sec < 60) return `${sec}s`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ${sec % 60}s`;
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return `${h}h ${m}m`;
}
