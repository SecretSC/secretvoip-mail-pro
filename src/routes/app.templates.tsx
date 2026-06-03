import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { api, type Template } from "@/lib/api";
import { Plus, Save, Trash2, Eye, Code2, FileText, Copy } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/app/templates")({
  head: () => ({ meta: [{ title: "Templates — SecretVoIP Mail" }] }),
  component: TemplatesPage,
});

type Mode = "html" | "preview" | "split";

function TemplatesPage() {
  const [items, setItems] = useState<Template[] | null>(null);
  const [active, setActive] = useState<Template | null>(null);
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [html, setHtml] = useState("");
  const [mode, setMode] = useState<Mode>("split");
  const [saving, setSaving] = useState(false);

  async function load() {
    try { setItems(await api.templates()); }
    catch (e: any) { toast.error(e?.message || "Failed to load"); }
  }
  useEffect(() => { load(); }, []);

  function startNew() {
    setActive(null); setName(""); setSubject("");
    setHtml("<h1>Hello {{name}}</h1>\n<p>Write your message here…</p>");
  }
  function openTemplate(t: Template) {
    setActive(t); setName(t.name); setSubject(t.subject); setHtml(t.html);
  }

  const readOnly = !!active?.readOnly;

  async function save() {
    if (!name.trim() || !subject.trim() || !html.trim()) {
      toast.error("Name, subject and HTML are required"); return;
    }
    if (readOnly) { toast.error("This is an admin template — save a copy to edit"); return; }
    setSaving(true);
    try {
      if (active && !readOnly) {
        await api.updateTemplate(active.id, { name, subject, html });
        toast.success("Template updated");
      } else {
        const { id } = await api.createTemplate({ name, subject, html });
        toast.success("Template created");
        const fresh = await api.templates();
        setItems(fresh);
        const created = fresh.find((x) => x.id === id);
        if (created) setActive(created);
        return;
      }
      await load();
    } catch (e: any) { toast.error(e?.message || "Save failed"); }
    finally { setSaving(false); }
  }

  async function remove(t: Template) {
    if (t.readOnly) { toast.error("Can't delete an admin-assigned template"); return; }
    if (!confirm(`Delete template "${t.name}"?`)) return;
    try {
      await api.deleteTemplate(t.id); toast.success("Deleted");
      if (active?.id === t.id) { setActive(null); setName(""); setSubject(""); setHtml(""); }
      await load();
    } catch (e: any) { toast.error(e?.message || "Delete failed"); }
  }

  async function saveCopy() {
    if (!active) return;
    try {
      const { id } = await api.copyTemplate(active.id);
      toast.success("Saved a copy to your templates");
      const fresh = await api.templates();
      setItems(fresh);
      const copy = fresh.find((x) => x.id === id);
      if (copy) openTemplate(copy);
    } catch (e: any) { toast.error(e?.message || "Failed"); }
  }

  const ownTemplates = (items || []).filter((t) => t.source !== "assigned");
  const assignedTemplates = (items || []).filter((t) => t.source === "assigned");

  return (
    <div className="p-4 sm:p-6 md:p-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-4xl font-bold tracking-tight">Templates</h1>
          <p className="mt-2 text-muted-foreground text-sm">
            Save your own templates and use ones assigned by the admin.
          </p>
        </div>
        <button onClick={startNew}
          className="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold text-primary-foreground glow-primary"
          style={{ background: "var(--gradient-primary)" }}>
          <Plus size={14} /> New template
        </button>
      </header>

      <div className="mt-6 grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6">
        <aside className="glass rounded-2xl p-3 space-y-3 h-max">
          {items === null ? (
            <div className="p-6 text-center text-xs text-muted-foreground">Loading…</div>
          ) : (
            <>
              <TemplateGroup label="Your templates" items={ownTemplates} active={active} onPick={openTemplate} emptyText="No templates yet" />
              <TemplateGroup label="Assigned by admin" items={assignedTemplates} active={active} onPick={openTemplate} emptyText="None assigned yet" badge="LOCKED" />
            </>
          )}
        </aside>

        <section className="glass rounded-2xl p-4 sm:p-6 space-y-5">
          {readOnly && (
            <div className="rounded-xl border border-info/30 bg-info/10 p-3 text-xs text-info flex items-center justify-between gap-3 flex-wrap">
              <span>This template is provided by your admin and can't be edited directly.</span>
              <div className="flex items-center gap-2">
                <button onClick={saveCopy} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md glass hover:bg-card/60 text-foreground">
                  <Copy size={12} /> Save copy to my templates
                </button>
                <Link to="/app/send" className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md glass hover:bg-card/60 text-foreground">
                  Use in Send Email
                </Link>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Template name">
              <input disabled={readOnly} value={name} onChange={(e) => setName(e.target.value)}
                placeholder="Monthly newsletter" className="tpl-input" />
            </Field>
            <Field label="Subject">
              <input disabled={readOnly} value={subject} onChange={(e) => setSubject(e.target.value)}
                placeholder="Your monthly update" className="tpl-input" />
            </Field>
          </div>

          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="text-sm font-medium">HTML</div>
            <div className="flex gap-1 text-xs">
              {(["html", "split", "preview"] as Mode[]).map((m) => (
                <button key={m} onClick={() => setMode(m)}
                  className={`inline-flex items-center gap-1 px-3 py-1 rounded-md font-medium capitalize ${
                    mode === m ? "bg-primary/20 text-primary-foreground border border-primary/40"
                      : "text-muted-foreground hover:text-foreground"}`}>
                  {m === "html" ? <Code2 size={12} /> : m === "preview" ? <Eye size={12} /> : null} {m}
                </button>
              ))}
            </div>
          </div>

          <div className={`grid gap-4 ${mode === "split" ? "grid-cols-1 md:grid-cols-2" : "grid-cols-1"}`}>
            {mode !== "preview" && (
              <textarea disabled={readOnly} value={html} onChange={(e) => setHtml(e.target.value)}
                rows={18} placeholder="<h1>Hello</h1>" className="tpl-input font-mono text-xs" />
            )}
            {mode !== "html" && (
              <div className="rounded-lg border border-border bg-white overflow-hidden">
                <iframe title="preview" className="w-full h-[450px]" sandbox="" srcDoc={html} />
              </div>
            )}
          </div>

          <div className="flex items-center justify-between gap-3 pt-2 flex-wrap">
            <div className="text-xs text-muted-foreground">
              {active ? `Editing · last updated ${new Date(active.updatedAt).toLocaleDateString()}` : "New template"}
            </div>
            <div className="flex gap-2">
              {active && !readOnly && (
                <button onClick={() => remove(active)}
                  className="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold text-destructive border border-destructive/30 hover:bg-destructive/10">
                  <Trash2 size={14} /> Delete
                </button>
              )}
              {!readOnly && (
                <button onClick={save} disabled={saving}
                  className="inline-flex items-center gap-2 rounded-xl px-5 py-2 text-sm font-semibold text-primary-foreground glow-primary disabled:opacity-50"
                  style={{ background: "var(--gradient-primary)" }}>
                  <Save size={14} /> {saving ? "Saving…" : "Save"}
                </button>
              )}
            </div>
          </div>
        </section>
      </div>

      <style>{`
        .tpl-input {
          width: 100%;
          background: oklch(0.24 0.04 262 / 0.5);
          border: 1px solid var(--color-border);
          border-radius: 0.625rem;
          padding: 0.625rem 0.875rem;
          font-size: 0.875rem;
        }
        .tpl-input:focus { outline: none; border-color: oklch(0.62 0.22 22 / 0.6); }
        .tpl-input:disabled { opacity: 0.7; cursor: not-allowed; }
      `}</style>
    </div>
  );
}

function TemplateGroup({ label, items, active, onPick, emptyText, badge }: {
  label: string; items: Template[]; active: Template | null;
  onPick: (t: Template) => void; emptyText: string; badge?: string;
}) {
  return (
    <div>
      <div className="text-[0.6rem] uppercase tracking-[0.18em] font-semibold text-muted-foreground px-2 py-1">{label}</div>
      {items.length === 0 ? (
        <div className="px-3 py-4 text-center text-xs text-muted-foreground">
          <FileText size={18} className="mx-auto mb-1 opacity-40" /> {emptyText}
        </div>
      ) : items.map((t) => (
        <button key={t.id} onClick={() => onPick(t)}
          className={`w-full text-left px-3 py-2 rounded-lg group transition-colors ${
            active?.id === t.id ? "bg-primary/15 border border-primary/30"
              : "hover:bg-card/40 border border-transparent"}`}>
          <div className="flex items-center justify-between gap-2">
            <div className="text-sm font-semibold truncate">{t.name}</div>
            {badge && <span className="text-[0.55rem] uppercase tracking-wider px-1.5 py-0.5 rounded bg-info/15 text-info border border-info/30">{badge}</span>}
          </div>
          <div className="text-[0.7rem] text-muted-foreground truncate">{t.subject}</div>
        </button>
      ))}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-sm font-medium">{label}</label>
      <div className="mt-1">{children}</div>
    </div>
  );
}
