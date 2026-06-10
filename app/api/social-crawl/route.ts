import { NextRequest, NextResponse } from "next/server";
import { ApifyClient } from "apify-client";

const apifyClient = new ApifyClient({ token: process.env.APIFY_API_TOKEN });

export const maxDuration = 120;

export interface SocialPost {
  id: string;
  platform: "twitter" | "instagram" | "naver_blog";
  title?: string;
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

// ─── X (Twitter) via quacker/twitter-scraper (무료 커뮤니티 액터) ────
async function fetchTwitter(keywords: string[], maxItems = 30): Promise<{ posts: SocialPost[]; error?: string }> {
  if (!process.env.APIFY_API_TOKEN) return { posts: [], error: "APIFY_API_TOKEN 미설정" };
  try {
    // 한국어 키워드는 따옴표 없이 OR 연결, lang 필터 제거로 검색 범위 확대
    const query = keywords.map(k => k.replace(/^#/, "")).join(" OR ");
    const run = await apifyClient.actor("quacker/twitter-scraper").call({
      searchTerms: [query],
      maxItems,
      addUserInfo: true,
    }, { waitSecs: 90 });
    const { items } = await apifyClient.dataset(run.defaultDatasetId).listItems();
    const posts = (items || []).map((item: any) => ({
      id: item.id || String(Math.random()),
      platform: "twitter" as const,
      text: item.text || item.full_text || "",
      author: item.author?.name || item.user?.name || "",
      authorHandle: item.author?.userName || item.user?.screen_name || "",
      date: item.createdAt ? new Date(item.createdAt).toISOString().slice(0, 10) : (item.created_at || ""),
      url: item.url || (item.author?.userName ? `https://x.com/${item.author.userName}/status/${item.id}` : ""),
      likes: item.likeCount || item.favorite_count || 0,
      comments: item.replyCount || item.reply_count || 0,
      reposts: item.retweetCount || item.retweet_count || 0,
      thumbnailUrl: item.author?.profileImageUrl || item.user?.profile_image_url || undefined,
    })).filter((p: SocialPost) => p.text);
    return { posts };
  } catch (e: any) {
    console.error("[Twitter quacker]", e.message);
    return { posts: [], error: `X/Twitter 수집 실패: ${e.message}` };
  }
}

// ─── X via 공식 API v2 ────────────────────────────────────────────────
async function fetchTwitterAPI(keywords: string[], maxResults = 30): Promise<{ posts: SocialPost[]; error?: string }> {
  const token = process.env.TWITTER_BEARER_TOKEN;
  if (!token) return { posts: [] };
  try {
    const query = encodeURIComponent(keywords.map(k => `"${k}"`).join(" OR ") + " lang:ko -is:retweet");
    const url = `https://api.twitter.com/2/tweets/search/recent?query=${query}&max_results=${Math.min(maxResults, 100)}&tweet.fields=created_at,public_metrics,author_id&expansions=author_id&user.fields=name,username,profile_image_url`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) {
      const body = await res.text();
      return { posts: [], error: `Twitter API ${res.status}: ${body.slice(0, 100)}` };
    }
    const data = await res.json();
    const userMap = new Map((data.includes?.users || []).map((u: any) => [u.id, u]));
    const posts = (data.data || []).map((tweet: any) => {
      const user: any = userMap.get(tweet.author_id) || {};
      return {
        id: tweet.id,
        platform: "twitter" as const,
        text: tweet.text,
        author: user.name || "",
        authorHandle: user.username || "",
        date: tweet.created_at ? tweet.created_at.slice(0, 10) : "",
        url: `https://x.com/${user.username}/status/${tweet.id}`,
        likes: tweet.public_metrics?.like_count || 0,
        comments: tweet.public_metrics?.reply_count || 0,
        reposts: tweet.public_metrics?.retweet_count || 0,
        thumbnailUrl: user.profile_image_url || undefined,
      };
    });
    return { posts };
  } catch (e: any) {
    return { posts: [], error: `Twitter API 오류: ${e.message}` };
  }
}

// ─── Instagram via apify/instagram-hashtag-scraper ────────────────────
async function fetchInstagram(keywords: string[], maxItems = 30): Promise<{ posts: SocialPost[]; error?: string }> {
  if (!process.env.APIFY_API_TOKEN) return { posts: [], error: "APIFY_API_TOKEN 미설정" };
  try {
    const hashtags = keywords.map(k => k.replace(/\s+/g, "").replace(/^#/, ""));
    const run = await apifyClient.actor("apify/instagram-hashtag-scraper").call({
      hashtags,
      resultsLimit: maxItems,
    }, { waitSecs: 90 });
    const { items } = await apifyClient.dataset(run.defaultDatasetId).listItems();
    const posts = (items || []).map((item: any) => ({
      id: item.id || item.shortCode || String(Math.random()),
      platform: "instagram" as const,
      text: item.caption || item.alt || "",
      author: item.ownerFullName || item.owner?.fullName || "",
      authorHandle: item.ownerUsername || item.owner?.username || "",
      date: item.timestamp ? new Date(item.timestamp).toISOString().slice(0, 10) : "",
      url: item.url || (item.shortCode ? `https://www.instagram.com/p/${item.shortCode}/` : ""),
      likes: item.likesCount || item.likes || 0,
      comments: item.commentsCount || item.comments || 0,
      reposts: 0,
      thumbnailUrl: item.displayUrl || item.thumbnailUrl || undefined,
    })).filter((p: SocialPost) => p.text || p.url);
    return { posts };
  } catch (e: any) {
    console.error("[Instagram Apify]", e.message);
    return { posts: [], error: `Instagram 수집 실패: ${e.message}` };
  }
}

// ─── Naver Blog via 네이버 검색 API ─────────────────────────────────
async function fetchNaverBlog(
  keywords: string[], maxItems = 30, dateFrom?: string, dateTo?: string
): Promise<{ posts: SocialPost[]; error?: string }> {
  const clientId     = process.env.NAVER_CLIENT_ID;
  const clientSecret = process.env.NAVER_CLIENT_SECRET;
  if (!clientId || !clientSecret) return { posts: [], error: "NAVER_CLIENT_ID / NAVER_CLIENT_SECRET 미설정" };

  const posts: SocialPost[] = [];
  for (const kw of keywords) {
    try {
      const res = await fetch(
        `https://openapi.naver.com/v1/search/blog.json?query=${encodeURIComponent(kw)}&display=${Math.min(maxItems, 100)}&sort=date`,
        { headers: { "X-Naver-Client-Id": clientId, "X-Naver-Client-Secret": clientSecret } }
      );
      if (!res.ok) continue;
      const data = await res.json();
      for (const item of (data.items || [])) {
        const rawDate = item.postdate || "";
        const date = rawDate.length === 8
          ? `${rawDate.slice(0,4)}-${rawDate.slice(4,6)}-${rawDate.slice(6,8)}`
          : "";
        if (dateFrom && date && date < dateFrom) continue;
        if (dateTo   && date && date > dateTo)   continue;
        posts.push({
          id:            item.link || String(Math.random()),
          platform:      "naver_blog",
          title:         (item.title       || "").replace(/<[^>]+>/g, ""),
          text:          (item.description || "").replace(/<[^>]+>/g, ""),
          author:        item.bloggername  || "",
          authorHandle:  item.bloggername  || "",
          date,
          url:           item.link || "",
          likes:         0,
          comments:      0,
          reposts:       0,
        } as SocialPost);
      }
    } catch (e: any) {
      console.error("[Naver Blog]", e.message);
    }
  }
  return { posts };
}

// ─── Route Handler ────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const { platform = "all", keywords, maxItems = 30, dateFrom, dateTo }:
      { platform?: string; keywords: string[]; maxItems?: number; dateFrom?: string; dateTo?: string } =
      await req.json();

    if (!keywords?.length) {
      return NextResponse.json({ error: "검색 키워드를 입력해주세요." }, { status: 400 });
    }

    const hasApify   = !!process.env.APIFY_API_TOKEN;
    const hasTwitter = !!process.env.TWITTER_BEARER_TOKEN;
    const hasNaver   = !!(process.env.NAVER_CLIENT_ID && process.env.NAVER_CLIENT_SECRET);

    let posts: SocialPost[] = [];
    const errors: string[] = [];

    // X / Twitter
    if (platform === "twitter" || platform === "all") {
      if (hasTwitter) {
        const r = await fetchTwitterAPI(keywords, maxItems);
        posts = [...posts, ...r.posts];
        if (r.error) errors.push(r.error);
      } else if (hasApify) {
        const r = await fetchTwitter(keywords, maxItems);
        posts = [...posts, ...r.posts];
        if (r.error) errors.push(r.error);
      } else {
        errors.push("X/Twitter: APIFY_API_TOKEN 또는 TWITTER_BEARER_TOKEN 필요");
      }
    }

    // Instagram
    if (platform === "instagram" || platform === "all") {
      if (hasApify) {
        const r = await fetchInstagram(keywords, maxItems);
        posts = [...posts, ...r.posts];
        if (r.error) errors.push(r.error);
      } else {
        errors.push("Instagram: APIFY_API_TOKEN 필요");
      }
    }

    // Naver Blog
    if (platform === "naver_blog" || platform === "all") {
      if (hasNaver) {
        const r = await fetchNaverBlog(keywords, maxItems, dateFrom, dateTo);
        posts = [...posts, ...r.posts];
        if (r.error) errors.push(r.error);
      } else {
        errors.push("Naver Blog: NAVER_CLIENT_ID / NAVER_CLIENT_SECRET 필요");
      }
    }

    // 날짜 필터 (Naver Blog 제외 — 이미 적용됨)
    if (dateFrom || dateTo) {
      posts = posts.filter(p => {
        if (!p.date || p.platform === "naver_blog") return true;
        const d = p.date.slice(0, 10);
        if (dateFrom && d < dateFrom) return false;
        if (dateTo   && d > dateTo)   return false;
        return true;
      });
    }

    posts.sort((a, b) => b.date?.localeCompare(a.date || "") || 0);

    return NextResponse.json({
      posts,
      total: posts.length,
      platform,
      keywords,
      fetchedAt: new Date().toISOString(),
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (e: any) {
    console.error("[Social Crawl]", e);
    return NextResponse.json({ error: e.message || "알 수 없는 오류" }, { status: 500 });
  }
}
