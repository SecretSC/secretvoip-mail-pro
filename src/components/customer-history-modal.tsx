import { useEffect, useMemo, useState } from "react";
import { api, type Customer } from "@/lib/api";
import { toast } from "sonner";
import {
  X, Download, Search, Mail, Wallet, Activity,
  TrendingUp, TrendingDown, DollarSign,
} from "lucide-react";

interface Props {
  customer: Customer;
  onClose: () => void;
}

type Tab = "campaigns" | "wallet" | "activity" | "transmission";

export function CustomerHistoryModal({ customer, onClose }: Props) {
  const [tab, setTab] = useState<Tab>("campaigns");
  const [data, setData] = useState<Awaited<ReturnType<typeof api.adminCustomerHistory>> | null>(null);
  const [loading, setLoading] = useState(true);

  // filters
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [recipientFilter, setRecipientFilter] = useState("");
  const [recipientCampaign, setRecipientCampaign] = useState<string | null>(null);
  const [recipients, setRecipients] = useState<
    { email: string; accepted: boolean; error: string | null; createdAt: string }[] | null
  >(null);

  useEffect(() => {
    api.adminCustomerHistory(customer.id)
      .then(setData)
      .catch((e) => toast.error(e?.message || "Failed to load history"))
      .finally(() => setLoading(false));
  }, [customer.id]);

  const filteredCampaigns = useMemo(() => {
    if (!data) return [];
    return data.campaigns.filter((c) => {
      if (statusFilter && c.status !== statusFilter) return false;
      if (search && !`${c.subject} ${c.fromName}`.toLowerCase().includes(search.toLowerCase())) return false;
      if (from && new Date(c.createdAt) < new Date(from)) return false;
      if (to && new Date(c.createdAt) > new Date(to + "T23:59:59")) return false;
      return true;
    });
  }, [data, statusFilter, search, from, to]);

  async function openRecipients(id: string) {
    setRecipientCampaign(id);
    setRecipients(null);
    try {
      const r = await api.campaign(id);
      setRecipients(r.recipients);
    } catch (e: any) {
      toast.error(e?.message || "Failed");
    }
  }

  const ident = customer.username || customer.email || customer.fullName;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-2 sm:p-4 bg-background/80 backdrop-blur-md">
      <div className="w-full max-w-6xl max-h-[95vh] flex flex-col glass card-ring-primary rounded-2xl overflow-hidden">
        <div className="px-4 sm:px-6 py-4 border-b border-border flex items-center gap-4">
          <div className="flex-1 min-w-0">
            <div className="text-[0.625rem] uppercase tracking-[0.18em] font-semibold text-muted-foreground">
              Customer history
            </div>
            <div className="text-lg font-bold truncate">
              {ident}{" "}
              <span className="text-sm font-normal text-muted-foreground">· {customer.fullName}</span>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-md hover:bg-card/60">
            <X size={18} />
          </button>
        </div>

        {/* Totals */}
        {data && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 p-5 border-b border-border bg-card/20">
            <Stat label="Balance" value={`${data.profile.balance.toFixed(2)} €`} />
            <Stat label="Accepted" value={data.totals.accepted.toLocaleString()} tone="success" icon={TrendingUp} />
            <Stat label="Failed" value={data.totals.failed.toLocaleString()} tone="destructive" icon={TrendingDown} />
            <Stat label="Revenue" value={`${data.totals.revenue.toFixed(2)} €`} tone="info" icon={DollarSign} />
            <Stat
              label="Profit"
              value={`${data.totals.profit.toFixed(2)} €`}
              tone={data.totals.profit >= 0 ? "success" : "destructive"}
            />
          </div>
        )}

        {/* Tabs */}
        <div className="px-5 pt-3 flex gap-1 border-b border-border">
          {(
            [
              { k: "campaigns", l: "Campaigns", i: Mail },
              { k: "wallet", l: "Wallet", i: Wallet },
              { k: "activity", l: "Activity", i: Activity },
            ] as { k: Tab; l: string; i: any }[]
          ).map(({ k, l, i: Icon }) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              className={`px-4 py-2 text-sm font-semibold border-b-2 transition-colors inline-flex items-center gap-2 ${
                tab === k
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon size={14} /> {l}
            </button>
          ))}
          <div className="ml-auto py-2 flex gap-2">
            {tab === "campaigns" && (
              <button
                onClick={() => api.exportCustomerCampaignsCsv(customer.id)}
                className="text-xs inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md glass hover:bg-card/60"
              >
                <Download size={12} /> Export CSV
              </button>
            )}
            {tab === "wallet" && (
              <button
                onClick={() => api.exportCustomerWalletCsv(customer.id)}
                className="text-xs inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md glass hover:bg-card/60"
              >
                <Download size={12} /> Export CSV
              </button>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-auto">
          {loading ? (
            <div className="p-10 text-center text-muted-foreground">Loading…</div>
          ) : !data ? (
            <div className="p-10 text-center text-destructive">No data</div>
          ) : tab === "campaigns" ? (
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
                <div className="relative">
                  <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input
                    placeholder="Search subject / from"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="w-full pl-8 pr-3 py-2 text-xs rounded-md bg-card/50 border border-border focus:outline-none focus:border-primary/60"
                  />
                </div>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="px-3 py-2 text-xs rounded-md bg-card/50 border border-border focus:outline-none focus:border-primary/60"
                >
                  <option value="">All statuses</option>
                  <option value="completed">Completed</option>
                  <option value="sending">Sending</option>
                  <option value="failed">Failed</option>
                </select>
                <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="px-3 py-2 text-xs rounded-md bg-card/50 border border-border focus:outline-none focus:border-primary/60" />
                <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="px-3 py-2 text-xs rounded-md bg-card/50 border border-border focus:outline-none focus:border-primary/60" />
              </div>

              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full text-xs">
                  <thead className="bg-card/40">
                    <tr className="text-left uppercase tracking-wider text-[0.625rem] text-muted-foreground">
                      <th className="px-3 py-2">Date</th>
                      <th className="px-3 py-2">Subject / From</th>
                      <th className="px-3 py-2 text-right">Total</th>
                      <th className="px-3 py-2 text-right">Accepted</th>
                      <th className="px-3 py-2 text-right">Failed</th>
                      <th className="px-3 py-2 text-right">Price</th>
                      <th className="px-3 py-2 text-right">Provider</th>
                      <th className="px-3 py-2 text-right">Charged</th>
                      <th className="px-3 py-2 text-right">Profit</th>
                      <th className="px-3 py-2">Status</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredCampaigns.map((c) => (
                      <tr key={c.id} className="border-t border-border/40 hover:bg-card/30">
                        <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">{new Date(c.createdAt).toLocaleString()}</td>
                        <td className="px-3 py-2">
                          <div className="font-semibold truncate max-w-[260px]">{c.subject}</div>
                          <div className="text-muted-foreground truncate max-w-[260px]">{c.fromName}</div>
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{c.total}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-success">{c.accepted}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-destructive">{c.failed}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{c.pricePerEmail.toFixed(4)}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{c.providerCostPerEmail.toFixed(4)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{c.cost.toFixed(3)} €</td>
                        <td className={`px-3 py-2 text-right tabular-nums font-semibold ${c.profit >= 0 ? "text-success" : "text-destructive"}`}>{c.profit.toFixed(3)} €</td>
                        <td className="px-3 py-2">
                          <span className={`px-2 py-0.5 rounded text-[0.6rem] uppercase font-semibold ${
                            c.status === "completed" ? "bg-success/15 text-success"
                            : c.status === "failed" ? "bg-destructive/15 text-destructive"
                            : "bg-info/15 text-info"
                          }`}>{c.status}</span>
                        </td>
                        <td className="px-3 py-2 text-right whitespace-nowrap">
                          <button onClick={() => openRecipients(c.id)} className="text-info hover:underline mr-2">Recipients</button>
                          <a href={`/mail/app/campaigns/${c.id}`} target="_blank" rel="noreferrer" className="text-foreground hover:underline">View details</a>
                        </td>
                      </tr>
                    ))}
                    {filteredCampaigns.length === 0 && (
                      <tr><td colSpan={11} className="p-6 text-center text-muted-foreground">No campaigns match the filters.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>

              {recipientCampaign && (
                <div className="rounded-lg border border-border bg-card/20 p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Recipients · campaign {recipientCampaign.slice(0, 8)}
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        placeholder="Filter email…"
                        value={recipientFilter}
                        onChange={(e) => setRecipientFilter(e.target.value)}
                        className="px-2 py-1 text-xs rounded bg-card/50 border border-border"
                      />
                      <button
                        onClick={() => api.exportCampaignCsv(recipientCampaign)}
                        className="text-xs inline-flex items-center gap-1 px-2 py-1 rounded glass hover:bg-card/60"
                      >
                        <Download size={11} /> CSV
                      </button>
                      <button onClick={() => { setRecipientCampaign(null); setRecipients(null); }} className="text-xs text-muted-foreground hover:text-foreground">Close</button>
                    </div>
                  </div>
                  {!recipients ? (
                    <div className="text-xs text-muted-foreground">Loading…</div>
                  ) : (
                    <div className="max-h-64 overflow-auto">
                      <table className="w-full text-xs">
                        <tbody>
                          {recipients
                            .filter((r) => !recipientFilter || r.email.toLowerCase().includes(recipientFilter.toLowerCase()))
                            .map((r, i) => (
                              <tr key={i} className="border-b border-border/30">
                                <td className="px-2 py-1">{r.email}</td>
                                <td className="px-2 py-1">
                                  <span className={`text-[0.6rem] uppercase font-semibold ${r.accepted ? "text-success" : "text-destructive"}`}>
                                    {r.accepted ? "accepted" : "failed"}
                                  </span>
                                </td>
                                <td className="px-2 py-1 text-muted-foreground">{r.error || ""}</td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : tab === "wallet" ? (
            <div className="p-5">
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full text-xs">
                  <thead className="bg-card/40">
                    <tr className="text-left uppercase tracking-wider text-[0.625rem] text-muted-foreground">
                      <th className="px-3 py-2">Date</th>
                      <th className="px-3 py-2 text-right">Amount</th>
                      <th className="px-3 py-2 text-right">Previous</th>
                      <th className="px-3 py-2 text-right">New</th>
                      <th className="px-3 py-2">Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.wallet.map((w) => (
                      <tr key={w.id} className="border-t border-border/40">
                        <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">{new Date(w.createdAt).toLocaleString()}</td>
                        <td className={`px-3 py-2 text-right tabular-nums font-semibold ${w.amount >= 0 ? "text-success" : "text-destructive"}`}>{w.amount >= 0 ? "+" : ""}{w.amount.toFixed(3)} €</td>
                        <td className="px-3 py-2 text-right tabular-nums">{w.previousBalance.toFixed(2)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{w.newBalance.toFixed(2)}</td>
                        <td className="px-3 py-2">{w.reason}</td>
                      </tr>
                    ))}
                    {data.wallet.length === 0 && (
                      <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">No wallet transactions.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="p-5">
              <div className="space-y-2">
                {data.activity.map((a) => (
                  <div key={a.id} className="flex items-center justify-between text-xs rounded-lg border border-border/40 px-3 py-2 bg-card/20">
                    <div>
                      <div className="font-semibold uppercase tracking-wider text-[0.65rem]">{a.action}</div>
                      <div className="text-muted-foreground">{a.metadata ? JSON.stringify(a.metadata) : ""}</div>
                    </div>
                    <div className="text-muted-foreground">{new Date(a.createdAt).toLocaleString()}</div>
                  </div>
                ))}
                {data.activity.length === 0 && (
                  <div className="text-center text-muted-foreground py-8">No recent activity recorded.</div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, tone, icon: Icon }: { label: string; value: string; tone?: "success" | "destructive" | "info"; icon?: any }) {
  const color =
    tone === "success" ? "text-success" :
    tone === "destructive" ? "text-destructive" :
    tone === "info" ? "text-info" : "text-foreground";
  return (
    <div className="glass rounded-xl p-3">
      <div className="flex items-center justify-between text-[0.625rem] uppercase tracking-[0.18em] font-semibold text-muted-foreground">
        {label}
        {Icon && <Icon size={12} className={color} />}
      </div>
      <div className={`mt-1.5 text-lg font-bold tabular-nums ${color}`}>{value}</div>
    </div>
  );
}
