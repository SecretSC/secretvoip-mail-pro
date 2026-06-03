import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Save } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/app/admin/settings")({
  component: SettingsPage,
});

interface SettingDef {
  key: string;
  label: string;
  type: "string" | "number" | "boolean";
  hint?: string;
  group: string;
}

const DEFS: SettingDef[] = [
  { key: "site_name", label: "Site name", type: "string", group: "Branding", hint: "Shown in headers and tab titles" },
  { key: "brand_tagline", label: "Brand tagline", type: "string", group: "Branding", hint: "Short marketing tagline" },
  { key: "support_telegram", label: "Support Telegram username", type: "string", group: "Branding", hint: "e.g. @Hamfranord — shown on login, help, top-up info" },

  { key: "price_per_email", label: "Customer price per email (€)", type: "number", group: "Pricing", hint: "What customers are charged per accepted recipient" },
  { key: "provider_cost_per_email", label: "Provider cost per email (€)", type: "number", group: "Pricing", hint: "Admin-only. Your upstream cost. Used to compute profit." },

  { key: "maintenance_mode", label: "Maintenance mode", type: "boolean", group: "System", hint: "Disable sending for everyone" },
];

function SettingsPage() {
  const [values, setValues] = useState<Record<string, any> | null>(null);
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    api.settings().then(setValues).catch((e) => toast.error(e?.message || "Failed"));
  }, []);

  async function save(def: SettingDef) {
    if (!values) return;
    setSaving(def.key);
    try {
      let v = values[def.key];
      if (def.type === "number") v = parseFloat(v) || 0;
      await api.updateSetting(def.key, v);
      toast.success(`Updated ${def.label}`);
    } catch (e: any) { toast.error(e?.message || "Failed"); }
    finally { setSaving(null); }
  }

  if (!values) return <div className="p-10 text-sm text-muted-foreground">Loading…</div>;

  const groups = Array.from(new Set(DEFS.map((d) => d.group)));

  return (
    <div className="p-4 sm:p-6 md:p-10 space-y-6 max-w-3xl">
      <header>
        <h2 className="text-2xl font-bold tracking-tight">Platform settings</h2>
        <p className="text-sm text-muted-foreground">Branding, pricing and maintenance — applied platform-wide.</p>
      </header>

      {groups.map((g) => (
        <section key={g} className="space-y-3">
          <div className="text-[0.625rem] uppercase tracking-[0.18em] text-info font-semibold">{g}</div>
          <div className="space-y-3">
            {DEFS.filter((d) => d.group === g).map((def) => {
              const raw = values[def.key];
              return (
                <div key={def.key} className="glass rounded-xl p-4 sm:p-5">
                  <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <label className="text-sm font-semibold">{def.label}</label>
                      {def.hint && <div className="text-xs text-muted-foreground mt-0.5">{def.hint}</div>}
                      <div className="mt-3">
                        {def.type === "boolean" ? (
                          <button type="button" onClick={() => setValues({ ...values, [def.key]: !raw })}
                            className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold border ${
                              raw ? "bg-destructive/15 text-destructive border-destructive/30"
                                : "bg-success/15 text-success border-success/30"}`}>
                            {raw ? "Enabled" : "Disabled"}
                          </button>
                        ) : (
                          <input value={raw ?? ""}
                            type={def.type === "number" ? "number" : "text"}
                            step={def.type === "number" ? "0.0001" : undefined}
                            onChange={(e) => setValues({ ...values, [def.key]: e.target.value })}
                            className="w-full bg-card/50 border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary/60" />
                        )}
                      </div>
                    </div>
                    <button onClick={() => save(def)} disabled={saving === def.key}
                      className="shrink-0 inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-primary-foreground glow-primary disabled:opacity-50"
                      style={{ background: "var(--gradient-primary)" }}>
                      <Save size={14} /> {saving === def.key ? "Saving…" : "Save"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
