import { NextRequest, NextResponse } from "next/server";

// 네이버 DataLab 검색어 트렌드 API
// https://developers.naver.com/docs/serviceapi/datalab/search/guide.ko.md

export async function POST(req: NextRequest) {
  try {
    const { startDate, endDate, timeUnit, keywordGroups } = await req.json();

    if (!keywordGroups || keywordGroups.length === 0) {
      return NextResponse.json({ error: "keywordGroups is required" }, { status: 400 });
    }

    const clientId     = process.env.NAVER_CLIENT_ID;
    const clientSecret = process.env.NAVER_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      // API 키가 없으면 더미 데이터를 반환 (개발 환경용)
      return NextResponse.json(generateMockData(startDate, endDate, timeUnit, keywordGroups));
    }

    const todayStr = new Date().toISOString().split("T")[0];
    const requestedEndDate = endDate || getDefaultEnd();
    const finalEndDate = requestedEndDate > todayStr ? todayStr : requestedEndDate;

    const body = {
      startDate:     startDate || getDefaultStart(),
      endDate:       finalEndDate,
      timeUnit:      timeUnit  || "date",
      keywordGroups: keywordGroups.map((g: any) => ({
        groupName: g.groupName,
        keywords:  g.keywords,
      })),
      device: "",
      ages:   [],
      gender: "",
    };

    const res = await fetch("https://openapi.naver.com/v1/datalab/search", {
      method:  "POST",
      headers: {
        "Content-Type":         "application/json",
        "X-Naver-Client-Id":     clientId,
        "X-Naver-Client-Secret": clientSecret,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json({ error: `Naver API error: ${res.status} ${text}` }, { status: res.status });
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

function getDefaultStart() {
  const d = new Date();
  d.setMonth(d.getMonth() - 3);
  return d.toISOString().split("T")[0];
}

function getDefaultEnd() {
  return new Date().toISOString().split("T")[0];
}

// 네이버 API 키가 없을 때 사용하는 더미 데이터 생성기
function generateMockData(startDate: string, endDate: string, timeUnit: string, keywordGroups: any[]) {
  const start = new Date(startDate || getDefaultStart());
  const end   = new Date(endDate   || getDefaultEnd());
  const results: any[] = [];

  for (const group of keywordGroups) {
    const data: any[] = [];
    const cur = new Date(start);
    while (cur <= end) {
      const base = 40 + Math.random() * 30;
      data.push({
        period: cur.toISOString().split("T")[0],
        ratio:  Math.round((base + Math.sin(cur.getTime() / 86400000 / 7) * 20) * 10) / 10,
      });
      if (timeUnit === "week") cur.setDate(cur.getDate() + 7);
      else if (timeUnit === "month") cur.setMonth(cur.getMonth() + 1);
      else cur.setDate(cur.getDate() + 1);
    }
    results.push({ title: group.groupName, keywords: group.keywords, data });
  }

  return { results };
}
