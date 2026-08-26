import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/*
 * Primitives d'interface.
 *
 * Volontairement peu nombreuses et sans dépendance : l'application a besoin
 * d'être lisible à 23h et utilisable d'une main, pas d'un système de design.
 */

export function Card({
  children,
  className,
  as: Tag = "section",
}: {
  children: ReactNode;
  className?: string;
  as?: "section" | "div" | "article";
}) {
  return (
    <Tag
      className={cn(
        "rounded-2xl border border-border bg-surface p-4 sm:p-5",
        className,
      )}
    >
      {children}
    </Tag>
  );
}

export function CardTitle({
  children,
  hint,
  action,
}: {
  children: ReactNode;
  hint?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="mb-3 flex items-start justify-between gap-3">
      <div>
        <h2 className="text-sm font-semibold tracking-wide text-muted uppercase">{children}</h2>
        {hint ? <p className="mt-1 text-sm text-faint">{hint}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function Stat({
  label,
  value,
  unit,
  tone = "neutral",
  hint,
}: {
  label: string;
  value: ReactNode;
  unit?: string;
  tone?: "neutral" | "success" | "warning" | "danger" | "accent";
  hint?: string;
}) {
  const tones = {
    neutral: "text-text",
    success: "text-success",
    warning: "text-warning",
    danger: "text-danger",
    accent: "text-accent",
  };
  return (
    <div className="min-w-0">
      <div className="text-xs text-faint uppercase tracking-wide">{label}</div>
      <div className={cn("mt-1 text-2xl font-semibold tabular-nums", tones[tone])}>
        {value}
        {unit ? <span className="ml-1 text-base font-normal text-muted">{unit}</span> : null}
      </div>
      {hint ? <div className="mt-0.5 text-xs text-faint">{hint}</div> : null}
    </div>
  );
}

export function Badge({
  children,
  tone = "neutral",
  className,
}: {
  children: ReactNode;
  tone?: "neutral" | "success" | "warning" | "danger" | "accent" | "salle" | "matin" | "soir";
  className?: string;
}) {
  const tones = {
    neutral: "border-border bg-raised text-muted",
    success: "border-success/40 bg-success/10 text-success",
    warning: "border-warning/40 bg-warning/10 text-warning",
    danger: "border-danger/40 bg-danger/10 text-danger",
    accent: "border-accent/40 bg-accent/10 text-accent",
    salle: "border-salle/40 bg-salle/10 text-salle",
    matin: "border-matin/40 bg-matin/10 text-matin",
    soir: "border-soir/40 bg-soir/10 text-soir",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function EmptyState({ title, detail }: { title: string; detail?: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-border px-4 py-8 text-center">
      <p className="text-sm font-medium text-muted">{title}</p>
      {detail ? <p className="mt-1 text-sm text-faint">{detail}</p> : null}
    </div>
  );
}

export function ProgressBar({
  value,
  max,
  tone = "accent",
  label,
}: {
  value: number;
  max: number;
  tone?: "accent" | "success" | "warning" | "danger";
  label?: string;
}) {
  const percent = max <= 0 ? 0 : Math.min(100, Math.round((value / max) * 100));
  const tones = {
    accent: "bg-accent",
    success: "bg-success",
    warning: "bg-warning",
    danger: "bg-danger",
  };
  return (
    <div>
      {label ? (
        <div className="mb-1 flex justify-between text-xs text-faint">
          <span>{label}</span>
          <span className="tabular-nums">{percent} %</span>
        </div>
      ) : null}
      <div
        className="h-2 overflow-hidden rounded-full bg-raised"
        role="progressbar"
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-label={label}
      >
        <div className={cn("h-full rounded-full transition-[width]", tones[tone])} style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

export function Alert({
  tone,
  title,
  children,
}: {
  tone: "info" | "warning" | "danger" | "success";
  title: string;
  children?: ReactNode;
}) {
  const tones = {
    info: "border-accent/40 bg-accent/5",
    warning: "border-warning/40 bg-warning/5",
    danger: "border-danger/50 bg-danger/5",
    success: "border-success/40 bg-success/5",
  };
  const titleTones = {
    info: "text-accent",
    warning: "text-warning",
    danger: "text-danger",
    success: "text-success",
  };
  return (
    <div className={cn("rounded-xl border px-4 py-3", tones[tone])} role="status">
      <p className={cn("text-sm font-semibold", titleTones[tone])}>{title}</p>
      {children ? <div className="mt-1 text-sm text-muted">{children}</div> : null}
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
        {subtitle ? <p className="mt-1 text-sm text-muted">{subtitle}</p> : null}
      </div>
      {action}
    </header>
  );
}
