import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Search, Camera, Tag, ScanBarcode } from "lucide-react";
import { usePantry } from "@/lib/pantry-store";
import { statusFor } from "@/lib/pantry-data";
import { EmptyState, FoodThumb, PageHeader, StatusBadge } from "@/components/pantry/ui";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app/history")({
  head: () => ({ meta: [{ title: "Scan History — AI Smart Pantry" }, { name: "description", content: "Every photo, label and barcode you've scanned, with results." }, { property: "og:title", content: "Scan History — AI Smart Pantry" }, { property: "og:description", content: "Your scanning timeline." }] }),
  component: History,
});

const icons = { Photo: Camera, Label: Tag, Barcode: ScanBarcode };

function History() {
  const { history } = usePantry();
  const [q, setQ] = useState("");
  const [m, setM] = useState<string>("All");
  const list = history.filter((h) => (m === "All" || h.method === m) && h.name.toLowerCase().includes(q.toLowerCase()));
  return (
    <div>
      <PageHeader eyebrow={`${history.length} scans`} title="Scan history" subtitle="A timeline of everything our AI has looked at." />
      <div className="mb-8 flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1"><Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search scans…" className="h-11 w-full rounded-full border bg-card pl-10 pr-4 text-sm outline-none focus:ring-2 focus:ring-ring" /></div>
        <div className="flex gap-1 rounded-full border bg-card p-1">{["All", "Photo", "Label", "Barcode"].map((x) => <button key={x} onClick={() => setM(x)} className={cn("rounded-full px-4 py-2 text-sm font-medium", m === x ? "bg-primary text-primary-foreground" : "text-muted-foreground")}>{x}</button>)}</div>
      </div>
      {list.length === 0 ? <EmptyState title="No scans found" body="Try a different search, or scan something new." /> : (
        <ol className="relative space-y-4 border-l-2 border-dashed pl-6 sm:pl-8">
          {list.map((h, i) => {
            const I = icons[h.method];
            return (
              <li key={h.id} className="relative animate-rise" style={{ animationDelay: `${i * 50}ms` }}>
                <span className="absolute -left-[37px] top-6 grid h-6 w-6 place-items-center rounded-full border-2 border-background bg-primary text-primary-foreground sm:-left-[45px]"><I className="h-3 w-3" /></span>
                <div className="card-surface lift flex items-center gap-4 p-4">
                  <FoodThumb item={h} className="h-16 w-16 shrink-0 rounded-2xl" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2"><p className="font-semibold">{h.name}</p><StatusBadge status={statusFor(h.freshness, 3)} /></div>
                    <p className="text-sm text-muted-foreground">{h.result}</p>
                    <p className="text-xs text-muted-foreground">{h.date} · {h.action}</p>
                  </div>
                  <span className="hidden font-display text-2xl font-bold sm:block">{h.freshness}%</span>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
