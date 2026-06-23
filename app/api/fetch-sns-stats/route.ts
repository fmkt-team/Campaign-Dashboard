import { NextResponse } from "next/server";
import { ApifyClient } from "apify-client";
import ytdl from "ytdl-core";

const apifyClient = new ApifyClient({
  token: process.env.APIFY_API_TOKEN,
});

async function fetchYoutubeStats(url: string): Promise<{ views: number; likes: number; comments: number; title: string; date?: string }> {
  let views = 0, likes = 0, comments = 0, title = "-", date: string | undefined;

  // 비디오 ID 추출 (일반 영상, Shorts, Live, YouTube Studio 모두 지원)
  const videoIdMatch = url.match(/(?:youtu\.be\/|[?&]v=|\/shorts\/|\/video\/|\/live\/)([a-zA-Z0-9_-]{6,20})/);
  const videoId = videoIdMatch?.[1];

  if (!videoId) {
    // 채널/플레이리스트 URL — oEmbed로 채널명이라도 반환 (throw하지 않음)
    try {
      const oembed = await fetch(
        `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`,
        { signal: AbortSignal.timeout(5000) }
      );
      if (oembed.ok) {
        const d = await oembed.json();
        console.log(`[YouTube] channel-level URL → oEmbed title: ${d.title || d.author_name}`);
        return { views: 0, likes: 0, comments: 0, title: d.title || d.author_name || url, date: undefined };
      }
    } catch {}
    console.warn(`[YouTube] no video ID and oEmbed failed for: ${url}`);
    return { views: 0, likes: 0, comments: 0, title: "-", date: undefined };
  }

  // ── YouTube Data API (키 있을 때 최우선) ────────────────────
  if (process.env.YOUTUBE_API_KEY) {
    try {
      const response = await fetch(
        `https://www.googleapis.com/youtube/v3/videos?id=${videoId}&key=${process.env.YOUTUBE_API_KEY}&part=statistics,snippet`
      );
      if (response.ok) {
        const data = await response.json();
        if (data.items?.length > 0) {
          const video = data.items[0];
          views    = parseInt(video.statistics?.viewCount    || "0", 10);
          likes    = parseInt(video.statistics?.likeCount    || "0", 10);
          comments = parseInt(video.statistics?.commentCount || "0", 10);
          title    = video.snippet?.title || "-";
          date     = video.snippet?.publishedAt?.split("T")[0];
          console.log(`[YouTube] ✅ Data API: ${title} views=${views}`);
          return { views, likes, comments, title, date };
        }
      }
    } catch (e) {
      console.warn(`[YouTube] Data API failed: ${(e as any).message}`);
    }
  }

  // ── oEmbed (무료, 키 불필요 — 제목·썸네일) ─────────────────
  try {
    const oembed = await fetch(
      `https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${videoId}`)}&format=json`,
      { signal: AbortSignal.timeout(6000) }
    );
    if (oembed.ok) {
      const d = await oembed.json();
      if (d.title) {
        title = d.title;
        console.log(`[YouTube] ✅ oEmbed title: ${title}`);
      }
    }
  } catch (e) {
    console.warn(`[YouTube] oEmbed failed: ${(e as any).message}`);
  }

  // ── ytdl-core (조회수/좋아요) ────────────────────────────────
  try {
    const info = await ytdl.getInfo(`https://www.youtube.com/watch?v=${videoId}`);
    const details = info.videoDetails;
    if (!title || title === "-") title = details.title || "-";
    views = parseInt(details.viewCount || "0", 10);
    if (!date) date = details.uploadDate;
    const likeCount = (info as any).microformat?.playerMicroformatRenderer?.likeCount;
    if (likeCount) likes = parseInt(likeCount, 10);
    console.log(`[YouTube] ✅ ytdl-core: views=${views}, title=${title}`);
  } catch (e) {
    console.warn(`[YouTube] ytdl-core failed: ${(e as any).message}`);
  }

  // ── HTML 파싱 최후 폴백 ──────────────────────────────────────
  if ((!title || title === "-") && views === 0) {
    try {
      const res = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
        signal: AbortSignal.timeout(8000),
      });
      if (res.ok) {
        const html = await res.text();
        const viewMatch  = html.match(/"viewCount":"(\d+)"/);
        const likeMatch  = html.match(/"likeCount":"(\d+)"/);
        const titleMatch = html.match(/<title>(.*?)<\/title>/);
        const dateMatch  = html.match(/"publishDate":"([^"]+)"/) ||
                           html.match(/<meta itemprop="datePublished" content="([^"]+)"/);
        views = viewMatch  ? parseInt(viewMatch[1],  10) : 0;
        likes = likeMatch  ? parseInt(likeMatch[1],  10) : 0;
        if (!title || title === "-") title = titleMatch ? titleMatch[1].replace(" - YouTube", "").trim() : "-";
        if (!date) date = dateMatch ? dateMatch[1].split("T")[0] : undefined;
        console.log(`[YouTube] ✅ HTML fallback: views=${views}, title=${title}`);
      }
    } catch (e) {
      console.warn(`[YouTube] HTML fallback failed: ${(e as any).message}`);
    }
  }

  return { views, likes, comments, title, date };
}

async function fetchNaverBlogStats(url: string) {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return { views: 0, likes: 0, comments: 0, title: "-" };
    const html = await res.text();
    const titleMatch = html.match(/<title>(.*?)<\/title>/);
    return {
      views: 0, likes: 0, comments: 0,
      title: titleMatch ? titleMatch[1].trim() : "-",
    };
  } catch {
    return { views: 0, likes: 0, comments: 0, title: "-" };
  }
}

export async function POST(req: Request) {
  let url = "";
  try {
    const body = await req.json();
    url = body?.url || "";
    if (!url || typeof url !== "string") {
      return NextResponse.json({ success: false, error: "URL이 필요합니다." }, { status: 400 });
    }

    let stats: any = { views: 0, likes: 0, comments: 0, title: "-" };

    if (url.includes("youtube.com") || url.includes("youtu.be")) {
      stats = await fetchYoutubeStats(url);
      const idMatch = url.match(/(?:[?&]v=|youtu\.be\/|\/shorts\/|\/video\/|\/live\/)([a-zA-Z0-9_-]{6,20})/);
      if (idMatch) {
        stats.thumbnailUrl = `https://img.youtube.com/vi/${idMatch[1]}/mqdefault.jpg`;
      }

    } else if (url.includes("instagram.com")) {
      if (!process.env.APIFY_API_TOKEN) {
        return NextResponse.json({ success: false, error: "APIFY_API_TOKEN이 없어 인스타그램 스크랩 불가" });
      }
      try {
        const run = await apifyClient.actor("apify/instagram-scraper").call({
          addParentData: false,
          directUrls: [url],
          resultsType: "details",
        });
        const { items } = await apifyClient.dataset(run.defaultDatasetId).listItems();
        if (items?.length > 0) {
          const item: any = items[0];
          stats.views       = item.videoViewCount || item.videoPlayCount || 0;
          stats.likes       = typeof item.likesCount === "number" && item.likesCount > 0 ? item.likesCount : 0;
          stats.comments    = item.commentsCount || 0;
          stats.title       = item.caption ? item.caption.substring(0, 50) + "..." : "-";
          stats.thumbnailUrl = item.displayUrl || item.thumbnailUrl;
          if (item.timestamp) stats.date = new Date(item.timestamp).toISOString().split("T")[0];
        }
      } catch (apifyErr: any) {
        if (apifyErr?.statusCode === 402 || apifyErr?.type === "actor-memory-limit-exceeded") {
          return NextResponse.json({ success: false, error: "Apify 메모리 한도 초과 — 잠시 후 개별 새로고침으로 시도하세요." });
        }
        return NextResponse.json({ success: false, error: apifyErr?.message || "인스타그램 스크랩 실패" });
      }

    } else if (url.includes("twitter.com") || url.includes("x.com")) {
      const tweetIdMatch = url.match(/\/status\/(\d+)/);
      const tweetId = tweetIdMatch?.[1];

      if (tweetId && process.env.TWITTER_BEARER_TOKEN) {
        try {
          const apiUrl = `https://api.twitter.com/2/tweets/${tweetId}?tweet.fields=created_at,public_metrics,author_id&expansions=author_id&user.fields=name,username,profile_image_url`;
          const res = await fetch(apiUrl, { headers: { Authorization: `Bearer ${process.env.TWITTER_BEARER_TOKEN}` } });
          if (res.ok) {
            const data = await res.json();
            const tweet = data.data;
            const user  = data.includes?.users?.[0];
            stats.views    = tweet?.public_metrics?.impression_count || 0;
            stats.likes    = tweet?.public_metrics?.like_count       || 0;
            stats.comments = tweet?.public_metrics?.reply_count      || 0;
            stats.title    = user ? `@${user.username}` : "-";
            if (tweet?.created_at) stats.date = tweet.created_at.slice(0, 10);
            stats.thumbnailUrl = user?.profile_image_url || undefined;
          }
        } catch (e: any) { console.warn("[X/Twitter API]", e.message); }
      }
      if (stats.likes === 0 && stats.views === 0 && process.env.APIFY_API_TOKEN) {
        try {
          const run = await apifyClient.actor("apidojo/tweet-scraper").call(
            { searchTerms: [tweetId ? `conversation_id:${tweetId}` : url], maxItems: 1, queryType: "Latest" },
            { waitSecs: 60 }
          );
          const { items } = await apifyClient.dataset(run.defaultDatasetId).listItems();
          if (items?.length > 0) {
            const item: any = items[0];
            stats.views    = item.viewCount   || item.views          || 0;
            stats.likes    = item.likeCount   || item.favorite_count || 0;
            stats.comments = item.replyCount  || item.reply_count    || 0;
            const uname = item.author?.userName || item.user?.screen_name || "";
            if (uname) stats.title = `@${uname}`;
            const dt = item.createdAt || item.created_at;
            if (dt) stats.date = new Date(dt).toISOString().slice(0, 10);
            stats.thumbnailUrl = item.author?.profileImageUrl || item.user?.profile_image_url || undefined;
          }
        } catch (e: any) { console.warn("[X/Twitter Apify]", e.message); }
      }
      if (!stats.title || stats.title === "-") {
        try {
          const oe = await fetch(`https://publish.twitter.com/oembed?url=${encodeURIComponent(url)}&omit_script=true`);
          if (oe.ok) { const d = await oe.json(); stats.title = d.author_name ? `@${d.author_name}` : "-"; }
        } catch {}
      }

    } else if (url.includes("blog.naver.com")) {
      stats = await fetchNaverBlogStats(url);

    } else {
      return NextResponse.json({ success: false, error: "지원하지 않는 플랫폼의 URL입니다." });
    }

    return NextResponse.json({ success: true, stats });
  } catch (e: any) {
    console.error(`[fetch-sns-stats] UNHANDLED ERROR url="${url}":`, e);
    return NextResponse.json({ success: false, error: e.message || "알 수 없는 오류" }, { status: 500 });
  }
}
