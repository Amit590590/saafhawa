# SaafHawa – PromptWars Virtual Challenge 6 submission kit

## (a) Describe the changes/updates made in the deployed version (937/1000 chars)

SaafHawa v1.0 (साफ़ हवा) is a bilingual English/Hindi clean-air assistant for families facing winter smog. It is built on Node/Express with a vanilla JS frontend. Users enter a city or use geolocation, then add a household and lifestyle profile (kids, elderly, asthma, commute, cooking fuel, purifier). The app shows the live US AQI from Open-Meteo with a colour band and text label, an approximate India NAQI, a 24h forecast chart with an accessible table, and the best/worst hours to go out. Gemini then generates a structured plan as cards: a timed low-emission routine, indoor air hacks and sustainable alternatives, each with an approximate impact estimate and its reasoning. A grounded follow-up chat answers questions, and a rule-based fallback covers AI outages. Hardening: helmet CSP, rate limits, input validation, server-only API key, no innerHTML, 10-min AQI cache. Ships with 43 passing tests and a Dockerfile for Cloud Run.

## (b) Gen AI services utilized and where (879/1000 chars)

Google Gemini (gemini-2.5-flash via the Gemini API) is called server-side only from Express; the key stays in an env var and is never sent to the browser. 1) POST /api/plan: Gemini builds the personalised one-day plan (timed routine, indoor hacks, sustainable alternatives, health alerts). The prompt is grounded on live Open-Meteo AQI, the 24h forecast, best/worst windows, the household profile, and pre-computed impact facts (exposure-shift %, commute CO2e), so every "impact" claim is approximate and reasoned. Structured output (responseMimeType JSON + responseSchema) makes impact mandatory, and the server re-validates the result before rendering it as cards. 2) POST /api/chat: grounded follow-up Q&A with suggested next questions. Both work in English or Hindi. User text is fenced as data to resist prompt injection. Packaged as a Docker container for Google Cloud Run.

## (c) LinkedIn build-in-public post (draft)

Every winter, Bhopal, Indore and Delhi turn grey, and families keep asking the same question: "The AQI is 300. What should we actually *do*?" 🌫️

So for #PromptWarsVirtual Challenge 6 I built **SaafHawa (साफ़ हवा)**, a GenAI clean-air assistant for families and communities living through winter smog.

What it does:
✅ Pulls live AQI + a 24-hour forecast for any city (Delhi, Indore, Bhopal… or anywhere) and shows the best and worst hours to step out
✅ Takes your household's real life into account: kids, elderly parents, asthma, how you commute, what fuel you cook with
✅ Uses Google Gemini to create a personalised day plan: a low-emission routine timed to the forecast, indoor air hacks, and greener alternatives
✅ Explains the impact of every suggestion: "~50% lower PM2.5 dose if you shift the walk to 2 pm" or "~3.6 kg CO₂ saved per day by taking the metro"
✅ Works in English and Hindi, because the families who need this most don't always think in English
✅ A follow-up chat answers "Can my kids play outside at 5 pm?" using the same live data

Under the hood: Gemini structured JSON output with a schema that makes an impact explanation mandatory, a rule-based fallback if the AI is down, strict input validation, CSP, rate limiting, accessible colour bands with text labels, and 43 automated tests.

My biggest learning: GenAI becomes trustworthy when you ground it. I give Gemini the forecast *and* pre-computed numbers, so its advice can't drift from reality.

Small choices like when to open a window, which hour to walk, or what fuel to cook with add up when a whole community makes them. 🌱

Thank you @Google for Developers and @Hack2skill for the push to build in public!

🔗 Live demo: <add link>  |  💻 Code: <add GitHub link>

#BuildwithAI #PromptWarsVirtual #UrbanAirQuality #GoogleGemini #CleanAir #Bhopal #AIforGood

— Amit Sharma, microfinance trainer from Bhopal who builds with AI

## (d) 2-minute demo video script

| Time | Screen | Voice-over |
|------|--------|-----------|
| 0:00–0:12 | Title card: "SaafHawa · साफ़ हवा", then a smoggy city skyline photo | "Every winter, millions of Indian families wake up to a smog-grey sky and an AQI number that tells them nothing about what to do. I'm Amit, and this is SaafHawa." |
| 0:12–0:30 | App home: the city + household form. Type **Bhopal**, set 1 child, tick *asthma*, commute **Car 12 km**, fuel **LPG** | "You tell SaafHawa your city, or tap *Use my location*, and a few things about your household: kids, elderly parents, asthma, how you commute, how you cook. It stays in your browser." |
| 0:30–0:50 | Click **Check air & get my plan**. AQI badge appears (colour + label), NAQI line, PM2.5/PM10 | "In about a second you get live air quality from Open-Meteo: US AQI with a colour band *and* a text label, plus an approximate Indian NAQI category." |
| 0:50–1:05 | Zoom on **Best time to go out / Avoid going out** and the 24h bar chart; open *Show hourly table* | "It reads the next 24 hours and finds the cleanest and dirtiest two-hour windows. That's when to walk to school, and when to keep the windows shut." |
| 1:05–1:30 | Scroll the **Your clean-air plan** cards: "Generated by Google Gemini" pill, routine with times, Impact lines, indoor hacks, alternatives | "Then Google Gemini writes a plan for this family: a timed low-emission routine, indoor air hacks, and greener alternatives. Every card has an *Impact* line, like a 50% lower PM2.5 dose or 3.6 kg of CO₂ saved a day, with the reasoning. Gemini returns structured JSON against a schema, so impact is never skipped." |
| 1:30–1:45 | Chat: type "Can my kids play outside at 5 pm?" → answer + follow-up chips | "Got a follow-up? Ask. The answer is grounded on the same live forecast and your profile." |
| 1:45–1:55 | Click **हिन्दी** toggle: UI and plan switch to Hindi | "One tap switches everything, including Gemini's advice, to Hindi." |
| 1:55–2:00 | Quick montage: terminal `npm test` (43 passing), README architecture, Cloud Run URL. End card with hashtags | "Secure, accessible, tested, and on Cloud Run. SaafHawa: cleaner air, one choice at a time. #BuildwithAI #PromptWarsVirtual" |

**Recording tips:** record at 1280×720, zoom the browser to 110%, use a city with high AQI that day (check Delhi first), and record the Hindi toggle after the English plan has loaded so both plans are cached.
