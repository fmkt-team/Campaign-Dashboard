import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 15;

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url");
  if (!url) return NextResponse.json({ error: "url 파라미터 필요" }, { status: 400 });

  try {
    new URL(url); // validate
  } catch {
    return NextResponse.json({ error: "유효하지 않은 URL" }, { status: 400 });
  }

  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept-Language": "ko-KR,ko;q=0.9",
        "Accept": "text/html",
      },
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) {
      return NextResponse.json({ url, title: "", text: "", thumbnailUrl: "", blogName: "" });
    }

    const html = await res.text();

    const og = (prop: string) =>
      html.match(new RegExp(`<meta[^>]+property=["']og:${prop}["'][^>]+content=["']([^"']+)["']`, "i"))?.[1] ||
      html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:${prop}["']`, "i"))?.[1] ||
      "";

    const meta = (name: string) =>
      html.match(new RegExp(`<meta[^>]+name=["']${name}["'][^>]+content=["']([^"']+)["']`, "i"))?.[1] ||
      html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+name=["']${name}["']`, "i"))?.[1] ||
      "";

    const title =
      og("title") ||
      meta("title") ||
      html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim() ||
      "";

    const text = og("description") || meta("description") || "";
    const thumbnailUrl = og("image") || "";
    const siteName = og("site_name") || "";

    // 블로그명 추출: 네이버 블로그는 blogName이 따로 있음
    let blogName = siteName;
    if (!blogName) {
      // 네이버 블로그 패턴
      const naverBlogMatch = html.match(/["']authorName["']\s*:\s*["']([^"']+)["']/) ||
        html.match(/<span[^>]+class=["'][^"']*blog_name[^"']*["'][^>]*>([^<]+)<\/span>/i);
      if (naverBlogMatch) blogName = naverBlogMatch[1];
    }

    // 날짜 추출 시도
    const dateMatch =
      html.match(/<meta[^>]+property=["']article:published_time["'][^>]+content=["']([^"']+)["']/i)?.[1] ||
      html.match(/["']publishedAt["']\s*:\s*["']([^"']+)["']/)?.[1] ||
      "";
    const date = dateMatch ? dateMatch.slice(0, 10) : "";

    return NextResponse.json({ url, title: title.trim(), text: text.trim(), thumbnailUrl, blogName: blogName.trim(), date });
  } catch (e: any) {
    return NextResponse.json({ url, title: "", text: "", thumbnailUrl: "", blogName: "", error: e.message });
  }
}
