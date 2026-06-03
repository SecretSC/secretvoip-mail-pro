import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { api, type Campaign, type Recipient } from "@/lib/api";
import { ArrowLeft, Download, CheckCircle2, XCircle, Eye, Code2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth-context";

export const Route = createFileRoute("/app/campaigns/$id")({
  head: () => ({ meta: [{ title: "Campaign — SecretVoIP Mail" }] }),
  component: CampaignDetail,
});

function CampaignDetail() {
  const { id } = Route.useParams();
  const { user } = useAuth();
  const [data, setData] = useState<{
    campaign: Campaign & { html: string; error: string | null };
    recipients: Recipient[];
  } | null>(null);
  const [filter, setFilter] = useState<"all" | "accepted" | "failed">("all");
  const [exporting, setExporting] = useState(false);
  const [view, setView] = useState<"preview" | "html">("preview");

  useEffect(() => {
    api.campaign(id).then(setData).catch((e) => toast.error(e?.message || "Failed to load campaign"));
  }, [id]);

  async function onExport() {
    setExporting(true);
    try { await api.exportCampaignCsv(id); }
    catch (e: any) { toast.error(e?.message || "Export failed"); }
    finally { setExporting(false); }
  }

  if (!data) return <div className="p-10 text-sm text-muted-foreground">Loading…</div>;

  const c = data.campaign;
  const isAdmin = user?.role === "admin";
  const recipients = data.recipients.filter((r) =>
    filter === "all" ? true : filter === "accepted" ? r.accepted : !r.accepted);

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
          <button onClick={onExport} disabled={exporting}
            className="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold glass hover:bg-card/60 disabled:opacity-50">
            <Download size={14} /> {exporting ? "Exporting…" : "Export CSV"}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Total" value={c.total} />
        <Stat label="Accepted" value={c.accepted} tone="success" />
        <Stat label="Failed" value={c.failed} tone="destructive" />
        <Stat label="Charged" value={`${c.cost.toFixed(3)} €`} tone="info" />
      </div>

      {isAdmin && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat label="Price/email used" value={`${c.pricePerEmail.toFixed(4)} €`} />
          <Stat label="Provider cost/email" value={`${(c.providerCostPerEmail ?? 0).toFixed(4)} €`} tone="info" />
          <Stat label="Provider cost (total)" value={`${(c.providerCost ?? 0).toFixed(3)} €`} tone="destructive" />
          <Stat label="Profit" value={`${(c.profit ?? 0).toFixed(3)} €`} tone="success" />
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
          <h2 className="text-sm font-semibold tracking-wide">Recipients ({data.recipients.length})</h2>
          <div className="flex gap-1 text-xs">
            {(["all", "accepted", "failed"] as const).map((f) => (
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
                <th className="px-5 py-2 font-semibold">Error</th>
              </tr>
            </thead>
            <tbody>
              {recipients.map((r, i) => (
                <tr key={i} className="border-b border-border/30 hover:bg-card/20">
                  <td className="px-5 py-2">
                    {r.accepted ? <CheckCircle2 size={14} className="text-success" /> : <XCircle size={14} className="text-destructive" />}
                  </td>
                  <td className="px-5 py-2 font-mono text-xs">{r.email}</td>
                  <td className="px-5 py-2 text-xs text-destructive">{r.error || ""}</td>
                </tr>
              ))}
              {recipients.length === 0 && (
                <tr><td colSpan={3} className="p-6 text-center text-muted-foreground">No recipients match the filter.</td></tr>
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
    <div className="glass rounded-xl p-4">
      <div className="text-[0.625rem] uppercase tracking-[0.18em] text-muted-foreground font-semibold">{label}</div>
      <div className={`mt-2 text-xl font-bold tabular-nums ${color}`}>{value}</div>
    </div>
  );
}
