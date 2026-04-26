import { NextRequest, NextResponse } from "next/server";
import { GoogleAuth } from "google-auth-library";

const GA4_PROPERTY_ID = "387999173";

// google-auth-library 없을 때를 위한 수동 JWT 인증 (엣지 호환)
async function getAccessToken(): Promise<string> {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL!;
  const rawKey = process.env.GOOGLE_SERVICE_ACCOUNT_KEY!;

  // \\n → 실제 줄바꿈으로
  const privateKey = rawKey.replace(/\\n/g, "\n");

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iss: email,
    scope: "https://www.googleapis.com/auth/analytics.readonly",
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now,
  };

  const encode = (obj: object) =>
    Buffer.from(JSON.stringify(obj)).toString("base64url");

  const signingInput = `${encode(header)}.${encode(payload)}`;

  // Web Crypto API로 RS256 서명
  const pemBody = privateKey
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s/g, "");
  const derBuffer = Buffer.from(pemBody, "base64");

  const key = await crypto.subtle.importKey(
    "pkcs8",
    derBuffer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const sig = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    Buffer.from(signingInput)
  );
  const jwt = `${signingInput}.${Buffer.from(sig).toString("base64url")}`;

  // Google OAuth2 토큰 발급
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });
  const tokenData = await tokenRes.json();
  if (!tokenData.access_token) {
    throw new Error(`Token error: ${JSON.stringify(tokenData)}`);
  }
  return tokenData.access_token;
}

export async function POST(req: NextRequest) {
  try {
    const { startDate, endDate, metrics, dimensions, timeUnit, propertyId } = await req.json();

    const targetPropertyId = propertyId || GA4_PROPERTY_ID;
    const accessToken = await getAccessToken();

    const todayStr = new Date().toISOString().split("T")[0];
    const finalEndDate = (endDate && endDate > todayStr) ? todayStr : (endDate || "today");

    // 단위에 따른 디멘션 설정
    let ga4Dimensions = dimensions;
    let ga4OrderBy = [{ dimension: { dimensionName: "date" } }];

    if (!ga4Dimensions) {
      if (timeUnit === "week") {
        ga4Dimensions = [{ name: "isoYearIsoWeek" }];
        ga4OrderBy = [{ dimension: { dimensionName: "isoYearIsoWeek" } }];
      } else if (timeUnit === "month") {
        ga4Dimensions = [{ name: "yearMonth" }];
        ga4OrderBy = [{ dimension: { dimensionName: "yearMonth" } }];
      } else {
        ga4Dimensions = [{ name: "date" }];
        ga4OrderBy = [{ dimension: { dimensionName: "date" } }];
      }
    } else {
      // 커스텀 디멘션이 들어오면 정렬은 기본적으로 metrics의 첫 번째 항목(세션수) 내림차순으로 설정 (TOP N 추출 목적)
      ga4OrderBy = [
        { desc: true, metric: { metricName: metrics?.[0]?.name || "sessions" } }
      ];
    }

    const body = {
      dateRanges: [{ startDate: startDate || "30daysAgo", endDate: finalEndDate }],
      dimensions: ga4Dimensions,
      metrics: metrics || [
        { name: "sessions" },
        { name: "activeUsers" },
        { name: "averageSessionDuration" },
      ],
      orderBys: ga4OrderBy,
      limit: 500,
    };

    const res = await fetch(
      `https://analyticsdata.googleapis.com/v1beta/properties/${targetPropertyId}:runReport`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      }
    );

    if (!res.ok) {
      const err = await res.text();
      return NextResponse.json({ error: err }, { status: res.status });
    }

    const raw = await res.json();

    // GA4 응답을 파싱하기 쉬운 배열로 변환
    const dimNames = raw.dimensionHeaders?.map((h: any) => h.name) ?? [];
    const metNames = raw.metricHeaders?.map((h: any) => h.name) ?? [];
    const rows = (raw.rows ?? []).map((row: any) => {
      const r: Record<string, any> = {};
      dimNames.forEach((k: string, i: number) => { r[k] = row.dimensionValues[i].value; });
      metNames.forEach((k: string, i: number) => { r[k] = parseFloat(row.metricValues[i].value); });
      return r;
    });

    return NextResponse.json({ rows, rowCount: raw.rowCount ?? rows.length });
  } catch (e: any) {
    console.error("GA4 API error:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
