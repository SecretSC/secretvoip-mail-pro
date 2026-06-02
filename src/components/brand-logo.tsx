import { Mail } from "lucide-react";

interface BrandLogoProps {
  size?: "sm" | "md" | "lg";
  showText?: boolean;
}

export function BrandLogo({ size = "md", showText = true }: BrandLogoProps) {
  const dims =
    size === "sm" ? "h-9 w-9" : size === "lg" ? "h-14 w-14" : "h-11 w-11";
  const icon = size === "sm" ? 16 : size === "lg" ? 24 : 20;
  const title =
    size === "sm" ? "text-sm" : size === "lg" ? "text-xl" : "text-base";

  return (
    <div className="flex items-center gap-3">
      <div
        className={`${dims} flex items-center justify-center rounded-2xl glow-primary`}
        style={{ background: "var(--gradient-primary)" }}
        aria-hidden="true"
      >
        <Mail size={icon} className="text-primary-foreground" strokeWidth={2.5} />
      </div>
      {showText && (
        <div className="flex flex-col leading-tight">
          <span className={`${title} font-bold text-foreground tracking-tight`}>
            SecretVoIP
          </span>
          <span className="text-[0.625rem] font-semibold tracking-[0.18em] text-muted-foreground uppercase">
            Mail Platform
          </span>
        </div>
      )}
    </div>
  );
}
