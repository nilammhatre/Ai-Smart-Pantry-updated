import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Camera, Upload, ScanLine, Tag, ScanBarcode, PencilLine, RotateCcw, Plus, Sparkles, Info, CheckCircle2, AlertTriangle, ShieldAlert, ShoppingBag } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { usePantry } from "@/lib/pantry-store";
import { categories, foodImages, statusFor, dateFromNow, type Category, type PantryItem, type Storage } from "@/lib/pantry-data";
import { PageHeader, Ring, StatusBadge } from "@/components/pantry/ui";
import { cn } from "@/lib/utils";
import { identifyAndAnalyzeFood, recalculateForCorrectedFood } from "@/services/foodIdentificationService";
import { scanFoodLabelOCR } from "@/services/ocrService";
import { processBarcodePipeline, startBarcodeCamera } from "@/services/barcodeDecoderService";
import { scanFoodWithGemini, type GeminiScanFoodItem } from "@/services/geminiService";
import ImportDemoOrder from "@/components/pantry/ImportDemoOrder";
import EndToEndDemo from "@/components/pantry/EndToEndDemo";
import { calculateShelfLife } from "@/services/shelfLifeEngine.js";
import { swiggyService } from "@/services/swiggy/swiggyService";

type Tab = "photo" | "label" | "barcode" | "instamart" | "manual";

export const Route = createFileRoute("/app/scan")({
  validateSearch: (s: Record<string, unknown>): { tab?: Tab } => ({
    tab: (["photo", "label", "barcode", "instamart", "manual"] as Tab[]).includes(s.tab as Tab) ? (s.tab as Tab) : undefined
  }),
  head: () => ({
    meta: [
      { title: "Scan Food — AI Smart Pantry" },
      { name: "description", content: "Scan food photos, expiry labels or barcodes to add items with Gemini AI." },
      { property: "og:title", content: "Scan Food — AI Smart Pantry" },
      { property: "og:description", content: "AI freshness detection, OCR and barcode scanning." }
    ]
  }),
  component: Scan,
});

const tabs: { id: Tab; label: string; icon: typeof Camera }[] = [
  { id: "photo", label: "AI Freshness", icon: Sparkles },
  { id: "label", label: "Expiry Label", icon: Tag },
  { id: "barcode", label: "Barcode", icon: ScanBarcode },
  { id: "instamart", label: "Instamart Import", icon: ShoppingBag },
  { id: "manual", label: "Add Manually", icon: PencilLine },
];

function Scan() {
  const { tab = "photo" } = Route.useSearch();
  const nav = useNavigate({ from: "/app/scan" });
  return (
    <div>
      <PageHeader
        eyebrow="Scanner"
        title="Scan your food"
        subtitle="Point, snap, done. Computer Vision & Gemini AI inspects freshness, labels, and barcodes."
      />
      <div className="no-scrollbar mb-8 flex gap-1 overflow-x-auto rounded-full border bg-card p-1 sm:inline-flex">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => nav({ search: { tab: t.id } })}
            className={cn(
              "flex shrink-0 items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-colors",
              tab === t.id ? "bg-primary text-primary-foreground shadow-soft" : "text-muted-foreground hover:text-foreground"
            )}
          >
            <t.icon className="h-4 w-4" />
            {t.label}
          </button>
        ))}
      </div>
      <div key={tab} className="animate-rise">
        {tab === "photo" && <PhotoScan />}
        {tab === "label" && <LabelScan />}
        {tab === "barcode" && <BarcodeScan />}
        {tab === "instamart" && <InstamartScan />}
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
    if (method) {
      addHistory({
        id: crypto.randomUUID(),
        name: item.name,
        image: item.image,
        date: "Just now",
        freshness: item.freshness,
        result,
        action: "Added to pantry",
        method
      });
    }
    toast.success(`${item.name} added to your AI Smart Pantry.`, { icon: <CheckCircle2 className="h-4 w-4" /> });
    nav({ to: "/app/pantry" });
  };
}

function Dropzone({
  onFile,
  children,
  scanning,
  preview,
  mode
}: {
  onFile: (url: string, name: string) => void;
  children?: ReactNode;
  scanning: boolean;
  preview?: string;
  mode: "photo" | "label" | "barcode";
}) {
  const ref = useRef<HTMLInputElement>(null);
  const camRef = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);

  const convertToBase64AndTrigger = (file: File) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      onFile(reader.result as string, file.name);
    };
    reader.readAsDataURL(file);
  };

  const handle = (f?: File) => f && convertToBase64AndTrigger(f);

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDrag(true);
      }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDrag(false);
        if (e.dataTransfer.files?.[0]) {
          handle(e.dataTransfer.files[0]);
        }
      }}
      className={cn(
        "relative grid aspect-[4/3] place-items-center overflow-hidden rounded-[2rem] border-2 border-dashed bg-surface scan-grid transition-colors",
        drag && "border-primary bg-primary-soft"
      )}
    >
      {preview && <img src={preview} alt="Scan preview" className="absolute inset-0 h-full w-full object-cover" />}
      {[
        "left-5 top-5 border-l-4 border-t-4 rounded-tl-2xl",
        "right-5 top-5 border-r-4 border-t-4 rounded-tr-2xl",
        "left-5 bottom-5 border-l-4 border-b-4 rounded-bl-2xl",
        "right-5 bottom-5 border-r-4 border-b-4 rounded-br-2xl"
      ].map((c) => (
        <span key={c} className={cn("absolute h-10 w-10 border-primary", c)} />
      ))}
      {(scanning || !preview) && (
        <span className="absolute inset-x-8 h-0.5 rounded-full bg-primary shadow-[0_0_24px_4px] shadow-primary/60 animate-scan" />
      )}
      {mode === "label" && scanning && (
        <div className="absolute inset-x-10 top-1/2 h-16 -translate-y-1/2 rounded-lg border-2 border-primary/70 bg-primary/10" />
      )}
      {!preview && (
        <div className="relative z-10 flex flex-col items-center gap-4 px-6 text-center">
          <div className="grid h-16 w-16 place-items-center rounded-3xl bg-card text-primary shadow-soft">
            {mode === "barcode" ? <ScanBarcode className="h-7 w-7" /> : mode === "label" ? <Tag className="h-7 w-7" /> : <Camera className="h-7 w-7" />}
          </div>
          <div>
            <p className="font-display text-lg font-semibold">
              {mode === "barcode" ? "Line up the barcode" : mode === "label" ? "Capture the expiry label" : "Drop a food photo here"}
            </p>
            <p className="text-sm text-muted-foreground">Drag & drop, upload, or use your camera.</p>
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            <Button onClick={() => camRef.current?.click()}>
              <Camera /> Camera
            </Button>
            <Button variant="outline" onClick={() => ref.current?.click()}>
              <Upload /> Upload
            </Button>
          </div>
          {children}
        </div>
      )}
      {scanning && (
        <div className="absolute bottom-6 left-1/2 z-10 -translate-x-1/2 glass rounded-full border px-4 py-2 text-sm font-medium">
          <Sparkles className="mr-1.5 inline h-4 w-4 text-primary" /> Inspecting with Computer Vision & Safety Rules...
        </div>
      )}
      <input ref={ref} type="file" accept="image/*" hidden onChange={(e) => handle(e.target.files?.[0])} />
      <input ref={camRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => handle(e.target.files?.[0])} />
    </div>
  );
}

const samples = [
  { key: "apples", name: "Apple", cat: "Fruits" as Category },
  { key: "tomatoes", name: "Tomato", cat: "Vegetables" as Category },
  { key: "bananas", name: "Banana", cat: "Fruits" as Category },
  { key: "spinach", name: "Spinach", cat: "Vegetables" as Category },
];

function PhotoScan() {
  const [preview, setPreview] = useState<string>();
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [detectedList, setDetectedList] = useState<GeminiScanFoodItem[]>([]);
  const [qualityError, setQualityError] = useState<string | null>(null);

  // User correction states
  const [isEditing, setIsEditing] = useState(false);
  const [editedName, setEditedName] = useState("");
  const [editedCategory, setEditedCategory] = useState<Category>("Vegetables");

  const add = useAddAndToast();

  const start = async (url: string, name?: string) => {
    setPreview(url);
    setResult(null);
    setDetectedList([]);
    setQualityError(null);
    setIsEditing(false);
    setScanning(true);

    try {
      // 1. Send photo to Gemini (gemini-2.5-flash) with structured JSON schema
      const geminiRes = await scanFoodWithGemini(url);

      if (geminiRes.success && geminiRes.items.length > 0) {
        setDetectedList(geminiRes.items);

        const first = geminiRes.items[0];
        const isFirstSpoiled = first.condition === "Spoiled" || first.estimated_shelf_life_days <= 0;
        setResult({
          foodName: first.name,
          category: first.category,
          quantity: first.quantity,
          storage: isFirstSpoiled ? "Discard safely — not safe for consumption" : first.storage,
          remainingDays: first.estimated_shelf_life_days,
          shelfLifeEstimate: isFirstSpoiled ? "Immediate (Expired)" : `${first.estimated_shelf_life_days} days`,
          expiryDate: isFirstSpoiled ? "Immediate (Expired)" : first.expiry_date,
          consumeByDate: isFirstSpoiled ? "Immediate (Expired)" : first.expiry_date,
          freshnessScore: first.freshness_score,
          condition: first.condition,
          aiExplanation: first.visual_notes,
          identificationConfidence: 96,
          isUncertain: false,
          visibleIssues: isFirstSpoiled ? ["Signs of spoilage detected"] : (first.spoilage_markers ? first.spoilage_markers.filter((m: string) => m !== "none") : []),
          recommendation: isFirstSpoiled ? "Discard safely — not safe for consumption" : `Store in ${first.storage}`,
          spoilageRisk: isFirstSpoiled ? "high" : "low",
          metadata: {
            allergens: first.allergens,
            nutrition: {
              calories: first.macros_per_100g.calories,
              protein: first.macros_per_100g.protein,
              carbs: first.macros_per_100g.carbs,
              fat: first.macros_per_100g.fat,
              fiber: first.macros_per_100g.fiber,
              nutrients: []
            }
          },
          geminiData: first
        });
        setEditedName(first.name);
        setEditedCategory(first.category as Category);
        setScanning(false);
        return;
      }

      // 2. Fallback to local multi-stage pipeline
      const fullRes = await identifyAndAnalyzeFood({
        imageBase64: url,
        mode: "photo",
        userSuppliedName: ""
      });

      if (!fullRes.success && fullRes.error === "IMAGE_QUALITY_INSUFFICIENT") {
        setQualityError(fullRes.message);
        setScanning(false);
        return;
      }

      const isFallbackSpoiled = fullRes.condition === "Spoiled" || fullRes.freshnessStatus === "ROTTEN" || fullRes.remainingDays <= 0 || fullRes.freshnessScore <= 15;
      let cleanRecommendation = fullRes.recommendation || "";
      if (isFallbackSpoiled || /DO_NOT_CONSUME|INSPECT|RETAKE/i.test(cleanRecommendation)) {
        cleanRecommendation = "Discard safely — not safe for consumption";
      }

      setResult({
        ...fullRes,
        expiryDate: isFallbackSpoiled ? "Immediate (Expired)" : (fullRes.expiryDate || "Immediate (Expired)"),
        consumeByDate: isFallbackSpoiled ? "Immediate (Expired)" : (fullRes.consumeByDate || "Immediate (Expired)"),
        shelfLifeEstimate: isFallbackSpoiled ? "Immediate (Expired)" : fullRes.shelfLifeEstimate,
        recommendation: cleanRecommendation,
        storage: isFallbackSpoiled ? "Discard safely — not safe for consumption" : fullRes.storage
      });
      setEditedName(fullRes.foodName === "Food not confidently identified" ? "" : fullRes.foodName);
      setEditedCategory(fullRes.category as Category);
      if (fullRes.isUncertain) {
        setIsEditing(true);
        toast.info("We noticed some fuzziness—please confirm your item name.", {
          icon: <Sparkles className="h-4 w-4 text-primary" />
        });
      }
    } catch (e: any) {
      // Smoothly fall back to manual verification with an encouraging message — never show raw technical error
      setIsEditing(true);
      toast.info("We noticed some fuzziness—please confirm your item name.", {
        icon: <Sparkles className="h-4 w-4 text-primary" />
      });
    } finally {
      setScanning(false);
    }
  };

  const handleApplyUserCorrection = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!editedName.trim()) {
      toast.error("Please enter a valid food name.");
      return;
    }

    const updated = recalculateForCorrectedFood({
      foodName: editedName.trim(),
      category: editedCategory,
      freshnessScore: result?.freshnessScore || 85,
      condition: result?.condition || "Fresh",
      imageBase64: preview
    });

    setResult((prev: any) => ({
      ...prev,
      ...updated,
      foodName: updated.foodName,
      category: updated.category,
      identificationConfidence: 100,
      isUncertain: false,
      requiresUserConfirmation: false
    }));
    setIsEditing(false);
    toast.success(`Food identity updated to "${editedName.trim()}". Shelf-life & nutrition recalculated.`);
  };

  const handleSelectDetectedItem = (item: GeminiScanFoodItem) => {
    const isSpoiled = item.condition === "Spoiled" || item.estimated_shelf_life_days <= 0;
    setResult({
      foodName: item.name,
      category: item.category,
      quantity: item.quantity,
      storage: isSpoiled ? "Discard safely — not safe for consumption" : item.storage,
      remainingDays: item.estimated_shelf_life_days,
      shelfLifeEstimate: isSpoiled ? "Immediate (Expired)" : `${item.estimated_shelf_life_days} days`,
      expiryDate: isSpoiled ? "Immediate (Expired)" : item.expiry_date,
      consumeByDate: isSpoiled ? "Immediate (Expired)" : item.expiry_date,
      freshnessScore: item.freshness_score,
      condition: item.condition,
      aiExplanation: item.visual_notes,
      identificationConfidence: 96,
      isUncertain: false,
      visibleIssues: isSpoiled ? ["Signs of spoilage detected"] : (item.spoilage_markers ? item.spoilage_markers.filter((m: string) => m !== "none") : []),
      recommendation: isSpoiled ? "Discard safely — not safe for consumption" : `Store in ${item.storage}`,
      spoilageRisk: isSpoiled ? "high" : "low",
      metadata: {
        allergens: item.allergens,
        nutrition: {
          calories: item.macros_per_100g.calories,
          protein: item.macros_per_100g.protein,
          carbs: item.macros_per_100g.carbs,
          fat: item.macros_per_100g.fat,
          fiber: item.macros_per_100g.fiber,
          nutrients: []
        }
      },
      geminiData: item
    });
    setEditedName(item.name);
    setEditedCategory(item.category as Category);
    setIsEditing(false);
  };

  const handleAddAllDetected = () => {
    if (detectedList.length === 0) return;
    detectedList.forEach((it) => {
      const isSpoiled = it.condition === "Spoiled" || it.estimated_shelf_life_days <= 0;
      add(
        {
          id: crypto.randomUUID(),
          name: it.name,
          category: it.category as Category,
          quantity: it.quantity || "1 pcs",
          freshness: it.freshness_score || (isSpoiled ? 10 : 85),
          addedDaysAgo: 0,
          expiresInDays: it.estimated_shelf_life_days,
          expiry_date: isSpoiled ? undefined : it.expiry_date,
          days_left: it.estimated_shelf_life_days,
          storage: (it.storage as Storage) || "Refrigerator",
          image: preview || foodImages.tomatoes,
          allergens: it.allergens || [],
          nutrition: {
            calories: it.macros_per_100g.calories,
            protein: it.macros_per_100g.protein,
            carbs: it.macros_per_100g.carbs,
            fat: it.macros_per_100g.fat,
            fiber: it.macros_per_100g.fiber,
            nutrients: []
          },
          visualScanNotes: it.visual_notes,
          spoilageRisk: isSpoiled ? "high" : "low",
          storageRecommendation: isSpoiled ? "Discard safely — not safe for consumption" : `Store in ${it.storage}`,
          consumeByDate: isSpoiled ? "Immediate (Expired)" : it.expiry_date,
          isVerifiedExpiry: false,
          printedExpiryDate: null,
          estimatedConsumeByDate: isSpoiled ? "Immediate (Expired)" : it.expiry_date,
          spoilageStatus: isSpoiled ? "SPOILED" : it.condition === "Use Soon" ? "USE_SOON" : "FRESH",
          hasCriticalSpoilage: isSpoiled,
          requiresConfirmation: false,
          scanMetadata: {
            source: "photo_gemini_batch",
            condition: it.condition,
            aiExplanation: it.visual_notes
          }
        },
        "Photo",
        `Batch Scan: ${it.name}`
      );
    });
    toast.success(`Successfully added all ${detectedList.length} items to your pantry!`);
  };

  const reset = () => {
    setPreview(undefined);
    setResult(null);
    setDetectedList([]);
    setQualityError(null);
    setIsEditing(false);
  };

  const statusBadgeLabel = result ? (result.condition === "Spoiled" ? "Spoiled" : result.condition === "Overripe" ? "Use Soon" : "Fresh") : "Fresh";

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Dropzone onFile={start} scanning={scanning} preview={preview} mode="photo">
        <div className="flex gap-2 pt-2">
          {samples.slice(0, 4).map((s) => (
            <button
              key={s.key}
              onClick={() => start(foodImages[s.key as keyof typeof foodImages], s.name)}
              className="overflow-hidden rounded-xl ring-2 ring-transparent hover:ring-primary"
              title={`Try ${s.name}`}
            >
              <img src={foodImages[s.key as keyof typeof foodImages]} alt={s.name} className="h-12 w-12 object-cover" />
            </button>
          ))}
        </div>
      </Dropzone>

      <div className="card-surface p-6">
        {qualityError ? (
          <div className="flex h-full flex-col justify-center gap-4 text-center animate-rise">
            <AlertTriangle className="mx-auto h-12 w-12 text-spoiled" />
            <h3 className="font-display text-xl font-bold">Image Quality Insufficient</h3>
            <p className="text-sm text-muted-foreground px-4">{qualityError}</p>
            <Button variant="default" className="mx-auto mt-2" onClick={reset}>
              <RotateCcw className="mr-2 h-4 w-4" /> Retake Photo
            </Button>
          </div>
        ) : !result ? (
          scanning ? (
            <div className="space-y-4">
              {[60, 40, 80, 50, 70].map((w, i) => (
                <div key={i} className="skeleton-shimmer h-5 rounded" style={{ width: `${w}%` }} />
              ))}
            </div>
          ) : (
            <div className="flex h-full flex-col justify-center gap-3 text-center text-muted-foreground">
              <Sparkles className="mx-auto h-8 w-8 text-primary" />
              <p className="font-display text-lg font-semibold text-foreground">Evidence-Based AI Food Scanner</p>
              <p className="text-sm">Upload or capture a photo. Stage A identifies the food item; Stage B independently inspects freshness & defects.</p>
            </div>
          )
        ) : (
          <div className="space-y-6 animate-rise">
            {/* Multi-Item Detection Banner */}
            {detectedList.length > 1 && (
              <div className="rounded-2xl border-2 border-primary/30 bg-primary-soft/40 p-4 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-primary shrink-0" />
                    <span className="text-sm font-bold text-foreground">
                      {detectedList.length} Groceries Detected in Photo
                    </span>
                  </div>
                  <Button size="sm" onClick={handleAddAllDetected} className="shadow-sm">
                    <Plus className="mr-1.5 h-3.5 w-3.5" /> Add All {detectedList.length} to Pantry
                  </Button>
                </div>
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {detectedList.map((item, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => handleSelectDetectedItem(item)}
                      className={cn(
                        "rounded-full px-3 py-1 text-xs font-semibold transition-all border",
                        result?.foodName === item.name
                          ? "bg-primary text-primary-foreground border-primary shadow-sm"
                          : "bg-card text-muted-foreground border-border hover:text-foreground"
                      )}
                    >
                      {item.name} ({item.quantity})
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Safety Warning Banner */}
            {result.safetyWarning && (
              <div className="flex items-start gap-3 rounded-2xl bg-spoiled-soft p-4 text-sm text-spoiled border border-spoiled/40 font-medium">
                <ShieldAlert className="h-5 w-5 shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold">FOOD SAFETY ALERT</p>
                  <p className="text-xs leading-relaxed mt-0.5">{result.safetyWarning}</p>
                </div>
              </div>
            )}

            {/* Low Confidence / Ambiguous Warning Banner */}
            {result.isUncertain && (
              <div className="flex items-start gap-3 rounded-2xl bg-warn-soft p-4 text-sm text-warn border border-warn/30 font-medium">
                <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold">Unable to confidently identify this food.</p>
                  <p className="text-xs leading-relaxed mt-0.5">Visual evidence is ambiguous. Please capture a clearer image or correct the food name below before saving.</p>
                </div>
              </div>
            )}

            {/* User Confirmation Banner ("Is this Tomato?") */}
            {!result.isUncertain && !isEditing && (
              <div className="flex items-center justify-between rounded-2xl bg-primary/10 p-3.5 border border-primary/20">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary shrink-0" />
                  <span className="text-xs font-semibold text-foreground">Is this <strong>{result.foodName}</strong>?</span>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="ghost" className="h-8 text-xs font-semibold text-primary hover:bg-primary/20" onClick={() => setIsEditing(true)}>
                    <PencilLine className="h-3.5 w-3.5 mr-1" /> Edit Name
                  </Button>
                </div>
              </div>
            )}

            {/* Edit / Correction Form */}
            {isEditing && (
              <form onSubmit={handleApplyUserCorrection} className="rounded-2xl border bg-surface p-4 space-y-3 animate-rise">
                <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Correct Food Identity</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Food Name</Label>
                    <Input
                      value={editedName}
                      onChange={(e) => setEditedName(e.target.value)}
                      placeholder="e.g. Tomato"
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Category</Label>
                    <Select value={editedCategory} onValueChange={(v) => setEditedCategory(v as Category)}>
                      <SelectTrigger className="mt-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {categories.map((c) => (
                          <SelectItem key={c} value={c}>
                            {c}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="flex justify-end gap-2 pt-1">
                  <Button type="button" variant="outline" size="sm" onClick={() => setIsEditing(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" size="sm">
                    Recalculate & Confirm
                  </Button>
                </div>
              </form>
            )}

            {/* Core Scan Result Header */}
            <div className="flex items-center gap-5">
              <Ring
                value={result.freshnessScore}
                status={statusBadgeLabel}
                size={110}
                label={
                  <div>
                    <p className="font-display text-2xl font-bold">{result.freshnessScore}%</p>
                    <p className="text-[10px] text-muted-foreground">Freshness</p>
                  </div>
                }
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-primary">
                    Confidence: {result.identificationConfidence}%
                  </span>
                  {result.isUncertain && (
                    <span className="rounded-full bg-warn/20 px-2 py-0.5 text-[10px] font-bold text-warn">
                      Low Confidence
                    </span>
                  )}
                </div>
                <h2 className="text-2xl font-bold truncate">{result.foodName}</h2>
                <p className="text-xs text-muted-foreground">{result.category}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <StatusBadge status={result.condition} />
                  <span className="rounded-full border bg-muted px-2.5 py-0.5 text-xs font-semibold text-muted-foreground">
                    Condition: {result.condition}
                  </span>
                </div>
              </div>
            </div>

            {/* AI Explanation / Visual Evidence */}
            <div className="rounded-2xl bg-surface p-4 border border-border/50 space-y-1">
              <p className="text-xs font-semibold uppercase text-muted-foreground">AI Visual Explanation:</p>
              <p className="text-xs italic text-foreground leading-relaxed">
                "{result.aiExplanation}"
              </p>
            </div>

            {/* Visible Issues List */}
            {result.visibleIssues && result.visibleIssues.length > 0 && (
              <div className="rounded-2xl bg-surface p-4 border border-border/50 space-y-1.5">
                <p className="text-xs font-semibold uppercase text-muted-foreground">Visible Issues Detected:</p>
                <ul className="text-xs space-y-1">
                  {result.visibleIssues.map((issue: string, idx: number) => (
                    <li key={idx} className="flex items-center gap-2 text-spoiled font-medium">
                      <span className="h-1.5 w-1.5 rounded-full bg-spoiled" />
                      {issue}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Detailed Structured Attributes Grid */}
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-2xl bg-surface p-3 border border-border/40">
                <dt className="text-[11px] text-muted-foreground uppercase font-medium">Remaining Shelf Life</dt>
                <dd className="font-bold text-xs mt-0.5 leading-relaxed">
                  {result.condition === "Spoiled" || result.remainingDays <= 0 ? (
                    <span className="text-spoiled font-semibold">Immediate (Expired)</span>
                  ) : (
                    <>
                      {result.shelfLifeEstimate} <span className="text-[10px] text-muted-foreground font-normal">(AI Estimate)</span>
                    </>
                  )}
                </dd>
              </div>
              <div className="rounded-2xl bg-surface p-3 border border-border/40">
                <dt className="text-[11px] text-muted-foreground uppercase font-medium">Expiry Date</dt>
                <dd className="font-bold text-xs mt-0.5 leading-relaxed">
                  {result.condition === "Spoiled" || result.remainingDays <= 0 || !result.expiryDate || result.expiryDate === "Not applicable" || result.expiryDate === "null" ? (
                    <span className="text-spoiled font-semibold">Immediate (Expired)</span>
                  ) : (
                    result.expiryDate
                  )}
                </dd>
              </div>
              <div className="rounded-2xl bg-surface p-3 border border-border/40">
                <dt className="text-[11px] text-muted-foreground uppercase font-medium">Storage Advice</dt>
                <dd className="font-semibold text-xs mt-0.5 leading-relaxed">
                  {result.condition === "Spoiled" || result.remainingDays <= 0 || /DO_NOT_CONSUME|INSPECT|RETAKE/i.test(result.recommendation || "") ? (
                    <span className="text-spoiled">Discard safely — not safe for consumption</span>
                  ) : (
                    result.recommendation || "Keep Refrigerated"
                  )}
                </dd>
              </div>
              <div className="rounded-2xl bg-surface p-3 border border-border/40">
                <dt className="text-[11px] text-muted-foreground uppercase font-medium">Condition State</dt>
                <dd className="font-bold text-xs mt-0.5 leading-relaxed text-primary">
                  {result.condition} ({result.freshnessScore}%)
                </dd>
              </div>
            </dl>

            {/* Macros per 100g Card */}
            {result.metadata?.nutrition && (
              <div className="rounded-2xl bg-surface p-4 border border-border/50 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Macros per 100g</span>
                  <span className="text-xs font-bold text-primary">{result.metadata.nutrition.calories || 0} kcal</span>
                </div>
                <div className="grid grid-cols-4 gap-2 text-center text-xs">
                  <div className="rounded-xl bg-card p-2 border">
                    <span className="block text-[10px] text-muted-foreground font-medium">Protein</span>
                    <span className="font-bold text-emerald-600 dark:text-emerald-400">{result.metadata.nutrition.protein || 0}g</span>
                  </div>
                  <div className="rounded-xl bg-card p-2 border">
                    <span className="block text-[10px] text-muted-foreground font-medium">Carbs</span>
                    <span className="font-bold text-blue-600 dark:text-blue-400">{result.metadata.nutrition.carbs || 0}g</span>
                  </div>
                  <div className="rounded-xl bg-card p-2 border">
                    <span className="block text-[10px] text-muted-foreground font-medium">Fat</span>
                    <span className="font-bold text-amber-600 dark:text-amber-400">{result.metadata.nutrition.fat || 0}g</span>
                  </div>
                  <div className="rounded-xl bg-card p-2 border">
                    <span className="block text-[10px] text-muted-foreground font-medium">Fiber</span>
                    <span className="font-bold text-teal-600 dark:text-teal-400">{result.metadata.nutrition.fiber || 0}g</span>
                  </div>
                </div>
              </div>
            )}

            {/* Dynamic Allergen Tags */}
            <div className="rounded-2xl bg-surface p-3.5 border border-border/40">
              <span className="block text-[11px] text-muted-foreground uppercase font-medium mb-1.5">Allergens</span>
              <div className="flex flex-wrap gap-1.5">
                {result.metadata?.allergens && result.metadata.allergens.length > 0 ? (
                  result.metadata.allergens.map((alg: string) => (
                    <span key={alg} className="inline-flex items-center gap-1 rounded-md bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-500/30 px-2.5 py-0.5 text-xs font-semibold">
                      <AlertTriangle className="h-3 w-3" /> {alg}
                    </span>
                  ))
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 px-2.5 py-0.5 text-xs font-semibold">
                    <CheckCircle2 className="h-3 w-3" /> Allergen Free / None Detected
                  </span>
                )}
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <Button
                className={cn("flex-1", result.condition === "Spoiled" && "bg-spoiled hover:bg-spoiled/90 text-white")}
                disabled={result.isUncertain && !editedName}
                onClick={() => {
                  const finalItemName = result.foodName === "Food not confidently identified" ? (editedName || "Food Item") : result.foodName;
                  const isSpoiled = result.condition === "Spoiled" || result.remainingDays <= 0 || (result.visibleIssues && result.visibleIssues.some((issue: string) => /mold|rot|spoil|decay/i.test(issue)));
                  const spoilageStatus = isSpoiled ? "SPOILED" : result.condition === "Overripe" ? "USE_SOON" : "FRESH";
                  const cleanStorageAdvice = isSpoiled ? "Discard safely — not safe for consumption" : (result.recommendation || (result.category === "Vegetables" || result.category === "Dairy" ? "Refrigerator" : "Pantry"));
                  const cleanStorage = isSpoiled ? "Discard safely — not safe for consumption" : (result.storage || (result.category === "Vegetables" || result.category === "Dairy" ? "Refrigerator" : "Pantry"));
                  const cleanConsumeByDate = isSpoiled ? "Immediate (Expired)" : result.consumeByDate;
                  add(
                    {
                      id: crypto.randomUUID(),
                      name: finalItemName,
                      category: result.category as Category,
                      quantity: result.quantity || "1 pcs",
                      freshness: isSpoiled ? Math.min(15, result.freshnessScore) : result.freshnessScore,
                      addedDaysAgo: 0,
                      expiresInDays: isSpoiled ? 0 : result.remainingDays,
                      expiry_date: isSpoiled ? undefined : result.expiryDate,
                      days_left: isSpoiled ? 0 : result.remainingDays,
                      storage: cleanStorage,
                      image: preview || foodImages.tomatoes,
                      allergens: result.metadata?.allergens || [],
                      nutrition: result.metadata?.nutrition || { calories: 45, protein: 1, carbs: 9, fat: 0.2, fiber: 2, nutrients: [] },
                      visualScanNotes: result.aiExplanation,
                      spoilageRisk: isSpoiled ? "high" : result.spoilageRisk,
                      storageRecommendation: cleanStorageAdvice,
                      consumeByDate: cleanConsumeByDate,
                      isVerifiedExpiry: false,
                      printedExpiryDate: null,
                      estimatedConsumeByDate: cleanConsumeByDate,
                      spoilageStatus,
                      hasCriticalSpoilage: isSpoiled,
                      requiresConfirmation: Boolean(result.isUncertain),
                      scanMetadata: {
                        source: "photo",
                        identificationConfidence: result.identificationConfidence,
                        condition: result.condition,
                        visibleIssues: result.visibleIssues,
                        aiExplanation: result.aiExplanation
                      }
                    },
                    "Photo",
                    `AI Scan: ${finalItemName} (${result.condition}) · ${result.freshnessScore}% fresh`
                  );
                }}
              >
                <Plus /> {result.condition === "Spoiled" ? "Confirm & Save Record" : "Add to Pantry"}
              </Button>
              <Button variant="outline" onClick={() => setIsEditing(!isEditing)}>
                <PencilLine /> Correct Food
              </Button>
              <Button variant="outline" onClick={reset}>
                <RotateCcw /> Rescan
              </Button>
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
  const [data, setData] = useState<{
    product: string;
    brand?: string;
    expiry: string;
    mfg: string;
    best: string;
    qty: string;
    category?: Category;
    storage?: Storage;
    allergens?: string[];
    nutrition?: any;
    packagingCondition?: string;
    packagingNotes?: string | null;
    confidence?: number;
    requiresConfirmation?: boolean;
    isVerifiedExpiry?: boolean;
    shelfLifeStatement?: string | null;
  } | null>(null);
  const add = useAddAndToast();

  const start = async (url: string) => {
    setPreview(url);
    setScanning(true);
    setData(null);

    try {
      // Read label dates & product details using OCR and AI inspection
      const ocrRes = await scanFoodLabelOCR(url, "label");
      if (ocrRes.success || ocrRes.rawText || ocrRes.productName || ocrRes.expiryDate || ocrRes.bestBeforeDate || ocrRes.manufacturingDate) {
        setScanning(false);
        setData({
          product: ocrRes.productName || "",
          brand: ocrRes.brand || "",
          expiry: ocrRes.expiryDate || ocrRes.calculatedExpiryDate || ocrRes.bestBeforeDate || "",
          mfg: ocrRes.manufacturingDate || "",
          best: ocrRes.bestBeforeDate || "",
          qty: ocrRes.quantity || "1 unit",
          category: (ocrRes.category as Category) || "Packaged Foods",
          storage: (ocrRes.category === "Dairy" ? "Refrigerator" : "Pantry shelf") as Storage,
          allergens: ocrRes.allergens || [],
          nutrition: ocrRes.nutrition || null,
          packagingCondition: ocrRes.packagingCondition || "INTACT",
          packagingNotes: ocrRes.packagingNotes || null,
          confidence: typeof ocrRes.confidence === "number" ? Math.round(ocrRes.confidence * 100) : undefined,
          requiresConfirmation: ocrRes.requiresUserConfirmation,
          isVerifiedExpiry: Boolean(ocrRes.isVerifiedExpiry),
          shelfLifeStatement: ocrRes.shelfLifeStatement || null
        });
        return;
      }

      // Receipt fallback: map extracted product details and expiry dates
      const geminiRes = await scanFoodWithGemini(url, { isReceipt: true });
      setScanning(false);
      const first = geminiRes.success && geminiRes.items.length > 0 ? geminiRes.items[0] : null;
      setData({
        product: first?.name || "",
        brand: "",
        expiry: first?.expiry_date || "",
        mfg: "",
        best: "",
        qty: first?.quantity || "1 unit",
        category: (first?.category as Category) || "Packaged Foods",
        storage: (first?.storage as Storage) || "Pantry shelf",
        allergens: first?.allergens || [],
        nutrition: first?.macros_per_100g ? {
          calories: first.macros_per_100g.calories,
          protein: first.macros_per_100g.protein,
          carbs: first.macros_per_100g.carbs,
          fat: first.macros_per_100g.fat,
          fiber: first.macros_per_100g.fiber
        } : null,
        requiresConfirmation: true
      });
    } catch {
      setScanning(false);
      // On error: show blank form for manual correction — do NOT invent dates
      setData({ product: "", brand: "", expiry: "", mfg: "", best: "", qty: "" });
    }
  };

  const consumeDate = data?.expiry || data?.best || "";
  const days = consumeDate ? Math.round((new Date(consumeDate).getTime() - Date.now()) / 864e5) : undefined;
  const isExpired = Boolean(consumeDate && new Date(consumeDate).getTime() < Date.now());
  const isExpiringSoon = Boolean(!isExpired && typeof days === "number" && days <= 3 && days >= 0);
  const isPackageDamaged = Boolean(data?.packagingCondition && data.packagingCondition !== "INTACT");

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Dropzone onFile={start} scanning={scanning} preview={preview} mode="label">
      </Dropzone>
      <div className="card-surface p-6">
        {!data ? (
          <div className="flex h-full flex-col justify-center gap-3 text-center text-muted-foreground">
            <Tag className="mx-auto h-8 w-8 text-primary" />
            <p className="font-display text-lg font-semibold text-foreground">
              {scanning ? "Analyzing label with OCR & Gemini AI..." : "Expiry Label & Receipt Reader"}
            </p>
            <p className="text-sm">Upload grocery receipts or food packaging expiry labels.</p>
          </div>
        ) : (
          <div className="space-y-4 animate-rise">
            {/* Expiry Status Banner */}
            {isExpired ? (
              <div className="flex items-start gap-2.5 rounded-2xl bg-spoiled-soft p-3.5 text-xs text-spoiled border border-spoiled/40 font-medium">
                <ShieldAlert className="h-5 w-5 shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold text-sm">PRODUCT IS EXPIRED</p>
                  <p className="mt-0.5">The detected expiry date ({consumeDate}) has passed ({Math.abs(days || 0)} days ago). Do not consume.</p>
                </div>
              </div>
            ) : isExpiringSoon ? (
              <div className="flex items-start gap-2.5 rounded-2xl bg-warn-soft p-3.5 text-xs text-warn border border-warn/30 font-medium">
                <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold text-sm">EXPIRES SOON</p>
                  <p className="mt-0.5">This product expires in {days} {days === 1 ? "day" : "days"} ({consumeDate}). Use soon.</p>
                </div>
              </div>
            ) : consumeDate ? (
              <div className="flex items-start gap-2.5 rounded-2xl bg-emerald-500/10 p-3.5 text-xs text-emerald-700 dark:text-emerald-300 border border-emerald-500/20 font-medium">
                <CheckCircle2 className="h-5 w-5 shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold text-sm">PRODUCT VALID</p>
                  <p className="mt-0.5">Safe for consumption. Expires in {days} days ({consumeDate}).</p>
                </div>
              </div>
            ) : (
              <div className="flex items-start gap-2.5 rounded-2xl bg-muted p-3.5 text-xs text-muted-foreground border font-medium">
                <Info className="h-5 w-5 shrink-0 mt-0.5 text-primary" />
                <div>
                  <p className="font-bold text-foreground">Printed Expiry Date Uncertain / Not Detected</p>
                  <p className="mt-0.5">Could not confidently detect printed dates. Please verify your package and enter below.</p>
                </div>
              </div>
            )}

            {/* Packaging Alert Banner */}
            {isPackageDamaged && (
              <div className="flex items-start gap-2.5 rounded-2xl bg-warn-soft p-3 text-xs text-warn border border-warn/30 font-medium">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold">Package Condition Alert: {data.packagingCondition}</p>
                  {data.packagingNotes && <p className="mt-0.5 text-[11px]">{data.packagingNotes}</p>}
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <Field label="Product Name">
                <Input value={data.product} onChange={(e) => setData({ ...data, product: e.target.value })} />
              </Field>
              <Field label="Brand">
                <Input placeholder="e.g. Parle" value={data.brand || ""} onChange={(e) => setData({ ...data, brand: e.target.value })} />
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Category">
                <Select value={data.category || "Packaged Foods"} onValueChange={(v) => setData({ ...data, category: v as Category })}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Quantity">
                <Input value={data.qty} onChange={(e) => setData({ ...data, qty: e.target.value })} />
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Expiry date">
                <Input type="date" value={data.expiry} onChange={(e) => setData({ ...data, expiry: e.target.value })} />
              </Field>
              <Field label="Best before">
                <Input type="date" value={data.best} onChange={(e) => setData({ ...data, best: e.target.value })} />
              </Field>
              <Field label="Manufactured date">
                <Input type="date" value={data.mfg} onChange={(e) => setData({ ...data, mfg: e.target.value })} />
              </Field>
              <Field label="Shelf Life / Note">
                <Input placeholder="e.g. 6 months from mfg" value={data.shelfLifeStatement || ""} onChange={(e) => setData({ ...data, shelfLifeStatement: e.target.value })} />
              </Field>
            </div>

            {/* Allergen Tags */}
            {data.allergens && data.allergens.length > 0 && (
              <div className="rounded-xl bg-surface p-3 border border-border/40">
                <span className="block text-[11px] text-muted-foreground uppercase font-medium mb-1">Detected Allergens</span>
                <div className="flex flex-wrap gap-1.5">
                  {data.allergens.map((alg) => (
                    <span key={alg} className="inline-flex items-center gap-1 rounded-md bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-500/30 px-2.5 py-0.5 text-xs font-semibold">
                      <AlertTriangle className="h-3 w-3" /> {alg}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Nutrition per 100g Card */}
            {data.nutrition && (
              <div className="grid grid-cols-5 gap-2 text-center text-xs">
                {[
                  ["Calories", data.nutrition.calories ? `${data.nutrition.calories} kcal` : "—"],
                  ["Protein", data.nutrition.protein != null ? `${data.nutrition.protein}g` : "—"],
                  ["Carbs", data.nutrition.carbs != null ? `${data.nutrition.carbs}g` : "—"],
                  ["Fat", data.nutrition.fat != null ? `${data.nutrition.fat}g` : "—"],
                  ["Fiber", data.nutrition.fiber != null ? `${data.nutrition.fiber}g` : "—"]
                ].map(([label, val]) => (
                  <div key={label} className="rounded-xl bg-surface p-2 border">
                    <p className="font-bold text-xs">{val}</p>
                    <p className="text-[10px] text-muted-foreground">{label}</p>
                  </div>
                ))}
              </div>
            )}

            <Button
              className={cn("w-full", isExpired && "bg-spoiled hover:bg-spoiled/90 text-white")}
              disabled={!data.product.trim()}
              onClick={() => {
                const isVerified = Boolean(data.isVerifiedExpiry && data.expiry && data.expiry.trim());
                const finalItemName = data.brand && !data.product.includes(data.brand)
                  ? `${data.brand} ${data.product}`.trim()
                  : (data.product.trim() || "Food Item");
                const effectiveExpiry = consumeDate || undefined;
                add(
                  {
                    id: crypto.randomUUID(),
                    name: finalItemName,
                    category: (data.category as Category) || "Packaged Food",
                    quantity: data.qty || "1 unit",
                    freshness: isExpired ? 10 : 95,
                    addedDaysAgo: 0,
                    expiresInDays: isExpired ? 0 : (days ?? 3),
                    days_left: isExpired ? 0 : (days ?? 3),
                    expiry_date: effectiveExpiry,
                    consumeByDate: effectiveExpiry,
                    purchaseDate: data.mfg || undefined,
                    storage: ((data.storage as Storage) || "Pantry shelf"),
                    image: preview,
                    allergens: data.allergens || [],
                    nutrition: data.nutrition || { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, nutrients: [] },
                    isVerifiedExpiry: isVerified,
                    printedExpiryDate: isVerified ? data.expiry : undefined,
                    estimatedConsumeByDate: isExpired ? "Immediate (Expired)" : (consumeDate || undefined),
                    spoilageStatus: isExpired ? "SPOILED" : isExpiringSoon ? "USE_SOON" : "FRESH",
                    hasCriticalSpoilage: isExpired,
                    requiresConfirmation: !consumeDate || Boolean(data.requiresConfirmation),
                    scanMetadata: {
                      source: "label_ocr",
                      brand: data.brand,
                      confidence: data.confidence,
                      requiresConfirmation: !consumeDate || Boolean(data.requiresConfirmation),
                      manufacturingDate: data.mfg,
                      bestBeforeDate: data.best,
                      printedExpiry: data.isVerifiedExpiry ? data.expiry : undefined,
                      calculatedExpiry: data.isVerifiedExpiry ? undefined : data.expiry,
                      shelfLifeStatement: data.shelfLifeStatement || undefined,
                      packagingCondition: data.packagingCondition
                    }
                  },
                  "Label",
                  isExpired ? `Expired Product: ${finalItemName}` : "Product and dates extracted from label; user confirmed"
                );
              }}
            >
              <Plus /> {isExpired ? "⚠️ Confirm & Save Expired Record" : "Confirm & Add to Pantry"}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

type BarcodeProduct = {
  name: string;
  brand: string;
  category: Category;
  qty: string;
  expiry: string;
  mfg?: string;
  best?: string;
  storage: string;
  allergens: string[];
  nutrition?: any;
  packagingCondition?: string;
  visualNotes?: string;
  notFound?: boolean;
  unavailable?: boolean;
  requiresConfirmation?: boolean;
  source?: string;
};

function BarcodeScan() {
  const [preview, setPreview] = useState<string>();
  const [scanning, setScanning] = useState(false);
  const [barcode, setBarcode] = useState("");
  const [p, setP] = useState<null | BarcodeProduct>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const stopCameraRef = useRef<(() => void) | null>(null);
  const add = useAddAndToast();

  useEffect(() => () => {
    stopCameraRef.current?.();
  }, []);

  const lookup = async (code: string, imgData?: string) => {
    if (!code && !imgData && !preview) return;
    setScanning(true);
    setP(null);

    const imageToUse = imgData || preview || null;

    try {
      const offRes = await processBarcodePipeline(imageToUse, code ? code.trim() : null);
      setScanning(false);
      if (offRes.barcode && !barcode) {
        setBarcode(offRes.barcode);
      }
      if (offRes.success) {
        setP({
          name: offRes.productName || "",
          brand: offRes.brand || "",
          category: (offRes.category as Category) || "Packaged Foods",
          qty: offRes.quantity || "1 pack",
          expiry: offRes.expiryDate || offRes.bestBeforeDate || "",
          mfg: offRes.manufacturingDate || "",
          best: offRes.bestBeforeDate || "",
          storage: "Store according to the product label.",
          allergens: offRes.allergens || [],
          nutrition: offRes.nutrition,
          packagingCondition: offRes.packagingCondition || "INTACT",
          visualNotes: offRes.visualNotes || "",
          requiresConfirmation: Boolean(offRes.requiresUserConfirmation),
          source: offRes.source
        });
        toast.success(offRes.message || "Product matched!");
      } else {
        setP({
          name: offRes.productName || "",
          brand: offRes.brand || "",
          category: (offRes.category as Category) || "Packaged Foods",
          qty: offRes.quantity || "",
          expiry: offRes.expiryDate || offRes.bestBeforeDate || "",
          mfg: offRes.manufacturingDate || "",
          best: offRes.bestBeforeDate || "",
          storage: "",
          allergens: offRes.allergens || [],
          nutrition: offRes.nutrition,
          packagingCondition: offRes.packagingCondition || "INTACT",
          visualNotes: offRes.visualNotes || "",
          notFound: offRes.error === "PRODUCT_NOT_IN_DATABASE",
          unavailable: offRes.error === "OPEN_FOOD_FACTS_UNAVAILABLE"
        });
        if (offRes.message) {
          toast.info(offRes.message);
        }
      }
    } catch {
      setScanning(false);
      setP({
        name: "", brand: "", category: "Packaged Food", qty: "",
        expiry: "", storage: "", allergens: [], unavailable: true
      });
      toast.error("Scan processing encountered an error.");
    }
  };

  const handleDropzoneFile = async (url: string, fileName: string = "") => {
    setPreview(url);
    setScanning(true);
    setP(null);

    try {
      const res = await processBarcodePipeline(url, null);
      setScanning(false);
      if (res.barcode) {
        setBarcode(res.barcode);
      }
      if (res.success) {
        setP({
          name: res.productName || "",
          brand: res.brand || "",
          category: (res.category as Category) || "Packaged Foods",
          qty: res.quantity || "1 pack",
          expiry: res.expiryDate || res.bestBeforeDate || "",
          mfg: res.manufacturingDate || "",
          best: res.bestBeforeDate || "",
          storage: "Store according to the product label.",
          allergens: res.allergens || [],
          nutrition: res.nutrition,
          packagingCondition: res.packagingCondition || "INTACT",
          visualNotes: res.visualNotes || "",
          requiresConfirmation: Boolean(res.requiresUserConfirmation),
          source: res.source
        });
        toast.success(res.message || "Package analyzed successfully!");
      } else if (res.barcode) {
        setP({
          name: res.productName || "",
          brand: res.brand || "",
          category: (res.category as Category) || "Packaged Foods",
          qty: res.quantity || "",
          expiry: res.expiryDate || res.bestBeforeDate || "",
          mfg: res.manufacturingDate || "",
          best: res.bestBeforeDate || "",
          storage: "",
          allergens: res.allergens || [],
          nutrition: res.nutrition,
          packagingCondition: res.packagingCondition || "INTACT",
          visualNotes: res.visualNotes || "",
          notFound: res.error === "PRODUCT_NOT_IN_DATABASE",
          unavailable: res.error === "OPEN_FOOD_FACTS_UNAVAILABLE"
        });
        toast.info(res.message || "Barcode detected. Please confirm details.");
      } else {
        toast.error(res.message || "No readable barcode or package details found in this image.");
      }
    } catch (err: any) {
      setScanning(false);
      toast.error("Failed to process package image.");
    }
  };

  useEffect(() => {
    let active = true;
    if (cameraOpen && videoRef.current) {
      startBarcodeCamera(videoRef.current, async (value: string, frameUrl?: string) => {
        if (!active) return;
        setCameraOpen(false);
        setBarcode(value);
        if (frameUrl) {
          setPreview(frameUrl);
        }
        await lookup(value, frameUrl);
      }).then((stop: any) => {
        if (active) {
          stopCameraRef.current = stop;
        } else {
          stop?.();
        }
      }).catch((err: any) => {
        if (!active) return;
        setCameraOpen(false);
        toast.error(err?.message === "CAMERA_PERMISSION_DENIED" ? "Camera permission was denied." : "Camera access failed or barcode scanning is unavailable.");
      });
    }
    return () => {
      active = false;
      stopCameraRef.current?.();
      stopCameraRef.current = null;
    };
  }, [cameraOpen]);

  const openLiveCamera = () => {
    setP(null);
    setCameraOpen(true);
  };

  const isExpired = Boolean(p?.expiry && new Date(p.expiry).getTime() < Date.now());
  const daysLeft = p?.expiry ? Math.round((new Date(p.expiry).getTime() - Date.now()) / 864e5) : null;
  const isPackageDamaged = Boolean(p?.packagingCondition && p.packagingCondition !== "INTACT");

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="space-y-4">
        {cameraOpen && (
          <div className="relative aspect-[4/3] overflow-hidden rounded-[2rem] border bg-black">
            <video ref={videoRef} autoPlay muted playsInline className="h-full w-full object-cover" />
            <div className="pointer-events-none absolute inset-8 rounded-2xl border-2 border-primary shadow-[0_0_30px_4px] shadow-primary/40" />
            <Button variant="outline" className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-background/90" onClick={() => {
              stopCameraRef.current?.();
              stopCameraRef.current = null;
              setCameraOpen(false);
            }}>Cancel</Button>
          </div>
        )}
        <Dropzone onFile={(url, name) => handleDropzoneFile(url, name)} scanning={scanning} preview={preview} mode="barcode">
        </Dropzone>

        {preview && (
          <div className="flex justify-end">
            <Button variant="ghost" size="sm" className="text-xs text-muted-foreground" onClick={() => { setPreview(undefined); setP(null); setBarcode(""); }}>
              <RotateCcw className="h-3.5 w-3.5 mr-1" /> Retake / Clear Image
            </Button>
          </div>
        )}

        {/* Quick Sample Barcodes */}
        <div className="flex flex-wrap gap-1.5 pt-1">
          {[
            { label: "🍪 Good Day Biscuits", code: "8901491100018" },
            { label: "🍪 Parle-G Biscuits", code: "8901063000021" },
            { label: "🍫 Dark Fantasy", code: "8901725111119" },
            { label: "🌾 Aashirvaad Atta", code: "8901719101072" },
            { label: "🥛 Amul Milk", code: "8901030777777" },
            { label: "🍜 Maggi Noodles", code: "8901058000524" }
          ].map((sample) => (
            <button
              key={sample.code}
              type="button"
              onClick={() => {
                setBarcode(sample.code);
                lookup(sample.code);
              }}
              className="rounded-full border bg-surface px-3 py-1 text-xs font-semibold text-muted-foreground hover:border-primary hover:text-foreground transition-colors"
            >
              {sample.label}
            </button>
          ))}
        </div>

        {/* Manual barcode entry */}
        <div className="flex gap-2">
          <Input
            placeholder="Enter barcode number (e.g. 8901491100018)"
            value={barcode}
            onChange={(e) => setBarcode(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && lookup(barcode)}
            className="flex-1"
          />
          <Button onClick={() => lookup(barcode)} disabled={scanning || !barcode}>
            {scanning ? "Looking up…" : "Lookup"}
          </Button>
        </div>
        <Button variant="outline" className="w-full" onClick={openLiveCamera} disabled={scanning || cameraOpen}>
          <Camera /> Scan continuously with camera
        </Button>
      </div>

      <div className="card-surface p-6">
        {!p ? (
          <div className="flex h-full flex-col justify-center gap-3 text-center text-muted-foreground">
            <ScanBarcode className="mx-auto h-8 w-8 text-primary" />
            <p className="font-display text-lg font-semibold text-foreground">
              {scanning ? "Inspecting Barcode & Package with AI..." : "Open Food Facts & AI Barcode Inspector"}
            </p>
            <p className="text-sm">Scan a barcode photo, use live camera, or click a sample barcode above.</p>
          </div>
        ) : (
          <div className="space-y-4 animate-rise">
            {/* Status Banners */}
            {isExpired ? (
              <div className="flex items-start gap-2.5 rounded-2xl bg-spoiled-soft p-3.5 text-xs text-spoiled border border-spoiled/40 font-medium">
                <ShieldAlert className="h-5 w-5 shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold text-sm">PRODUCT IS EXPIRED</p>
                  <p className="mt-0.5">The expiry date ({p.expiry}) has passed. Do not consume.</p>
                </div>
              </div>
            ) : p.expiry && daysLeft !== null ? (
              <div className="flex items-start gap-2.5 rounded-2xl bg-emerald-500/10 p-3.5 text-xs text-emerald-700 dark:text-emerald-300 border border-emerald-500/20 font-medium">
                <CheckCircle2 className="h-5 w-5 shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold text-sm">PRODUCT IS VALID</p>
                  <p className="mt-0.5">Expires in {daysLeft} {daysLeft === 1 ? "day" : "days"} ({p.expiry}).</p>
                </div>
              </div>
            ) : (
              <div className="flex items-start gap-2 rounded-2xl bg-muted p-3 text-xs text-muted-foreground border">
                <Info className="h-4 w-4 shrink-0 text-primary mt-0.5" />
                <span>No printed expiry date was auto-detected. Enter the expiry date from your package below to track shelf life.</span>
              </div>
            )}

            {isPackageDamaged && (
              <div className="flex items-start gap-2.5 rounded-2xl bg-warn-soft p-3 text-xs text-warn border border-warn/30 font-medium">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold">Package Condition Alert: {p.packagingCondition}</p>
                  {p.visualNotes && <p className="text-[11px] mt-0.5">{p.visualNotes}</p>}
                </div>
              </div>
            )}

            {p.notFound && !p.name && (
              <div className="flex items-center gap-2 rounded-2xl bg-warn-soft p-3 text-xs text-warn border border-warn/30">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span>{p.unavailable ? "Open Food Facts is unavailable. Retry or fill in product details manually." : "Barcode not found in Open Food Facts. Please fill in product details manually."}</span>
              </div>
            )}

            {p.source && (
              <div className="flex items-center gap-1.5 rounded-full border bg-muted/60 px-3 py-1 text-[11px] text-muted-foreground w-fit">
                <span className="font-semibold text-primary">Source:</span> {p.source}
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <Field label="Product Name">
                <Input placeholder="e.g. Parle-G Gluco Biscuits" value={p.name} onChange={(e) => setP({ ...p, name: e.target.value })} />
              </Field>
              <Field label="Brand">
                <Input placeholder="e.g. Parle" value={p.brand} onChange={(e) => setP({ ...p, brand: e.target.value })} />
              </Field>
              <Field label="Category">
                <Select value={p.category || "Packaged Foods"} onValueChange={(v) => setP({ ...p, category: v as Category })}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Quantity">
                <Input placeholder="e.g. 1 pack / 250 g" value={p.qty} onChange={(e) => setP({ ...p, qty: e.target.value })} />
              </Field>
              <Field label="Expiry Date">
                <Input type="date" value={p.expiry} onChange={(e) => setP({ ...p, expiry: e.target.value })} />
              </Field>
              <Field label="Best Before Date">
                <Input type="date" value={p.best || ""} onChange={(e) => setP({ ...p, best: e.target.value })} />
              </Field>
              <Field label="Manufacturing Date" className="col-span-2">
                <Input type="date" value={p.mfg || ""} onChange={(e) => setP({ ...p, mfg: e.target.value })} />
              </Field>
            </div>

            {p.nutrition ? (
              <div className="grid grid-cols-6 gap-2 text-center">
                {[
                  ["kcal", p.nutrition.calories],
                  ["Protein", p.nutrition.protein == null ? null : `${p.nutrition.protein}g`],
                  ["Carbs", p.nutrition.carbs == null ? null : `${p.nutrition.carbs}g`],
                  ["Fat", p.nutrition.fat == null ? null : `${p.nutrition.fat}g`],
                  ["Fiber", p.nutrition.fiber == null ? null : `${p.nutrition.fiber}g`],
                  ["Calcium", p.nutrition.calcium == null ? null : `${p.nutrition.calcium}mg`]
                ].map(([k, v]) => (
                  <div key={k as string} className="rounded-xl bg-surface p-2 border">
                    <p className="font-display font-bold text-xs">{v || "—"}</p>
                    <p className="text-[10px] text-muted-foreground">{k}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground rounded-2xl bg-muted p-3">Nutrition data unavailable for this product.</p>
            )}

            {p.allergens && p.allergens.length > 0 && (
              <div className="flex items-center gap-2 text-xs">
                <AlertTriangle className="h-4 w-4 text-spoiled shrink-0" />
                <span>Contains allergens: <b className="text-spoiled">{p.allergens.join(", ")}</b></span>
              </div>
            )}

            {p.storage && (
              <p className="rounded-2xl bg-muted p-3 text-xs text-muted-foreground">{p.storage}</p>
            )}

            <Button
              className={cn("w-full", isExpired && "bg-spoiled hover:bg-spoiled/90 text-white")}
              disabled={!p.name.trim()}
              onClick={() => {
                const effectiveExpiry = p.expiry || p.best || "";
                const isVerified = Boolean(effectiveExpiry && effectiveExpiry.trim());
                const finalName = p.brand && !p.name.includes(p.brand) ? `${p.brand} ${p.name}`.trim() : p.name.trim();
                const finalDays = effectiveExpiry ? Math.round((new Date(effectiveExpiry).getTime() - Date.now()) / 864e5) : undefined;
                add(
                  {
                    id: crypto.randomUUID(),
                    name: finalName,
                    category: p.category || "Packaged Foods",
                    quantity: p.qty || "1 pack",
                    freshness: isExpired ? 10 : 95,
                    addedDaysAgo: 0,
                    expiresInDays: isExpired ? 0 : (finalDays ?? 3),
                    days_left: isExpired ? 0 : (finalDays ?? 3),
                    expiry_date: effectiveExpiry || undefined,
                    consumeByDate: effectiveExpiry || undefined,
                    purchaseDate: p.mfg || undefined,
                    storage: ((p.storage as Storage) || "Pantry shelf"),
                    allergens: p.allergens,
                    nutrition: p.nutrition || { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, nutrients: [] },
                    image: preview,
                    isVerifiedExpiry: isVerified,
                    printedExpiryDate: isVerified ? effectiveExpiry : undefined,
                    estimatedConsumeByDate: isExpired ? "Immediate (Expired)" : (effectiveExpiry || undefined),
                    spoilageStatus: isExpired ? "SPOILED" : "FRESH",
                    hasCriticalSpoilage: isExpired,
                    requiresConfirmation: Boolean(p.requiresConfirmation || (!p.name || !effectiveExpiry)),
                    scanMetadata: {
                      source: "barcode",
                      barcode: barcode.trim(),
                      brand: p.brand,
                      enrichmentSource: p.source || "Open Food Facts",
                      manufacturingDate: p.mfg,
                      bestBeforeDate: p.best,
                      requiresConfirmation: Boolean(p.requiresConfirmation || (!p.name || !effectiveExpiry)),
                      packagingCondition: p.packagingCondition
                    }
                  },
                  "Barcode",
                  isExpired ? `Expired Barcode Item: ${finalName}` : p.unavailable ? "Manual entry (Open Food Facts unavailable)" : p.notFound && !p.source ? "Manually entered (barcode not in Open Food Facts)" : (p.source || "Open Food Facts Barcode Matched")
                );
              }}
            >
              <Plus /> {isExpired ? "⚠️ Save Expired Item Record" : "Add to Pantry"}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}


function InstamartScan() {
  const { syncPantryDb } = usePantry();
  const nav = useNavigate();
  const [activeOrders, setActiveOrders] = useState<any[]>(() => swiggyService.getActiveOrders());

  useEffect(() => {
    const update = () => setActiveOrders(swiggyService.getActiveOrders());
    window.addEventListener("swiggy_orders_changed", update);
    const timer = setInterval(update, 3000);
    return () => {
      window.removeEventListener("swiggy_orders_changed", update);
      clearInterval(timer);
    };
  }, []);

  const handleSuccess = () => {
    syncPantryDb();
    toast.success("Swiggy Instamart order imported to your AI Smart Pantry!", {
      icon: <CheckCircle2 className="h-4 w-4 text-emerald-500" />
    });
    nav({ to: "/app/pantry" });
  };

  const pendingDelivered = activeOrders.filter((o) => o.status === "delivered" && !o.importedAt);
  const inProgressOrders = activeOrders.filter((o) => o.status !== "delivered" && o.status !== "cancelled" && !o.importedAt);

  return (
    <div className="space-y-6">
      {/* Active Orders Status Banner */}
      {(pendingDelivered.length > 0 || inProgressOrders.length > 0) && (
        <div className="card-surface p-5 border-amber-500/30 bg-gradient-to-r from-orange-500/10 via-amber-500/10 to-transparent space-y-3">
          <div className="flex items-center justify-between">
            <span className="font-bold text-sm text-foreground flex items-center gap-2">
              <ShoppingBag className="h-4 w-4 text-orange-500" />
              Active Instamart Deliveries
            </span>
          </div>

          <div className="space-y-2">
            {pendingDelivered.map((ord) => (
              <div key={ord.orderId} className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-2xl bg-surface border border-emerald-500/40">
                <div className="flex items-center gap-2 text-xs">
                  <span className="font-bold text-foreground">Order #{ord.orderId}</span>
                  <span className="rounded-full bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 font-semibold px-2 py-0.5 text-[11px]">
                    🎉 Delivered (Ready to Confirm)
                  </span>
                  <span className="text-muted-foreground">· {ord.items?.length || 0} items</span>
                </div>
                <Button
                  size="sm"
                  onClick={() => {
                    window.dispatchEvent(new CustomEvent("swiggy_orders_changed"));
                  }}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl h-8"
                >
                  Confirm & Add to Pantry
                </Button>
              </div>
            ))}

            {inProgressOrders.map((ord) => (
              <div key={ord.orderId} className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-2xl bg-surface border border-border">
                <div className="flex items-center gap-2 text-xs">
                  <span className="font-bold text-foreground">Order #{ord.orderId}</span>
                  <span className="rounded-full bg-orange-500/15 text-orange-600 dark:text-orange-400 font-semibold px-2 py-0.5 text-[11px]">
                    🛵 {ord.status ? ord.status.replace(/_/g, " ") : "processing"}
                  </span>
                  <span className="text-muted-foreground">· {ord.items?.length || 0} items</span>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    swiggyService.fastForwardOrderDelivery(ord.orderId);
                    toast.success("Simulated instant arrival! Delivery confirmation modal will open.");
                  }}
                  className="text-xs h-8 border-orange-500/30 text-orange-600 dark:text-orange-400 hover:bg-orange-500/10"
                >
                  ⚡ Fast Forward Arrival (Demo)
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card-surface p-6 sm:p-8">
        <ImportDemoOrder onImportSuccess={handleSuccess} />
      </div>

      <div className="card-surface p-6 sm:p-8">
        <EndToEndDemo />
      </div>
    </div>
  );
}

function ManualAdd() {
  const add = useAddAndToast();
  const [f, setF] = useState({
    name: "",
    category: "Vegetables" as Category,
    qty: "",
    purchase: new Date().toISOString().slice(0, 10),
    expiry: "",
    storage: "Refrigerator" as Storage,
    notes: ""
  });
  const [image, setImage] = useState<string>();
  const [accepted, setAccepted] = useState(false);

  const engineCalc = calculateShelfLife({
    name: f.name || "Food",
    category: f.category,
    storageCondition: f.storage.toLowerCase().includes("refrig") ? "fridge" : f.storage.toLowerCase().includes("freezer") ? "freezer" : "ambient"
  });

  useEffect(() => setAccepted(false), [f.category, f.name]);

  const acceptGuess = () => {
    setF({ ...f, expiry: engineCalc.consumeByDate });
    setAccepted(true);
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!f.name.trim()) {
      toast.error("Give your food a name first.");
      return;
    }
    const days = f.expiry
      ? Math.round((new Date(f.expiry).getTime() - Date.now()) / 864e5)
      : engineCalc.daysRemaining;

    const isVerified = Boolean(f.expiry && f.expiry.trim());
    add(
      {
        id: crypto.randomUUID(),
        name: f.name.trim(),
        category: f.category,
        quantity: f.qty || "1 pcs",
        freshness: 95,
        addedDaysAgo: 0,
        expiresInDays: days,
        storage: f.storage,
        image,
        notes: f.notes || engineCalc.storageRecommendation,
        allergens: [],
        nutrition: { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, nutrients: [] },
        consumeByDate: f.expiry || engineCalc.consumeByDate,
        spoilageRisk: engineCalc.spoilageRisk,
        purchaseDate: f.purchase,
        isVerifiedExpiry: isVerified,
        printedExpiryDate: isVerified ? f.expiry : null,
        estimatedConsumeByDate: f.expiry || engineCalc.consumeByDate,
        spoilageStatus: "FRESH",
        hasCriticalSpoilage: false,
        requiresConfirmation: !isVerified,
        scanMetadata: {
          source: "manual",
          acceptedShelfLifeEstimate: accepted
        }
      },
      null,
      ""
    );
  };

  return (
    <form onSubmit={submit} className="card-surface mx-auto grid max-w-3xl gap-5 p-6 sm:grid-cols-2 sm:p-8">
      <Field label="Food / product name" className="sm:col-span-2">
        <Input placeholder="e.g. Capsicum" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
      </Field>
      <Field label="Category">
        <Select value={f.category} onValueChange={(v) => setF({ ...f, category: v as Category })}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {categories.map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <Field label="Quantity">
        <Input placeholder="e.g. 500 g" value={f.qty} onChange={(e) => setF({ ...f, qty: e.target.value })} />
      </Field>
      <Field label="Purchase date">
        <Input type="date" value={f.purchase} onChange={(e) => setF({ ...f, purchase: e.target.value })} />
      </Field>
      <Field label="Expiry / consume-by">
        <Input type="date" value={f.expiry} onChange={(e) => setF({ ...f, expiry: e.target.value })} />
      </Field>
      {f.name.length > 1 && (
        <div
          className={cn(
            "flex flex-col gap-3 rounded-2xl border p-4 animate-rise sm:col-span-2 sm:flex-row sm:items-center",
            accepted ? "border-primary bg-primary-soft" : "bg-surface"
          )}
        >
          <Sparkles className="h-5 w-5 shrink-0 text-primary" />
          <p className="flex-1 text-sm">
            Shelf Life Engine estimate: <b>{engineCalc.estimatedShelfLifeDays} days</b> (Consume by {engineCalc.consumeByDate}).
          </p>
          <Button type="button" size="sm" variant={accepted ? "soft" : "default"} onClick={acceptGuess}>
            {accepted ? "Applied" : "Accept"}
          </Button>
        </div>
      )}
      <Field label="Storage location">
        <Select value={f.storage} onValueChange={(v) => setF({ ...f, storage: v as Storage })}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {["Refrigerator", "Freezer", "Pantry shelf", "Counter"].map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <Field label="Food image">
        <label className="flex h-10 cursor-pointer items-center gap-2 rounded-md border bg-card px-3 text-sm text-muted-foreground hover:bg-secondary">
          {image ? <img src={image} alt="" className="h-6 w-6 rounded object-cover" /> : <Upload className="h-4 w-4" />}
          {image ? "Change photo" : "Upload photo"}
          <input
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => e.target.files?.[0] && setImage(URL.createObjectURL(e.target.files[0]))}
          />
        </label>
      </Field>
      <Field label="Notes" className="sm:col-span-2">
        <Textarea placeholder="Optional storage notes" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} />
      </Field>
      <Button type="submit" size="lg" className="sm:col-span-2">
        <ScanLine /> Add to Pantry
      </Button>
    </form>
  );
}

function Field({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label className="text-xs font-semibold text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
