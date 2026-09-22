import { TrendingAudio, ReelTemplate, ReelItem, CommentItem, AccountAnalytics, StrategyInsight, PostItem } from '../types';

export const INITIAL_TRENDING_AUDIOS: TrendingAudio[] = [
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

export const REEL_TEMPLATES: ReelTemplate[] = [
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

export const INITIAL_ACCOUNT_ANALYTICS: AccountAnalytics = {
  profile: {
    handle: '@alexcreates.ai',
    name: 'Alex Rivera | AI & Design Growth',
    avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200&auto=format&fit=crop&q=80',
    followers: 48920,
    followersChange: 14.8,
    following: 342,
    postsCount: 168,
    category: 'Digital Creator & Tech Innovator',
    bio: '⚡ Scaling impressions & views with autonomous AI\n🎬 12.8M views in 90 days | Daily viral reels & carousels\n👇 Grab the 2026 Growth Playbook',
    isVerified: true
  },
  metrics: {
    impressions: 482650,
    impressionsChange: 28.4,
    reach: 394200,
    reachChange: 32.1,
    profileViews: 41800,
    profileViewsChange: 19.3,
    totalReelPlays: 624100,
    reelPlaysChange: 41.7,
    avgWatchTimeSeconds: 7.9,
    avgWatchTimeBenchmark: 5.2,
    loopCompletionRate: 74.2,
    engagementRate: 8.6
  },
  historicalImpressions: [
    { date: 'Sep 15', impressions: 42100, reelViews: 34000, postImpressions: 8100 },
    { date: 'Sep 16', impressions: 48300, reelViews: 39200, postImpressions: 9100 },
    { date: 'Sep 17', impressions: 59400, reelViews: 49100, postImpressions: 10300 },
    { date: 'Sep 18', impressions: 54100, reelViews: 43500, postImpressions: 10600 },
    { date: 'Sep 19', impressions: 72800, reelViews: 61200, postImpressions: 11600 },
    { date: 'Sep 20', impressions: 89500, reelViews: 76400, postImpressions: 13100 },
    { date: 'Sep 21', impressions: 116450, reelViews: 98200, postImpressions: 18250 }
  ],
  retentionCurve: [
    { second: 0, percentage: 100 },
    { second: 1, percentage: 94 },
    { second: 2, percentage: 89 },
    { second: 3, percentage: 85 },
    { second: 5, percentage: 78 },
    { second: 7, percentage: 71 },
    { second: 10, percentage: 63 },
    { second: 12, percentage: 58 }
  ],
  bestPostingSlots: [
    { day: 'Monday', time: '18:30', boostPercentage: '+44% reach', isScheduled: true },
    { day: 'Wednesday', time: '12:15', boostPercentage: '+38% reach', isScheduled: true },
    { day: 'Thursday', time: '19:00', boostPercentage: '+52% reach', isScheduled: false },
    { day: 'Friday', time: '17:45', boostPercentage: '+47% reach', isScheduled: true },
    { day: 'Sunday', time: '20:00', boostPercentage: '+61% reach', isScheduled: false }
  ]
};

export const INITIAL_REELS: ReelItem[] = [
  {
    id: 'reel-viral-1',
    title: 'The 3-Second Rule That 10x My Reel Views',
    niche: 'AI & Content Growth',
    duration: 8,
    audio: INITIAL_TRENDING_AUDIOS[0],
    videoTemplateId: 'template-fast-hook',
    hookScore: 96,
    retentionEstimate: 82,
    createdAt: '2026-09-20T14:30:00Z',
    status: 'published',
    scheduledPlatforms: ['instagram', 'threads', 'tiktok'],
    views: 184500,
    likes: 14200,
    commentsCount: 382,
    shares: 4120,
    caption: `If your reels are stuck under 2,000 views, you're losing 60% of people in the first 1.5 seconds.\n\nHere is how we fixed our retention curve:\n1. Zero hello intro. First frame has high-contrast movement.\n2. Audio drop matches the 2.2s reveal.\n3. The loop seamlessly connects to sentence 1.\n\nSave this for your next batch session 🚀`,
    hashtags: ['#reelsgrowth', '#contentcreator', '#instagramstrategy', '#viralvideo', '#creatoreconomy'],
    scenes: [
      {
        id: 's1',
        order: 1,
        durationSeconds: 2.2,
        hookText: 'Stop saying "Hey guys" in your reels.',
        secondaryText: 'You have 1.2s before they swipe away.',
        visualTheme: 'neon-cyber',
        accentColor: '#ec4899',
        pacingEffect: 'flash-cut'
      },
      {
        id: 's2',
        order: 2,
        durationSeconds: 2.8,
        hookText: 'Cut straight to the bold contradiction.',
        secondaryText: 'Match the beat drop with your visual punchline.',
        visualTheme: 'electric-violet',
        accentColor: '#8b5cf6',
        pacingEffect: 'zoom-in'
      },
      {
        id: 's3',
        order: 3,
        durationSeconds: 3.0,
        hookText: 'End your video mid-sentence to loop.',
        secondaryText: 'This is why...',
        visualTheme: 'sunset-glow',
        accentColor: '#f59e0b',
        pacingEffect: 'subtle-drift'
      }
    ]
  },
  {
    id: 'reel-scheduled-2',
    title: '5 AI Tools You Didn’t Know Were Free',
    niche: 'Tech & Productivity',
    duration: 10,
    audio: INITIAL_TRENDING_AUDIOS[2],
    videoTemplateId: 'template-educational-breakdown',
    hookScore: 92,
    retentionEstimate: 78,
    createdAt: '2026-09-21T18:00:00Z',
    status: 'scheduled',
    scheduledTime: 'Today at 19:00 (Peak Slot)',
    scheduledPlatforms: ['instagram', 'threads'],
    caption: `Most people are paying $20/mo for software that already exists completely open-source and free.\n\nHere are 5 hidden tools we automated into our studio workflow.\n\nDrop "TOOL" below and our AI bot will DM you the direct instant links! ⚡`,
    hashtags: ['#aitools', '#productivity', '#techhacks', '#software', '#automation'],
    scenes: [
      {
        id: 'sc1',
        order: 1,
        durationSeconds: 2.5,
        hookText: 'Cancel that $20/mo AI subscription.',
        secondaryText: 'These 5 tools do it better for $0.',
        visualTheme: 'minimal-dark',
        accentColor: '#10b981',
        pacingEffect: 'pulse'
      },
      {
        id: 'sc2',
        order: 2,
        durationSeconds: 4.5,
        hookText: 'Automate voiceovers, beat alignment & auto-cuts.',
        secondaryText: 'Zero manual keyframing required.',
        visualTheme: 'emerald-flux',
        accentColor: '#34d399',
        pacingEffect: 'slide-up'
      },
      {
        id: 'sc3',
        order: 3,
        durationSeconds: 3.0,
        hookText: 'Comment "TOOL" for the exact cheat-sheet link.',
        secondaryText: 'Link lands instantly in your DMs.',
        visualTheme: 'neon-cyber',
        accentColor: '#06b6d4',
        pacingEffect: 'flash-cut'
      }
    ]
  }
];

export const INITIAL_POSTS: PostItem[] = [
  {
    id: 'post-1',
    type: 'carousel',
    title: 'The Anatomy of a 1M View Instagram Carousel',
    caption: `Why some carousels get 10,000 saves while others get crickets:\n\nSlide 1 is your billboard.\nSlide 2-7 delivers relentless high-density frameworks.\nSlide 8 asks for the save without being cheesy.\n\nSwipe through for the complete visual teardown 👉`,
    hashtags: ['#instagramcarousel', '#contentdesign', '#engagementtips', '#digitalcreator'],
    createdAt: '2026-09-19T16:00:00Z',
    status: 'published',
    scheduledPlatforms: ['instagram'],
    engagementScore: 94,
    slides: [
      {
        slideNumber: 1,
        headline: 'The Anatomy of a 1M View Carousel',
        bodyText: 'How 1 visual tweak generated 48,000 bookmarks in 48 hours.',
        takeaway: 'Swipe to see the exact structure →',
        theme: 'dark'
      },
      {
        slideNumber: 2,
        headline: 'Slide 1: The Contrast Filter',
        bodyText: 'High contrast serif + bold highlight. Never use generic corporate stock photos.',
        takeaway: 'Rule: 65% of feed users only see Slide 1.',
        theme: 'indigo'
      },
      {
        slideNumber: 3,
        headline: 'Slide 2: Validate the Problem',
        bodyText: 'Before giving answers, prove you understand their exact friction points.',
        takeaway: 'Empathy drives slide progression.',
        theme: 'slate'
      },
      {
        slideNumber: 4,
        headline: 'Slide 4: The 1-Action Framework',
        bodyText: 'Give them something they can screenshot and implement right now.',
        takeaway: 'Bookmarks signal high algorithm authority.',
        theme: 'emerald'
      }
    ]
  }
];

export const INITIAL_COMMENTS: CommentItem[] = [
  {
    id: 'cmt-1',
    postId: 'reel-viral-1',
    postTitle: 'The 3-Second Rule That 10x My Reel Views',
    author: 'Elena Vance',
    authorHandle: '@elenav_creates',
    authorAvatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100&auto=format&fit=crop&q=80',
    text: 'What audio did you use for this? The beat drop timing is insane!! 🔥',
    timestamp: '12m ago',
    sentiment: 'positive',
    intentLabel: 'Audio Inquiry',
    replyStatus: 'auto_replied',
    replyText: 'Appreciate it Elena! 🎧 We synced it to "Sub-Zero Bass Drop" at 128 BPM. The drop hits right at 2.2s!',
    replyTimestamp: '10m ago',
    autoRepliedByAi: true
  },
  {
    id: 'cmt-2',
    postId: 'reel-scheduled-2',
    postTitle: '5 AI Tools You Didn’t Know Were Free',
    author: 'Marcus Chen',
    authorHandle: '@mchen_tech',
    authorAvatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&auto=format&fit=crop&q=80',
    text: 'TOOL - need that cheat sheet ASAP brother 🙏',
    timestamp: '25m ago',
    sentiment: 'purchase_intent',
    intentLabel: 'Keyword Trigger ("TOOL")',
    replyStatus: 'auto_replied',
    replyText: 'Just fired the complete cheat-sheet and workflow guide to your DMs Marcus! Check requests if not in inbox 🚀',
    replyTimestamp: '24m ago',
    autoRepliedByAi: true
  },
  {
    id: 'cmt-3',
    postId: 'reel-viral-1',
    postTitle: 'The 3-Second Rule That 10x My Reel Views',
    author: 'Sophia Martinez',
    authorHandle: '@sophia_m_design',
    authorAvatar: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=100&auto=format&fit=crop&q=80',
    text: 'Does this pacing rule still work for longer educational reels (like 45-60s) or only short ones?',
    timestamp: '42m ago',
    sentiment: 'question',
    intentLabel: 'Technical Question',
    replyStatus: 'pending'
  },
  {
    id: 'cmt-4',
    postId: 'post-1',
    postTitle: 'The Anatomy of a 1M View Instagram Carousel',
    author: 'David Wright',
    authorHandle: '@dwright_media',
    authorAvatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=100&auto=format&fit=crop&q=80',
    text: 'This single carousel gave me more value than a $500 course I bought last week. Bookmarked!',
    timestamp: '1h ago',
    sentiment: 'positive',
    intentLabel: 'High Praise',
    replyStatus: 'pending'
  },
  {
    id: 'cmt-5',
    postId: 'reel-viral-1',
    postTitle: 'The 3-Second Rule That 10x My Reel Views',
    author: 'Crypto Bot 99',
    authorHandle: '@fast_crypto_profits',
    authorAvatar: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=100&auto=format&fit=crop&q=80',
    text: 'Invest $100 earn $5000 in 24 hours guaranteed message me now on telegram 💰',
    timestamp: '2h ago',
    sentiment: 'spam',
    intentLabel: 'Spam / Scam Filtered',
    replyStatus: 'ignored'
  }
];

export const INITIAL_STRATEGY_INSIGHTS: StrategyInsight[] = [
  {
    id: 'strat-1',
    type: 'posting_window',
    title: 'High-Velocity Window: Thursday 19:00',
    description: 'Your followers are 52% more active between 18:45 and 20:15 on Thursdays. Scheduling a 8s high-retention reel here will capture immediate momentum.',
    impact: 'critical',
    metricTarget: '+45K Projected Impressions',
    actionLabel: 'Schedule Reel to Thursday 19:00',
    suggestedActionType: 'reschedule'
  },
  {
    id: 'strat-2',
    type: 'audio_trend',
    title: 'Audio Velocity Alert: "Midnight Phonk" (+480%)',
    description: 'Trending audio "Midnight Phonk Drive" has an 84% algorithmic push rate right now. Pairing this with a 3-scene fast hook will double non-follower reach.',
    impact: 'high',
    metricTarget: 'Reach +38%',
    actionLabel: 'Generate Reel with this Track',
    suggestedActionType: 'create_reel'
  },
  {
    id: 'strat-3',
    type: 'opportunity',
    title: 'Turn Comments Into DM Lead Conversions',
    description: 'Comments with keyword "TOOL" have a 92% open rate when answered within 3 minutes. Enable Autonomous Auto-DM Responder to capture leads 24/7.',
    impact: 'high',
    metricTarget: 'Community Engagement +60%',
    actionLabel: 'Enable Auto-Reply Mode',
    suggestedActionType: 'enable_auto_reply'
  },
  {
    id: 'strat-4',
    type: 'pacing',
    title: 'Optimize Watch Retention: 7-9s Sweet Spot',
    description: 'Your reels under 9 seconds are achieving 74.2% loop completion vs 41% for 20s+ videos. Prioritize the "3-Sec Viral Pattern Interrupt" template.',
    impact: 'medium',
    metricTarget: 'Avg Watch Time 7.9s',
    actionLabel: 'Load 8s Fast-Hook Template',
    suggestedActionType: 'tweak_hook'
  }
];
