import { createFileRoute } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { usePantry } from "@/lib/pantry-store";
import { PageHeader } from "@/components/pantry/ui";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app/settings")({
  head: () => ({ meta: [{ title: "Settings — AI Smart Pantry" }, { name: "description", content: "Profile, diet, allergens, reminders and integrations." }, { property: "og:title", content: "Settings — AI Smart Pantry" }, { property: "og:description", content: "Make Smart Pantry yours." }] }),
  component: Settings,
});

function Chips({ options, initial }: { options: string[]; initial: string[] }) {
  const [sel, setSel] = useState(initial);
  return <div className="flex flex-wrap gap-2">{options.map((o) => <button key={o} type="button" onClick={() => setSel((s) => (s.includes(o) ? s.filter((x) => x !== o) : [...s, o]))} className={cn("rounded-full border px-3.5 py-1.5 text-sm", sel.includes(o) ? "border-primary bg-primary-soft font-semibold text-accent-foreground" : "bg-card")}>{o}</button>)}</div>;
}
function Card({ title, desc, children }: { title: string; desc?: string; children: ReactNode }) {
  return <section className="card-surface p-6 animate-rise"><h2 className="font-semibold">{title}</h2>{desc && <p className="text-sm text-muted-foreground">{desc}</p>}<div className="mt-4 space-y-4">{children}</div></section>;
}
function Row({ label, sub, defaultOn = false, checked, onChange }: { label: string; sub?: string; defaultOn?: boolean; checked?: boolean; onChange?: (v: boolean) => void }) {
  const [v, setV] = useState(defaultOn);
  return <label className="flex items-center justify-between gap-4"><span><span className="block text-sm font-medium">{label}</span>{sub && <span className="text-xs text-muted-foreground">{sub}</span>}</span><Switch checked={checked ?? v} onCheckedChange={onChange ?? setV} /></label>;
}

function Settings() {
  const { dark, setDark } = usePantry();
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Settings" subtitle="Make Smart Pantry work the way your kitchen does." />
      <div className="space-y-5">
        <Card title="Profile">
          <div className="flex items-center gap-4"><span className="grid h-16 w-16 place-items-center rounded-2xl bg-brand font-display text-2xl font-bold text-primary-foreground">N</span><div className="grid flex-1 gap-3 sm:grid-cols-2"><div className="space-y-1.5"><Label>Name</Label><Input defaultValue="Nilam" /></div><div className="space-y-1.5"><Label>Email</Label><Input defaultValue="nilam@example.com" /></div></div></div>
        </Card>
        <Card title="Food & diet preferences"><Chips options={["Vegetarian", "Vegan", "Eggetarian", "Jain", "Low-carb", "High-protein", "Indian", "Continental"]} initial={["Vegetarian", "Indian"]} /></Card>
        <Card title="Allergens" desc="We'll flag these anywhere they appear."><Chips options={["Milk", "Nuts", "Gluten", "Soy", "Eggs", "Shellfish", "Sesame"]} initial={["Nuts"]} /></Card>
        <Card title="Notifications & reminders">
          <Row label="Expiry alerts" sub="1 day before consume-by date" defaultOn />
          <Row label="Freshness drops" sub="When an item falls below 60%" defaultOn />
          <Row label="Daily summary" sub="Every evening at 7 PM" />
        </Card>
        <Card title="Integrations">
          <Row label="Google Calendar" sub="Adds expiry reminders to your calendar (demo)" defaultOn />
          <Row label="WhatsApp" sub="Get alerts on WhatsApp (demo)" />
        </Card>
        <Card title="Theme"><Row label="Dark mode" sub="Easier on the eyes at night" checked={dark} onChange={setDark} /></Card>
        <Card title="Privacy & account">
          <Row label="Share anonymous usage to improve AI" defaultOn />
          <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => toast.success("Your data export is on its way.")}>Export my data</Button><Button variant="ghost" className="text-destructive" onClick={() => { localStorage.removeItem("smart-pantry-v1"); toast("Demo data reset — reload to see it."); }}>Reset demo data</Button></div>
        </Card>
      </div>
    </div>
  );
}
