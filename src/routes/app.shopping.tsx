import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Plus, Sparkles, ShoppingBag, Zap } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { usePantry } from "@/lib/pantry-store";
import type { ShopItem } from "@/lib/pantry-data";
import { PageHeader } from "@/components/pantry/ui";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app/shopping")({
  head: () => ({ meta: [{ title: "Shopping List — AI Smart Pantry" }, { name: "description", content: "A smart shopping list that fills itself from low stock and recipe gaps." }, { property: "og:title", content: "Smart Shopping List — AI Smart Pantry" }, { property: "og:description", content: "Never forget the rice again." }] }),
  component: Shopping,
});

const sections: ShopItem["section"][] = ["Need Now", "Running Low", "Suggested", "Recently Purchased"];
const prio = { High: "bg-spoiled-soft text-spoiled", Medium: "bg-warn-soft text-warn", Low: "bg-muted text-muted-foreground" };

function Shopping() {
  const { shopping, toggleShop, addShop } = usePantry();
  const [name, setName] = useState("");
  const open = shopping.filter((s) => !s.done && s.section !== "Recently Purchased");

  return (
    <div>
      <PageHeader eyebrow={`${open.length} to buy`} title="Smart shopping list" subtitle="Auto-filled from low stock, recipe gaps and your buying habits." />
      <div className="grid gap-8 lg:grid-cols-[1fr_340px]">
        <div className="space-y-6">
          <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (!name.trim()) return; addShop({ name, qty: "1", category: "Other", priority: "Medium", section: "Need Now" }); toast.success(`${name} added.`); setName(""); }}>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Add an item…" className="h-11 rounded-full bg-card px-5" />
            <Button type="submit" size="lg"><Plus /> Add</Button>
          </form>
          {sections.map((sec) => {
            const list = shopping.filter((s) => s.section === sec);
            if (!list.length) return null;
            return (
              <section key={sec} className="card-surface overflow-hidden animate-rise">
                <h2 className="flex items-center gap-2 border-b px-5 py-3 font-semibold">{sec === "Suggested" && <Sparkles className="h-4 w-4 text-primary" />}{sec}<span className="text-sm font-normal text-muted-foreground">{list.length}</span></h2>
                <ul className="divide-y">
                  {list.map((s) => (
                    <li key={s.id} className="flex items-center gap-4 px-5 py-3">
                      <Checkbox checked={s.done} onCheckedChange={() => toggleShop(s.id)} className="h-5 w-5 rounded-full" />
                      <div className="min-w-0 flex-1">
                        <p className={cn("font-medium transition-colors", s.done && "text-muted-foreground line-through")}>{s.name}</p>
                        <p className="text-xs text-muted-foreground">{s.qty} · {s.category}{s.reason ? ` · ${s.reason}` : ""}</p>
                      </div>
                      <span className={cn("rounded-full px-2.5 py-1 text-xs font-semibold", prio[s.priority])}>{s.priority}</span>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
        <aside className="h-fit space-y-4 lg:sticky lg:top-24">
          <div className="overflow-hidden rounded-3xl bg-brand p-6 text-primary-foreground shadow-lift">
            <div className="flex items-center gap-2 text-sm opacity-90"><Zap className="h-4 w-4" />Instant delivery</div>
            <h3 className="mt-2 text-2xl font-bold">Order from Swiggy Instamart</h3>
            <p className="mt-1 text-sm opacity-85">{open.length} items · est. ₹{open.length * 85} · 15 min</p>
            <Button variant="outline" className="mt-5 w-full border-transparent text-foreground" onClick={() => toast("This is a demo — no real order was placed.")}><ShoppingBag /> Send cart</Button>
          </div>
          <div className="card-surface p-5">
            <h3 className="font-semibold">Local grocery store</h3>
            <p className="mt-1 text-sm text-muted-foreground">Share the list with your neighbourhood kirana via WhatsApp.</p>
            <Button variant="soft" className="mt-4 w-full" onClick={() => toast("Demo: list shared.")}>Share list</Button>
          </div>
          <p className="px-2 text-xs text-muted-foreground">Grocery integrations are a simulated preview. No real orders or payments are made.</p>
        </aside>
      </div>
    </div>
  );
}
