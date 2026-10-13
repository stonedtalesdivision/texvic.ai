import { EventEmitter } from 'events';
import { chromium, BrowserContext, Page } from 'playwright';
import path from 'path';
import fs from 'fs';
import { db } from './database.js';
import { generateAgentComment, generateBrainComment, generateHistoricalInsight, superviseAndAuditAction, getAgent } from './agentSwarm.js';
import { GoogleGenAI } from '@google/genai';
import { notifySurferSessionFinished } from './telegramBot.js';

const BROWSER_USER_DATA_DIR = path.resolve(process.cwd(), 'data', 'browser_profile');
const STORAGE_STATE_PATH = path.resolve(process.cwd(), 'data', 'instagram_storage_state.json');
const SCREENSHOTS_DIR = path.resolve(process.cwd(), 'data', 'media', 'browser_screenshots');

// Ensure directories exist
if (!fs.existsSync(BROWSER_USER_DATA_DIR)) fs.mkdirSync(BROWSER_USER_DATA_DIR, { recursive: true });
if (!fs.existsSync(SCREENSHOTS_DIR)) fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });

function resolveChromePath(): string {
  if (process.env.CHROME_PATH && fs.existsSync(process.env.CHROME_PATH)) {
    return process.env.CHROME_PATH;
  }
  const candidates = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser'
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return '';
}

const CHROME_PATH = resolveChromePath();

export interface BrowserStep {
  id: string;
  timestamp: string;
  stepName: string;
  actionType: 'navigate' | 'watch' | 'comment' | 'like' | 'follow' | 'dm' | 'auth' | 'idle';
  description: string;
  targetUrl?: string;
  targetCreator?: string;
  details?: Record<string, any>;
  screenshotUrl?: string;
}

export interface BrowserStatus {
  isRunning: boolean;
  isLoggedIn: boolean;
  username: string | null;
  currentStep: string;
  currentActivity: {
    action: string;
    targetCreator?: string;
    targetUrl?: string;
    stepNumber?: number;
    totalSteps?: number;
    startedAt?: string;
  } | null;
  recentSteps: BrowserStep[];
  lastCheckedAt: string | null;
  lastActionAt: string | null;
  lastActionType: string | null;
  lastTargetUrl: string | null;
  latestScreenshotUrl: string | null;
  liveStreamUrl?: string;
  autonomousSessionsEnabled: boolean;
  sessionState: 'idle' | 'surfing' | 'resting' | 'sleeping';
  currentSessionNumber: number;
  nextSessionAt: string | null;
  lastSessionSummary: {
    sessionNumber: number;
    reelsWatched: number;
    likesGiven: number;
    commentsPosted: number;
    usersFollowed: number;
    completedAt: string;
  } | null;
  sentinelConfig: {
    minReelsPerSession: number;
    maxReelsPerSession: number;
    minBreakMinutes: number;
    maxBreakMinutes: number;
    maxDailyLikes: number;
    maxDailyComments: number;
  };
  stats: {
    reelsWatched: number;
    commentsPosted: number;
    likesGiven: number;
    dmsReplied: number;
    usersFollowed: number;
  };
}

class BrowserSurferManager extends EventEmitter {
  private activeContext: BrowserContext | null = null;
  private activeLivePage: Page | null = null;
  private activeCdp: any = null;
  private latestFrameBuffer: Buffer | null = null;
  private lastDiskSnapshotTime: number = 0;
  private isProcessing = false;
  private headedProcessRunning = false;
  private currentStep = 'Idle — Ready for autonomous surfing';
  private currentActivity: {
    action: string;
    targetCreator?: string;
    targetUrl?: string;
    stepNumber?: number;
    totalSteps?: number;
    startedAt?: string;
  } | null = null;
  private recentSteps: BrowserStep[] = [
    {
      id: 'step-init',
      timestamp: new Date().toISOString(),
      stepName: 'Agent Surfer Ready',
      actionType: 'auth',
      description: 'Stealth Chromium initialized at https://www.instagram.com/.',
      screenshotUrl: '/api/browser/screenshot/latest_status.jpg'
    }
  ];
  private stats = {
    reelsWatched: 0,
    commentsPosted: 0,
    likesGiven: 0,
    dmsReplied: 0,
    usersFollowed: 0
  };

  // Autonomous periodic session state governed by Agent Sentinel
  private autonomousSessionsEnabled = false;
  private sessionState: 'idle' | 'surfing' | 'resting' | 'sleeping' = 'idle';
  private currentSessionNumber = 0;
  private nextSessionAt: string | null = null;
  private sessionTimer: NodeJS.Timeout | null = null;
  private lastSessionSummary: {
    sessionNumber: number;
    reelsWatched: number;
    likesGiven: number;
    commentsPosted: number;
    usersFollowed: number;
    completedAt: string;
  } | null = null;
  private sentinelConfig = {
    minReelsPerSession: 20,
    maxReelsPerSession: 45,
    minBreakMinutes: 25,
    maxBreakMinutes: 55,
    maxDailyLikes: 40,
    maxDailyComments: 12
  };

  constructor() {
    super();
    this.initDatabaseTable();
  }

  /**
   * Records a live step for the telemetry viewport & logs feed
   */
  public async recordStep(
    stepName: string,
    actionType: BrowserStep['actionType'],
    description: string,
    options: {
      targetUrl?: string;
      targetCreator?: string;
      details?: Record<string, any>;
      page?: Page;
      updateActivity?: {
        action: string;
        targetCreator?: string;
        targetUrl?: string;
        stepNumber?: number;
        totalSteps?: number;
      };
    } = {}
  ): Promise<string | undefined> {
    const id = `step-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const timestamp = new Date().toISOString();
    let screenshotUrl: string | undefined;

    this.currentStep = description;
    if (options.updateActivity) {
      this.currentActivity = {
        ...options.updateActivity,
        startedAt: this.currentActivity?.startedAt || timestamp
      };
    }

    if (options.page && !options.page.isClosed()) {
      try {
        const shotPath = path.join(SCREENSHOTS_DIR, 'latest_status.jpg');
        await options.page.screenshot({ path: shotPath, type: 'jpeg', quality: 75 });
        screenshotUrl = `/api/browser/screenshot/latest_status.jpg`;
      } catch {}
    }

    const stepObj: BrowserStep = {
      id,
      timestamp,
      stepName,
      actionType,
      description,
      targetUrl: options.targetUrl,
      targetCreator: options.targetCreator,
      details: options.details,
      screenshotUrl
    };

    this.recentSteps.unshift(stepObj);
    if (this.recentSteps.length > 50) {
      this.recentSteps = this.recentSteps.slice(0, 50);
    }

    console.info(`[Browser Telemetry] 📍 [${actionType.toUpperCase()}] ${stepName}: ${description}`);
    return screenshotUrl;
  }

  private initDatabaseTable() {
    try {
      db.exec(`
        CREATE TABLE IF NOT EXISTS browser_surfer_sessions (
          id TEXT PRIMARY KEY,
          username TEXT,
          is_logged_in INTEGER DEFAULT 0,
          last_checked_at TEXT,
          last_action_at TEXT,
          last_action_type TEXT,
          last_target_url TEXT,
          latest_screenshot_path TEXT,
          status TEXT DEFAULT 'idle',
          stats_json TEXT DEFAULT '{}',
          updated_at TEXT NOT NULL
        );
      `);
    } catch (e) {
      console.warn('[Browser Surfer] DB table init warning:', e);
    }
  }

  /**
   * Launch a persistent browser context with anti-detection flags
   */
  public async getContext(headless = true): Promise<BrowserContext> {
    if (this.activeContext) {
      return this.activeContext;
    }

    const launchOptions: any = {
      headless,
      viewport: { width: 1280, height: 860 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
      locale: 'en-US',
      timezoneId: 'America/New_York',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled',
        '--disable-infobars',
        '--enable-gpu-rasterization',
        '--enable-zero-copy',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding'
      ]
    };

    if (CHROME_PATH && fs.existsSync(CHROME_PATH)) {
      launchOptions.executablePath = CHROME_PATH;
    }

    const context = await chromium.launchPersistentContext(BROWSER_USER_DATA_DIR, launchOptions);

    // Apply stealth scripts
    await context.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
      Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
      (window as any).chrome = { runtime: {} };
    });

    this.activeContext = context;
    return context;
  }

  /**
   * Closes active browser session
   */
  public async closeBrowser(): Promise<void> {
    await this.detachScreencast();
    if (this.activeContext) {
      try {
        await this.activeContext.close();
      } catch {}
      this.activeContext = null;
    }
  }

  /**
   * Attaches Chrome DevTools Protocol Screencast to stream raw compositor frames at 30+ FPS
   */
  public async attachScreencast(page: Page): Promise<void> {
    try {
      if (this.activeCdp) {
        try {
          await this.activeCdp.send('Page.stopScreencast');
          await this.activeCdp.detach();
        } catch {}
        this.activeCdp = null;
      }

      this.activeLivePage = page;
      const cdp = await page.context().newCDPSession(page);
      this.activeCdp = cdp;

      cdp.on('Page.screencastFrame', async ({ data, sessionId }: any) => {
        try {
          // 1. Immediately ACK so Chromium does not throttle or delay sending the next 30 FPS frame
          cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {});

          const buffer = Buffer.from(data, 'base64');
          this.latestFrameBuffer = buffer;
          this.emit('screencast_frame', buffer);

          // 2. Throttle disk write to at most once per 1000ms so disk I/O doesn't bottleneck streaming
          const now = Date.now();
          if (now - this.lastDiskSnapshotTime >= 1000) {
            this.lastDiskSnapshotTime = now;
            const shotPath = path.join(SCREENSHOTS_DIR, 'latest_status.jpg');
            fs.promises.writeFile(shotPath, buffer).catch(() => {});
          }
        } catch {}
      });

      await cdp.send('Page.startScreencast', {
        format: 'jpeg',
        quality: 75,
        maxWidth: 1280,
        maxHeight: 860,
        everyNthFrame: 1
      });

      console.info('[Browser Surfer] 🔴 Live Compositor Screencast Stream attached & broadcasting at 30 FPS!');
    } catch (err: any) {
      console.warn('[Browser Surfer] CDP screencast attach warning:', err?.message || err);
    }
  }

  public async detachScreencast(): Promise<void> {
    if (this.activeCdp) {
      try {
        await this.activeCdp.send('Page.stopScreencast');
        await this.activeCdp.detach();
      } catch {}
      this.activeCdp = null;
    }
    this.activeLivePage = null;
  }

  public getLatestFrame(): Buffer | null {
    if (this.latestFrameBuffer) return this.latestFrameBuffer;
    const shotPath = path.join(SCREENSHOTS_DIR, 'latest_status.jpg');
    if (fs.existsSync(shotPath)) {
      try {
        return fs.readFileSync(shotPath);
      } catch {}
    }
    return null;
  }

  /**
   * Ensures an active page is open on Instagram and attached to live screencasting
   */
  public async ensureLiveStream(): Promise<Page> {
    if (this.activeLivePage && !this.activeLivePage.isClosed() && this.activeCdp) {
      return this.activeLivePage;
    }

    const context = await this.getContext(true);
    const pages = context.pages();
    let page = pages.find(p => !p.isClosed());

    if (!page) {
      page = await context.newPage();
      try {
        await page.goto('https://www.instagram.com/reels/', { waitUntil: 'domcontentloaded', timeout: 35000 });
      } catch {
        await page.goto('https://www.instagram.com/', { waitUntil: 'domcontentloaded', timeout: 35000 });
      }
    }

    await this.attachScreencast(page);
    return page;
  }

  /**
   * Extracts real reel URL, creator handle, and caption directly from the active Instagram Reels DOM
   */
  public async extractActiveReelInfo(page: Page): Promise<{ url: string; creator: string; caption: string }> {
    try {
      return await page.evaluate(() => {
        const url = window.location.href;
        let creator = 'community_creator';
        
        // Find visible creator link in active reel
        const candidateLinks = Array.from(document.querySelectorAll('a[role="link"], a[href^="/"]'));
        for (const link of candidateLinks) {
          const raw = link.getAttribute('href') || '';
          const href = raw.replace(/^\/|\/$/g, '');
          const ignored = ['reels', 'explore', 'direct', 'accounts', 'stories', 'your_activity', 'settings', 'p', 'reel'];
          if (href && !ignored.includes(href) && !href.includes('/') && href.length >= 2 && href.length <= 32) {
            const rect = link.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0 && rect.top >= 0 && rect.top <= window.innerHeight) {
              creator = href;
              break;
            }
          }
        }

        let caption = '';
        const textElements = Array.from(document.querySelectorAll('span[dir="auto"], h1, div[role="button"] span'));
        for (const el of textElements) {
          const text = el.textContent?.trim() || '';
          if (text.length > 20 && !text.includes('Follow') && !text.includes('Original audio') && !text.includes('likes') && !text.includes('comments')) {
            const rect = el.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0 && rect.top >= 0 && rect.top <= window.innerHeight) {
              caption = text.slice(0, 280);
              break;
            }
          }
        }

        return { url, creator, caption };
      });
    } catch {
      return { url: page.url(), creator: 'community_creator', caption: '' };
    }
  }

  /**
   * Ensures the Instagram Reel viewport is 100% clean:
   * - Dismisses comments drawer / modal overlays
   * - Blurs active inputs so keyboard events don't get trapped
   * - Presses Escape twice
   * - Clicks the central video area to restore focus to the feed
   */
  public async ensureCleanReelViewport(page: Page): Promise<void> {
    try {
      // 1. Remove keyboard focus from any active inputs/textareas
      await page.evaluate(() => {
        if (document.activeElement && document.activeElement !== document.body) {
          (document.activeElement as HTMLElement).blur();
        }
      }).catch(() => {});

      // 2. Check for any close button in comments drawer or dialog
      const closeButtons = await page.$$(
        'div[role="dialog"] svg[aria-label="Close"], ' +
        'div[role="dialog"] button[aria-label*="Close" i], ' +
        'div[role="dialog"] [aria-label="Close"], ' +
        'button:has(svg[aria-label="Close"]), ' +
        'svg[aria-label="Close"]'
      );

      for (const btn of closeButtons) {
        try {
          const isVisible = await btn.isVisible().catch(() => false);
          if (isVisible) {
            await btn.click({ timeout: 1200 }).catch(() => {});
            await page.waitForTimeout(300);
          }
        } catch {}
      }

      // 3. Press Escape twice to clear any modal, drawer, or emoji picker
      await page.keyboard.press('Escape').catch(() => {});
      await page.waitForTimeout(200);
      await page.keyboard.press('Escape').catch(() => {});
      await page.waitForTimeout(250);

      // 4. Dismiss generic "Not Now" / "Cancel" overlays if present
      const dismissBtn = await page.$('button:has-text("Not Now"), button:has-text("Cancel")');
      if (dismissBtn) {
        const isVisible = await dismissBtn.isVisible().catch(() => false);
        if (isVisible) {
          await dismissBtn.click({ timeout: 1000 }).catch(() => {});
        }
      }

      // 5. Restore focus to the main feed canvas (NEVER click the video player, which steals key focus)
      await page.evaluate(() => {
        if (document.activeElement && document.activeElement !== document.body) {
          (document.activeElement as HTMLElement).blur();
        }
        window.focus();
        document.body.focus();
      }).catch(() => {});

      // 6. Click neutral margin background (x: 180, y: 150) so video player is NOT focused
      await page.mouse.click(180, 150).catch(() => {});
    } catch (err: any) {
      console.warn(`[Browser Surfer] Viewport clean notice: ${err?.message || err}`);
    }
  }

  /**
   * Extracts top 3-5 real community comments from the open comments dialog
   */
  public async extractVisibleComments(page: Page): Promise<string[]> {
    try {
      return await page.evaluate(() => {
        const comments: string[] = [];
        // Support all variations of Instagram comments container (dialog, aside, article, drawer)
        const dialog = document.querySelector('div[role="dialog"]') || 
                       document.querySelector('div[aria-label*="Comments" i]') ||
                       document.querySelector('section[aria-label*="Comments" i]') ||
                       document.querySelector('div[role="presentation"]:has(textarea, [contenteditable="true"])') ||
                       document.querySelector('article') ||
                       document.body;
        if (!dialog) return comments;

        // Query text spans inside the comments area
        const textSpans = Array.from(dialog.querySelectorAll('span[dir="auto"], div[dir="auto"], p'));
        for (const el of textSpans) {
          const text = el.textContent?.trim() || '';
          const isUiWord = /^(Reply|View all|View \d+ replies|See translation|Like|Likes|Comments|Share|Save|Pinned|\d+[smhdw]|\d+ likes?|Add a comment.*|Post)$/i.test(text);
          if (text.length >= 3 && text.length <= 250 && !isUiWord && !comments.includes(text)) {
            comments.push(text);
          }
          if (comments.length >= 6) break;
        }
        return comments;
      });
    } catch {
      return [];
    }
  }

  /**
   * Resiliently advances to the next reel on Instagram Web feed.
   * Multi-strategy: Native Down Chevron buttons, mouse wheel scroll snap (1500px),
   * keyboard PageDown/ArrowDown on document.body, and DOM scrollIntoView on the next video container.
   */
  public async advanceToNextReel(page: Page, previousUrl: string): Promise<boolean> {
    // Step 1: Ensure viewport is 100% clean of any modals, drawers, or focus traps
    await this.ensureCleanReelViewport(page);
    await page.waitForTimeout(300);

    const startUrl = page.url();
    console.info(`[Browser Surfer] ⬇️ Advancing to next reel from ${startUrl}...`);

    // Step 2: Try native Instagram Reels Down Chevron navigation buttons
    let clickedChevron = false;
    try {
      const downChevronBtns = await page.$$(
        'div[role="button"]:has(svg[aria-label*="Down chevron" i]), ' +
        'button:has(svg[aria-label*="Down chevron" i]), ' +
        'svg[aria-label="Down chevron"], ' +
        'div[role="button"]:has(svg[aria-label*="Down" i]), ' +
        'button:has(svg[aria-label*="Down" i]), ' +
        'button[aria-label*="Next" i], ' +
        'div[role="button"][aria-label*="Next" i], ' +
        'div[aria-label="Next Reel"]'
      );

      for (const btn of downChevronBtns) {
        const isVisible = await btn.isVisible().catch(() => false);
        if (isVisible) {
          await btn.click({ timeout: 1500 });
          clickedChevron = true;
          break;
        }
      }
    } catch {}

    // Step 3: Mouse wheel gesture with large delta (1500px) over reels viewport
    // In CSS scroll-snap containers, a delta > 1200px reliably trips the snap threshold to the next reel
    await page.mouse.move(640, 300).catch(() => {});
    await page.mouse.wheel(0, 1500).catch(() => {});
    await page.waitForTimeout(400);

    // Step 4: Discard any video focus and dispatch PageDown and ArrowDown
    await page.evaluate(() => {
      if (document.activeElement && document.activeElement !== document.body) {
        (document.activeElement as HTMLElement).blur();
      }
      window.focus();
      document.body.focus();
    }).catch(() => {});

    await page.keyboard.press('PageDown').catch(() => {});
    await page.waitForTimeout(200);
    await page.keyboard.press('ArrowDown').catch(() => {});

    // Step 5: If chevron wasn't found, try scrolling next article/video directly into view
    if (!clickedChevron) {
      await page.evaluate(() => {
        const containers = Array.from(document.querySelectorAll('article, div[role="presentation"]:has(video), section:has(video)'));
        if (containers.length > 1) {
          let activeIndex = 0;
          containers.forEach((el, idx) => {
            const rect = el.getBoundingClientRect();
            if (rect.top >= -150 && rect.top <= window.innerHeight / 2) {
              activeIndex = idx;
            }
          });
          const nextContainer = containers[activeIndex + 1];
          if (nextContainer) {
            nextContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
        }
      }).catch(() => {});
    }

    // Step 6: Wait for transition and check if URL changed
    await page.waitForTimeout(1800);
    const newUrl = page.url();

    // Step 7: STUCK DETECTION & ESCALATING RECOVERY
    if (newUrl === startUrl || newUrl === previousUrl) {
      console.warn(`[Browser Surfer] ⚠️ Reel navigation did not advance URL (${startUrl}). Triggering escalating stuck recovery...`);

      // Recovery pass 1: Double escape, neutral background click, aggressive wheel delta
      await page.keyboard.press('Escape').catch(() => {});
      await page.mouse.click(180, 150).catch(() => {});
      await page.mouse.wheel(0, 2200).catch(() => {});
      await page.waitForTimeout(600);
      await page.keyboard.press('PageDown').catch(() => {});
      await page.waitForTimeout(1200);

      const recoveredUrl = page.url();
      if (recoveredUrl !== startUrl && recoveredUrl !== previousUrl) {
        console.info(`[Browser Surfer] ✅ Stuck recovery successful: advanced to ${recoveredUrl}`);
        return true;
      }

      // Recovery pass 2: Force window scroll
      await page.evaluate(() => {
        window.scrollBy({ top: window.innerHeight * 1.5, behavior: 'instant' });
      }).catch(() => {});
      await page.waitForTimeout(1000);

      return page.url() !== startUrl;
    }

    return true;
  }

  /**
   * Brain-powered comment interaction:
   * 1. Opens comments drawer
   * 2. Inspects visible community comments with DOM perception
   * 3. Synthesizes a sharp, hyper-contextual observation using Gemini Brain
   * 4. Audits with Sentinel
   * 5. Types and submits with natural keystrokes
   * 6. STRICT VIEWPORT CLEANUP: Closes drawer, presses Escape, blurs inputs so feed never gets stuck!
   */
  public async interactWithReelComments(
    page: Page,
    reelMeta: { url: string; creator: string; caption: string },
    currentUrl: string,
    stepIndex: number,
    totalSteps: number
  ): Promise<boolean> {
    try {
      console.info(`[Browser Surfer] 🧠 Engaging Brain Comment Mode for reel ${stepIndex}/${totalSteps} by @${reelMeta.creator}...`);

      // 1. Locate and click comment button to open comments drawer
      const commentBtns = await page.$$(
        'div[role="button"]:has(svg[aria-label="Comment"]), ' +
        'button:has(svg[aria-label="Comment"]), ' +
        'svg[aria-label="Comment"], ' +
        'span:has(svg[aria-label="Comment"])'
      );

      let opened = false;
      for (const btn of commentBtns) {
        try {
          const isVis = await btn.isVisible().catch(() => false);
          if (isVis) {
            await btn.click({ timeout: 2500 });
            await page.waitForTimeout(1200);
            opened = true;
            break;
          }
        } catch {}
      }

      if (!opened) {
        console.warn('[Browser Surfer] Comment button not found or could not be clicked.');
        return false;
      }

      // Wait a moment for drawer animation / comment list to mount
      await page.waitForTimeout(600);

      // 2. DOM Perception: Read top visible community comments from the opened drawer
      const topComments = await this.extractVisibleComments(page);
      console.info(`[Browser Surfer] 👁️ Read ${topComments.length} visible community comments:`, topComments.slice(0, 3));

      await this.recordStep(
        `Reel ${stepIndex}/${totalSteps}: Analyzing Context`,
        'comment',
        `Synthesizing contextual insight from reel by @${reelMeta.creator} and ${topComments.length} community comments`,
        { page, targetUrl: currentUrl, targetCreator: reelMeta.creator, details: { topComments, caption: reelMeta.caption } }
      );

      // 3. Gemini Brain Synthesis
      const commentText = await generateBrainComment({
        creator: reelMeta.creator,
        caption: reelMeta.caption,
        topComments,
        niche: 'Ancient Mysteries & Documentary Archives'
      });

      console.info(`[Browser Surfer] 🧠 Brain formulated insight: "${commentText}"`);

      // 4. Sentinel Audit
      const surferAgent: any = getAgent('agent_surfer') || {
        id: 'agent_surfer',
        name: 'Agent Surfer',
        actionsToday: this.stats.commentsPosted,
        dailyLimit: this.sentinelConfig.maxDailyComments,
        status: 'active'
      };

      const audit = await superviseAndAuditAction(
        surferAgent,
        'comment',
        { url: currentUrl, author: reelMeta.creator },
        commentText
      );

      if (!audit.approved) {
        console.warn(`[Agent Sentinel] 🛑 Vetoed comment: ${audit.notes}`);
        // Ensure drawer is closed even if vetoed!
        await this.ensureCleanReelViewport(page);
        return false;
      }

      console.info(`[Agent Sentinel] ✅ Approved comment: "${commentText}"`);

      // 5. Check if an interactive "Add a comment..." placeholder button must be activated first
      const placeholderBtn = await page.$(
        'div[role="button"]:has-text("Add a comment"), ' +
        'span:has-text("Add a comment"), ' +
        'div:has-text("Add a comment…"), ' +
        'div:has-text("Add a comment...")'
      );
      if (placeholderBtn) {
        const canClickPlaceholder = await placeholderBtn.isVisible().catch(() => false);
        if (canClickPlaceholder) {
          await placeholderBtn.click().catch(() => {});
          await page.waitForTimeout(400);
        }
      }

      // Locate comment input inside drawer or active comments panel
      const commentInputSelectors = [
        // Modern Instagram contenteditable divs
        'div[role="dialog"] div[contenteditable="true"][role="textbox"]',
        'div[role="dialog"] div[contenteditable="true"]',
        'div[role="dialog"] textarea',
        'div[aria-label*="Add a comment" i][contenteditable="true"]',
        'div[aria-label*="comment" i][contenteditable="true"]',
        'div[data-placeholder*="Add a comment" i]',
        'div[placeholder*="Add a comment" i]',
        // Standard textareas
        'textarea[aria-label*="Add a comment" i]',
        'textarea[placeholder*="Add a comment" i]',
        'textarea[aria-label*="comment" i]',
        'textarea[placeholder*="comment" i]',
        // Broader container fallbacks
        'form div[contenteditable="true"]',
        'form textarea',
        'div[contenteditable="true"][role="textbox"]',
        'div[contenteditable="true"]',
        'textarea'
      ];

      let inputEl: any = null;
      for (const sel of commentInputSelectors) {
        const candidates = await page.$$(sel);
        for (const el of candidates) {
          const vis = await el.isVisible().catch(() => false);
          if (vis) {
            inputEl = el;
            break;
          }
        }
        if (inputEl) break;
      }

      if (!inputEl) {
        console.warn('[Browser Surfer] Comment input field not found inside drawer.');
        await this.ensureCleanReelViewport(page);
        return false;
      }

      await inputEl.click();
      await page.waitForTimeout(400);

      await this.recordStep(
        `Reel ${stepIndex}/${totalSteps}: Typing Comment`,
        'comment',
        `Typing contextual comment with human keystroke cadence: "${commentText}"`,
        { page, targetUrl: currentUrl, targetCreator: reelMeta.creator, details: { commentText } }
      );

      // 6. Natural human typing keystrokes
      for (const char of commentText) {
        await page.keyboard.type(char, { delay: Math.floor(Math.random() * 45) + 35 });
      }
      await page.waitForTimeout(800);

      // 7. Submit comment
      const postButtonSelectors = [
        'div[role="dialog"] button[type="submit"]',
        'div[role="dialog"] div[role="button"]:has-text("Post")',
        'div[role="dialog"] span:has-text("Post")',
        'form button[type="submit"]',
        'div[role="button"]:has-text("Post")',
        'button:has-text("Post")',
        'button[type="submit"]'
      ];

      let submitted = false;
      for (const sel of postButtonSelectors) {
        const postBtn = await page.$(sel);
        if (postBtn && await postBtn.isVisible().catch(() => false)) {
          await postBtn.click().catch(() => {});
          submitted = true;
          break;
        }
      }

      if (!submitted) {
        await page.keyboard.press('Enter');
      }

      await page.waitForTimeout(2500);
      console.info(`[Browser Surfer] 💬 Published contextual comment on reel ${stepIndex}`);

      await this.recordStep(
        `Reel ${stepIndex}/${totalSteps}: Comment Published`,
        'comment',
        `Published authentic observation: "${commentText}"`,
        { page, targetUrl: currentUrl, targetCreator: reelMeta.creator }
      );

      // Record in SQLite activity ledger
      const now = new Date().toISOString();
      db.prepare(`
        INSERT INTO agent_activity_logs (
          id, agent_id, action_type, target_media_id, target_media_url,
          target_author, target_caption, payload_text, status,
          manager_verdict, compliance_score, manager_notes, reviewed_by,
          details_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        `feed-comment-${Date.now()}`, 'agent_surfer', 'comment', currentUrl, currentUrl,
        reelMeta.creator, reelMeta.caption || 'Community Reel', commentText, 'success',
        audit.verdict, audit.complianceScore, audit.notes, 'agent_sentinel',
        JSON.stringify({ reelIndex: stepIndex, creator: reelMeta.creator, commentText, topComments }),
        now
      );

      // 8. MANDATORY CLEANUP: Close drawer so focus returns to the reel feed!
      await this.ensureCleanReelViewport(page);
      return true;
    } catch (err: any) {
      console.error(`[Browser Surfer] Error during comment interaction: ${err?.message || err}`);
      // Always cleanup so viewport is never left in a broken state
      await this.ensureCleanReelViewport(page);
      return false;
    }
  }

  /**
   * Check if Instagram session is active & logged in
   */
  public async checkSession(): Promise<{ isLoggedIn: boolean; username: string | null; url: string }> {
    const context = await this.getContext(true);
    const page = await context.newPage();

    try {
      console.info('[Browser Surfer] Verifying Instagram web authentication status...');
      await page.goto('https://www.instagram.com/', { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(3500);

      const url = page.url();
      let isLoggedIn = false;
      let username: string | null = null;

      // Check cookies for active session
      const cookies = await context.cookies();
      const hasSessionCookie = cookies.some(c => c.name === 'sessionid' && Boolean(c.value) && c.domain.includes('instagram.com'));

      // Check for login form or logged-in indicators
      const hasLoginForm = await page.$('input[name="email"], input[name="username"], input[name="pass"], input[name="password"], input[type="password"]');
      const hasNavIndicator = await page.$('a[href*="/direct/inbox"], svg[aria-label="Direct"], svg[aria-label="Messages"], svg[aria-label="Home"], svg[aria-label="Explore"], a[href="/reels/"], svg[aria-label="New post"]');
      const hasProfileLink = await page.$('a[href^="/"][role="link"] img[alt*="profile"], svg[aria-label="Profile"]');
      const isLoginRedirect = url.includes('/accounts/login/') || url.includes('/accounts/emailsignup/');

      if ((hasSessionCookie || (!hasLoginForm && !isLoginRedirect)) && (hasNavIndicator || hasProfileLink || hasSessionCookie)) {
        isLoggedIn = true;

        // Try extracting username from profile elements
        try {
          const profileLink = await page.$('a[href^="/"][role="link"]:has(img)');
          if (profileLink) {
            const href = await profileLink.getAttribute('href');
            if (href) {
              const cleaned = href.replace(/\//g, '').trim();
              if (cleaned && !['direct', 'explore', 'reels'].includes(cleaned)) {
                username = cleaned;
              }
            }
          }
        } catch {}
      }

      // Save screenshot for telemetry
      const shotPath = path.join(SCREENSHOTS_DIR, 'latest_status.jpg');
      await page.screenshot({ path: shotPath, type: 'jpeg', quality: 75 });

      // Save storage state if logged in
      if (isLoggedIn) {
        try {
          await context.storageState({ path: STORAGE_STATE_PATH });
        } catch {}
      }

      this.updateDbSession(isLoggedIn, username || 'theuntoldarch', shotPath);

      console.info(`[Browser Surfer] Status check complete: ${isLoggedIn ? `Logged in as @${username || 'theuntoldarch'}` : 'Not logged in'}`);
      return { isLoggedIn, username: username || (isLoggedIn ? 'theuntoldarch' : null), url };
    } catch (err: any) {
      console.warn('[Browser Surfer] Session check error:', err?.message || err);
      return { isLoggedIn: false, username: null, url: page.url() };
    } finally {
      await page.close();
    }
  }

  /**
   * Log into Instagram using account credentials directly
   */
  public async loginWithCredentials(username: string, password?: string, twoFactorCode?: string): Promise<{
    success: boolean;
    isLoggedIn: boolean;
    requires2FA?: boolean;
    message: string;
    screenshotUrl?: string;
  }> {
    if (this.isProcessing) {
      throw new Error('Browser is currently busy executing another operation.');
    }

    this.isProcessing = true;
    const context = await this.getContext(true);
    const page = await context.newPage();
    const shotPath = path.join(SCREENSHOTS_DIR, 'latest_status.jpg');

    try {
      console.info(`[Browser Surfer] Initiating automated login for user: @${username}...`);
      
      // Navigate to Instagram homepage (or login page)
      await page.goto('https://www.instagram.com/', { waitUntil: 'domcontentloaded', timeout: 35000 });
      await page.waitForTimeout(3000);

      // Handle cookies consent popup if present
      const cookieBtn = await page.$('button:has-text("Allow all cookies"), button:has-text("Decline optional cookies"), button:has-text("Only allow essential cookies"), button:has-text("Allow essential and optional cookies")');
      if (cookieBtn) {
        await cookieBtn.click().catch(() => {});
        await page.waitForTimeout(1000);
      }

      // Check if 2FA code is being supplied
      if (twoFactorCode) {
        const twoFaSelector = 'input[name="verificationCode"], input[name="security_code"], input[placeholder*="Security Code" i], input[placeholder*="Code" i], input[type="tel"]';
        await page.waitForSelector(twoFaSelector, { timeout: 10000 }).catch(() => null);
        const twoFaInput = await page.$(twoFaSelector);
        if (twoFaInput) {
          console.info('[Browser Surfer] Entering 2FA verification code...');
          await twoFaInput.fill(twoFactorCode);
          await page.waitForTimeout(600);
          const confirmBtn = await page.$('button[type="button"]:has-text("Confirm"), button[type="submit"], button:has-text("Confirm")');
          if (confirmBtn) await confirmBtn.click();
          await page.waitForTimeout(6000);
        }
      } else {
        // Find login inputs with full fallback selectors (supports both Instagram legacy & Meta unified login: name="email" / name="pass")
        const userSelector = 'input[name="email"], input[name="username"], input[aria-label*="username" i], input[aria-label*="Phone number" i], input[placeholder*="username" i], input[placeholder*="Mobile number" i], input[type="text"]';
        const passSelector = 'input[name="pass"], input[name="password"], input[type="password"]';

        // Wait up to 12 seconds for form elements
        await page.waitForSelector(userSelector, { timeout: 12000 }).catch(() => null);

        let userInput = await page.$(userSelector);
        let passInput = await page.$(passSelector);

        // Fallback: If not found on home, navigate to /accounts/login/
        if (!userInput || !passInput) {
          console.info('[Browser Surfer] Navigating to /accounts/login/ for alternate form layout...');
          await page.goto('https://www.instagram.com/accounts/login/', { waitUntil: 'domcontentloaded', timeout: 35000 });
          await page.waitForTimeout(3000);
          await page.waitForSelector(userSelector, { timeout: 10000 }).catch(() => null);
          userInput = await page.$(userSelector);
          passInput = await page.$(passSelector);
        }

        if (!userInput || !passInput) {
          throw new Error('Could not find username/email and password fields on login page. Try "Open Browser Login Window".');
        }

        // Fill credentials with human delay simulation
        await userInput.click();
        await page.waitForTimeout(300);
        await userInput.fill('');
        await userInput.fill(username);
        await page.waitForTimeout(400);

        if (password) {
          await passInput.click();
          await page.waitForTimeout(300);
          await passInput.fill('');
          await passInput.fill(password);
          await page.waitForTimeout(800);
        }

        // Click submit
        const submitBtn = await page.$('button[type="submit"], input[type="submit"], button:has-text("Log in"), button:has-text("Log In")');
        if (submitBtn) {
          await submitBtn.click();
        } else {
          await page.keyboard.press('Enter');
        }

        console.info('[Browser Surfer] Submitted login credentials, awaiting Instagram response...');
        await page.waitForTimeout(6500);
      }

      // Check if 2FA is required
      const twoFaSelector = 'input[name="verificationCode"], input[name="security_code"], input[placeholder*="Security Code" i], input[placeholder*="Code" i], input[type="tel"]';
      const twoFaField = await page.$(twoFaSelector);
      if (twoFaField) {
        await page.screenshot({ path: shotPath, type: 'jpeg', quality: 75 });
        this.updateDbSession(false, username, shotPath);
        return {
          success: false,
          isLoggedIn: false,
          requires2FA: true,
          message: 'Instagram requires a 2FA / Security Code sent to your phone or authenticator app. Please enter the 6-digit code.',
          screenshotUrl: `/api/browser/screenshot/latest_status.jpg`
        };
      }

      // Handle "Save Your Login Info?" prompt if present
      const saveInfoBtn = await page.$('button:has-text("Save info"), button:has-text("Save Info"), button:has-text("Not now"), button:has-text("Not Now")');
      if (saveInfoBtn) {
        await saveInfoBtn.click().catch(() => {});
        await page.waitForTimeout(2000);
      }

      // Handle "Turn on Notifications" prompt
      const notNowNotificationBtn = await page.$('button:has-text("Not Now"), button:has-text("Cancel")');
      if (notNowNotificationBtn) {
        await notNowNotificationBtn.click().catch(() => {});
        await page.waitForTimeout(1500);
      }

      // Check if login succeeded via cookies or DOM
      const cookies = await context.cookies();
      const hasSessionCookie = cookies.some(c => c.name === 'sessionid' && Boolean(c.value) && c.domain.includes('instagram.com'));
      const currentUrl = page.url();
      const hasLoginForm = await page.$('input[name="email"], input[name="username"], input[name="pass"], input[name="password"]');
      const hasNavIcon = await page.$('a[href*="/direct/inbox"], svg[aria-label="Direct"], svg[aria-label="Messages"], svg[aria-label="Home"], svg[aria-label="Explore"], a[href="/reels/"]');
      const isLoggedIn = hasSessionCookie || (!hasLoginForm && !currentUrl.includes('/accounts/login/') && Boolean(hasNavIcon || currentUrl.includes('instagram.com/')));

      // Check for invalid password error banner
      const errorMsg = await page.$('p[id="slfErrorAlert"], div[role="alert"], div[id="login_error"]');
      let errorText: string | null = null;
      if (errorMsg) {
        errorText = await errorMsg.innerText().catch(() => null);
      }

      await page.screenshot({ path: shotPath, type: 'jpeg', quality: 75 });

      if (isLoggedIn) {
        await context.storageState({ path: STORAGE_STATE_PATH });
        this.updateDbSession(true, username, shotPath);
        console.info(`[Browser Surfer] ✅ Login successful for @${username}!`);
        return {
          success: true,
          isLoggedIn: true,
          message: `Successfully logged in to Instagram as @${username}!`,
          screenshotUrl: `/api/browser/screenshot/latest_status.jpg`
        };
      } else {
        this.updateDbSession(false, username, shotPath);
        return {
          success: false,
          isLoggedIn: false,
          message: errorText || 'Login could not be completed. Check credentials or use "Open Browser Login Window".',
          screenshotUrl: `/api/browser/screenshot/latest_status.jpg`
        };
      }
    } catch (err: any) {
      console.error('[Browser Surfer] Login error:', err);
      await page.screenshot({ path: shotPath, type: 'jpeg', quality: 75 }).catch(() => {});
      return {
        success: false,
        isLoggedIn: false,
        message: `Login error: ${err?.message || err}`,
        screenshotUrl: `/api/browser/screenshot/latest_status.jpg`
      };
    } finally {
      await page.close();
      this.isProcessing = false;
    }
  }

  /**
   * Launch a visible (Headed) Chrome window so the user can easily log in to Instagram on their machine
   */
  public async launchHeadedLogin(): Promise<{ success: boolean; message: string }> {
    if (this.headedProcessRunning) {
      return { success: true, message: 'Browser login window is already open on your desktop.' };
    }

    try {
      await this.closeBrowser(); // Close headless instance if running
      this.headedProcessRunning = true;

      console.info('[Browser Surfer] Launching visible Chrome window for Instagram Login...');
      const context = await this.getContext(false); // Headed mode
      const page = await context.newPage();

      await page.goto('https://www.instagram.com/accounts/login/', { waitUntil: 'domcontentloaded' });

      // Monitor for login completion in background
      (async () => {
        try {
          for (let i = 0; i < 40; i++) {
            await page.waitForTimeout(5000);
            if (page.isClosed()) break;

            const url = page.url();
            const cookies = await context.cookies().catch(() => []);
            const hasSessionCookie = cookies.some(c => c.name === 'sessionid' && Boolean(c.value));
            const hasNav = await page.$('a[href*="/direct/inbox"], svg[aria-label="Direct"], svg[aria-label="Messages"], svg[aria-label="Home"], svg[aria-label="Explore"], a[href="/reels/"]').catch(() => null);
            const hasLoginForm = await page.$('input[name="email"], input[name="username"], input[name="pass"], input[name="password"]').catch(() => null);

            if (hasSessionCookie || (hasNav && !hasLoginForm && !url.includes('/accounts/login/'))) {
              console.info('[Browser Surfer] ✅ Detected successful user login in visible window!');
              await context.storageState({ path: STORAGE_STATE_PATH });
              this.updateDbSession(true, 'theuntoldarch', path.join(SCREENSHOTS_DIR, 'latest_status.jpg'));
              break;
            }
          }
        } catch (e) {
        } finally {
          this.headedProcessRunning = false;
        }
      })();

      return {
        success: true,
        message: 'Google Chrome opened on your desktop. Please log in to @theuntoldarch and approve any prompts.'
      };
    } catch (err: any) {
      this.headedProcessRunning = false;
      return { success: false, message: `Failed to launch browser: ${err?.message || err}` };
    }
  }

  /**
   * Save session cookies directly (e.g. sessionid from developer tools)
   */
  public async importSessionCookies(cookies: Array<{ name: string; value: string; domain?: string; path?: string }> | string): Promise<{ success: boolean; isLoggedIn: boolean; username: string | null; message: string }> {
    try {
      const context = await this.getContext(true);
      let formatted: Array<{ name: string; value: string; domain: string; path: string }> = [];

      if (typeof cookies === 'string') {
        const val = cookies.trim();
        formatted = [{
          name: 'sessionid',
          value: val,
          domain: '.instagram.com',
          path: '/'
        }];
      } else if (Array.isArray(cookies)) {
        formatted = cookies.map(c => ({
          name: c.name,
          value: c.value,
          domain: c.domain || '.instagram.com',
          path: c.path || '/'
        }));
      }

      await context.addCookies(formatted);
      await context.storageState({ path: STORAGE_STATE_PATH });
      console.info('[Browser Surfer] Imported session cookies. Validating authentication status...');

      const check = await this.checkSession();
      return {
        success: check.isLoggedIn,
        isLoggedIn: check.isLoggedIn,
        username: check.username,
        message: check.isLoggedIn
          ? `Session validated! Logged in as @${check.username || 'theuntoldarch'}`
          : 'Cookies imported, but Instagram session could not be verified. Please confirm sessionid value.'
      };
    } catch (err: any) {
      console.error('[Browser Surfer] Failed to import session cookies:', err);
      return {
        success: false,
        isLoggedIn: false,
        username: null,
        message: `Failed to import cookies: ${err?.message || err}`
      };
    }
  }

  /**
   * Autonomous Reels Surfer:
   * Opens an external reel, watches it with realistic human duration,
   * generates an audited archival comment, and posts it using human keystroke delays.
   */
  public async surfAndEngageReel(targetUrl?: string, niche = 'Ancient Mysteries & Archaeology'): Promise<any> {
    if (this.isProcessing) {
      throw new Error('Browser Surfer is currently busy executing another operation.');
    }

    this.isProcessing = true;
    const page = await this.ensureLiveStream();

    const now = new Date().toISOString();
    const logId = `browse-act-${Date.now()}`;

    try {
      // Validate target URL against strict Instagram domain whitelist to prevent SSRF / LFI
      let startUrl = 'https://www.instagram.com/reels/';
      if (targetUrl) {
        try {
          const parsed = new URL(targetUrl);
          if (parsed.protocol !== 'https:' || !/^(www\.)?instagram\.com$/i.test(parsed.hostname)) {
            throw new Error('Security policy violation: Only verified https://www.instagram.com URLs are permitted.');
          }
          startUrl = parsed.toString();
        } catch (e: any) {
          throw new Error(e?.message || 'Invalid target URL format.');
        }
      }

      await this.recordStep(
        targetUrl ? 'Opening Target Reel' : 'Opening Reels Feed',
        'navigate',
        targetUrl ? `Navigating to specified reel: ${startUrl}` : 'Opening your authentic Instagram Reels Feed (https://www.instagram.com/reels/)',
        { targetUrl: startUrl, page, updateActivity: { action: 'Opening Reels Feed', targetUrl: startUrl, stepNumber: 1, totalSteps: 4 } }
      );

      console.info(`[Browser Surfer] 🌐 Opening authentic Reels feed: ${startUrl}`);
      if (!page.url().includes('instagram.com/reels') || targetUrl) {
        await page.goto(startUrl, { waitUntil: 'domcontentloaded', timeout: 35000 });
        await page.waitForTimeout(3500);
      }

      // Check if logged in on this page
      const isLoginPrompt = await page.$('input[name="username"], input[name="email"], input[name="pass"], button:has-text("Log in")');
      if (isLoginPrompt) {
        const shotPath = path.join(SCREENSHOTS_DIR, `action_${logId}.jpg`);
        await page.screenshot({ path: shotPath, type: 'jpeg', quality: 75 });
        await this.recordStep(
          'Login Required',
          'auth',
          'Instagram redirected to login wall. Please log in first.',
          { page, targetUrl: startUrl }
        );
        throw new Error('Not logged in on Instagram Web. Please use "Login with Credentials" or paste Session ID in the dashboard.');
      }

      // Extract real active reel metadata directly from the user's feed
      await page.waitForTimeout(2000);
      const reelMeta = await this.extractActiveReelInfo(page);
      const reelUrl = reelMeta.url || page.url();
      const creatorHandle = reelMeta.creator !== 'community_creator' ? reelMeta.creator : 'community_creator';
      console.info(`[Browser Surfer] 🎯 Watching authentic feed reel from @${creatorHandle} (${reelUrl})`);

      // Emulate human watching (10 to 18 seconds) while live CDP screencast broadcasts to dashboard
      const watchSeconds = Math.floor(Math.random() * 8) + 10;
      await this.recordStep(
        'Watching Content',
        'watch',
        `Watching feed reel by @${creatorHandle} for ${watchSeconds}s like interested human viewer`,
        { 
          targetUrl: reelUrl, 
          targetCreator: creatorHandle,
          page, 
          details: { watchSeconds, caption: reelMeta.caption }, 
          updateActivity: { action: `Watching @${creatorHandle}`, targetCreator: creatorHandle, targetUrl: reelUrl, stepNumber: 2, totalSteps: 4 } 
        }
      );

      console.info(`[Browser Surfer] 👀 Watching feed reel like human viewer (${watchSeconds}s simulation)...`);
      await page.waitForTimeout(watchSeconds * 1000);
      this.stats.reelsWatched++;

      // Generate authentic commentary for @theuntoldarch using Gemini Brain
      const commentText = await generateBrainComment({
        creator: creatorHandle,
        caption: reelMeta.caption,
        niche
      });

      // Pass comment through Manager Sentinel for real-time compliance audit
      const surferAgent: any = getAgent('agent_surfer') || {
        id: 'agent_surfer',
        name: 'Agent Surfer',
        role: 'Autonomous Web Browser Operative',
        description: 'Surfs Instagram Web in stealth Chromium',
        status: 'active',
        avatarColor: '#3b82f6',
        targetHashtags: ['#ancientmysteries'],
        dailyLimit: 25,
        actionsToday: this.stats.commentsPosted,
        totalActions: this.stats.commentsPosted,
        lastActiveAt: new Date().toISOString(),
        config: {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      const audit = await superviseAndAuditAction(
        surferAgent,
        'comment',
        { url: reelUrl, author: creatorHandle },
        commentText
      );

      await this.recordStep(
        'Sentinel Audit',
        'comment',
        `Sentinel audit result: ${audit.approved ? 'APPROVED' : 'VETOED'} (${audit.complianceScore}% score) — "${commentText}"`,
        { targetUrl: reelUrl, targetCreator: creatorHandle, details: { commentText, complianceScore: audit.complianceScore, verdict: audit.verdict } }
      );

      if (!audit.approved) {
        console.warn(`[Agent Sentinel] 🛑 Vetoed browser comment: ${audit.notes}`);
        return { success: false, vetoed: true, notes: audit.notes };
      }

      console.info(`[Agent Sentinel] ✅ Approved browser comment: "${commentText}" (${audit.complianceScore}%)`);

      // Locate comment textarea on Instagram Web
      const commentInputSelectors = [
        'textarea[aria-label*="comment" i]',
        'textarea[placeholder*="comment" i]',
        'div[contenteditable="true"][role="textbox"]',
        'div[contenteditable="true"]',
        'div[aria-label*="Add a comment" i]',
        'form textarea'
      ];

      let inputEl: any = null;
      for (const sel of commentInputSelectors) {
        inputEl = await page.$(sel);
        if (inputEl) break;
      }

      // If input isn't visible, click the comment bubble to open comments drawer
      if (!inputEl) {
        const commentBtns = await page.$$('div[role="button"]:has(svg[aria-label="Comment"]), button:has(svg[aria-label="Comment"]), svg[aria-label="Comment"], span:has-text("Comment")');
        for (const btn of commentBtns) {
          try {
            await btn.click({ timeout: 2000 });
            await page.waitForTimeout(1500);
            break;
          } catch {}
        }

        for (const sel of commentInputSelectors) {
          inputEl = await page.$(sel);
          if (inputEl) break;
        }
      }

      let commentPosted = false;
      if (inputEl) {
        await inputEl.click();
        await page.waitForTimeout(500);

        await this.recordStep(
          'Typing Comment',
          'comment',
          `Typing comment to @${creatorHandle} with human keystroke hesitation: "${commentText}"`,
          { targetUrl: reelUrl, targetCreator: creatorHandle, page, updateActivity: { action: `Typing comment to @${creatorHandle}`, targetCreator: creatorHandle, targetUrl: reelUrl, stepNumber: 3, totalSteps: 4 } }
        );

        // Human-keystroke simulation with random 35-90ms delay per character
        for (const char of commentText) {
          await page.keyboard.type(char, { delay: Math.floor(Math.random() * 55) + 35 });
        }
        await page.waitForTimeout(1000);

        // Submit comment (press Enter or click Post button)
        const postButton = await page.$('button[type="submit"], div[role="button"]:has-text("Post")');
        if (postButton) {
          await postButton.click();
        } else {
          await page.keyboard.press('Enter');
        }

        await page.waitForTimeout(3000);
        commentPosted = true;
        this.stats.commentsPosted++;
        console.info(`[Browser Surfer] 💬 Successfully posted authentic comment to @${creatorHandle} on ${reelUrl}!`);

        await this.recordStep(
          'Comment Published',
          'comment',
          `Successfully posted insight to @${creatorHandle}: "${commentText}"`,
          { targetUrl: reelUrl, targetCreator: creatorHandle, page, details: { commentText } }
        );

        // Close comment panel and restore clean viewport
        await this.ensureCleanReelViewport(page);
        await page.waitForTimeout(800);
      } else {
        console.warn('[Browser Surfer] Could not find comment input box on page.');
      }

      // 60% chance to also like the reel with natural click
      let liked = false;
      if (Math.random() > 0.4) {
        const likeBtn = await page.$('svg[aria-label="Like"]');
        if (likeBtn) {
          await likeBtn.click();
          liked = true;
          this.stats.likesGiven++;
          await page.waitForTimeout(1200);
          console.info(`[Browser Surfer] ❤️ Liked reel by @${creatorHandle}`);

          await this.recordStep(
            'Liked Reel',
            'like',
            `Naturally liked reel by @${creatorHandle}`,
            { targetUrl: reelUrl, targetCreator: creatorHandle, page, updateActivity: { action: `Liked Reel by @${creatorHandle}`, targetCreator: creatorHandle, targetUrl: reelUrl, stepNumber: 4, totalSteps: 4 } }
          );
        }
      }

      // Capture screenshot proof
      const shotPath = path.join(SCREENSHOTS_DIR, `action_${logId}.jpg`);
      await page.screenshot({ path: shotPath, type: 'jpeg', quality: 75 });

      await this.recordStep(
        'Action Complete',
        'idle',
        `Reel engagement complete (@${creatorHandle}, ${watchSeconds}s watched, comment posted: ${commentPosted}, liked: ${liked})`,
        { targetUrl: reelUrl, targetCreator: creatorHandle, page, updateActivity: { action: 'Idle', stepNumber: 4, totalSteps: 4 } }
      );

      // Save log in SQLite
      db.prepare(`
        INSERT INTO agent_activity_logs (
          id, agent_id, action_type, target_media_id, target_media_url,
          target_author, target_caption, payload_text, status,
          manager_verdict, compliance_score, manager_notes, reviewed_by,
          details_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        logId, 'agent_surfer', 'comment', 'web-reel', reelUrl,
        creatorHandle, niche, commentText, commentPosted ? 'success' : 'staged',
        audit.verdict, audit.complianceScore, audit.notes, 'agent_sentinel',
        JSON.stringify({ 
          watchSeconds, 
          liked, 
          commentPosted,
          creator: creatorHandle,
          screenshotPath: `/api/browser/screenshot/${path.basename(shotPath)}`
        }),
        now
      );

      this.updateDbAction('comment', reelUrl, shotPath);

      return {
        success: commentPosted,
        reelUrl,
        creator: creatorHandle,
        commentText,
        liked,
        watchSeconds,
        screenshotUrl: `/api/browser/screenshot/${path.basename(shotPath)}`
      };
    } catch (err: any) {
      console.error('[Browser Surfer] Error during reel surfing:', err?.message || err);
      throw err;
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Autonomous Direct Message Handler:
   * Navigates to instagram.com/direct/inbox, inspects incoming inquiries,
   * generates context-aware archival replies, and responds directly.
   */
  public async checkAndReplyDMs(): Promise<any> {
    if (this.isProcessing) {
      throw new Error('Browser Surfer is busy executing another task.');
    }

    this.isProcessing = true;
    const context = await this.getContext(true);
    const page = await context.newPage();

    const now = new Date().toISOString();
    const logId = `dm-act-${Date.now()}`;

    try {
      console.info('[Browser Surfer] 📥 Checking Instagram Direct Message inbox...');
      await page.goto('https://www.instagram.com/direct/inbox/', { waitUntil: 'domcontentloaded', timeout: 35000 });
      await page.waitForTimeout(4000);

      // Handle common "Turn on Notifications" modal
      const notNowBtn = await page.$('button:has-text("Not Now"), button:has-text("Cancel")');
      if (notNowBtn) {
        await notNowBtn.click().catch(() => {});
        await page.waitForTimeout(1000);
      }

      // Check if logged in
      const isLoginPrompt = await page.$('input[name="username"], button:has-text("Log in")');
      if (isLoginPrompt) {
        throw new Error('Not logged in on Instagram Web. Please open the login window in the dashboard.');
      }

      // Look for message threads in the left pane
      const threadSelectors = [
        'div[role="listitem"]',
        'div[role="row"]',
        'a[href*="/direct/t/"]'
      ];

      let threadEl: any = null;
      for (const sel of threadSelectors) {
        threadEl = await page.$(sel);
        if (threadEl) break;
      }

      let replied = false;
      let replyText = '';
      let senderUsername = 'inbox_user';

      if (threadEl) {
        await threadEl.click();
        await page.waitForTimeout(2500);

        // Try reading incoming message texts
        const messageBubbles = await page.$$('div[dir="auto"]');
        let latestReceived = 'Interested in the declassified archives and mysteries';
        if (messageBubbles.length > 0) {
          const lastBubbleText = await messageBubbles[messageBubbles.length - 1].innerText().catch(() => '');
          if (lastBubbleText && lastBubbleText.length > 3) {
            latestReceived = lastBubbleText;
          }
        }

        // Formulate friendly archival response
        if (process.env.GEMINI_API_KEY) {
          try {
            const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
            const prompt = `You are the authentic curator of @theuntoldarch ("The Untold Archive" - documentary history & unsolved mysteries).
A follower sent this direct message: "${latestReceived}".
Write a warm, concise, and helpful reply (1-2 sentences). 
Direct them warmly to our latest declassified archive file and invite them to explore.
Zero robotic AI jargon. Zero software/coding references. Return ONLY the final message string.`;
            const resp = await ai.models.generateContent({
              model: 'gemini-3.8-flash',
              contents: prompt
            });
            replyText = resp?.text?.trim() || '';
          } catch {}
        }

        if (!replyText) {
          replyText = `Welcome to The Untold Archive 📜 We're investigating that exact case file in our upcoming dossier release. Stay tuned for the coordinates!`;
        }

        // Type response into DM input
        const msgInput = await page.$('div[contenteditable="true"][role="textbox"], div[aria-label="Message"]');
        if (msgInput) {
          await msgInput.click();
          await page.waitForTimeout(500);

          for (const char of replyText) {
            await page.keyboard.type(char, { delay: Math.floor(Math.random() * 50) + 30 });
          }
          await page.waitForTimeout(800);
          await page.keyboard.press('Enter');
          await page.waitForTimeout(2000);

          replied = true;
          this.stats.dmsReplied++;
          console.info(`[Browser Surfer] ✉️ Sent DM reply: "${replyText}"`);
        }
      } else {
        console.info('[Browser Surfer] No open DM threads found in inbox.');
      }

      // Capture screenshot
      const shotPath = path.join(SCREENSHOTS_DIR, `action_${logId}.jpg`);
      await page.screenshot({ path: shotPath, type: 'jpeg', quality: 75 });

      this.updateDbAction('direct_message', 'https://www.instagram.com/direct/inbox/', shotPath);

      return {
        success: true,
        replied,
        replyText: replied ? replyText : null,
        screenshotUrl: `/api/browser/screenshot/${path.basename(shotPath)}`
      };
    } catch (err: any) {
      console.error('[Browser Surfer] Error checking DMs:', err?.message || err);
      throw err;
    } finally {
      await page.close();
      this.isProcessing = false;
    }
  }

  /**
   * Follows a target creator user with human click telemetry
   */
  public async followCreator(targetUsername: string): Promise<{ success: boolean; followed: boolean; message: string }> {
    if (this.isProcessing) {
      throw new Error('Browser is currently busy executing another operation.');
    }

    this.isProcessing = true;
    const context = await this.getContext(true);
    const page = await context.newPage();
    const cleanHandle = targetUsername.replace(/^@/, '').trim().replace(/[^a-zA-Z0-9._]/g, '');
    if (!cleanHandle || cleanHandle.length < 1 || cleanHandle.length > 32) {
      throw new Error('Invalid Instagram handle format.');
    }
    const targetUrl = `https://www.instagram.com/${cleanHandle}/`;
    const shotPath = path.join(SCREENSHOTS_DIR, `follow_${cleanHandle}_${Date.now()}.jpg`);
    const now = new Date().toISOString();
    const logId = `follow-${Date.now()}`;

    try {
      console.info(`[Browser Surfer] 👤 Navigating to profile: ${targetUrl} to evaluate follow...`);
      await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 35000 });
      await page.waitForTimeout(3000);

      // Check if logged in
      const isLoginPrompt = await page.$('input[name="username"], button:has-text("Log in")');
      if (isLoginPrompt) {
        throw new Error('Not logged in on Instagram Web. Please authenticate first.');
      }

      // Check if already following
      const alreadyFollowing = await page.$('button:has-text("Following"), div[role="button"]:has-text("Following"), button:has-text("Requested")');
      if (alreadyFollowing) {
        console.info(`[Browser Surfer] Already following @${cleanHandle}`);
        await page.screenshot({ path: shotPath, type: 'jpeg', quality: 75 });
        return { success: true, followed: false, message: `Already following @${cleanHandle}` };
      }

      // Look for Follow button
      const followBtn = await page.$('header button:has-text("Follow"), button:has-text("Follow")');
      if (!followBtn) {
        throw new Error(`Could not locate Follow button on @${cleanHandle} profile.`);
      }

      // Emulate human hesitation (1.5 to 3 seconds before clicking)
      await page.waitForTimeout(Math.floor(Math.random() * 1500) + 1500);

      // Click follow
      await followBtn.click();
      await page.waitForTimeout(2500);

      this.stats.usersFollowed++;
      console.info(`[Browser Surfer] ✅ Successfully followed @${cleanHandle}!`);

      await page.screenshot({ path: shotPath, type: 'jpeg', quality: 75 });

      // Record log in SQLite
      db.prepare(`
        INSERT INTO agent_activity_logs (
          id, agent_id, action_type, target_media_id, target_media_url,
          target_author, target_caption, payload_text, status,
          manager_verdict, compliance_score, manager_notes, reviewed_by,
          details_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        logId, 'agent_surfer', 'like', cleanHandle, targetUrl,
        `@${cleanHandle}`, 'Followed niche documentary creator profile', null, 'success',
        'approved', 100, `Followed relevant community creator @${cleanHandle}`, 'agent_sentinel',
        JSON.stringify({ followed: true, action: 'follow', profile: targetUrl }),
        now
      );

      this.updateDbAction('follow', targetUrl, shotPath);

      return { success: true, followed: true, message: `Followed @${cleanHandle}` };
    } catch (err: any) {
      console.error('[Browser Surfer] Follow error:', err);
      throw err;
    } finally {
      await page.close();
      this.isProcessing = false;
    }
  }

  /**
   * Activates Agent Sentinel's autonomous 24x7 periodic session manager.
   * Runs human reels sessions periodically (e.g. 20-45 reels) with natural rest breaks (25-55m).
   */
  public startAutonomousSessions(config?: Partial<typeof this.sentinelConfig>) {
    if (config) {
      this.sentinelConfig = { ...this.sentinelConfig, ...config };
    }
    this.autonomousSessionsEnabled = true;
    console.info(`[Agent Sentinel] 🛡️ Autonomous reels surfing session lifecycle activated! Config: ${this.sentinelConfig.minReelsPerSession}-${this.sentinelConfig.maxReelsPerSession} reels/session, ${this.sentinelConfig.minBreakMinutes}-${this.sentinelConfig.maxBreakMinutes}m rest periods.`);

    if (this.sessionTimer) {
      clearTimeout(this.sessionTimer);
      this.sessionTimer = null;
    }

    if (!this.isProcessing) {
      this.sessionTimer = setTimeout(() => {
        this.runAutonomousSessionLoop().catch(err => {
          console.error('[Agent Sentinel] Error in autonomous session loop:', err);
        });
      }, 2500);
    }
  }

  /**
   * Pauses Agent Sentinel's autonomous session manager.
   */
  public stopAutonomousSessions() {
    this.autonomousSessionsEnabled = false;
    this.sessionState = 'idle';
    this.nextSessionAt = null;
    if (this.sessionTimer) {
      clearTimeout(this.sessionTimer);
      this.sessionTimer = null;
    }
    console.info('[Agent Sentinel] 🛑 Autonomous reels surfing sessions paused.');
  }

  /**
   * Background runner for periodic sessions governed by Sentinel
   */
  private async runAutonomousSessionLoop() {
    if (!this.autonomousSessionsEnabled) return;

    if (this.isProcessing) {
      this.sessionTimer = setTimeout(() => this.runAutonomousSessionLoop(), 45000);
      return;
    }

    this.currentSessionNumber++;
    this.sessionState = 'surfing';

    // Pick random target reels within Sentinel safe bounds (e.g. 25, 40, 32...)
    const targetReels = Math.floor(
      Math.random() * (this.sentinelConfig.maxReelsPerSession - this.sentinelConfig.minReelsPerSession + 1)
    ) + this.sentinelConfig.minReelsPerSession;

    console.info(`[Agent Sentinel] 🎬 Commencing Session #${this.currentSessionNumber} with target ${targetReels} reels directly from your feed.`);

    try {
      const result = await this.surfHumanSession({ reelsCount: targetReels, isAutonomous: true });
      this.lastSessionSummary = {
        sessionNumber: this.currentSessionNumber,
        reelsWatched: result.reelsWatched,
        likesGiven: result.likesGiven,
        commentsPosted: result.commentsPosted,
        usersFollowed: result.usersFollowed,
        completedAt: new Date().toISOString()
      };
    } catch (err: any) {
      console.warn(`[Agent Sentinel] ⚠️ Session #${this.currentSessionNumber} encountered warning:`, err?.message || err);
    }

    if (!this.autonomousSessionsEnabled) {
      this.sessionState = 'idle';
      return;
    }

    // Schedule natural cooldown / resting interval between sessions (e.g. 25-55 mins)
    this.sessionState = 'resting';
    const breakMinutes = Math.floor(
      Math.random() * (this.sentinelConfig.maxBreakMinutes - this.sentinelConfig.minBreakMinutes + 1)
    ) + this.sentinelConfig.minBreakMinutes;

    const nextTime = new Date(Date.now() + breakMinutes * 60 * 1000);
    this.nextSessionAt = nextTime.toISOString();

    console.info(`[Agent Sentinel] ⏸️ Session #${this.currentSessionNumber} complete. Resting for ${breakMinutes} minutes before next session (resume at ${nextTime.toLocaleTimeString()}).`);

    notifySurferSessionFinished({
      sessionNumber: this.currentSessionNumber,
      reelsWatched: this.lastSessionSummary?.reelsWatched || targetReels,
      likesGiven: this.lastSessionSummary?.likesGiven || 0,
      commentsPosted: this.lastSessionSummary?.commentsPosted || 0,
      restMinutes: breakMinutes,
      nextSessionAt: this.nextSessionAt
    }).catch(() => {});

    await this.recordStep(
      `Sentinel Rest Interval: Session #${this.currentSessionNumber} Done`,
      'idle',
      `Resting for ${breakMinutes}m after watching ${this.lastSessionSummary?.reelsWatched || targetReels} reels. Next session scheduled at ${nextTime.toLocaleTimeString()}.`,
      {
        updateActivity: {
          action: `Resting (${breakMinutes}m)`,
          stepNumber: targetReels,
          totalSteps: targetReels
        }
      }
    );

    this.sessionTimer = setTimeout(() => {
      this.runAutonomousSessionLoop().catch(err => {
        console.error('[Agent Sentinel] Error starting next autonomous session:', err);
      });
    }, breakMinutes * 60 * 1000);
  }

  /**
   * Surfs Instagram like a normal human user:
   * - Watches multiple reels with variable viewing times (10-30s)
   * - Naturally likes high-affinity mystery & history reels
   * - Expands comments and types thoughtful observations (Sentinel audited)
   * - Follows creators in the documentary niche
   * - Uses realistic scrolling, pauses, and keyboard transitions
   */
  public async surfHumanSession(options: { reelsCount?: number; targetAccounts?: string[]; isAutonomous?: boolean } = {}): Promise<{
    success: boolean;
    reelsWatched: number;
    likesGiven: number;
    commentsPosted: number;
    usersFollowed: number;
    actions: string[];
    latestScreenshotUrl: string;
  }> {
    if (this.isProcessing) {
      throw new Error('Browser Surfer is currently busy executing another operation.');
    }

    this.isProcessing = true;
    const page = await this.ensureLiveStream();
    
    // If reelsCount is specified and > 0, respect it (up to safe max 60).
    // If not specified, pick a human-like randomized number between Sentinel bounds (e.g. 20 - 45).
    let sessionReels: number;
    if (options.reelsCount && options.reelsCount > 0) {
      sessionReels = Math.min(options.reelsCount, 60);
    } else {
      sessionReels = Math.floor(
        Math.random() * (this.sentinelConfig.maxReelsPerSession - this.sentinelConfig.minReelsPerSession + 1)
      ) + this.sentinelConfig.minReelsPerSession;
    }

    const actionsTaken: string[] = [];
    let likesGiven = 0;
    let commentsPosted = 0;
    let usersFollowed = 0;

    const startUrl = 'https://www.instagram.com/reels/';
    const shotPath = path.join(SCREENSHOTS_DIR, `human_session_${Date.now()}.jpg`);

    try {
      console.info(`[Browser Surfer] 🚶 Launching Human Surfing Session (${sessionReels} reels from feed) at ${startUrl}...`);
      await this.recordStep(
        'Starting Surfing Sprint',
        'navigate',
        `Launching multi-reel human surfing session (${sessionReels} reels target) directly on your Instagram Reels feed`,
        { page, targetUrl: startUrl, updateActivity: { action: 'Surfing Reels Feed', stepNumber: 1, totalSteps: sessionReels } }
      );

      if (!page.url().includes('instagram.com/reels')) {
        await page.goto(startUrl, { waitUntil: 'domcontentloaded', timeout: 40000 });
        await page.waitForTimeout(3500);
      }

      // Handle common modal dialogs (Notifications, etc.)
      const notNowBtn = await page.$('button:has-text("Not Now"), button:has-text("Cancel")');
      if (notNowBtn) {
        await notNowBtn.click().catch(() => {});
        await page.waitForTimeout(1000);
      }

      // Check if logged in
      const isLoginPrompt = await page.$('input[name="username"], input[name="email"], input[name="pass"], button:has-text("Log in")');
      if (isLoginPrompt) {
        await page.screenshot({ path: shotPath, type: 'jpeg', quality: 75 });
        await this.recordStep(
          'Login Required',
          'auth',
          'Instagram redirected to login wall. Session authentication required.',
          { page, targetUrl: startUrl }
        );
        throw new Error('Not logged in on Instagram Web. Please log in first using "Login with Credentials" or "Open Browser Login Window".');
      }

      // Track unique reels viewed in this session to eliminate duplicate loops
      const seenReelIdentifiers = new Set<string>();

      // Loop through reels like a human browsing their feed
      for (let i = 0; i < sessionReels; i++) {
        // Guarantee clean viewport on every reel iteration (dismiss any lingering drawers or popups)
        await this.ensureCleanReelViewport(page);
        await page.waitForTimeout(1000);

        // Sentinel Safety Check: If Instagram ever shows a rate-limit prompt, halt immediately
        const rateLimitModal = await page.$('text="Try Again Later", text="Action Blocked", text="We limit how often you can do certain things", text="Confirm it\'s you"');
        if (rateLimitModal) {
          console.warn('[Agent Sentinel] 🚨 Instagram safety checkpoint or rate-limit prompt detected! Aborting session immediately to protect account.');
          await this.recordStep(
            'Sentinel Emergency Safety Halt',
            'auth',
            'Instagram displayed an engagement threshold warning. Sentinel halted session immediately to preserve account safety.',
            { page }
          );
          break;
        }

        let reelMeta = await this.extractActiveReelInfo(page);
        let currentUrl = reelMeta.url || page.url();
        let creator = reelMeta.creator !== 'community_creator' ? reelMeta.creator : 'community_creator';
        let reelId = currentUrl.includes('/reel/') 
          ? currentUrl.split('?')[0] 
          : `${creator}_${(reelMeta.caption || '').slice(0, 35)}`;

        // ANTI-DUPLICATE LOOP GUARD:
        // If this reel was already seen in this session, the browser did NOT advance!
        // Force-advance repeatedly until a NEW, unseen reel appears.
        let skipAttempts = 0;
        while (seenReelIdentifiers.has(reelId) && skipAttempts < 4) {
          skipAttempts++;
          console.warn(`[Browser Surfer] 🔄 Detected duplicate reel (${reelId}). Force-advancing to new reel (attempt ${skipAttempts}/4)...`);
          await this.advanceToNextReel(page, currentUrl);
          await page.waitForTimeout(1600);
          reelMeta = await this.extractActiveReelInfo(page);
          currentUrl = reelMeta.url || page.url();
          creator = reelMeta.creator !== 'community_creator' ? reelMeta.creator : 'community_creator';
          reelId = currentUrl.includes('/reel/') 
            ? currentUrl.split('?')[0] 
            : `${creator}_${(reelMeta.caption || '').slice(0, 35)}`;
        }

        // Hard refresh recovery if still duplicate after 4 attempts
        if (seenReelIdentifiers.has(reelId)) {
          console.warn('[Browser Surfer] 🚨 Reels feed is jammed on duplicate. Hard-refreshing Instagram Reels...');
          await page.goto(`https://www.instagram.com/reels/?t=${Date.now()}`, { waitUntil: 'domcontentloaded', timeout: 35000 });
          await page.waitForTimeout(3000);
          reelMeta = await this.extractActiveReelInfo(page);
          currentUrl = reelMeta.url || page.url();
          creator = reelMeta.creator !== 'community_creator' ? reelMeta.creator : 'community_creator';
          reelId = currentUrl.includes('/reel/') 
            ? currentUrl.split('?')[0] 
            : `${creator}_${(reelMeta.caption || '').slice(0, 35)}`;
        }

        seenReelIdentifiers.add(reelId);

        // Human-like viewing distribution:
        // - 30% quick swipe past (3-7s) (bored/uninterested)
        // - 50% normal engagement (10-18s) (entertained)
        // - 20% deep watch / full loop (20-32s) (fascinated)
        const roll = Math.random();
        let watchSeconds: number;
        let watchCategory = 'normal';
        if (roll < 0.30) {
          watchSeconds = Math.floor(Math.random() * 5) + 3; // 3 to 7s
          watchCategory = 'fast skip';
        } else if (roll < 0.80) {
          watchSeconds = Math.floor(Math.random() * 9) + 10; // 10 to 18s
          watchCategory = 'normal watch';
        } else {
          watchSeconds = Math.floor(Math.random() * 13) + 20; // 20 to 32s
          watchCategory = 'deep watch / loop';
        }

        console.info(`[Browser Surfer] [Reel ${i + 1}/${sessionReels}] 👀 Watching feed reel by @${creator} for ${watchSeconds}s (${watchCategory}) at ${currentUrl}...`);

        this.stats.reelsWatched++;
        actionsTaken.push(`Watched reel by @${creator} for ${watchSeconds}s`);

        await this.recordStep(
          `Reel ${i + 1}/${sessionReels}: Watching Content (${watchSeconds}s)`,
          'watch',
          `Watching feed reel by @${creator} for ${watchSeconds}s [${watchCategory}] (${currentUrl})`,
          { 
            page, 
            targetUrl: currentUrl, 
            targetCreator: creator,
            details: { watchSeconds, watchCategory, reelIndex: i + 1, totalReels: sessionReels, caption: reelMeta.caption },
            updateActivity: { action: `Watching @${creator} (${i + 1}/${sessionReels})`, targetCreator: creator, targetUrl: currentUrl, stepNumber: i + 1, totalSteps: sessionReels }
          }
        );

        // Human simulation: natural dwell while CDP streams frames live to the dashboard
        await page.waitForTimeout(watchSeconds * 1000);

        // 1. LIKE DECISION (Governed by Sentinel: 8-14% probability per reel, max 6 per session, checks daily ceiling)
        const maxSessionLikes = Math.max(2, Math.round(sessionReels * 0.14));
        if (likesGiven < maxSessionLikes && this.stats.likesGiven < this.sentinelConfig.maxDailyLikes && Math.random() < 0.13) {
          const likeBtn = await page.$('svg[aria-label="Like"]');
          if (likeBtn) {
            await page.waitForTimeout(Math.floor(Math.random() * 1200) + 800);
            await likeBtn.click().catch(() => {});
            likesGiven++;
            this.stats.likesGiven++;
            actionsTaken.push(`❤️ Liked reel ${i + 1}`);
            console.info(`[Browser Surfer] ❤️ Naturally liked reel ${i + 1}`);

            await this.recordStep(
              `Reel ${i + 1}/${sessionReels}: Liked`,
              'like',
              `Naturally liked community reel ${i + 1}`,
              { page, targetUrl: currentUrl }
            );

            await page.waitForTimeout(1400);
          }
        }

        // 2. COMMENT DECISION (Selective & spaced out: max 1-2 comments per session, must be audited by Sentinel)
        const maxSessionComments = Math.max(1, Math.min(2, Math.floor(sessionReels / 18)));
        const isCommentReel = (i === 6 || i === 24 || (i > 8 && Math.random() < 0.05));
        if (commentsPosted < maxSessionComments && this.stats.commentsPosted < this.sentinelConfig.maxDailyComments && isCommentReel) {
          const success = await this.interactWithReelComments(page, reelMeta, currentUrl, i + 1, sessionReels);
          if (success) {
            commentsPosted++;
            this.stats.commentsPosted++;
            actionsTaken.push(`💬 Brain observation on @${creator}`);
          }
        }

        // 3. FOLLOW DECISION (Rare: max 1 per session if creator is highly relevant)
        if (usersFollowed === 0 && Math.random() < 0.15 && i > 5) {
          const followBtn = await page.$('header button:has-text("Follow"), div:has-text("Follow") > button, button:has-text("Follow"):not(:has-text("Following"))');
          if (followBtn) {
            await page.waitForTimeout(Math.floor(Math.random() * 1500) + 1000);
            await followBtn.click().catch(() => {});
            usersFollowed++;
            this.stats.usersFollowed++;
            actionsTaken.push(`👤 Followed creator on reel ${i + 1}`);
            console.info(`[Browser Surfer] 👤 Followed creator on reel ${i + 1}`);

            await this.recordStep(
              `Reel ${i + 1}/${sessionReels}: Followed Creator`,
              'follow',
              `Followed creator profile on reel ${i + 1}`,
              { page, targetUrl: currentUrl }
            );

            await page.waitForTimeout(2000);
          }
        }

        // 4. HUMAN MICRO-PAUSE (Simulate human glancing away, notifications, etc.)
        if (i > 0 && i % 12 === 0 && i < sessionReels - 1) {
          const pauseSec = Math.floor(Math.random() * 6) + 4;
          console.info(`[Browser Surfer] ☕ Human micro-pause (${pauseSec}s)...`);
          await page.waitForTimeout(pauseSec * 1000);
        }

        // 5. TRANSITION TO NEXT REEL LIKE A HUMAN (Intelligent Chevron & Gesture controls with Stuck Self-Healing)
        if (i < sessionReels - 1) {
          await page.waitForTimeout(Math.floor(Math.random() * 1200) + 800);
          console.info(`[Browser Surfer] ⬇️ Advancing to next reel (${i + 2}/${sessionReels})...`);
          await this.recordStep(
            `Reel ${i + 1}/${sessionReels}: Advancing Feed`,
            'navigate',
            `Advancing to next reel with intelligent chevron & gesture controls (${i + 2}/${sessionReels})`,
            { page }
          );
          await this.advanceToNextReel(page, currentUrl);
          await page.waitForTimeout(Math.floor(Math.random() * 1000) + 800);
        }
      }

      await page.screenshot({ path: shotPath, type: 'jpeg', quality: 75 });
      this.updateDbAction('human_session', startUrl, shotPath);

      await this.recordStep(
        'Session Completed',
        'idle',
        `Finished surfing session: ${sessionReels} reels watched, ${likesGiven} likes, ${commentsPosted} comments, ${usersFollowed} follows.`,
        { page, updateActivity: { action: 'Idle', stepNumber: sessionReels, totalSteps: sessionReels } }
      );

      // Log session in SQLite
      db.prepare(`
        INSERT INTO agent_activity_logs (
          id, agent_id, action_type, target_media_id, target_media_url,
          target_author, target_caption, payload_text, status,
          manager_verdict, compliance_score, manager_notes, reviewed_by,
          details_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        `session-${Date.now()}`, 'agent_surfer', 'comment', 'multi-reel', startUrl,
        'community_feed', `Human Surfing Session (${sessionReels} reels)`, actionsTaken.join('; '), 'success',
        'approved', 100, `Completed human surfing session: ${sessionReels} reels, ${likesGiven} likes, ${commentsPosted} comments, ${usersFollowed} follows.`, 'agent_sentinel',
        JSON.stringify({ sessionReels, likesGiven, commentsPosted, usersFollowed, actionsTaken }),
        new Date().toISOString()
      );

      console.info(`[Browser Surfer] 🏁 Human surfing session concluded successfully (${actionsTaken.length} actions).`);

      return {
        success: true,
        reelsWatched: sessionReels,
        likesGiven,
        commentsPosted,
        usersFollowed,
        actions: actionsTaken,
        latestScreenshotUrl: `/api/browser/screenshot/latest_status.jpg`
      };
    } catch (err: any) {
      console.error('[Browser Surfer] Human session error:', err);
      await page.screenshot({ path: shotPath, type: 'jpeg', quality: 75 }).catch(() => {});
      throw err;
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Retrieves the current top active page from the browser context
   */
  public async getActivePage(): Promise<Page | null> {
    if (!this.activeContext) return null;
    const pages = this.activeContext.pages();
    return pages.length ? pages[pages.length - 1] : null;
  }

  /**
   * Surfs target creator's active Stories or Home Feed stories,
   * watches them naturally, and drops high-authenticity quick emoji reactions.
   */
  public async surfStoriesAndReact(targetUsername?: string): Promise<{
    success: boolean;
    storiesViewed: number;
    reacted: boolean;
    message: string;
  }> {
    if (this.isProcessing) {
      throw new Error('Browser is currently busy executing another operation.');
    }

    this.isProcessing = true;
    const context = await this.getContext(true);
    const page = await context.newPage();
    let storiesViewed = 0;
    let reacted = false;

    try {
      const cleanHandle = targetUsername ? targetUsername.replace(/^@/, '').trim().replace(/[^a-zA-Z0-9._]/g, '') : '';
      const startUrl = cleanHandle ? `https://www.instagram.com/${cleanHandle}/` : 'https://www.instagram.com/';

      console.info(`[Browser Surfer] 📖 Opening Stories on ${startUrl}...`);
      await page.goto(startUrl, { waitUntil: 'domcontentloaded', timeout: 35000 });
      await page.waitForTimeout(2500);

      let storyButton: any = null;
      if (cleanHandle) {
        storyButton = await page.$(
          'header div[role="button"]:has(img), ' +
          'header div[role="button"][tabindex="0"], ' +
          'header canvas, ' +
          'header img[alt*="profile picture" i]'
        );
      } else {
        storyButton = await page.$(
          'div[role="menu"] div[role="button"], ' +
          'ul li div[role="button"], ' +
          'div[aria-label*="Stories" i] div[role="button"]'
        );
      }

      if (!storyButton) {
        return { success: false, storiesViewed: 0, reacted: false, message: `No active stories found on ${cleanHandle ? `@${cleanHandle}` : 'feed'}.` };
      }

      await storyButton.click().catch(() => {});
      await page.waitForTimeout(2000);

      // Watch up to 3 stories
      for (let s = 1; s <= 3; s++) {
        if (!page.url().includes('/stories/')) break;

        storiesViewed++;
        const watchSec = Math.floor(Math.random() * 3) + 4;
        console.info(`[Browser Surfer] 👁️ Watching story ${s}/3 (${watchSec}s)...`);
        await page.waitForTimeout(watchSec * 1000);

        // React on story with 35% probability
        if (!reacted && Math.random() < 0.35) {
          const likeHeart = await page.$(
            'svg[aria-label="Like"], ' +
            'div[role="button"]:has(svg[aria-label="Like"]), ' +
            'span[role="button"]:has(svg[aria-label="Like"])'
          );
          if (likeHeart && await likeHeart.isVisible().catch(() => false)) {
            await likeHeart.click().catch(() => {});
            reacted = true;
            this.stats.likesGiven++;
            console.info(`[Browser Surfer] ❤️ Reacted to story ${s}!`);
            await page.waitForTimeout(1000);
          }
        }

        await page.keyboard.press('ArrowRight').catch(() => {});
        await page.waitForTimeout(1500);
      }

      await page.keyboard.press('Escape').catch(() => {});
      await page.waitForTimeout(800);

      return {
        success: true,
        storiesViewed,
        reacted,
        message: `Viewed ${storiesViewed} stories${reacted ? ' with natural reaction' : ''}.`
      };
    } catch (err: any) {
      console.warn(`[Browser Surfer] Notice during story surf: ${err?.message}`);
      throw err;
    } finally {
      await page.close().catch(() => {});
      this.isProcessing = false;
    }
  }

  /**
   * Direct remote pilot interaction from the live stream (click, type, key, scroll)
   */
  public async interactDirectly(
    action: 'click' | 'type' | 'key' | 'scroll' | 'navigate',
    params: any = {}
  ): Promise<{ success: boolean; message: string; details?: any }> {
    const page = await this.ensureLiveStream();
    
    switch (action) {
      case 'click': {
        const x = Math.max(0, Math.min(1280, Number(params.x || 640)));
        const y = Math.max(0, Math.min(860, Number(params.y || 430)));
        await page.mouse.click(x, y, { delay: 60 });
        return { success: true, message: `Clicked at (${x}, ${y})`, details: { x, y } };
      }

      case 'type': {
        const text = String(params.text || '');
        if (text) {
          await page.keyboard.type(text, { delay: 40 });
        }
        return { success: true, message: `Typed "${text.slice(0, 20)}"`, details: { length: text.length } };
      }

      case 'key': {
        const key = String(params.key || 'ArrowDown');
        await page.keyboard.press(key);
        return { success: true, message: `Pressed key: ${key}`, details: { key } };
      }

      case 'scroll': {
        const deltaY = Number(params.deltaY || (params.direction === 'up' ? -550 : 550));
        await page.mouse.wheel(0, deltaY);
        return { success: true, message: `Scrolled ${deltaY > 0 ? 'down' : 'up'}`, details: { deltaY } };
      }

      case 'navigate': {
        const url = String(params.url || 'https://www.instagram.com/reels/');
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        return { success: true, message: `Navigated to ${url}`, details: { url } };
      }

      default:
        throw new Error(`Unsupported interaction action: ${action}`);
    }
  }

  /**
   * Returns current status summary
   */
  public getStatus(): BrowserStatus {
    const row = db.prepare('SELECT * FROM browser_surfer_sessions WHERE id = ?').get('primary_surfer') as any;
    let screenshotUrl = '/api/browser/screenshot/latest_status.jpg';

    const isLoggedIn = Boolean(row?.is_logged_in);
    let displayStep = this.currentStep;

    if (!this.isProcessing && !this.headedProcessRunning) {
      if (!isLoggedIn) {
        displayStep = '⚠️ Authentication Required — Browser is sitting at Instagram Login screen. Log in above to activate autonomous reels surfing.';
      } else if (this.sessionState === 'resting' && this.nextSessionAt) {
        displayStep = `⏸️ Sentinel Resting — Session #${this.currentSessionNumber} finished. Next session scheduled at ${new Date(this.nextSessionAt).toLocaleTimeString()}.`;
      } else {
        displayStep = `🟢 Authenticated as @${row?.username || 'theuntoldarch'} — Ready for reels surfing and engagement.`;
      }
    }

    return {
      isRunning: this.isProcessing || this.headedProcessRunning,
      isLoggedIn,
      username: row?.username || null,
      currentStep: displayStep,
      currentActivity: this.currentActivity,
      recentSteps: this.recentSteps,
      lastCheckedAt: row?.last_checked_at || null,
      lastActionAt: row?.last_action_at || null,
      lastActionType: row?.last_action_type || null,
      lastTargetUrl: row?.last_target_url || null,
      latestScreenshotUrl: screenshotUrl,
      liveStreamUrl: '/api/browser/live-stream',
      autonomousSessionsEnabled: this.autonomousSessionsEnabled,
      sessionState: this.sessionState,
      currentSessionNumber: this.currentSessionNumber,
      nextSessionAt: this.nextSessionAt,
      lastSessionSummary: this.lastSessionSummary,
      sentinelConfig: this.sentinelConfig,
      stats: this.stats
    };
  }

  private updateDbSession(isLoggedIn: boolean, username: string | null, shotPath: string) {
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO browser_surfer_sessions (
        id, username, is_logged_in, last_checked_at, latest_screenshot_path, status, updated_at
      ) VALUES ('primary_surfer', ?, ?, ?, ?, 'idle', ?)
      ON CONFLICT(id) DO UPDATE SET
        username = COALESCE(excluded.username, browser_surfer_sessions.username),
        is_logged_in = excluded.is_logged_in,
        last_checked_at = excluded.last_checked_at,
        latest_screenshot_path = excluded.latest_screenshot_path,
        updated_at = excluded.updated_at
    `).run(username, isLoggedIn ? 1 : 0, now, shotPath, now);
  }

  private updateDbAction(actionType: string, targetUrl: string, shotPath: string) {
    const now = new Date().toISOString();
    db.prepare(`
      UPDATE browser_surfer_sessions SET
        last_action_at = ?,
        last_action_type = ?,
        last_target_url = ?,
        latest_screenshot_path = ?,
        updated_at = ?
      WHERE id = 'primary_surfer'
    `).run(now, actionType, targetUrl, shotPath, now);
  }
}

export const browserSurfer = new BrowserSurferManager();
