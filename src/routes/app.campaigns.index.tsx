import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { api, type Campaign } from "@/lib/api";
import { Mail, ArrowUpRight, AlertCircle } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/app/campaigns/")({
  head: () => ({ meta: [{ title: "Campaigns — SecretVoIP Mail" }] }),
  component: CampaignsPage,
});

function CampaignsPage() {
  const [rows, setRows] = useState<Campaign[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .campaigns()
      .then(setRows)
      .catch((e) => toast.error(e?.message || "Failed to load campaigns"))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="p-8 md:p-10">
      <header className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
            Campaigns
          </h1>
          <p className="mt-2 text-muted-foreground">
            Every campaign you've sent — drill in for per-recipient results.
          </p>
        </div>
        <Link
          to="/app/send"
          className="rounded-xl px-4 py-2 text-sm font-semibold text-primary-foreground glow-primary"
          style={{ background: "var(--gradient-primary)" }}
        >
          New campaign
        </Link>
      </header>

      <div className="mt-8 glass rounded-2xl overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-sm text-muted-foreground">
            Loading…
          </div>
        ) : !rows || rows.length === 0 ? (
          <div className="p-12 text-center text-sm text-muted-foreground">
            <Mail size={28} className="mx-auto mb-3 opacity-40" />
            No campaigns yet — your sent emails will appear here.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[0.625rem] uppercase tracking-[0.18em] text-muted-foreground border-b border-border">
                <th className="px-5 py-3 font-semibold">Subject</th>
                <th className="px-5 py-3 font-semibold">From</th>
                <th className="px-5 py-3 font-semibold text-right">Sent</th>
                <th className="px-5 py-3 font-semibold text-right">Failed</th>
                <th className="px-5 py-3 font-semibold text-right">Cost</th>
                <th className="px-5 py-3 font-semibold">Status</th>
                <th className="px-5 py-3 font-semibold">Date</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr
                  key={c.id}
                  className="border-b border-border/40 hover:bg-card/30 transition-colors"
                >
                  <td className="px-5 py-3 font-medium truncate max-w-xs">
                    {c.subject}
                  </td>
                  <td className="px-5 py-3 text-muted-foreground">
                    {c.fromName}
                  </td>
                  <td className="px-5 py-3 text-right tabular-nums text-success">
                    {c.accepted}
                  </td>
                  <td className="px-5 py-3 text-right tabular-nums text-destructive">
                    {c.failed}
                  </td>
                  <td className="px-5 py-3 text-right tabular-nums">
                    {c.cost.toFixed(3)} €
                  </td>
                  <td className="px-5 py-3">
                    <StatusPill status={c.status} />
                  </td>
                  <td className="px-5 py-3 text-muted-foreground text-xs">
                    {new Date(c.createdAt).toLocaleString()}
                  </td>
                  <td className="px-5 py-3 text-right">
                    <Link
                      to="/app/campaigns/$id"
                      params={{ id: c.id }}
                      className="inline-flex items-center gap-1 text-info hover:text-foreground text-xs font-medium"
                    >
                      View <ArrowUpRight size={12} />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: Campaign["status"] }) {
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
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[0.65rem] font-semibold uppercase tracking-wider border ${map[status] || ""}`}>
      {status === "failed" && <AlertCircle size={10} />} {status}
    </span>
  );
}
