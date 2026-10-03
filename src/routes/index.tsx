import { createFileRoute, Link } from "@tanstack/react-router";
import { ScanLine, Sparkles, Clock, Barcode, Boxes, ChefHat, ShoppingCart, HeartPulse, Recycle, ArrowRight, Leaf, Brain, Bell, Utensils } from "lucide-react";
import { Button } from "@/components/ui/button";
import hero from "@/assets/hero-pantry.jpg";
import { foodImages } from "@/lib/pantry-data";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "AI Smart Pantry — Know Your Food. Waste Less." },
      { name: "description", content: "AI Smart Pantry uses image analysis and OCR to track food freshness, expiry and pantry inventory so you waste less." },
      { property: "og:title", content: "AI Smart Pantry — Know Your Food. Waste Less." },
      { property: "og:description", content: "AI-powered food freshness, pantry management & waste reduction." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

const features = [
  { icon: Sparkles, title: "AI Freshness Detection", body: "Snap a photo — get freshness, ripeness and spoilage signs in seconds." },
  { icon: Clock, title: "Smart Expiry Tracking", body: "Every item gets a consume-by date and a gentle nudge before it's too late." },
  { icon: Barcode, title: "OCR & Barcode Scanning", body: "Read printed expiry dates and product details straight from the pack." },
  { icon: Boxes, title: "Intelligent Pantry", body: "A visual inventory sorted by what needs eating first." },
  { icon: ChefHat, title: "AI Recipe Suggestions", body: "Cook what you already have, starting with what expires soonest." },
  { icon: ShoppingCart, title: "Smart Shopping List", body: "Low-stock and missing ingredients added automatically." },
  { icon: HeartPulse, title: "Nutrition & Allergens", body: "See macros and flagged allergens across your whole pantry." },
  { icon: Recycle, title: "Food Waste Reduction", body: "Track food rescued, money saved and carbon avoided." },
];

const steps = [
  { icon: ScanLine, t: "Scan", d: "Photo, label or barcode" },
  { icon: Brain, t: "Understand", d: "AI reads freshness & expiry" },
  { icon: Bell, t: "Track", d: "Alerts before food turns" },
  { icon: Utensils, t: "Consume", d: "Recipes from your pantry" },
  { icon: Leaf, t: "Reduce Waste", d: "Save money & the planet" },
];

function Landing() {
  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 glass border-b">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
          <Link to="/" className="flex items-center gap-2 font-display text-lg font-bold">
            <span className="grid h-8 w-8 place-items-center rounded-xl bg-brand text-primary-foreground"><Leaf className="h-4 w-4" /></span>
            Smart Pantry
          </Link>
          <nav className="hidden items-center gap-8 text-sm text-muted-foreground md:flex">
            <a href="#features" className="hover:text-foreground">Features</a>
            <a href="#how" className="hover:text-foreground">How it works</a>
            <Link to="/app/recipes" className="hover:text-foreground">Recipes</Link>
          </nav>
          <Button asChild size="sm"><Link to="/app">Open app</Link></Button>
        </div>
      </header>

      <section className="relative overflow-hidden bg-hero">
        <div className="mx-auto grid max-w-7xl items-center gap-12 px-4 pb-20 pt-14 sm:px-6 lg:grid-cols-2 lg:pt-20">
          <div className="animate-rise">
            <span className="inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1 text-xs font-semibold text-accent-foreground">
              <Sparkles className="h-3.5 w-3.5 text-primary" /> AI-powered food freshness, pantry management & waste reduction
            </span>
            <h1 className="mt-6 text-5xl font-extrabold leading-[1.02] sm:text-6xl lg:text-7xl">
              Know Your Food.<br /><span className="text-primary">Waste Less.</span>
            </h1>
            <p className="mt-6 max-w-lg text-lg text-muted-foreground">
              AI Smart Pantry uses image analysis and OCR to understand how fresh your food is, when it expires, and what's in your kitchen — so nothing gets forgotten at the back of the fridge.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild variant="hero" size="lg"><Link to="/app/scan"><ScanLine /> Start Scanning</Link></Button>
              <Button asChild variant="outline" size="lg"><Link to="/app/pantry">Explore Pantry <ArrowRight /></Link></Button>
            </div>
            <div className="mt-10 flex items-center gap-6 text-sm text-muted-foreground">
              <div><p className="font-display text-2xl font-bold text-foreground">38%</p>less food thrown out</div>
              <div className="h-10 w-px bg-border" />
              <div><p className="font-display text-2xl font-bold text-foreground">₹850</p>saved per month</div>
            </div>
          </div>

          <div className="relative mx-auto w-full max-w-lg animate-rise [animation-delay:150ms]">
            <div className="overflow-hidden rounded-[2rem] shadow-lift">
              <img src={hero} alt="Fresh produce on an open pantry shelf" width={1024} height={1152} className="h-[520px] w-full object-cover" />
            </div>
            <FloatCard className="-left-6 top-10 animate-float" img={foodImages.tomatoes} title="Tomato" sub="92% Fresh" tone="text-fresh" />
            <FloatCard className="-right-4 top-40 animate-float-slow [animation-delay:1s]" img={foodImages.milk} title="Milk" sub="Expires in 2 days" tone="text-warn" />
            <div className="absolute -left-4 bottom-24 animate-float-slow [animation-delay:2s] glass rounded-2xl border p-3 shadow-lift">
              <p className="text-xs text-muted-foreground">Needs attention</p>
              <p className="font-display font-bold"><span className="text-spoiled">3</span> items</p>
            </div>
            <div className="absolute -right-2 bottom-8 animate-float [animation-delay:.5s] rounded-2xl bg-brand p-4 text-primary-foreground shadow-lift">
              <p className="text-xs opacity-80">Saved this month</p>
              <p className="font-display text-2xl font-bold">₹420</p>
            </div>
          </div>
        </div>
      </section>

      <section id="features" className="mx-auto max-w-7xl px-4 py-24 sm:px-6">
        <div className="max-w-2xl">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">Everything in one kitchen brain</p>
          <h2 className="mt-3 text-4xl font-bold">Smarter than a fridge magnet.</h2>
        </div>
        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {features.map((f, i) => (
            <div key={f.title} className="card-surface lift animate-rise p-6" style={{ animationDelay: `${i * 60}ms` }}>
              <div className="grid h-11 w-11 place-items-center rounded-2xl bg-primary-soft text-primary"><f.icon className="h-5 w-5" /></div>
              <h3 className="mt-5 font-semibold">{f.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="how" className="bg-surface py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <h2 className="text-center text-4xl font-bold">How it works</h2>
          <p className="mx-auto mt-3 max-w-md text-center text-muted-foreground">From the grocery bag to your plate — with nothing lost along the way.</p>
          <div className="relative mt-16 grid gap-6 md:grid-cols-5">
            <svg className="pointer-events-none absolute left-0 right-0 top-10 hidden h-2 w-full md:block" preserveAspectRatio="none">
              <line x1="10%" y1="4" x2="90%" y2="4" className="stroke-primary/40 animate-dash" strokeWidth="2" strokeDasharray="6 6" />
            </svg>
            {steps.map((s, i) => (
              <div key={s.t} className="relative flex flex-col items-center text-center animate-rise" style={{ animationDelay: `${i * 120}ms` }}>
                <div className="relative grid h-20 w-20 place-items-center rounded-3xl border bg-card text-primary shadow-soft">
                  <s.icon className="h-7 w-7" />
                  <span className="absolute -right-2 -top-2 grid h-6 w-6 place-items-center rounded-full bg-primary text-xs font-bold text-primary-foreground">{i + 1}</span>
                </div>
                <h3 className="mt-4 font-semibold">{s.t}</h3>
                <p className="text-sm text-muted-foreground">{s.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-24 sm:px-6">
        <div className="relative overflow-hidden rounded-[2rem] bg-brand px-8 py-16 text-center text-primary-foreground shadow-lift">
          <h2 className="text-4xl font-bold">Your pantry, finally paying attention.</h2>
          <p className="mx-auto mt-3 max-w-md opacity-85">Scan your first item in under ten seconds.</p>
          <Button asChild size="lg" variant="outline" className="mt-8 border-transparent text-foreground"><Link to="/app/scan"><ScanLine /> Start Scanning</Link></Button>
        </div>
      </section>

      <footer className="border-t py-10 text-center text-sm text-muted-foreground">AI Smart Pantry · Freshness estimates are guidance — always trust your senses too.</footer>
    </div>
  );
}

function FloatCard({ className, img, title, sub, tone }: { className: string; img: string; title: string; sub: string; tone: string }) {
  return (
    <div className={`absolute flex items-center gap-3 glass rounded-2xl border p-2.5 pr-4 shadow-lift ${className}`}>
      <img src={img} alt="" width={816} height={816} className="h-11 w-11 rounded-xl object-cover" />
      <div>
        <p className="text-sm font-semibold">{title}</p>
        <p className={`text-xs font-semibold ${tone}`}>{sub}</p>
      </div>
    </div>
  );
}
