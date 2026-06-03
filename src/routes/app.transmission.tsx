import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { api, type TransmissionEntry } from "@/lib/api";
import { Activity, Download, Search, RefreshCw } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/app/transmission")({
  head: () => ({ meta: [{ title: "Transmission Log — SecretVoIP Mail" }] }),
  component: TransmissionLogPage,
});

const STATUSES = ["all", "delivered", "queued", "processing", "sending", "delayed", "bounced", "failed", "invalid"];

function TransmissionLogPage() {
  const [rows, setRows] = useState<TransmissionEntry[] | null>(null);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try { setRows(await api.transmissionLog()); }
    catch (e: any) { toast.error(e?.message || "Failed to load"); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    if (!rows) return [];
    return rows.filter((r) => {
      if (filter !== "all" && (r.status || "").toLowerCase() !== filter) return false;
      if (search) {
        const s = search.toLowerCase();
        if (!`${r.email} ${r.subject} ${r.fromName}`.toLowerCase().includes(s)) return false;
      }
      return true;
    });
  }, [rows, filter, search]);

  return (
    <div className="p-4 sm:p-6 md:p-10 space-y-6">
      <header className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl md:text-4xl font-bold tracking-tight">Transmission Log</h1>
          <p className="mt-2 text-muted-foreground text-sm">Recipient-level delivery events across your campaigns.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={load} className="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold glass hover:bg-card/60">
            <RefreshCw size={14} /> Refresh
          </button>
          <button onClick={() => api.exportTransmissionCsv()}
            className="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold glass hover:bg-card/60">
            <Download size={14} /> Export CSV
          </button>
        </div>
      </header>

      <div className="glass rounded-2xl p-4 flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search email, subject or sender…"
            className="w-full pl-8 pr-3 py-2 text-xs rounded-md bg-card/50 border border-border focus:outline-none focus:border-primary/60" />
        </div>
        <div className="flex flex-wrap gap-1 text-xs">
          {STATUSES.map((s) => (
            <button key={s} onClick={() => setFilter(s)}
              className={`px-3 py-1 rounded-md font-medium capitalize ${filter === s ? "bg-primary/20 text-primary-foreground border border-primary/40" : "text-muted-foreground hover:text-foreground"}`}>{s}</button>
          ))}
        </div>
      </div>

      <div className="glass rounded-2xl overflow-hidden">
        <div className="overflow-x-auto max-h-[70vh]">
          {loading ? (
            <div className="p-12 text-center text-sm text-muted-foreground">Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center text-sm text-muted-foreground">
              <Activity size={28} className="mx-auto mb-3 opacity-40" /> No transmission events match the filters.
            </div>
          ) : (
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-background/95 backdrop-blur">
                <tr className="text-left uppercase tracking-wider text-[0.625rem] text-muted-foreground border-b border-border">
                  <th className="px-4 py-2">Time</th>
                  <th className="px-4 py-2">Email</th>
                  <th className="px-4 py-2">Campaign</th>
                  <th className="px-4 py-2">Subject</th>
                  <th className="px-4 py-2">Status</th>
                  <th className="px-4 py-2">Event</th>
                  <th className="px-4 py-2">Reason</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r, i) => (
                  <tr key={i} className="border-t border-border/30 hover:bg-card/30">
                    <td className="px-4 py-2 whitespace-nowrap text-muted-foreground">{r.lastEventAt ? new Date(r.lastEventAt).toLocaleString() : new Date(r.createdAt).toLocaleString()}</td>
                    <td className="px-4 py-2 font-mono">{r.email}</td>
                    <td className="px-4 py-2">
                      <Link to="/app/campaigns/$id" params={{ id: r.campaignId }} className="text-info hover:underline">{r.campaignId.slice(0, 8)}…</Link>
                    </td>
                    <td className="px-4 py-2 truncate max-w-[260px]">{r.subject}</td>
                    <td className="px-4 py-2"><StatusBadge status={r.status} /></td>
                    <td className="px-4 py-2 text-muted-foreground">{r.eventType || "—"}</td>
                    <td className="px-4 py-2 text-destructive truncate max-w-[260px]">{r.reason || ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const s = (status || "").toLowerCase();
  const tone =
    s === "delivered" || s === "sent" || s === "completed" ? "bg-success/15 text-success"
    : s === "failed" || s === "bounced" || s === "invalid" ? "bg-destructive/15 text-destructive"
    : "bg-info/15 text-info";
  return <span className={`px-2 py-0.5 rounded text-[0.6rem] uppercase font-semibold tracking-wider ${tone}`}>{s || "—"}</span>;
}
