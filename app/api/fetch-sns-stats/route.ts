import { NextResponse } from "next/server";
import { ApifyClient } from "apify-client";

const apify = new ApifyClient({ token: process.env.APIFY_API_TOKEN });

// ─── 공통 타입 ─────────────────────────────────────────────────
interface Stats {
  views: number;
  likes: number;
  comments: number;
  title: string;
  date?: string;
  thumbnailUrl?: string;
  description?: string;
  platform?: string;
}

// ─── YouTube ───────────────────────────────────────────────────

/** 채널 URL(/@handle)에서 videoId 탐색 — 3단계 전략 */
async function channelToVideoId(channelUrl: string, uploadDate?: string): Promise<string | null> {
  const m = channelUrl.match(/youtube\.com\/@([^\/\?#]+)/);
  if (!m) return null;
  const handle = decodeURIComponent(m[1]);

  // ── 전략 A: ytInitialData 파싱 (채널 /videos 페이지에서 영상 목록 직접 추출) ──
  const tryInitialData = async (): Promise<string | null> => {
    try {
      const res = await fetch(`https://www.youtube.com/@${handle}/videos`, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
          "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.8",
          "Accept": "text/html,application/xhtml+xml",
        },
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) return null;
      const html = await res.text();

      // ytInitialData에서 videoId 목록 추출
      const ids = [...html.matchAll(/"videoId"\s*:\s*"([a-zA-Z0-9_-]{11})"/g)]
        .map(x => x[1])
        .filter((id, i, arr) => arr.indexOf(id) === i); // 중복 제거

      if (!ids.length) return null;
      console.log(`[YouTube] ytInitialData: @${handle} → ${ids.length}개 영상 ID`);

      if (!uploadDate) return ids[0];

      // 업로드 날짜와 가장 가까운 영상 찾기 — 각 ID의 날짜 오버헤드 없이 순서로 추정
      // 날짜 텍스트("2024년 6월", "2주 전" 등)와 ID를 함께 추출
      const datePattern = /"publishedTimeText"\s*:\s*\{\s*"simpleText"\s*:\s*"([^"]+)"/g;
      const dates = [...html.matchAll(datePattern)].map(x => x[1]);
      if (dates.length && uploadDate) {
        // ISO 날짜로 변환 불가능한 상대시간이 많으므로 그냥 가장 최근 영상 반환
        console.log(`[YouTube] 날짜 힌트 있음: ${dates[0]}`);
      }
      return ids[0];
    } catch (e) {
      console.warn(`[YouTube] ytInitialData 실패 @${handle}:`, (e as any).message);
      return null;
    }
  };

  // ── 전략 B: externalChannelId → RSS ──────────────────────────
  const tryRss = async (): Promise<string | null> => {
    try {
      // Chrome UA로 채널 페이지 접근
      const page = await fetch(`https://www.youtube.com/@${handle}`, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
          "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.8",
        },
        signal: AbortSignal.timeout(10000),
      });
      if (!page.ok) return null;
      const html = await page.text();

      const cid = html.match(/"externalChannelId"\s*:\s*"(UC[a-zA-Z0-9_-]{22})"/)?.[1]
               || html.match(/"channelId"\s*:\s*"(UC[a-zA-Z0-9_-]{22})"/)?.[1];
      if (!cid) { console.warn(`[YouTube] channelId not found @${handle}`); return null; }

      const rss = await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${cid}`, {
        signal: AbortSignal.timeout(8000),
      });
      if (!rss.ok) return null;
      const xml = await rss.text();

      const entries = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)]
        .map(e => ({
          id:   e[1].match(/<yt:videoId>([^<]+)/)?.[1],
          date: e[1].match(/<published>([^T]+)/)?.[1],
        }))
        .filter(e => e.id && e.date) as { id: string; date: string }[];

      if (!entries.length) return null;
      console.log(`[YouTube] RSS: @${handle} (${cid}) → ${entries.length}개`);

      if (uploadDate) {
        const t = new Date(uploadDate).getTime();
        entries.sort((a, b) =>
          Math.abs(new Date(a.date).getTime() - t) - Math.abs(new Date(b.date).getTime() - t)
        );
      }
      console.log(`[YouTube] RSS 선택: ${entries[0].id} (${entries[0].date})`);
      return entries[0].id;
    } catch (e) {
      console.warn(`[YouTube] RSS 실패 @${handle}:`, (e as any).message);
      return null;
    }
  };

  // 두 전략 병렬 실행, 먼저 성공하는 결과 사용
  const [a, b] = await Promise.all([tryInitialData(), tryRss()]);
  const result = a ?? b;
  if (!result) console.warn(`[YouTube] channelToVideoId 전략 모두 실패: @${handle}`);
  return result;
}

/**
 * YouTube 영상 페이지 HTML 파싱 — ytInitialPlayerResponse 사용
 * YouTube Data API key 없이도 조회수·제목·날짜 추출 가능
 */
async function scrapeYouTubeVideo(videoId: string): Promise<Stats> {
  const fallback: Stats = {
    views: 0, likes: 0, comments: 0, title: "-",
    thumbnailUrl: `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`,
  };
  try {
    const res = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.8",
      },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return fallback;
    const html = await res.text();

    let views = 0, title = "-", date: string | undefined, description = "";
    let thumb = fallback.thumbnailUrl!;

    // ── ytInitialPlayerResponse 파싱 (가장 신뢰도 높음) ─────────
    const prMatch = html.match(/ytInitialPlayerResponse\s*=\s*(\{[\s\S]*?\})\s*;?\s*(?:var\s|\(this\)|<\/script>)/);
    if (prMatch) {
      try {
        const pr = JSON.parse(prMatch[1]);
        const vd = pr.videoDetails;
        if (vd) {
          title       = vd.title || "-";
          views       = parseInt(vd.viewCount || "0", 10);
          description = (vd.shortDescription || "").substring(0, 300);
          const thumbs = vd.thumbnail?.thumbnails;
          if (thumbs?.length) thumb = thumbs[thumbs.length - 1].url;
        }
        const mf = pr.microformat?.playerMicroformatRenderer;
        if (mf?.publishDate) date = mf.publishDate.split("T")[0];
        else if (mf?.uploadDate) date = mf.uploadDate.split("T")[0];
      } catch {}
    }

    // ── 단순 regex 폴백 ──────────────────────────────────────────
    if (!views)        views = parseInt(html.match(/"viewCount":"(\d+)"/)?.[1] || "0", 10);
    if (title === "-") title = html.match(/<title>(.+?)\s*(?:-\s*YouTube)?<\/title>/i)?.[1]?.trim() || "-";
    if (!date) {
      const dm = html.match(/"publishDate":"([^"]+)"/) || html.match(/"uploadDate":"([^"]+)"/);
      if (dm) date = dm[1].split("T")[0];
    }

    console.log(`[YouTube] HTML 파싱: title="${title}" views=${views} date=${date}`);
    return { views, likes: 0, comments: 0, title, date, thumbnailUrl: thumb, description };
  } catch (e) {
    console.warn("[YouTube] HTML 파싱 실패:", (e as any).message);
    return fallback;
  }
}

async function fetchYouTube(url: string, uploadDate?: string): Promise<Stats> {
  // 1. 동영상 ID 추출
  let videoId = url.match(/(?:youtu\.be\/|[?&]v=|\/shorts\/|\/video\/|\/live\/)([a-zA-Z0-9_-]{6,20})/)?.[1];

  // 2. 채널 URL이면 RSS로 동영상 ID 탐색
  if (!videoId && /youtube\.com\/@/.test(url)) {
    videoId = (await channelToVideoId(url, uploadDate)) ?? undefined;
  }

  // 동영상 ID 없음 → 채널 이름 정도만 반환
  if (!videoId) {
    try {
      const oe = await fetch(
        `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`,
        { signal: AbortSignal.timeout(5000) }
      );
      if (oe.ok) {
        const d = await oe.json();
        return { views: 0, likes: 0, comments: 0, title: d.author_name || "-", thumbnailUrl: d.thumbnail_url, platform: "YouTube" };
      }
    } catch {}
    return { views: 0, likes: 0, comments: 0, title: "-", platform: "YouTube" };
  }

  const defaultThumb = `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`;

  // 3. YouTube Data API (키 있을 때 최우선)
  if (process.env.YOUTUBE_API_KEY) {
    try {
      const r = await fetch(
        `https://www.googleapis.com/youtube/v3/videos?id=${videoId}&key=${process.env.YOUTUBE_API_KEY}&part=statistics,snippet`,
        { signal: AbortSignal.timeout(8000) }
      );
      if (r.ok) {
        const d = await r.json();
        const v = d.items?.[0];
        if (v) {
          console.log(`[YouTube] Data API ✅ views=${v.statistics?.viewCount}`);
          return {
            views:       parseInt(v.statistics?.viewCount    || "0", 10),
            likes:       parseInt(v.statistics?.likeCount    || "0", 10),
            comments:    parseInt(v.statistics?.commentCount || "0", 10),
            title:       v.snippet?.title || "-",
            date:        v.snippet?.publishedAt?.split("T")[0],
            thumbnailUrl: defaultThumb,
            description: v.snippet?.description?.substring(0, 300),
            platform:    "YouTube",
          };
        }
      }
    } catch (e) { console.warn("[YouTube] Data API 실패:", (e as any).message); }
  }

  // 4. HTML 파싱 (ytInitialPlayerResponse) — API key 불필요
  const scraped = await scrapeYouTubeVideo(videoId);

  // 5. oEmbed — 제목 폴백
  if (!scraped.title || scraped.title === "-") {
    try {
      const oe = await fetch(
        `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`,
        { signal: AbortSignal.timeout(5000) }
      );
      if (oe.ok) { const d = await oe.json(); if (d.title) scraped.title = d.title; }
    } catch {}
  }

  return { ...scraped, thumbnailUrl: scraped.thumbnailUrl || defaultThumb, platform: "YouTube" };
}

// ─── Instagram ─────────────────────────────────────────────────

/** Instagram 공식 oEmbed — 인증 불필요, 썸네일+author_name 반환 */
async function fetchInstagramOembed(url: string): Promise<Partial<Stats> | null> {
  try {
    const oe = await fetch(
      `https://api.instagram.com/oembed?url=${encodeURIComponent(url)}&format=json`,
      { signal: AbortSignal.timeout(8000) }
    );
    if (!oe.ok) return null;
    const d = await oe.json();
    if (!d || d.error) return null;
    return {
      title:        d.title || (d.author_name ? `@${d.author_name}` : "-"),
      thumbnailUrl: d.thumbnail_url || undefined,
      platform:     "Instagram",
    };
  } catch (e) {
    console.warn("[Instagram] oEmbed 실패:", (e as any).message);
    return null;
  }
}

async function fetchInstagram(url: string): Promise<Stats> {
  const fallback: Stats = { views: 0, likes: 0, comments: 0, title: "-", platform: "Instagram" };

  // 1. Apify — 통계까지 포함한 완전한 데이터
  if (process.env.APIFY_API_TOKEN) {
    try {
      const run = await apify.actor("apify/instagram-scraper").call(
        { addParentData: false, directUrls: [url], resultsType: "details", resultsLimit: 1 },
        { waitSecs: 120 }
      );
      const { items } = await apify.dataset(run.defaultDatasetId).listItems();
      if (items?.length) {
        const item: any = items[0];
        const caption = item.caption || item.text || "";
        return {
          views:        item.videoViewCount || item.videoPlayCount || 0,
          likes:        typeof item.likesCount === "number" ? item.likesCount : 0,
          comments:     item.commentsCount  || 0,
          title:        caption ? caption.substring(0, 80) + (caption.length > 80 ? "…" : "") : "-",
          date:         item.timestamp ? new Date(item.timestamp).toISOString().split("T")[0] : undefined,
          thumbnailUrl: item.displayUrl    || item.thumbnailUrl,
          description:  caption || undefined,
          platform:     "Instagram",
        };
      }
    } catch (e: any) {
      if (e?.statusCode === 402 || e?.type === "actor-memory-limit-exceeded") {
        console.warn("[Instagram] Apify 메모리 한도 초과 → oEmbed 폴백");
      } else {
        console.warn("[Instagram] Apify 실패:", e?.message, "→ oEmbed 폴백");
      }
    }
  }

  // 2. Instagram 공식 oEmbed — 썸네일 + author_name (통계 없음)
  const oe = await fetchInstagramOembed(url);
  if (oe) {
    console.log("[Instagram] oEmbed ✅ title:", oe.title, "thumb:", !!oe.thumbnailUrl);
    return { ...fallback, ...oe };
  }

  return fallback;
}

// ─── Twitter / X ───────────────────────────────────────────────

async function fetchTwitter(url: string): Promise<Stats> {
  const tweetId = url.match(/\/status\/(\d+)/)?.[1];

  // Twitter API v2
  if (tweetId && process.env.TWITTER_BEARER_TOKEN) {
    try {
      const r = await fetch(
        `https://api.twitter.com/2/tweets/${tweetId}?tweet.fields=created_at,public_metrics,text&expansions=author_id&user.fields=name,username,profile_image_url`,
        { headers: { Authorization: `Bearer ${process.env.TWITTER_BEARER_TOKEN}` }, signal: AbortSignal.timeout(8000) }
      );
      if (r.ok) {
        const d = await r.json();
        const tweet = d.data, user = d.includes?.users?.[0];
        return {
          views:        tweet?.public_metrics?.impression_count || 0,
          likes:        tweet?.public_metrics?.like_count       || 0,
          comments:     tweet?.public_metrics?.reply_count      || 0,
          title:        user ? `@${user.username}` : "-",
          description:  tweet?.text,
          date:         tweet?.created_at?.slice(0, 10),
          thumbnailUrl: user?.profile_image_url,
          platform:     "X",
        };
      }
    } catch (e) { console.warn("[Twitter API]:", (e as any).message); }
  }

  // Apify 폴백
  if (tweetId && process.env.APIFY_API_TOKEN) {
    try {
      const run = await apify.actor("apidojo/tweet-scraper").call(
        { searchTerms: [`conversation_id:${tweetId}`], maxItems: 1, queryType: "Latest" },
        { waitSecs: 60 }
      );
      const { items } = await apify.dataset(run.defaultDatasetId).listItems();
      if (items?.length) {
        const item: any = items[0];
        const uname = item.author?.userName || item.user?.screen_name || "";
        return {
          views:        item.viewCount  || 0,
          likes:        item.likeCount  || 0,
          comments:     item.replyCount || 0,
          title:        uname ? `@${uname}` : "-",
          description:  item.fullText || item.text,
          date:         item.createdAt ? new Date(item.createdAt).toISOString().slice(0, 10) : undefined,
          thumbnailUrl: item.author?.profileImageUrl,
          platform:     "X",
        };
      }
    } catch (e) { console.warn("[Twitter Apify]:", (e as any).message); }
  }

  // oEmbed 폴백 (작성자 이름만)
  let title = "-";
  try {
    const oe = await fetch(`https://publish.twitter.com/oembed?url=${encodeURIComponent(url)}&omit_script=true`, { signal: AbortSignal.timeout(5000) });
    if (oe.ok) { const d = await oe.json(); if (d.author_name) title = `@${d.author_name}`; }
  } catch {}
  return { views: 0, likes: 0, comments: 0, title, platform: "X" };
}

// ─── Naver Blog ────────────────────────────────────────────────

async function fetchNaverBlog(url: string): Promise<Stats> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return { views: 0, likes: 0, comments: 0, title: "-", platform: "Naver Blog" };
    const html = await res.text();
    const title = html.match(/<title>(.+?)<\/title>/i)?.[1]?.trim() || "-";
    return { views: 0, likes: 0, comments: 0, title, platform: "Naver Blog" };
  } catch {
    return { views: 0, likes: 0, comments: 0, title: "-", platform: "Naver Blog" };
  }
}

// ─── Main handler ──────────────────────────────────────────────

export async function POST(req: Request) {
  let url = "";
  try {
    const body  = await req.json();
    url         = (body?.url  || "").trim();
    const uploadDate: string | undefined = typeof body?.uploadDate === "string" && body.uploadDate ? body.uploadDate : undefined;

    if (!url) return NextResponse.json({ success: false, error: "URL이 필요합니다." }, { status: 400 });

    let stats: Stats;

    if (/youtube\.com|youtu\.be/.test(url)) {
      stats = await fetchYouTube(url, uploadDate);
      // 동영상 ID로 썸네일 보장
      const vid = url.match(/(?:youtu\.be\/|[?&]v=|\/shorts\/|\/video\/|\/live\/)([a-zA-Z0-9_-]{6,20})/)?.[1];
      if (vid && !stats.thumbnailUrl) stats.thumbnailUrl = `https://img.youtube.com/vi/${vid}/mqdefault.jpg`;

    } else if (/instagram\.com/.test(url)) {
      stats = await fetchInstagram(url);

    } else if (/twitter\.com|x\.com/.test(url)) {
      stats = await fetchTwitter(url);

    } else if (/blog\.naver\.com|m\.blog\.naver\.com/.test(url)) {
      stats = await fetchNaverBlog(url);

    } else {
      return NextResponse.json({ success: false, error: "지원하지 않는 플랫폼입니다." });
    }

    return NextResponse.json({ success: true, stats });
  } catch (e: any) {
    console.error(`[fetch-sns-stats] 처리되지 않은 오류 url="${url}":`, e);
    return NextResponse.json({ success: false, error: e.message || "알 수 없는 오류" }, { status: 500 });
  }
}
