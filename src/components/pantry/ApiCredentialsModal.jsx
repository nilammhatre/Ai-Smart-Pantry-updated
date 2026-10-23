import { useState, useEffect } from "react";
import { requestGoogleOAuthToken, getStoredGoogleAccessToken, getStoredGoogleRefreshToken, setStoredGoogleRefreshToken, refreshGoogleAccessToken, createCalendarEvent } from "../../services/calendarService";
import { getWhatsAppConfig, setWhatsAppConfig, sendWhatsAppAlert } from "../../services/whatsappService";
import { swiggyService } from "../../services/swiggy/swiggyService";

const DEFAULT_DEMO_CLIENT_ID = import.meta.env.VITE_GOOGLE_CALENDAR_CLIENT_ID || "";
const DEFAULT_DEMO_CLIENT_SECRET = import.meta.env.VITE_GOOGLE_CALENDAR_CLIENT_SECRET || "";
const DEFAULT_DEMO_PHONE_ID = import.meta.env.VITE_WHATSAPP_PHONE_NUMBER_ID || "";
const DEFAULT_DEMO_TOKEN = import.meta.env.VITE_WHATSAPP_ACCESS_TOKEN || "";
const DEFAULT_DEMO_RECIPIENT = import.meta.env.VITE_WHATSAPP_RECIPIENT_PHONE || "";

function ApiCredentialsModal({ onClose }) {
  const initialWa = getWhatsAppConfig();

  const [geminiApiKey, setGeminiApiKey] = useState(() =>
    localStorage.getItem("smart_pantry_gemini_api_key") || import.meta.env.VITE_GEMINI_AI_API_KEY || import.meta.env.GEMINI_AI_API_KEY || ""
  );

  const [googleClientId, setGoogleClientId] = useState(() =>
    import.meta.env.VITE_GOOGLE_CALENDAR_CLIENT_ID || localStorage.getItem("smart_pantry_google_client_id") || DEFAULT_DEMO_CLIENT_ID
  );
  const [googleClientSecret, setGoogleClientSecret] = useState(() =>
    import.meta.env.VITE_GOOGLE_CALENDAR_CLIENT_SECRET || localStorage.getItem("smart_pantry_google_client_secret") || DEFAULT_DEMO_CLIENT_SECRET
  );
  const [googleRefreshToken, setGoogleRefreshToken] = useState(getStoredGoogleRefreshToken());
  const [googleToken, setGoogleToken] = useState(getStoredGoogleAccessToken());
  const [isAuthorizingGoogle, setIsAuthorizingGoogle] = useState(false);

  const [waPhoneId, setWaPhoneId] = useState(() => import.meta.env.VITE_WHATSAPP_PHONE_NUMBER_ID || initialWa.phoneNumberId || DEFAULT_DEMO_PHONE_ID);
  const [waToken, setWaToken] = useState(() => import.meta.env.VITE_WHATSAPP_ACCESS_TOKEN || initialWa.accessToken || DEFAULT_DEMO_TOKEN);
  const [waRecipient, setWaRecipient] = useState(() => import.meta.env.VITE_WHATSAPP_RECIPIENT_PHONE || initialWa.recipientPhone || DEFAULT_DEMO_RECIPIENT);
  const [useWaTemplate, setUseWaTemplate] = useState(true);

  const [swiggyMode, setSwiggyMode] = useState(() => swiggyService.getMode());
  const [swiggyClientId, setSwiggyClientId] = useState(() => import.meta.env.VITE_SWIGGY_CLIENT_ID || localStorage.getItem("swiggy_client_id") || "swiggy_dev_app_client_id_xyz");
  const [swiggyMcpEndpoint, setSwiggyMcpEndpoint] = useState(() => import.meta.env.VITE_SWIGGY_IM_MCP_ENDPOINT || localStorage.getItem("swiggy_mcp_endpoint") || "https://mcp.swiggy.com/im");
  const [swiggyConnected, setSwiggyConnected] = useState(() => swiggyService.isConnected());

  const [isTesting, setIsTesting] = useState(false);
  const [testLogs, setTestLogs] = useState([]);
  const [statusMsg, setStatusMsg] = useState("");

  useEffect(() => {
    setGoogleToken(getStoredGoogleAccessToken());
    setGoogleRefreshToken(getStoredGoogleRefreshToken());
  }, []);

  const handleAutoConfigureDemo = () => {
    setGoogleClientId(DEFAULT_DEMO_CLIENT_ID);
    setGoogleClientSecret(DEFAULT_DEMO_CLIENT_SECRET);
    setWaPhoneId(DEFAULT_DEMO_PHONE_ID);
    setWaToken(DEFAULT_DEMO_TOKEN);
    setWaRecipient(DEFAULT_DEMO_RECIPIENT);
    localStorage.setItem("smart_pantry_google_client_id", DEFAULT_DEMO_CLIENT_ID);
    localStorage.setItem("smart_pantry_google_client_secret", DEFAULT_DEMO_CLIENT_SECRET);
    setWhatsAppConfig({
      phoneNumberId: DEFAULT_DEMO_PHONE_ID,
      accessToken: DEFAULT_DEMO_TOKEN,
      recipientPhone: DEFAULT_DEMO_RECIPIENT
    });
    setStatusMsg("⚡ Pre-configured Google Client ID, Secret & WhatsApp recipient (+919322348511)!");
  };

  const handleConnectGoogle = async () => {
    setIsAuthorizingGoogle(true);
    setStatusMsg("");
    try {
      const activeId = googleClientId || DEFAULT_DEMO_CLIENT_ID;
      localStorage.setItem("smart_pantry_google_client_id", activeId);
      const token = await requestGoogleOAuthToken(activeId);
      setGoogleToken(token);
      setStatusMsg("✅ Google Account Authorized Successfully! Access Token granted.");
    } catch (err) {
      console.error("Google OAuth Authorization failed:", err);
      setStatusMsg(`❌ Google OAuth Notice: ${err.message}`);
    } finally {
      setIsAuthorizingGoogle(false);
    }
  };

  const handleManualRefreshToken = async () => {
    setStatusMsg("⏳ Exchanging Refresh Token for fresh Google Access Token...");
    const newToken = await refreshGoogleAccessToken();
    if (newToken) {
      setGoogleToken(newToken);
      setStatusMsg("✅ Refreshed Google Access Token successfully using Refresh Token!");
    } else {
      setStatusMsg("❌ Refresh Token exchange failed. Ensure Client Secret & Refresh Token are valid.");
    }
  };

  const handleSaveCredentials = (e) => {
    if (e) e.preventDefault();
    localStorage.setItem("smart_pantry_gemini_api_key", geminiApiKey.trim());
    localStorage.setItem("smart_pantry_google_client_id", googleClientId);
    localStorage.setItem("smart_pantry_google_client_secret", googleClientSecret);
    localStorage.setItem("swiggy_client_id", swiggyClientId);
    localStorage.setItem("swiggy_mcp_endpoint", swiggyMcpEndpoint);
    swiggyService.setMode(swiggyMode);
    setStoredGoogleRefreshToken(googleRefreshToken);
    setWhatsAppConfig({
      phoneNumberId: waPhoneId,
      accessToken: waToken,
      recipientPhone: waRecipient
    });
    setStatusMsg("💾 API & Swiggy Developer Platform credentials saved successfully!");
  };

  const handleRunTestNotification = async () => {
    setIsTesting(true);
    setStatusMsg("🚀 Dispatching real API test notification...");
    setTestLogs([]);
    handleSaveCredentials();

    const sampleTestItem = {
      name: "Fresh Organic Spinach (Palak)",
      category: "Vegetables",
      quantity: 250,
      unit: "g",
      consumeByDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
      daysRemaining: 2,
      status: "soon",
      spoilageRisk: "high",
      storageRecommendation: "Refrigerate in crisp drawer in paper towel"
    };

    const logsArray = [];

    // 1. Test Google Calendar API
    try {
      const calRes = await createCalendarEvent(sampleTestItem);
      logsArray.push({
        name: "1. Google Calendar API (POST /v3/calendars/primary/events)",
        success: calRes.success,
        data: calRes.logPayload || calRes
      });
    } catch (err) {
      logsArray.push({
        name: "1. Google Calendar API Execution Error",
        success: false,
        data: { error: err.message }
      });
    }

    // 2. Test WhatsApp Cloud API
    try {
      const waRes = await sendWhatsAppAlert([sampleTestItem], {
        overridePhone: waRecipient,
        useTemplate: useWaTemplate
      });
      logsArray.push({
        name: "2. WhatsApp Business Cloud API (POST /v18.0/{phone_id}/messages)",
        success: waRes.success,
        data: waRes.logPayload || waRes
      });
    } catch (err) {
      logsArray.push({
        name: "2. WhatsApp Business Cloud API Execution Error",
        success: false,
        data: { error: err.message }
      });
    }

    // 3. Test Swiggy Developer Platform (Orders Tool Call)
    try {
      const orders = await swiggyService.getOrders();
      logsArray.push({
        name: `3. Swiggy Developer Platform (${swiggyService.getMode().toUpperCase()} Mode get_orders)`,
        success: true,
        data: {
          serviceMode: swiggyService.getMode(),
          connected: swiggyService.isConnected(),
          ordersCount: orders ? orders.length : 0,
          ordersList: orders ? orders.slice(0, 2) : []
        }
      });
    } catch (err) {
      logsArray.push({
        name: "3. Swiggy Developer Platform Execution Error",
        success: false,
        data: { error: err.message }
      });
    }

    setTestLogs(logsArray);
    setIsTesting(false);

    const waLog = logsArray.find(l => l.name.includes("WhatsApp"));
    const allPassed = logsArray.every(l => l.success);

    if (allPassed) {
      setStatusMsg("🎉 All API notifications sent successfully! Check your Google Calendar & WhatsApp (+919322348511).");
    } else if (waLog && !waLog.success && waLog.data?.isTokenExpired) {
      setStatusMsg("⚠️ WhatsApp Delivery Notice: Meta Access Token has EXPIRED (OAuth Code 190). Update token in Meta Portal or use '📱 Direct WhatsApp Link' below!");
    } else {
      setStatusMsg("⚠️ Test execution completed. See detailed API request/response logs below.");
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-card api-config-modal">
        <div className="modal-header">
          <div>
            <span className="badge-ai">⚡ AUTOMATED API SETTINGS</span>
            <h2>Google Calendar & WhatsApp Cloud API</h2>
          </div>
          <button type="button" className="close-btn" onClick={onClose}>×</button>
        </div>

        <div className="modal-body">
          {statusMsg && <div className="status-banner">{statusMsg}</div>}

          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "16px" }}>
            <button type="button" className="secondary-btn" onClick={handleAutoConfigureDemo}>
              ⚡ Auto-Fill Working Test Credentials
            </button>
          </div>

          {/* Section 0: Google Gemini AI API Key */}
          <div className="api-section-card">
            <div className="section-title">
              <span className="icon">🤖</span>
              <div>
                <h3>Google Gemini AI API Key (Multimodal Vision & Assistant)</h3>
                <p>Powers live Computer Vision food identification, Expiry OCR reading, and Pantry AI chat</p>
              </div>
            </div>

            <div className="form-group-inline">
              <label>Gemini API Key</label>
              <input
                type="password"
                placeholder="AIzaSy..."
                value={geminiApiKey}
                onChange={(e) => setGeminiApiKey(e.target.value)}
              />
            </div>
            <p className="help-text" style={{ fontSize: "11px", color: "#6b7280", marginTop: "4px" }}>
              Get a free API key from <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" style={{ color: "#3b82f6", textDecoration: "underline" }}>Google AI Studio</a>. If blank, the app uses the self-contained offline AgriFreshNET ML engine.
            </p>
          </div>

          {/* Section 1: Google Calendar OAuth 2.0 API */}
          <div className="api-section-card">
            <div className="section-title">
              <span className="icon">📅</span>
              <div>
                <h3>Google Calendar API (OAuth 2.0)</h3>
                <p>Automated background event creation using Google Calendar REST API v3</p>
              </div>
            </div>

            <div className="form-group-inline">
              <label>Google OAuth Client ID</label>
              <input
                type="text"
                placeholder="Enter your Google Client ID"
                value={googleClientId}
                onChange={(e) => setGoogleClientId(e.target.value)}
              />
            </div>

            <div className="form-group-inline">
              <label>Google Client Secret</label>
              <input
                type="password"
                placeholder="Enter your Google Client Secret"
                value={googleClientSecret}
                onChange={(e) => setGoogleClientSecret(e.target.value)}
              />
            </div>

            <div className="form-group-inline">
              <label>OAuth Refresh Token (Offline Access)</label>
              <input
                type="password"
                placeholder="1//0g..."
                value={googleRefreshToken}
                onChange={(e) => setGoogleRefreshToken(e.target.value)}
              />
            </div>

            <div className="auth-status-row" style={{ marginTop: "12px", gap: "10px", flexWrap: "wrap" }}>
              <span className={`token-status-pill ${googleToken ? "active" : "inactive"}`}>
                {googleToken ? "🟢 Google Account Connected (Token Active)" : "🔴 Token Unset or Expired"}
              </span>

              <button
                type="button"
                className="secondary-btn"
                onClick={handleConnectGoogle}
                disabled={isAuthorizingGoogle}
              >
                {isAuthorizingGoogle ? "Authorizing..." : "🔑 Authorize Account"}
              </button>

              <button
                type="button"
                className="secondary-btn"
                onClick={handleManualRefreshToken}
                title="Exchange Refresh Token for a fresh short-lived Access Token"
              >
                🔄 Refresh Access Token
              </button>
            </div>
          </div>

          {/* Section 2: Meta WhatsApp Business Cloud API */}
          <div className="api-section-card">
            <div className="section-title">
              <span className="icon">💬</span>
              <div>
                <h3>WhatsApp Business Cloud API</h3>
                <p>Direct REST API delivery to recipient WhatsApp numbers</p>
              </div>
            </div>

            <div className="form-grid-2">
              <div className="form-group">
                <label>Phone Number ID</label>
                <input
                  type="text"
                  placeholder="105938472910485"
                  value={waPhoneId}
                  onChange={(e) => setWaPhoneId(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label>Recipient Phone Number (E.164 / India)</label>
                <input
                  type="tel"
                  placeholder="+919322348511"
                  value={waRecipient}
                  onChange={(e) => setWaRecipient(e.target.value)}
                />
              </div>
            </div>

            <div className="form-group">
              <label>Meta Access Token (Temporary / Permanent)</label>
              <input
                type="password"
                placeholder="EAAGm0PX4ZCpsBAK9182736450..."
                value={waToken}
                onChange={(e) => setWaToken(e.target.value)}
              />
            </div>

            <div className="checkbox-row">
              <label>
                <input
                  type="checkbox"
                  checked={useWaTemplate}
                  onChange={(e) => setUseWaTemplate(e.target.checked)}
                />
                Use Meta Approved Template Message (<code>hello_world</code> test format)
              </label>
            </div>
          </div>

          {/* Section 3: Swiggy Developer Platform (OAuth 2.1 PKCE & Instamart MCP) */}
          <div className="api-section-card">
            <div className="section-title">
              <span className="icon">🛵</span>
              <div>
                <h3>Swiggy Developer Platform (OAuth 2.1 PKCE & MCP)</h3>
                <p>Read-only Swiggy Instamart order imports & cart JSON-RPC SSE tool calls</p>
              </div>
            </div>

            <div className="form-grid-2">
              <div className="form-group">
                <label>Integration Service Mode</label>
                <select
                  value={swiggyMode}
                  onChange={(e) => {
                    const newMode = e.target.value;
                    swiggyService.setMode(newMode);
                    setSwiggyMode(newMode);
                    setSwiggyConnected(swiggyService.isConnected());
                  }}
                  style={{ width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid var(--border)", backgroundColor: "var(--card)", color: "var(--foreground)", fontSize: "13px" }}
                >
                  <option value="mock">🧪 Demo / Mock Mode (Simulated Orders)</option>
                  <option value="real">🔑 Real Swiggy Developer OAuth 2.1 PKCE</option>
                </select>
              </div>

              <div className="form-group">
                <label>Swiggy Client ID (Developer Portal)</label>
                <input
                  type="text"
                  placeholder="swiggy_dev_app_client_id_xyz"
                  value={swiggyClientId}
                  onChange={(e) => setSwiggyClientId(e.target.value)}
                />
              </div>
            </div>

            <div className="form-group">
              <label>Swiggy Instamart MCP Endpoint (SSE)</label>
              <input
                type="text"
                placeholder="https://mcp.swiggy.com/im"
                value={swiggyMcpEndpoint}
                onChange={(e) => setSwiggyMcpEndpoint(e.target.value)}
              />
            </div>

            <div className="auth-status-row" style={{ marginTop: "12px", gap: "10px", flexWrap: "wrap", alignItems: "center", display: "flex" }}>
              <span className={`token-status-pill ${swiggyConnected ? "active" : "inactive"}`}>
                {swiggyConnected
                  ? `🟢 Connected to Swiggy (${swiggyMode.toUpperCase()} Mode)`
                  : `🔴 Disconnected (${swiggyMode.toUpperCase()} Mode)`}
              </span>

              {!swiggyConnected ? (
                <button
                  type="button"
                  className="secondary-btn"
                  onClick={async () => {
                    try {
                      localStorage.setItem("swiggy_client_id", swiggyClientId);
                      localStorage.setItem("swiggy_mcp_endpoint", swiggyMcpEndpoint);
                      await swiggyService.login();
                      setSwiggyConnected(swiggyService.isConnected());
                      setStatusMsg("✅ Swiggy Session Connected!");
                    } catch (err) {
                      setStatusMsg(`❌ Swiggy Connect Error: ${err.message}`);
                    }
                  }}
                >
                  🔌 Connect Swiggy Developer Account
                </button>
              ) : (
                <button
                  type="button"
                  className="secondary-btn"
                  style={{ color: "#ef4444", borderColor: "rgba(239,68,68,0.4)" }}
                  onClick={async () => {
                    await swiggyService.logout();
                    setSwiggyConnected(false);
                    setStatusMsg("Disconnected from Swiggy account.");
                  }}
                >
                  Disconnect Swiggy Session
                </button>
              )}
            </div>
          </div>

          {/* Test & Action Buttons */}
          <div className="api-modal-footer">
            <button type="button" className="secondary-btn" onClick={handleSaveCredentials}>
              💾 Save Credentials
            </button>

            <a
              href={`https://api.whatsapp.com/send?phone=${(waRecipient || "919322348511").replace(/[^\d]/g, "")}&text=${encodeURIComponent("🥬 *Smart Pantry Test Alert* 🚨\n\nFresh Organic Spinach (Palak) is approaching expiry limit. Consume within 2 days.\n\n_Automated test notification_")}`}
              target="_blank"
              rel="noopener noreferrer"
              className="secondary-btn text-emerald-600 border-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-950/30"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
            >
              📱 Direct WhatsApp Link
            </a>

            <button
              type="button"
              className="primary-btn test-api-btn"
              onClick={handleRunTestNotification}
              disabled={isTesting}
            >
              {isTesting ? "⏳ Testing APIs..." : "🚀 Send Test Notification"}
            </button>
          </div>

          {/* Raw API Execution Logs */}
          {testLogs.length > 0 && (
            <div className="api-logs-container">
              <h4>Live Request & Response Logs</h4>
              {testLogs.map((log, idx) => (
                <div key={idx} className={`api-log-card ${log.success ? "success" : "failure"}`}>
                  <div className="log-header">
                    <strong>{log.name}</strong>
                    <span className={`log-badge ${log.success ? "pass" : "fail"}`}>
                      {log.success ? "200 OK / SUCCESS" : "LOGGED / STATUS"}
                    </span>
                  </div>
                  <pre className="log-json">
                    {JSON.stringify(log.data, null, 2)}
                  </pre>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default ApiCredentialsModal;
