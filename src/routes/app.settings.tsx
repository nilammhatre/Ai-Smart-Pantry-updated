import { createFileRoute } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { KeyRound, CheckCircle2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { usePantry } from "@/lib/pantry-store";
import { PageHeader } from "@/components/pantry/ui";
import { cn } from "@/lib/utils";
import ApiCredentialsModal from "@/components/pantry/ApiCredentialsModal";
import { sendTestWhatsAppMessage } from "@/services/whatsappService";
import { refreshGoogleAccessToken } from "@/services/calendarService";

export const Route = createFileRoute("/app/settings")({
  head: () => ({
    meta: [
      { title: "Settings — AI Smart Pantry" },
      { name: "description", content: "Profile, diet, allergens, reminders, Google Calendar, WhatsApp, and API integrations." },
      { property: "og:title", content: "Settings — AI Smart Pantry" },
      { property: "og:description", content: "Configure live AI Smart Pantry integrations." }
    ]
  }),
  component: Settings,
});

function Chips({ options, initial }: { options: string[]; initial: string[] }) {
  const [sel, setSel] = useState(initial);
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => (
        <button
          key={o}
          type="button"
          onClick={() => setSel((s) => (s.includes(o) ? s.filter((x) => x !== o) : [...s, o]))}
          className={cn(
            "rounded-full border px-3.5 py-1.5 text-sm transition-colors",
            sel.includes(o)
              ? "border-primary bg-primary-soft font-semibold text-accent-foreground"
              : "bg-card hover:bg-secondary"
          )}
        >
          {o}
        </button>
      ))}
    </div>
  );
}

function Card({ title, desc, children }: { title: string; desc?: string; children: ReactNode }) {
  return (
    <section className="card-surface p-6 animate-rise">
      <h2 className="font-semibold">{title}</h2>
      {desc && <p className="text-sm text-muted-foreground">{desc}</p>}
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  );
}

function Row({ label, sub, defaultOn = false, checked, onChange }: { label: string; sub?: string; defaultOn?: boolean; checked?: boolean; onChange?: (v: boolean) => void }) {
  const [v, setV] = useState(defaultOn);
  return (
    <label className="flex items-center justify-between gap-4">
      <span>
        <span className="block text-sm font-medium">{label}</span>
        {sub && <span className="text-xs text-muted-foreground">{sub}</span>}
      </span>
      <Switch checked={checked ?? v} onCheckedChange={onChange ?? setV} />
    </label>
  );
}

function Settings() {
  const { dark, setDark } = usePantry();
  const [showApiModal, setShowApiModal] = useState(false);
  const [testingWa, setTestingWa] = useState(false);
  const [refreshingCal, setRefreshingCal] = useState(false);

  const handleTestWhatsApp = async () => {
    setTestingWa(true);
    try {
      const res = await sendTestWhatsAppMessage();
      if (res.success) {
        toast.success(`WhatsApp message delivered to +${res.recipient || "configured recipient"}!`, {
          icon: <CheckCircle2 className="h-4 w-4 text-emerald-500" />
        });
      } else {
        toast.error(`WhatsApp Error: ${res.error || "Failed to send message"}`);
      }
    } catch (err: any) {
      toast.error(`WhatsApp dispatch failed: ${err.message}`);
    } finally {
      setTestingWa(false);
    }
  };

  const handleRefreshGoogleToken = async () => {
    setRefreshingCal(true);
    try {
      const token = await refreshGoogleAccessToken();
      if (token) {
        toast.success("Google OAuth access token refreshed successfully!");
      } else {
        toast.error("Could not refresh Google token. Configure credentials in API modal.");
      }
    } catch (err: any) {
      toast.error(`Google Calendar Refresh failed: ${err.message}`);
    } finally {
      setRefreshingCal(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Settings" subtitle="Make Smart Pantry work the way your kitchen does." />
      <div className="space-y-5">
        <Card title="Profile">
          <div className="flex items-center gap-4">
            <span className="grid h-16 w-16 place-items-center rounded-2xl bg-brand font-display text-2xl font-bold text-primary-foreground">
              N
            </span>
            <div className="grid flex-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Name</Label>
                <Input defaultValue="Nilam" />
              </div>
              <div className="space-y-1.5">
                <Label>Email</Label>
                <Input defaultValue="nilam@example.com" />
              </div>
            </div>
          </div>
        </Card>

        <Card title="Food & diet preferences">
          <Chips
            options={["Vegetarian", "Vegan", "Eggetarian", "Jain", "Low-carb", "High-protein", "Indian", "Continental"]}
            initial={["Vegetarian", "Indian"]}
          />
        </Card>

        <Card title="Allergens" desc="We'll flag these anywhere they appear.">
          <Chips
            options={["Milk", "Nuts", "Gluten", "Soy", "Eggs", "Shellfish", "Sesame"]}
            initial={["Nuts"]}
          />
        </Card>

        <Card title="Notifications & reminders">
          <Row label="Expiry alerts" sub="1 day before consume-by date" defaultOn />
          <Row label="Freshness drops" sub="When an item falls below 60%" defaultOn />
          <Row label="Daily summary" sub="Every evening at 7 PM" />
        </Card>

        <Card title="Live Integrations (Swiggy Developer Platform, Google Calendar & WhatsApp)">
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-surface p-4">
              <div>
                <p className="font-semibold text-sm">Swiggy Developer Platform (OAuth 2.1 PKCE & MCP)</p>
                <p className="text-xs text-muted-foreground">Instamart order imports & SSE JSON-RPC tool calls</p>
              </div>
              <Button size="sm" variant="outline" onClick={() => setShowApiModal(true)}>
                Manage Swiggy OAuth
              </Button>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-surface p-4">
              <div>
                <p className="font-semibold text-sm">Google Calendar API (OAuth 2.0)</p>
                <p className="text-xs text-muted-foreground">Automated event creation for expiring items</p>
              </div>
              <Button size="sm" variant="outline" onClick={handleRefreshGoogleToken} disabled={refreshingCal}>
                <RefreshCw className={cn("mr-1.5 h-3.5 w-3.5", refreshingCal && "animate-spin")} />
                {refreshingCal ? "Refreshing..." : "Refresh Token"}
              </Button>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-surface p-4">
              <div>
                <p className="font-semibold text-sm">WhatsApp Business Cloud API (Meta REST)</p>
                <p className="text-xs text-muted-foreground">Direct background alerts to WhatsApp recipient (+919322348511)</p>
              </div>
              <div className="flex items-center gap-2">
                <a
                  href="https://api.whatsapp.com/send?phone=919322348511&text=%F0%9F%A5%AC%20*Smart%20Pantry%20Test%20Alert*%20%F0%9F%9A%A8%0A%0AFresh%20Organic%20Spinach%20(Palak)%20is%20approaching%20expiry%20limit.%20Consume%20within%202%20days.%0A%0A_Automated%20test%20notification_"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 border border-emerald-500/40 rounded-lg px-2.5 py-1.5 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 transition-colors"
                >
                  📱 Open Chat
                </a>
                <Button size="sm" variant="soft" onClick={handleTestWhatsApp} disabled={testingWa}>
                  {testingWa ? "Sending..." : "Send Test WhatsApp"}
                </Button>
              </div>
            </div>

            <Button
              className="w-full"
              variant="default"
              onClick={() => setShowApiModal(true)}
            >
              <KeyRound className="mr-2 h-4 w-4" />
              Manage API Credentials & Live Console
            </Button>
          </div>
        </Card>

        <Card title="Theme">
          <Row label="Dark mode" sub="Easier on the eyes at night" checked={dark} onChange={setDark} />
        </Card>

        <Card title="Privacy & account">
          <Row label="Share anonymous usage to improve AI" defaultOn />
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => toast.success("Your data export is on its way.")}>
              Export my data
            </Button>
            <Button
              variant="ghost"
              className="text-destructive"
              onClick={() => {
                localStorage.removeItem("smart-pantry-v1");
                localStorage.removeItem("smart_pantry_items");
                toast("Demo data reset — reload to see initial state.");
              }}
            >
              Reset demo data
            </Button>
          </div>
        </Card>
      </div>

      {showApiModal && (
        <ApiCredentialsModal onClose={() => setShowApiModal(false)} />
      )}
    </div>
  );
}
