import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Activity, Database, Clock, RefreshCw, Server, Zap } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/app/admin/diagnostics")({
  component: DiagnosticsPage,
});

function DiagnosticsPage() {
  const [data, setData] = useState<Awaited<ReturnType<typeof api.adminDiagnostics>> | null>(null);
  const [loading, setLoading] = useState(false);
  const [testResult, setTestResult] = useState<Awaited<ReturnType<typeof api.adminProviderTest>> | null>(null);
  const [testing, setTesting] = useState(false);

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

  async function runProviderTest() {
    setTesting(true);
    setTestResult(null);
    try {
      const r = await api.adminProviderTest();
      setTestResult(r);
      if (r.reachable && r.authOk) toast.success(`Provider OK (${r.latencyMs}ms)`);
      else if (r.reachable) toast.error("Provider reachable but auth failed (check API key)");
      else toast.error("Provider unreachable");
    } catch (e: any) {
      toast.error(e?.message || "Provider test failed");
    } finally {
      setTesting(false);
    }
  }

  useEffect(() => { run(); }, []);

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

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card icon={Activity} label="API server" value="Online" tone="success" hint={data ? `Latency ${data.latencyMs} ms` : "—"} />
        <Card icon={Database} label="Database" value={data ? (data.db ? "Connected" : "Down") : "—"} tone={data?.db ? "success" : "destructive"} hint="Postgres" />
        <Card icon={Clock} label="Uptime" value={data ? formatUptime(data.uptimeSec) : "—"} tone="info" hint={data ? new Date(data.timestamp).toLocaleTimeString() : "—"} />
        <Card
          icon={Server}
          label="Provider configured"
          value={data ? (data.provider.configured ? "Yes" : "No") : "—"}
          tone={data?.provider.configured ? "success" : "destructive"}
          hint={data?.provider.baseHost}
        />
      </div>

      <div className="glass rounded-2xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold">Upstream mail provider test</h3>
            <p className="text-xs text-muted-foreground mt-1">
              Sends a no-recipient probe to verify connectivity and API key validity.
              Provider URL and key never leave the server.
            </p>
          </div>
          <button
            onClick={runProviderTest}
            disabled={testing}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-xl text-primary-foreground glow-primary disabled:opacity-50"
            style={{ background: "var(--gradient-primary)" }}
          >
            <Zap size={14} /> {testing ? "Testing…" : "Test connection"}
          </button>
        </div>

        {testResult && (
          <div className="rounded-xl border border-border bg-card/30 p-4 text-xs space-y-1.5">
            <Row label="Reachable" v={testResult.reachable ? "Yes" : "No"} tone={testResult.reachable ? "success" : "destructive"} />
            <Row label="HTTP status" v={testResult.status ?? "—"} />
            <Row label="Auth OK" v={testResult.authOk ? "Yes" : "No"} tone={testResult.authOk ? "success" : "destructive"} />
            <Row label="Latency" v={`${testResult.latencyMs} ms`} />
            {testResult.error && <Row label="Error" v={testResult.error} tone="destructive" />}
            {testResult.responsePreview && (
              <div className="pt-2">
                <div className="text-[0.625rem] uppercase tracking-wider text-muted-foreground mb-1">Response preview</div>
                <pre className="text-[0.7rem] bg-background/60 p-3 rounded overflow-auto max-h-32">{testResult.responsePreview}</pre>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Card({ icon: Icon, label, value, hint, tone }: { icon: any; label: string; value: string; hint?: string; tone?: "success" | "destructive" | "info" }) {
  const color = tone === "success" ? "text-success" : tone === "destructive" ? "text-destructive" : "text-info";
  return (
    <div className="glass rounded-2xl p-5">
      <div className="flex items-center justify-between text-[0.625rem] uppercase tracking-[0.18em] font-semibold text-muted-foreground">
        {label}<Icon size={14} className={color} />
      </div>
      <div className={`mt-3 text-2xl font-bold ${color}`}>{value}</div>
      {hint && <div className="mt-1 text-xs text-muted-foreground truncate">{hint}</div>}
    </div>
  );
}

function Row({ label, v, tone }: { label: string; v: any; tone?: "success" | "destructive" }) {
  const color = tone === "success" ? "text-success" : tone === "destructive" ? "text-destructive" : "text-foreground";
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className={`font-semibold ${color}`}>{String(v)}</span>
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
