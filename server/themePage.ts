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
    niche: "Untold World Heists & International Mysteries",
    badge: "🏛️ GLOBAL HEISTS & EVENTS",
    description: "Documented international heists, high-stakes operations, global currency anomalies, and verified forensic timelines across Europe, Asia, and the Americas.",
    pillars: [
      "The 2003 Antwerp diamond heist: how thieves bypassed 10 layers of seismic sensors and heat detectors in Belgium",
      "The 2016 Bangladesh Bank cyber heist halted across three continents by a single printer routing typo",
      "The 2019 Dresden Green Vault royal jewel heist in Germany: cutting the city electrical grid to seize 4,300 Saxon diamonds",
      "The 2005 Banco Central burglary in Fortaleza, Brazil: digging an 80-meter tunnel beneath the city streets",
      "The 1971 Lufthansa Flight 649 international skyjacking and the desert cash drop"
    ],
    sampleHooks: [
      "In 2003, thieves broke into an impenetrable vault guarded by seismic sensors and Doppler radar in Antwerp—without tripping a single alarm.",
      "In 2016, a bank teller flagged a single spelling mistake on a $1 billion transfer—halting the largest international cyber heist in human history.",
      "In 2019, thieves cut power to an entire German district, smashed into the historic Green Vault, and vanished with priceless royal diamonds in under 5 minutes."
    ],
    visualAesthetic: "Dark international archival documentary footage, authentic forensic documents, vintage newspaper microfiche, high-contrast monochrome and antique gold grading, 35mm film grain"
  },
  {
    id: "forbidden-places-infrastructure",
    niche: "Forbidden Geography, Hidden Infrastructure & Geopolitics",
    badge: "🗺️ FORBIDDEN GEOGRAPHY",
    description: "Banned sovereign airspace, deep alpine mountain bunkers, international trade choke points, and isolated closed territories worldwide.",
    pillars: [
      "The subterranean city of Derinkuyu in Cappadocia, Turkey: 18 levels beneath the earth built to shelter 20,000 people",
      "Why international airliners avoid the Tibetan Plateau: decompression emergency ceilings and lack of descent corridors",
      "The Strait of Malacca choke point where 90,000 vessels carry one-third of all global maritime trade",
      "Svalbard Global Seed Vault: a permafrost fortress carved 120 meters (400 feet) into Arctic sandstone in Norway",
      "North Sentinel Island in the Bay of Bengal: the sovereign territory where modern humans are legally forbidden to step foot",
      "The Paris Catacombs: over 300 kilometers (180 miles) of ancient subterranean limestone quarries beneath France"
    ],
    sampleHooks: [
      "Eighteen stories below the plains of Turkey lies an ancient underground city with stone blast doors and ventilation shafts engineered for 20,000 people.",
      "International flights avoid the Tibetan Plateau not because of altitude, but because emergency passenger oxygen runs out before an airliner can descend.",
      "If a single 2-kilometer maritime choke point in Southeast Asia closes, one-third of all global trade halts within 48 hours."
    ],
    visualAesthetic: "High-resolution satellite topography, dark telemetry overlays, 3D geographic flyovers, international architectural blueprints, deep slate cyan and amber telemetry"
  },
  {
    id: "earth-scientific-discoveries",
    niche: "Mind-Blowing Earth Discoveries & Scientific Phenomena",
    badge: "🌋 EARTH PHENOMENA",
    description: "Documented physical anomalies, extreme geological deep boreholes, abyssal ocean trenches, and peer-reviewed mysteries across every continent.",
    pillars: [
      "The Kola Superdeep Borehole in the Russian Arctic: what geologists discovered at 12,262 meters (40,230 feet) deep",
      "The Eye of the Sahara (Richat Structure) in Mauritania: a 40-kilometer (25-mile) concentric geological ring visible from orbit",
      "Point Nemo in the South Pacific: the oceanic pole of inaccessibility where decommissioned space stations are laid to rest",
      "The underwater sand cascade off the coast of Mauritius: how bathymetric drop-offs create an ocean illusion",
      "Lake Vostok: a subglacial Antarctic freshwater lake sealed beneath 4,000 meters (13,000 feet) of ice for 15 million years",
      "The Hamza River: an underground freshwater flow 4,000 meters beneath the Amazon River basin"
    ],
    sampleHooks: [
      "At 12,000 meters (40,000 feet) beneath the Arctic tundra, geologists found boiling liquid water and microfossils where physics said they could not exist.",
      "In the middle of the Sahara Desert lies a 40-kilometer concentric ring structure so massive astronauts use it to navigate in space.",
      "At Point Nemo in the South Pacific, the closest humans to you are astronauts aboard the International Space Station 400 kilometers (250 miles) above."
    ],
    visualAesthetic: "Scientific bathymetric scans, aerial ocean cinematography, volcanic geothermal steam, microscopic crystal macro shots, deep abyss indigo with warm amber lighting"
  },
  {
    id: "intelligence-tech-power",
    niche: "Global Technology, Subsea Infrastructure & Power",
    badge: "🛰️ GLOBAL INFRASTRUCTURE",
    description: "Worldwide communication backbones, subsea fiber cables, alpine gold vaults, satellite networks, and maritime choke points.",
    pillars: [
      "The 550 undersea fiber-optic cables that carry over 99% of all transcontinental global internet traffic",
      "The Swiss alpine fortresses: military bunker complexes drilled deep inside the granite Alps to secure sovereign gold reserves",
      "The atomic clock synchronization network required to keep GPS satellites and global SWIFT bank transfers accurate to nanoseconds",
      "The Panama and Suez Canal oceanic choke points that dictate global container trade logistics",
      "Project Azorian: the deep-sea salvage expedition to raise a sunken submarine 5,000 meters (16,000 feet) beneath the Pacific"
    ],
    sampleHooks: [
      "Over 99% of all international internet data does not travel by satellite—it moves through 550 undersea cables resting on the ocean floor.",
      "Inside the Swiss Alps lies a network of nuclear-hardened mountain vaults drilled directly into solid granite.",
      "Every global bank transfer and navigation system on Earth depends on a network of atomic clocks synchronized to billionths of a second."
    ],
    visualAesthetic: "Fiber-optic telemetry maps, classified engineering diagrams, deep oceanic sonar visuals, titanium hardware close-ups, obsidian and gold grading"
  },
  {
    id: "ancient-enigmas-artifacts",
    niche: "Ancient Engineering, Lost Civilizations & Documented Enigmas",
    badge: "🏛️ ANCIENT ENIGMAS",
    description: "Physical archaeological discoveries, undeciphered historical scripts, and ancient engineering feats documented by modern international science.",
    pillars: [
      "The Great Pyramid of Giza: 2023 cosmic-ray muon scans that revealed a hidden 9-meter corridor behind the chevron entrance",
      "The 2,000-year-old Antikythera Mechanism: an ancient Greek geared computer recovered from an Aegean shipwreck",
      "The self-healing chemistry of ancient Roman concrete unlocked by international researchers in 2023",
      "The Nazca Lines of Peru: hundreds of massive geoglyphs preserved for 2,000 years in the arid coastal desert",
      "The 8,000 Terracotta Warriors and sealed mercury rivers of Qin Shi Huang's mausoleum in Xi'an, China",
      "The Voynich Manuscript: why modern computational linguistics still cannot decode its medieval cipher"
    ],
    sampleHooks: [
      "In 2023, scientists using cosmic rays fired through the Great Pyramid discovered a hidden 9-meter (30-foot) corridor sealed for 4,500 years.",
      "In 1901, divers recovered a corroded bronze artifact from an Aegean shipwreck—and CT scans revealed a 2,000-year-old analog computer.",
      "Roman maritime sea walls get stronger as they age—and in 2023, scientists finally proved hot-mixed lime clasts heal micro-cracks upon contact with seawater."
    ],
    visualAesthetic: "Museum archival macro photography, antique parchment and papyrus scans, 3D laser photogrammetry, ancient stone corridors, warm candlelight and slate contrast"
  }
];

import { getActiveAccount } from './database.js';
import { AccountPersona, ContentPillar } from '../src/types.js';

export const DEFAULT_THEME_PROFILE = {
  handle: "@theuntoldarch",
  brand: "The Untold Archive",
  niche: "Documentary Storytelling: Global Mysteries, World Heists & Earth Phenomena",
  audience: "Curious minds, global history buffs, and mystery enthusiasts across 150+ countries who value verified true stories, international archaeological discoveries, and forensic storytelling.",
  pillars: [
    "Untold world heists and documented international events",
    "Forbidden geography, hidden infrastructure, and global geopolitics",
    "Mind-blowing Earth and scientific phenomena across all continents",
    "Global technology, subsea infrastructure, and power moves",
    "Ancient engineering, lost civilizations, and documented enigmas"
  ],
  format: "original short-form cinematic documentary Instagram Reels & YouTube Shorts",
  visualDirection: "cinematic dark documentary aesthetic, authentic archival photography, 3D satellite map flyovers, deep obsidian (#08080a) and charcoal (#0d0e12) with antique gold (#d4af37) and telemetry cyan (#0284c7) accents, 35mm film grain, high-contrast evidence typography",
  originalityRule: "Focus on verified true stories, documented global anomalies, primary source evidence, and concise investigative breakdowns that educate and fascinate viewers worldwide without sensationalized clickbait.",
  defaultCta: "Follow @theuntoldarch for daily verified global documentaries 🌍 | Save this file 📌"
} as const;

export const DEFAULT_SARLX_PROFILE = DEFAULT_THEME_PROFILE;
export const THEME_PAGE_PROFILE = DEFAULT_THEME_PROFILE;

export function getActivePersona(): AccountPersona {
  try {
    const active = getActiveAccount();
    if (active?.persona_json) {
      const parsed = JSON.parse(active.persona_json);
      return {
        ...parsed,
        niche: DEFAULT_THEME_PROFILE.niche,
        audience: DEFAULT_THEME_PROFILE.audience,
        contentPillars: CONTENT_VERTICALS
      };
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

