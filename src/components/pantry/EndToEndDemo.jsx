import { useState } from "react";
import mockOrders from "../../services/swiggy/mockOrders.json";
import { normalizeOrder } from "../../services/swiggy/normalizer";
import { pantryDb } from "../../services/swiggy/pantryDb";
import { analyzeFoodFreshness } from "../../services/geminiFreshnessService";
import { createCalendarEvent } from "../../services/calendarService";
import { sendWhatsAppAlert } from "../../services/whatsappService";
import { ShoppingCart, Zap, Sparkles, Calendar, MessageSquare, Play, CheckCircle2, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

function EndToEndDemo() {
  const [activeStep, setActiveStep] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [demoLog, setDemoLog] = useState([]);

  const addLog = (step, title, data) => {
    setDemoLog(prev => [
      ...prev,
      {
        id: Date.now() + Math.random(),
        step,
        title,
        timestamp: new Date().toLocaleTimeString(),
        data
      }
    ]);
  };

  const handleRunFullDemo = async () => {
    setIsRunning(true);
    setDemoLog([]);
    setActiveStep(1);

    try {
      // Step 1: Select & Normalize Mock Instamart Order
      const rawOrder = mockOrders.orders[0]; // Order #ORD-2026-8891
      const normalized = normalizeOrder(rawOrder);
      addLog(1, "🛒 Swiggy Instamart Order Received & Extracted", {
        orderId: normalized.orderId,
        deliveredAt: normalized.deliveredAt,
        itemCount: normalized.foodItems.length,
        extractedItems: normalized.foodItems.map(i => `${i.name} (${i.quantity} ${i.unit}) — ₹${i.price}`)
      });

      await new Promise(r => setTimeout(r, 900));

      // Step 2: Shelf-Life Engine & Pantry DB Import
      setActiveStep(2);
      const imported = pantryDb.addItems(normalized.foodItems, false);
      addLog(2, "⚡ Smart Pantry DB & Shelf-Life Engine Processed Items", imported.map(item => ({
        name: item.name,
        category: item.category,
        deliveredAt: item.receivedAt,
        estimatedShelfLifeDays: item.estimatedShelfLifeDays,
        consumeByDate: item.consumeByDate,
        spoilageRisk: item.spoilageRisk,
        status: item.status
      })));

      await new Promise(r => setTimeout(r, 900));

      // Step 3: Gemini Vision AI Scan simulation on Spinach / Milk
      setActiveStep(3);
      const targetItem = imported.find(i => i.name.toLowerCase().includes("spinach") || i.name.toLowerCase().includes("milk")) || imported[0];
      const scanRes = await analyzeFoodFreshness("data:image/png;base64,mock", targetItem);
      
      const updatedItem = pantryDb.updateItem(targetItem.id, {
        freshnessScore: scanRes.freshnessScore,
        spoilageRisk: scanRes.spoilageRisk,
        daysRemaining: scanRes.estimatedRemainingDays
      }, false);

      addLog(3, `🤖 Gemini Vision Scan: ${updatedItem?.name || targetItem.name}`, {
        freshnessScore: `${scanRes.freshnessScore}/100`,
        visualNotes: scanRes.visualNotes,
        spoilageRisk: scanRes.spoilageRisk,
        recommendation: scanRes.recommendation
      });

      await new Promise(r => setTimeout(r, 900));

      // Step 4: Google Calendar Event Reminder Sync
      setActiveStep(4);
      const expiringItem = imported.find(i => i.status === "soon" || i.status === "expired") || imported[0];
      const calRes = await createCalendarEvent(expiringItem);
      addLog(4, "📅 Google Calendar Reminder Event Created via OAuth API", {
        summary: `Use ${expiringItem.name} Before Expiry!`,
        eventId: calRes.googleCalendarEventId || calRes.calendarEventId || "gcal_mock_id",
        consumeBy: expiringItem.consumeByDate,
        syncStatus: calRes.calendarSyncStatus || "SYNCED"
      });

      await new Promise(r => setTimeout(r, 900));

      // Step 5: WhatsApp Cloud API Expiry Alert
      setActiveStep(5);
      const waRes = await sendWhatsAppAlert([expiringItem]);
      addLog(5, "💬 WhatsApp Expiry Alert Dispatched via Cloud API", {
        messageId: waRes.messageId || "wamid.mock_12345",
        recipient: waRes.recipient || "+91 9876543210",
        formattedAlertMessage: `🚨 *AI Smart Pantry Alert*\nItem *${expiringItem.name}* expires in ${expiringItem.daysRemaining} days. Please consume by ${expiringItem.consumeByDate}.`
      });

    } catch (err) {
      console.error("End-to-End Demo failed:", err);
      addLog(0, "❌ Pipeline Error", { error: err.message });
    } finally {
      setIsRunning(false);
    }
  };

  const steps = [
    { num: 1, label: "Instamart Order", icon: ShoppingCart },
    { num: 2, label: "Smart Pantry DB", icon: Zap },
    { num: 3, label: "Gemini AI Vision", icon: Sparkles },
    { num: 4, label: "Google Calendar", icon: Calendar },
    { num: 5, label: "WhatsApp Alert", icon: MessageSquare }
  ];

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-emerald-900/40 via-emerald-800/30 to-teal-900/40 border border-emerald-500/30 p-6 text-foreground shadow-lg">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-400 text-xs font-bold uppercase tracking-wider border border-emerald-500/30">
              ✨ Automated Project Workflow
            </span>
            <h3 className="text-xl font-bold text-foreground">Instamart → Smart Pantry → AI Pipeline</h3>
            <p className="text-xs text-muted-foreground max-w-xl">
              Demonstrates automatic item extraction, unit parsing, shelf-life calculation, Gemini vision scan, calendar sync & WhatsApp alerts without actual purchasing.
            </p>
          </div>

          <Button
            onClick={handleRunFullDemo}
            disabled={isRunning}
            className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm px-5 py-2.5 rounded-xl shadow-lg shrink-0 flex items-center gap-2"
          >
            {isRunning ? (
              <>
                <span className="h-4 w-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                Executing Pipeline...
              </>
            ) : (
              <>
                <Play className="h-4 w-4 fill-current" />
                Run End-to-End Demo
              </>
            )}
          </Button>
        </div>

        {/* Stepper */}
        <div className="mt-6 pt-6 border-t border-emerald-500/20 grid grid-cols-5 gap-2 text-center">
          {steps.map((s) => {
            const Icon = s.icon;
            const isDone = activeStep >= s.num;
            const isCurrent = activeStep === s.num;

            return (
              <div key={s.num} className="flex flex-col items-center gap-1.5">
                <div
                  className={`h-10 w-10 rounded-2xl flex items-center justify-center transition-all ${
                    isCurrent
                      ? "bg-emerald-500 text-white ring-4 ring-emerald-500/30 scale-110 shadow-lg"
                      : isDone
                      ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40"
                      : "bg-secondary/60 text-muted-foreground border border-border"
                  }`}
                >
                  {isDone ? <CheckCircle2 className="h-5 w-5" /> : <Icon className="h-5 w-5" />}
                </div>
                <span className={`text-[11px] font-semibold ${isCurrent ? "text-emerald-400" : isDone ? "text-foreground" : "text-muted-foreground"}`}>
                  {s.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Execution Logs */}
      <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h4 className="font-semibold text-sm flex items-center gap-2">
            <span>📋 Pipeline Live Execution Logs</span>
            {demoLog.length > 0 && (
              <span className="px-2 py-0.5 rounded-full text-xs bg-emerald-500/10 text-emerald-500 font-bold">
                {demoLog.length} / 5 completed
              </span>
            )}
          </h4>
        </div>

        {demoLog.length === 0 ? (
          <div className="py-12 text-center text-muted-foreground space-y-2">
            <span className="text-3xl">🛵</span>
            <p className="text-sm font-medium">Click "Run End-to-End Demo" to see the complete automated workflow in real-time.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {demoLog.map((log) => (
              <div
                key={log.id}
                className="rounded-xl border border-border bg-surface/70 p-4 space-y-2 animate-rise"
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-sm text-emerald-600 dark:text-emerald-400 flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4" /> Step {log.step}: {log.title}
                  </span>
                  <span className="text-xs text-muted-foreground font-mono">{log.timestamp}</span>
                </div>

                <pre className="p-3 rounded-lg bg-black/40 text-emerald-300 text-xs font-mono overflow-x-auto border border-white/5">
                  {JSON.stringify(log.data, null, 2)}
                </pre>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default EndToEndDemo;
