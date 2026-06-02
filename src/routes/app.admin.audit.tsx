import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";

export const Route = createFileRoute("/app/admin/audit")({
  component: AuditPage,
});

interface Entry {
  id: string;
  action: string;
  changes: any;
  createdAt: string;
  adminEmail: string | null;
  targetEmail: string | null;
}

function AuditPage() {
  const [rows, setRows] = useState<Entry[] | null>(null);

  useEffect(() => {
    api
      .adminAudit()
      .then(setRows)
      .catch((e) => toast.error(e?.message || "Failed"));
  }, []);

  return (
    <div className="p-8 md:p-10 space-y-6">
      <header>
        <h2 className="text-2xl font-bold tracking-tight">Audit log</h2>
        <p className="text-sm text-muted-foreground">
          Every admin action — customer changes, wallet operations, password resets, settings updates.
        </p>
      </header>

      <div className="glass rounded-2xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[0.625rem] uppercase tracking-[0.18em] text-muted-foreground border-b border-border">
              <th className="px-5 py-3 font-semibold">When</th>
              <th className="px-5 py-3 font-semibold">Admin</th>
              <th className="px-5 py-3 font-semibold">Action</th>
              <th className="px-5 py-3 font-semibold">Target</th>
              <th className="px-5 py-3 font-semibold">Changes</th>
            </tr>
          </thead>
          <tbody>
            {!rows ? (
              <tr><td colSpan={5} className="p-8 text-center text-xs text-muted-foreground">Loading…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={5} className="p-8 text-center text-xs text-muted-foreground">No activity yet.</td></tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id} className="border-b border-border/40">
                  <td className="px-5 py-3 text-xs text-muted-foreground whitespace-nowrap">
                    {new Date(r.createdAt).toLocaleString()}
                  </td>
                  <td className="px-5 py-3 text-xs">{r.adminEmail || "—"}</td>
                  <td className="px-5 py-3">
                    <span className="px-2 py-0.5 rounded-md text-[0.65rem] font-semibold uppercase tracking-wider bg-info/15 text-info border border-info/30">
                      {r.action}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-xs">{r.targetEmail || "—"}</td>
                  <td className="px-5 py-3 text-xs font-mono text-muted-foreground max-w-md truncate">
                    {r.changes ? JSON.stringify(r.changes) : "—"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
