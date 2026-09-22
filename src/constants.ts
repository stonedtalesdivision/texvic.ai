import { TrendingAudio, ReelTemplate, ReelItem, CommentItem, AccountAnalytics, StrategyInsight, PostItem } from './types';

export const PRODUCTION_TEMPLATES: ReelTemplate[] = [
  {
    id: 'template-fast-hook',
    name: '3-Sec Viral Pattern Interrupt',
    category: 'High Retention',
    description: 'Ultra-fast visual hook at 0.5s with a bold contrarian claim, followed by 3 punchy rapid-fire points timed to beat drop.',
    targetDuration: 8,
    pacing: 'fast-hook',
    visualStyle: 'Neon Cyber Bold with high-contrast text tags',
    recommendedAudioMood: 'Hyped / Dramatic Cut',
    hookStyle: 'Contrarian statement ("Stop doing X")',
    watchTimeBenefit: '+64% average completion rate through curiosity gap'
  },
  {
    id: 'template-seamless-loop',
    name: 'Endless Seamless Loop POV',
    category: 'Algorithm Booster',
    description: 'Ending scene text connects seamlessly into the first scene hook. Viewers replay 1.8x without realizing the loop.',
    targetDuration: 7,
    pacing: 'looping-pov',
    visualStyle: 'Cinematic Sunset Glow with center-focused focal point',
    recommendedAudioMood: 'High Energy & Driving',
    hookStyle: 'POV: You finally unlocked this workflow',
    watchTimeBenefit: 'Generates 140%+ watch-time metric triggering Explore feed'
  },
  {
    id: 'template-educational-breakdown',
    name: 'Micro-Value Framework',
    category: 'Saves & Shares',
    description: 'Structured 3-part blueprint with numbered dynamic pill badges and actionable takeaways designed to maximize saves.',
    targetDuration: 13,
    pacing: 'educational-steps',
    visualStyle: 'Minimal Dark Luxe with emerald accent cards',
    recommendedAudioMood: 'Aesthetic / Cozy Chill',
    hookStyle: 'The 3-step system top 1% creators use',
    watchTimeBenefit: 'High bookmark-to-view ratio signals authority to algorithm'
  },
  {
    id: 'template-cinematic-quote',
    name: 'Hypnotic Aesthetic Story',
    category: 'Viral Audio Pairing',
    description: 'Atmospheric fluid visuals paired with a poignant mindset revelation that viewers pause to re-read.',
    targetDuration: 10,
    pacing: 'cinematic',
    visualStyle: 'Electric Violet with subtle gradient motion',
    recommendedAudioMood: 'Inspiring / Storytelling',
    hookStyle: 'Read this twice if you are building in 2026',
    watchTimeBenefit: 'Extended reading dwell time increases watch duration'
  }
];

export const PRODUCTION_TRENDING_AUDIOS: TrendingAudio[] = [
  {
    id: 'audio-1',
    title: 'Midnight Phonk Drive (Sped Up)',
    artist: 'Kxllswitch & DJ Vex',
    bpm: 142,
    viralVelocity: '+480% this week',
    category: 'Electronic / Phonk',
    duration: 12,
    mood: 'High Energy & Driving',
    dropTimestamp: 2.2,
    synthPreset: 'cyber-synth',
    usesCount: '1.2M reels'
  },
  {
    id: 'audio-2',
    title: 'Warm Nostalgia & Vinyl Cracks',
    artist: 'Lofi Collective',
    bpm: 85,
    viralVelocity: '+320% this week',
    category: 'Lofi & Aesthetic',
    duration: 15,
    mood: 'Aesthetic / Cozy Chill',
    dropTimestamp: 3.5,
    synthPreset: 'chill-lofi',
    usesCount: '890K reels'
  },
  {
    id: 'audio-3',
    title: 'Sub-Zero Bass Drop (Viral Hook)',
    artist: 'Metro Pulse',
    bpm: 128,
    viralVelocity: '+610% this week',
    category: 'Trap & Bass',
    duration: 9,
    mood: 'Hyped / Dramatic Cut',
    dropTimestamp: 1.8,
    synthPreset: 'trap-bass',
    usesCount: '2.4M reels'
  },
  {
    id: 'audio-4',
    title: 'Sunset Neon Groove',
    artist: 'Horizon Club',
    bpm: 124,
    viralVelocity: '+290% this week',
    category: 'Deep House / Luxury',
    duration: 14,
    mood: 'Sophisticated / Luxe',
    dropTimestamp: 2.8,
    synthPreset: 'deep-house',
    usesCount: '650K reels'
  },
  {
    id: 'audio-5',
    title: 'Celestial Ambient Horizon',
    artist: 'Aetheric Sound Lab',
    bpm: 90,
    viralVelocity: '+410% this week',
    category: 'Cinematic Ambient',
    duration: 11,
    mood: 'Inspiring / Storytelling',
    dropTimestamp: 2.0,
    synthPreset: 'ambient-glow',
    usesCount: '1.8M reels'
  }
];

export const DEFAULT_ACCOUNT_ANALYTICS: AccountAnalytics = {
  profile: {
    handle: '@SARLX.Ai',
    name: 'SARLX.Ai',
    avatar: '',
    followers: 0,
    followersChange: 0,
    following: 0,
    postsCount: 0,
    category: 'AI Growth Engine',
    bio: '⚡ Autonomous Instagram growth & reach agent for SARLX.Ai\n🎬 Real-time viral reels, carousels, and 24/7 engagement',
    isVerified: true
  },
  metrics: {
    impressions: 0,
    impressionsChange: 0,
    reach: 0,
    reachChange: 0,
    profileViews: 0,
    profileViewsChange: 0,
    totalReelPlays: 0,
    reelPlaysChange: 0,
    avgWatchTimeSeconds: 0,
    avgWatchTimeBenchmark: 0,
    loopCompletionRate: 0,
    engagementRate: 0
  },
  historicalImpressions: [
    { date: 'Day 1', impressions: 0, reelViews: 0, postImpressions: 0 },
    { date: 'Day 2', impressions: 0, reelViews: 0, postImpressions: 0 },
    { date: 'Day 3', impressions: 0, reelViews: 0, postImpressions: 0 },
    { date: 'Day 4', impressions: 0, reelViews: 0, postImpressions: 0 },
    { date: 'Day 5', impressions: 0, reelViews: 0, postImpressions: 0 },
    { date: 'Day 6', impressions: 0, reelViews: 0, postImpressions: 0 },
    { date: 'Day 7', impressions: 0, reelViews: 0, postImpressions: 0 }
  ],
  retentionCurve: [
    { second: 0, percentage: 0 },
    { second: 1, percentage: 0 },
    { second: 2, percentage: 0 },
    { second: 3, percentage: 0 },
    { second: 5, percentage: 0 },
    { second: 7, percentage: 0 },
    { second: 10, percentage: 0 },
    { second: 12, percentage: 0 }
  ],
  bestPostingSlots: [
    { day: 'Monday', time: '18:30', boostPercentage: '+44% reach', isScheduled: false },
    { day: 'Wednesday', time: '12:15', boostPercentage: '+38% reach', isScheduled: false },
    { day: 'Thursday', time: '19:00', boostPercentage: '+52% reach', isScheduled: false },
    { day: 'Friday', time: '17:45', boostPercentage: '+47% reach', isScheduled: false },
    { day: 'Sunday', time: '20:00', boostPercentage: '+61% reach', isScheduled: false }
  ]
};
