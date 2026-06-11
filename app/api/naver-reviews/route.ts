import { NextRequest, NextResponse } from "next/server";
import { ApifyClient } from "apify-client";

export const maxDuration = 60;

const apify = process.env.APIFY_API_TOKEN
  ? new ApifyClient({ token: process.env.APIFY_API_TOKEN })
  : null;

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

// ─── GraphQL 공통 호출 ────────────────────────────────────────────────
async function naverGraphQL(placeId: string, query: string, variables: object): Promise<any> {
  const headers = {
    "Content-Type": "application/json",
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Referer": `https://pcmap.place.naver.com/place/${placeId}/review`,
    "Origin": "https://pcmap.place.naver.com",
    "Accept-Language": "ko-KR,ko;q=0.9",
  };
  const res = await fetch("https://pcmap-api.place.naver.com/place/graphql", {
    method: "POST",
    headers,
    body: JSON.stringify([{ operationName: query, variables, query: GQL_MAP[query] }]),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return data?.[0]?.data;
}

const GQL_MAP: Record<string, string> = {
  getVisitorReviews: `query getVisitorReviews($input: VisitorReviewsInput) {
    visitorReviews(input: $input) {
      total items { id body rating visited created author { nickname } visitKeywords { keywords } }
    }
  }`,
  getNaverBlogReviews: `query getNaverBlogReviews($input: BlogReviewsInput) {
    blogReviews(input: $input) {
      total items { id title body blogName thumbnailUrl url created author { nickname } }
    }
  }`,
};

// ─── 방문자 리뷰 — GraphQL 직접 ──────────────────────────────────────
async function fetchVisitorGraphQL(placeId: string) {
  try {
    const data = await naverGraphQL(placeId, "getVisitorReviews", {
      input: { businessId: placeId, businessType: "place", item: "0", page: 1, display: 50 },
    });
    const vr = data?.visitorReviews;
    if (!vr?.items?.length) return null;
    const reviews = vr.items
      .map((r: any) => ({
        text: r.body || "",
        date: r.visited || r.created || "",
        rating: r.rating ?? 5,
        keywords: (r.visitKeywords || [])
          .flatMap((k: any) => Array.isArray(k.keywords) ? k.keywords : (k.keywords ? [k.keywords] : []))
          .filter(Boolean),
        author: r.author?.nickname || "익명",
      }))
      .filter((r: any) => r.text.trim() || r.keywords.length > 0);
    return reviews.length > 0 ? { reviews, total: vr.total } : null;
  } catch { return null; }
}

// ─── 블로그 리뷰 — GraphQL 직접 ──────────────────────────────────────
async function fetchBlogGraphQL(placeId: string) {
  try {
    const data = await naverGraphQL(placeId, "getNaverBlogReviews", {
      input: { businessId: placeId, businessType: "place", page: 1, display: 50 },
    });
    const br = data?.blogReviews;
    if (!br?.items?.length) return null;
    return {
      total: br.total,
      posts: br.items.map((r: any) => ({
        id: r.id,
        title: r.title || "",
        text: r.body || "",
        blogName: r.blogName || r.author?.nickname || "블로거",
        url: r.url || "",
        thumbnailUrl: r.thumbnailUrl || "",
        date: r.created || "",
        keywords: [],
      })),
    };
  } catch { return null; }
}

// ─── Apify — 방문자 리뷰 (프록시 우회) ──────────────────────────────
async function fetchVisitorApify(placeId: string, placeUrl: string) {
  if (!apify) return null;
  try {
    console.log("[Apify] Starting naver-place-scraper...");
    const run = await apify.actor("epctex/naver-place-scraper").call(
      {
        startUrls: [{ url: `https://map.naver.com/p/entry/place/${placeId}` }],
        maxItems: 100,
        reviewsCount: 50,
        scrapeReviews: true,
        proxyConfiguration: { useApifyProxy: true, apifyProxyGroups: ["RESIDENTIAL"] },
      },
      { waitSecs: 55 }
    );
    const { items } = await apify.dataset(run.defaultDatasetId).listItems();
    console.log(`[Apify] Got ${items.length} items, keys: ${items[0] ? Object.keys(items[0]).join(",") : "none"}`);

    const reviews: any[] = [];
    for (const item of items) {
      const src = item as any;
      const list =
        src.reviews ||
        src.visitorReviews ||
        src.reviewList ||
        src.placeReviews ||
        [];
      for (const r of list) {
        reviews.push({
          text: r.body || r.text || r.content || r.reviewBody || "",
          date: r.created || r.visited || r.date || r.createdAt || "",
          rating: r.rating ?? r.score ?? 5,
          keywords: (r.keywords || r.visitKeywords || []).map((k: any) => k.text || k.name || k).filter(Boolean),
          author: r.authorName || r.nickname || r.author?.nickname || "익명",
        });
      }
    }
    if (reviews.length > 0) {
      console.log(`[Apify] ✅ ${reviews.length} visitor reviews`);
      return { reviews, total: reviews.length };
    }
    // 데이터 구조 디버깅용 로그
    if (items.length > 0) {
      console.log("[Apify] Item sample:", JSON.stringify(items[0]).slice(0, 500));
    }
    return null;
  } catch (e: any) {
    console.warn("[Apify] visitor error:", e.message);
    return null;
  }
}

// ─── 장소명 추출 ─────────────────────────────────────────────────────
async function fetchPlaceName(placeId: string): Promise<string> {
  try {
    const res = await fetch(`https://m.place.naver.com/place/${placeId}`, {
      headers: { "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15" },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return "";
    const html = await res.text();
    const ogTitle = html.match(/<meta property="og:title" content="([^"]+)"/)?.[1];
    if (ogTitle) return ogTitle.split(" : ")[0].trim();
    const title = html.match(/<title[^>]*>([^<]+)<\/title>/)?.[1];
    if (title) return title.split(" : ")[0].split(" - ")[0].trim();
  } catch {}
  return "";
}

// ─── Naver Blog Search API (공식 폴백) ───────────────────────────────
async function fetchBlogSearchAPI(placeId: string): Promise<{ posts: any[]; total: number; searchQuery: string } | null> {
  const clientId = process.env.NAVER_CLIENT_ID;
  const clientSecret = process.env.NAVER_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  const placeName = await fetchPlaceName(placeId);
  if (!placeName) return null;
  console.log(`[Blog Fallback] 장소명 "${placeName}" → Naver Blog Search API`);

  try {
    const params = new URLSearchParams({ query: placeName, display: "50", sort: "date" });
    const res = await fetch(`https://openapi.naver.com/v1/search/blog.json?${params}`, {
      headers: { "X-Naver-Client-Id": clientId, "X-Naver-Client-Secret": clientSecret },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.items?.length) return null;
    return {
      total: data.total,
      searchQuery: placeName,
      posts: data.items.map((item: any) => ({
        id: item.link,
        title: item.title.replace(/<\/?b>/g, ""),
        text: item.description.replace(/<\/?b>/g, ""),
        blogName: item.bloggername || "블로거",
        url: item.link,
        thumbnailUrl: "",
        date: item.postdate
          ? `${item.postdate.slice(0, 4)}-${item.postdate.slice(4, 6)}-${item.postdate.slice(6, 8)}`
          : "",
        keywords: [],
      })),
    };
  } catch { return null; }
}

// ─── Route Handler ────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const { url, reviewType = "visitor" } = await req.json();
    if (!url) return NextResponse.json({ error: "URL이 필요합니다." }, { status: 400 });

    const placeId = extractPlaceId(url);
    if (!placeId) {
      return NextResponse.json({
        error: "URL에서 장소 ID를 찾을 수 없습니다. 네이버 지도에서 장소를 열고 주소창 URL을 복사해주세요.",
      }, { status: 400 });
    }

    console.log(`[NaverReviews] type=${reviewType} placeId=${placeId}`);

    // ── 블로그 리뷰 ──────────────────────────────────────────────────
    if (reviewType === "blog") {
      // 1차: GraphQL 직접 (성공 시 place 페이지 연결 블로그 포스트)
      const gql = await fetchBlogGraphQL(placeId);
      if (gql && gql.posts.length > 0) {
        return NextResponse.json({ placeId, reviewType: "blog", source: "graphql", reviews: gql.posts, total: gql.total });
      }
      // 2차: Naver Blog Search API (장소명 자동 감지)
      const search = await fetchBlogSearchAPI(placeId);
      if (search && search.posts.length > 0) {
        return NextResponse.json({
          placeId, reviewType: "blog", source: "naver_blog_api",
          reviews: search.posts, total: search.total, searchQuery: search.searchQuery,
        });
      }

      const hasToken = !!process.env.APIFY_API_TOKEN;
      const hasNaverApi = !!(process.env.NAVER_CLIENT_ID && process.env.NAVER_CLIENT_SECRET);
      return NextResponse.json({
        error: !hasNaverApi
          ? "NAVER_CLIENT_ID / NAVER_CLIENT_SECRET 환경 변수가 필요합니다. Vercel 환경 변수를 확인해주세요."
          : hasToken
          ? "블로그 리뷰를 가져오지 못했습니다. 네이버가 서버 접근을 차단했습니다. 잠시 후 다시 시도해주세요."
          : "블로그 리뷰를 가져오지 못했습니다. 네이버 IP 차단으로 직접 접근이 제한됩니다.",
      }, { status: 422 });
    }

    // ── 방문자 리뷰 ──────────────────────────────────────────────────
    // 1차: GraphQL 직접
    const gql = await fetchVisitorGraphQL(placeId);
    if (gql && gql.reviews.length > 0) {
      console.log(`[Visitor] ✅ GraphQL ${gql.reviews.length}건`);
      return NextResponse.json({ placeId, ...gql, textTotal: gql.reviews.filter((r: any) => r.text.trim()).length });
    }

    // 2차: Apify (프록시 우회)
    const apifyResult = await fetchVisitorApify(placeId, url);
    if (apifyResult && apifyResult.reviews.length > 0) {
      return NextResponse.json({ placeId, ...apifyResult, textTotal: apifyResult.reviews.filter((r: any) => r.text.trim()).length });
    }

    return NextResponse.json({
      error: apify
        ? "방문자 리뷰를 가져오지 못했습니다. 네이버 IP 차단으로 서버 접근이 제한됩니다. 잠시 후 다시 시도하거나 리뷰를 직접 복사해 붙여넣기를 이용해주세요."
        : "APIFY_API_TOKEN 환경 변수가 필요합니다. Vercel 환경 변수에서 Apify 토큰을 설정해주세요.",
    }, { status: 422 });

  } catch (e: any) {
    console.error("[NaverReviews] Error:", e);
    return NextResponse.json({ error: e.message || "알 수 없는 오류" }, { status: 500 });
  }
}
