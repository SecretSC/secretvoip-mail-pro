import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { api, type Customer, type WalletTx } from "@/lib/api";
import { toast } from "sonner";
import {
  Plus,
  Wallet,
  Lock,
  Pause,
  Play,
  X,
  History,
} from "lucide-react";
import { CustomerHistoryModal } from "@/components/customer-history-modal";

export const Route = createFileRoute("/app/admin/")({
  component: CustomersPage,
});

function CustomersPage() {
  const [rows, setRows] = useState<Customer[] | null>(null);
  const [overview, setOverview] = useState<Awaited<
    ReturnType<typeof api.adminOverview>
  > | null>(null);
  const [creating, setCreating] = useState(false);
  const [walletFor, setWalletFor] = useState<Customer | null>(null);
  const [passwordFor, setPasswordFor] = useState<Customer | null>(null);
  const [historyFor, setHistoryFor] = useState<Customer | null>(null);

  async function load() {
    try {
      const [c, o] = await Promise.all([api.adminCustomers(), api.adminOverview()]);
      setRows(c);
      setOverview(o);
    } catch (e: any) {
      toast.error(e?.message || "Failed to load");
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function toggleStatus(c: Customer) {
    const next = c.status === "active" ? "suspended" : "active";
    try {
      await api.adminSetStatus(c.id, next);
      toast.success(`Customer ${next}`);
      load();
    } catch (e: any) {
      toast.error(e?.message || "Failed");
    }
  }

  return (
    <div className="p-8 md:p-10 space-y-6">
      {overview && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Stat label="Customers" value={overview.customers.total} />
          <Stat label="Suspended" value={overview.customers.suspended} tone="destructive" />
          <Stat label="Sent today" value={overview.campaigns.today} tone="success" />
          <Stat
            label="Revenue"
            value={`${overview.campaigns.revenue.toFixed(2)} €`}
            tone="info"
          />
        </div>
      )}

      <div className="flex items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Customers</h2>
          <p className="text-sm text-muted-foreground">
            Create accounts, top up wallets, suspend access.
          </p>
        </div>
        <button
          onClick={() => setCreating(true)}
          className="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold text-primary-foreground glow-primary"
          style={{ background: "var(--gradient-primary)" }}
        >
          <Plus size={14} /> New customer
        </button>
      </div>

      <div className="glass rounded-2xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[0.625rem] uppercase tracking-[0.18em] text-muted-foreground border-b border-border">
              <th className="px-5 py-3 font-semibold">Customer</th>
              <th className="px-5 py-3 font-semibold">Status</th>
              <th className="px-5 py-3 font-semibold text-right">Balance</th>
              <th className="px-5 py-3 font-semibold">Joined</th>
              <th className="px-5 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {!rows ? (
              <tr>
                <td colSpan={5} className="p-8 text-center text-xs text-muted-foreground">
                  Loading…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="p-8 text-center text-xs text-muted-foreground">
                  No customers yet.
                </td>
              </tr>
            ) : (
              rows.map((c) => (
                <tr key={c.id} className="border-b border-border/40 hover:bg-card/30">
                  <td className="px-5 py-3">
                    <div className="font-semibold">{c.fullName}</div>
                    <div className="text-xs text-muted-foreground">{c.email}</div>
                  </td>
                  <td className="px-5 py-3">
                    <span
                      className={`px-2 py-0.5 rounded-md text-[0.65rem] font-semibold uppercase tracking-wider border ${
                        c.status === "active"
                          ? "bg-success/15 text-success border-success/30"
                          : "bg-destructive/15 text-destructive border-destructive/30"
                      }`}
                    >
                      {c.status}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-right tabular-nums font-semibold">
                    {c.balance.toFixed(2)} €
                  </td>
                  <td className="px-5 py-3 text-muted-foreground text-xs">
                    {new Date(c.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-5 py-3 text-right whitespace-nowrap">
                    <button
                      onClick={() => setHistoryFor(c)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 text-xs rounded-md text-foreground hover:bg-primary/10 hover:text-primary"
                    >
                      <History size={12} /> History
                    </button>
                    <button
                      onClick={() => setWalletFor(c)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 text-xs rounded-md text-info hover:bg-info/10"
                    >
                      <Wallet size={12} /> Wallet
                    </button>
                    <button
                      onClick={() => setPasswordFor(c)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 text-xs rounded-md text-muted-foreground hover:text-foreground hover:bg-card/60"
                    >
                      <Lock size={12} /> Password
                    </button>
                    <button
                      onClick={() => toggleStatus(c)}
                      className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs rounded-md ${
                        c.status === "active"
                          ? "text-destructive hover:bg-destructive/10"
                          : "text-success hover:bg-success/10"
                      }`}
                    >
                      {c.status === "active" ? (
                        <>
                          <Pause size={12} /> Suspend
                        </>
                      ) : (
                        <>
                          <Play size={12} /> Activate
                        </>
                      )}
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {creating && (
        <NewCustomerModal
          onClose={() => setCreating(false)}
          onSaved={() => {
            setCreating(false);
            load();
          }}
        />
      )}
      {walletFor && (
        <WalletModal
          customer={walletFor}
          onClose={() => setWalletFor(null)}
          onSaved={() => {
            setWalletFor(null);
            load();
          }}
        />
      )}
      {passwordFor && (
        <PasswordModal
          customer={passwordFor}
          onClose={() => setPasswordFor(null)}
        />
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: React.ReactNode; tone?: "success" | "destructive" | "info" }) {
  const color =
    tone === "success" ? "text-success" : tone === "destructive" ? "text-destructive" : tone === "info" ? "text-info" : "text-foreground";
  return (
    <div className="glass rounded-xl p-4">
      <div className="text-[0.625rem] uppercase tracking-[0.18em] text-muted-foreground font-semibold">
        {label}
      </div>
      <div className={`mt-2 text-2xl font-bold tabular-nums ${color}`}>
        {value}
      </div>
    </div>
  );
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
      <div className="glass-strong rounded-2xl max-w-lg w-full p-6 relative">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold">{title}</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground p-1">
            <X size={16} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

const inputCls =
  "w-full bg-card/50 border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary/60";

function NewCustomerModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [balance, setBalance] = useState(0);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.adminCreateCustomer({ email, fullName, password, balance, notes });
      toast.success("Customer created");
      onSaved();
    } catch (e: any) {
      toast.error(e?.message || "Failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="New customer" onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <label className="block text-sm">
          Full name
          <input className={inputCls + " mt-1"} required value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </label>
        <label className="block text-sm">
          Email
          <input className={inputCls + " mt-1"} type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="block text-sm">
          Initial password
          <input className={inputCls + " mt-1"} type="text" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        <label className="block text-sm">
          Opening balance (€)
          <input className={inputCls + " mt-1"} type="number" step="0.01" min={0} value={balance} onChange={(e) => setBalance(parseFloat(e.target.value) || 0)} />
        </label>
        <label className="block text-sm">
          Notes
          <textarea className={inputCls + " mt-1"} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm rounded-lg text-muted-foreground hover:text-foreground">
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="px-5 py-2 text-sm rounded-lg font-semibold text-primary-foreground glow-primary disabled:opacity-50"
            style={{ background: "var(--gradient-primary)" }}
          >
            {saving ? "Creating…" : "Create customer"}
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

  useEffect(() => {
    api.adminWalletHistory(customer.id).then(setHistory).catch(() => {});
  }, [customer.id]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!reason.trim() || amount === 0) {
      toast.error("Amount and reason are required");
      return;
    }
    setSaving(true);
    try {
      const r = await api.adminWalletOp(customer.id, amount, reason);
      toast.success(`New balance: ${r.balance.toFixed(2)} €`);
      onSaved();
    } catch (e: any) {
      toast.error(e?.message || "Failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={`Wallet · ${customer.fullName}`} onClose={onClose}>
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
          ) : (
            history.map((t) => (
              <div key={t.id} className="flex items-center justify-between text-xs py-1.5 border-b border-border/30">
                <div>
                  <div className={`font-semibold tabular-nums ${t.amount >= 0 ? "text-success" : "text-destructive"}`}>
                    {t.amount >= 0 ? "+" : ""}{t.amount.toFixed(3)} €
                  </div>
                  <div className="text-muted-foreground">{t.reason}</div>
                </div>
                <div className="text-muted-foreground">{new Date(t.createdAt).toLocaleString()}</div>
              </div>
            ))
          )}
        </div>
      </div>
    </Modal>
  );
}

function PasswordModal({ customer, onClose }: { customer: Customer; onClose: () => void }) {
  const [pwd, setPwd] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (pwd.length < 8) {
      toast.error("At least 8 characters");
      return;
    }
    setSaving(true);
    try {
      await api.adminResetPassword(customer.id, pwd);
      toast.success("Password reset");
      onClose();
    } catch (e: any) {
      toast.error(e?.message || "Failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={`Reset password · ${customer.fullName}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <label className="block text-sm">
          New password
          <input className={inputCls + " mt-1"} type="text" required minLength={8} value={pwd} onChange={(e) => setPwd(e.target.value)} />
        </label>
        <p className="text-xs text-muted-foreground">
          Share this securely with the customer — they should change it on next login.
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
