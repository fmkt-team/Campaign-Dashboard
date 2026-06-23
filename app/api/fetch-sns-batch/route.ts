import { NextResponse } from "next/server";
import { ApifyClient } from "apify-client";

export const maxDuration = 60;

const apify = new ApifyClient({ token: process.env.APIFY_API_TOKEN });

interface BatchRequest {
  items: Array<{ url: string; uploadDate?: string; index: number }>;
}

interface BatchStats {
  views: number; likes: number; comments: number;
  title: string; date?: string; thumbnailUrl?: string;
  description?: string; platform?: string;
}

interface BatchResult {
  index: number; url: string; success: boolean; stats?: BatchStats;
}

async function oembedInstagram(url: string): Promise<BatchStats | null> {
  try {
    const res = await fetch(
      `https://api.instagram.com/oembed?url=${encodeURIComponent(url)}&format=json`,
      { signal: AbortSignal.timeout(6000) }
    );
    if (!res.ok) return null;
    const d = await res.json();
    if (!d || d.error) return null;
    return {
      views: 0, likes: 0, comments: 0,
      title: d.title || (d.author_name ? `@${d.author_name}` : "-"),
      thumbnailUrl: d.thumbnail_url || undefined,
      platform: "Instagram",
    };
  } catch { return null; }
}

export async function POST(req: Request) {
  try {
    const { items }: BatchRequest = await req.json();
    if (!items?.length) return NextResponse.json({ results: [] });

    const instagramItems = items.filter(i => /instagram\.com/.test(i.url));
    const results: BatchResult[] = [];

    if (!instagramItems.length) {
      return NextResponse.json({ results: [] });
    }

    // Apify로 모든 Instagram URL을 한 번에 처리
    if (process.env.APIFY_API_TOKEN) {
      try {
        console.log(`[Batch Instagram] Apify 실행: ${instagramItems.length}개 URL`);
        const run = await apify.actor("apify/instagram-scraper").call(
          {
            directUrls: instagramItems.map(i => i.url),
            resultsType: "posts",
            resultsLimit: instagramItems.length + 5,
            addParentData: false,
          },
          { waitSecs: 50, memory: 1024 }
        );
        const { items: scraped } = await apify.dataset(run.defaultDatasetId).listItems();
        console.log(`[Batch Instagram] 결과: ${(scraped as any[]).length}개`);

        // URL 기준으로 결과 매핑 (shortCode 포함)
        const byShortCode: Record<string, any> = {};
        const byUrl: Record<string, any> = {};
        for (const item of scraped as any[]) {
          if (item.shortCode) byShortCode[item.shortCode] = item;
          if (item.url) byUrl[item.url] = item;
        }

        for (const input of instagramItems) {
          // shortCode로 매칭 시도
          const scMatch = input.url.match(/\/(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)/);
          const sc = scMatch?.[1];
          const item = (sc && byShortCode[sc]) || byUrl[input.url] || null;

          if (item) {
            const caption = item.caption || item.text || item.alt || "";
            results.push({
              index: input.index, url: input.url, success: true,
              stats: {
                views:        item.videoViewCount || item.videoPlayCount || item.playsCount || 0,
                likes:        typeof item.likesCount === "number" ? item.likesCount : (item.likes ?? 0),
                comments:     item.commentsCount ?? item.comments ?? 0,
                title:        caption ? caption.substring(0, 80) + (caption.length > 80 ? "…" : "") : "-",
                date:         item.timestamp ? new Date(item.timestamp).toISOString().split("T")[0] : undefined,
                thumbnailUrl: item.displayUrl || item.thumbnailUrl || item.imageUrl,
                description:  caption || undefined,
                platform:     "Instagram",
              },
            });
          } else {
            // Apify 결과에 없으면 oEmbed 폴백
            const oe = await oembedInstagram(input.url);
            results.push({ index: input.index, url: input.url, success: !!oe, stats: oe || undefined });
          }
        }
        return NextResponse.json({ results });
      } catch (e: any) {
        console.warn("[Batch Instagram] Apify 실패:", e?.message, "→ oEmbed 폴백");
      }
    }

    // Apify 실패 또는 토큰 없음 → 모두 oEmbed
    const oembedResults = await Promise.all(
      instagramItems.map(async input => {
        const oe = await oembedInstagram(input.url);
        return { index: input.index, url: input.url, success: !!oe, stats: oe || undefined };
      })
    );
    return NextResponse.json({ results: oembedResults });
  } catch (e: any) {
    console.error("[fetch-sns-batch]:", e);
    return NextResponse.json({ results: [], error: e.message }, { status: 500 });
  }
}
