import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Send, Wallet, AlertTriangle, FileText, MessageCircle } from "lucide-react";
import { api } from "@/lib/api";

export const Route = createFileRoute("/app/help")({
  head: () => ({ meta: [{ title: "Help & Guide — SecretVoIP Mail" }] }),
  component: HelpPage,
});

function HelpPage() {
  const [support, setSupport] = useState("@Hamfranord");
  useEffect(() => {
    api.publicSettings().then((s) => { if (s.support_telegram) setSupport(String(s.support_telegram)); }).catch(() => {});
  }, []);

  return (
    <div className="p-4 sm:p-6 md:p-10 max-w-4xl">
      <h1 className="text-2xl md:text-4xl font-bold tracking-tight">Help &amp; Guide</h1>
      <p className="mt-2 text-muted-foreground">
        Everything you need to know about sending email and managing your balance.
      </p>

      <Section icon={Send} title="How to send an email">
        <ol className="list-decimal list-inside space-y-2 text-sm text-muted-foreground pl-2">
          <li>Open <strong className="text-foreground">Send Email</strong> in the sidebar.</li>
          <li>Set your <strong>From name</strong> and a clear <strong>subject line</strong>.</li>
          <li>Paste recipients (comma or newline separated) or upload a <strong>CSV / TXT</strong>.</li>
          <li>Maximum <strong>500 recipients</strong> per send. Invalid emails are auto-skipped, duplicates removed.</li>
          <li>Compose your HTML content. Use variables: <code>{"{{name}}"}</code>, <code>{"{{email}}"}</code>, <code>{"{{company}}"}</code>.</li>
          <li>Review the estimated cost (right-hand summary) and click <strong>Send</strong>.</li>
        </ol>
      </Section>

      <Section icon={FileText} title="Using templates">
        <ul className="space-y-2 text-sm text-muted-foreground">
          <li>• Go to <strong className="text-foreground">Templates</strong> to save reusable HTML drafts.</li>
          <li>• Your admin may also assign premium templates to your account — they appear under "Assigned by admin".</li>
          <li>• You can't edit an assigned template directly. Click <strong>Save copy to my templates</strong> to customise it.</li>
          <li>• In Send Email, use the <strong>Load template</strong> dropdown to pull a saved template into the editor.</li>
        </ul>
      </Section>

      <Section icon={Wallet} title="Billing & balance">
        <ul className="space-y-2 text-sm text-muted-foreground">
          <li>• You must have a positive balance to send. The Send button is disabled otherwise.</li>
          <li>• You're charged the current per-email price <strong>only for accepted recipients</strong>. Failed sends are free.</li>
          <li>• Your wallet updates instantly after every campaign — refresh the page if you don't see it.</li>
        </ul>
      </Section>

      <Section icon={MessageCircle} title="Top up your balance">
        <p className="text-sm text-muted-foreground">
          To add credit to your account, message <strong className="text-foreground">{support}</strong> on Telegram with:
        </p>
        <ul className="mt-2 list-disc list-inside text-sm text-muted-foreground pl-2 space-y-1">
          <li>Your <strong>username</strong></li>
          <li>The amount you want to top up</li>
        </ul>
      </Section>

      <Section icon={AlertTriangle} title="Troubleshooting">
        <div className="space-y-3 text-sm">
          <Item q="Insufficient balance"
            a={`Contact ${support} on Telegram to top up your wallet.`} />
          <Item q="Send failed / 502 Upstream provider error"
            a="The upstream mail provider rejected the request. Wait a moment and retry — if it persists, contact support with the campaign ID." />
          <Item q="Emails sent but not received"
            a="Ask the recipient to check the spam folder. Use a recognisable From name and avoid spammy subject lines to improve trust." />
          <Item q="I can't log in"
            a={`Double-check your username (no spaces). If you forgot your password, contact ${support} on Telegram for a reset.`} />
        </div>
      </Section>
    </div>
  );
}

function Section({ icon: Icon, title, children }: { icon: any; title: string; children: React.ReactNode }) {
  return (
    <section className="mt-6 glass rounded-2xl p-5 sm:p-6 space-y-3">
      <div className="flex items-center gap-2">
        <Icon size={18} className="text-primary" />
        <h2 className="text-lg font-semibold">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function Item({ q, a }: { q: string; a: string }) {
  return (
    <div>
      <div className="font-semibold text-foreground">{q}</div>
      <p className="text-muted-foreground">{a}</p>
    </div>
  );
}
