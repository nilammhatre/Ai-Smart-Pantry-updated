import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Send, Sparkles, Leaf } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePantry } from "@/lib/pantry-store";
import { cn } from "@/lib/utils";
import { queryPantryAssistant } from "@/services/aiAssistantService";

export const Route = createFileRoute("/app/assistant")({
  head: () => ({ meta: [{ title: "Pantry AI — AI Smart Pantry" }, { name: "description", content: "Chat with Pantry AI about what to eat, buy and use first." }, { property: "og:title", content: "Pantry AI — AI Smart Pantry" }, { property: "og:description", content: "Your kitchen assistant." }] }),
  component: Assistant,
});

const prompts = [
  "What should I eat today?",
  "What is expiring soon?",
  "Give me a recipe using tomatoes and potatoes.",
  "What should I buy this week?",
  "How can I reduce food waste?",
  "Which foods should I consume first?"
];

interface Msg { role: "user" | "ai"; text: string }

function Assistant() {
  const { items, shopping } = usePantry();
  const [msgs, setMsgs] = useState<Msg[]>([
    { role: "ai", text: "Hi Nilam, I'm Pantry AI. I can see your pantry — ask me what to cook, what's expiring, or what to buy." }
  ]);
  const [input, setInput] = useState("");
  const [typing, setTyping] = useState(false);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => end.current?.scrollIntoView({ behavior: "smooth" }), [msgs, typing]);

  const send = async (q: string) => {
    if (!q.trim() || typing) return;
    setMsgs((m) => [...m, { role: "user", text: q }]);
    setInput("");
    setTyping(true);

    try {
      const replyText = await queryPantryAssistant(
        q,
        items,
        shopping.filter((x) => !x.done).map((x) => `${x.name} (${x.qty})`)
      );
      setMsgs((m) => [...m, { role: "ai", text: replyText }]);
    } catch {
      setMsgs((m) => [...m, { role: "ai", text: "I'm having trouble analyzing your pantry right now. Please try again." }]);
    } finally {
      setTyping(false);
    }
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
