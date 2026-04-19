import { NextResponse } from "next/server";
import { ApifyClient } from "apify-client";

const apifyClient = new ApifyClient({
  token: process.env.APIFY_API_TOKEN,
});

async function fetchYoutubeStats(url: string) {
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36",
    },
  });
  if (!res.ok) throw new Error("유튜브 페이지를 불러오지 못했습니다.");
  const html = await res.text();

  const viewMatch = html.match(/"viewCount":"(\d+)"/);
  const likeMatch = html.match(/"likeCount":"(\d+)"/);
  const titleMatch = html.match(/<title>(.*?)<\/title>/);
  const dateMatch = html.match(/"publishDate":"([^"]+)"/) || html.match(/<meta itemprop="datePublished" content="([^"]+)"/);

  return {
    views: viewMatch ? parseInt(viewMatch[1], 10) : 0,
    likes: likeMatch ? parseInt(likeMatch[1], 10) : 0,
    comments: 0, // YouTube raw HTML doesn't typically expose exact comments simply
    title: titleMatch ? titleMatch[1].replace(" - YouTube", "") : "-",
    date: dateMatch ? dateMatch[1].split("T")[0] : undefined,
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
