import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Leaf, Clock, MapPin, UtensilsCrossed } from "lucide-react";
import { cn } from "@/lib/utils";
import { statusFor, daysLabel, getDeterministicDaysLeft, getExpiryBadge, type PantryItem, type Status, foodImages } from "@/lib/pantry-data";

export const statusTone: Record<Status, { text: string; bg: string; bar: string; stroke: string }> = {
  Fresh: { text: "text-fresh", bg: "bg-fresh-soft", bar: "bg-fresh", stroke: "stroke-fresh" },
  Good: { text: "text-good", bg: "bg-good-soft", bar: "bg-good", stroke: "stroke-good" },
  "Use Soon": { text: "text-warn", bg: "bg-warn-soft", bar: "bg-warn", stroke: "stroke-warn" },
  Expired: { text: "text-rose-600 dark:text-rose-400 font-bold", bg: "bg-rose-500/15 border border-rose-500/30", bar: "bg-rose-600", stroke: "stroke-rose-600" },
  Spoiled: { text: "text-spoiled", bg: "bg-spoiled-soft", bar: "bg-spoiled", stroke: "stroke-spoiled" },
};

export function StatusBadge({ status, className }: { status: Status; className?: string }) {
  const t = statusTone[status];
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold", t.bg, t.text, className)}>
      <span className={cn("h-1.5 w-1.5 rounded-full", t.bar)} />
      {status}
    </span>
  );
}

export function useInView<T extends Element>() {
  const ref = useRef<T>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    if (!ref.current) return;
    const io = new IntersectionObserver(([e]) => e.isIntersecting && setSeen(true), { threshold: 0.15 });
    io.observe(ref.current);
    return () => io.disconnect();
  }, []);
  return { ref, seen };
}

export function Counter({ value, prefix = "", suffix = "", duration = 1100 }: { value: number; prefix?: string; suffix?: string; duration?: number }) {
  const [v, setV] = useState(0);
  const { ref, seen } = useInView<HTMLSpanElement>();
  useEffect(() => {
    if (!seen) return;
    let raf = 0;
    const start = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / duration);
      setV(Math.round(value * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [seen, value, duration]);
  return <span ref={ref} className="tabular-nums">{prefix}{v.toLocaleString("en-IN")}{suffix}</span>;
}

export function Ring({ value, size = 96, stroke = 9, status, label }: { value: number; size?: number; stroke?: number; status: Status; label?: ReactNode }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const [shown, setShown] = useState(0);
  useEffect(() => { const t = setTimeout(() => setShown(value), 80); return () => clearTimeout(t); }, [value]);
  return (
    <div className="relative inline-grid place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} strokeWidth={stroke} className="fill-none stroke-muted" />
        <circle
          cx={size / 2} cy={size / 2} r={r} strokeWidth={stroke} strokeLinecap="round"
          className={cn("fill-none transition-[stroke-dashoffset] duration-[1200ms] ease-out", statusTone[status].stroke)}
          strokeDasharray={c} strokeDashoffset={c - (c * shown) / 100}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">{label ?? <span className="font-display text-lg font-bold">{value}%</span>}</div>
    </div>
  );
}

export function FreshBar({ value, status, className }: { value: number; status: Status; className?: string }) {
  const [w, setW] = useState(0);
  useEffect(() => { const t = setTimeout(() => setW(value), 60); return () => clearTimeout(t); }, [value]);
  return (
    <div className={cn("h-1.5 w-full overflow-hidden rounded-full bg-muted", className)}>
      <div className={cn("h-full rounded-full transition-[width] duration-1000 ease-out", statusTone[status].bar)} style={{ width: `${w}%` }} />
    </div>
  );
}

export function FoodThumb({ item, className }: { item: Pick<PantryItem, "image" | "name">; className?: string }) {
  if (item.image) {
    return <img src={item.image} alt={item.name} loading="lazy" width={816} height={816} className={cn("object-cover", className)} />;
  }

  const lowerName = (item.name || "").toLowerCase();
  for (const [key, img] of Object.entries(foodImages)) {
    if (lowerName.includes(key) || key.includes(lowerName)) {
      return <img src={img} alt={item.name} loading="lazy" width={816} height={816} className={cn("object-cover", className)} />;
    }
  }

  return (
    <div className={cn("grid place-items-center bg-gradient-to-br from-primary/10 via-amber-500/10 to-emerald-500/10 text-primary relative overflow-hidden", className)}>
      <UtensilsCrossed className="h-1/2 w-1/2 opacity-35" />
    </div>
  );
}

export function FoodCard({ item, action }: { item: PantryItem; action?: ReactNode }) {
  const daysLeft = getDeterministicDaysLeft(item);
  const expiryBadge = getExpiryBadge(daysLeft);
  const status = statusFor(item.freshness, daysLeft);

  return (
    <div className="card-surface lift group flex items-center gap-3.5 p-3 rounded-2xl border transition-all hover:border-primary/40">
      <Link to="/app/pantry/$id" params={{ id: item.id }} className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-muted shadow-sm">
        <FoodThumb item={item} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
      </Link>
      
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex items-center justify-between gap-1">
          <Link to="/app/pantry/$id" params={{ id: item.id }} className="truncate font-display text-sm font-semibold hover:text-primary">
            {item.name}
          </Link>
          <span className={cn("px-2 py-0.5 text-[10px] font-bold rounded-md shrink-0 border", expiryBadge.badgeClass)}>
            {expiryBadge.text}
          </span>
        </div>

        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="truncate">{item.quantity}</span>
          <span>·</span>
          <span className="truncate">{item.storage}</span>
          {item.isVerifiedExpiry ? (
            <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">✓ Verified</span>
          ) : (
            <span className="text-[10px] text-amber-600 dark:text-amber-400">AI Est.</span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <FreshBar value={item.freshness} status={status} className="h-1.5 flex-1" />
          <span className={cn("text-xs font-bold shrink-0", statusTone[status].text)}>{item.freshness}%</span>
        </div>

        <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-0.5">
          <span className="inline-flex items-center gap-1">
            <Clock className="h-3 w-3 text-primary" />
            {item.nextAlertDate ? `Alert: ${item.nextAlertDate}` : daysLabel(daysLeft)}
          </span>
          {action}
        </div>
      </div>
    </div>
  );
}

export function PageHeader({ eyebrow, title, subtitle, actions }: { eyebrow?: string; title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-8 flex flex-col gap-4 animate-rise sm:flex-row sm:items-end sm:justify-between">
      <div>
        {eyebrow && <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-primary">{eyebrow}</p>}
        <h1 className="text-3xl font-extrabold sm:text-4xl text-foreground dark:text-zinc-100 tracking-tight">{title}</h1>
        {subtitle && <p className="mt-2 max-w-xl text-muted-foreground">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function EmptyState({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <div className="card-surface flex flex-col items-center gap-3 px-6 py-14 text-center">
      <div className="grid h-14 w-14 place-items-center rounded-2xl bg-primary-soft text-primary"><Leaf className="h-6 w-6" /></div>
      <h3 className="text-lg font-semibold">{title}</h3>
      <p className="max-w-sm text-sm text-muted-foreground">{body}</p>
      {action}
    </div>
  );
}

export function SkeletonCard() {
  return (
    <div className="card-surface flex items-center gap-3.5 p-3 rounded-2xl border">
      <div className="skeleton-shimmer h-16 w-16 shrink-0 rounded-xl" />
      <div className="space-y-2 flex-1">
        <div className="skeleton-shimmer h-4 w-2/3 rounded" />
        <div className="skeleton-shimmer h-3 w-1/3 rounded" />
        <div className="skeleton-shimmer h-2 w-full rounded" />
      </div>
    </div>
  );
}

export function Section({ title, action, children, className }: { title: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn("animate-rise", className)}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-xl font-semibold">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}
