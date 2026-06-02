import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { api, type ErrorLogEntry } from "@/lib/api";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/app/admin/errors")({
  component: ErrorsPage,
});

function ErrorsPage() {
  const [rows, setRows] = useState<ErrorLogEntry[] | null>(null);
  const [showResolved, setShowResolved] = useState(false);

  async function load() {
    try {
      setRows(await api.adminErrors());
    } catch (e: any) {
      toast.error(e?.message || "Failed");
    }
  }
  useEffect(() => {
    load();
  }, []);

  async function resolve(r: ErrorLogEntry) {
    try {
      await api.adminResolveError(r.id);
      toast.success("Marked resolved");
      load();
    } catch (e: any) {
      toast.error(e?.message || "Failed");
    }
  }

  const visible = (rows || []).filter((r) => (showResolved ? true : !r.resolved));

  return (
    <div className="p-8 md:p-10 space-y-6">
      <header className="flex items-end justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Error center</h2>
          <p className="text-sm text-muted-foreground">
            Upstream failures, validation issues and runtime errors from email sends.
          </p>
        </div>
        <label className="inline-flex items-center gap-2 text-sm text-muted-foreground">
          <input
            type="checkbox"
            checked={showResolved}
            onChange={(e) => setShowResolved(e.target.checked)}
          />
          Show resolved
        </label>
      </header>

      <div className="space-y-3">
        {!rows ? (
          <div className="glass rounded-2xl p-10 text-center text-sm text-muted-foreground">
            Loading…
          </div>
        ) : visible.length === 0 ? (
          <div className="glass rounded-2xl p-12 text-center text-sm text-muted-foreground">
            <CheckCircle2 size={28} className="mx-auto mb-3 text-success" />
            No open errors. Everything is healthy.
          </div>
        ) : (
          visible.map((r) => (
            <div
              key={r.id}
              className={`glass rounded-xl p-5 border ${
                r.resolved ? "border-border opacity-60" : "border-destructive/30"
              }`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <AlertTriangle
                      size={14}
                      className={r.resolved ? "text-muted-foreground" : "text-destructive"}
                    />
                    <span className="text-sm font-semibold">{r.message}</span>
                    {r.httpStatus ? (
                      <span className="text-[0.65rem] px-2 py-0.5 rounded-md bg-destructive/15 text-destructive border border-destructive/30 font-mono">
                        HTTP {r.httpStatus}
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-2 text-xs text-muted-foreground flex flex-wrap gap-x-4 gap-y-1">
                    <span>{new Date(r.createdAt).toLocaleString()}</span>
                    {r.userEmail && <span>User: {r.userEmail}</span>}
                    {r.campaignId && (
                      <span className="font-mono">Campaign {r.campaignId.slice(0, 8)}</span>
                    )}
                  </div>
                  {r.requestSummary && (
                    <pre className="mt-3 text-[0.7rem] text-muted-foreground bg-card/40 p-2 rounded overflow-x-auto">
                      {JSON.stringify(r.requestSummary, null, 2)}
                    </pre>
                  )}
                </div>
                {!r.resolved && (
                  <button
                    onClick={() => resolve(r)}
                    className="shrink-0 inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg text-success border border-success/30 hover:bg-success/10"
                  >
                    <CheckCircle2 size={12} /> Resolve
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
