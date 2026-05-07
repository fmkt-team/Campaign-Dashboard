import { NextResponse } from "next/server";
import { ApifyClient } from "apify-client";

const apifyClient = new ApifyClient({ token: process.env.APIFY_API_TOKEN });

async function fetchYoutubeComments(videoId: string) {
  const commentsList: any[] = [];

  // YouTube Data API로 댓글 가져오기
  if (process.env.YOUTUBE_API_KEY) {
    try {
      console.log(`[YouTube Comments] Fetching with YouTube Data API: ${videoId}`);
      const response = await fetch(
        `https://www.googleapis.com/youtube/v3/commentThreads?videoId=${videoId}&key=${process.env.YOUTUBE_API_KEY}&part=snippet&maxResults=100&textFormat=plainText`,
        { headers: { "User-Agent": "Mozilla/5.0" } }
      );

      if (!response.ok) {
        throw new Error(`YouTube API error: ${response.status}`);
      }

      const data = await response.json();
      if (data.items && Array.isArray(data.items)) {
        data.items.forEach((item: any) => {
          const snippet = item.snippet?.topLevelComment?.snippet;
          if (snippet) {
            commentsList.push({
              text: snippet.textDisplay || "",
              author: snippet.authorDisplayName || "익명",
              likes: snippet.likeCount || 0,
              date: snippet.publishedAt ? snippet.publishedAt.split("T")[0] : "",
            });
          }
        });
      }
      console.log(`[YouTube Comments] ✅ Fetched ${commentsList.length} comments`);
      return commentsList;
    } catch (e: any) {
      console.error(`[YouTube Comments] ❌ YouTube API failed: ${e.message}`);
      // Apify로 폴백
      try {
        console.log(`[YouTube Comments] Falling back to Apify...`);
        if (!process.env.APIFY_API_TOKEN) {
          throw new Error("Apify API token not available");
        }
        const run = await apifyClient.actor("streamers/youtube-scraper").call({
          startUrls: [{ url: `https://youtube.com/watch?v=${videoId}` }],
          maxComments: 30,
        });
        const { items } = await apifyClient.dataset(run.defaultDatasetId).listItems();
        const comments = (items[0] as any)?.comments || [];
        const apifyComments = comments.slice(0, 30).map((c: any) => ({
          text: c.text || c.content || "",
          author: c.authorText || c.author || "익명",
          likes: c.likeCount || 0,
          date: c.publishedTimeText || c.date || "",
        }));
        console.log(`[YouTube Comments] ✅ Apify fallback fetched ${apifyComments.length} comments`);
        return apifyComments;
      } catch (apifyError: any) {
        console.error(`[YouTube Comments] ❌ Apify fallback failed: ${apifyError.message}`);
        return [];
      }
    }
  }
  return [];
}

export async function POST(req: Request) {
  try {
    const { url, platform } = await req.json();
    if (!url) return NextResponse.json({ error: "URL이 필요합니다." }, { status: 400 });

    let commentsList: any[] = [];

    const isYoutube = url.includes("youtube.com") || url.includes("youtu.be");
    const isInsta   = url.includes("instagram.com");

    if (isYoutube) {
      const idMatch = url.match(/(?:v=|youtu\.be\/|shorts\/)([^&?]+)/);
      if (!idMatch) {
        return NextResponse.json({
          error: "유효하지 않은 유튜브 URL",
          commentsList: [],
        });
      }
      const videoId = idMatch[1];
      commentsList = await fetchYoutubeComments(videoId);

      return NextResponse.json({ success: true, commentsList });
    } else if (isInsta) {
      if (!process.env.APIFY_API_TOKEN) {
        return NextResponse.json({
          error: "Instagram 댓글 조회는 Apify API 토큰이 필요합니다.",
          commentsList: [],
        }, { status: 200 });
      }
      try {
        const run = await apifyClient.actor("apify/instagram-comment-scraper").call({
          directUrls: [url],
          resultsLimit: 30,
        });
        const { items } = await apifyClient.dataset(run.defaultDatasetId).listItems();
        commentsList = items.slice(0, 30).map((c: any) => ({
          text:   c.text || "",
          author: c.ownerUsername || "익명",
          likes:  c.likesCount || 0,
          date:   c.timestamp ? new Date(c.timestamp).toISOString().split("T")[0] : "",
        }));
      } catch (e: any) {
        return NextResponse.json({
          error: `Instagram 댓글 수집 실패: ${e.message}`,
          commentsList: [],
        });
      }
      return NextResponse.json({ success: true, commentsList });
    } else {
      return NextResponse.json({
        error: "댓글 조회는 YouTube 및 Instagram만 지원합니다.",
        commentsList: [],
      });
    }
  } catch (e: any) {
    console.error("fetch-comments Error:", e);
    return NextResponse.json({ error: e.message, commentsList: [] }, { status: 500 });
  }
}
