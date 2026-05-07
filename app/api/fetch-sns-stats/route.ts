import { NextResponse } from "next/server";
import { ApifyClient } from "apify-client";
import ytdl from "ytdl-core";

const apifyClient = new ApifyClient({
  token: process.env.APIFY_API_TOKEN,
});

async function fetchYoutubeStats(url: string) {
  let views = 0, likes = 0, comments = 0, title = "-", date: string | undefined;

  // 비디오 ID 추출
  const videoIdMatch = url.match(/(?:youtu\.be\/|v=)([^&?]+)/);
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

        const likeCount = info.microformat?.playerMicroformatRenderer?.likeCount;
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

      const likeCount = info.microformat?.playerMicroformatRenderer?.likeCount;
      if (likeCount) {
        likes = parseInt(likeCount, 10);
      }

      console.log(`[YouTube] ✅ ytdl-core: views=${views}, likes=${likes}`);
    } catch (error) {
      console.error(`[YouTube] ❌ ytdl-core failed:`, error);
    }
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
      const idMatch = url.match(/(?:v=|youtu\.be\/|shorts\/)([^&?]+)/);
      if (idMatch) {
         stats.thumbnailUrl = `https://img.youtube.com/vi/${idMatch[1]}/mqdefault.jpg`;
      }
    } else if (url.includes("instagram.com")) {
      if (!process.env.APIFY_API_TOKEN) {
        return NextResponse.json({ error: "APIFY_API_TOKEN 환경 변수가 없어서 인스타그램 스크랩을 할 수 없습니다." }, { status: 500 });
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
        stats.likes = item.likesCount || 0;
        stats.comments = item.commentsCount || 0;
        stats.title = item.caption ? item.caption.substring(0, 50) + "..." : "-";
        stats.thumbnailUrl = item.displayUrl || item.thumbnailUrl;
        if (item.timestamp) {
           stats.date = new Date(item.timestamp).toISOString().split('T')[0];
        }
      } else {
        throw new Error("인스타그램 데이터를 찾을 수 없습니다.");
      }
    } else if (url.includes("blog.naver.com")) {
      stats = await fetchNaverBlogStats(url);
    } else {
      return NextResponse.json({ error: "지원하지 않는 플랫폼의 URL입니다." }, { status: 400 });
    }

    return NextResponse.json({ success: true, stats });
  } catch (e: any) {
    console.error("fetch-sns-stats Error:", e);
    return NextResponse.json({ error: e.message || "알 수 없는 오류가 발생했습니다." }, { status: 500 });
  }
}
