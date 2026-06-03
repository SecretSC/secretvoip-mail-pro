import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { api, type Campaign, type Recipient } from "@/lib/api";
import { ArrowLeft, Download, CheckCircle2, XCircle, Eye, Code2, RefreshCw, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth-context";

export const Route = createFileRoute("/app/campaigns/$id")({
  head: () => ({ meta: [{ title: "Campaign — SecretVoIP Mail" }] }),
  component: CampaignDetail,
});

function CampaignDetail() {
  const { id } = Route.useParams();
  const { user, refresh: refreshUser } = useAuth();
  const [data, setData] = useState<{
    campaign: Campaign & { html: string; error: string | null };
    recipients: Recipient[];
  } | null>(null);
  const [filter, setFilter] = useState<string>("all");
  const [exporting, setExporting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [view, setView] = useState<"preview" | "html">("preview");

  const load = useCallback(async () => {
    try { setData(await api.campaign(id)); }
    catch (e: any) { toast.error(e?.message || "Failed to load campaign"); }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  // Auto-sync every 30s while campaign is in flight
  useEffect(() => {
    if (!data) return;
    const c = data.campaign;
    if (c.finalized || ["completed", "failed", "partial", "cancelled"].includes(c.status)) return;
    const t = setInterval(async () => {
      try { await api.syncCampaign(id); await load(); await refreshUser(); } catch {}
    }, 30_000);
    return () => clearInterval(t);
  }, [data, id, load, refreshUser]);

  async function manualSync() {
    setSyncing(true);
    try { await api.syncCampaign(id); await load(); await refreshUser(); toast.success("Synced with provider"); }
    catch (e: any) { toast.error(e?.message || "Sync failed"); }
    finally { setSyncing(false); }
  }

  async function onExport() {
    setExporting(true);
    try { await api.exportCampaignCsv(id); }
    catch (e: any) { toast.error(e?.message || "Export failed"); }
    finally { setExporting(false); }
  }

  if (!data) return <div className="p-10 text-sm text-muted-foreground">Loading…</div>;

  const c = data.campaign;
  const isAdmin = user?.role === "admin";
  const inFlight = !c.finalized && ["queued", "processing", "sending"].includes(c.status);
  const recipients = data.recipients.filter((r) => {
    if (filter === "all") return true;
    return (r.status || (r.accepted ? "delivered" : "failed")) === filter;
  });
  const total = c.total || 1;
  const done = (c.deliveredCount || c.accepted || 0) + (c.bouncedCount || 0) + (c.invalidCount || 0) + (c.failed || 0);
  const pct = Math.min(100, Math.round((done / total) * 100));

  return (
    <div className="p-4 sm:p-6 md:p-10 space-y-6">
      <div>
        <Link to="/app/campaigns" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft size={12} /> All campaigns
        </Link>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-xl md:text-3xl font-bold tracking-tight truncate">{c.subject}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              From <span className="text-foreground">{c.fromName}</span> · {new Date(c.createdAt).toLocaleString()}
              {isAdmin && c.userEmail && (<> · Customer <span className="text-foreground">{c.userEmail}</span></>)}
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <button onClick={manualSync} disabled={syncing || c.finalized}
              className="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold glass hover:bg-card/60 disabled:opacity-50">
              {syncing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} Sync
            </button>
            <button onClick={onExport} disabled={exporting}
              className="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold glass hover:bg-card/60 disabled:opacity-50">
              <Download size={14} /> {exporting ? "Exporting…" : "Export CSV"}
            </button>
          </div>
        </div>
      </div>

      {/* PROGRESS PANEL */}
      <div className="glass card-ring-primary rounded-2xl p-5 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <StatusPill status={c.status} />
          <div className="text-xs text-muted-foreground">
            {c.lastSyncedAt ? `Last synced ${new Date(c.lastSyncedAt).toLocaleTimeString()}` : "Not yet synced"}
            {inFlight && " · auto-refresh every 30s"}
          </div>
        </div>
        <div>
          <div className="flex justify-between text-[0.7rem] text-muted-foreground mb-1">
            <span>Progress</span><span className="tabular-nums">{pct}% · {done.toLocaleString()} / {total.toLocaleString()}</span>
          </div>
          <div className="h-3 bg-card/40 rounded-full overflow-hidden">
            <div className="h-full bg-gradient-to-r from-info to-primary transition-all" style={{ width: `${pct}%` }} />
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
          <Stat label="Total" value={c.total} />
          <Stat label="Queued" value={c.queuedCount ?? 0} tone="info" />
          <Stat label="Processing" value={c.processingCount ?? 0} tone="info" />
          <Stat label="Delivered" value={c.deliveredCount ?? c.accepted} tone="success" />
          <Stat label="Failed" value={c.failed} tone="destructive" />
          <Stat label="Bounced" value={c.bouncedCount ?? 0} tone="destructive" />
          <Stat label="Delayed" value={c.delayedCount ?? 0} />
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Charged" value={`${c.cost.toFixed(3)} €`} tone="info" />
        <Stat label="Price/email used" value={`${c.pricePerEmail.toFixed(4)} €`} />
        <Stat label="Recipients" value={c.total} />
        <Stat label="Success rate" value={`${total ? Math.round(100 * ((c.deliveredCount ?? c.accepted) / total)) : 0}%`} tone="success" />
      </div>

      {isAdmin && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat label="Provider cost/email" value={`${(c.providerCostPerEmail ?? 0).toFixed(4)} €`} tone="info" />
          <Stat label="Provider cost (total)" value={`${(c.providerCost ?? 0).toFixed(3)} €`} tone="destructive" />
          <Stat label="Profit" value={`${(c.profit ?? 0).toFixed(3)} €`} tone="success" />
          <Stat label="Provider job" value={c.providerJobId ? c.providerJobId.slice(0, 12) + "…" : "—"} />
        </div>
      )}

      {c.error && (
        <div className="glass rounded-xl border border-destructive/40 p-4 text-sm text-destructive">
          <strong>Send error:</strong> {c.error}
        </div>
      )}

      <div className="glass rounded-2xl overflow-hidden">
        <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-border flex-wrap">
          <h2 className="text-sm font-semibold tracking-wide">Content</h2>
          <div className="flex gap-1 text-xs">
            <button onClick={() => setView("preview")} className={`inline-flex items-center gap-1 px-3 py-1 rounded-md ${view === "preview" ? "bg-primary/20 text-primary-foreground border border-primary/40" : "text-muted-foreground hover:text-foreground"}`}>
              <Eye size={12} /> Preview
            </button>
            <button onClick={() => setView("html")} className={`inline-flex items-center gap-1 px-3 py-1 rounded-md ${view === "html" ? "bg-primary/20 text-primary-foreground border border-primary/40" : "text-muted-foreground hover:text-foreground"}`}>
              <Code2 size={12} /> HTML
            </button>
          </div>
        </div>
        {view === "preview" ? (
          <iframe title="preview" className="w-full h-[400px] bg-white" sandbox="" srcDoc={c.html} />
        ) : (
          <pre className="text-xs p-4 overflow-auto max-h-[400px] whitespace-pre-wrap break-all">{c.html}</pre>
        )}
      </div>

      {isAdmin && c.providerResponse && (
        <div className="glass rounded-2xl p-4">
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Provider response (admin)</div>
          <pre className="text-xs overflow-auto max-h-48">{JSON.stringify(c.providerResponse, null, 2)}</pre>
        </div>
      )}

      <div className="glass rounded-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-border flex-wrap gap-2">
          <h2 className="text-sm font-semibold tracking-wide">Recipients ({data.recipients.length.toLocaleString()})</h2>
          <div className="flex gap-1 text-xs flex-wrap">
            {(["all", "delivered", "failed", "bounced", "queued", "processing", "delayed", "invalid"]).map((f) => (
              <button key={f} onClick={() => setFilter(f)}
                className={`px-3 py-1 rounded-md font-medium capitalize ${
                  filter === f ? "bg-primary/20 text-primary-foreground border border-primary/40"
                    : "text-muted-foreground hover:text-foreground"}`}>{f}</button>
            ))}
          </div>
        </div>
        <div className="max-h-[60vh] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-background/95 backdrop-blur">
              <tr className="text-left text-[0.625rem] uppercase tracking-[0.18em] text-muted-foreground border-b border-border">
                <th className="px-5 py-2 font-semibold w-10"></th>
                <th className="px-5 py-2 font-semibold">Email</th>
                <th className="px-5 py-2 font-semibold">Status</th>
                <th className="px-5 py-2 font-semibold">Reason</th>
                <th className="px-5 py-2 font-semibold">Updated</th>
              </tr>
            </thead>
            <tbody>
              {recipients.map((r, i) => {
                const st = r.status || (r.accepted ? "delivered" : "failed");
                const ok = st === "delivered" || st === "sent" || st === "completed";
                return (
                  <tr key={i} className="border-b border-border/30 hover:bg-card/20">
                    <td className="px-5 py-2">
                      {ok ? <CheckCircle2 size={14} className="text-success" />
                          : st === "queued" || st === "processing" ? <Loader2 size={14} className="text-info animate-spin" />
                          : <XCircle size={14} className="text-destructive" />}
                    </td>
                    <td className="px-5 py-2 font-mono text-xs">{r.email}</td>
                    <td className="px-5 py-2 text-xs uppercase tracking-wider">{st}</td>
                    <td className="px-5 py-2 text-xs text-destructive">{r.error || ""}</td>
                    <td className="px-5 py-2 text-xs text-muted-foreground">{r.lastEventAt ? new Date(r.lastEventAt).toLocaleString() : ""}</td>
                  </tr>
                );
              })}
              {recipients.length === 0 && (
                <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">No recipients match the filter.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: React.ReactNode; tone?: "success" | "destructive" | "info" }) {
  const color = tone === "success" ? "text-success" : tone === "destructive" ? "text-destructive"
    : tone === "info" ? "text-info" : "text-foreground";
  return (
    <div className="glass rounded-xl p-3">
      <div className="text-[0.6rem] uppercase tracking-[0.16em] text-muted-foreground font-semibold">{label}</div>
      <div className={`mt-1 text-lg font-bold tabular-nums ${color}`}>
        {typeof value === "number" ? value.toLocaleString() : value}
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: Campaign["status"] }) {
  const map: Record<string, string> = {
    completed: "bg-success/15 text-success border-success/40",
    partial:   "bg-warning/15 text-warning border-warning/40",
    failed:    "bg-destructive/15 text-destructive border-destructive/40",
    cancelled: "bg-muted/15 text-muted-foreground border-border",
    queued:    "bg-info/15 text-info border-info/40",
    processing:"bg-info/15 text-info border-info/40",
    sending:   "bg-info/15 text-info border-info/40",
  };
  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-semibold uppercase tracking-wider border ${map[status] || ""}`}>
      {["queued","processing","sending"].includes(status) && <Loader2 size={12} className="animate-spin" />}
      {status}
    </span>
  );
}
