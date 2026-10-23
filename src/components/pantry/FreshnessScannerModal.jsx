import { useState, useRef } from "react";
import { identifyAndAnalyzeFood } from "../../services/foodIdentificationService";
import { pantryDb } from "../../services/swiggy/pantryDb";
import { createCalendarReminder } from "../../services/calendarService";

function FreshnessScannerModal({ item, onClose, onItemUpdated }) {
  const [selectedImage, setSelectedImage] = useState(null);
  const [isScanning, setIsScanning] = useState(false);
  const [scanResult, setScanResult] = useState(null);
  const [errorMsg, setErrorMsg] = useState("");
  const fileInputRef = useRef(null);

  if (!item) return null;

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => {
        setSelectedImage(reader.result);
        setScanResult(null);
        setErrorMsg("");
      };
      reader.readAsDataURL(file);
    }
  };

  const handleTriggerScan = async () => {
    if (!selectedImage) {
      setErrorMsg("Please select or capture a photo first.");
      return;
    }

    setIsScanning(true);
    setErrorMsg("");

    try {
      const result = await identifyAndAnalyzeFood({
        imageBase64: selectedImage,
        mode: "photo",
        userSuppliedName: "", // Clear to force visual image identification on the uploaded photo
        userSuppliedCategory: item.category
      });
      setScanResult({
        ...result,
        freshnessScore: result.freshnessScore,
        estimatedRemainingDays: result.remainingDays,
        visualNotes: result.aiExplanation,
        spoilageRisk: result.spoilageRisk,
        recommendation: result.recommendation
      });
    } catch (err) {
      console.error("Freshness scan failed:", err);
      setErrorMsg("Scan failed: " + err.message);
    } finally {
      setIsScanning(false);
    }
  };

  const handleApplyUpdate = async () => {
    if (!scanResult) return;

    // Calculate new consume by date based on estimatedRemainingDays
    const today = new Date();
    const newConsumeBy = new Date(today.getTime() + (scanResult.estimatedRemainingDays * 24 * 60 * 60 * 1000))
      .toISOString().split("T")[0];

    const updated = pantryDb.updateItem(item.id, {
      freshnessScore: scanResult.freshnessScore,
      spoilageRisk: scanResult.spoilageRisk,
      daysRemaining: scanResult.estimatedRemainingDays,
      shelfLifeDays: scanResult.estimatedRemainingDays,
      consumeByDate: newConsumeBy,
      expiryDate: newConsumeBy,
      lastAiScanAt: new Date().toISOString(),
      visualScanNotes: scanResult.visualNotes
    });

    // Automatically create/update Google Calendar event with the new consume by date
    try {
      const calRes = await createCalendarReminder(updated);
      if (calRes.success) {
        pantryDb.updateItem(item.id, {
          calendarEventId: calRes.eventId,
          calendarHtmlLink: calRes.htmlLink,
          calendarStatus: "CREATED_SUCCESSFULLY"
        });
      }
    } catch (calErr) {
      console.error("Calendar update error post AI scan:", calErr);
    }

    if (onItemUpdated) {
      onItemUpdated(updated);
    }
    onClose();
  };

  return (
    <div className="modal-overlay">
      <div className="modal-card scanner-modal">
        <div className="modal-header">
          <div>
            <span className="badge-ai">🤖 GEMINI AI VISION SCAN</span>
            <h2>Analyze Freshness: {item.name}</h2>
          </div>
          <button type="button" className="close-btn" onClick={onClose}>×</button>
        </div>

        <div className="modal-body">
          {/* Image Picker / Preview */}
          <div className="image-preview-container">
            {selectedImage ? (
              <img src={selectedImage} alt="Food scan preview" className="scan-preview-img" />
            ) : (
              <div className="upload-placeholder" onClick={() => fileInputRef.current?.click()}>
                <span className="upload-icon">📸</span>
                <p>Click to upload or capture a photo of <strong>{item.name}</strong></p>
                <span className="sub-text">Supported: JPG, PNG, WebP</span>
              </div>
            )}
            <input
              type="file"
              accept="image/*"
              ref={fileInputRef}
              style={{ display: "none" }}
              onChange={handleFileChange}
            />
          </div>

          {selectedImage && !scanResult && (
            <div className="scanner-actions">
              <button
                type="button"
                className="secondary-btn"
                onClick={() => setSelectedImage(null)}
              >
                Retake Photo
              </button>

              <button
                type="button"
                className="primary-btn scan-btn"
                onClick={handleTriggerScan}
                disabled={isScanning}
              >
                {isScanning ? "🤖 Gemini AI Inspecting..." : "🔍 Run AI Freshness Scan"}
              </button>
            </div>
          )}

          {errorMsg && <div className="scan-error">⚠️ {errorMsg}</div>}

          {/* AI Analysis Result */}
          {scanResult && (
            <div className="scan-results-box">
              <div className="result-header">
                <h3>Freshness Inspection Report</h3>
                <span className={`score-badge score-${scanResult.freshnessScore >= 80 ? 'high' : scanResult.freshnessScore >= 60 ? 'mid' : 'low'}`}>
                  Score: {scanResult.freshnessScore}/100
                </span>
              </div>

              <div className="result-grid">
                <div className="result-metric">
                  <label>Spoilage Risk</label>
                  <span className={`risk-badge risk-${scanResult.spoilageRisk}`}>
                    {scanResult.spoilageRisk.toUpperCase()}
                  </span>
                </div>

                <div className="result-metric">
                  <label>Est. Remaining Life</label>
                  <strong>{scanResult.estimatedRemainingDays} Days</strong>
                </div>

                <div className="result-metric">
                  <label>Inspection Mode</label>
                  <span>{scanResult.isSimulated ? "Demo Simulation" : "Gemini 1.5 Flash"}</span>
                </div>
              </div>

              <div className="result-notes">
                <strong>Visual Notes:</strong>
                <p>{scanResult.visualNotes}</p>
              </div>

              <div className="result-recommendation">
                <strong>Storage Advice:</strong>
                <p>{scanResult.recommendation}</p>
              </div>

              <div className="modal-footer-actions">
                <button
                  type="button"
                  className="secondary-btn"
                  onClick={() => setScanResult(null)}
                >
                  Rescan
                </button>
                <button
                  type="button"
                  className="primary-btn"
                  onClick={handleApplyUpdate}
                >
                  ✅ Apply to Pantry Item
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default FreshnessScannerModal;
