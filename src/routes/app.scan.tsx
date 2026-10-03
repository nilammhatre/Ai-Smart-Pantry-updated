import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Camera, Upload, ScanLine, Tag, ScanBarcode, PencilLine, RotateCcw, Plus, Sparkles, Info, CheckCircle2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { usePantry } from "@/lib/pantry-store";
import { categories, foodImages, shelfLifeGuess, statusFor, dateFromNow, type Category, type PantryItem, type Storage } from "@/lib/pantry-data";
import { PageHeader, Ring, StatusBadge } from "@/components/pantry/ui";
import { cn } from "@/lib/utils";

type Tab = "photo" | "label" | "barcode" | "manual";
export const Route = createFileRoute("/app/scan")({
  validateSearch: (s: Record<string, unknown>): { tab?: Tab } => ({ tab: (["photo", "label", "barcode", "manual"] as Tab[]).includes(s.tab as Tab) ? (s.tab as Tab) : undefined }),
  head: () => ({ meta: [{ title: "Scan Food — AI Smart Pantry" }, { name: "description", content: "Scan food photos, expiry labels or barcodes to add items with AI." }, { property: "og:title", content: "Scan Food — AI Smart Pantry" }, { property: "og:description", content: "AI freshness detection, OCR and barcode scanning." }] }),
  component: Scan,
});

const tabs: { id: Tab; label: string; icon: typeof Camera }[] = [
  { id: "photo", label: "AI Freshness", icon: Sparkles },
  { id: "label", label: "Expiry Label", icon: Tag },
  { id: "barcode", label: "Barcode", icon: ScanBarcode },
  { id: "manual", label: "Add Manually", icon: PencilLine },
];

function Scan() {
  const { tab = "photo" } = Route.useSearch();
  const nav = useNavigate({ from: "/app/scan" });
  return (
    <div>
      <PageHeader eyebrow="Scanner" title="Scan your food" subtitle="Point, snap, done. Our AI reads freshness, labels and barcodes." />
      <div className="no-scrollbar mb-8 flex gap-1 overflow-x-auto rounded-full border bg-card p-1 sm:inline-flex">
        {tabs.map((t) => (
          <button key={t.id} onClick={() => nav({ search: { tab: t.id } })} className={cn("flex shrink-0 items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-colors", tab === t.id ? "bg-primary text-primary-foreground shadow-soft" : "text-muted-foreground hover:text-foreground")}>
            <t.icon className="h-4 w-4" />{t.label}
          </button>
        ))}
      </div>
      <div key={tab} className="animate-rise">
        {tab === "photo" && <PhotoScan />}
        {tab === "label" && <LabelScan />}
        {tab === "barcode" && <BarcodeScan />}
        {tab === "manual" && <ManualAdd />}
      </div>
    </div>
  );
}

function useAddAndToast() {
  const { addItem, addHistory } = usePantry();
  const nav = useNavigate();
  return (item: PantryItem, method: "Photo" | "Label" | "Barcode" | null, result: string) => {
    addItem(item);
    if (method) addHistory({ id: crypto.randomUUID(), name: item.name, image: item.image, date: "Just now", freshness: item.freshness, result, action: "Added to pantry", method });
    toast.success(`${item.name} added to your pantry.`, { icon: <CheckCircle2 className="h-4 w-4" /> });
    nav({ to: "/app/pantry" });
  };
}

function Dropzone({ onFile, children, scanning, preview, mode }: { onFile: (url: string, name: string) => void; children?: ReactNode; scanning: boolean; preview?: string; mode: "photo" | "label" | "barcode" }) {
  const ref = useRef<HTMLInputElement>(null);
  const camRef = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const handle = (f?: File) => f && onFile(URL.createObjectURL(f), f.name);
  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
      onDrop={(e) => { e.preventDefault(); setDrag(false); handle(e.dataTransfer.files[0]); }}
      className={cn("relative grid aspect-[4/3] place-items-center overflow-hidden rounded-[2rem] border-2 border-dashed bg-surface scan-grid transition-colors", drag && "border-primary bg-primary-soft")}
    >
      {preview && <img src={preview} alt="Scan preview" className="absolute inset-0 h-full w-full object-cover" />}
      {/* corner brackets */}
      {["left-5 top-5 border-l-4 border-t-4 rounded-tl-2xl", "right-5 top-5 border-r-4 border-t-4 rounded-tr-2xl", "left-5 bottom-5 border-l-4 border-b-4 rounded-bl-2xl", "right-5 bottom-5 border-r-4 border-b-4 rounded-br-2xl"].map((c) => <span key={c} className={cn("absolute h-10 w-10 border-primary", c)} />)}
      {(scanning || !preview) && <span className="absolute inset-x-8 h-0.5 rounded-full bg-primary shadow-[0_0_24px_4px] shadow-primary/60 animate-scan" />}
      {mode === "label" && scanning && <div className="absolute inset-x-10 top-1/2 h-16 -translate-y-1/2 rounded-lg border-2 border-primary/70 bg-primary/10" />}
      {!preview && (
        <div className="relative z-10 flex flex-col items-center gap-4 px-6 text-center">
          <div className="grid h-16 w-16 place-items-center rounded-3xl bg-card text-primary shadow-soft">
            {mode === "barcode" ? <ScanBarcode className="h-7 w-7" /> : mode === "label" ? <Tag className="h-7 w-7" /> : <Camera className="h-7 w-7" />}
          </div>
          <div>
            <p className="font-display text-lg font-semibold">{mode === "barcode" ? "Line up the barcode" : mode === "label" ? "Capture the expiry label" : "Drop a food photo here"}</p>
            <p className="text-sm text-muted-foreground">Drag & drop, upload, or use your camera. Multiple items supported.</p>
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            <Button onClick={() => camRef.current?.click()}><Camera /> Camera</Button>
            <Button variant="outline" onClick={() => ref.current?.click()}><Upload /> Upload</Button>
          </div>
          {children}
        </div>
      )}
      {scanning && <div className="absolute bottom-6 left-1/2 z-10 -translate-x-1/2 glass rounded-full border px-4 py-2 text-sm font-medium"><Sparkles className="mr-1.5 inline h-4 w-4 text-primary" />Analyzing…</div>}
      <input ref={ref} type="file" accept="image/*" hidden onChange={(e) => handle(e.target.files?.[0])} />
      <input ref={camRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => handle(e.target.files?.[0])} />
    </div>
  );
}

const samples = [
  { key: "apples", name: "Apple", cat: "Fruits" as Category, fresh: 94, ripe: "Ready to eat", life: 6 },
  { key: "tomatoes", name: "Tomato", cat: "Vegetables" as Category, fresh: 92, ripe: "Ripe", life: 4 },
  { key: "bananas", name: "Banana", cat: "Fruits" as Category, fresh: 68, ripe: "Fully ripe — eat soon", life: 2 },
  { key: "spinach", name: "Spinach", cat: "Vegetables" as Category, fresh: 57, ripe: "Wilting slightly", life: 1 },
];

function PhotoScan() {
  const [preview, setPreview] = useState<string>();
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState<(typeof samples)[number] | null>(null);
  const add = useAddAndToast();

  const start = (url: string, name: string) => {
    setPreview(url); setResult(null); setScanning(true);
    const hit = samples.find((s) => name.toLowerCase().includes(s.key.slice(0, 4))) ?? samples[Math.floor(Math.random() * samples.length)];
    setTimeout(() => { setScanning(false); setResult(hit); }, 2200);
  };
  const reset = () => { setPreview(undefined); setResult(null); };
  const status = result ? statusFor(result.fresh, result.life) : "Fresh";

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Dropzone onFile={start} scanning={scanning} preview={preview} mode="photo">
        <div className="flex gap-2 pt-2">
          {samples.slice(0, 3).map((s) => (
            <button key={s.key} onClick={() => start(foodImages[s.key as keyof typeof foodImages], s.key)} className="overflow-hidden rounded-xl ring-2 ring-transparent hover:ring-primary" title={`Try ${s.name}`}>
              <img src={foodImages[s.key as keyof typeof foodImages]} alt={s.name} className="h-12 w-12 object-cover" />
            </button>
          ))}
        </div>
      </Dropzone>

      <div className="card-surface p-6">
        {!result ? (
          scanning ? (
            <div className="space-y-4">{[60, 40, 80, 50, 70].map((w, i) => <div key={i} className="skeleton-shimmer h-5 rounded" style={{ width: `${w}%` }} />)}</div>
          ) : (
            <div className="flex h-full flex-col justify-center gap-3 text-center text-muted-foreground">
              <Sparkles className="mx-auto h-8 w-8 text-primary" />
              <p className="font-display text-lg font-semibold text-foreground">AI analysis appears here</p>
              <p className="text-sm">Try one of the sample photos to see how it works.</p>
            </div>
          )
        ) : (
          <div className="space-y-6 animate-rise">
            <div className="flex items-center gap-5">
              <Ring value={result.fresh} status={status} size={120} label={<div><p className="font-display text-3xl font-bold">{result.fresh}%</p><p className="text-[10px] text-muted-foreground">fresh</p></div>} />
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-primary">Detected</p>
                <h2 className="text-3xl font-bold">{result.name}</h2>
                <p className="text-sm text-muted-foreground">{result.cat}</p>
                <StatusBadge status={status} className="mt-2" />
              </div>
            </div>
            <dl className="grid grid-cols-2 gap-3 text-sm">
              {[["Ripeness", result.ripe], ["Shelf life", `${result.life} days`], ["Consume by", dateFromNow(result.life)], ["Bruises", result.fresh > 80 ? "None" : "Minor"], ["Mold", "Not detected"], ["Rot", result.fresh < 60 ? "Early signs" : "Not detected"]].map(([k, v]) => (
                <div key={k} className="rounded-2xl bg-surface p-3"><dt className="text-xs text-muted-foreground">{k}</dt><dd className="font-semibold">{v}</dd></div>
              ))}
            </dl>
            <div className="flex flex-wrap gap-1.5">{["Color uniform", "Skin intact", result.fresh > 80 ? "Firm texture" : "Soft spots"].map((q) => <span key={q} className="rounded-full bg-primary-soft px-2.5 py-1 text-xs font-medium text-accent-foreground">{q}</span>)}</div>
            <p className="flex gap-2 rounded-2xl bg-muted p-3 text-xs text-muted-foreground"><Info className="h-4 w-4 shrink-0" />AI freshness is an estimate. Always use your own judgment — look, smell and feel before eating.</p>
            <div className="flex gap-2">
              <Button className="flex-1" onClick={() => add({ id: crypto.randomUUID(), name: result.name + "s", category: result.cat, quantity: "1 pack", freshness: result.fresh, addedDaysAgo: 0, expiresInDays: result.life, storage: "Refrigerator", image: foodImages[result.key as keyof typeof foodImages], allergens: [], nutrition: { calories: 50, protein: 1, carbs: 10, fat: 0.2, fiber: 2, nutrients: ["Vitamin C"] } }, "Photo", `${result.ripe} · ${result.fresh}% fresh`)}><Plus /> Add to Pantry</Button>
              <Button variant="outline" onClick={reset}><RotateCcw /> Scan Again</Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function LabelScan() {
  const [preview, setPreview] = useState<string>();
  const [scanning, setScanning] = useState(false);
  const [data, setData] = useState<{ product: string; expiry: string; mfg: string; best: string; qty: string } | null>(null);
  const add = useAddAndToast();
  const start = (url: string) => { setPreview(url); setScanning(true); setData(null); setTimeout(() => { setScanning(false); setData({ product: "Amul Milk", expiry: "2026-10-08", mfg: "2026-10-01", best: "2026-10-07", qty: "1 litre" }); }, 2400); };
  const days = data ? Math.round((new Date(data.expiry).getTime() - Date.now()) / 864e5) : 0;
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Dropzone onFile={start} scanning={scanning} preview={preview} mode="label">
        <Button variant="link" onClick={() => start(foodImages.milk)}>Try a sample label</Button>
      </Dropzone>
      <div className="card-surface p-6">
        {!data ? (
          <div className="flex h-full flex-col justify-center gap-3 text-center text-muted-foreground">
            <Tag className="mx-auto h-8 w-8 text-primary" />
            <p className="font-display text-lg font-semibold text-foreground">{scanning ? "Reading the label…" : "We'll read the label for you"}</p>
            <p className="text-sm">Expiry, best before, manufacturing date, product and quantity.</p>
          </div>
        ) : (
          <div className="space-y-4 animate-rise">
            <p className="flex items-center gap-2 text-sm font-semibold text-primary"><CheckCircle2 className="h-4 w-4" />Detected — please confirm</p>
            <Field label="Product"><Input value={data.product} onChange={(e) => setData({ ...data, product: e.target.value })} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Expiry date"><Input type="date" value={data.expiry} onChange={(e) => setData({ ...data, expiry: e.target.value })} /></Field>
              <Field label="Best before"><Input type="date" value={data.best} onChange={(e) => setData({ ...data, best: e.target.value })} /></Field>
              <Field label="Manufactured"><Input type="date" value={data.mfg} onChange={(e) => setData({ ...data, mfg: e.target.value })} /></Field>
              <Field label="Quantity"><Input value={data.qty} onChange={(e) => setData({ ...data, qty: e.target.value })} /></Field>
            </div>
            <Button className="w-full" onClick={() => add({ id: crypto.randomUUID(), name: data.product, category: "Dairy", quantity: data.qty, freshness: 90, addedDaysAgo: 0, expiresInDays: days, storage: "Refrigerator", image: foodImages.milk, allergens: ["Milk"], nutrition: { calories: 58, protein: 3.1, carbs: 4.8, fat: 3, fiber: 0, nutrients: ["Calcium"] } }, "Label", "Expiry read from label")}>Confirm & Add to Pantry</Button>
          </div>
        )}
      </div>
    </div>
  );
}

function BarcodeScan() {
  const [scanning, setScanning] = useState(false);
  const [p, setP] = useState<null | { name: string; brand: string; category: Category; qty: string; expiry: string; storage: string; allergens: string[] }>(null);
  const add = useAddAndToast();
  const start = () => { setScanning(true); setP(null); setTimeout(() => { setScanning(false); setP({ name: "Whole Wheat Atta", brand: "Aashirvaad", category: "Grains", qty: "1 kg", expiry: "2027-03-01", storage: "Store in a cool, dry place. Use within 1 month of opening.", allergens: ["Gluten"] }); }, 1800); };
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Dropzone onFile={start} scanning={scanning} mode="barcode"><Button variant="link" onClick={start}>Simulate a barcode scan</Button></Dropzone>
      <div className="card-surface p-6">
        {!p ? (
          <div className="flex h-full flex-col justify-center gap-3 text-center text-muted-foreground">
            <ScanBarcode className="mx-auto h-8 w-8 text-primary" />
            <p className="font-display text-lg font-semibold text-foreground">{scanning ? "Looking up product…" : "Product details appear here"}</p>
          </div>
        ) : (
          <div className="space-y-4 animate-rise">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Product"><Input value={p.name} onChange={(e) => setP({ ...p, name: e.target.value })} /></Field>
              <Field label="Brand"><Input value={p.brand} onChange={(e) => setP({ ...p, brand: e.target.value })} /></Field>
              <Field label="Quantity"><Input value={p.qty} onChange={(e) => setP({ ...p, qty: e.target.value })} /></Field>
              <Field label="Expiry"><Input type="date" value={p.expiry} onChange={(e) => setP({ ...p, expiry: e.target.value })} /></Field>
            </div>
            <div className="grid grid-cols-5 gap-2 text-center">
              {[["kcal", 341], ["Protein", "12g"], ["Carbs", "69g"], ["Fat", "1.7g"], ["Fiber", "11g"]].map(([k, v]) => <div key={k} className="rounded-xl bg-surface p-2"><p className="font-display font-bold">{v}</p><p className="text-[10px] text-muted-foreground">{k}</p></div>)}
            </div>
            <p className="flex items-center gap-2 text-sm"><AlertTriangle className="h-4 w-4 text-spoiled" />Contains: <b className="text-spoiled">{p.allergens.join(", ")}</b></p>
            <p className="rounded-2xl bg-muted p-3 text-sm text-muted-foreground">{p.storage}</p>
            <Button className="w-full" onClick={() => add({ id: crypto.randomUUID(), name: `${p.brand} ${p.name}`, category: p.category, quantity: p.qty, freshness: 98, addedDaysAgo: 0, expiresInDays: Math.round((new Date(p.expiry).getTime() - Date.now()) / 864e5), storage: "Pantry shelf", allergens: p.allergens, nutrition: { calories: 341, protein: 12, carbs: 69, fat: 1.7, fiber: 11, nutrients: ["Fiber", "Iron"] } }, "Barcode", "Barcode matched")}><Plus /> Add to Pantry</Button>
          </div>
        )}
      </div>
    </div>
  );
}

function ManualAdd() {
  const add = useAddAndToast();
  const [f, setF] = useState({ name: "", category: "Vegetables" as Category, qty: "", purchase: new Date().toISOString().slice(0, 10), expiry: "", storage: "Refrigerator" as Storage, notes: "" });
  const [image, setImage] = useState<string>();
  const [accepted, setAccepted] = useState(false);
  const range = shelfLifeGuess[f.category];
  useEffect(() => setAccepted(false), [f.category, f.name]);
  const acceptGuess = () => {
    const d = new Date(); d.setDate(d.getDate() + range[0]);
    setF({ ...f, expiry: d.toISOString().slice(0, 10) }); setAccepted(true);
  };
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!f.name.trim()) { toast.error("Give your food a name first."); return; }
    const days = f.expiry ? Math.round((new Date(f.expiry).getTime() - Date.now()) / 864e5) : range[0];
    add({ id: crypto.randomUUID(), name: f.name, category: f.category, quantity: f.qty || "1", freshness: 95, addedDaysAgo: 0, expiresInDays: days, storage: f.storage, image, notes: f.notes, allergens: [], nutrition: { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, nutrients: [] } }, null, "");
  };
  return (
    <form onSubmit={submit} className="card-surface mx-auto grid max-w-3xl gap-5 p-6 sm:grid-cols-2 sm:p-8">
      <Field label="Food / product name" className="sm:col-span-2"><Input placeholder="e.g. Capsicum" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
      <Field label="Category">
        <Select value={f.category} onValueChange={(v) => setF({ ...f, category: v as Category })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{categories.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select>
      </Field>
      <Field label="Quantity"><Input placeholder="e.g. 500 g" value={f.qty} onChange={(e) => setF({ ...f, qty: e.target.value })} /></Field>
      <Field label="Purchase date"><Input type="date" value={f.purchase} onChange={(e) => setF({ ...f, purchase: e.target.value })} /></Field>
      <Field label="Expiry / consume-by"><Input type="date" value={f.expiry} onChange={(e) => setF({ ...f, expiry: e.target.value })} /></Field>
      {f.name.length > 1 && (
        <div className={cn("flex flex-col gap-3 rounded-2xl border p-4 animate-rise sm:col-span-2 sm:flex-row sm:items-center", accepted ? "border-primary bg-primary-soft" : "bg-surface")}>
          <Sparkles className="h-5 w-5 shrink-0 text-primary" />
          <p className="flex-1 text-sm">Based on this food, estimated shelf life is <b>{range[0]}–{range[1]} days</b>.</p>
          <Button type="button" size="sm" variant={accepted ? "soft" : "default"} onClick={acceptGuess}>{accepted ? "Applied" : "Accept"}</Button>
        </div>
      )}
      <Field label="Storage location">
        <Select value={f.storage} onValueChange={(v) => setF({ ...f, storage: v as Storage })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{["Refrigerator", "Freezer", "Pantry shelf", "Counter"].map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select>
      </Field>
      <Field label="Food image">
        <label className="flex h-10 cursor-pointer items-center gap-2 rounded-md border bg-card px-3 text-sm text-muted-foreground hover:bg-secondary">
          {image ? <img src={image} alt="" className="h-6 w-6 rounded object-cover" /> : <Upload className="h-4 w-4" />}{image ? "Change photo" : "Upload photo"}
          <input type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && setImage(URL.createObjectURL(e.target.files[0]))} />
        </label>
      </Field>
      <Field label="Notes" className="sm:col-span-2"><Textarea placeholder="Optional" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
      <Button type="submit" size="lg" className="sm:col-span-2"><ScanLine /> Add to Pantry</Button>
    </form>
  );
}

function Field({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return <div className={cn("space-y-1.5", className)}><Label className="text-xs font-semibold text-muted-foreground">{label}</Label>{children}</div>;
}
