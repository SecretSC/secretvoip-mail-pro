import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/app/campaigns")({
  head: () => ({ meta: [{ title: "Campaigns — SecretVoIP Mail" }] }),
  component: CampaignsPage,
});

function CampaignsPage() {
  return (
    <div className="p-8 md:p-10">
      <h1 className="text-3xl md:text-4xl font-bold tracking-tight">Campaigns</h1>
      <p className="mt-2 text-muted-foreground">
        Every campaign you've sent — with recipient counts, cost and status.
      </p>
      <div className="mt-8 glass rounded-2xl p-12 text-center text-sm text-muted-foreground">
        Campaign history will appear here once you send your first email.
      </div>
    </div>
  );
}
