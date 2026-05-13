# SenyasPo
**by Ace In Spade** — SIKAPTala 2026 Hackathon Entry

> *"How did I ever commute without this?"*

SenyasPo is a mobile-first Progressive Web Application built for **deaf and hard-of-hearing Filipino jeepney commuters**. The jeepney system runs almost entirely on verbal communication — barkers call routes at terminals, drivers announce stops, fares are passed hand-to-hand with spoken confirmation. SenyasPo fills in the specific gaps that make riding one significantly harder for this group, without requiring any changes to existing transport infrastructure.

Supports **SDG 11: Sustainable Cities and Communities**.

---

## The Problem

According to the National Council on Disability Affairs, there are 141,169 registered deaf Filipinos — but the Philippine Federation of the Deaf estimates the true community exceeds **1.1 million**. For these commuters, the barriers are not physical. They are communicative:

- No reliable way to confirm whether an approaching jeepney goes to the right destination
- No way to signal the driver for a stop without speaking
- No way to verify fare or change without a verbal exchange
- No directions without asking a stranger

Combined across a daily commute, these add up to something genuinely exhausting.

---

## Features

### 1. GPS Stop Alerts (Set My Stop)
Set a destination stop before boarding and receive **two-stage proximity alerts**:
- **250m** — soft preparation alert
- **150m** — full screen + vibration alert ("Signal now")

Uses the **Browser Geolocation API**, **Navigator Vibration API**, and **Screen Wake Lock API** to keep the screen on when approaching a stop. No need to stare at the screen the entire ride — distinct vibration patterns (Tactons) communicate timing cues passively.

### 2. I Am Deaf Communication Card
A full-screen, high-contrast card held outward toward the driver or fellow passengers. Displays a customizable stop/destination name in large amber text against a dark background. Bilingual Filipino/English toggle. Saved locally via LocalStorage — no re-entry needed on next use.

### 3. Sabihin Mo — Quick Phrase Cards
One-tap access to the most common jeepney interactions, each expanding to a full-screen display readable at a glance:

| Phrase | Purpose |
|--------|---------|
| **BAYAD PO** | Pass the fare (with amount pre-filled) |
| **PARA PO** | Request a stop |
| **EMERGENCY** | Urgent assistance needed |
| **TAMA BANG JEEP?** | Confirm the correct jeepney |
| **SUKLI KO PO** | Request correct change |

Cards are bilingual and fully offline. Users can also add custom phrases for interactions not covered by the defaults.

### 4. Fare Calculator
Offline fare computation using the **March 2026 LTFRB fare matrix**:
- ₱14.00 base fare (Traditional Jeepney, first 4 km)
- ₱17.00 base fare (Modern Jeepney, first 4 km)
- ₱2.00 per succeeding kilometer (Traditional)

Select origin and destination from preset Metro Manila routes. Input your bill denomination to see exact change owed. Displays the official LTFRB source and last-updated date for transparency. Gives users documented evidence of the correct rate if a driver charges incorrectly.

### 5. Visual Route Reference Card
Renders jeepney route text in the **same bold, condensed, all-caps format** used on actual windshield signage — so users can visually match what they see on passing jeepneys against what the app shows. Includes key landmark stops per route. Stored as a local JSON file; fully offline.

Current route database covers **6 major Metro Manila corridors** with **27 mapped stops**.

### 6. AI Route Assistant *(requires internet)*
A conversational route advisor accepting input in **Filipino, English, or Taglish**. Ask questions like *"Paano ako makakarating sa Quiapo galing Fairview?"* and receive a suggested route, key landmark stops, and estimated fare range.

Powered by **Groq API (llama-3.3-70b-versatile)** via a Vercel serverless function. Clearly marked as internet-required in the UI; visibly disabled when offline. Replaces the need to ask a stranger for directions.

---

## Design System

All screens follow a consistent design optimized for use **in motion, under direct sunlight, with one hand**:

| Element | Specification |
|---------|--------------|
| Background | Deep navy `#0A1628` |
| Primary text | White |
| Accent / highlights | Amber `#FFB800` |
| Alert / card font | Minimum 48px |
| Touch targets | Minimum 56×56px |
| Navigation depth | Flat — all features reachable in one tap from Home |

Contrast levels and text sizes follow **WCAG 2.2 accessibility standards** throughout.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Vanilla JS, HTML5, Bootstrap 5 |
| Offline / PWA | Service Worker API, Cache Storage |
| GPS & Geofencing | Browser Geolocation API |
| Haptic alerts | Navigator Vibration API (Android) |
| Screen management | Screen Wake Lock API |
| Local persistence | LocalStorage |
| Map / stop picker | Leaflet.js (OpenStreetMap tiles, via CDN) |
| AI assistant | Groq API — `llama-3.3-70b-versatile` |
| Backend | Vercel Serverless Functions (Node.js) |
| Deployment | Vercel (free tier) |

> **iOS note:** Safari does not support the Vibration API, so haptic Tactons are unavailable on iPhone. SenyasPo is **optimized for Android**.

---

## Privacy

- No account, login, or installation required
- No personal data collected or sent to any server
- All preferences and saved content stored locally on-device (LocalStorage)
- The only external call is the AI assistant query — it contains no personally identifiable information
- Location data is processed on-device for geofence alerts only

---

## Offline Support

A service worker caches all app assets, route data, and phrase cards on **first load**. After that, all core features (communication cards, fare calculator, route reference, GPS alerts, Sabihin Mo) work with **zero internet connection**. The AI assistant is visibly disabled when offline.

---

## Project Structure

```
040-AceInSpade-SenyasPo/
├── README.md
├── index.html          # Main PWA entry point (all modules)
├── manifest.json       # PWA manifest
├── sw.js               # Service worker (offline caching)
├── vercel.json         # Vercel deployment config
├── package.json
├── api/
│   └── chat.js         # Serverless function — Groq API proxy
└── data/
    ├── routes.json     # 6 Metro Manila jeepney routes
    └── stops.json      # 27 mapped stops with GPS coordinates
```

---

## Deployment

SenyasPo is deployed on **Vercel**. No app store, no account, no installation — a single shared link opens the full application in any modern Android browser.

### Environment Variables (Vercel)

The AI assistant requires Groq API keys set in your Vercel project settings. The serverless function supports up to 5 keys with automatic failover:

```
GROQ_1=your_groq_api_key_here
GROQ_2=optional_fallback_key
GROQ_3=optional_fallback_key
GROQ_4=optional_fallback_key
GROQ_5=optional_fallback_key
```

### Local Development

No build step required. Serve the root directory with any static server:

```bash
# Using npx
npx serve .

# Using Python
python3 -m http.server 8080
```

For the AI assistant to work locally, you'll need to run the Vercel dev environment:

```bash
npm i -g vercel
vercel dev
```

---

## Roadmap

- Expand route database beyond current 6 corridors
- Update fare matrix when LTFRB rates change
- Extend architecture to cover buses and UV Express
- Explore iOS haptic alternatives (audio cues, stronger visual pulses)

---

## References

- Land Transportation Franchising and Regulatory Board. (2026, March). *Fare rate for public utility jeepneys.* https://www.ltfrb.gov.ph/fare-matrix/
- Philippine Federation of the Deaf. *About deafness in the Philippines.* https://www.pfdeaf.org.ph
- Brewster, S. A., & Brown, L. M. (2004). Tactons: Structured tactile messages for non-visual information display. *AUIC 2004*, 28, 15–23.
- World Wide Web Consortium. (2023). *Web Content Accessibility Guidelines (WCAG) 2.2.* https://www.w3.org/TR/WCAG22/
- Republic Act No. 10754. (2016). *An act expanding the benefits and privileges of persons with disability.* Official Gazette of the Republic of the Philippines.
- Romero et al. (2019). Quality of deaf and hard-of-hearing mobile apps. *JMIR mHealth and uHealth*, 7(10), e14198.