import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Send, Wallet, AlertCircle, FileText, Save, Loader2, X, Activity } from "lucide-react";
import { api, type Template, type ActiveCampaign, type Recipient } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { toast } from "sonner";

export const Route = createFileRoute("/app/send")({
  head: () => ({ meta: [{ title: "Send Email — SecretVoIP Mail" }] }),
  component: SendEmailPage,
});

const EMAIL_RE = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
const MAX_RECIPIENTS = 5000;
const POLL_MS = 1500;

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

function formatEta(seconds: number): string {
  if (!seconds || !Number.isFinite(seconds) || seconds < 0) return "—";
  const s = Math.round(seconds);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60), r = s % 60;
  if (m < 60) return r ? `${m}m ${r}s` : `${m}m`;
  const h = Math.floor(m / 60), rm = m % 60;
  return rm ? `${h}h ${rm}m` : `${h}h`;
}

interface LiveStats {
  sent: number; failed: number; total: number;
  ratePerSec: number; etaSeconds: number; progressPct: number;
}

export function SendEmailPage() {
  const { user, refresh } = useAuth();
  const [fromName, setFromName] = useState("");
  const [subject, setSubject] = useState("");
  const [html, setHtml] = useState("");
  const [recipientsRaw, setRecipientsRaw] = useState("");
  const [sending, setSending] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [pricePerEmail, setPricePerEmail] = useState<number | null>(null);
  const [support, setSupport] = useState("@Hamfranord");
  const [active, setActive] = useState<ActiveCampaign | null>(null);
  const [activeCampaignId, setActiveCampaignId] = useState<string | null>(null);
  const [live, setLive] = useState<LiveStats | null>(null);
  const [logRecipients, setLogRecipients] = useState<Recipient[]>([]);
  const [quota, setQuota] = useState<{ monthlySent: number; monthlyLimit: number; monthlyRemaining: number } | null>(null);

  const pollRef = useRef<number | null>(null);

  const loadQuota = useCallback(() => {
    api.mailStats().then(setQuota).catch(() => {});
  }, []);

  // initial loads
  useEffect(() => {
    let mounted = true;
    api.publicSettings().then((s) => {
      if (!mounted) return;
      const v = Number(s.price_per_email);
      if (!Number.isNaN(v)) setPricePerEmail(v);
      if (s.support_telegram) setSupport(String(s.support_telegram));
    }).catch(() => {});
    api.templates().then(setTemplates).catch(() => {});
    loadQuota();
    // detect active campaign on mount (resume polling)
    api.activeCampaign().then((a) => {
      if (!mounted || !a) return;
      setActive(a);
      setActiveCampaignId(a.id);
      setSending(true);
    }).catch(() => {});
    return () => { mounted = false; };
  }, [loadQuota]);

  // live polling loop
  useEffect(() => {
    if (!activeCampaignId) return;
    let alive = true;
    let stopped = false;

    async function tick() {
      if (!alive || !activeCampaignId) return;
      try {
        const [sync, detail] = await Promise.all([
          api.syncCampaign(activeCampaignId).catch(() => null),
          api.campaign(activeCampaignId).catch(() => null),
        ]);
        if (!alive) return;
        if (sync?.live) {
          setLive({
            sent: sync.live.sent || 0,
            failed: sync.live.failed || 0,
            total: sync.live.total || 0,
            ratePerSec: sync.live.ratePerSec || 0,
            etaSeconds: sync.live.etaSeconds || 0,
            progressPct: sync.live.progressPct || 0,
          });
        }
        if (detail?.recipients) setLogRecipients(detail.recipients);
        const status = sync?.status || detail?.campaign.status;
        if (sync?.finalized || status === "completed" || status === "cancelled" || status === "failed" || status === "partial") {
          stopped = true;
          setSending(false);
          setCancelling(false);
          setActiveCampaignId(null);
          setActive(null);
          await refresh();
          loadQuota();
          toast.success(`Campaign ${status}`);
          return;
        }
      } catch {}
      if (!stopped && alive) {
        pollRef.current = window.setTimeout(tick, POLL_MS);
      }
    }
    tick();
    return () => {
      alive = false;
      if (pollRef.current) { clearTimeout(pollRef.current); pollRef.current = null; }
    };
  }, [activeCampaignId, refresh, loadQuota]);

  const parsed = useMemo(() => parseRecipients(recipientsRaw), [recipientsRaw]);
  const effectivePrice = pricePerEmail ?? 0;
  const estimate = parsed.valid.length * effectivePrice;
  const overQuota = quota ? parsed.valid.length > quota.monthlyRemaining : false;

  function loadTemplate(id: string) {
    const t = templates.find((x) => x.id === id); if (!t) return;
    setSubject(t.subject); setHtml(t.html);
    toast.success(`Loaded template "${t.name}"`);
  }
  async function saveAsTemplate() {
    const name = window.prompt("Template name");
    if (!name?.trim()) return;
    if (!subject.trim() || !html.trim()) { toast.error("Subject and HTML required"); return; }
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
    if (active || activeCampaignId) {
      toast.error("Your previous campaign is still processing."); return;
    }
    if (!fromName || !subject || !html || parsed.valid.length === 0) {
      toast.error("Fill in all fields and at least one valid recipient"); return;
    }
    if (parsed.valid.length > MAX_RECIPIENTS) {
      toast.error(`Maximum ${MAX_RECIPIENTS} recipients per campaign`); return;
    }
    if (overQuota) {
      toast.error(`Over monthly quota — ${quota?.monthlyRemaining ?? 0} remaining`); return;
    }
    if ((user?.balance ?? 0) < estimate) {
      toast.error(`Insufficient balance — contact ${support} on Telegram to top up`); return;
    }
    setSending(true);
    setLive({ sent: 0, failed: 0, total: parsed.valid.length, ratePerSec: 0, etaSeconds: 0, progressPct: 0 });
    setLogRecipients([]);
    try {
      const res = await api.sendEmail({ fromName, subject, html, recipients: parsed.valid });
      if (res.status === "completed") {
        toast.success(`Campaign complete — ${res.sent ?? 0}/${res.total ?? 0} accepted`);
        setSending(false);
        setLive(null);
        await refresh();
        loadQuota();
      } else if (res.campaignId) {
        // async path — start polling
        setActiveCampaignId(res.campaignId);
        setActive({
          id: res.campaignId, subject, status: "processing",
          total: parsed.valid.length, queuedCount: parsed.valid.length,
          processingCount: 0, deliveredCount: 0, bouncedCount: 0,
          createdAt: new Date().toISOString(),
        });
        setRecipientsRaw("");
        toast.success(`Queued ${res.queued ?? parsed.valid.length} recipients`);
      }
    } catch (err: any) {
      setSending(false);
      setLive(null);
      toast.error(err?.message || "Send failed");
    }
  }

  async function onCancel() {
    if (!activeCampaignId) return;
    setCancelling(true);
    try {
      await api.cancelCampaign(activeCampaignId);
      toast.success("Cancel requested");
    } catch (err: any) {
      setCancelling(false);
      toast.error(err?.message || "Cancel failed");
    }
  }

  const liveLabel = live
    ? `Transmitting · ${(live.sent + live.failed).toLocaleString()}/${live.total.toLocaleString()} · ETA ${formatEta(live.etaSeconds)}`
    : sending ? "Queueing campaign…" : `Send to ${parsed.valid.length.toLocaleString()} recipient${parsed.valid.length === 1 ? "" : "s"}`;

  return (
    <div className="p-4 sm:p-6 md:p-10 grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-6">
      <div>
        <header>
          <h1 className="text-2xl md:text-4xl font-bold tracking-tight">Send Email</h1>
          <p className="mt-2 text-muted-foreground text-sm">Compose and dispatch a campaign — up to {MAX_RECIPIENTS.toLocaleString()} recipients.</p>
        </header>

        {quota && <QuotaBar q={quota} />}
        {active && <ActiveBanner active={active} live={live} />}

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
                {overQuota && (
                  <span className="text-destructive inline-flex items-center gap-1">
                    <AlertCircle size={12} /> Over monthly quota ({quota?.monthlyRemaining ?? 0} left)
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

          <div className="flex gap-3">
            <button type="submit"
              disabled={sending || !!active || parsed.valid.length === 0 || parsed.valid.length > MAX_RECIPIENTS || overQuota}
              className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl px-6 py-4 text-sm font-semibold text-primary-foreground glow-primary disabled:opacity-50"
              style={{ background: "var(--gradient-primary)" }}>
              {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
              {liveLabel}
            </button>
            {sending && activeCampaignId && (
              <button type="button" onClick={onCancel} disabled={cancelling}
                className="inline-flex items-center justify-center gap-2 rounded-xl px-5 py-4 text-sm font-semibold border border-destructive/60 text-destructive hover:bg-destructive/10 disabled:opacity-50">
                {cancelling ? <Loader2 size={14} className="animate-spin" /> : <X size={14} />}
                {cancelling ? "Cancelling" : "Cancel"}
              </button>
            )}
          </div>

          {live && (
            <div className="glass rounded-2xl p-4 space-y-2">
              <div className="flex justify-between text-[0.7rem] text-muted-foreground">
                <span>Live · {live.sent.toLocaleString()} sent · {live.failed.toLocaleString()} failed · {live.ratePerSec.toFixed(1)}/s · ETA {formatEta(live.etaSeconds)}</span>
                <span className="tabular-nums">{Math.round(live.progressPct)}%</span>
              </div>
              <div className="h-2 bg-card/40 rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-info to-primary transition-all duration-500"
                  style={{ width: `${Math.min(100, live.progressPct)}%` }} />
              </div>
            </div>
          )}
        </form>

        {logRecipients.length > 0 && (
          <div className="mt-6 glass rounded-2xl overflow-hidden">
            <div className="px-4 py-3 border-b border-border flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
              <Activity size={12} /> Transmission log · {logRecipients.length.toLocaleString()} recipients
            </div>
            <div className="max-h-[420px] overflow-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-background/95 backdrop-blur">
                  <tr className="text-left text-[0.625rem] uppercase tracking-wider text-muted-foreground border-b border-border">
                    <th className="px-4 py-2">Recipient</th>
                    <th className="px-4 py-2">Status</th>
                    <th className="px-4 py-2">Error</th>
                  </tr>
                </thead>
                <tbody>
                  {logRecipients.slice(0, 500).map((r) => (
                    <tr key={r.email} className="border-t border-border/30">
                      <td className="px-4 py-1.5 font-mono">{r.email}</td>
                      <td className="px-4 py-1.5"><RecipientBadge status={r.status || (r.accepted ? "delivered" : "queued")} /></td>
                      <td className="px-4 py-1.5 text-destructive truncate max-w-[260px]">{r.error || ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
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

function QuotaBar({ q }: { q: { monthlySent: number; monthlyLimit: number; monthlyRemaining: number } }) {
  const pct = q.monthlyLimit > 0 ? Math.min(100, (q.monthlySent / q.monthlyLimit) * 100) : 0;
  return (
    <div className="mt-4 glass rounded-2xl p-4 space-y-2">
      <div className="flex justify-between text-xs">
        <span className="text-muted-foreground uppercase tracking-wider text-[0.625rem]">Monthly quota</span>
        <span className="tabular-nums">
          {q.monthlySent.toLocaleString()} / {q.monthlyLimit.toLocaleString()}
          <span className="text-muted-foreground"> · {q.monthlyRemaining.toLocaleString()} left</span>
        </span>
      </div>
      <div className="h-1.5 bg-card/40 rounded-full overflow-hidden">
        <div className={`h-full transition-all ${pct > 90 ? "bg-destructive" : pct > 70 ? "bg-warning" : "bg-info"}`}
          style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function ActiveBanner({ active, live }: { active: ActiveCampaign; live: LiveStats | null }) {
  const total = live?.total || active.total || 1;
  const done = live ? (live.sent + live.failed) : ((active.deliveredCount || 0) + (active.bouncedCount || 0));
  const pct = Math.min(100, Math.round((done / total) * 100));
  return (
    <div className="mt-6 glass card-ring-primary rounded-2xl p-5 space-y-3 border border-info/30">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Loader2 size={16} className="animate-spin text-info" />
          <span className="text-sm font-semibold uppercase tracking-wider">{active.status}</span>
          <span className="text-xs text-muted-foreground">· {active.subject}</span>
        </div>
        <Link to="/app/campaigns/$id" params={{ id: active.id }} className="text-xs px-3 py-1.5 rounded-md glass hover:bg-card/60 text-info">Open detail</Link>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
        <Mini label="Total" value={total} />
        <Mini label="Sent" value={live?.sent ?? active.deliveredCount ?? 0} tone="success" />
        <Mini label="Failed" value={live?.failed ?? active.bouncedCount ?? 0} tone="destructive" />
        <Mini label="Rate / s" value={live ? Number(live.ratePerSec.toFixed(1)) : 0} tone="info" />
      </div>
      <div>
        <div className="flex justify-between text-[0.7rem] text-muted-foreground mb-1">
          <span>Progress · ETA {formatEta(live?.etaSeconds ?? 0)}</span><span className="tabular-nums">{pct}%</span>
        </div>
        <div className="h-2 bg-card/40 rounded-full overflow-hidden">
          <div className="h-full bg-gradient-to-r from-info to-primary transition-all" style={{ width: `${pct}%` }} />
        </div>
      </div>
    </div>
  );
}

function RecipientBadge({ status }: { status: string }) {
  const s = (status || "").toLowerCase();
  const tone =
    s === "delivered" || s === "sent" || s === "completed" ? "bg-success/15 text-success"
    : s === "failed" || s === "bounced" || s === "invalid" || s === "cancelled" ? "bg-destructive/15 text-destructive"
    : s === "processing" || s === "sending" ? "bg-info/15 text-info"
    : "bg-muted/30 text-muted-foreground";
  return <span className={`px-2 py-0.5 rounded text-[0.6rem] uppercase font-semibold tracking-wider inline-flex items-center gap-1 ${tone}`}>
    {(s === "processing" || s === "sending") && <Loader2 size={8} className="animate-spin" />}
    {s || "—"}
  </span>;
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
