export const THEME_PAGE_PROFILE = {
  handle: "@sarlx_ai",
  brand: "SARLX.Ai",
  niche: "AI Tech & Breakthroughs",
  audience: "AI-curious builders, creators, founders, and technology enthusiasts",
  pillars: [
    "AI model launches and breakthroughs",
    "AI tools and workflows",
    "AI agents and automation",
    "open-source AI and local models",
    "AI business and productivity use cases"
  ],
  format: "original short-form Instagram Reels",
  visualDirection: "cinematic futuristic technology visuals, premium typography, fast hook, clear payoff, strong CTA",
  originalityRule: "Create original scripts and visual concepts. Never instruct the system to repost or recreate another creator's Reel.",
  defaultCta: "Comment GROWTH for the full breakdown."
} as const;

export function buildThemeResearchContext(): string {
  return [
    `Theme page: ${THEME_PAGE_PROFILE.handle} / ${THEME_PAGE_PROFILE.brand}`,
    `Niche: ${THEME_PAGE_PROFILE.niche}`,
    `Audience: ${THEME_PAGE_PROFILE.audience}`,
    `Content pillars: ${THEME_PAGE_PROFILE.pillars.join(", ")}`,
    `Format: ${THEME_PAGE_PROFILE.format}`,
    `Originality: ${THEME_PAGE_PROFILE.originalityRule}`
  ].join("\n");
}
