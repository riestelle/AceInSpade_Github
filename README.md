## 040-AceInSpade-SenyasPo

SenyasPo is a lightweight, mobile-first Progressive Web Application (PWA) designed to reduce communication barriers faced by Deaf and Hard-of-Hearing (HoH) Filipino commuters who use jeepneys.

Jeepney commuting in many areas relies heavily on verbal interaction—asking about routes, calling out stops, confirming fares, and coordinating payment. SenyasPo provides quick, accessible, low-friction tools that replace or reduce spoken exchanges **without requiring changes to existing transport infrastructure**.

#### Why this exists

Many Deaf/HoH commuters are fully capable of traveling independently, but are excluded by environments that assume hearing and speech. SenyasPo aims to:
- reduce daily friction and misunderstanding,
- improve confidence and safety while commuting,
- support inclusive mobility aligned with accessibility goals (e.g., SDG 11: Sustainable Cities and Communities).

#### Key Features

##### 1) Stop Alerts (GPS + Vibration)
- Set a destination/stop and receive **proximity-based alerts**.
- Uses **device vibration** and clear visual cues to notify when nearing the intended stop.
- Designed for quick glance usage while in motion.

##### 2) Visual Communication Cards (Driver/Conductor)
- Pre-made, high-contrast cards for common messages (e.g., “Para po”, “Dito lang”, “Magkano po?”, “Bayad po”).
- “Show to driver” interaction model: no typing required.

##### 3) Quick Phrases (Large Text)
- Tap-to-display phrases in **large readable text** for fast, non-verbal communication.
- Optimized for glare/bright outdoor use.

##### 4) Offline Fare Calculator (Matrix-based)
- Computes estimated fare using official/known fare matrices.
- Works offline once fare matrices are available on-device (cached).
- Keeps calculations transparent (shows assumptions and parameters where applicable).

##### 5) Route Reference / Guide
- Simple route information view intended for commuters:
  - route names
  - key landmarks
  - common stops
- Designed to be usable offline (cached route data).

##### 6) Conversational AI Route Help (Online)
- Optional AI assistant to help answer route questions (e.g., “How do I get to X from Y?”).
- **Requires internet access**.
- Intended as a convenience layer—not a dependency for core commuting functions.

#### Design Principles

- **Offline-first**: core features should remain usable even without signal.
- **Fast and lightweight**: optimized for low-end Android devices and real commuting conditions.
- **Accessible by default**:
  - high-contrast UI
  - large tap targets
  - minimal typing
  - WCAG-aligned patterns (where feasible)
- **Privacy-respecting**:
  - no unnecessary data collection
  - avoid storing personally identifiable information
  - location is used for alerts on-device (implementation-dependent; see Privacy section)

#### Tech Stack (suggested)

This project is implemented as a **no-install Progressive Web App (PWA)** using standard web technologies:
- HTML/CSS/JavaScript (or TypeScript if preferred)
- Geolocation API (stop proximity)
- Vibration API (alerts; Android support is stronger than iOS)
- Service Worker + Cache Storage (offline support)
- LocalStorage/IndexedDB (persist user settings and cached data)
- Optional: a minimal backend or third-party API for AI assistant (online only)

> Note on platform support: Some web capabilities (notably Vibration API and background behavior) are more limited on iOS Safari. SenyasPo is primarily optimized for Android devices.
---
### Project Structure
```
040-AceInSpade-SenyasPo/
├─ README.md
├─ index.html
├─ manifest.json
├─ sw.js
├─ vercel.json
└─ data/
   ├─ routes.json
```
   └─ stops.json