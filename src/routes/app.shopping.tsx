import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { Plus, Sparkles, ShoppingBag, Zap, Download, Share2, User, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { usePantry } from "@/lib/pantry-store";
import type { ShopItem } from "@/lib/pantry-data";
import { PageHeader } from "@/components/pantry/ui";
import { cn } from "@/lib/utils";
import ImportDemoOrder from "@/components/pantry/ImportDemoOrder";
import SwiggyInterfaceModal from "@/components/pantry/SwiggyInterfaceModal";
import { swiggyService } from "@/services/swiggy/swiggyService";

export const Route = createFileRoute("/app/shopping")({
  head: () => ({
    meta: [
      { title: "Shopping List — AI Smart Pantry" },
      { name: "description", content: "A smart shopping list that fills itself from low stock, recipe gaps, and Swiggy Instamart." },
      { property: "og:title", content: "Smart Shopping List — AI Smart Pantry" },
      { property: "og:description", content: "Never forget the rice again." }
    ]
  }),
  component: Shopping,
});

const sections: ShopItem["section"][] = ["Need Now", "Running Low", "Suggested", "Recently Purchased"];
const prio = { High: "bg-spoiled-soft text-spoiled", Medium: "bg-warn-soft text-warn", Low: "bg-muted text-muted-foreground" };

function Shopping() {
  const nav = useNavigate();
  const { shopping, toggleShop, addShop, syncPantryDb } = usePantry();
  const [name, setName] = useState("");
  const [showImportModal, setShowImportModal] = useState(false);
  const [showSwiggyModal, setShowSwiggyModal] = useState(false);
  const [swiggyDefaultTab, setSwiggyDefaultTab] = useState<"cart" | "login" | "history" | "tracking">("cart");

  // Handle OAuth 2.1 callback redirect from official Swiggy Builders Club
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const error = params.get("error");
    const errorDesc = params.get("error_description");

    if (error) {
      toast.error(`Swiggy OAuth Error: ${errorDesc || error}`);
      window.history.replaceState({}, document.title, window.location.pathname);
      return;
    }

    if (code) {
      window.history.replaceState({}, document.title, window.location.pathname);
      const toastId = toast.loading("Exchanging Swiggy PKCE authorization code...");
      swiggyService.setMode("real");
      swiggyService
        .handleCallback(code)
        .then(() => {
          toast.success("Genuine Swiggy Instamart account connected!", { id: toastId });
          setShowSwiggyModal(true);
          setSwiggyDefaultTab("history");
        })
        .catch((err) => {
          toast.error(`Swiggy token exchange failed: ${err.message}`, { id: toastId });
        });
    }
  }, []);

  const open = shopping.filter((s) => !s.done && s.section !== "Recently Purchased");
  const isSwiggyConnected = swiggyService.isConnected();

  const handleOpenSwiggyCart = () => {
    setSwiggyDefaultTab("cart");
    setShowSwiggyModal(true);
  };

  const handleOpenSwiggyLogin = () => {
    setSwiggyDefaultTab("login");
    setShowSwiggyModal(true);
  };

  const handleSwiggyOrderSuccess = (_orderResult: any) => {
    open.forEach((item) => {
      toggleShop(item.id);
    });
    syncPantryDb();
    nav({ to: "/app/pantry" });
  };

  const handleImportSuccess = () => {
    syncPantryDb();
    setShowImportModal(false);
    toast.success("Order items successfully imported into your AI Smart Pantry!");
  };

  return (
    <div>
      <PageHeader
        eyebrow={`${open.length} to buy`}
        title="Smart shopping list"
        subtitle="Auto-filled from low stock, recipe gaps, and your buying habits."
      />
      <div className="grid gap-8 lg:grid-cols-[1fr_340px]">
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <form
              className="flex flex-1 gap-2 min-w-[280px]"
              onSubmit={(e) => {
                e.preventDefault();
                if (!name.trim()) return;
                addShop({ name, qty: "1", category: "Other", priority: "Medium", section: "Need Now" });
                toast.success(`${name} added.`);
                setName("");
              }}
            >
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Add an item…"
                className="h-11 rounded-full bg-card px-5"
              />
              <Button type="submit" size="lg">
                <Plus /> Add
              </Button>
            </form>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" size="lg" onClick={() => setShowImportModal(true)}>
                <Download className="mr-1.5 h-4 w-4 text-emerald-600" />
                Import Orders
              </Button>
              <Button
                variant="outline"
                size="lg"
                onClick={handleOpenSwiggyCart}
                className="border-orange-500/30 text-orange-600 dark:text-orange-400 hover:bg-orange-500/10"
              >
                <ShoppingBag className="mr-1.5 h-4 w-4 text-orange-500" />
                Swiggy Cart ({open.length})
              </Button>
            </div>
          </div>

          {sections.map((sec) => {
            const list = shopping.filter((s) => s.section === sec);
            if (!list.length) return null;
            return (
              <section key={sec} className="card-surface overflow-hidden animate-rise">
                <h2 className="flex items-center gap-2 border-b px-5 py-3 font-semibold">
                  {sec === "Suggested" && <Sparkles className="h-4 w-4 text-primary" />}
                  {sec}
                  <span className="text-sm font-normal text-muted-foreground">{list.length}</span>
                </h2>
                <ul className="divide-y">
                  {list.map((s) => (
                    <li key={s.id} className="flex items-center gap-4 px-5 py-3">
                      <Checkbox
                        checked={s.done}
                        onCheckedChange={() => toggleShop(s.id)}
                        className="h-5 w-5 rounded-full"
                      />
                      <div className="min-w-0 flex-1">
                        <p className={cn("font-medium transition-colors", s.done && "text-muted-foreground line-through")}>
                          {s.name}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {s.qty} · {s.category}
                          {s.reason ? ` · ${s.reason}` : ""}
                        </p>
                      </div>
                      <span className={cn("rounded-full px-2.5 py-1 text-xs font-semibold", prio[s.priority])}>
                        {s.priority}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>

        <aside className="h-fit space-y-4 lg:sticky lg:top-24">
          {/* Swiggy Instamart Card */}
          <div className="overflow-hidden rounded-3xl bg-gradient-to-br from-orange-600 via-amber-600 to-orange-500 p-6 text-white shadow-lift">
            <div className="flex items-center justify-between text-sm opacity-95">
              <div className="flex items-center gap-1.5 font-bold">
                <Zap className="h-4 w-4 fill-amber-300 text-amber-300" />
                <span>15-min delivery</span>
              </div>
              <button
                type="button"
                onClick={handleOpenSwiggyLogin}
                className="text-xs bg-white/20 hover:bg-white/30 px-2.5 py-0.5 rounded-full font-bold transition-colors"
              >
                {isSwiggyConnected ? "✓ Logged In" : "🔑 Login"}
              </button>
            </div>
            <h3 className="mt-3 text-2xl font-black tracking-tight">Order from Swiggy Instamart</h3>
            <p className="mt-1 text-sm opacity-90">
              {open.length} items · est. ₹{open.reduce((acc, item: any) => acc + (item.price || 45), 0) || open.length * 45} · 15 min
            </p>
            <Button
              variant="outline"
              className="mt-5 w-full bg-white text-orange-600 hover:bg-white/90 border-transparent font-bold shadow-md"
              onClick={handleOpenSwiggyCart}
            >
              <ShoppingBag className="mr-1.5 h-4 w-4" /> Open Swiggy Cart & Order
            </Button>
          </div>

          <div className="card-surface p-5">
            <h3 className="font-semibold">Local Kirana Grocery Store</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Share the shopping list with your local grocery vendor via WhatsApp.
            </p>
            <Button
              variant="soft"
              className="mt-4 w-full"
              onClick={() => toast.success("Shopping list formatted & dispatched to Kirana WhatsApp!")}
            >
              <Share2 className="mr-1.5 h-4 w-4" />
              Share List via WhatsApp
            </Button>
          </div>

          <div className="card-surface p-4 flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="font-semibold">Swiggy Instamart API</span>
            </div>
            <button
              type="button"
              onClick={handleOpenSwiggyLogin}
              className="text-orange-600 dark:text-orange-400 font-bold hover:underline"
            >
              Account / Settings
            </button>
          </div>
        </aside>
      </div>

      {/* Import Orders Modal */}
      {showImportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-fade-in">
          <div className="relative max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-3xl bg-card p-6 shadow-2xl">
            <button
              onClick={() => setShowImportModal(false)}
              className="absolute right-5 top-5 rounded-full p-2 text-muted-foreground hover:bg-muted"
            >
              ✕
            </button>
            <ImportDemoOrder onImportSuccess={handleImportSuccess} />
          </div>
        </div>
      )}

      {/* Full-featured Swiggy Instamart Interface Modal */}
      <SwiggyInterfaceModal
        isOpen={showSwiggyModal}
        onClose={() => setShowSwiggyModal(false)}
        initialCartItems={open}
        defaultTab={swiggyDefaultTab}
        onOrderSuccess={handleSwiggyOrderSuccess}
      />
    </div>
  );
}

