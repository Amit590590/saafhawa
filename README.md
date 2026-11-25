# SaafHawa · साफ़ हवा — GenAI clean-air assistant for smoggy cities

> Hack2Skill **PromptWars Virtual – Challenge 6: Urban Air Quality Assistant**

## Problem statement

> "Create a GenAI-powered assistant that helps families and communities navigate severe winter smog and urban air pollution. The application should suggest low-emission daily routines, indoor air quality hacks, and sustainable alternatives tailored to their location and lifestyle, while clearly explaining the direct impact of their choices."

Every winter, cities like Delhi, Indore and Bhopal sit under smog for weeks. Families get an AQI number but no plan: *When can the kids play outside? Is our kitchen making it worse? Does switching to the metro actually matter?* SaafHawa turns the live forecast and a family's lifestyle into a one-day plan, in English or Hindi, and explains the impact of every suggestion with approximate numbers and the reasoning behind them.

## Features

| # | Feature | How |
|---|---------|-----|
| 1 | **City search or geolocation + lifestyle profile** | Household (adults, kids, elderly, asthma/COPD, pregnancy, smoker), commute mode and distance, cooking fuel, purifier, plants, WFH, outdoor exercise. Saved only in the browser (`localStorage`). |
| 2 | **Live AQI with colour band + 24h forecast** | Open-Meteo Air Quality (CAMS): US AQI, PM2.5, PM10, NO₂. EPA colour band **plus a text label**, approximate **India NAQI** category from PM2.5, a 24-hour bar chart with a matching accessible table, and the **best/worst 2-hour windows** to go out (waking hours, flagged "tomorrow" when relevant). |
| 3 | **Personalised Gemini plan** | Low-emission routine with clock times tied to the forecast, indoor air hacks, sustainable alternatives, and health alerts. **Every item has an "Impact" line** (e.g. "~54% lower PM2.5 dose", "~3.6 kg CO₂e/day saved") with its reasoning. |
| 4 | **Grounded follow-up chat** | Ask "Can my kids play outside at 5 pm?" and get an answer grounded on the same AQI data and profile, plus suggested follow-up questions. |
| 5 | **Structured output + graceful fallback** | Gemini returns JSON that matches a `responseSchema`, is checked server-side, and is rendered as cards. If Gemini is down, rate-limited, has no key, or returns bad output, a bilingual rule-based plan in the same shape is served instead and clearly labelled. |
| 6 | **Bilingual EN/हिन्दी** | A single toggle switches the UI strings, `<html lang>`, and the language of Gemini's output (each language's plan is cached in the browser). |

## Architecture

```
Browser (vanilla HTML/CSS/JS, ~40 KB, no framework)
   │  GET /api/air?city=…          POST /api/plan        POST /api/chat
   ▼
Express server (Node 20+)  ── helmet CSP · rate limits · 8 KB JSON cap · validation
   ├─ src/openmeteo.js  → Open-Meteo Geocoding + Air Quality   (10-min TTL cache, request coalescing)
   ├─ src/aqi.js        → EPA bands, India NAQI, 24h slice, best/worst windows
   ├─ src/impact.js     → deterministic impact maths (exposure shift %, commute CO₂e)
   ├─ src/prompt.js     → system instruction, grounded prompts, response schemas, output sanitiser
   ├─ src/gemini.js     → Gemini REST client (key in header, server-side only)
   └─ src/fallback.js   → bilingual rule-based plan/chat when AI is unavailable
```

The flow is lazy: the AQI card renders first, and Gemini is only called afterwards, so users see live data within about a second while the plan generates.

## Gen AI usage (Google Gemini)

- **Model:** `gemini-2.5-flash` by default (override with `GEMINI_MODEL`), called via the Generative Language REST API **from the server only**.
- **Where:**
  1. `POST /api/plan` builds the personalised plan. The prompt holds the live AQI, the 3-hourly forecast, the best/worst windows, the household profile, and a block of **pre-computed impact facts** (exposure-shift %, commute emissions, reference filtration and emission factors), so the model's impact claims rest on the same numbers the UI shows.
  2. `POST /api/chat` answers follow-up questions, grounded on the same context plus the last 6 turns.
- **Structured output:** `responseMimeType: application/json` + `responseSchema` (`PLAN_SCHEMA`, `CHAT_SCHEMA`) make `impact` a required field on every item. Output is then checked again by `sanitizePlan` / `sanitizeChat`, which enforce types, length caps and item caps.
- **Prompt-injection defence:** user text sits in `<USER_QUESTION>` / `<HISTORY>` blocks, and the system instruction says to treat it as data. City names are validated against a strict pattern before they reach any prompt.
- **Efficiency:** thinking budget is 0 on 2.5 Flash (a structured, grounded task), the forecast is down-sampled to 3-hourly in prompts, and token caps are set per endpoint.

## Security

- `GEMINI_API_KEY` is read from the environment and sent in the `x-goog-api-key` header, never in a URL or to the client. Only `.env.example` is in the repo, and `.env` is git-ignored.
- `helmet` with a strict CSP (`default-src 'self'`, no inline scripts or styles, `frame-ancestors 'none'`), HSTS, nosniff, Referrer-Policy, and a Permissions-Policy that allows geolocation on this site only.
- `express-rate-limit`: 120 API requests / 10 min / IP, and 20 AI requests / 10 min / IP.
- All inputs are validated with allow-lists and range checks (`src/validate.js`), and unknown fields are dropped. JSON bodies are capped at 8 KB.
- **Model output is never set via `innerHTML`.** The UI is built with `textContent` and DOM APIs, and a test checks for this.
- Errors return generic JSON messages, never stack traces. Every outbound call has a timeout.

## Accessibility

Semantic landmarks, a skip link, a `<label>` on every input, `fieldset`/`legend`, visible focus rings, and 44 px touch targets. `aria-live` status and plan regions, a `role="log"` chat, and `aria-busy` while the plan generates. After a search, focus moves to the results heading. EPA band colours are paired with text colours that pass **WCAG AA ≥ 4.5:1** (unit-tested) and always come with a text label. The chart has a text summary and a full data table. `lang="hi"` is set on Hindi content. Motion is reduced under `prefers-reduced-motion`.

## Setup

```bash
git clone <your-repo> && cd saafhawa
npm install
cp .env.example .env        # add your GEMINI_API_KEY (https://aistudio.google.com/apikey)
npm start                   # http://localhost:8080
```

The app works without a key too: it serves the rule-based plan, labelled "Offline guidance".

### Deploy

- **Google Cloud Run:** `gcloud run deploy saafhawa --source . --region asia-south1 --allow-unauthenticated --set-env-vars GEMINI_API_KEY=…` (the Dockerfile listens on `$PORT`). For production, prefer `--set-secrets GEMINI_API_KEY=gemini-key:latest`.
- **Render:** `render.yaml` included (set `GEMINI_API_KEY` in the dashboard).
- **Vercel-style serverless:** `api/index.js` exports the Express app, and `vercel.json` routes all paths to it.

## Tests

```bash
npm test            # node:test, no extra dev dependencies
npm run test:coverage
```

There are 43 tests across five files. Gemini and Open-Meteo are mocked with a URL-routed `fetch` stub, so tests run offline:

- `test/aqi.test.js`: EPA band boundaries, rounding, WCAG contrast of every band, NAQI breakpoints, forecast slicing, best/worst windows.
- `test/validate.test.js`: city allow-list (English + Devanagari), injection payloads, coordinates, profile ranges/enums/defaults, chat history limits.
- `test/prompt.test.js`: prompts include live AQI, windows, profile and computed impact facts; Hindi instruction; user text fenced; schemas require `impact`; output sanitiser.
- `test/core.test.js`: TTL cache expiry, eviction and request coalescing; impact maths; bilingual fallback; Gemini client (key in header, not URL; schema sent; error paths).
- `test/api.test.js`: real HTTP against the app: `/api/air`, caching, 400/404/413/502 mapping, `/api/plan` Gemini path + fallback paths, `/api/chat`, CSP and security headers, rate limiting (429), no `innerHTML` in the frontend.

## Screenshots

_Add screenshots of the deployed app here:_

1. `docs/screenshots/form.png`: city + household form
2. `docs/screenshots/air.png`: live AQI card, best/worst windows, 24h chart
3. `docs/screenshots/plan.png`: Gemini plan cards with impact lines
4. `docs/screenshots/hindi.png`: Hindi mode + follow-up chat

## Impact

- **Exposure:** moving a family's outdoor hour from the worst to the best window typically cuts the inhaled PM2.5 dose by tens of percent on a smoggy day. The app computes the figure for the user's city from the forecast.
- **Emissions:** switching a 12 km car commute to the metro 3 days a week saves roughly 11 kg CO₂e per week (~3.6 kg per commuting day) (emission factors in `src/impact.js`).
- **Equity:** low-cost hacks (DIY box-fan filter, wet mopping, no mosquito coils, LPG via PM Ujjwala) and Hindi output put the guidance within reach of households who need it most.

All figures are approximate and for guidance only. SaafHawa is not a medical device.

## Project structure

```
server.js            entry (PORT env, graceful shutdown)
api/index.js         serverless entry
src/                 app, validation, AQI logic, impact maths, prompts, Gemini + Open-Meteo clients, fallback
public/              index.html, styles.css, app.js, i18n.js
test/                node:test suites + mocks
Dockerfile · render.yaml · vercel.json · .env.example
```

MIT licensed.
