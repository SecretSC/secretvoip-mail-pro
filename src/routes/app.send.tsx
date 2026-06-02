import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Send, Wallet, AlertCircle, CheckCircle2, FileText, Save } from "lucide-react";
import { api, type Template } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { toast } from "sonner";

export const Route = createFileRoute("/app/send")({
  head: () => ({
    meta: [{ title: "Send Email — SecretVoIP Mail" }],
  }),
  component: SendEmailPage,
});

const EMAIL_RE =
  /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

function parseRecipients(raw: string) {
  const tokens = raw
    .split(/[\s,;]+/)
    .map((t) => t.trim())
    .filter(Boolean);
  const seen = new Set<string>();
  const valid: string[] = [];
  const invalid: string[] = [];
  let duplicates = 0;
  for (const t of tokens) {
    const lower = t.toLowerCase();
    if (!EMAIL_RE.test(t)) {
      invalid.push(t);
      continue;
    }
    if (seen.has(lower)) {
      duplicates++;
      continue;
    }
    seen.add(lower);
    valid.push(t);
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
  const [progress, setProgress] = useState<{
    sent: number;
    failed: number;
    total: number;
  } | null>(null);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [pricePerEmail, setPricePerEmail] = useState(0.003);

  useEffect(() => {
    api.templates().then(setTemplates).catch(() => {});
    api.publicSettings()
      .then((s) => {
        const v = Number(s.price_per_email);
        if (!Number.isNaN(v) && v > 0) setPricePerEmail(v);
      })
      .catch(() => {});
  }, []);

  const parsed = useMemo(() => parseRecipients(recipientsRaw), [recipientsRaw]);
  const estimate = parsed.valid.length * pricePerEmail;

  function loadTemplate(id: string) {
    const t = templates.find((x) => x.id === id);
    if (!t) return;
    setSubject(t.subject);
    setHtml(t.html);
    toast.success(`Loaded template "${t.name}"`);
  }

  async function saveAsTemplate() {
    const name = window.prompt("Template name");
    if (!name?.trim()) return;
    if (!subject.trim() || !html.trim()) {
      toast.error("Subject and HTML required to save a template");
      return;
    }
    try {
      await api.createTemplate({ name: name.trim(), subject, html });
      toast.success("Template saved");
      setTemplates(await api.templates());
    } catch (e: any) {
      toast.error(e?.message || "Save failed");
    }
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result || "");
      setRecipientsRaw((prev) => (prev ? prev + "\n" + text : text));
    };
    reader.readAsText(file);
  }

  async function onSend(e: React.FormEvent) {
    e.preventDefault();
    if (!fromName || !subject || !html || parsed.valid.length === 0) {
      toast.error("Fill in all fields and at least one valid recipient");
      return;
    }
    if (parsed.valid.length > 500) {
      toast.error("Maximum 500 recipients per send");
      return;
    }
    if ((user?.balance ?? 0) <= 0) {
      toast.error("Insufficient wallet balance — contact your administrator");
      return;
    }

    setSending(true);
    setProgress({ sent: 0, failed: 0, total: parsed.valid.length });
    try {
      const res = await api.sendEmail({
        fromName,
        subject,
        html,
        recipients: parsed.valid,
      });
      setProgress({ sent: res.sent, failed: res.failed, total: res.total });
      toast.success(
        `Campaign complete — ${res.sent}/${res.total} accepted · charged ${res.charged.toFixed(2)} €`,
      );
      await refresh();
    } catch (err: any) {
      toast.error(err?.message || "Send failed");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="p-8 md:p-10 grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-8">
      <div>
        <header>
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
            Send Email
          </h1>
          <p className="mt-2 text-muted-foreground">
            Compose and dispatch a campaign via SecretVoIP Mail.
          </p>
        </header>

        <form onSubmit={onSend} className="mt-8 space-y-6">
          <div className="glass rounded-2xl p-4 flex flex-wrap items-center gap-3">
            <FileText size={16} className="text-info" />
            <span className="text-xs text-muted-foreground">Load template:</span>
            <select
              className="input max-w-xs"
              defaultValue=""
              onChange={(e) => {
                if (e.target.value) loadTemplate(e.target.value);
                e.target.value = "";
              }}
            >
              <option value="">— Choose a saved template —</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={saveAsTemplate}
              className="ml-auto inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md glass hover:bg-card/60"
            >
              <Save size={12} /> Save current as template
            </button>
          </div>
          <div className="glass rounded-2xl p-6 space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <Field label="From name *">
                <input
                  required
                  value={fromName}
                  onChange={(e) => setFromName(e.target.value)}
                  placeholder="Acme Notifications"
                  className="input"
                />
              </Field>
              <Field label="Subject *">
                <input
                  required
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Your monthly statement"
                  className="input"
                />
              </Field>
            </div>

            <Field
              label="Recipients *"
              hint={`Up to 500 per send · ${parsed.valid.length} valid · ${parsed.invalid.length} invalid · ${parsed.duplicates} duplicates`}
            >
              <textarea
                required
                rows={5}
                value={recipientsRaw}
                onChange={(e) => setRecipientsRaw(e.target.value)}
                placeholder={"alice@example.com, bob@example.com\nor paste one per line"}
                className="input font-mono text-xs"
              />
              <div className="mt-2 flex items-center gap-3 text-xs">
                <label className="inline-flex items-center gap-2 cursor-pointer text-info hover:text-foreground">
                  <input
                    type="file"
                    accept=".csv,.txt"
                    className="hidden"
                    onChange={handleFile}
                  />
                  Upload CSV or TXT
                </label>
                {parsed.invalid.length > 0 && (
                  <span className="text-destructive inline-flex items-center gap-1">
                    <AlertCircle size={12} /> {parsed.invalid.length} invalid will be skipped
                  </span>
                )}
              </div>
            </Field>

            <Field label="HTML content *">
              <textarea
                required
                rows={12}
                value={html}
                onChange={(e) => setHtml(e.target.value)}
                placeholder="<h1>Hello {{name}}</h1><p>Your message here…</p>"
                className="input font-mono text-xs"
              />
              <div className="mt-1 text-xs text-muted-foreground">
                Supports variables: <code>{"{{name}}"}</code>{" "}
                <code>{"{{email}}"}</code> <code>{"{{company}}"}</code>
              </div>
            </Field>
          </div>

          <button
            type="submit"
            disabled={sending || parsed.valid.length === 0}
            className="w-full inline-flex items-center justify-center gap-2 rounded-xl px-6 py-4 text-sm font-semibold text-primary-foreground glow-primary transition-transform hover:scale-[1.005] disabled:opacity-50 disabled:hover:scale-100"
            style={{ background: "var(--gradient-primary)" }}
          >
            <Send size={16} />
            {sending
              ? `Sending… ${progress?.sent ?? 0} / ${progress?.total ?? 0}`
              : `Send to ${parsed.valid.length} recipient${parsed.valid.length === 1 ? "" : "s"}`}
          </button>

          {progress && !sending && (
            <div className="glass rounded-xl p-4 flex items-center gap-3 text-sm">
              <CheckCircle2 size={18} className="text-success" />
              <span>
                Accepted: <strong>{progress.sent}</strong> · Failed:{" "}
                <strong className="text-destructive">{progress.failed}</strong>{" "}
                of {progress.total}
              </span>
            </div>
          )}
        </form>
      </div>

      <aside className="space-y-6">
        <div className="glass card-ring-primary rounded-2xl p-5">
          <div className="flex items-center justify-between text-[0.625rem] font-semibold tracking-[0.18em] uppercase text-muted-foreground">
            Wallet balance
            <Wallet size={14} className="text-info" />
          </div>
          <div className="mt-3 text-3xl font-bold tabular-nums">
            {(user?.balance ?? 0).toFixed(2)}{" "}
            <span className="text-base text-muted-foreground font-normal">€</span>
          </div>
        </div>

        <div className="glass rounded-2xl p-5">
          <div className="text-[0.625rem] font-semibold tracking-[0.18em] uppercase text-muted-foreground">
            Summary
          </div>
          <dl className="mt-4 space-y-2.5 text-sm">
            <Row k="Recipients" v={parsed.valid.length.toLocaleString()} />
            <Row k="Invalid" v={parsed.invalid.length.toString()} muted />
            <Row k="Duplicates" v={parsed.duplicates.toString()} muted />
            <Row k="Per email" v={`${pricePerEmail.toFixed(3)} €`} />
            <div className="h-px bg-border my-2" />
            <Row
              k="Estimated cost"
              v={<span className="text-info">{estimate.toFixed(3)} €</span>}
            />
          </dl>
          <p className="mt-4 text-[0.7rem] text-muted-foreground leading-relaxed">
            You are only charged for accepted recipients. Failed sends are free.
          </p>
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

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <label className="text-sm font-medium text-foreground">{label}</label>
        {hint && <span className="text-[0.7rem] text-muted-foreground">{hint}</span>}
      </div>
      <div className="mt-2">{children}</div>
    </div>
  );
}

function Row({
  k,
  v,
  muted,
}: {
  k: string;
  v: React.ReactNode;
  muted?: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <dt className={muted ? "text-muted-foreground" : "text-foreground"}>{k}</dt>
      <dd className="font-semibold tabular-nums">{v}</dd>
    </div>
  );
}
