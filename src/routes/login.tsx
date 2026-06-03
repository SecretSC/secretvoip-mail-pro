import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowRight, KeyRound, User } from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";
import { useAuth } from "@/lib/auth-context";
import { api } from "@/lib/api";
import { toast } from "sonner";

export const Route = createFileRoute("/login")({
  head: () => ({ meta: [{ title: "Sign in — SecretVoIP Mail" }] }),
  component: LoginPage,
});

function LoginPage() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [support, setSupport] = useState("@Hamfranord");

  useEffect(() => {
    api.publicSettings()
      .then((s) => { if (s.support_telegram) setSupport(String(s.support_telegram)); })
      .catch(() => {});
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!identifier || !password) return;
    setLoading(true);
    try {
      const me = await signIn(identifier.trim(), password);
      toast.success(`Welcome back, ${me.fullName}`);
      navigate({ to: "/app" });
    } catch (err: any) {
      toast.error(err?.message || "Sign in failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col hero-bg">
      <header className="px-6 py-6">
        <Link to="/"><BrandLogo size="sm" /></Link>
      </header>

      <main className="flex-1 grid lg:grid-cols-2 gap-10 items-center px-6 max-w-7xl w-full mx-auto pb-16">
        <div className="hidden lg:block">
          <div className="text-xs font-semibold tracking-[0.2em] text-info uppercase">Welcome</div>
          <h1 className="mt-3 text-4xl md:text-5xl font-bold tracking-tight">
            Sign in to your <span className="gradient-text">Mail workspace</span>
          </h1>
          <p className="mt-5 text-muted-foreground max-w-md">
            Send, route, monitor and audit email at scale — from one premium operations console.
          </p>
        </div>

        <form onSubmit={onSubmit} className="glass card-ring-primary rounded-2xl p-6 md:p-8 max-w-md w-full lg:justify-self-end mx-auto">
          <h2 className="text-2xl font-bold">Sign in</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Use the credentials provided by your administrator.
          </p>

          <div className="mt-6 space-y-4">
            <div>
              <label htmlFor="identifier" className="block text-sm font-medium">Username</label>
              <div className="mt-2 relative">
                <User size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  id="identifier" type="text" autoComplete="username"
                  value={identifier} onChange={(e) => setIdentifier(e.target.value)}
                  className="w-full rounded-lg border border-border bg-input/60 pl-10 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  placeholder="your-username" required
                />
              </div>
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium">Password</label>
              <div className="mt-2 relative">
                <KeyRound size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  id="password" type="password" autoComplete="current-password"
                  value={password} onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-lg border border-border bg-input/60 pl-10 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  placeholder="••••••••" required
                />
              </div>
              <div className="mt-2 text-right">
                <span className="text-xs text-info">Forgot password? Contact {support}</span>
              </div>
            </div>

            <button type="submit" disabled={loading}
              className="w-full inline-flex items-center justify-center gap-2 rounded-xl px-6 py-3 text-sm font-semibold text-primary-foreground glow-primary transition-transform hover:scale-[1.01] disabled:opacity-60"
              style={{ background: "var(--gradient-primary)" }}>
              {loading ? "Signing in…" : "Sign in"} <ArrowRight size={16} />
            </button>

            <p className="text-xs text-muted-foreground text-center">
              Need an account? Contact <span className="text-foreground font-medium">{support}</span> on Telegram to get access.
            </p>
          </div>
        </form>
      </main>

      <footer className="px-6 py-6 text-xs text-muted-foreground text-center">
        © {new Date().getFullYear()} SecretVoIP — All rights reserved.
      </footer>
    </div>
  );
}
