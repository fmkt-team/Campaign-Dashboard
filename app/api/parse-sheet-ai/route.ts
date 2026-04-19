import { NextResponse } from "next/server";
import OpenAI from "openai";

// OpenAI 서버 연동
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

function parseNumber(val: any): number {
  if (val === null || val === undefined || val === "") return 0;
  const n = parseFloat(String(val).replace(/[^0-9.-]+/g, ""));
  return isNaN(n) ? 0 : n;
}

function parseDate(val: any): string {
  if (!val) return "1970-01-01";
  const s = String(val).trim();
  const m = s.match(/(\d{2,4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) {
    const y = m[1].length === 2 ? `20${m[1]}` : m[1];
    return `${y}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  }
  return s || "1970-01-01";
}

// ── Main Route ──────────────────────────────────────────────────────────────
export async function POST(req: Request) {
  try {
    const { data, type, mode = "extract" } = await req.json();

    if (!data || !Array.isArray(data)) {
      return NextResponse.json({ error: "No data provided" }, { status: 400 });
    }

    // AI에게 상위 15개 행을 보여주고 헤더 위치와 매핑 정보를 추출하게 합니다.
    const sample = data.slice(0, 15);
    
    const requiredKeys = type === "digital" 
      ? ["date", "medium", "spend", "impressions", "views", "clicks"]
      : ["date", "platform", "creator", "url"];

    const prompt = `You are a data extraction assistant. I will provide a JSON array representing the first 15 rows of a spreadsheet.
Your task is to identify which row index (0-indexed) contains the actual column headers, and then map the target fields to their column index (0-indexed integer).
Target fields: ${requiredKeys.join(", ")}

Spreadsheet Top Rows:
${JSON.stringify(sample)}

Instructions:
1. "headerRowIndex" is the exact integer index of the row containing table column names.
2. "mapping" should map each target field to the correct integer index of that column. If a field lacks a matching column, map it to null.
3. Reply ONLY with a valid JSON object matching this schema:
{
  "headerRowIndex": integer,
  "mapping": {
    "date": integer | null,
    // ... other target fields
  }
}
`;

    let mapping: Record<string, string | null> = {};
    let headerRowIndex = 0;

    try {
      const aiRes = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
        temperature: 0.1,
      });

      const aiOutput = aiRes.choices[0].message.content || "{}";
      const parsedAI = JSON.parse(aiOutput);
      mapping = parsedAI.mapping || {};
      headerRowIndex = typeof parsedAI.headerRowIndex === "number" ? parsedAI.headerRowIndex : 0;
      console.log(`[parse-sheet-ai] AI Success: type=${type}`);
    } catch (aiError: any) {
      console.warn("[parse-sheet-ai] OpenAI failed (Quota exceeded or other). Using local fallback heuristic...", aiError.message);
      
      const DIGITAL_KEYWORDS: Record<string, string[]> = {
        date: ["일자", "날짜", "date", "기간", "일", "월", "week", "주", "업로드"],
        medium: ["매체", "채널", "media", "channel", "platform", "매체명", "매체상세"],
        spend: ["비용", "비", "spend", "cost", "금액", "집행", "광고비", "예산소진", "소진비용"],
        impressions: ["노출", "impression", "imp", "노출수"],
        views: ["조회", "view", "재생", "vt", "조회수", "영상"],
        clicks: ["클릭", "click", "cl", "클릭수"],
      };

      const VIRAL_KEYWORDS: Record<string, string[]> = {
        date: ["일자", "날짜", "date", "업로드", "게시", "등록"],
        platform: ["플랫폼", "platform", "채널", "channel", "sns"],
        creator: ["크리에이터", "creator", "인플루언서", "influencer", "작성자", "이름"],
        url: ["url", "링크", "link", "주소", "http", "채널 링크", "게시물 링크"],
      };

      const keywords = type === "digital" ? DIGITAL_KEYWORDS : VIRAL_KEYWORDS;
      
      // Robust Header Row Finding
      let maxScore = -1;
      for (let i = 0; i < Math.min(15, data.length); i++) {
        const row = data[i] || [];
        let score = 0;
        for (const cell of row) {
          if (!cell || typeof cell !== "string") continue;
          const cleanCell = cell.toLowerCase().trim();
          for (const kws of Object.values(keywords)) {
            if (kws.some(kw => cleanCell.includes(kw.toLowerCase()))) {
              score += 2;
              break;
            }
          }
          if (isNaN(Number(cleanCell.replace(/,/g, "")))) score += 1;
        }
        if (score > maxScore) {
          maxScore = score;
          headerRowIndex = i;
        }
      }

      // Fallback Column Mapping
      const headers = data[headerRowIndex] || [];
      mapping = {};
      requiredKeys.forEach(k => { mapping[k] = null; });

      for (const [field, kws] of Object.entries(keywords)) {
        for (let col = 0; col < headers.length; col++) {
          const cell = String(headers[col] || "").toLowerCase().trim();
          if (kws.some(kw => cell.includes(kw.toLowerCase()))) {
            mapping[field] = String(col);
            break;
          }
        }
      }
    }

    console.log(`[parse-sheet-ai] type=${type}, headerRow=${headerRowIndex}, mapping=`, mapping);

    // ── 컬럼 자동 감지 모드 ──
    if (mode === "guess_columns") {
      return NextResponse.json({ mapping, headerRowIndex });
    }

    // ── 전체 데이터 추출 모드 ──
    if (type === "digital") {
      let lastKnownDate = "1970-01-01";
      let lastKnownMedium = "-";

      const rows = data.slice(headerRowIndex + 1)
        .filter(row => row.some((c: any) => c !== "" && c !== null && c !== undefined))
        .map(row => {
          const mIdx = mapping["medium"];
          let medium = mIdx !== null && mIdx !== undefined ? String(row[mIdx as any] || "").trim() : "";
          if (medium === "") medium = lastKnownMedium; else lastKnownMedium = medium;
          
          if (!medium) return null;

          const dateIdx = mapping["date"];
          const spendIdx = mapping["spend"];
          const impIdx = mapping["impressions"];
          const viewsIdx = mapping["views"];
          const clicksIdx = mapping["clicks"];

          let parsedDate = parseDate(dateIdx !== null ? row[dateIdx as any] : "1970-01-01");
          if (parsedDate === "1970-01-01" && lastKnownDate !== "1970-01-01") parsedDate = lastKnownDate;
          else lastKnownDate = parsedDate;

          const spend = parseNumber(spendIdx !== null ? row[spendIdx as any] : 0);
          const impressions = parseNumber(impIdx !== null ? row[impIdx as any] : 0);
          const views = parseNumber(viewsIdx !== null ? row[viewsIdx as any] : 0);
          const clicks = parseNumber(clicksIdx !== null ? row[clicksIdx as any] : 0);

          return {
            date: parsedDate,
            medium,
            spend,
            impressions,
            views,
            clicks,
            cpv: views > 0 ? spend / views : 0,
            ctr: impressions > 0 ? (clicks / impressions) * 100 : 0,
            vtr: impressions > 0 ? (views / impressions) * 100 : 0,
            recordedAt: Date.now(),
          };
        })
        .filter(Boolean);

      return NextResponse.json({ rows, mapping, headerRowIndex });
    }

    if (type === "viral") {
      let lastKnownDate = "1970-01-01";
      let lastKnownPlatform = "-";
      let lastKnownCreator = "-";

      const rows = data.slice(headerRowIndex + 1)
        .filter(row => row.some((c: any) => c !== "" && c !== null && c !== undefined))
        .map(row => {
          const dateIdx = mapping["date"];
          const platformIdx = mapping["platform"];
          const creatorIdx = mapping["creator"];
          const urlIdx = mapping["url"];

          let parsedDate = parseDate(dateIdx !== null ? row[dateIdx as any] : "1970-01-01");
          if (parsedDate === "1970-01-01" && lastKnownDate !== "1970-01-01") parsedDate = lastKnownDate; 
          else lastKnownDate = parsedDate;

          const rawUrl = urlIdx !== null ? String(row[urlIdx as any] || "").trim() : "";

          let platform = platformIdx !== null ? String(row[platformIdx as any] || "").trim() : "";
          if (platform === "" || platform === "-") platform = lastKnownPlatform; else lastKnownPlatform = platform;

          if ((platform === "" || platform === "-") && rawUrl) {
            if (rawUrl.includes("youtube.com") || rawUrl.includes("youtu.be")) platform = "YouTube";
            else if (rawUrl.includes("instagram.com")) platform = "Instagram";
            else if (rawUrl.includes("blog.naver.com") || rawUrl.includes("naver.com")) platform = "Naver Blog";
          }

          let creator = creatorIdx !== null ? String(row[creatorIdx as any] || "").trim() : "";
          if (creator === "" || creator === "-") creator = lastKnownCreator; else lastKnownCreator = creator;

          return {
            date: parsedDate,
            platform: platform || "-",
            creator: creator || "-",
            title: "-", // title은 URL 스크랩 단계에서 채워짐
            views: 0, // 구글 시트에서 더 이상 매핑하지 않음
            likes: 0,
            comments: 0,
            url: rawUrl,
          };
        });

      return NextResponse.json({ rows, mapping, headerRowIndex });
    }

    return NextResponse.json({ error: "Unknown type" }, { status: 400 });

  } catch (error: any) {
    console.error("parse-sheet-ai Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

