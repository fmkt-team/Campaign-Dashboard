import { NextResponse } from "next/server";
import { ApifyClient } from "apify-client";

const apify = new ApifyClient({ token: process.env.APIFY_API_TOKEN });

export async function GET() {
  const results: Record<string, any> = {};

  // 1. 환경변수 체크
  results.env = {
    APIFY_API_TOKEN:     !!process.env.APIFY_API_TOKEN,
    TWITTER_BEARER_TOKEN:!!process.env.TWITTER_BEARER_TOKEN,
    NAVER_CLIENT_ID:     !!process.env.NAVER_CLIENT_ID,
    NAVER_CLIENT_SECRET: !!process.env.NAVER_CLIENT_SECRET,
  };

  // 2. Naver Blog API 테스트
  try {
    const res = await fetch(
      `https://openapi.naver.com/v1/search/blog.json?query=${encodeURIComponent("퍼시스")}&display=3&sort=date`,
      { headers: {
        "X-Naver-Client-Id":     process.env.NAVER_CLIENT_ID ?? "",
        "X-Naver-Client-Secret": process.env.NAVER_CLIENT_SECRET ?? "",
      }}
    );
    const body = await res.json();
    results.naver = {
      status: res.status,
      ok: res.ok,
      total: body.total,
      items: body.items?.length ?? 0,
      firstTitle: body.items?.[0]?.title?.replace(/<[^>]+>/g,"") ?? null,
      error: body.errorMessage ?? null,
    };
  } catch (e: any) {
    results.naver = { error: e.message };
  }

  // 3. Apify Twitter actor 테스트 (짧게)
  if (process.env.APIFY_API_TOKEN) {
    try {
      const run = await apify.actor("quacker/twitter-scraper").call(
        { searchTerms: ["퍼시스"], maxItems: 2, addUserInfo: false },
        { waitSecs: 60 }
      );
      const { items } = await apify.dataset(run.defaultDatasetId).listItems();
      results.twitter_apify = {
        ok: true,
        items: items.length,
        first: items[0] ? { text: (items[0] as any).text?.slice(0,50) } : null,
      };
    } catch (e: any) {
      results.twitter_apify = { ok: false, error: e.message };
    }
  }

  return NextResponse.json(results);
}
