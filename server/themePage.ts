export interface ContentVertical {
  id: string;
  niche: string;
  badge: string;
  description: string;
  pillars: string[];
  sampleHooks: string[];
  visualAesthetic: string;
}

export const CONTENT_VERTICALS: ContentVertical[] = [
  {
    id: "untold-heists-history",
    niche: "Untold Heists & Documented World Events",
    badge: "🏛️ UNTOLD EVENTS",
    description: "Documented international heists, historical operations, currency collapses, and verified forensic timelines.",
    pillars: [
      "The 2016 Bangladesh Bank cyber heist halted by a single printer routing typo",
      "The 2003 Antwerp diamond heist: how thieves bypassed 10 layers of seismic and radar security",
      "Operation Pastorius: how an 8-man German sabotage mission collapsed in New York in 1942",
      "The 1971 Lufthansa Flight 649 hijacking and the $5M duffel bag drop in the desert"
    ],
    sampleHooks: [
      "In 2016, a bank teller flagged a spelling mistake on a $1 billion wire transfer—halting the largest cyber heist in history.",
      "In 2003, thieves cracked a vault guarded by magnetic field sensors, heat detectors, and 100 million combination locks without tripping a single alarm.",
      "In 1942, an 8-man espionage team landed on Long Island with explosives—and within days, their own commander turned them in."
    ],
    visualAesthetic: "Dark archival documentary footage, authentic forensic documents, vintage newspaper microfiche, high-contrast monochrome and antique gold grading, 35mm film grain"
  },
  {
    id: "forbidden-places-infrastructure",
    niche: "Forbidden Places, Hidden Infrastructure & Geopolitics",
    badge: "🗺️ FORBIDDEN GEOGRAPHY",
    description: "Banned airspace, deep government continuity bunkers, sovereign trade choke points, and isolated territories.",
    pillars: [
      "Project Greek Island: the 112,000-square-foot congressional nuclear bunker hidden under The Greenbrier resort",
      "Why commercial airliners avoid the Tibetan Plateau: decompression emergency ceilings and lack of radar corridors",
      "The Strait of Malacca choke point where 90,000 ships carry a third of global maritime trade",
      "Svalbard Global Seed Vault: a permafrost fortress carved 120 meters into Arctic sandstone"
    ],
    sampleHooks: [
      "For 34 years, thousands of hotel guests slept directly above a 112,000-square-foot bunker built for the entire U.S. Congress.",
      "Commercial flights avoid the Tibetan Plateau not because of altitude, but because emergency passenger oxygen runs out before an airliner can descend.",
      "If a single 1.5-mile maritime choke point in Southeast Asia closes, one-third of all global trade halts within 48 hours."
    ],
    visualAesthetic: "High-resolution satellite topography, dark telemetry overlays, 3D geographic flyovers, military architectural blueprints, deep slate cyan and amber telemetry"
  },
  {
    id: "earth-scientific-discoveries",
    niche: "Mind-Blowing Earth Discoveries & Scientific Phenomena",
    badge: "🌋 SCIENTIFIC PHENOMENA",
    description: "Documented physical anomalies, extreme geological deep boreholes, oceanic depths, and peer-reviewed mysteries.",
    pillars: [
      "The Kola Superdeep Borehole: what Soviet geologists actually discovered at 12,262 meters deep",
      "Point Nemo: the oceanic pole of inaccessibility where decommissioned space stations are guided to rest",
      "The underwater sand cascade of Mauritius: how bathymetric drop-offs create an ocean illusion",
      "Lake Vostok: an Antarctic freshwater lake sealed beneath 4,000 meters of ice for 15 million years"
    ],
    sampleHooks: [
      "At 12,000 meters beneath the Arctic tundra, geologists found liquid water and microscopic fossils where physics said they could not exist.",
      "At Point Nemo in the South Pacific, the closest humans to you are astronauts aboard the International Space Station 250 miles above.",
      "Satellite images show what looks like a massive waterfall in the Indian Ocean—here is the real geological mechanism."
    ],
    visualAesthetic: "Scientific bathymetric scans, aerial ocean cinematography, volcanic geothermal steam, microscopic crystal macro shots, deep abyss indigo with warm amber lighting"
  },
  {
    id: "intelligence-tech-power",
    niche: "High-Stakes Technology, Intelligence History & Power",
    badge: "🛰️ INTELLIGENCE HISTORY",
    description: "Cold War surveillance technology, undersea data cables, signal intelligence breakthroughs, and sovereign infrastructure.",
    pillars: [
      "Operation Ivy Bells: how U.S. divers tapped Soviet undersea military cables 400 feet beneath the Sea of Okhotsk",
      "Project Azorian: the CIA's covert 6-year engineering project to raise a sunken Soviet nuclear submarine from 16,000 feet",
      "The 550 undersea fiber-optic cables that carry 99% of all transcontinental internet communications",
      "The atomic clock synchronization network required to keep GPS satellites and global bank transfers accurate to nanoseconds"
    ],
    sampleHooks: [
      "In 1971, deep-sea divers placed a 6-ton recording pod on a Soviet undersea military cable 400 feet below the surface.",
      "In 1974, the CIA built a 600-foot mining ship with a giant mechanical claw to lift a sunken nuclear submarine from 3 miles deep.",
      "Over 99% of all transcontinental internet data does not travel by satellite—it moves through 550 undersea cables as thin as a garden hose."
    ],
    visualAesthetic: "Fiber-optic telemetry maps, classified engineering diagrams, deep oceanic sonar visuals, titanium hardware close-ups, obsidian and gold grading"
  },
  {
    id: "ancient-enigmas-artifacts",
    niche: "Documented Enigmas & Ancient Engineering",
    badge: "🏛️ ANCIENT ENIGMAS",
    description: "Physical archaeological discoveries, undeciphered historical scripts, and ancient engineering feats documented by modern science.",
    pillars: [
      "The Antikythera Mechanism: the 2,000-year-old geared calculator that predicted eclipses centuries before modern clocks",
      "The self-healing chemistry of ancient Roman concrete unlocked by MIT researchers in 2023",
      "The subterranean city of Derinkuyu: 18 levels of ancient volcanic rock capable of sheltering 20,000 people",
      "The Voynich Manuscript: why modern computational linguistics still cannot decode its medieval cipher"
    ],
    sampleHooks: [
      "In 1901, divers recovered a corroded bronze artifact from an ancient shipwreck—and modern CT scans revealed a 2,000-year-old analog computer.",
      "Roman sea walls get stronger as they age—and in 2023, scientists finally proved lime clasts actively heal micro-cracks when exposed to seawater.",
      "Eighteen stories below the plains of Cappadocia lies an ancient underground city with ventilation shafts and stone blast doors built for 20,000 people."
    ],
    visualAesthetic: "Museum archival macro photography, antique parchment and papyrus scans, 3D laser photogrammetry, ancient stone corridors, warm candlelight and slate contrast"
  }
];

import { getActiveAccount } from './database.js';
import { AccountPersona, ContentPillar } from '../src/types.js';

export const DEFAULT_THEME_PROFILE = {
  handle: "@theuntoldarch",
  brand: "The Untold Archive",
  niche: "Documentary Storytelling: Heists, Forbidden Infrastructure & Global Mysteries",
  audience: "Curious thinkers, history buffs, and global mystery enthusiasts who value verified true stories, declassified historical records, and evidence-led investigative storytelling.",
  pillars: [
    "Untold heists and documented world events",
    "Forbidden places, hidden infrastructure, and geopolitics",
    "Mind-blowing Earth and scientific discoveries",
    "High-stakes technology, intelligence history, and power",
    "Documented enigmas and ancient engineering"
  ],
  format: "original short-form cinematic documentary Instagram Reels",
  visualDirection: "cinematic dark documentary aesthetic, authentic archival photography, 3D satellite map flyovers, deep obsidian (#08080a) and charcoal (#0d0e12) with antique gold (#d4af37) and telemetry cyan (#0284c7) accents, 35mm film grain, high-contrast evidence typography",
  originalityRule: "Focus on verified true stories, documented anomalies, primary source evidence, and concise investigative breakdowns that educate and fascinate viewers without sensationalized clickbait.",
  defaultCta: "Follow @theuntoldarch for daily verified documentary deep dives 📜 | Save this reference 📌"
} as const;

export const DEFAULT_SARLX_PROFILE = DEFAULT_THEME_PROFILE;
export const THEME_PAGE_PROFILE = DEFAULT_THEME_PROFILE;

export function getActivePersona(): AccountPersona {
  try {
    const active = getActiveAccount();
    if (active?.persona_json) {
      const parsed = JSON.parse(active.persona_json);
      if (parsed && Array.isArray(parsed.contentPillars) && parsed.contentPillars.length > 0) {
        return parsed;
      }
    }
    // If account has handle/name but no persona yet
    if (active && (active.username || active.name)) {
      const handle = active.username ? (active.username.startsWith('@') ? active.username : `@${active.username}`) : DEFAULT_THEME_PROFILE.handle;
      const brand = active.name || (active.username ? active.username.replace(/^@/, '') : DEFAULT_THEME_PROFILE.brand);
      return {
        brand,
        handle,
        niche: active.biography ? active.biography.slice(0, 40) : DEFAULT_THEME_PROFILE.niche,
        audience: DEFAULT_THEME_PROFILE.audience,
        toneOfVoice: ['Authentic', 'Intriguing', 'Direct', 'Engaging'],
        visualDirection: DEFAULT_THEME_PROFILE.visualDirection,
        accentColors: ['#fbbf24', '#38bdf8', '#34d399'],
        defaultCta: `Comment 'STORY' below for the declassified breakdown 📜 | Save this post 📌 | Follow ${handle}`,
        contentPillars: CONTENT_VERTICALS
      };
    }
  } catch (err) {
    console.warn('[Theme Page] Error getting active account persona:', err);
  }

  return {
    brand: DEFAULT_THEME_PROFILE.brand,
    handle: DEFAULT_THEME_PROFILE.handle,
    niche: DEFAULT_THEME_PROFILE.niche,
    audience: DEFAULT_THEME_PROFILE.audience,
    toneOfVoice: ['Authoritative', 'Analytical', 'Zero-Hype', 'Punchy'],
    visualDirection: DEFAULT_THEME_PROFILE.visualDirection,
    accentColors: ['#fbbf24', '#38bdf8', '#34d399'],
    defaultCta: DEFAULT_THEME_PROFILE.defaultCta,
    contentPillars: CONTENT_VERTICALS
  };
}

export function selectDynamicVertical(recentNiches: string[] = []): ContentVertical {
  const persona = getActivePersona();
  const pool = persona.contentPillars && persona.contentPillars.length > 0 
    ? persona.contentPillars 
    : CONTENT_VERTICALS;

  const available = pool.filter(v => !recentNiches.slice(-3).includes(v.niche));
  const candidatePool = available.length > 0 ? available : pool;
  return candidatePool[Math.floor(Math.random() * candidatePool.length)];
}

export function buildThemeResearchContext(vertical?: ContentVertical): string {
  const persona = getActivePersona();
  const activeVertical = vertical || (persona.contentPillars && persona.contentPillars[0]) || CONTENT_VERTICALS[0];
  const tones = Array.isArray(persona.toneOfVoice) ? persona.toneOfVoice.join(', ') : 'High-impact, authentic';

  return [
    `Brand / Account: ${persona.handle} (${persona.brand})`,
    `Primary Account Niche: ${persona.niche}`,
    `Target Audience: ${persona.audience}`,
    `Tone of Voice Guidelines: ${tones}`,
    `Active Focus Pillar: ${activeVertical.niche} [${activeVertical.badge}]`,
    `Pillar Description: ${activeVertical.description}`,
    `Core Topics for this pillar: ${activeVertical.pillars.join("; ")}`,
    `Proven High-Converting Hook Angles in this pillar:\n${activeVertical.sampleHooks.map(h => `  • "${h}"`).join("\n")}`,
    `Visual Aesthetic Direction: ${activeVertical.visualAesthetic || persona.visualDirection}`,
    `Account Default CTA: ${persona.defaultCta}`,
    `Editorial Standards: Every Reel must focus on ONE specific, verifiable subject (event, person, location, discovery, operation). Prefer primary records, national archives, court records, and peer-reviewed studies. Never invent quotes, statistics, fake classification claims, or non-existent URLs. Distinguish verified facts from speculation. Deliver an intelligent, cinematic story viewers can explain to someone else.`
  ].join("\n");
}

