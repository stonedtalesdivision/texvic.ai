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
    niche: "Untold World Heists & History's Wildest Moments",
    badge: "🏛️ UNTOLD HISTORY",
    description: "Crazy real-world heists, secret currency collapses, and unbelievable historical events they never taught in school.",
    pillars: [
      "How a single broken printer exposed a $1B international central bank heist",
      "The 24-year-old trader who accidentally triggered a global market crash from his bedroom",
      "The lost Nazi gold train hidden deep under a Polish mountain",
      "How a rogue casino team secretly took down Las Vegas with a hidden phone sensor"
    ],
    sampleHooks: [
      "In 2016, a bank teller noticed a spelling mistake on a $1 billion wire transfer...",
      "This 24-year-old guy accidentally crashed Wall Street from his parents' basement.",
      "The craziest heist in human history didn't use guns—it used a broken printer."
    ],
    visualAesthetic: "Dark moody archival footage, high-contrast newspaper clippings, vintage gold and obsidian grading, dramatic slow push-in, 35mm film grain"
  },
  {
    id: "forbidden-places-geopolitics",
    niche: "Forbidden Places & Hidden Geopolitics",
    badge: "🗺️ FORBIDDEN PLACES",
    description: "Banned airspace, secret military bunkers, closed islands, and the hidden geography controlling global trade.",
    pillars: [
      "The real reason commercial airplanes are banned from flying over Tibet",
      "The hidden bunker under a luxury hotel built to protect the US government",
      "Why North Sentinel Island is the most dangerous place on Earth",
      "The single undersea choke point where 40% of the world's oil must pass through"
    ],
    sampleHooks: [
      "If a commercial airplane flies over this exact mountain range, it's an automatic emergency.",
      "For 30 years, thousands of guests stayed at this hotel without knowing a nuclear bunker was under the ballroom.",
      "This is the only island on Earth where modern humans are legally forbidden to step foot."
    ],
    visualAesthetic: "Satellite 3D map flyovers, glowing geopolitical borders, dark satellite telemetry, topographic lines, deep cyan and gold highlights"
  },
  {
    id: "earth-cosmic-mysteries",
    niche: "Mind-Blowing Earth Mysteries & Scientific Phenomena",
    badge: "🌋 EARTH MYSTERIES",
    description: "Unexplained natural anomalies, deep ocean abysses, superdeep boreholes, and bizarre physics.",
    pillars: [
      "Why scientists suddenly stopped drilling the Kola Superdeep Borehole after hearing strange sounds",
      "The mysterious underwater waterfall off the coast of Mauritius",
      "What actually happens at Point Nemo, the most isolated graveyard on Earth",
      "The deep ocean sound that was louder than any known creature"
    ],
    sampleHooks: [
      "In 1989, scientists drilled a 12-kilometer hole into the Earth... and then abruptly cemented it shut.",
      "This satellite image looks like a giant waterfall in the middle of the ocean—here's what's actually happening.",
      "If you stand at Point Nemo, the closest living humans are astronauts on the International Space Station."
    ],
    visualAesthetic: "Deep ocean abyss visuals, aerial drone cinematography, volcanic steam, atmospheric fog, bioluminescent glow, hyper-detailed nature photography"
  },
  {
    id: "secret-power-systems",
    niche: "Secret Systems & Global Power Moves",
    badge: "🕶️ SECRET POWER",
    description: "The invisible infrastructure running civilization: undersea cables, Swiss gold vaults, private satellite networks, and sovereign wealth.",
    pillars: [
      "The 400 undersea cables that secretly carry 99% of all international data",
      "The mountain fortress in Switzerland where billionaires store priceless assets",
      "Why the Panama Canal is running out of water and causing a global trade crisis",
      "How GPS satellites are quietly keeping the global banking system synchronized"
    ],
    sampleHooks: [
      "If just 3 of these underwater cables get cut, 90% of the global internet goes dark instantly.",
      "Inside this Swiss mountain is a vault with blast doors designed to withstand a nuclear shockwave.",
      "Most people think GPS is for navigation—it's actually keeping the entire world's banking system alive."
    ],
    visualAesthetic: "Glowing fiber-optic cable world maps, cinematic vaults, high-security titanium doors, laser scanning lines, dark slate and emerald accents"
  },
  {
    id: "lost-artifacts-enigmas",
    niche: "Lost Artifacts & Unsolved Enigmas",
    badge: "🕵️ UNSOLVED ENIGMAS",
    description: "Ancient technology, undeciphered manuscripts, vanished civilizations, and historical mysteries that baffle modern science.",
    pillars: [
      "The 2,000-year-old Antikythera mechanism that functioned like an analog computer",
      "The Voynich Manuscript: the medieval book that no cryptographer or AI has ever translated",
      "The Roman concrete recipe that actually heals itself over thousands of years",
      "How the ancient city of Derinkuyu sheltered 20,000 people 18 stories underground"
    ],
    sampleHooks: [
      "Divers pulled this 2,000-year-old rusted gear from a shipwreck—and realized ancient Greeks built a computer.",
      "Even our most advanced supercomputers still cannot translate a single sentence from this 600-year-old book.",
      "Roman concrete gets stronger every time it's hit by seawater—and we only figured out why in 2023."
    ],
    visualAesthetic: "Antique parchment textures, microscopic macro lenses, underwater archaeology, ancient stone corridors, amber and warm candlelight lighting"
  }
];

import { getActiveAccount } from './database.js';
import { AccountPersona, ContentPillar } from '../src/types.js';

export const DEFAULT_THEME_PROFILE = {
  handle: "@theuntoldarch",
  brand: "The Untold Archive",
  niche: "Untold World Events & Mysteries",
  audience: "Curious minds, history buffs, and global mystery enthusiasts obsessed with untold true events, high-stakes heists, forbidden places, and unexplained phenomena.",
  pillars: [
    "Crazy true heists and forgotten historical moments",
    "Forbidden places, banned airspaces, and closed islands",
    "Unexplained earth and deep ocean phenomena",
    "Secret global infrastructure and high-stakes power moves",
    "Ancient enigmas and undeciphered historical mysteries"
  ],
  format: "original short-form cinematic Instagram Reels",
  visualDirection: "cinematic dark documentary aesthetic, vintage archival photography, 3D satellite map flyovers, deep obsidian with antique gold and cyan accents, 35mm film grain, high-tension curiosity typography",
  originalityRule: "Focus on mind-blowing true stories, high-stakes curiosity loops, and fascinating real-world secrets that compel viewers to watch to the last second, save the post, and share with friends.",
  defaultCta: "Comment 'STORY' below for the declassified breakdown 📜 | Save this post 📌 | Follow @theuntoldarch"
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
    `Golden Rule: Keep it accessible, high-energy, and exciting for normal people and creators. Explain WHAT happened, WHY it matters, and HOW to use it. ZERO boring developer code or database internals.`
  ].join("\n");
}

