'use strict';

const { exposureShiftReduction, commuteImpact, greenerMode } = require('./impact');

/**
 * Rule-based plan used when Gemini is unavailable (no key, quota, timeout, invalid output).
 * Same shape as the Gemini plan so the UI renders it identically; marked source:"fallback".
 */

const MODE_LABEL = {
  en: { wfh: 'work from home', walk: 'walking', cycle: 'cycling', metro: 'metro', bus: 'bus', auto: 'auto-rickshaw', two_wheeler: 'two-wheeler', car: 'car' },
  hi: { wfh: 'घर से काम', walk: 'पैदल', cycle: 'साइकिल', metro: 'मेट्रो', bus: 'बस', auto: 'ऑटो', two_wheeler: 'दोपहिया', car: 'कार' },
};

function buildFallbackPlan(report, profile, lang = 'en') {
  const hi = lang === 'hi';
  const t = (en, hin) => (hi ? hin : en);
  const aqi = report.current.usAqi ?? 0;
  const bandLabel = report.current.band ? (hi ? report.current.band.labelHi : report.current.band.label) : '—';
  const best = report.best || { label: '14:00–16:00', avgAqi: aqi };
  const worst = report.worst || { label: '07:00–09:00', avgAqi: aqi };
  const bestStart = best.label.slice(0, 5);
  const worstStart = worst.label.slice(0, 5);
  const shift = exposureShiftReduction(report.best, report.worst) ?? 0;
  const vulnerable = profile.children > 0 || profile.elderly > 0 || profile.respiratory || profile.pregnant;
  const alt = greenerMode(profile.commuteMode, profile.commuteKm);
  const commute = commuteImpact(profile.commuteMode, profile.commuteKm, alt);
  const ml = MODE_LABEL[hi ? 'hi' : 'en'];

  const routine = [
    {
      time: '06:30',
      title: t('Check AQI before opening windows', 'खिड़की खोलने से पहले AQI देखें'),
      detail: t(`Keep windows shut until the cleaner window (${best.label}).`, `साफ़ समय (${best.label}) तक खिड़कियाँ बंद रखें।`),
      impact: t('~20-30% lower indoor PM2.5 (approx.) by not letting peak-hour smog in.', 'पीक समय का धुआँ अंदर न आने से घर में PM2.5 लगभग 20-30% कम।'),
    },
    {
      time: worstStart,
      title: t('Avoid outdoor activity', 'बाहर की गतिविधि टालें'),
      detail: t(`Worst air expected ${worst.label} (avg AQI ${worst.avgAqi}). Stay indoors; postpone walks.`, `${worst.label} सबसे खराब हवा (औसत AQI ${worst.avgAqi})। घर में रहें, सैर टालें।`),
      impact: t(`Skipping this window avoids your highest-dose hours of the day.`, 'दिन के सबसे ज़्यादा प्रदूषण वाले घंटे से बचाव।'),
    },
    {
      time: bestStart,
      title: t('Errands, play & ventilation window', 'काम-काज, खेल और हवादारी का समय'),
      detail: t(`Best air expected ${best.label} (avg AQI ${best.avgAqi}). Do outdoor tasks and air the house for 10 minutes.`, `${best.label} सबसे अच्छी हवा (औसत AQI ${best.avgAqi})। बाहर के काम करें, 10 मिनट घर हवादार करें।`),
      impact: t(`~${shift}% lower PM2.5 dose (approx.) vs doing the same activity in the worst window.`, `सबसे खराब समय की तुलना में लगभग ${shift}% कम PM2.5 सेवन।`),
    },
    {
      time: '19:00',
      title: t('Cook with lid on, exhaust running', 'ढक्कन लगाकर, एग्ज़ॉस्ट चलाकर पकाएँ'),
      detail: t('Run the kitchen chimney/exhaust fan and keep the kitchen door closed while frying.', 'तलते समय चिमनी/एग्ज़ॉस्ट चलाएँ और रसोई का दरवाज़ा बंद रखें।'),
      impact: t('Exhaust ventilation can cut cooking-related PM2.5 by roughly half (approx.).', 'एग्ज़ॉस्ट से खाना पकाने का PM2.5 लगभग आधा।'),
    },
    {
      time: '21:30',
      title: t('Clean-air bedroom for the night', 'रात के लिए साफ़-हवा वाला बेडरूम'),
      detail: profile.hasPurifier
        ? t('Run the purifier in the bedroom with door shut, 1 hour before sleep.', 'सोने से 1 घंटा पहले बेडरूम में दरवाज़ा बंद कर प्यूरीफ़ायर चलाएँ।')
        : t('Pick one room as the clean room: seal gaps with tape/wet towel, no incense or mosquito coils.', 'एक कमरा साफ़-हवा कमरा बनाएँ: दरारें टेप/गीले तौलिये से बंद करें, अगरबत्ती/कॉइल न जलाएँ।'),
      impact: profile.hasPurifier
        ? t('A room-sized HEPA purifier typically lowers indoor PM2.5 ~50-80% (approx.) over 8 hours of sleep.', 'कमरे के हिसाब से HEPA प्यूरीफ़ायर 8 घंटे की नींद में PM2.5 लगभग 50-80% घटाता है।')
        : t('Sealing and avoiding indoor smoke sources can lower bedroom PM2.5 ~20-30% (approx.).', 'दरारें बंद करने और धुआँ न करने से बेडरूम PM2.5 लगभग 20-30% कम।'),
    },
  ];

  routine.sort((a, b) => a.time.localeCompare(b.time));

  const indoorHacks = [
    {
      title: t('DIY box-fan filter', 'DIY बॉक्स-फ़ैन फ़िल्टर'),
      detail: t('Tape a MERV-13 / HEPA-grade filter to the back of a table fan for a low-cost purifier.', 'टेबल फ़ैन के पीछे MERV-13/HEPA फ़िल्टर टेप करें - सस्ता प्यूरीफ़ायर।'),
      impact: t('Studies show ~40-60% PM2.5 reduction in a small closed room (approx.) for under ₹2,000.', 'छोटे बंद कमरे में ₹2,000 से कम में लगभग 40-60% PM2.5 कमी।'),
    },
    {
      title: t('Wet-mop, don’t sweep', 'झाड़ू नहीं, गीला पोंछा'),
      detail: t('Dry sweeping re-suspends settled dust; damp-mop floors and wipe sills daily.', 'सूखी झाड़ू धूल उड़ाती है; रोज़ गीला पोंछा लगाएँ और खिड़की की चौखट पोंछें।'),
      impact: t('Reduces re-suspended coarse dust (PM10) indoors noticeably (approx. 20%+).', 'घर में उड़ने वाली मोटी धूल (PM10) लगभग 20%+ कम।'),
    },
    {
      title: t('No indoor smoke sources', 'घर में धुआँ नहीं'),
      detail: t('Skip incense, dhoop, mosquito coils and candles on smoggy days.', 'प्रदूषित दिनों में अगरबत्ती, धूप, मच्छर कॉइल और मोमबत्ती न जलाएँ।'),
      impact: t('One mosquito coil can emit PM2.5 comparable to dozens of cigarettes (approx.).', 'एक मच्छर कॉइल का धुआँ कई सिगरेटों जितना PM2.5 दे सकता है।'),
    },
    {
      title: t('Plants: nice, not a purifier', 'पौधे: अच्छे, पर प्यूरीफ़ायर नहीं'),
      detail: t('Keep plants for wellbeing, but don’t rely on them to clean smog.', 'पौधे मन के लिए रखें, पर धुआँ साफ़ करने के लिए उन पर निर्भर न रहें।'),
      impact: t('Measured room-scale PM2.5 effect of houseplants is negligible - spend on filtration first.', 'कमरे के स्तर पर पौधों का PM2.5 असर नगण्य - पहले फ़िल्टर पर खर्च करें।'),
    },
  ];

  const sustainableAlternatives = [];
  if (!profile.workFromHome && alt !== profile.commuteMode) {
    sustainableAlternatives.push({
      title: t(`Switch ${ml[profile.commuteMode]} to ${ml[alt]}`, `${ml[profile.commuteMode]} की जगह ${ml[alt]}`),
      detail: t(`For your ~${profile.commuteKm} km commute, try ${ml[alt]} at least 3 days a week.`, `आपके ~${profile.commuteKm} किमी सफ़र के लिए हफ़्ते में कम से कम 3 दिन ${ml[alt]} आज़माएँ।`),
      impact: t(`~${commute.savedDailyKg} kg CO2e saved per day (~${commute.savedAnnualKg} kg/yr, approx.) plus less tailpipe PM on your street.`, `रोज़ लगभग ${commute.savedDailyKg} किग्रा CO2e की बचत (~${commute.savedAnnualKg} किग्रा/वर्ष) और सड़क पर कम धुआँ।`),
    });
  }
  if (['biomass', 'kerosene', 'coal'].includes(profile.cookingFuel)) {
    sustainableAlternatives.push({
      title: t('Move to LPG/PNG or induction', 'LPG/PNG या इंडक्शन अपनाएँ'),
      detail: t('Check PM Ujjwala Yojana eligibility for an LPG connection; induction works well for daily cooking.', 'LPG कनेक्शन के लिए PM उज्ज्वला योजना देखें; रोज़ के खाने के लिए इंडक्शन बढ़िया है।'),
      impact: t('Can cut kitchen PM2.5 from several hundred to tens of µg/m³ (approx. 80-90% lower).', 'रसोई का PM2.5 सैकड़ों से दसियों µg/m³ तक - लगभग 80-90% कमी।'),
    });
  }
  sustainableAlternatives.push(
    {
      title: t('Never burn leaves or waste', 'पत्ते या कचरा कभी न जलाएँ'),
      detail: t('Compost dry leaves; report open burning on the Sameer app / municipal helpline.', 'सूखे पत्तों की खाद बनाएँ; खुले में जलाने की शिकायत समीर ऐप/नगर निगम हेल्पलाइन पर करें।'),
      impact: t('Open waste burning is a major winter PM2.5 source; one pile avoided protects the whole lane.', 'सर्दियों में खुले में कचरा जलाना PM2.5 का बड़ा स्रोत है; एक ढेर रोकना पूरी गली को बचाता है।'),
    },
    {
      title: t('Carpool / combine trips', 'कारपूल / काम एक साथ निपटाएँ'),
      detail: t('Group errands into one trip during the cleaner window.', 'साफ़ समय में सारे काम एक ही चक्कर में निपटाएँ।'),
      impact: t('Each car trip avoided saves ~0.17 kg CO2e per km (approx.).', 'हर टाली गई कार यात्रा से लगभग 0.17 किग्रा CO2e/किमी बचत।'),
    },
  );

  const healthAlerts = [];
  if (aqi > 100 && vulnerable) {
    healthAlerts.push(
      t(`AQI ${aqi} (${bandLabel}): children, elderly and anyone with asthma should limit outdoor time and wear a well-fitted N95 outside (~90% PM2.5 filtration, approx.).`,
        `AQI ${aqi} (${bandLabel}): बच्चे, बुज़ुर्ग और अस्थमा वाले बाहर कम जाएँ और बाहर सही फ़िट N95 पहनें (~90% PM2.5 रोकता है)।`),
    );
  }
  if (profile.respiratory) {
    healthAlerts.push(t('Keep inhalers/medicines handy; see a doctor if breathlessness or chest tightness increases.', 'इनहेलर/दवा पास रखें; साँस फूलने या सीने में जकड़न बढ़े तो डॉक्टर को दिखाएँ।'));
  }

  return {
    summary: t(
      `Air now: US AQI ${aqi} (${bandLabel}). Plan outdoor time for ${best.label} and stay in during ${worst.label}.`,
      `अभी हवा: US AQI ${aqi} (${bandLabel})। बाहर का काम ${best.label} में करें, ${worst.label} में घर पर रहें।`,
    ),
    routine,
    indoorHacks,
    sustainableAlternatives,
    healthAlerts,
  };
}

function fallbackChat(report, lang = 'en') {
  const aqi = report.current.usAqi;
  const best = report.best ? report.best.label : '';
  return lang === 'hi'
    ? {
        answer: `AI सहायक अभी उपलब्ध नहीं है। अभी US AQI ${aqi} है${best ? `; सबसे साफ़ समय ${best}` : ''}। खिड़कियाँ बंद रखें, बाहर N95 पहनें और ऊपर दी गई योजना देखें।`,
        followUps: [],
      }
    : {
        answer: `The AI assistant is unavailable right now. Current US AQI is ${aqi}${best ? `; the cleanest window is ${best}` : ''}. Keep windows shut, wear an N95 outdoors, and follow the plan above.`,
        followUps: [],
      };
}

module.exports = { buildFallbackPlan, fallbackChat };
