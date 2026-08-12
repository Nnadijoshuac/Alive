import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from "react";
import { WarningIcon, CheckCircleIcon, CircleNotchIcon, InfoIcon } from "@phosphor-icons/react/dist/ssr";

export const buttonClass =
  "button inline-flex min-h-11 items-center justify-center gap-2 whitespace-nowrap px-4 text-sm font-semibold";

export function Button({ className = "", type = "button", ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type={type} className={`${buttonClass} ${className}`} {...props} />;
}

export function StatusBadge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "active" | "success" | "warning";
}) {
  return <span className={`status-badge status-${tone}`}>{children}</span>;
}

export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {error ? <span className="field-error">{error}</span> : hint ? <span className="field-hint">{hint}</span> : null}
    </label>
  );
}

export function InlineNotice({
  tone = "info",
  title,
  children,
  className = "",
}: {
  tone?: "info" | "success" | "warning" | "loading";
  title: string;
  children?: ReactNode;
  className?: string;
}) {
  const Icon = tone === "success" ? CheckCircleIcon : tone === "warning" ? WarningIcon : tone === "loading" ? CircleNotchIcon : InfoIcon;
  return (
    <div className={`inline-notice notice-${tone} ${className}`} role={tone === "warning" ? "alert" : "status"}>
      <Icon className={tone === "loading" ? "spin" : ""} size={20} weight="bold" aria-hidden="true" />
      <div>
        <strong>{title}</strong>
        {children ? <div>{children}</div> : null}
      </div>
    </div>
  );
}

export function PageIntro({
  title,
  description,
  eyebrow,
  actions,
}: {
  title: string;
  description: string;
  eyebrow?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="page-intro">
      <div>
        {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {actions ? <div className="page-actions">{actions}</div> : null}
    </header>
  );
}

export function SectionHeading({ title, description }: { title: string; description?: string }) {
  return (
    <div className="section-heading">
      <h2>{title}</h2>
      {description ? <p>{description}</p> : null}
    </div>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <span className={`skeleton ${className}`} aria-hidden="true" />;
}

export function KeyValue({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="key-value">
      <span>{label}</span>
      <strong>{children}</strong>
    </div>
  );
}

export function Panel({ className = "", ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={`panel ${className}`} {...props} />;
}
