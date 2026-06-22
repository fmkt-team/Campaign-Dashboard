import { NextResponse } from "next/server";
import { ApifyClient } from "apify-client";
import ytdl from "ytdl-core";

const apifyClient = new ApifyClient({
  token: process.env.APIFY_API_TOKEN,
});

async function fetchYoutubeStats(url: string) {
  let views = 0, likes = 0, comments = 0, title = "-", date: string | undefined;

  // 비디오 ID 추출 (일반 영상, Shorts, YouTube Studio 모두 지원)
  const videoIdMatch = url.match(/(?:youtu\.be\/|[?&]v=|\/shorts\/|\/video\/)([a-zA-Z0-9_-]{6,20})/);
  const videoId = videoIdMatch?.[1];

  if (!videoId) {
    throw new Error("유튜브 비디오 ID를 추출할 수 없습니다.");
  }

  // YouTube Data API를 사용한 공식 정보 추출
  if (process.env.YOUTUBE_API_KEY) {
    try {
      console.log(`[YouTube] Fetching with YouTube Data API: ${videoId}`);

      const response = await fetch(
        `https://www.googleapis.com/youtube/v3/videos?id=${videoId}&key=${process.env.YOUTUBE_API_KEY}&part=statistics,snippet`
      );

      if (!response.ok) {
        throw new Error(`YouTube API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();

      if (!data.items || data.items.length === 0) {
        throw new Error("비디오를 찾을 수 없습니다.");
      }

      const video = data.items[0];
      const stats = video.statistics;
      const snippet = video.snippet;

      views = parseInt(stats?.viewCount || "0", 10);
      likes = parseInt(stats?.likeCount || "0", 10);
      comments = parseInt(stats?.commentCount || "0", 10);
      title = snippet?.title || "-";
      date = snippet?.publishedAt?.split("T")[0];

      console.log(`[YouTube] ✅ YouTube Data API success - views: ${views}, likes: ${likes}, comments: ${comments}`);
    } catch (error) {
      console.error(`[YouTube] ❌ YouTube Data API failed: ${(error as any).message}`);

      // API 실패 시 ytdl-core 폴백
      try {
        console.log(`[YouTube] Falling back to ytdl-core...`);
        const info = await ytdl.getInfo(url);
        const details = info.videoDetails;

        title = details.title || "-";
        views = parseInt(details.viewCount || "0", 10);
        date = details.uploadDate;

        const likeCount = (info as any).microformat?.playerMicroformatRenderer?.likeCount;
        if (likeCount) {
          likes = parseInt(likeCount, 10);
        }

        console.log(`[YouTube] ✅ ytdl-core fallback: views=${views}, likes=${likes}`);
      } catch (ytdlError) {
        console.error(`[YouTube] ❌ ytdl-core fallback failed:`, ytdlError);

        // 마지막 폴백: HTML 파싱
        try {
          const res = await fetch(url, {
            headers: {
              "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            },
          });

          if (res.ok) {
            const html = await res.text();
            const viewMatch = html.match(/"viewCount":"(\d+)"/);
            const likeMatch = html.match(/"likeCount":"(\d+)"/);
            const titleMatch = html.match(/<title>(.*?)<\/title>/);
            const dateMatch = html.match(/"publishDate":"([^"]+)"/) || html.match(/<meta itemprop="datePublished" content="([^"]+)"/);

            views = viewMatch ? parseInt(viewMatch[1], 10) : 0;
            likes = likeMatch ? parseInt(likeMatch[1], 10) : 0;
            title = titleMatch ? titleMatch[1].replace(" - YouTube", "") : "-";
            date = dateMatch ? dateMatch[1].split("T")[0] : undefined;

            console.log(`[YouTube] ✅ HTML fallback: views=${views}, likes=${likes}`);
          }
        } catch (htmlError) {
          console.error(`[YouTube] ❌ All methods failed`, htmlError);
        }
      }
    }
  } else {
    console.warn("[YouTube] ⚠️ YOUTUBE_API_KEY not set - using ytdl-core");

    // API Key가 없으면 ytdl-core 직접 사용
    try {
      const info = await ytdl.getInfo(url);
      const details = info.videoDetails;

      title = details.title || "-";
      views = parseInt(details.viewCount || "0", 10);
      date = details.uploadDate;

      const likeCount = (info as any).microformat?.playerMicroformatRenderer?.likeCount;
      if (likeCount) {
        likes = parseInt(likeCount, 10);
      }

      console.log(`[YouTube] ✅ ytdl-core: views=${views}, likes=${likes}`);
    } catch (error) {
      console.error(`[YouTube] ❌ ytdl-core failed:`, error);
    }
  }

  // YouTube oEmbed fallback — 제목을 끝내 못 가져온 경우 (무료, 신뢰도 높음)
  if ((!title || title === "-") && videoId) {
    try {
      const oembed = await fetch(
        `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`,
        { signal: AbortSignal.timeout(5000) }
      );
      if (oembed.ok) {
        const d = await oembed.json();
        if (d.title) title = d.title;
      }
    } catch {}
  }

  return {
    views,
    likes,
    comments,
    title,
    date,
  };
}

async function fetchNaverBlogStats(url: string) {
  // 네이버 블로그는 iframe 구조여서 단순 fetch로 공감수를 뽑기 어려움
  // 휴리스틱: 일단 타이틀이라도 가져오기 (시간 관계상 임시 스크랩)
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
  const html = await res.text();
  const titleMatch = html.match(/<title>(.*?)<\/title>/);
  
  return {
    views: 0,
    likes: 0,
    comments: 0,
    title: titleMatch ? titleMatch[1] : "-",
  };
}

export async function POST(req: Request) {
  try {
    const { url } = await req.json();
    if (!url || typeof url !== "string") {
      return NextResponse.json({ error: "URL이 필요합니다." }, { status: 400 });
    }

    let stats: any = { views: 0, likes: 0, comments: 0, title: "-" };

    if (url.includes("youtube.com") || url.includes("youtu.be")) {
      stats = await fetchYoutubeStats(url);
      const idMatch = url.match(/(?:[?&]v=|youtu\.be\/|\/shorts\/|\/video\/)([a-zA-Z0-9_-]{6,20})/);
      if (idMatch) {
         stats.thumbnailUrl = `https://img.youtube.com/vi/${idMatch[1]}/mqdefault.jpg`;
      }
    } else if (url.includes("instagram.com")) {
      if (!process.env.APIFY_API_TOKEN) {
        return NextResponse.json({ success: false, error: "APIFY_API_TOKEN이 없어 인스타그램 스크랩 불가" });
      }
      const run = await apifyClient.actor("apify/instagram-scraper").call({
        addParentData: false,
        directUrls: [url],
        resultsType: "details",
      });
      const { items } = await apifyClient.dataset(run.defaultDatasetId).listItems();
      
      if (items && items.length > 0) {
        const item: any = items[0];
        stats.views = item.videoViewCount || item.videoPlayCount || 0;
        // 인스타그램은 좋아요 수를 공개하지 않는 경우가 많아 0으로 고정
        stats.likes = typeof item.likesCount === "number" && item.likesCount > 0 ? item.likesCount : 0;
        stats.comments = item.commentsCount || 0;
        stats.title = item.caption ? item.caption.substring(0, 50) + "..." : "-";
        stats.thumbnailUrl = item.displayUrl || item.thumbnailUrl;
        if (item.timestamp) {
           stats.date = new Date(item.timestamp).toISOString().split('T')[0];
        }
      } else {
        throw new Error("인스타그램 데이터를 찾을 수 없습니다.");
      }
    } else if (url.includes("twitter.com") || url.includes("x.com")) {
      // 트윗 ID 추출
      const tweetIdMatch = url.match(/\/status\/(\d+)/);
      const tweetId = tweetIdMatch?.[1];

      // ① Twitter API v2 (Bearer Token 있을 때 우선)
      if (tweetId && process.env.TWITTER_BEARER_TOKEN) {
        try {
          const apiUrl = `https://api.twitter.com/2/tweets/${tweetId}?tweet.fields=created_at,public_metrics,author_id&expansions=author_id&user.fields=name,username,profile_image_url`;
          const res = await fetch(apiUrl, {
            headers: { Authorization: `Bearer ${process.env.TWITTER_BEARER_TOKEN}` },
          });
          if (res.ok) {
            const data = await res.json();
            const tweet = data.data;
            const user = data.includes?.users?.[0];
            stats.views    = tweet?.public_metrics?.impression_count || 0;
            stats.likes    = tweet?.public_metrics?.like_count       || 0;
            stats.comments = tweet?.public_metrics?.reply_count      || 0;
            stats.title    = user ? `@${user.username}` : "-";
            if (tweet?.created_at) stats.date = tweet.created_at.slice(0, 10);
            stats.thumbnailUrl = user?.profile_image_url || undefined;
          }
        } catch (e: any) {
          console.warn("[X/Twitter API]", e.message);
        }
      }
      // ② Apify apidojo/tweet-scraper 폴백
      if (stats.likes === 0 && stats.views === 0 && process.env.APIFY_API_TOKEN) {
        try {
          const run = await apifyClient.actor("apidojo/tweet-scraper").call({
            searchTerms: [tweetId ? `conversation_id:${tweetId}` : url],
            maxItems: 1,
            queryType: "Latest",
          }, { waitSecs: 60 });
          const { items } = await apifyClient.dataset(run.defaultDatasetId).listItems();
          if (items?.length > 0) {
            const item: any = items[0];
            stats.views    = item.viewCount      || item.views          || 0;
            stats.likes    = item.likeCount      || item.favorite_count || 0;
            stats.comments = item.replyCount     || item.reply_count    || 0;
            const uname = item.author?.userName  || item.user?.screen_name || "";
            if (uname) stats.title = `@${uname}`;
            const dt = item.createdAt || item.created_at;
            if (dt) stats.date = new Date(dt).toISOString().slice(0, 10);
            stats.thumbnailUrl = item.author?.profileImageUrl || item.user?.profile_image_url || undefined;
          }
        } catch (e: any) {
          console.warn("[X/Twitter Apify]", e.message);
        }
      }
      // ③ 최소한 oEmbed로 작성자명이라도 표시
      if (!stats.title || stats.title === "-") {
        try {
          const oe = await fetch(`https://publish.twitter.com/oembed?url=${encodeURIComponent(url)}&omit_script=true`);
          if (oe.ok) { const d = await oe.json(); stats.title = d.author_name ? `@${d.author_name}` : "-"; }
        } catch {}
      }
    } else if (url.includes("blog.naver.com")) {
      stats = await fetchNaverBlogStats(url);
    } else if (url.includes("twitter.com") || url.includes("x.com")) {
      if (!process.env.APIFY_API_TOKEN) {
        return NextResponse.json({ error: "APIFY_API_TOKEN이 없어 트위터 스크랩을 할 수 없습니다." }, { status: 500 });
      }
      // 트윗 ID 추출
      const tweetIdMatch = url.match(/status\/(\d+)/);
      if (!tweetIdMatch) {
        return NextResponse.json({ error: "트윗 ID를 추출할 수 없습니다." }, { status: 400 });
      }
      const run = await apifyClient.actor("apidojo/tweet-scraper").call({
        tweetIDs: [tweetIdMatch[1]],
        maxItems: 1,
      });
      const { items } = await apifyClient.dataset(run.defaultDatasetId).listItems();
      if (items && items.length > 0) {
        const item: any = items[0];
        stats.views    = item.viewCount    || 0;
        stats.likes    = item.likeCount    || item.favoriteCount || 0;
        stats.comments = item.replyCount   || 0;
        stats.title    = item.text ? item.text.substring(0, 80) + "..." : "-";
        if (item.createdAt) stats.date = new Date(item.createdAt).toISOString().split("T")[0];
      } else {
        throw new Error("트위터 데이터를 찾을 수 없습니다.");
      }
    } else {
      return NextResponse.json({ error: "지원하지 않는 플랫폼의 URL입니다." }, { status: 400 });
    }

    return NextResponse.json({ success: true, stats });
  } catch (e: any) {
    console.error("fetch-sns-stats Error:", e);
    return NextResponse.json({ error: e.message || "알 수 없는 오류가 발생했습니다." }, { status: 500 });
  }
}
