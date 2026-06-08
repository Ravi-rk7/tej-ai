# TejAi Frontend — Full SaaS Implementation Plan

## Overview

Building a complete, production-grade Next.js 14 frontend for **TejAi**, an AI-powered skincare SaaS app. The project currently has a nearly empty Next.js scaffold. We'll build all key pages by translating the Stitch design files (which use plain HTML/Tailwind CDN) into modular Next.js App Router components with Tailwind CSS v4, TypeScript-compatible JS, and a premium UI system.

## Design System (from Stitch designs)

| Token | Value |
|---|---|
| Primary | `#5845cb` (purple) |
| Secondary Container | `#a88bff` (light purple) |
| Surface | `#fcf8ff` (off-white) |
| On-surface | `#1a1930` (deep navy) |
| On-surface variant | `#474554` |
| Fonts | Plus Jakarta Sans (headlines), Inter (body) |

## Pages to Build

| Route | Page | Design Source |
|---|---|---|
| `/` | Landing Page | `tej_ai_landing_page/code.html` |
| `/scan` | Face Scan Upload | `tej_ai_face_scan_with_sidebar_1/code.html` |
| `/results` | Skin Results | `tej_ai_scan_results_fixed/code.html` |
| `/dashboard` | User Dashboard | `tej_ai_dashboard/code.html` |
| `/history` | Scan History | `tej_ai_history_tracking_refined_1/code.html` |
| `/pricing` | Pricing/Plans | `tej_ai_choose_your_plan/code.html` |

## Proposed File Structure

```
src/
├── app/
│   ├── layout.js          [MODIFY] — Root layout with fonts, metadata
│   ├── globals.css        [MODIFY] — Design tokens, base styles
│   ├── page.js            [MODIFY] — Landing page
│   ├── scan/
│   │   └── page.js        [NEW] — Scan upload page
│   ├── results/
│   │   └── page.js        [NEW] — Scan results page
│   ├── dashboard/
│   │   └── page.js        [NEW] — User dashboard
│   ├── history/
│   │   └── page.js        [NEW] — History tracking
│   └── pricing/
│       └── page.js        [NEW] — Pricing page
└── components/
    ├── layout/
    │   ├── Navbar.js       [NEW] — Public top nav (landing, pricing)
    │   ├── Sidebar.js      [NEW] — App sidebar (dashboard, scan, results, history)
    │   └── Footer.js       [NEW] — Footer
    ├── landing/
    │   ├── HeroSection.js  [NEW]
    │   ├── FeaturesGrid.js [NEW]
    │   ├── HowItWorks.js   [NEW]
    │   └── PricingSection.js [NEW]
    ├── dashboard/
    │   ├── GlowScoreCard.js [NEW]
    │   ├── SkinStatusCards.js [NEW]
    │   └── DailyScanCard.js [NEW]
    ├── results/
    │   ├── GlowScoreCircle.js [NEW]
    │   ├── SkinProfile.js  [NEW]
    │   └── RoutineCard.js  [NEW]
    ├── scan/
    │   └── ScanUploader.js [NEW]
    └── ui/
        ├── GradientButton.js [NEW]
        └── SectionBadge.js   [NEW]
```

## Proposed Changes

### Design System & Layout

#### [MODIFY] globals.css
- Add CSS custom properties for entire design token set (colors, fonts)
- Import Plus Jakarta Sans + Inter from Google Fonts via `@import`
- Add utility classes: `.gradient-text`, `.ambient-shadow`, `.glass-panel`
- Set body background to surface color

#### [MODIFY] layout.js
- Update metadata (title: "TejAi — AI Skincare Coach", description)
- Switch fonts from Geist to Plus Jakarta Sans + Inter

---

### Components

#### [NEW] Navbar.js
- Glassmorphism sticky top nav (bg `#fcf8ff/80`, backdrop-blur)
- Logo (using `/logo.png` from public), nav links (Features, How It Works, Pricing)
- CTA button "Try Free Scan" → links to `/scan`
- Mobile hamburger menu

#### [NEW] Sidebar.js
- Fixed 288px sidebar for app pages
- Gradient active state, hover slide-right transitions
- Nav items: Dashboard, Face Scan, Skin Results, History, Community
- "Start New Scan" CTA, Support, Logout at bottom
- Mobile: collapses to bottom tab bar

#### [NEW] Footer.js
- Simple footer with branding, links, copyright

---

### Landing Page (`/`)

#### [MODIFY] page.js
Composed of: `Navbar` + `HeroSection` + `FeaturesGrid` + `HowItWorks` + `PricingSection` + `Footer`

**HeroSection**: Two-column layout, gradient headline "Your AI Skincare Coach in 60 Seconds", hero image (`/girl_heroImg.jpg`), floating Glow Score card with scan overlay frame, CTA buttons.

**FeaturesGrid**: Bento grid (3-col on desktop), feature cards with icons, hover animations.

**HowItWorks**: 3-step editorial layout with connected line, numbered circles.

**PricingSection**: 3 glass pricing cards (Free/$0, Starter/$6.99, Growth/$12.99, Pro/$19.99).

---

### Dashboard (`/dashboard`)

Sidebar layout. Bento grid:
- Large Glow Score card with SVG progress circle (gradient stroke)
- Daily Scan quick-action card with hero image overlay
- Today's Primary Focus: 3 status cards (Mild Redness, UV Protection, AI Insight)

---

### Scan Page (`/scan`)

Sidebar layout. Upload UI with:
- Drag-and-drop zone, camera option
- Image preview panel
- "Start AI Scan" CTA button
- Privacy messaging badge

---

### Results Page (`/results`)

Sidebar layout. Bento grid:
- Glow Score circle (84/100, gradient)
- Skin type card (Combination/Dehydrated)
- Focus Areas (concerns grid)
- AI Curated Routine section (AM/PM toggle, step cards with images)

---

### History Page (`/history`)

Sidebar layout:
- Scan history timeline/list with Glow Score trend
- Progress chart (bar chart mockup)
- Comparison feature

---

### Pricing Page (`/pricing`)

Full-page with Navbar. Glassmorphism pricing cards with:
- Free, Starter ($6.99), Growth ($12.99), Pro ($19.99)
- Feature lists, highlighted "Most Popular" card
- Animated background blobs

---

## Technical Notes

> [!IMPORTANT]
> The project uses **Tailwind CSS v4** (`@tailwindcss/postcss`). The v4 config goes in `globals.css` via `@theme`, not `tailwind.config.js`. Custom colors must be defined using CSS variables in the `@theme` block.

> [!NOTE]
> Since shadcn/ui isn't installed yet and the designs use raw Tailwind, we'll build all UI components from scratch using Tailwind — this matches the existing setup perfectly. shadcn can be added later if needed.

> [!NOTE]
> All components will be JS (not TS) to match the existing `.js` project setup.

## Verification Plan

### Automated
- Run `npm run dev` and verify all pages load without errors
- Check browser console for no warnings

### Manual / Browser
- Screenshot each page with browser subagent
- Verify responsive layout on mobile viewport
- Confirm hover animations and transitions work
- Verify the logo and hero image render correctly from `/public`
