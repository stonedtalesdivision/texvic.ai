# texvic.ai

![Version](https://img.shields.io/badge/version-1.1.0-blue.svg) ![Status](https://img.shields.io/badge/status-production-success.svg)

AI-powered Instagram & Facebook Reels growth automation with real server-side publishing, millisecond-synchronized subtitles, and neural voiceover.

## Version 1.1.0 Highlights

- **Active Word Spotlight Subtitles**: Subtitle dialogue events (`.ass`) rendered with millisecond precision to the narrator's vocal cords using native Microsoft Edge Neural TTS word boundaries. Zero drift, with active words highlighted in golden accent color as they are spoken.
- **Facebook Page Cross-Publishing**: Automated 24x7 multi-channel broadcast across connected Instagram Professional accounts and Facebook Pages using Meta Video Reels API.
- **Persistent Neural Male Narrator**: Authoritative documentary baritone (`en-US-ChristopherNeural`) with automatic WebSocket clock synchronization and offline neural fallback.

## Production architecture

React dashboard → Express API → SQLite → persistent job queue → FFmpeg render pipeline → Meta Graph API (Instagram & Facebook Page).

## Requirements

- Node.js 22+
- FFmpeg installed on the host
- Instagram Professional account & Facebook Page
- Meta/Instagram app configured for Instagram API with Instagram Login
- Public HTTPS `APP_URL`
- Gemini API key for AI generation

## Environment

Copy `.env.example` to `.env` and configure:

- `INSTAGRAM_APP_ID`
- `INSTAGRAM_APP_SECRET`
- `INSTAGRAM_GRAPH_API_VERSION` (default: `v26.0`)
- `FACEBOOK_PAGE_ID` (Optional: Facebook Page ID for cross-posting)
- `FACEBOOK_PAGE_ACCESS_TOKEN` (Optional: Facebook Page Access Token)
- `TOKEN_ENCRYPTION_KEY` — 64 hex characters / 32 bytes
- `APP_URL`
- `GEMINI_API_KEY`
- `META_VERIFY_TOKEN`
- `FFMPEG_PATH`

Generate an encryption key with:

```bash
openssl rand -hex 32
```

## Instagram setup

Use Instagram API with Instagram Login and request the current Business Login permissions required by the product, including:

- `instagram_business_basic`
- `instagram_business_content_publish`
- `instagram_business_manage_comments`
- `instagram_business_manage_insights`

The production OAuth callback must exactly match the callback configured in the Instagram app.

## Run

```bash
npm install
npm run lint
npm run build
npm start
```

## Publishing flow

1. User connects Instagram through OAuth.
2. Server encrypts and stores the long-lived access token.
3. AI generates the Reel plan.
4. Server renders a real 9:16 MP4.
5. The server exposes the MP4 at a public HTTPS URL.
6. Instagram creates a media container.
7. The worker polls container processing.
8. Instagram publishes the Reel.
9. The media ID/permalink is stored in SQLite.
10. Insights and comments are synchronized back into the product.

Scheduled jobs create containers at publish time rather than at scheduling time so long-range schedules do not depend on an expiring Instagram container.

## Security

Never put Instagram access tokens, app secrets, or `TOKEN_ENCRYPTION_KEY` in frontend code. Never commit `.env`.

The database contains encrypted access tokens. The application decrypts them only immediately before making an Instagram API request.

## Current product boundary

The current renderer is a functional MVP renderer: it produces valid 9:16 MP4 files with scene-aware typography and audio. The next media-generation layer can add AI imagery, stock/owned footage, voiceover, licensed music, and richer transitions without changing the publishing architecture.
