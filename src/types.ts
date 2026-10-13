export type Platform = 'instagram' | 'threads' | 'facebook' | 'tiktok';

export interface TrendingAudio {
  id: string;
  title: string;
  artist: string;
  bpm: number;
  viralVelocity: string; // e.g. "+380% velocity"
  category: string;
  duration: number; // in seconds
  mood: string;
  dropTimestamp: number; // e.g. 2.4s
  synthPreset: 'cyber-synth' | 'chill-lofi' | 'trap-bass' | 'deep-house' | 'ambient-glow';
  usesCount: string;
}

export interface InteractiveWidget {
  type?: 'poll' | 'pause-challenge' | 'dilemma';
  question?: string;
  optionA?: string;
  optionB?: string;
  percentA?: number;
  percentB?: number;
  pauseTarget?: string;
  anomalyClue?: string;
  callToAction?: string;
}

export interface ReelScene {
  id: string;
  order: number;
  durationSeconds: number;
  hookText: string;
  secondaryText?: string;
  headline?: string;
  highlight?: string;
  subline?: string;
  voiceScript?: string;
  visualTheme: 'neon-cyber' | 'sunset-glow' | 'minimal-dark' | 'electric-violet' | 'emerald-flux' | 'monochrome-bold';
  accentColor: string;
  pacingEffect: 'pulse' | 'zoom-in' | 'flash-cut' | 'slide-up' | 'subtle-drift';
  visualFormat?: 'full-bleed-cinematic' | 'classified-dossier' | 'satellite-telemetry' | 'lower-third' | 'split-screen' | 'pause-challenge';
  interactiveWidget?: InteractiveWidget;
}

export interface ReelItem {
  id: string;
  title: string;
  niche: string;
  duration: number;
  audio: TrendingAudio;
  scenes: ReelScene[];
  caption: string;
  hashtags: string[];
  hookScore: number; // 0-100
  retentionEstimate: number; // percentage
  createdAt: string;
  status: 'draft' | 'saved' | 'scheduled' | 'published';
  scheduledTime?: string;
  scheduledPlatforms: Platform[];
  views?: number;
  likes?: number;
  commentsCount?: number;
  shares?: number;
  videoTemplateId: string;
  videoUrl?: string;
  instagramPostId?: string;
  permalink?: string;
  publishTimestamp?: string;
}

export interface CarouselSlide {
  slideNumber: number;
  headline: string;
  bodyText: string;
  takeaway: string;
  theme: string;
}

export interface PostItem {
  id: string;
  type: 'carousel' | 'single-image' | 'quote-graphic';
  title: string;
  caption: string;
  hashtags: string[];
  slides?: CarouselSlide[];
  singleImageTheme?: string;
  status: 'draft' | 'saved' | 'scheduled' | 'published';
  scheduledTime?: string;
  scheduledPlatforms: Platform[];
  createdAt: string;
  engagementScore: number;
  instagramPostId?: string;
  permalink?: string;
  publishTimestamp?: string;
}

export interface CommentItem {
  id: string;
  postId: string;
  postTitle: string;
  author: string;
  authorHandle: string;
  authorAvatar: string;
  text: string;
  timestamp: string;
  sentiment: 'positive' | 'question' | 'purchase_intent' | 'skeptical' | 'spam';
  intentLabel: string;
  replyStatus: 'pending' | 'auto_replied' | 'custom_replied' | 'ignored';
  replyText?: string;
  replyTimestamp?: string;
  autoRepliedByAi?: boolean;
}

export interface AccountAnalytics {
  profile: {
    handle: string;
    name: string;
    avatar: string;
    followers: number;
    followersChange: number;
    following: number;
    postsCount: number;
    category: string;
    bio: string;
    isVerified: boolean;
  };
  metrics: {
    impressions: number;
    impressionsChange: number;
    reach: number;
    reachChange: number;
    profileViews: number;
    profileViewsChange: number;
    totalReelPlays: number;
    reelPlaysChange: number;
    avgWatchTimeSeconds: number;
    avgWatchTimeBenchmark: number;
    loopCompletionRate: number;
    engagementRate: number;
  };
  historicalImpressions: {
    date: string;
    impressions: number;
    reelViews: number;
    postImpressions: number;
  }[];
  retentionCurve: {
    second: number;
    percentage: number;
  }[];
  bestPostingSlots: {
    day: string;
    time: string;
    boostPercentage: string;
    isScheduled: boolean;
  }[];
}

export interface StrategyInsight {
  id: string;
  type: 'opportunity' | 'pacing' | 'audio_trend' | 'hook_tweak' | 'posting_window';
  title: string;
  description: string;
  impact: 'high' | 'critical' | 'medium';
  metricTarget: string;
  actionLabel: string;
  suggestedActionType: 'create_reel' | 'reschedule' | 'enable_auto_reply' | 'tweak_hook';
}

export interface ReelTemplate {
  id: string;
  name: string;
  category: string;
  description: string;
  targetDuration: number;
  pacing: 'fast-hook' | 'cinematic' | 'looping-pov' | 'educational-steps' | 'split-screen';
  visualStyle: string;
  recommendedAudioMood: string;
  hookStyle: string;
  watchTimeBenefit: string;
}

export interface AutonomousExecutionLog {
  id: string;
  timestamp: string;
  topicResearched: string;
  webSources: string[];
  ideaHook: string;
  reelTitle: string;
  reelId: string;
  instagramPostId: string;
  captionPreview: string;
  status: 'published' | 'processing' | 'failed';
  reachGained: number;
  viewsGained: number;
}

export interface Autonomous24x7Config {
  enabled: boolean;
  intervalMinutes: number;
  formatPreference?: 'reels_only' | 'carousels_only' | 'balanced';
  lastRun: string | null;
  nextRun: string | null;
  targetNiche: string;
  currentStage: 'idle' | 'researching_web' | 'ideating_hook' | 'generating_template' | 'publishing_instagram' | 'completed';
  instagramPublishing: {
    enabled: boolean;
    method: 'direct_pipeline' | 'graph_api';
    instagramAccountId: string;
    metaAccessToken: string;
    lastPublishedPostId: string | null;
  };
  logs: AutonomousExecutionLog[];
}

export interface EngagementAgent {
  id: string;
  name: string;
  role: string;
  description: string;
  status: 'active' | 'paused';
  avatarColor: string;
  targetHashtags: string[];
  dailyLimit: number;
  actionsToday: number;
  totalActions: number;
  lastActiveAt: string | null;
  config: Record<string, any>;
  isManager?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AgentActivityLog {
  id: string;
  agentId: string;
  agentName: string;
  actionType: 'like' | 'comment' | 'solution';
  targetMediaId?: string;
  targetMediaUrl: string;
  targetAuthor: string;
  targetCaption?: string;
  payloadText?: string;
  status: 'success' | 'simulated' | 'queued' | 'failed' | 'vetoed_by_manager' | 'copilot_ready';
  managerVerdict?: 'approved' | 'vetoed' | 'flagged';
  complianceScore?: number;
  managerNotes?: string;
  reviewedBy?: string;
  details?: Record<string, any>;
  createdAt: string;
}

export interface ContentPillar {
  id: string;
  niche: string;
  badge: string;
  description: string;
  pillars: string[];
  sampleHooks: string[];
  visualAesthetic: string;
}

export interface AccountPersona {
  brand: string;
  handle: string;
  niche: string;
  audience: string;
  toneOfVoice: string[];
  visualDirection: string;
  accentColors: string[];
  defaultCta: string;
  contentPillars: ContentPillar[];
  analyzedPostCount?: number;
  lastLearnedAt?: string;
  learnedFromBio?: string;
  customNotes?: string;
}

export interface ManagedAccount {
  id: string;
  platform: string;
  accountId: string;
  username: string;
  name: string;
  profilePictureUrl: string;
  biography: string;
  followersCount: number;
  followsCount: number;
  mediaCount: number;
  isConnected: boolean;
  isActive: boolean;
  persona?: AccountPersona;
  updatedAt: string;
}

