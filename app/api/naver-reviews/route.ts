import { NextRequest, NextResponse } from "next/server";
import { ApifyClient } from "apify-client";

const apifyClient = new ApifyClient({ token: process.env.APIFY_API_TOKEN });

// ─── 단축 URL 해제 ─────────────────────────────────────────────────────
async function resolveUrl(url: string): Promise<string> {
  // naver.me 또는 다른 단축 URL은 리다이렉트를 따라 실제 URL 획득
  if (!url.includes("naver.me") && !url.includes("me.naver.com")) return url;
  try {
    const res = await fetch(url, {
      method: "HEAD",
      redirect: "follow",
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
      },
    });
    // fetch follows redirects automatically; res.url is the final URL
    return res.url || url;
  } catch {
    return url;
  }
}

// ─── 장소 ID 추출 ──────────────────────────────────────────────────────
function extractPlaceId(url: string): string | null {
  const patterns = [
    /\/entry\/place\/(\d+)/,
    /\/place\/(\d+)/,
    /\/restaurant\/(\d+)/,
    /\/cafe\/(\d+)/,
    /\/beauty\/(\d+)/,
    /\/hairshop\/(\d+)/,
    /\/hospital\/(\d+)/,
    /\/pharmacy\/(\d+)/,
    /[?&]entry=place&id=(\d+)/,
    /v5\/entry\/place\/(\d+)/,
    /\/(\d{8,12})(?:[/?#]|$)/,  // 8~12자리 숫자 ID (마지막 폴백)
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m) return m[1];
  }
  return null;
}

// ─── 네이버 GraphQL 단일 페이지 요청 ─────────────────────────────────
// 실제 Naver Place API 스키마에 맞는 쿼리 (테스트로 확인된 필드명 사용)
const GQL_QUERY = `query getVisitorReviews($input: VisitorReviewsInput) {
  visitorReviews(input: $input) {
    total
    items {
      id
      body
      rating
      visited
      created
      author { nickname }
      visitKeywords { keywords }
      __typename
    }
    __typename
  }
}`;

// 인증 없이는 display 최대 50건이 가능 (item offset 페이지네이션은 미지원)
async function fetchNaverGQLPage(
  placeId: string,
  offset: number,
  display = 50
): Promise<{ items: any[]; total: number } | null> {
  try {
    const body = JSON.stringify([{
      operationName: "getVisitorReviews",
      variables: {
        input: {
          businessId: placeId,
          businessType: "place",
          item: String(offset),
          page: 1,
          display,
        },
      },
      query: GQL_QUERY,
    }]);

    const res = await fetch("https://pcmap-api.place.naver.com/place/graphql", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Referer": `https://pcmap.place.naver.com/place/${placeId}/review/visitor`,
        "Origin": "https://pcmap.place.naver.com",
        "Accept": "*/*",
        "Accept-Language": "ko-KR,ko;q=0.9",
        "sec-fetch-site": "same-site",
        "sec-fetch-mode": "cors",
      },
      body,
    });

    if (!res.ok) {
      console.log(`[GQL page offset=${offset}] HTTP ${res.status}`);
      return null;
    }
    const data = await res.json();
    const vr = data?.[0]?.data?.visitorReviews;
    if (!vr) {
      console.log(`[GQL page offset=${offset}] No visitorReviews in response`, JSON.stringify(data).slice(0, 200));
      return null;
    }
    console.log(`[GQL page offset=${offset}] items=${vr.items?.length ?? 0} total=${vr.total}`);
    return { items: vr.items || [], total: vr.total || 0 };
  } catch (e: any) {
    console.log(`[GQL page offset=${offset}] Error: ${e.message}`);
    return null;
  }
}

// ─── 네이버 GraphQL API — 단일 배치 수집 (인증 없이 max 50건) ─────────
async function fetchViaNaverGraphQL(
  placeId: string
): Promise<{ reviews: any[]; total: number; textTotal: number } | null> {
  // 인증 없는 요청은 display=50이 최대 (item offset 페이지네이션 미지원)
  const first = await fetchNaverGQLPage(placeId, 0, 50);
  if (!first || first.items.length === 0) return null;

  console.log(`[GQL] collected=${first.items.length} declaredTotal=${first.total}`);

  // 텍스트 or 키워드가 있는 리뷰만 포함
  const reviews = first.items
    .map((r: any) => ({
      text: r.body || "",
      date: r.visited || r.created || "",
      rating: r.rating ?? 5,
      // visitKeywords: [{ keywords: string[] }] 구조
      keywords: (r.visitKeywords || [])
        .flatMap((k: any) => Array.isArray(k.keywords) ? k.keywords : (k.keywords ? [k.keywords] : []))
        .filter(Boolean),
      author: r.author?.nickname || "익명",
    }))
    .filter((r: any) => r.text.trim() || r.keywords.length > 0);

  const textTotal = reviews.filter(r => r.text.trim()).length;
  const total = first.total || first.items.length;

  return reviews.length > 0 ? { reviews, total, textTotal } : null;
}

// ─── __NEXT_DATA__ 파싱 시도 ──────────────────────────────────────────
async function fetchViaPageParsing(placeId: string): Promise<{ reviews: any[]; total: number } | null> {
  try {
    const url = `https://m.place.naver.com/place/${placeId}/review/visitor`;
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Language": "ko-KR,ko;q=0.9",
        "Referer": "https://map.naver.com/",
      },
    });
    if (!res.ok) return null;

    const html = await res.text();

    // __NEXT_DATA__ 파싱
    const nextMatch = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
    if (nextMatch) {
      const nextData = JSON.parse(nextMatch[1]);
      const pageProps = nextData?.props?.pageProps;
      const candidates = [
        pageProps?.initialReviews,
        pageProps?.reviews,
        pageProps?.reviewData,
        pageProps?.data?.reviews,
        pageProps?.initialState?.reviews,
      ];
      for (const candidate of candidates) {
        const arr = candidate?.items || candidate?.list || (Array.isArray(candidate) ? candidate : null);
        if (arr?.length > 0) {
          return {
            total: candidate?.total || arr.length,
            reviews: arr.map((r: any) => ({
              text: r.body || r.content || r.text || "",
              date: r.created || r.visited || r.date || "",
              rating: r.rating ?? r.starGrade ?? 5,
              keywords: (r.keywords || []).map((k: any) => k.text || k),
              author: r.authorName || r.author || "익명",
            })).filter((r: any) => r.text.trim()),
          };
        }
      }
    }

    // 단순 텍스트 패턴으로 리뷰 내용 추출 시도
    const reviewTexts = [...html.matchAll(/"body"\s*:\s*"([^"]{10,})"/g)];
    if (reviewTexts.length > 0) {
      return {
        total: reviewTexts.length,
        reviews: reviewTexts.map(m => ({
          text: m[1].replace(/\\n/g, " ").replace(/\\"/g, '"'),
          date: "",
          rating: 5,
          keywords: [],
          author: "익명",
        })),
      };
    }

    return null;
  } catch {
    return null;
  }
}

// ─── Apify 시도 ──────────────────────────────────────────────────────
async function fetchViaApify(placeUrl: string): Promise<{ reviews: any[]; total: number } | null> {
  if (!process.env.APIFY_API_TOKEN) return null;
  try {
    // epctex/naver-place-scraper 또는 유사한 액터 사용
    const run = await apifyClient.actor("epctex/naver-place-scraper").call({
      startUrls: [{ url: placeUrl }],
      maxItems: 30,
      proxyConfiguration: { useApifyProxy: true },
    });

    const { items } = await apifyClient.dataset(run.defaultDatasetId).listItems();
    const reviews: any[] = [];

    for (const item of items) {
      const reviewList = (item as any)?.reviews || (item as any)?.visitorReviews || [];
      for (const r of reviewList) {
        reviews.push({
          text: r.body || r.text || r.content || "",
          date: r.created || r.visited || r.date || "",
          rating: r.rating ?? 5,
          keywords: (r.keywords || []).map((k: any) => k.text || k),
          author: r.authorName || r.author || "익명",
        });
      }
    }

    if (reviews.length > 0) {
      return { reviews, total: reviews.length };
    }
    return null;
  } catch {
    return null;
  }
}

// ─── 네이버 블로그 리뷰 GraphQL 쿼리 ──────────────────────────────────
const BLOG_GQL_QUERY = `query getNaverBlogReviews($input: BlogReviewsInput) {
  blogReviews(input: $input) {
    total
    items {
      id
      title
      body
      blogName
      thumbnailUrl
      url
      created
      author { nickname }
      __typename
    }
    __typename
  }
}`;

async function fetchNaverBlogReviews(
  placeId: string,
  display = 50
): Promise<{ items: any[]; total: number } | null> {
  try {
    const body = JSON.stringify([{
      operationName: "getNaverBlogReviews",
      variables: {
        input: {
          businessId: placeId,
          businessType: "place",
          page: 1,
          display,
        },
      },
      query: BLOG_GQL_QUERY,
    }]);

    const res = await fetch("https://pcmap-api.place.naver.com/place/graphql", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Referer": `https://pcmap.place.naver.com/place/${placeId}/review/blog`,
        "Origin": "https://pcmap.place.naver.com",
        "Accept": "*/*",
        "Accept-Language": "ko-KR,ko;q=0.9",
        "sec-fetch-site": "same-site",
        "sec-fetch-mode": "cors",
      },
      body,
    });

    if (!res.ok) return null;
    const data = await res.json();
    const br = data?.[0]?.data?.blogReviews;
    if (!br) {
      console.log(`[BlogGQL] No blogReviews in response`, JSON.stringify(data).slice(0, 200));
      return null;
    }
    console.log(`[BlogGQL] items=${br.items?.length ?? 0} total=${br.total}`);
    return { items: br.items || [], total: br.total || 0 };
  } catch (e: any) {
    console.log(`[BlogGQL] Error: ${e.message}`);
    return null;
  }
}

// ─── Route Handler ────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const { url, reviewType = "visitor" } = await req.json();
    if (!url) {
      return NextResponse.json({ error: "URL이 필요합니다." }, { status: 400 });
    }

    // 단축 URL(naver.me) 처리: 리다이렉트 따라가서 실제 URL 획득
    const resolvedUrl = await resolveUrl(url);
    console.log(`[Naver Reviews] Resolved URL: ${resolvedUrl}`);

    const placeId = extractPlaceId(resolvedUrl);
    if (!placeId) {
      return NextResponse.json({
        error: `URL에서 장소 ID를 찾을 수 없습니다. (확인된 URL: ${resolvedUrl}) 네이버 지도에서 장소를 직접 열고 주소창의 URL을 복사해주세요.`,
      }, { status: 400 });
    }

    console.log(`[Naver Reviews] Fetching ${reviewType} reviews for place ID: ${placeId}`);

    // ── 블로그 리뷰 처리 ──
    if (reviewType === "blog") {
      const blogResult = await fetchNaverBlogReviews(placeId, 50);
      if (blogResult && blogResult.items.length > 0) {
        const blogReviews = blogResult.items.map((r: any) => ({
          id: r.id,
          title: r.title || "",
          text: r.body || r.title || "",
          blogName: r.blogName || r.author?.nickname || "블로거",
          url: r.url || "",
          thumbnailUrl: r.thumbnailUrl || "",
          date: r.created || "",
          keywords: [] as string[],
        }));
        console.log(`[Naver Blog] ✅ ${blogReviews.length}건 / total: ${blogResult.total}`);
        return NextResponse.json({
          placeId,
          reviewType: "blog",
          reviews: blogReviews,
          total: blogResult.total,
          source: "graphql",
        });
      }
      return NextResponse.json({
        error: "블로그 리뷰를 가져올 수 없습니다. 직접 복사·붙여넣기 기능을 이용해주세요.",
      }, { status: 422 });
    }

    // ── 방문자 리뷰 처리 (기존 로직) ──

    // 1차: 네이버 GraphQL API 직접 호출 (전체 페이지 수집)
    const gqlResult = await fetchViaNaverGraphQL(placeId);
    if (gqlResult && gqlResult.reviews.length > 0) {
      console.log(`[Naver Reviews] ✅ GraphQL: ${gqlResult.reviews.length} (text: ${gqlResult.textTotal}) / total: ${gqlResult.total}`);
      return NextResponse.json({ placeId, reviews: gqlResult.reviews, total: gqlResult.total, textTotal: gqlResult.textTotal, source: "graphql" });
    }

    // 2차: 페이지 HTML 파싱
    const pageResult = await fetchViaPageParsing(placeId);
    if (pageResult && pageResult.reviews.length > 0) {
      console.log(`[Naver Reviews] ✅ Page parsing: ${pageResult.reviews.length} reviews`);
      return NextResponse.json({ placeId, ...pageResult, source: "page" });
    }

    // 3차: Apify
    const apifyResult = await fetchViaApify(resolvedUrl);
    if (apifyResult && apifyResult.reviews.length > 0) {
      console.log(`[Naver Reviews] ✅ Apify: ${apifyResult.reviews.length} reviews`);
      return NextResponse.json({ placeId, ...apifyResult, source: "apify" });
    }

    return NextResponse.json({
      error: "리뷰를 가져올 수 없습니다. 네이버 정책으로 인해 접근이 제한될 수 있습니다. 직접 리뷰를 복사하여 붙여넣기 기능을 이용해주세요.",
    }, { status: 422 });

  } catch (e: any) {
    console.error("[Naver Reviews] Error:", e);
    return NextResponse.json({ error: e.message || "알 수 없는 오류" }, { status: 500 });
  }
}
