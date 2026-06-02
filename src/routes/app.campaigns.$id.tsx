import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { api, type Campaign, type Recipient } from "@/lib/api";
import { ArrowLeft, Download, CheckCircle2, XCircle } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/app/campaigns/$id")({
  head: () => ({ meta: [{ title: "Campaign — SecretVoIP Mail" }] }),
  component: CampaignDetail,
});

function CampaignDetail() {
  const { id } = Route.useParams();
  const [data, setData] = useState<{
    campaign: Campaign & { html: string; error: string | null };
    recipients: Recipient[];
  } | null>(null);
  const [filter, setFilter] = useState<"all" | "accepted" | "failed">("all");
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    api
      .campaign(id)
      .then(setData)
      .catch((e) => toast.error(e?.message || "Failed to load campaign"));
  }, [id]);

  async function onExport() {
    setExporting(true);
    try {
      await api.exportCampaignCsv(id);
    } catch (e: any) {
      toast.error(e?.message || "Export failed");
    } finally {
      setExporting(false);
    }
  }

  if (!data) {
    return (
      <div className="p-10 text-sm text-muted-foreground">Loading…</div>
    );
  }

  const c = data.campaign;
  const recipients = data.recipients.filter((r) =>
    filter === "all"
      ? true
      : filter === "accepted"
        ? r.accepted
        : !r.accepted,
  );

  return (
    <div className="p-8 md:p-10 space-y-6">
      <div>
        <Link
          to="/app/campaigns"
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft size={12} /> All campaigns
        </Link>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
              {c.subject}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              From <span className="text-foreground">{c.fromName}</span> ·{" "}
              {new Date(c.createdAt).toLocaleString()}
            </p>
          </div>
          <button
            onClick={onExport}
            disabled={exporting}
            className="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold glass hover:bg-card/60 transition-colors disabled:opacity-50"
          >
            <Download size={14} />
            {exporting ? "Exporting…" : "Export CSV"}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Stat label="Total" value={c.total} />
        <Stat label="Accepted" value={c.accepted} tone="success" />
        <Stat label="Failed" value={c.failed} tone="destructive" />
        <Stat label="Charged" value={`${c.cost.toFixed(3)} €`} tone="info" />
      </div>

      {c.error && (
        <div className="glass rounded-xl border border-destructive/40 p-4 text-sm text-destructive">
          <strong>Send error:</strong> {c.error}
        </div>
      )}

      <div className="glass rounded-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-border">
          <h2 className="text-sm font-semibold tracking-wide">
            Recipients ({data.recipients.length})
          </h2>
          <div className="flex gap-1 text-xs">
            {(["all", "accepted", "failed"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1 rounded-md font-medium capitalize transition-colors ${
                  filter === f
                    ? "bg-primary/20 text-primary-foreground border border-primary/40"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {f}
              </button>
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
                <tr
                  key={i}
                  className="border-b border-border/30 hover:bg-card/20"
                >
                  <td className="px-5 py-2">
                    {r.accepted ? (
                      <CheckCircle2 size={14} className="text-success" />
                    ) : (
                      <XCircle size={14} className="text-destructive" />
                    )}
                  </td>
                  <td className="px-5 py-2 font-mono text-xs">{r.email}</td>
                  <td className="px-5 py-2 text-xs text-muted-foreground truncate max-w-md">
                    {r.error || "—"}
                  </td>
                </tr>
              ))}
              {recipients.length === 0 && (
                <tr>
                  <td colSpan={3} className="p-8 text-center text-xs text-muted-foreground">
                    Nothing here.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: React.ReactNode;
  tone?: "success" | "destructive" | "info";
}) {
  const color =
    tone === "success"
      ? "text-success"
      : tone === "destructive"
        ? "text-destructive"
        : tone === "info"
          ? "text-info"
          : "text-foreground";
  return (
    <div className="glass rounded-xl p-4">
      <div className="text-[0.625rem] uppercase tracking-[0.18em] text-muted-foreground font-semibold">
        {label}
      </div>
      <div className={`mt-2 text-2xl font-bold tabular-nums ${color}`}>
        {value}
      </div>
    </div>
  );
}
