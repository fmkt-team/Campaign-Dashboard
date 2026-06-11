import { NextRequest, NextResponse } from "next/server";
import { request as httpsRequest } from "node:https";
import { request as httpRequest } from "node:http";
import { ProxyAgent } from "proxy-agent";

export const maxDuration = 60;

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

// ─── Apify 프록시 경유 HTTP 요청 ─────────────────────────────────────
// Naver는 서버 IP를 차단하므로, Apify 한국 주거용 프록시를 경유
async function fetchWithApifyProxy(
  targetUrl: string,
  options: { method?: string; headers?: Record<string, string>; body?: string }
): Promise<{ ok: boolean; status: number; text: () => string }> {
  const token = process.env.APIFY_API_TOKEN;
  if (!token) throw new Error("APIFY_API_TOKEN 없음");

  // 한국 주거용 IP 우선, 없으면 자동 선택
  const proxyUrls = [
    `http://groups-RESIDENTIAL,country-KR:${token}@proxy.apify.com:8000`,
    `http://groups-RESIDENTIAL:${token}@proxy.apify.com:8000`,
    `http://auto:${token}@proxy.apify.com:8000`,
  ];

  let lastErr: Error = new Error("모든 프록시 실패");
  for (const proxyUrl of proxyUrls) {
    try {
      const result = await new Promise<{ ok: boolean; status: number; body: string }>(
        (resolve, reject) => {
          const agent = new ProxyAgent(proxyUrl);
          const url = new URL(targetUrl);
          const isHttps = url.protocol === "https:";
          const reqFn = isHttps ? httpsRequest : httpRequest;

          const reqOptions = {
            host: url.hostname,
            port: url.port || (isHttps ? 443 : 80),
            path: url.pathname + url.search,
            method: options.method || "GET",
            headers: {
              "Content-Type": "application/json",
              ...options.headers,
            },
            agent,
            timeout: 30000,
          };

          const req = reqFn(reqOptions, (res) => {
            let data = "";
            res.on("data", (chunk) => (data += chunk));
            res.on("end", () =>
              resolve({ ok: (res.statusCode ?? 0) < 400, status: res.statusCode ?? 0, body: data })
            );
          });

          req.on("error", reject);
          req.on("timeout", () => { req.destroy(); reject(new Error("timeout")); });

          if (options.body) req.write(options.body);
          req.end();
        }
      );
      if (result.ok) {
        return { ok: true, status: result.status, text: () => result.body };
      }
      lastErr = new Error(`HTTP ${result.status}: ${result.body.slice(0, 200)}`);
    } catch (e: any) {
      lastErr = e;
      console.warn(`[Proxy] ${proxyUrl.split("@")[1]} 실패: ${e.message}`);
    }
  }
  throw lastErr;
}

// ─── Naver GraphQL 방문자 리뷰 (프록시 경유) ─────────────────────────
async function fetchVisitorReviews(placeId: string): Promise<{ reviews: any[]; total: number } | null> {
  const GQL = `query getVisitorReviews($input: VisitorReviewsInput) {
    visitorReviews(input: $input) {
      total
      items {
        id body rating visited created
        author { nickname }
        visitKeywords { keywords }
      }
    }
  }`;

  const makeRequest = async (useProxy: boolean) => {
    const body = JSON.stringify([{
      operationName: "getVisitorReviews",
      variables: { input: { businessId: placeId, businessType: "place", item: "0", page: 1, display: 50 } },
      query: GQL,
    }]);
    const headers = {
      "Content-Type": "application/json",
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      "Referer": `https://pcmap.place.naver.com/place/${placeId}/review/visitor`,
      "Origin": "https://pcmap.place.naver.com",
      "Accept-Language": "ko-KR,ko;q=0.9",
    };

    let resText: string;
    if (useProxy) {
      const res = await fetchWithApifyProxy(
        "https://pcmap-api.place.naver.com/place/graphql",
        { method: "POST", headers, body }
      );
      resText = res.text();
    } else {
      const res = await fetch("https://pcmap-api.place.naver.com/place/graphql", {
        method: "POST", headers, body: body,
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      resText = await res.text();
    }

    const data = JSON.parse(resText);
    const vr = data?.[0]?.data?.visitorReviews;
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

    return reviews.length > 0 ? { reviews, total: vr.total || reviews.length } : null;
  };

  // 1차: 직접 호출 (빠름, IP 차단 시 실패)
  try {
    const direct = await makeRequest(false);
    if (direct) { console.log("[Visitor] ✅ Direct GraphQL"); return direct; }
  } catch {}

  // 2차: Apify 프록시 경유
  if (!process.env.APIFY_API_TOKEN) return null;
  try {
    const proxied = await makeRequest(true);
    if (proxied) { console.log("[Visitor] ✅ Proxy GraphQL"); return proxied; }
  } catch (e: any) {
    console.warn("[Visitor] Proxy failed:", e.message);
  }
  return null;
}

// ─── Naver GraphQL 블로그 리뷰 (프록시 경유) ─────────────────────────
async function fetchBlogReviews(placeId: string): Promise<{ posts: any[]; total: number } | null> {
  const GQL = `query getNaverBlogReviews($input: BlogReviewsInput) {
    blogReviews(input: $input) {
      total
      items {
        id title body blogName thumbnailUrl url created
        author { nickname }
      }
    }
  }`;

  const makeRequest = async (useProxy: boolean) => {
    const body = JSON.stringify([{
      operationName: "getNaverBlogReviews",
      variables: { input: { businessId: placeId, businessType: "place", page: 1, display: 50 } },
      query: GQL,
    }]);
    const headers = {
      "Content-Type": "application/json",
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      "Referer": `https://pcmap.place.naver.com/place/${placeId}/review/blog`,
      "Origin": "https://pcmap.place.naver.com",
      "Accept-Language": "ko-KR,ko;q=0.9",
    };

    let resText: string;
    if (useProxy) {
      const res = await fetchWithApifyProxy(
        "https://pcmap-api.place.naver.com/place/graphql",
        { method: "POST", headers, body }
      );
      resText = res.text();
    } else {
      const res = await fetch("https://pcmap-api.place.naver.com/place/graphql", {
        method: "POST", headers, body: body,
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      resText = await res.text();
    }

    const data = JSON.parse(resText);
    const br = data?.[0]?.data?.blogReviews;
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
  };

  // 1차: 직접 호출
  try {
    const direct = await makeRequest(false);
    if (direct) { console.log("[Blog] ✅ Direct GraphQL"); return direct; }
  } catch {}

  // 2차: Apify 프록시 경유
  if (!process.env.APIFY_API_TOKEN) return null;
  try {
    const proxied = await makeRequest(true);
    if (proxied) { console.log("[Blog] ✅ Proxy GraphQL"); return proxied; }
  } catch (e: any) {
    console.warn("[Blog] Proxy failed:", e.message);
  }
  return null;
}

// ─── Naver Blog Search API (공식 — 폴백) ────────────────────────────
async function fetchBlogViaSearchAPI(placeId: string): Promise<{ posts: any[]; total: number; searchQuery: string } | null> {
  const clientId = process.env.NAVER_CLIENT_ID;
  const clientSecret = process.env.NAVER_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  // 장소명 추출
  let placeName = "";
  try {
    const res = await fetch(`https://m.place.naver.com/place/${placeId}`, {
      headers: { "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15" },
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) {
      const html = await res.text();
      const ogTitle = html.match(/<meta property="og:title" content="([^"]+)"/)?.[1];
      if (ogTitle) placeName = ogTitle.split(" : ")[0].trim();
      if (!placeName) {
        const title = html.match(/<title[^>]*>([^<]+)<\/title>/)?.[1];
        if (title) placeName = title.split(" : ")[0].split(" - ")[0].trim();
      }
    }
  } catch {}

  if (!placeName) return null;
  console.log(`[Blog Fallback] 장소명 "${placeName}" → Blog Search API`);

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
    if (!url) {
      return NextResponse.json({ error: "URL이 필요합니다." }, { status: 400 });
    }

    const placeId = extractPlaceId(url);
    if (!placeId) {
      return NextResponse.json({
        error: "URL에서 장소 ID를 찾을 수 없습니다. 네이버 지도에서 장소를 열고 주소창 URL을 복사해주세요.",
      }, { status: 400 });
    }

    console.log(`[NaverReviews] type=${reviewType} placeId=${placeId}`);

    // ── 블로그 리뷰 ──────────────────────────────────────────────────
    if (reviewType === "blog") {
      // 1차: GraphQL (직접 + 프록시)
      const blogResult = await fetchBlogReviews(placeId);
      if (blogResult && blogResult.posts.length > 0) {
        return NextResponse.json({
          placeId, reviewType: "blog", source: "graphql",
          reviews: blogResult.posts,
          total: blogResult.total,
        });
      }

      // 2차: Naver Blog Search API (장소명 자동 추출)
      const searchResult = await fetchBlogViaSearchAPI(placeId);
      if (searchResult && searchResult.posts.length > 0) {
        return NextResponse.json({
          placeId, reviewType: "blog", source: "naver_blog_api",
          reviews: searchResult.posts,
          total: searchResult.total,
          searchQuery: searchResult.searchQuery,
        });
      }

      const hasToken = !!process.env.APIFY_API_TOKEN;
      const hasNaverApi = !!(process.env.NAVER_CLIENT_ID && process.env.NAVER_CLIENT_SECRET);
      return NextResponse.json({
        error: !hasToken && !hasNaverApi
          ? "APIFY_API_TOKEN 또는 NAVER_CLIENT_ID/SECRET 환경 변수가 필요합니다."
          : "블로그 리뷰를 가져오지 못했습니다. 네이버가 서버 접근을 차단했을 수 있습니다. 잠시 후 다시 시도해주세요.",
      }, { status: 422 });
    }

    // ── 방문자 리뷰 ──────────────────────────────────────────────────
    const visitorResult = await fetchVisitorReviews(placeId);
    if (visitorResult && visitorResult.reviews.length > 0) {
      const textTotal = visitorResult.reviews.filter(r => r.text.trim()).length;
      return NextResponse.json({ placeId, ...visitorResult, textTotal });
    }

    const hasToken = !!process.env.APIFY_API_TOKEN;
    return NextResponse.json({
      error: hasToken
        ? "방문자 리뷰를 가져오지 못했습니다. 네이버가 프록시 IP도 차단했거나, Apify RESIDENTIAL 프록시 크레딧이 부족할 수 있습니다."
        : "APIFY_API_TOKEN 환경 변수가 필요합니다. Apify 토큰을 Vercel 환경 변수에 설정해주세요.",
    }, { status: 422 });

  } catch (e: any) {
    console.error("[NaverReviews] Error:", e);
    return NextResponse.json({ error: e.message || "알 수 없는 오류" }, { status: 500 });
  }
}
