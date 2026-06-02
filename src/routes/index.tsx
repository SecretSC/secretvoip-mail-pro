import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  Mail,
  Gauge,
  ShieldCheck,
  Lock,
  Activity,
  Globe,
  BarChart3,
  Users,
} from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "SecretVoIP Mail — Premium bulk email infrastructure" },
      {
        name: "description",
        content:
          "Premium private-label bulk email delivery — global routes, real-time monitoring, transparent rates.",
      },
    ],
  }),
  component: LandingPage,
});

function LandingPage() {
  return (
    <div className="min-h-screen">
      {/* Nav */}
      <header className="sticky top-0 z-30 backdrop-blur-md bg-background/60 border-b border-border">
        <div className="mx-auto max-w-7xl px-6 h-16 flex items-center justify-between">
          <BrandLogo size="sm" />
          <nav className="hidden md:flex items-center gap-8 text-sm text-muted-foreground">
            <a href="#features" className="hover:text-foreground transition-colors">
              Features
            </a>
            <a href="#plans" className="hover:text-foreground transition-colors">
              Plans
            </a>
            <a href="#access" className="hover:text-foreground transition-colors">
              Access
            </a>
          </nav>
          <Link
            to="/login"
            className="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold text-primary-foreground glow-primary transition-transform hover:scale-[1.02]"
            style={{ background: "var(--gradient-primary)" }}
          >
            Sign in <ArrowRight size={14} />
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="relative hero-bg">
        <div className="mx-auto max-w-5xl px-6 py-24 md:py-32 text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card/60 px-4 py-1.5 text-xs text-muted-foreground">
            <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
            Premium private-label email infrastructure
          </span>
          <h1 className="mt-6 text-4xl md:text-6xl font-bold tracking-tight leading-[1.05]">
            Premium <span className="gradient-text">Bulk Email</span> delivery,
            <br className="hidden md:block" />
            engineered for serious senders.
          </h1>
          <p className="mt-6 mx-auto max-w-2xl text-base md:text-lg text-muted-foreground leading-relaxed">
            Global routes, real-time delivery monitoring, and a transparent rate
            book — wrapped in a fast, secure dashboard for your team and your
            customers.
          </p>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
            <Link
              to="/login"
              className="inline-flex items-center gap-2 rounded-xl px-6 py-3 text-sm font-semibold text-primary-foreground glow-primary transition-transform hover:scale-[1.02]"
              style={{ background: "var(--gradient-primary)" }}
            >
              Sign in to your workspace <ArrowRight size={16} />
            </Link>
            <a
              href="#features"
              className="inline-flex items-center gap-2 rounded-xl border border-border px-6 py-3 text-sm font-semibold text-foreground hover:bg-accent/10 transition-colors"
            >
              See the platform
            </a>
          </div>

          {/* Stat row */}
          <div className="mt-16 grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { v: "120+", l: "Countries" },
              { v: "4", l: "Send modes" },
              { v: "99.9%", l: "Delivery uptime" },
              { v: "<1s", l: "API latency" },
            ].map((s) => (
              <div
                key={s.l}
                className="glass card-ring-primary rounded-2xl p-6 text-center"
              >
                <div className="text-2xl md:text-3xl font-bold text-foreground">
                  {s.v}
                </div>
                <div className="mt-1 text-xs uppercase tracking-wider text-muted-foreground">
                  {s.l}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-24">
        <div className="mx-auto max-w-7xl px-6">
          <div className="text-center mb-14">
            <div className="text-xs font-semibold tracking-[0.2em] text-info uppercase">
              Built for delivery
            </div>
            <h2 className="mt-3 text-3xl md:text-4xl font-bold tracking-tight">
              A complete operations console
            </h2>
            <p className="mt-3 text-muted-foreground">
              Everything you need to send, route, monitor and audit email at scale.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {[
              {
                icon: Globe,
                title: "Global delivery",
                desc: "Route via premium and standard pools — pick the right path for every campaign.",
              },
              {
                icon: Gauge,
                title: "Live campaign tester",
                desc: "Probe deliverability on a single inbox before launching the full send.",
              },
              {
                icon: BarChart3,
                title: "Transparent rates",
                desc: "Per-email pricing right inside the dashboard. No surprises on the invoice.",
              },
              {
                icon: Activity,
                title: "Delivery monitoring",
                desc: "Inspect every send, recipient, status and cost — filter by date or status.",
              },
              {
                icon: Users,
                title: "Admin-managed access",
                desc: "Closed platform. Customer accounts are provisioned by your team only.",
              },
              {
                icon: Lock,
                title: "Secure by design",
                desc: "Role-based auth, encrypted credentials and an immutable audit log.",
              },
            ].map((f) => (
              <div
                key={f.title}
                className="glass rounded-2xl p-6 hover:border-primary/40 transition-colors group"
              >
                <div
                  className="h-11 w-11 rounded-xl flex items-center justify-center glow-primary mb-5"
                  style={{ background: "var(--gradient-primary)" }}
                >
                  <f.icon size={20} className="text-primary-foreground" />
                </div>
                <h3 className="text-base font-semibold text-foreground">
                  {f.title}
                </h3>
                <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                  {f.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Plans / Routes */}
      <section id="plans" className="py-20">
        <div className="mx-auto max-w-7xl px-6 grid lg:grid-cols-2 gap-10 items-center">
          <div className="glass card-ring-primary rounded-2xl p-6 grid grid-cols-2 gap-4">
            {[
              { tag: "MODE", name: "Transactional", sub: "Premium worldwide" },
              { tag: "MODE", name: "Marketing", sub: "Standard worldwide" },
              { tag: "MODE", name: "Bulk", sub: "High throughput" },
              { tag: "MODE", name: "Targeted", sub: "Country-direct routing" },
            ].map((r) => (
              <div
                key={r.name}
                className="rounded-xl border border-border bg-card/40 p-5"
              >
                <div className="text-[0.625rem] font-semibold tracking-[0.18em] text-muted-foreground uppercase">
                  {r.tag}
                </div>
                <div className="mt-1 text-lg font-semibold text-foreground">
                  {r.name}
                </div>
                <div className="text-xs text-muted-foreground">{r.sub}</div>
              </div>
            ))}
          </div>
          <div>
            <div className="text-xs font-semibold tracking-[0.2em] text-primary uppercase">
              Send catalog
            </div>
            <h3 className="mt-3 text-3xl font-bold tracking-tight">
              Choose the mode, control the cost.
            </h3>
            <p className="mt-4 text-muted-foreground leading-relaxed">
              Send via the delivery mode that fits your traffic profile.
              Per-email pricing is published in the dashboard — what you see is
              what you pay.
            </p>
            <Link
              to="/login"
              className="mt-8 inline-flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold text-primary-foreground glow-primary transition-transform hover:scale-[1.02]"
              style={{ background: "var(--gradient-primary)" }}
            >
              Open the dashboard <ArrowRight size={16} />
            </Link>
          </div>
        </div>
      </section>

      {/* Access */}
      <section id="access" className="py-20">
        <div className="mx-auto max-w-3xl px-6">
          <div className="glass card-ring-primary rounded-2xl p-10 text-center">
            <div
              className="mx-auto h-12 w-12 rounded-xl flex items-center justify-center glow-primary"
              style={{ background: "var(--gradient-primary)" }}
            >
              <ShieldCheck size={22} className="text-primary-foreground" />
            </div>
            <h3 className="mt-5 text-2xl md:text-3xl font-bold">
              A closed, admin-managed platform
            </h3>
            <p className="mt-3 text-muted-foreground">
              There's no public sign-up. Accounts are issued by our team — talk
              to your account manager to get access for your organisation.
            </p>
            <Link
              to="/login"
              className="mt-7 inline-flex items-center gap-2 rounded-xl px-6 py-3 text-sm font-semibold text-primary-foreground glow-primary transition-transform hover:scale-[1.02]"
              style={{ background: "var(--gradient-primary)" }}
            >
              Sign in <ArrowRight size={16} />
            </Link>
          </div>
        </div>
      </section>

      <footer className="border-t border-border py-8">
        <div className="mx-auto max-w-7xl px-6 flex flex-wrap items-center justify-between gap-4 text-xs text-muted-foreground">
          <div className="flex items-center gap-3">
            <Mail size={14} className="text-primary" />
            © {new Date().getFullYear()} SecretVoIP — All rights reserved.
          </div>
          <div className="flex items-center gap-6">
            <a href="#features" className="hover:text-foreground">
              Features
            </a>
            <a href="#plans" className="hover:text-foreground">
              Plans
            </a>
            <Link to="/login" className="hover:text-foreground">
              Sign in
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
