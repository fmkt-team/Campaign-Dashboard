import { NextResponse } from 'next/server';

export const dynamic = "force-dynamic";

// 1×1 투명 SVG – 이미지 로드 실패 시 브라우저 에러 없이 빈 이미지로 처리
const FALLBACK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>`;
const FALLBACK_HEADERS = {
  'Content-Type': 'image/svg+xml',
  'Cache-Control': 'public, max-age=60',
  'Access-Control-Allow-Origin': '*',
};

// 시도 1: Instagram CDN용 헤더
const INSTAGRAM_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Referer': 'https://www.instagram.com/',
  'Accept': 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Cache-Control': 'no-cache',
  'Pragma': 'no-cache',
  'Sec-Fetch-Site': 'cross-site',
  'Sec-Fetch-Mode': 'no-cors',
  'Sec-Fetch-Dest': 'image',
};

// 시도 2: YouTube / 일반 CDN용 최소 헤더
const GENERIC_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
};

async function tryFetch(url: string, headers: Record<string, string>) {
  return fetch(url, {
    headers,
    next: { revalidate: 3600 },
  });
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const url = searchParams.get('url');

  if (!url) return new NextResponse('Missing URL', { status: 400 });

  try {
    // 시도 1: Instagram 헤더
    let res = await tryFetch(url, INSTAGRAM_HEADERS);

    // 403·401 시 재시도: 최소 헤더 (YouTube 등 Referer 불필요 CDN)
    if (res.status === 403 || res.status === 401) {
      res = await tryFetch(url, GENERIC_HEADERS);
    }

    // 여전히 실패하면 투명 SVG 200 반환 (콘솔 에러 방지)
    if (!res.ok) {
      return new NextResponse(FALLBACK_SVG, { headers: FALLBACK_HEADERS });
    }

    const blob = await res.blob();
    return new NextResponse(blob, {
      headers: {
        'Content-Type': res.headers.get('content-type') || 'image/jpeg',
        'Cache-Control': 'public, max-age=86400',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch {
    // 네트워크 에러도 투명 SVG로 처리
    return new NextResponse(FALLBACK_SVG, { headers: FALLBACK_HEADERS });
  }
}
