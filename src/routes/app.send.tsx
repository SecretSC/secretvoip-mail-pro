import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Send, Wallet, AlertCircle, CheckCircle2, FileText, Save, Loader2 } from "lucide-react";
import { api, type Template, type ActiveCampaign } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { toast } from "sonner";

export const Route = createFileRoute("/app/send")({
  head: () => ({ meta: [{ title: "Send Email — SecretVoIP Mail" }] }),
  component: SendEmailPage,
});

const EMAIL_RE = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
const MAX_RECIPIENTS = 5000;

function parseRecipients(raw: string) {
  const tokens = raw.split(/[\s,;]+/).map((t) => t.trim()).filter(Boolean);
  const seen = new Set<string>();
  const valid: string[] = []; const invalid: string[] = []; let duplicates = 0;
  for (const t of tokens) {
    const lower = t.toLowerCase();
    if (!EMAIL_RE.test(t)) { invalid.push(t); continue; }
    if (seen.has(lower)) { duplicates++; continue; }
    seen.add(lower); valid.push(t);
  }
  return { valid, invalid, duplicates };
}

export function SendEmailPage() {
  const { user, refresh } = useAuth();
  const [fromName, setFromName] = useState("");
  const [subject, setSubject] = useState("");
  const [html, setHtml] = useState("");
  const [recipientsRaw, setRecipientsRaw] = useState("");
  const [sending, setSending] = useState(false);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [pricePerEmail, setPricePerEmail] = useState<number | null>(null);
  const [support, setSupport] = useState("@Hamfranord");
  const [active, setActive] = useState<ActiveCampaign | null>(null);

  // ---- live data load
  useEffect(() => {
    let mounted = true;
    function loadPrice() {
      api.publicSettings().then((s) => {
        if (!mounted) return;
        const v = Number(s.price_per_email);
        if (!Number.isNaN(v)) setPricePerEmail(v);
        if (s.support_telegram) setSupport(String(s.support_telegram));
      }).catch(() => {});
    }
    loadPrice();
    api.templates().then(setTemplates).catch(() => {});
    const onFocus = () => loadPrice();
    window.addEventListener("focus", onFocus);
    return () => { mounted = false; window.removeEventListener("focus", onFocus); };
  }, []);

  // ---- poll active campaign every 10s
  useEffect(() => {
    let alive = true;
    async function tick() {
      try {
        const a = await api.activeCampaign();
        if (!alive) return;
        setActive(a);
        if (a && !a.id.startsWith("__")) {
          // also sync provider state
          try { await api.syncCampaign(a.id); } catch {}
        }
      } catch {}
    }
    tick();
    const t = setInterval(tick, 10_000);
    return () => { alive = false; clearInterval(t); };
  }, []);

  const parsed = useMemo(() => parseRecipients(recipientsRaw), [recipientsRaw]);
  const effectivePrice = pricePerEmail ?? 0;
  const estimate = parsed.valid.length * effectivePrice;

  function loadTemplate(id: string) {
    const t = templates.find((x) => x.id === id);
    if (!t) return;
    setSubject(t.subject); setHtml(t.html);
    toast.success(`Loaded template "${t.name}"`);
  }

  async function saveAsTemplate() {
    const name = window.prompt("Template name");
    if (!name?.trim()) return;
    if (!subject.trim() || !html.trim()) {
      toast.error("Subject and HTML required to save a template"); return;
    }
    try {
      await api.createTemplate({ name: name.trim(), subject, html });
      toast.success("Template saved");
      setTemplates(await api.templates());
    } catch (e: any) { toast.error(e?.message || "Save failed"); }
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result || "");
      setRecipientsRaw((prev) => (prev ? prev + "\n" + text : text));
    };
    reader.readAsText(file);
  }

  async function onSend(e: React.FormEvent) {
    e.preventDefault();
    if (active) {
      toast.error("Your previous campaign is still processing. Please wait until it completes.");
      return;
    }
    if (!fromName || !subject || !html || parsed.valid.length === 0) {
      toast.error("Fill in all fields and at least one valid recipient"); return;
    }
    if (parsed.valid.length > MAX_RECIPIENTS) {
      toast.error(`Maximum ${MAX_RECIPIENTS} recipients per campaign`); return;
    }
    if ((user?.balance ?? 0) < estimate) {
      toast.error(`Insufficient wallet balance — contact ${support} on Telegram to top up`); return;
    }
    setSending(true);
    try {
      const res = await api.sendEmail({ fromName, subject, html, recipients: parsed.valid });
      if (res.status === "completed") {
        const sent = res.sent ?? 0; const total = res.total ?? 0; const charged = res.charged ?? 0;
        toast.success(`Campaign complete — ${sent}/${total} accepted · charged ${charged.toFixed(3)} €`);
      } else {
        toast.success(`Campaign queued (${res.queued ?? parsed.valid.length} recipients). Progress will update automatically.`);
      }
      // Clear form for next campaign
      setRecipientsRaw("");
      await refresh();
      // Force refresh of active status
      api.activeCampaign().then(setActive).catch(() => {});
    } catch (err: any) {
      toast.error(err?.message || "Send failed");
    } finally { setSending(false); }
  }

  return (
    <div className="p-4 sm:p-6 md:p-10 grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-6">
      <div>
        <header>
          <h1 className="text-2xl md:text-4xl font-bold tracking-tight">Send Email</h1>
          <p className="mt-2 text-muted-foreground text-sm">Compose and dispatch a campaign — up to {MAX_RECIPIENTS.toLocaleString()} recipients.</p>
        </header>

        {active && <ActiveBanner active={active} onUpdate={setActive} />}

        <form onSubmit={onSend} className="mt-6 space-y-5">
          <div className="glass rounded-2xl p-4 flex flex-wrap items-center gap-3">
            <FileText size={16} className="text-info" />
            <span className="text-xs text-muted-foreground">Load template:</span>
            <select className="input max-w-xs" defaultValue=""
              onChange={(e) => { if (e.target.value) loadTemplate(e.target.value); e.target.value = ""; }}>
              <option value="">— Choose a saved template —</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}{t.source === "assigned" ? " · (assigned)" : ""}
                </option>
              ))}
            </select>
            <button type="button" onClick={saveAsTemplate}
              className="ml-auto inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md glass hover:bg-card/60">
              <Save size={12} /> Save current as template
            </button>
          </div>

          <div className="glass rounded-2xl p-4 sm:p-6 space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="From name *">
                <input required value={fromName} onChange={(e) => setFromName(e.target.value)}
                  placeholder="Acme Notifications" className="input" />
              </Field>
              <Field label="Subject *">
                <input required value={subject} onChange={(e) => setSubject(e.target.value)}
                  placeholder="Your monthly statement" className="input" />
              </Field>
            </div>

            <Field label="Recipients *"
              hint={`Up to ${MAX_RECIPIENTS.toLocaleString()} · ${parsed.valid.length} valid · ${parsed.invalid.length} invalid · ${parsed.duplicates} duplicates`}>
              <textarea required rows={6} value={recipientsRaw}
                onChange={(e) => setRecipientsRaw(e.target.value)}
                placeholder={"alice@example.com, bob@example.com\nor paste / upload one per line (CSV / TXT)"}
                className="input font-mono text-xs" />
              <div className="mt-2 flex items-center gap-3 text-xs flex-wrap">
                <label className="inline-flex items-center gap-2 cursor-pointer text-info hover:text-foreground">
                  <input type="file" accept=".csv,.txt" className="hidden" onChange={handleFile} />
                  Upload CSV or TXT
                </label>
                {parsed.invalid.length > 0 && (
                  <span className="text-destructive inline-flex items-center gap-1">
                    <AlertCircle size={12} /> {parsed.invalid.length} invalid will be skipped
                  </span>
                )}
                {parsed.valid.length > MAX_RECIPIENTS && (
                  <span className="text-destructive inline-flex items-center gap-1">
                    <AlertCircle size={12} /> Maximum {MAX_RECIPIENTS.toLocaleString()} recipients per campaign
                  </span>
                )}
              </div>
            </Field>

            <Field label="HTML content *">
              <textarea required rows={12} value={html} onChange={(e) => setHtml(e.target.value)}
                placeholder="<h1>Hello {{name}}</h1><p>Your message here…</p>"
                className="input font-mono text-xs" />
              <div className="mt-1 text-xs text-muted-foreground">
                Variables: <code>{"{{name}}"}</code> <code>{"{{email}}"}</code> <code>{"{{company}}"}</code>
              </div>
            </Field>
          </div>

          <button type="submit" disabled={sending || !!active || parsed.valid.length === 0 || parsed.valid.length > MAX_RECIPIENTS}
            className="w-full inline-flex items-center justify-center gap-2 rounded-xl px-6 py-4 text-sm font-semibold text-primary-foreground glow-primary disabled:opacity-50"
            style={{ background: "var(--gradient-primary)" }}>
            {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
            {active
              ? "Wait for current campaign to finish"
              : sending
                ? "Queueing campaign…"
                : `Send to ${parsed.valid.length.toLocaleString()} recipient${parsed.valid.length === 1 ? "" : "s"}`}
          </button>
        </form>
      </div>

      <aside className="space-y-4 xl:sticky xl:top-4 xl:self-start">
        <div className="glass card-ring-primary rounded-2xl p-5">
          <div className="flex items-center justify-between text-[0.625rem] font-semibold tracking-[0.18em] uppercase text-muted-foreground">
            Wallet balance <Wallet size={14} className="text-info" />
          </div>
          <div className="mt-3 text-3xl font-bold tabular-nums">
            {(user?.balance ?? 0).toFixed(2)} <span className="text-base text-muted-foreground font-normal">€</span>
          </div>
        </div>

        <div className="glass rounded-2xl p-5">
          <div className="text-[0.625rem] font-semibold tracking-[0.18em] uppercase text-muted-foreground">Summary</div>
          <dl className="mt-4 space-y-2.5 text-sm">
            <Row k="Recipients" v={parsed.valid.length.toLocaleString()} />
            <Row k="Invalid" v={parsed.invalid.length.toString()} muted />
            <Row k="Duplicates" v={parsed.duplicates.toString()} muted />
            <Row k="Per email" v={pricePerEmail === null ? "…" : `${effectivePrice.toFixed(4)} €`} />
            <div className="h-px bg-border my-2" />
            <Row k="Estimated cost" v={<span className="text-info">{estimate.toFixed(3)} €</span>} />
          </dl>
          <p className="mt-4 text-[0.7rem] text-muted-foreground leading-relaxed">
            You're only charged for accepted recipients. Failed sends are free.
          </p>
        </div>

        <div className="glass rounded-2xl p-5 text-xs text-muted-foreground">
          Need to top up? Contact <span className="text-foreground font-semibold">{support}</span> on Telegram.
        </div>
      </aside>

      <style>{`
        .input {
          width: 100%;
          background: oklch(0.24 0.04 262 / 0.5);
          border: 1px solid var(--color-border);
          border-radius: 0.625rem;
          padding: 0.625rem 0.875rem;
          color: var(--color-foreground);
          font-size: 0.875rem;
          transition: border-color 200ms, box-shadow 200ms;
          resize: vertical;
        }
        .input::placeholder { color: var(--color-muted-foreground); }
        .input:focus {
          outline: none;
          border-color: oklch(0.62 0.22 22 / 0.6);
          box-shadow: 0 0 0 3px oklch(0.62 0.22 22 / 0.2);
        }
      `}</style>
    </div>
  );
}

function ActiveBanner({ active, onUpdate }: { active: ActiveCampaign; onUpdate: (a: ActiveCampaign | null) => void }) {
  const total = active.total || 1;
  const done = (active.deliveredCount || 0) + (active.bouncedCount || 0);
  const pct = Math.min(100, Math.round((done / total) * 100));
  async function refresh() {
    try {
      await api.syncCampaign(active.id);
      const next = await api.activeCampaign();
      onUpdate(next);
    } catch {}
  }
  return (
    <div className="mt-6 glass card-ring-primary rounded-2xl p-5 space-y-3 border border-info/30">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Loader2 size={16} className="animate-spin text-info" />
          <span className="text-sm font-semibold uppercase tracking-wider">{active.status}</span>
          <span className="text-xs text-muted-foreground">· {active.subject}</span>
        </div>
        <div className="flex gap-2">
          <button onClick={refresh} className="text-xs px-3 py-1.5 rounded-md glass hover:bg-card/60">Refresh</button>
          <Link to="/app/campaigns/$id" params={{ id: active.id }} className="text-xs px-3 py-1.5 rounded-md glass hover:bg-card/60 text-info">Open detail</Link>
        </div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
        <Mini label="Total" value={total} />
        <Mini label="Queued" value={active.queuedCount || 0} tone="info" />
        <Mini label="Delivered" value={active.deliveredCount || 0} tone="success" />
        <Mini label="Bounced" value={active.bouncedCount || 0} tone="destructive" />
      </div>
      <div>
        <div className="flex justify-between text-[0.7rem] text-muted-foreground mb-1">
          <span>Progress</span><span className="tabular-nums">{pct}%</span>
        </div>
        <div className="h-2 bg-card/40 rounded-full overflow-hidden">
          <div className="h-full bg-gradient-to-r from-info to-primary transition-all" style={{ width: `${pct}%` }} />
        </div>
      </div>
    </div>
  );
}

function Mini({ label, value, tone }: { label: string; value: number; tone?: "info" | "success" | "destructive" }) {
  const color = tone === "info" ? "text-info" : tone === "success" ? "text-success" : tone === "destructive" ? "text-destructive" : "text-foreground";
  return (
    <div className="glass rounded-lg p-2">
      <div className="text-[0.6rem] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`text-base font-bold tabular-nums ${color}`}>{value.toLocaleString()}</div>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <label className="text-sm font-medium">{label}</label>
        {hint && <span className="text-[0.7rem] text-muted-foreground">{hint}</span>}
      </div>
      <div className="mt-2">{children}</div>
    </div>
  );
}

function Row({ k, v, muted }: { k: string; v: React.ReactNode; muted?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <dt className={muted ? "text-muted-foreground" : "text-foreground"}>{k}</dt>
      <dd className="font-semibold tabular-nums">{v}</dd>
    </div>
  );
}
