import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowRight, KeyRound, Mail } from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";
import { useAuth } from "@/lib/auth-context";
import { toast } from "sonner";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Sign in — SecretVoIP Mail" },
      {
        name: "description",
        content: "Sign in to your SecretVoIP Mail workspace.",
      },
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email || !password) return;
    setLoading(true);
    try {
      const me = await signIn(email.trim(), password);
      toast.success(`Welcome back, ${me.fullName}`);
      navigate({ to: me.role === "admin" ? "/app" : "/app" });
    } catch (err: any) {
      toast.error(err?.message || "Sign in failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col hero-bg">
      <header className="px-6 py-6">
        <Link to="/">
          <BrandLogo size="sm" />
        </Link>
      </header>

      <main className="flex-1 grid lg:grid-cols-2 gap-10 items-center px-6 max-w-7xl w-full mx-auto pb-16">
        <div>
          <div className="text-xs font-semibold tracking-[0.2em] text-info uppercase">
            Welcome
          </div>
          <h1 className="mt-3 text-4xl md:text-5xl font-bold tracking-tight">
            Sign in to your <span className="gradient-text">Mail workspace</span>
          </h1>
          <p className="mt-5 text-muted-foreground max-w-md">
            Send, route, monitor and audit email at scale — from one premium
            operations console.
          </p>
        </div>

        <form
          onSubmit={onSubmit}
          className="glass card-ring-primary rounded-2xl p-8 max-w-md w-full justify-self-end"
        >
          <h2 className="text-2xl font-bold">Sign in</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Use the credentials provided by your administrator.
          </p>

          <div className="mt-6 space-y-4">
            <div>
              <label
                htmlFor="email"
                className="block text-sm font-medium text-foreground"
              >
                Email or username
              </label>
              <div className="mt-2 relative">
                <Mail
                  size={16}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                />
                <input
                  id="email"
                  type="text"
                  autoComplete="username"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-lg border border-border bg-input/60 pl-10 pr-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  placeholder="you@company.com"
                  required
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="password"
                className="block text-sm font-medium text-foreground"
              >
                Password
              </label>
              <div className="mt-2 relative">
                <KeyRound
                  size={16}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                />
                <input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-lg border border-border bg-input/60 pl-10 pr-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  placeholder="••••••••"
                  required
                />
              </div>
              <div className="mt-2 text-right">
                <span className="text-xs text-info">
                  Forgot password? Contact your administrator.
                </span>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full inline-flex items-center justify-center gap-2 rounded-xl px-6 py-3 text-sm font-semibold text-primary-foreground glow-primary transition-transform hover:scale-[1.01] disabled:opacity-60 disabled:hover:scale-100"
              style={{ background: "var(--gradient-primary)" }}
            >
              {loading ? "Signing in…" : "Sign in"} <ArrowRight size={16} />
            </button>

            <p className="text-xs text-muted-foreground text-center">
              Need an account?{" "}
              <span className="text-foreground font-medium">
                Contact your administrator
              </span>{" "}
              — public sign-up is disabled.
            </p>
          </div>
        </form>
      </main>

      <footer className="px-6 py-6 text-xs text-muted-foreground">
        © {new Date().getFullYear()} SecretVoIP — All rights reserved.
      </footer>
    </div>
  );
}
