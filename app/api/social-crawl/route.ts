import { NextRequest, NextResponse } from "next/server";
import { ApifyClient } from "apify-client";

const apifyClient = new ApifyClient({ token: process.env.APIFY_API_TOKEN });

export interface SocialPost {
  id: string;
  platform: "twitter" | "instagram";
  text: string;
  author: string;
  authorHandle: string;
  date: string;
  url: string;
  likes: number;
  comments: number;
  reposts: number;
  thumbnailUrl?: string;
}

// ─── X (Twitter) via Apify ──────────────────────────────────────────
async function fetchTwitterViaApify(
  keywords: string[],
  maxItems = 50
): Promise<SocialPost[]> {
  if (!process.env.APIFY_API_TOKEN) return [];
  try {
    const query = keywords.map(k => `"${k}"`).join(" OR ");
    const run = await apifyClient.actor("apidojo/tweet-scraper").call({
      searchTerms: [query],
      maxItems,
      queryType: "Latest",
      lang: "ko",
    });
    const { items } = await apifyClient.dataset(run.defaultDatasetId).listItems();
    return items.map((item: any) => ({
      id: item.id || item.tweet_id || String(Math.random()),
      platform: "twitter" as const,
      text: item.full_text || item.text || "",
      author: item.user?.name || item.author?.name || "Unknown",
      authorHandle: item.user?.screen_name || item.author?.userName || "",
      date: item.created_at || item.date || "",
      url: item.url || (item.user?.screen_name ? `https://twitter.com/${item.user.screen_name}/status/${item.id}` : ""),
      likes: item.favorite_count || item.likeCount || 0,
      comments: item.reply_count || item.replyCount || 0,
      reposts: item.retweet_count || item.retweetCount || 0,
      thumbnailUrl: item.user?.profile_image_url || "",
    }));
  } catch (e: any) {
    console.error("[Twitter Apify]", e.message);
    return [];
  }
}

// ─── X (Twitter) via Official API v2 ───────────────────────────────
async function fetchTwitterViaAPI(
  keywords: string[],
  maxResults = 50
): Promise<SocialPost[]> {
  const bearerToken = process.env.TWITTER_BEARER_TOKEN;
  if (!bearerToken) return [];
  try {
    const query = encodeURIComponent(
      keywords.map(k => `"${k}"`).join(" OR ") + " lang:ko -is:retweet"
    );
    const url = `https://api.twitter.com/2/tweets/search/recent?query=${query}&max_results=${Math.min(maxResults, 100)}&tweet.fields=created_at,public_metrics,author_id&expansions=author_id&user.fields=name,username,profile_image_url`;

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${bearerToken}` },
    });
    if (!res.ok) {
      console.error("[Twitter API] HTTP", res.status, await res.text());
      return [];
    }
    const data = await res.json();
    const userMap = new Map(
      (data.includes?.users || []).map((u: any) => [u.id, u])
    );
    return (data.data || []).map((tweet: any) => {
      const user: any = userMap.get(tweet.author_id) || {};
      return {
        id: tweet.id,
        platform: "twitter" as const,
        text: tweet.text,
        author: user.name || "Unknown",
        authorHandle: user.username || "",
        date: tweet.created_at || "",
        url: `https://twitter.com/${user.username}/status/${tweet.id}`,
        likes: tweet.public_metrics?.like_count || 0,
        comments: tweet.public_metrics?.reply_count || 0,
        reposts: tweet.public_metrics?.retweet_count || 0,
        thumbnailUrl: user.profile_image_url || "",
      };
    });
  } catch (e: any) {
    console.error("[Twitter API]", e.message);
    return [];
  }
}

// ─── Instagram via Apify (해시태그 기반) ───────────────────────────
async function fetchInstagramViaApify(
  keywords: string[],
  maxItems = 50
): Promise<SocialPost[]> {
  if (!process.env.APIFY_API_TOKEN) return [];
  try {
    // 키워드를 해시태그로 변환 (공백 제거)
    const hashtags = keywords.map(k => k.replace(/\s+/g, "").replace(/^#/, ""));
    const run = await apifyClient.actor("apify/instagram-hashtag-scraper").call({
      hashtags,
      resultsLimit: maxItems,
    });
    const { items } = await apifyClient.dataset(run.defaultDatasetId).listItems();
    return items.map((item: any) => ({
      id: item.id || item.shortCode || String(Math.random()),
      platform: "instagram" as const,
      text: item.caption || item.text || "",
      author: item.ownerFullName || item.owner?.fullName || "Unknown",
      authorHandle: item.ownerUsername || item.owner?.username || "",
      date: item.timestamp || item.takenAtTimestamp || "",
      url: item.url || (item.shortCode ? `https://www.instagram.com/p/${item.shortCode}/` : ""),
      likes: item.likesCount || item.likes || 0,
      comments: item.commentsCount || item.comments || 0,
      reposts: 0,
      thumbnailUrl: item.displayUrl || item.thumbnailUrl || "",
    }));
  } catch (e: any) {
    console.error("[Instagram Apify]", e.message);
    return [];
  }
}

// ─── Naver Blog via 네이버 검색 API ───────────────────────────────────
async function fetchNaverBlog(
  keywords: string[],
  maxItems = 30,
  dateFrom?: string,
  dateTo?: string
): Promise<SocialPost[]> {
  const clientId     = process.env.NAVER_CLIENT_ID;
  const clientSecret = process.env.NAVER_CLIENT_SECRET;
  if (!clientId || !clientSecret) return [];

  const results: SocialPost[] = [];
  for (const kw of keywords) {
    try {
      const query = encodeURIComponent(kw);
      const url = `https://openapi.naver.com/v1/search/blog.json?query=${query}&display=${Math.min(maxItems, 100)}&sort=date`;
      const res = await fetch(url, {
        headers: { "X-Naver-Client-Id": clientId, "X-Naver-Client-Secret": clientSecret },
      });
      if (!res.ok) continue;
      const data = await res.json();
      for (const item of (data.items || [])) {
        // postdate 형식: YYYYMMDD
        const rawDate = item.postdate || "";
        const date = rawDate.length === 8
          ? `${rawDate.slice(0, 4)}-${rawDate.slice(4, 6)}-${rawDate.slice(6, 8)}`
          : "";
        if (dateFrom && date && date < dateFrom) continue;
        if (dateTo   && date && date > dateTo)   continue;
        results.push({
          id:           item.link || String(Math.random()),
          platform:     "naver_blog" as any,
          text:         (item.description || "").replace(/<[^>]+>/g, ""),
          author:       item.bloggername || "",
          authorHandle: item.bloggername || "",
          date,
          url:          item.link || "",
          likes:        0,
          comments:     0,
          reposts:      0,
          thumbnailUrl: undefined,
          title:        (item.title || "").replace(/<[^>]+>/g, ""),
        } as any);
      }
    } catch (e: any) {
      console.error("[Naver Blog]", e.message);
    }
  }
  return results;
}

// ─── Route Handler ────────────────────────────────────────────────────
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  try {
    const {
      platform,
      keywords,
      maxItems = 30,
      dateFrom,
      dateTo,
    }: { platform: "twitter" | "instagram" | "naver_blog" | "all"; keywords: string[]; maxItems?: number; dateFrom?: string; dateTo?: string } =
      await req.json();

    if (!keywords || keywords.length === 0) {
      return NextResponse.json({ error: "검색 키워드를 입력해주세요." }, { status: 400 });
    }

    const hasApify   = !!process.env.APIFY_API_TOKEN;
    const hasTwitter = !!process.env.TWITTER_BEARER_TOKEN;
    const hasNaver   = !!(process.env.NAVER_CLIENT_ID && process.env.NAVER_CLIENT_SECRET);

    let posts: SocialPost[] = [];
    const errors: string[] = [];

    if (platform === "twitter" || platform === "all") {
      if (hasApify || hasTwitter) {
        const twPosts = hasTwitter
          ? await fetchTwitterViaAPI(keywords, maxItems)
          : await fetchTwitterViaApify(keywords, maxItems);
        posts = [...posts, ...twPosts];
      } else {
        errors.push("X/Twitter: APIFY_API_TOKEN 또는 TWITTER_BEARER_TOKEN 필요");
      }
    }

    if (platform === "instagram" || platform === "all") {
      if (hasApify) {
        const igPosts = await fetchInstagramViaApify(keywords, maxItems);
        posts = [...posts, ...igPosts];
      } else {
        errors.push("Instagram: APIFY_API_TOKEN 필요");
      }
    }

    if (platform === "naver_blog" || platform === "all") {
      if (hasNaver) {
        const nbPosts = await fetchNaverBlog(keywords, maxItems, dateFrom, dateTo);
        posts = [...posts, ...nbPosts as any];
      } else {
        errors.push("Naver Blog: NAVER_CLIENT_ID / NAVER_CLIENT_SECRET 필요");
      }
    }

    // 기간 필터 (Twitter/Instagram 결과에도 적용)
    if (dateFrom || dateTo) {
      posts = posts.filter(p => {
        if (!p.date) return true;
        const d = p.date.slice(0, 10);
        if (dateFrom && d < dateFrom) return false;
        if (dateTo   && d > dateTo)   return false;
        return true;
      });
    }

    // 날짜 내림차순 정렬
    posts.sort((a, b) => {
      if (!a.date && !b.date) return 0;
      if (!a.date) return 1;
      if (!b.date) return -1;
      return b.date.localeCompare(a.date);
    });

    return NextResponse.json({
      posts,
      total: posts.length,
      platform,
      keywords,
      fetchedAt: new Date().toISOString(),
      errors: errors.length > 0 ? errors : undefined,
      source: hasTwitter ? "twitter_api" : hasApify ? "apify" : "naver_only",
    });
  } catch (e: any) {
    console.error("[Social Crawl] Error:", e);
    return NextResponse.json({ error: e.message || "알 수 없는 오류" }, { status: 500 });
  }
}
