import { NextResponse } from "next/server";
import { ApifyClient } from "apify-client";

export const maxDuration = 120;

const apify = new ApifyClient({ token: process.env.APIFY_API_TOKEN });

type SocialPost = {
  platform: string;
  postUrl: string;
  text: string;
  author: string;
  authorHandle?: string;
  date: string;
  likes: number;
  replies: number;
  reposts?: number;
  views?: number;
  thumbnailUrl?: string;
};

// X/Twitter 키워드 검색
async function fetchXPosts(keyword: string, dateFrom: string, dateTo: string, limit = 30): Promise<SocialPost[]> {
  const run = await apify.actor("quacker/twitter-scraper").call({
    searchTerms: [keyword],
    maxItems: limit,
    since: dateFrom || undefined,
    until: dateTo   || undefined,
    addUserInfo: true,
    lang: "ko",
  }, { waitSecs: 90 });

  const { items } = await apify.dataset(run.defaultDatasetId).listItems();
  return (items || []).map((item: any) => ({
    platform:    "X",
    postUrl:     item.url || item.tweetUrl || `https://x.com/i/status/${item.id || ""}`,
    text:        item.text || item.fullText || "",
    author:      item.author?.name || item.user?.name || "",
    authorHandle:item.author?.userName || item.user?.screenName || "",
    date:        item.createdAt ? new Date(item.createdAt).toISOString().slice(0, 10) : "",
    likes:       item.likeCount    || item.favoriteCount   || 0,
    replies:     item.replyCount   || 0,
    reposts:     item.retweetCount || 0,
    views:       item.viewCount    || item.impressionCount || undefined,
    thumbnailUrl:item.author?.profileImageUrl || undefined,
  })).filter((p: SocialPost) => p.text);
}

// Instagram 해시태그 검색
async function fetchInstagramPosts(keyword: string, dateFrom: string, dateTo: string, limit = 30): Promise<SocialPost[]> {
  // 키워드에서 # 제거
  const hashtag = keyword.replace(/^#/, "");
  const run = await apify.actor("apify/instagram-hashtag-scraper").call({
    hashtags: [hashtag],
    resultsLimit: limit,
  }, { waitSecs: 90 });

  const { items } = await apify.dataset(run.defaultDatasetId).listItems();
  return (items || [])
    .map((item: any) => {
      const date = item.timestamp
        ? new Date(item.timestamp).toISOString().slice(0, 10)
        : "";
      if (dateFrom && date && date < dateFrom) return null;
      if (dateTo   && date && date > dateTo)   return null;
      return {
        platform:    "Instagram",
        postUrl:     item.url || item.shortCode ? `https://www.instagram.com/p/${item.shortCode}/` : "",
        text:        item.caption ? item.caption.slice(0, 300) : "",
        author:      item.ownerFullName || item.ownerUsername || "",
        authorHandle:item.ownerUsername || "",
        date,
        likes:       item.likesCount    || 0,
        replies:     item.commentsCount || 0,
        thumbnailUrl:item.displayUrl    || item.thumbnailUrl || undefined,
      } as SocialPost;
    })
    .filter(Boolean) as SocialPost[];
}

export async function POST(req: Request) {
  try {
    const { keyword, platforms, dateFrom = "", dateTo = "", limit = 30 } = await req.json();

    if (!keyword) {
      return NextResponse.json({ success: false, error: "keyword가 필요합니다." }, { status: 400 });
    }
    if (!process.env.APIFY_API_TOKEN) {
      return NextResponse.json({ success: false, error: "APIFY_API_TOKEN이 설정되지 않았습니다." }, { status: 500 });
    }

    const wantX   = !platforms || platforms.includes("X");
    const wantIG  = !platforms || platforms.includes("Instagram");

    const results = await Promise.allSettled([
      wantX  ? fetchXPosts(keyword, dateFrom, dateTo, limit)         : Promise.resolve([]),
      wantIG ? fetchInstagramPosts(keyword, dateFrom, dateTo, limit) : Promise.resolve([]),
    ]);

    const posts: SocialPost[] = [
      ...(results[0].status === "fulfilled" ? results[0].value : []),
      ...(results[1].status === "fulfilled" ? results[1].value : []),
    ];

    const errors: string[] = [];
    if (results[0].status === "rejected") errors.push(`X: ${(results[0] as any).reason?.message}`);
    if (results[1].status === "rejected") errors.push(`Instagram: ${(results[1] as any).reason?.message}`);

    return NextResponse.json({
      success: true,
      posts,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (e: any) {
    console.error("[fetch-social-posts]", e);
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}
