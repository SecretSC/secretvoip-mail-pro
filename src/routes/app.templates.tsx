import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { api, type Template } from "@/lib/api";
import { Plus, Save, Trash2, Eye, Code2, FileText } from "lucide-react";
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
    try {
      const t = await api.templates();
      setItems(t);
    } catch (e: any) {
      toast.error(e?.message || "Failed to load");
    }
  }

  useEffect(() => {
    load();
  }, []);

  function startNew() {
    setActive(null);
    setName("");
    setSubject("");
    setHtml(
      "<h1>Hello {{name}}</h1>\n<p>Write your message here…</p>",
    );
  }

  function openTemplate(t: Template) {
    setActive(t);
    setName(t.name);
    setSubject(t.subject);
    setHtml(t.html);
  }

  async function save() {
    if (!name.trim() || !subject.trim() || !html.trim()) {
      toast.error("Name, subject and HTML are required");
      return;
    }
    setSaving(true);
    try {
      if (active) {
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
    } catch (e: any) {
      toast.error(e?.message || "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function remove(t: Template) {
    if (!confirm(`Delete template "${t.name}"?`)) return;
    try {
      await api.deleteTemplate(t.id);
      toast.success("Deleted");
      if (active?.id === t.id) {
        setActive(null);
        setName("");
        setSubject("");
        setHtml("");
      }
      await load();
    } catch (e: any) {
      toast.error(e?.message || "Delete failed");
    }
  }

  return (
    <div className="p-8 md:p-10">
      <header className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
            Templates
          </h1>
          <p className="mt-2 text-muted-foreground">
            Save reusable HTML templates and reuse them in your campaigns.
          </p>
        </div>
        <button
          onClick={startNew}
          className="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold text-primary-foreground glow-primary"
          style={{ background: "var(--gradient-primary)" }}
        >
          <Plus size={14} /> New template
        </button>
      </header>

      <div className="mt-8 grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6">
        <aside className="glass rounded-2xl p-3 space-y-1 h-max">
          {items === null ? (
            <div className="p-6 text-center text-xs text-muted-foreground">
              Loading…
            </div>
          ) : items.length === 0 ? (
            <div className="p-6 text-center text-xs text-muted-foreground">
              <FileText size={20} className="mx-auto mb-2 opacity-40" />
              No templates yet
            </div>
          ) : (
            items.map((t) => (
              <button
                key={t.id}
                onClick={() => openTemplate(t)}
                className={`w-full text-left px-3 py-2.5 rounded-lg group transition-colors ${
                  active?.id === t.id
                    ? "bg-primary/15 border border-primary/30"
                    : "hover:bg-card/40 border border-transparent"
                }`}
              >
                <div className="text-sm font-semibold truncate">{t.name}</div>
                <div className="text-[0.7rem] text-muted-foreground truncate">
                  {t.subject}
                </div>
              </button>
            ))
          )}
        </aside>

        <section className="glass rounded-2xl p-6 space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Template name">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Monthly newsletter"
                className="tpl-input"
              />
            </Field>
            <Field label="Subject">
              <input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Your monthly update"
                className="tpl-input"
              />
            </Field>
          </div>

          <div className="flex items-center justify-between">
            <div className="text-sm font-medium">HTML</div>
            <div className="flex gap-1 text-xs">
              {(["html", "split", "preview"] as Mode[]).map((m) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className={`inline-flex items-center gap-1 px-3 py-1 rounded-md font-medium capitalize transition-colors ${
                    mode === m
                      ? "bg-primary/20 text-primary-foreground border border-primary/40"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {m === "html" ? <Code2 size={12} /> : m === "preview" ? <Eye size={12} /> : null}
                  {m}
                </button>
              ))}
            </div>
          </div>

          <div
            className={`grid gap-4 ${
              mode === "split" ? "grid-cols-1 md:grid-cols-2" : "grid-cols-1"
            }`}
          >
            {mode !== "preview" && (
              <textarea
                value={html}
                onChange={(e) => setHtml(e.target.value)}
                rows={18}
                placeholder="<h1>Hello</h1>"
                className="tpl-input font-mono text-xs"
              />
            )}
            {mode !== "html" && (
              <div className="rounded-lg border border-border bg-white overflow-hidden">
                <iframe
                  title="preview"
                  className="w-full h-[450px]"
                  sandbox=""
                  srcDoc={html}
                />
              </div>
            )}
          </div>

          <div className="flex items-center justify-between gap-3 pt-2">
            <div className="text-xs text-muted-foreground">
              {active ? `Editing · last updated ${new Date(active.updatedAt).toLocaleDateString()}` : "New template"}
            </div>
            <div className="flex gap-2">
              {active && (
                <button
                  onClick={() => remove(active)}
                  className="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold text-destructive border border-destructive/30 hover:bg-destructive/10"
                >
                  <Trash2 size={14} /> Delete
                </button>
              )}
              <button
                onClick={save}
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-xl px-5 py-2 text-sm font-semibold text-primary-foreground glow-primary disabled:opacity-50"
                style={{ background: "var(--gradient-primary)" }}
              >
                <Save size={14} /> {saving ? "Saving…" : "Save"}
              </button>
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
          color: var(--color-foreground);
          font-size: 0.875rem;
          resize: vertical;
        }
        .tpl-input:focus { outline: none; border-color: oklch(0.62 0.22 22 / 0.6); box-shadow: 0 0 0 3px oklch(0.62 0.22 22 / 0.2); }
      `}</style>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-sm font-medium">{label}</label>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}
