import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { api, type Customer, type PrivateTemplate, type Template } from "@/lib/api";
import { toast } from "sonner";
import { Plus, Save, Trash2, Eye, Code2, X, FileText, Users, Check, ShieldCheck, UserCircle2 } from "lucide-react";

export const Route = createFileRoute("/app/admin/templates")({
  head: () => ({ meta: [{ title: "Templates — Admin" }] }),
  component: AdminTemplatesPage,
});

type Mode = "html" | "preview" | "split";
type Tab = "private" | "customer";

function AdminTemplatesPage() {
  const [tab, setTab] = useState<Tab>("private");
  const [items, setItems] = useState<PrivateTemplate[] | null>(null);
  const [active, setActive] = useState<PrivateTemplate | null>(null);
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [html, setHtml] = useState("");
  const [mode, setMode] = useState<Mode>("split");
  const [saving, setSaving] = useState(false);
  const [assignFor, setAssignFor] = useState<PrivateTemplate | null>(null);

  async function load() {
    try { setItems(await api.adminPrivateTemplates()); }
    catch (e: any) { toast.error(e?.message || "Failed"); }
  }
  useEffect(() => { load(); }, []);

  function startNew() {
    setActive(null); setName(""); setSubject("");
    setHtml("<h1>Premium offer</h1>\n<p>Reusable content…</p>");
  }
  function open(t: PrivateTemplate) {
    setActive(t); setName(t.name); setSubject(t.subject); setHtml(t.html);
  }

  async function save() {
    if (!name.trim() || !subject.trim() || !html.trim()) {
      toast.error("All fields are required"); return;
    }
    setSaving(true);
    try {
      if (active) {
        await api.adminUpdatePrivateTemplate(active.id, { name, subject, html });
        toast.success("Updated");
      } else {
        const { id } = await api.adminCreatePrivateTemplate({ name, subject, html });
        toast.success("Created");
        const fresh = await api.adminPrivateTemplates();
        setItems(fresh);
        const c = fresh.find((x) => x.id === id);
        if (c) setActive(c);
        return;
      }
      await load();
    } catch (e: any) { toast.error(e?.message || "Save failed"); }
    finally { setSaving(false); }
  }

  async function remove(t: PrivateTemplate) {
    if (!confirm(`Delete "${t.name}"?`)) return;
    try {
      await api.adminDeletePrivateTemplate(t.id);
      toast.success("Deleted");
      if (active?.id === t.id) { setActive(null); setName(""); setSubject(""); setHtml(""); }
      await load();
    } catch (e: any) { toast.error(e?.message || "Failed"); }
  }

  return (
    <div className="p-4 sm:p-6 md:p-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Private Templates</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Build premium templates and assign them to selected customers.
          </p>
        </div>
        {tab === "private" && (
          <button onClick={startNew}
            className="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold text-primary-foreground glow-primary"
            style={{ background: "var(--gradient-primary)" }}>
            <Plus size={14} /> New private template
          </button>
        )}
      </header>

      <div className="mt-4 flex gap-1 border-b border-border">
        <button onClick={() => setTab("private")}
          className={`px-4 py-2 text-sm font-semibold border-b-2 inline-flex items-center gap-2 ${
            tab === "private" ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
          <ShieldCheck size={14} /> Admin Private Templates
        </button>
        <button onClick={() => setTab("customer")}
          className={`px-4 py-2 text-sm font-semibold border-b-2 inline-flex items-center gap-2 ${
            tab === "customer" ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
          <UserCircle2 size={14} /> Customer Templates
        </button>
      </div>

      {tab === "customer" ? <CustomerTemplatesPanel /> : null}
      {tab === "private" && (

      <div className="mt-6 grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6">
        <aside className="glass rounded-2xl p-3 space-y-1 h-max">
          {items === null ? (
            <div className="p-6 text-center text-xs text-muted-foreground">Loading…</div>
          ) : items.length === 0 ? (
            <div className="p-6 text-center text-xs text-muted-foreground">
              <FileText size={20} className="mx-auto mb-2 opacity-40" /> None yet
            </div>
          ) : items.map((t) => (
            <button key={t.id} onClick={() => open(t)}
              className={`w-full text-left px-3 py-2.5 rounded-lg ${
                active?.id === t.id ? "bg-primary/15 border border-primary/30"
                  : "hover:bg-card/40 border border-transparent"}`}>
              <div className="text-sm font-semibold truncate">{t.name}</div>
              <div className="text-[0.7rem] text-muted-foreground truncate">{t.subject}</div>
              <div className="mt-1 text-[0.65rem] text-info">{t.assignees.length} customer(s)</div>
            </button>
          ))}
        </aside>

        <section className="glass rounded-2xl p-4 sm:p-6 space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Template name">
              <input value={name} onChange={(e) => setName(e.target.value)} className="tpl-input" />
            </Field>
            <Field label="Subject">
              <input value={subject} onChange={(e) => setSubject(e.target.value)} className="tpl-input" />
            </Field>
          </div>

          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="text-sm font-medium">HTML</div>
            <div className="flex gap-1 text-xs">
              {(["html", "split", "preview"] as Mode[]).map((m) => (
                <button key={m} onClick={() => setMode(m)}
                  className={`inline-flex items-center gap-1 px-3 py-1 rounded-md font-medium capitalize ${
                    mode === m ? "bg-primary/20 text-primary-foreground border border-primary/40" : "text-muted-foreground hover:text-foreground"}`}>
                  {m === "html" ? <Code2 size={12} /> : m === "preview" ? <Eye size={12} /> : null} {m}
                </button>
              ))}
            </div>
          </div>

          <div className={`grid gap-4 ${mode === "split" ? "grid-cols-1 md:grid-cols-2" : "grid-cols-1"}`}>
            {mode !== "preview" && (
              <textarea value={html} onChange={(e) => setHtml(e.target.value)} rows={18} className="tpl-input font-mono text-xs" />
            )}
            {mode !== "html" && (
              <div className="rounded-lg border border-border bg-white overflow-hidden">
                <iframe title="preview" className="w-full h-[450px]" sandbox="" srcDoc={html} />
              </div>
            )}
          </div>

          {active && (
            <div className="glass rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Assigned customers ({active.assignees.length})
                </div>
                <button onClick={() => setAssignFor(active)} className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md glass hover:bg-card/60">
                  <Users size={12} /> Manage access
                </button>
              </div>
              {active.assignees.length === 0 ? (
                <div className="text-xs text-muted-foreground">Not assigned to anyone yet.</div>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {active.assignees.map((a) => (
                    <span key={a.userId} className="text-xs px-2 py-0.5 rounded bg-info/15 text-info border border-info/30">
                      {a.username || a.fullName}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-2 flex-wrap">
            {active && (
              <button onClick={() => remove(active)} className="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold text-destructive border border-destructive/30 hover:bg-destructive/10">
                <Trash2 size={14} /> Delete
              </button>
            )}
            <button onClick={save} disabled={saving}
              className="inline-flex items-center gap-2 rounded-xl px-5 py-2 text-sm font-semibold text-primary-foreground glow-primary disabled:opacity-50"
              style={{ background: "var(--gradient-primary)" }}>
              <Save size={14} /> {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </section>
      </div>
      )}

      {assignFor && <AssignModal template={assignFor} onClose={() => setAssignFor(null)} onSaved={() => { setAssignFor(null); load().then(() => {
        if (active) api.adminPrivateTemplates().then((all) => { const f = all.find((x) => x.id === active.id); if (f) setActive(f); });
      }); }} />}

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
      `}</style>
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

function AssignModal({ template, onClose, onSaved }: { template: PrivateTemplate; onClose: () => void; onSaved: () => void }) {
  const [customers, setCustomers] = useState<Customer[] | null>(null);
  const [assigned, setAssigned] = useState<Set<string>>(new Set(template.assignees.map(a => a.userId)));
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState("");

  useEffect(() => { api.adminCustomers().then(setCustomers).catch(() => {}); }, []);

  function toggle(id: string) {
    const next = new Set(assigned);
    if (next.has(id)) next.delete(id); else next.add(id);
    setAssigned(next);
  }

  async function save() {
    setSaving(true);
    try {
      const original = new Set(template.assignees.map(a => a.userId));
      const toAdd = [...assigned].filter((x) => !original.has(x));
      const toRemove = [...original].filter((x) => !assigned.has(x));
      if (toAdd.length) await api.adminAssignTemplate(template.id, toAdd);
      if (toRemove.length) await api.adminUnassignTemplate(template.id, toRemove);
      toast.success("Access updated");
      onSaved();
    } catch (e: any) { toast.error(e?.message || "Failed"); }
    finally { setSaving(false); }
  }

  const filtered = (customers || []).filter((c) => {
    const f = filter.trim().toLowerCase();
    if (!f) return true;
    return (c.username || "").toLowerCase().includes(f) || (c.fullName || "").toLowerCase().includes(f);
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
      <div className="glass-strong rounded-2xl max-w-lg w-full p-6 max-h-[92vh] flex flex-col">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold">Assign · {template.name}</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground p-1"><X size={16} /></button>
        </div>
        <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter customers…"
          className="w-full bg-card/50 border border-border rounded-lg px-3 py-2 text-sm mb-3" />
        <div className="flex-1 overflow-y-auto space-y-1 -mx-2 px-2">
          {customers === null ? <div className="text-xs text-muted-foreground py-8 text-center">Loading…</div>
            : filtered.length === 0 ? <div className="text-xs text-muted-foreground py-8 text-center">No customers match.</div>
            : filtered.map((c) => {
              const on = assigned.has(c.id);
              return (
                <button key={c.id} onClick={() => toggle(c.id)}
                  className={`w-full flex items-center justify-between gap-3 px-3 py-2 rounded-lg ${on ? "bg-primary/15 border border-primary/30" : "hover:bg-card/40 border border-transparent"}`}>
                  <div className="text-left min-w-0 flex-1">
                    <div className="text-sm font-medium truncate">{c.username || c.fullName}</div>
                    <div className="text-[0.7rem] text-muted-foreground truncate">{c.fullName}</div>
                  </div>
                  {on && <Check size={14} className="text-primary shrink-0" />}
                </button>
              );
          })}
        </div>
        <div className="flex justify-end gap-2 pt-4 mt-2 border-t border-border">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg text-muted-foreground">Cancel</button>
          <button onClick={save} disabled={saving}
            className="px-5 py-2 text-sm rounded-lg font-semibold text-primary-foreground glow-primary disabled:opacity-50"
            style={{ background: "var(--gradient-primary)" }}>
            {saving ? "Saving…" : "Save access"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// CUSTOMER TEMPLATES PANEL (admin moderation)
// ============================================================
function CustomerTemplatesPanel() {
  type Row = Template & { userId: string; userEmail: string | null; userName: string | null };
  const [rows, setRows] = useState<Row[] | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [userId, setUserId] = useState<string>("");
  const [search, setSearch] = useState("");
  const [edit, setEdit] = useState<Row | null>(null);
  const [preview, setPreview] = useState<Row | null>(null);

  async function load() {
    try { setRows(await api.adminCustomerTemplates(userId || undefined)); }
    catch (e: any) { toast.error(e?.message || "Failed"); }
  }
  useEffect(() => { api.adminCustomers().then(setCustomers).catch(() => {}); }, []);
  useEffect(() => { load(); }, [userId]);

  const filtered = (rows || []).filter((r) => {
    if (!search) return true;
    const s = search.toLowerCase();
    return `${r.name} ${r.subject} ${r.userEmail || ""}`.toLowerCase().includes(s);
  });

  async function remove(r: Row) {
    if (!confirm(`Delete "${r.name}" from ${r.userEmail || "customer"}?`)) return;
    try { await api.adminDeleteCustomerTemplate(r.id); toast.success("Deleted"); load(); }
    catch (e: any) { toast.error(e?.message || "Failed"); }
  }

  return (
    <div className="mt-6 space-y-4">
      <div className="glass rounded-2xl p-4 flex flex-wrap items-center gap-3">
        <select value={userId} onChange={(e) => setUserId(e.target.value)}
          className="tpl-input max-w-xs">
          <option value="">All customers</option>
          {customers.map((c) => (
            <option key={c.id} value={c.id}>{c.username || c.fullName}</option>
          ))}
        </select>
        <input placeholder="Search template / subject / user…" value={search}
          onChange={(e) => setSearch(e.target.value)} className="tpl-input flex-1 min-w-[200px]" />
      </div>

      <div className="glass rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          {rows === null ? <div className="p-10 text-center text-sm text-muted-foreground">Loading…</div>
          : filtered.length === 0 ? <div className="p-10 text-center text-sm text-muted-foreground">No templates.</div>
          : (
            <table className="w-full text-xs">
              <thead className="bg-card/40">
                <tr className="text-left uppercase tracking-wider text-[0.625rem] text-muted-foreground">
                  <th className="px-4 py-2">Customer</th>
                  <th className="px-4 py-2">Name</th>
                  <th className="px-4 py-2">Subject</th>
                  <th className="px-4 py-2">Updated</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id} className="border-t border-border/40 hover:bg-card/30">
                    <td className="px-4 py-2">{r.userEmail || r.userName || "—"}</td>
                    <td className="px-4 py-2 font-semibold">{r.name}</td>
                    <td className="px-4 py-2 truncate max-w-[280px]">{r.subject}</td>
                    <td className="px-4 py-2 text-muted-foreground">{new Date(r.updatedAt).toLocaleString()}</td>
                    <td className="px-4 py-2 text-right whitespace-nowrap">
                      <button onClick={() => setPreview(r)} className="text-info hover:underline mr-3">Preview</button>
                      <button onClick={() => setEdit(r)} className="text-foreground hover:underline mr-3">Edit</button>
                      <button onClick={() => remove(r)} className="text-destructive hover:underline">Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {edit && <EditCustomerTemplateModal row={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); load(); }} />}
      {preview && (
        <div className="fixed inset-0 z-50 grid place-items-center p-4 bg-background/80 backdrop-blur-sm">
          <div className="glass-strong rounded-2xl max-w-3xl w-full max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-5 py-3 border-b border-border">
              <div>
                <div className="text-sm font-semibold">{preview.name}</div>
                <div className="text-xs text-muted-foreground">{preview.subject}</div>
              </div>
              <button onClick={() => setPreview(null)}><X size={16} /></button>
            </div>
            <iframe title="preview" className="w-full flex-1 bg-white" sandbox="" srcDoc={preview.html} />
          </div>
        </div>
      )}
    </div>
  );
}

function EditCustomerTemplateModal({ row, onClose, onSaved }: { row: Template; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(row.name);
  const [subject, setSubject] = useState(row.subject);
  const [html, setHtml] = useState(row.html);
  const [saving, setSaving] = useState(false);
  async function save() {
    setSaving(true);
    try {
      await api.adminUpdateCustomerTemplate(row.id, { name, subject, html });
      toast.success("Updated"); onSaved();
    } catch (e: any) { toast.error(e?.message || "Failed"); }
    finally { setSaving(false); }
  }
  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4 bg-background/80 backdrop-blur-sm">
      <div className="glass-strong rounded-2xl max-w-4xl w-full max-h-[92vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-3 border-b border-border">
          <h3 className="text-lg font-bold">Edit customer template</h3>
          <button onClick={onClose}><X size={16} /></button>
        </div>
        <div className="p-5 space-y-3 overflow-auto">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" className="tpl-input" />
          <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject" className="tpl-input" />
          <textarea value={html} onChange={(e) => setHtml(e.target.value)} rows={14} className="tpl-input font-mono text-xs" />
        </div>
        <div className="flex justify-end gap-2 p-4 border-t border-border">
          <button onClick={onClose} className="px-4 py-2 text-sm text-muted-foreground">Cancel</button>
          <button onClick={save} disabled={saving}
            className="px-5 py-2 text-sm rounded-lg font-semibold text-primary-foreground glow-primary disabled:opacity-50"
            style={{ background: "var(--gradient-primary)" }}>
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      </div>
    </div>
  );
}
