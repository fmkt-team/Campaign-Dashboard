import { NextRequest, NextResponse } from "next/server";
import { ApifyClient } from "apify-client";

export const maxDuration = 60;

const apifyClient = new ApifyClient({ token: process.env.APIFY_API_TOKEN });

// ─── 장소 ID 추출 ──────────────────────────────────────────────────────
function extractPlaceId(url: string): string | null {
  const patterns = [
    /\/entry\/place\/(\d+)/,
    /\/place\/(\d+)/,
    /\/restaurant\/(\d+)/,
    /\/cafe\/(\d+)/,
    /[?&]entry=place&id=(\d+)/,
    /\/(\d{8,12})(?:[/?#]|$)/,
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m) return m[1];
  }
  return null;
}

// ─── 장소명 추출 (블로그 검색 쿼리 생성용) ──────────────────────────
async function fetchPlaceName(placeId: string): Promise<string> {
  try {
    const urls = [
      `https://m.place.naver.com/place/${placeId}`,
      `https://pcmap.place.naver.com/place/${placeId}`,
    ];
    for (const url of urls) {
      const res = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15",
          "Accept-Language": "ko-KR,ko;q=0.9",
        },
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) continue;
      const html = await res.text();

      // og:title 또는 <title> 에서 장소명 추출
      const ogTitle = html.match(/<meta property="og:title" content="([^"]+)"/)?.[1];
      if (ogTitle) return ogTitle.split(" : ")[0].trim();

      const title = html.match(/<title[^>]*>([^<]+)<\/title>/)?.[1];
      if (title) return title.split(" : ")[0].split(" - ")[0].trim();
    }
  } catch {}
  return "";
}

// ─── 네이버 GraphQL 방문자 리뷰 ─────────────────────────────────────
async function fetchViaNaverGraphQL(placeId: string): Promise<{ reviews: any[]; total: number } | null> {
  const GQL_QUERY = `query getVisitorReviews($input: VisitorReviewsInput) {
    visitorReviews(input: $input) {
      total
      items {
        id body rating visited created
        author { nickname }
        visitKeywords { keywords }
      }
    }
  }`;
  try {
    const res = await fetch("https://pcmap-api.place.naver.com/place/graphql", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Referer": `https://pcmap.place.naver.com/place/${placeId}/review/visitor`,
        "Origin": "https://pcmap.place.naver.com",
        "Accept-Language": "ko-KR,ko;q=0.9",
        "sec-fetch-site": "same-site",
        "sec-fetch-mode": "cors",
      },
      body: JSON.stringify([{
        operationName: "getVisitorReviews",
        variables: { input: { businessId: placeId, businessType: "place", item: "0", page: 1, display: 50 } },
        query: GQL_QUERY,
      }]),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const vr = data?.[0]?.data?.visitorReviews;
    if (!vr?.items?.length) return null;

    const reviews = vr.items
      .map((r: any) => ({
        text: r.body || "",
        date: r.visited || r.created || "",
        rating: r.rating ?? 5,
        keywords: (r.visitKeywords || []).flatMap((k: any) =>
          Array.isArray(k.keywords) ? k.keywords : (k.keywords ? [k.keywords] : [])
        ).filter(Boolean),
        author: r.author?.nickname || "익명",
      }))
      .filter((r: any) => r.text.trim() || r.keywords.length > 0);

    return reviews.length > 0 ? { reviews, total: vr.total || reviews.length } : null;
  } catch {
    return null;
  }
}

// ─── Apify — 방문자 리뷰 ─────────────────────────────────────────────
async function fetchVisitorViaApify(placeId: string, placeUrl: string): Promise<{ reviews: any[]; total: number } | null> {
  if (!process.env.APIFY_API_TOKEN) return null;

  // epctex/naver-place-scraper 시도
  const actors = [
    {
      id: "epctex/naver-place-scraper",
      input: {
        startUrls: [{ url: `https://map.naver.com/p/entry/place/${placeId}` }],
        maxItems: 100,
        reviewsCount: 50,
        proxyConfiguration: { useApifyProxy: true },
      },
    },
    {
      id: "epctex/naver-place-scraper",
      input: {
        startUrls: [{ url: placeUrl }],
        maxItems: 50,
        proxyConfiguration: { useApifyProxy: true },
      },
    },
  ];

  for (const actor of actors) {
    try {
      console.log(`[Apify] Trying actor: ${actor.id}`);
      const run = await apifyClient.actor(actor.id).call(actor.input, { waitSecs: 50 });
      const { items } = await apifyClient.dataset(run.defaultDatasetId).listItems();

      const reviews: any[] = [];
      for (const item of items) {
        const reviewList = (item as any)?.reviews || (item as any)?.visitorReviews || [];
        for (const r of reviewList) {
          reviews.push({
            text: r.body || r.text || r.content || "",
            date: r.created || r.visited || r.date || "",
            rating: r.rating ?? 5,
            keywords: (r.keywords || []).map((k: any) => k.text || k).filter(Boolean),
            author: r.authorName || r.author?.nickname || "익명",
          });
        }
      }

      if (reviews.length > 0) {
        console.log(`[Apify] ✅ ${actor.id}: ${reviews.length}건`);
        return { reviews, total: reviews.length };
      }
    } catch (e: any) {
      console.warn(`[Apify] ${actor.id} failed: ${e.message}`);
    }
  }
  return null;
}

// ─── 네이버 Blog Search API (공식) ──────────────────────────────────
async function fetchBlogViaNaverSearchAPI(searchQuery: string, display = 100): Promise<{ posts: any[]; total: number } | null> {
  const clientId = process.env.NAVER_CLIENT_ID;
  const clientSecret = process.env.NAVER_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  try {
    const params = new URLSearchParams({ query: searchQuery, display: String(display), sort: "date" });
    const res = await fetch(`https://openapi.naver.com/v1/search/blog.json?${params}`, {
      headers: {
        "X-Naver-Client-Id": clientId,
        "X-Naver-Client-Secret": clientSecret,
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      console.log(`[NaverBlogAPI] HTTP ${res.status}`, await res.text());
      return null;
    }
    const data = await res.json();
    if (!data.items?.length) return null;

    const posts = data.items.map((item: any) => ({
      id: item.link,
      title: item.title.replace(/<\/?b>/g, ""),
      text: item.description.replace(/<\/?b>/g, ""),
      blogName: item.bloggername || "블로거",
      url: item.link,
      thumbnailUrl: "",
      date: item.postdate ? `${item.postdate.slice(0, 4)}-${item.postdate.slice(4, 6)}-${item.postdate.slice(6, 8)}` : "",
      keywords: [] as string[],
    }));

    console.log(`[NaverBlogAPI] ✅ ${posts.length}건 / total: ${data.total}`);
    return { posts, total: data.total };
  } catch (e: any) {
    console.warn(`[NaverBlogAPI] Error: ${e.message}`);
    return null;
  }
}

// ─── Apify — 블로그 리뷰 ──────────────────────────────────────────────
async function fetchBlogViaApify(placeId: string): Promise<{ posts: any[]; total: number } | null> {
  if (!process.env.APIFY_API_TOKEN) return null;
  try {
    const GQL_BLOG = `query getNaverBlogReviews($input: BlogReviewsInput) {
      blogReviews(input: $input) {
        total items { id title body blogName thumbnailUrl url created author { nickname } }
      }
    }`;
    const res = await fetch("https://pcmap-api.place.naver.com/place/graphql", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        "Referer": `https://pcmap.place.naver.com/place/${placeId}/review/blog`,
        "Origin": "https://pcmap.place.naver.com",
      },
      body: JSON.stringify([{
        operationName: "getNaverBlogReviews",
        variables: { input: { businessId: placeId, businessType: "place", page: 1, display: 50 } },
        query: GQL_BLOG,
      }]),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const br = data?.[0]?.data?.blogReviews;
    if (!br?.items?.length) return null;

    return {
      total: br.total,
      posts: br.items.map((r: any) => ({
        id: r.id,
        title: r.title || "",
        text: r.body || r.title || "",
        blogName: r.blogName || r.author?.nickname || "블로거",
        url: r.url || "",
        thumbnailUrl: r.thumbnailUrl || "",
        date: r.created || "",
        keywords: [],
      })),
    };
  } catch {
    return null;
  }
}

// ─── Route Handler ────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const { url, reviewType = "visitor", searchQuery } = await req.json();
    if (!url) {
      return NextResponse.json({ error: "URL이 필요합니다." }, { status: 400 });
    }

    const placeId = extractPlaceId(url);
    if (!placeId) {
      return NextResponse.json({
        error: `URL에서 장소 ID를 찾을 수 없습니다. 네이버 지도에서 장소를 열고 주소창 URL을 복사해주세요.`,
      }, { status: 400 });
    }

    console.log(`[Naver Reviews] type=${reviewType} placeId=${placeId}`);

    // ── 블로그 리뷰 ──────────────────────────────────────────────────
    if (reviewType === "blog") {
      // 1차: 장소명 추출 → Naver Blog Search API (공식)
      let query = searchQuery?.trim() || "";
      if (!query) {
        const placeName = await fetchPlaceName(placeId);
        query = placeName || "";
        console.log(`[Blog] 장소명 추출: "${placeName}"`);
      }

      if (query) {
        const blogResult = await fetchBlogViaNaverSearchAPI(query, 100);
        if (blogResult && blogResult.posts.length > 0) {
          return NextResponse.json({
            placeId, reviewType: "blog", source: "naver_blog_api",
            reviews: blogResult.posts,
            total: blogResult.total,
            searchQuery: query,
          });
        }
      }

      // 2차: GraphQL 시도 (IP 차단될 수 있음)
      const gqlBlog = await fetchBlogViaApify(placeId);
      if (gqlBlog && gqlBlog.posts.length > 0) {
        return NextResponse.json({
          placeId, reviewType: "blog", source: "graphql",
          reviews: gqlBlog.posts,
          total: gqlBlog.total,
        });
      }

      const hasNaverApi = !!(process.env.NAVER_CLIENT_ID && process.env.NAVER_CLIENT_SECRET);
      return NextResponse.json({
        error: hasNaverApi
          ? `블로그 리뷰 검색 결과가 없습니다. 검색어를 변경해보세요. (현재: "${query}")`
          : "NAVER_CLIENT_ID / NAVER_CLIENT_SECRET 환경 변수가 필요합니다. Vercel 환경 변수를 확인해주세요.",
      }, { status: 422 });
    }

    // ── 방문자 리뷰 ──────────────────────────────────────────────────

    // 1차: Naver GraphQL 직접 호출 (성공 시 빠름)
    const gqlResult = await fetchViaNaverGraphQL(placeId);
    if (gqlResult && gqlResult.reviews.length > 0) {
      console.log(`[Visitor] ✅ GraphQL: ${gqlResult.reviews.length}건`);
      const textTotal = gqlResult.reviews.filter(r => r.text.trim()).length;
      return NextResponse.json({ placeId, reviews: gqlResult.reviews, total: gqlResult.total, textTotal, source: "graphql" });
    }

    // 2차: Apify (프록시 우회, 1-2분 소요)
    const apifyResult = await fetchVisitorViaApify(placeId, url);
    if (apifyResult && apifyResult.reviews.length > 0) {
      console.log(`[Visitor] ✅ Apify: ${apifyResult.reviews.length}건`);
      const textTotal = apifyResult.reviews.filter((r: any) => r.text.trim()).length;
      return NextResponse.json({ placeId, ...apifyResult, textTotal, source: "apify" });
    }

    const hasApify = !!process.env.APIFY_API_TOKEN;
    return NextResponse.json({
      error: hasApify
        ? "네이버가 자동 수집을 차단했습니다. 잠시 후 다시 시도하거나 리뷰를 직접 복사하여 붙여넣기 기능을 이용해주세요."
        : "APIFY_API_TOKEN 환경 변수가 필요합니다. 방문자 리뷰 크롤링을 위해 Apify 토큰을 설정해주세요.",
    }, { status: 422 });

  } catch (e: any) {
    console.error("[Naver Reviews] Error:", e);
    return NextResponse.json({ error: e.message || "알 수 없는 오류" }, { status: 500 });
  }
}
