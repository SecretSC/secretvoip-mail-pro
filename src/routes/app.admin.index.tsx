import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { api, type Customer, type WalletTx } from "@/lib/api";
import { toast } from "sonner";
import {
  Plus, Wallet, Lock, Pause, Play, X, History, Pencil, Copy, Check,
} from "lucide-react";
import { CustomerHistoryModal } from "@/components/customer-history-modal";

export const Route = createFileRoute("/app/admin/")({
  component: CustomersPage,
});

function CustomersPage() {
  const [rows, setRows] = useState<Customer[] | null>(null);
  const [overview, setOverview] = useState<Awaited<ReturnType<typeof api.adminOverview>> | null>(null);
  const [creating, setCreating] = useState(false);
  const [walletFor, setWalletFor] = useState<Customer | null>(null);
  const [passwordFor, setPasswordFor] = useState<Customer | null>(null);
  const [historyFor, setHistoryFor] = useState<Customer | null>(null);
  const [editFor, setEditFor] = useState<Customer | null>(null);

  async function load() {
    try {
      const [c, o] = await Promise.all([api.adminCustomers(), api.adminOverview()]);
      setRows(c); setOverview(o);
    } catch (e: any) { toast.error(e?.message || "Failed to load"); }
  }

  useEffect(() => { load(); }, []);

  async function toggleStatus(c: Customer) {
    const next = c.status === "active" ? "suspended" : "active";
    try {
      await api.adminSetStatus(c.id, next);
      toast.success(`Customer ${next}`); load();
    } catch (e: any) { toast.error(e?.message || "Failed"); }
  }

  return (
    <div className="p-4 sm:p-6 md:p-10 space-y-6">
      {overview && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <Stat label="Customers" value={overview.customers.total} />
          <Stat label="Suspended" value={overview.customers.suspended} tone="destructive" />
          <Stat label="Sent today" value={overview.campaigns.today} tone="success" />
          <Stat label="Revenue" value={`${overview.campaigns.revenue.toFixed(2)} €`} tone="info" />
          <Stat label="Profit" value={`${overview.campaigns.profit.toFixed(2)} €`} tone="success" />
        </div>
      )}

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Customers</h2>
          <p className="text-sm text-muted-foreground">Create accounts, top up wallets, suspend access.</p>
        </div>
        <button onClick={() => setCreating(true)}
          className="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold text-primary-foreground glow-primary"
          style={{ background: "var(--gradient-primary)" }}>
          <Plus size={14} /> New customer
        </button>
      </div>

      <div className="glass rounded-2xl overflow-x-auto">
        <table className="w-full text-sm min-w-[640px]">
          <thead>
            <tr className="text-left text-[0.625rem] uppercase tracking-[0.18em] text-muted-foreground border-b border-border">
              <th className="px-4 py-3 font-semibold">Customer</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3 font-semibold text-right">Balance</th>
              <th className="px-4 py-3 font-semibold">Joined</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {!rows ? (
              <tr><td colSpan={5} className="p-8 text-center text-xs text-muted-foreground">Loading…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={5} className="p-8 text-center text-xs text-muted-foreground">No customers yet.</td></tr>
            ) : rows.map((c) => (
              <tr key={c.id} className="border-b border-border/40 hover:bg-card/30">
                <td className="px-4 py-3">
                  <div className="font-semibold">{c.username || c.fullName}</div>
                  <div className="text-xs text-muted-foreground">{c.fullName}{c.email ? ` · ${c.email}` : ""}</div>
                </td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded-md text-[0.65rem] font-semibold uppercase tracking-wider border ${
                    c.status === "active" ? "bg-success/15 text-success border-success/30"
                      : "bg-destructive/15 text-destructive border-destructive/30"}`}>
                    {c.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-right tabular-nums font-semibold">{c.balance.toFixed(2)} €</td>
                <td className="px-4 py-3 text-muted-foreground text-xs">{new Date(c.createdAt).toLocaleDateString()}</td>
                <td className="px-4 py-3 text-right whitespace-nowrap">
                  <IconBtn onClick={() => setHistoryFor(c)} icon={History} label="History" />
                  <IconBtn onClick={() => setWalletFor(c)} icon={Wallet} label="Wallet" tone="info" />
                  <IconBtn onClick={() => setEditFor(c)} icon={Pencil} label="Edit" />
                  <IconBtn onClick={() => setPasswordFor(c)} icon={Lock} label="Password" />
                  <IconBtn onClick={() => toggleStatus(c)} icon={c.status === "active" ? Pause : Play}
                    label={c.status === "active" ? "Suspend" : "Activate"}
                    tone={c.status === "active" ? "destructive" : "success"} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {creating && <NewCustomerModal onClose={() => setCreating(false)} onSaved={() => { setCreating(false); load(); }} />}
      {walletFor && <WalletModal customer={walletFor} onClose={() => setWalletFor(null)} onSaved={() => { setWalletFor(null); load(); }} />}
      {passwordFor && <PasswordModal customer={passwordFor} onClose={() => setPasswordFor(null)} />}
      {historyFor && <CustomerHistoryModal customer={historyFor} onClose={() => setHistoryFor(null)} />}
      {editFor && <EditCustomerModal customer={editFor} onClose={() => setEditFor(null)} onSaved={() => { setEditFor(null); load(); }} />}
    </div>
  );
}

function IconBtn({ onClick, icon: Icon, label, tone }: { onClick: () => void; icon: any; label: string; tone?: "info" | "destructive" | "success" }) {
  const color = tone === "info" ? "text-info hover:bg-info/10"
    : tone === "destructive" ? "text-destructive hover:bg-destructive/10"
    : tone === "success" ? "text-success hover:bg-success/10"
    : "text-muted-foreground hover:text-foreground hover:bg-card/60";
  return (
    <button onClick={onClick} className={`inline-flex items-center gap-1 px-2 py-1 text-xs rounded-md ${color}`}>
      <Icon size={12} /> {label}
    </button>
  );
}

function Stat({ label, value, tone }: { label: string; value: React.ReactNode; tone?: "success" | "destructive" | "info" }) {
  const color = tone === "success" ? "text-success" : tone === "destructive" ? "text-destructive"
    : tone === "info" ? "text-info" : "text-foreground";
  return (
    <div className="glass rounded-xl p-4">
      <div className="text-[0.625rem] uppercase tracking-[0.18em] text-muted-foreground font-semibold">{label}</div>
      <div className={`mt-2 text-2xl font-bold tabular-nums ${color}`}>{value}</div>
    </div>
  );
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
      <div className="glass-strong rounded-2xl max-w-lg w-full p-6 relative max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold">{title}</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground p-1"><X size={16} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

const inputCls = "w-full bg-card/50 border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary/60";

function NewCustomerModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [balance, setBalance] = useState(0);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [created, setCreated] = useState<{ username: string; password: string } | null>(null);
  const [copied, setCopied] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.adminCreateCustomer({
        username: username.trim(), password, balance, notes: notes || undefined,
      });
      setCreated({ username: username.trim(), password });
      toast.success("Customer created");
    } catch (e: any) {
      toast.error(e?.message || "Failed");
    } finally { setSaving(false); }
  }

  if (created) {
    const text = `Username: ${created.username}\nPassword: ${created.password}`;
    return (
      <Modal title="Customer created" onClose={() => { onSaved(); }}>
        <div className="space-y-4">
          <div className="text-sm text-muted-foreground">
            Copy these credentials now — the password is shown <strong>only once</strong>.
          </div>
          <pre className="glass rounded-lg p-3 text-xs whitespace-pre-wrap break-all">{text}</pre>
          <button onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm rounded-lg glass hover:bg-card/60">
            {copied ? <><Check size={14} /> Copied</> : <><Copy size={14} /> Copy</>}
          </button>
          <div className="flex justify-end">
            <button onClick={onSaved} className="px-5 py-2 text-sm rounded-lg font-semibold text-primary-foreground glow-primary"
              style={{ background: "var(--gradient-primary)" }}>Done</button>
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title="New customer" onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <label className="block text-sm">
          Username *
          <input className={inputCls + " mt-1"} required pattern="[a-zA-Z0-9._\-]{2,40}"
            value={username} onChange={(e) => setUsername(e.target.value)} placeholder="e.g. Secret" />
          <span className="text-[0.65rem] text-muted-foreground">Letters, numbers, . _ - (2–40 chars)</span>
        </label>
        <label className="block text-sm">
          Initial password *
          <input className={inputCls + " mt-1"} type="text" required minLength={6}
            value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        <label className="block text-sm">
          Deposit amount (€)
          <input className={inputCls + " mt-1"} type="number" step="0.01" min={0}
            value={balance} onChange={(e) => setBalance(parseFloat(e.target.value) || 0)} />
          <span className="text-[0.65rem] text-muted-foreground">Can be 0 or higher</span>
        </label>
        <label className="block text-sm">
          Notes (optional)
          <textarea className={inputCls + " mt-1"} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm rounded-lg text-muted-foreground hover:text-foreground">Cancel</button>
          <button type="submit" disabled={saving}
            className="px-5 py-2 text-sm rounded-lg font-semibold text-primary-foreground glow-primary disabled:opacity-50"
            style={{ background: "var(--gradient-primary)" }}>
            {saving ? "Creating…" : "Create customer"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function EditCustomerModal({ customer, onClose, onSaved }: { customer: Customer; onClose: () => void; onSaved: () => void }) {
  const [username, setUsername] = useState(customer.username || "");
  const [fullName, setFullName] = useState(customer.fullName);
  const [notes, setNotes] = useState(customer.notes || "");
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.adminEditCustomer(customer.id, { username: username.trim(), fullName: fullName.trim(), notes });
      toast.success("Customer updated"); onSaved();
    } catch (e: any) { toast.error(e?.message || "Failed"); }
    finally { setSaving(false); }
  }

  return (
    <Modal title={`Edit · ${customer.username || customer.fullName}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <label className="block text-sm">
          Username
          <input className={inputCls + " mt-1"} required pattern="[a-zA-Z0-9._\-]{2,40}"
            value={username} onChange={(e) => setUsername(e.target.value)} />
        </label>
        <label className="block text-sm">
          Display name
          <input className={inputCls + " mt-1"} value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </label>
        <label className="block text-sm">
          Notes
          <textarea className={inputCls + " mt-1"} rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm rounded-lg text-muted-foreground">Cancel</button>
          <button type="submit" disabled={saving}
            className="px-5 py-2 text-sm rounded-lg font-semibold text-primary-foreground glow-primary disabled:opacity-50"
            style={{ background: "var(--gradient-primary)" }}>
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function WalletModal({ customer, onClose, onSaved }: { customer: Customer; onClose: () => void; onSaved: () => void }) {
  const [amount, setAmount] = useState(0);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [history, setHistory] = useState<WalletTx[]>([]);

  useEffect(() => { api.adminWalletHistory(customer.id).then(setHistory).catch(() => {}); }, [customer.id]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!reason.trim() || amount === 0) { toast.error("Amount and reason are required"); return; }
    setSaving(true);
    try {
      const r = await api.adminWalletOp(customer.id, amount, reason);
      toast.success(`New balance: ${r.balance.toFixed(2)} €`); onSaved();
    } catch (e: any) { toast.error(e?.message || "Failed"); }
    finally { setSaving(false); }
  }

  return (
    <Modal title={`Wallet · ${customer.username || customer.fullName}`} onClose={onClose}>
      <div className="text-sm text-muted-foreground mb-3">
        Current balance: <span className="text-foreground font-semibold">{customer.balance.toFixed(2)} €</span>
      </div>
      <form onSubmit={submit} className="space-y-3">
        <label className="block text-sm">
          Amount (+ to top up, − to withdraw)
          <input className={inputCls + " mt-1"} type="number" step="0.01" required value={amount} onChange={(e) => setAmount(parseFloat(e.target.value) || 0)} />
        </label>
        <label className="block text-sm">
          Reason
          <input className={inputCls + " mt-1"} required value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Manual top-up" />
        </label>
        <div className="flex justify-end gap-2">
          <button type="submit" disabled={saving} className="px-5 py-2 text-sm rounded-lg font-semibold text-primary-foreground glow-primary disabled:opacity-50" style={{ background: "var(--gradient-primary)" }}>
            {saving ? "Saving…" : "Apply"}
          </button>
        </div>
      </form>
      <div className="mt-5 pt-4 border-t border-border">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
          <History size={12} /> Recent transactions
        </div>
        <div className="max-h-48 overflow-y-auto space-y-1.5">
          {history.length === 0 ? (
            <div className="text-xs text-muted-foreground">No transactions yet.</div>
          ) : history.map((t) => (
            <div key={t.id} className="flex items-center justify-between text-xs py-1.5 border-b border-border/30">
              <div>
                <div className={`font-semibold tabular-nums ${t.amount >= 0 ? "text-success" : "text-destructive"}`}>
                  {t.amount >= 0 ? "+" : ""}{t.amount.toFixed(3)} €
                </div>
                <div className="text-muted-foreground">{t.reason}</div>
              </div>
              <div className="text-muted-foreground">{new Date(t.createdAt).toLocaleString()}</div>
            </div>
          ))}
        </div>
      </div>
    </Modal>
  );
}

function PasswordModal({ customer, onClose }: { customer: Customer; onClose: () => void }) {
  const [pwd, setPwd] = useState("");
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (pwd.length < 6) { toast.error("At least 6 characters"); return; }
    setSaving(true);
    try {
      const r = await api.adminResetPassword(customer.id, pwd);
      setDone(r.password); toast.success("Password reset");
    } catch (e: any) { toast.error(e?.message || "Failed"); }
    finally { setSaving(false); }
  }

  if (done) {
    const text = `Username: ${customer.username || customer.fullName}\nPassword: ${done}`;
    return (
      <Modal title="Password reset" onClose={onClose}>
        <div className="space-y-4">
          <div className="text-sm text-muted-foreground">
            Share these credentials with the customer. Shown <strong>only once</strong>.
          </div>
          <pre className="glass rounded-lg p-3 text-xs whitespace-pre-wrap break-all">{text}</pre>
          <button onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm rounded-lg glass hover:bg-card/60">
            {copied ? <><Check size={14} /> Copied</> : <><Copy size={14} /> Copy</>}
          </button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title={`Reset password · ${customer.username || customer.fullName}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <label className="block text-sm">
          New password
          <input className={inputCls + " mt-1"} type="text" required minLength={6} value={pwd} onChange={(e) => setPwd(e.target.value)} />
        </label>
        <p className="text-xs text-muted-foreground">
          The password is hashed at rest. You'll see it once after reset so you can share it.
        </p>
        <div className="flex justify-end">
          <button type="submit" disabled={saving} className="px-5 py-2 text-sm rounded-lg font-semibold text-primary-foreground glow-primary disabled:opacity-50" style={{ background: "var(--gradient-primary)" }}>
            {saving ? "Saving…" : "Reset password"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
