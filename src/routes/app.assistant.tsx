import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Send, Sparkles, Leaf } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePantry } from "@/lib/pantry-store";
import { recipes, type PantryItem } from "@/lib/pantry-data";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app/assistant")({
  head: () => ({ meta: [{ title: "Pantry AI — AI Smart Pantry" }, { name: "description", content: "Chat with Pantry AI about what to eat, buy and use first." }, { property: "og:title", content: "Pantry AI — AI Smart Pantry" }, { property: "og:description", content: "Your kitchen assistant." }] }),
  component: Assistant,
});

const prompts = ["What should I eat today?", "What is expiring soon?", "Give me a recipe using tomatoes and potatoes.", "What should I buy this week?", "How can I reduce food waste?", "Which foods should I consume first?"];

function reply(q: string, items: PantryItem[], shop: string[]) {
  const s = q.toLowerCase();
  const soon = items.filter((i) => i.expiresInDays >= 0 && i.expiresInDays <= 3).sort((a, b) => a.expiresInDays - b.expiresInDays);
  const list = (xs: PantryItem[]) => xs.map((i) => `• ${i.name} — ${i.expiresInDays === 0 ? "today" : `${i.expiresInDays} day(s)`} (${i.freshness}% fresh)`).join("\n");
  if (s.includes("expir") || s.includes("first")) return soon.length ? `These need eating first:\n${list(soon)}\n\nTip: cook the spinach tonight — it's closest to turning.` : "Nothing is expiring in the next 3 days. 🎉";
  if (s.includes("tomato") && s.includes("potato")) { const r = recipes.find((x) => x.id === "aloo-tamatar")!; return `Try **${r.name}** (${r.time} min, ${r.difficulty}).\n\n${r.steps.map((x, i) => `${i + 1}. ${x}`).join("\n")}\n\nIt rescues your tomatoes before they soften.`; }
  if (s.includes("buy")) return `Here's what I'd pick up this week:\n${shop.slice(0, 6).map((x) => `• ${x}`).join("\n")}\n\nI've left out anything you already have plenty of.`;
  if (s.includes("waste")) return "Three quick wins for your kitchen:\n• Store bananas away from apples — apples speed up ripening.\n• Keep milk at the back of the fridge, not the door.\n• Plan one \"use-it-up\" meal a week from items under 60% freshness.\n\nYou've already cut waste 38% this month — keep going!";
  if (s.includes("eat") || s.includes("today")) return `With what's in your pantry, I'd suggest:\n• Breakfast: Spinach Masala Omelette (uses eggs, spinach, tomatoes)\n• Lunch: Aloo Tamatar Sabzi\n• Dinner: Palak Paneer\n\nThat uses ${soon.length} items that are close to expiry.`;
  return `You have ${items.length} items in your pantry, ${soon.length} of which need attention soon. Ask me about recipes, expiry, shopping or reducing waste.`;
}

interface Msg { role: "user" | "ai"; text: string }

function Assistant() {
  const { items, shopping } = usePantry();
  const [msgs, setMsgs] = useState<Msg[]>([{ role: "ai", text: "Hi Nilam, I'm Pantry AI. I can see your pantry — ask me what to cook, what's expiring, or what to buy." }]);
  const [input, setInput] = useState("");
  const [typing, setTyping] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => end.current?.scrollIntoView({ behavior: "smooth" }), [msgs, typing]);

  const send = (q: string) => {
    if (!q.trim() || typing) return;
    setMsgs((m) => [...m, { role: "user", text: q }]); setInput(""); setTyping(true);
    setTimeout(() => { setMsgs((m) => [...m, { role: "ai", text: reply(q, items, shopping.filter((x) => !x.done).map((x) => `${x.name} (${x.qty})`)) }]); setTyping(false); }, 900);
  };

  return (
    <div className="mx-auto flex h-[calc(100vh-11rem)] max-w-3xl flex-col lg:h-[calc(100vh-8rem)]">
      <div className="mb-4 flex items-center gap-3">
        <span className="grid h-11 w-11 place-items-center rounded-2xl bg-brand text-primary-foreground shadow-soft"><Sparkles className="h-5 w-5" /></span>
        <div><h1 className="text-2xl font-bold">Pantry AI</h1><p className="text-xs text-muted-foreground">Knows your {items.length} pantry items</p></div>
      </div>
      <div className="no-scrollbar -mx-4 mb-4 flex gap-2 overflow-x-auto px-4">
        {prompts.map((p) => <button key={p} onClick={() => send(p)} className="shrink-0 rounded-full border bg-card px-3.5 py-2 text-sm hover:border-primary hover:text-primary">{p}</button>)}
      </div>
      <div className="card-surface flex-1 space-y-4 overflow-y-auto p-4 sm:p-6">
        {msgs.map((m, i) => (
          <div key={i} className={cn("flex gap-3 animate-rise", m.role === "user" && "flex-row-reverse")}>
            {m.role === "ai" && <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary-soft text-primary"><Leaf className="h-4 w-4" /></span>}
            <div className={cn("max-w-[85%] whitespace-pre-line rounded-3xl px-4 py-3 text-sm leading-relaxed", m.role === "user" ? "rounded-br-md bg-primary text-primary-foreground" : "rounded-bl-md bg-surface")}>
              {m.text.split("**").map((t, j) => (j % 2 ? <b key={j}>{t}</b> : t))}
            </div>
          </div>
        ))}
        {typing && <div className="flex gap-3"><span className="grid h-8 w-8 place-items-center rounded-full bg-primary-soft text-primary"><Leaf className="h-4 w-4" /></span><div className="flex gap-1 rounded-3xl bg-surface px-4 py-4">{[0, 150, 300].map((d) => <span key={d} className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground" style={{ animationDelay: `${d}ms` }} />)}</div></div>}
        <div ref={end} />
      </div>
      <form onSubmit={(e) => { e.preventDefault(); send(input); }} className="mt-4 flex gap-2">
        <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask Pantry AI…" className="h-12 flex-1 rounded-full border bg-card px-5 text-sm outline-none focus:ring-2 focus:ring-ring" />
        <Button type="submit" size="icon" className="h-12 w-12" aria-label="Send"><Send /></Button>
      </form>
    </div>
  );
}
