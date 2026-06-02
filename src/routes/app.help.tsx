import { createFileRoute } from "@tanstack/react-router";
import { Send, Wallet, AlertTriangle } from "lucide-react";

export const Route = createFileRoute("/app/help")({
  head: () => ({ meta: [{ title: "Help & Guide — SecretVoIP Mail" }] }),
  component: HelpPage,
});

function HelpPage() {
  return (
    <div className="p-8 md:p-10 max-w-4xl">
      <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
        Help &amp; Guide
      </h1>
      <p className="mt-2 text-muted-foreground">
        Everything you need to know to send email and manage your balance.
      </p>

      <section className="mt-8 glass rounded-2xl p-6 space-y-3">
        <div className="flex items-center gap-2">
          <Send size={18} className="text-primary" />
          <h2 className="text-lg font-semibold">How to send an email</h2>
        </div>
        <ol className="list-decimal list-inside space-y-2 text-sm text-muted-foreground pl-2">
          <li>Open <strong className="text-foreground">Send Email</strong> in the sidebar.</li>
          <li>Set your From name and subject line.</li>
          <li>Paste recipients (comma or newline separated) or upload a CSV/TXT.</li>
          <li>Compose your HTML content. Use <code>{"{{name}}"}</code> for personalization.</li>
          <li>Review the estimated cost and click Send.</li>
        </ol>
      </section>

      <section className="mt-6 glass rounded-2xl p-6 space-y-3">
        <div className="flex items-center gap-2">
          <Wallet size={18} className="text-info" />
          <h2 className="text-lg font-semibold">How pricing &amp; balance work</h2>
        </div>
        <ul className="space-y-2 text-sm text-muted-foreground">
          <li>• You must have a positive balance to send. The Send button is disabled otherwise.</li>
          <li>• You are charged only for accepted recipients. Failed sends are free.</li>
          <li>• Your wallet updates instantly after every campaign.</li>
        </ul>
      </section>

      <section className="mt-6 glass rounded-2xl p-6 space-y-3">
        <div className="flex items-center gap-2">
          <AlertTriangle size={18} className="text-destructive" />
          <h2 className="text-lg font-semibold">Troubleshooting</h2>
        </div>
        <div className="space-y-3 text-sm">
          <div>
            <div className="font-semibold text-foreground">"Insufficient balance"</div>
            <p className="text-muted-foreground">
              Contact your administrator to top up your wallet in EUR.
            </p>
          </div>
          <div>
            <div className="font-semibold text-foreground">Emails sent but not received</div>
            <p className="text-muted-foreground">
              Check the recipient's spam folder. Use a recognisable From name to improve trust.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
