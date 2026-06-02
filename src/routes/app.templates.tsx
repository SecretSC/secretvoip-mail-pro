import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/app/templates")({
  head: () => ({ meta: [{ title: "Templates — SecretVoIP Mail" }] }),
  component: TemplatesPage,
});

function TemplatesPage() {
  return (
    <div className="p-8 md:p-10">
      <h1 className="text-3xl md:text-4xl font-bold tracking-tight">Templates</h1>
      <p className="mt-2 text-muted-foreground">
        Save reusable HTML templates for faster sends.
      </p>
      <div className="mt-8 glass rounded-2xl p-12 text-center text-sm text-muted-foreground">
        Template management coming in the next phase.
      </div>
    </div>
  );
}
