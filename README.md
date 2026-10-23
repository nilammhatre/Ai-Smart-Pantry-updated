# 🥬 AI Smart Pantry & Food Freshness Analyzer

An end-to-end, production-style AI-powered food pantry management system. It combines multi-stage food identification, barcode lookup, OCR label scanning, Gemini AI visual freshness reasoning, deterministic shelf-life engines, automated Google Calendar and WhatsApp Cloud API notifications, zero-waste recipe recommendations, and Swiggy Instamart grocery integration.

---

## 🏗️ System Architecture

```
                               ┌─────────────────────────┐
                               │     React UI / UX       │
                               │  AI Smart Pantry App    │
                               └────────────┬────────────┘
                                            │
                              Unified Service & API Layer
                                            │
   ┌───────────────────────┬────────────────┼───────────────────────┬────────────────────────┐
   │                       │                │                       │                        │
Gemini 1.5 Flash      Open Food Facts  OCR Label Engine     Food Master Knowledge    Deterministic Shelf-Life
Vision & Assistant       Barcode API     (Date Normalizer)      Base (Indian Foods)            Engine
   │                       │                │                       │                        │
   └───────────────────────┴────────────────┼───────────────────────┴────────────────────────┘
                                            │
                                ┌───────────┴───────────┐
                                │     Pantry Database   │
                                └───────────┬───────────┘
                                            │
                ┌───────────────────────────┴───────────────────────────┐
                │                                                       │
   Google Calendar API (OAuth 2.0)                          Meta WhatsApp Cloud API (v18.0)
   (Dual Event Sync & Removal)                              (Automated Expiry Alerts)
```

---

## 🚀 Key Features & Services

1. **Multi-Stage Food Identification Pipeline**:
   - Priority 1: Real-time **Open Food Facts** API barcode lookup (Nutrition, Allergens, Brand, Images, Ingredients).
   - Priority 2: Optical Character Recognition (**OCR**) label reader for Expiry, Manufacturing Date, Best Before, and Batch numbers.
   - Priority 3: **Gemini 1.5 Flash Vision** AI visual inspection for unlabelled/ambiguous produce.
   - Priority 4: **Food Master DB** keyword matching & confidence scoring (`>=90% High`, `70-89% Medium`, `<70% Confirmation`).

2. **Deterministic Shelf-Life Engine**:
   - Expiry Priority Hierarchy: Manufacturer Label Expiry > User-Provided Expiry > Food Master Baseline + Freshness Score Multiplier.
   - Calculates exact consume-by date, remaining days, spoilage risk (`low`, `medium`, `high`), and storage advice.

3. **Automated Reminders & Multi-Channel Alerts**:
   - **Google Calendar API (OAuth 2.0)**: Background dual-event scheduling (1-day before expiry + date of expiry). Auto-removes event when item is deleted from pantry.
   - **Meta WhatsApp Business Cloud API (REST v18.0)**: Background messaging with Meta `hello_world` template fallback outside 24h conversation windows.

4. **Zero-Waste Recipe Engine**:
   - Evaluates pantry ingredients and ranks recipes by how many items expiring within 3 days they rescue.
   - Gemini AI zero-waste custom recipe generation.

5. **AI Pantry Assistant**:
   - Answers natural language questions ("What should I eat today?", "What expires soon?", "What to buy?").
   - Includes anti-prompt-injection sanitization and isolated user context.

6. **Swiggy Instamart Grocery Integration**:
   - Low-stock detection, category grouping, estimated total calculation, and Instamart cart/simulation dispatch.

7. **Food Waste Analytics**:
   - Dynamic real-time calculation of food saved (count), money saved (₹), waste prevented (kg), and CO₂ avoided (kg).

---

## 🛠️ Setup & Environment Variables

Copy `.env.example` to `.env` and configure your credentials:

```bash
cp .env.example .env
```

### Required `.env` Variables

```env
# Gemini AI
GEMINI_AI_API_KEY=your_gemini_api_key

# Google Calendar OAuth 2.0
VITE_GOOGLE_CALENDAR_CLIENT_ID=your_client_id.apps.googleusercontent.com
VITE_GOOGLE_CALENDAR_CLIENT_SECRET=your_client_secret
VITE_GOOGLE_CALENDAR_REFRESH_TOKEN=your_refresh_token
VITE_GOOGLE_CALENDAR_ACCESS_TOKEN=your_access_token

# Meta WhatsApp Business Cloud API
VITE_WHATSAPP_PHONE_NUMBER_ID=1331349083399418
VITE_WHATSAPP_ACCESS_TOKEN=your_whatsapp_access_token
VITE_WHATSAPP_RECIPIENT_PHONE=+919322348511

# Swiggy / Instamart Integration
VITE_SWIGGY_CLIENT_ID=demo_client_id
VITE_SWIGGY_DEFAULT_MODE=mock
```

---

## 💻 Development & Build Commands

```bash
# Install dependencies
npm install

# Start local dev server (Vite + TanStack Start)
npm run dev

# Run Vitest test suite
npm run test

# Type-check & lint
npm run lint

# Build production bundle
npm run build
```

---

## 🛡️ Food Safety Disclaimer

Visual AI freshness scores and shelf-life numbers are estimates generated via image reasoning and standard food storage reference rules. AI cannot guarantee biological food safety. Physical inspection and appropriate food safety guidelines must always be followed.
