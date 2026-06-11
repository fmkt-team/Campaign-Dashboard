import { NextResponse } from "next/server";
import OpenAI from "openai";
import { fetchSpreadsheetData } from "@/lib/google-sheets";

export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const { sheetUrl } = await req.json();
    if (!sheetUrl) {
      return NextResponse.json({ success: false, error: "sheetUrl이 필요합니다." }, { status: 400 });
    }

    const sheetResult = await fetchSpreadsheetData(sheetUrl, "A1:AZ300");
    if (!sheetResult.success || !sheetResult.data) {
      return NextResponse.json({ success: false, error: sheetResult.error }, { status: 500 });
    }

    const allRows = sheetResult.data;
    const sampleRows = allRows.slice(0, 80);

    // 열 문자 포함 포맷 (A열, B열... 명시)
    const colHeader = sampleRows[0]
      ? `열번호: [${sampleRows[0].map((_, i) => `"${String.fromCharCode(65 + i)}열"`).join(", ")}]`
      : "";

    const formattedData = [
      colHeader,
      ...sampleRows.map((row, i) =>
        `행${i + 1}: [${row.map((c, ci) => `${String.fromCharCode(65 + ci)}="${String(c).substring(0, 25)}"`).join(", ")}]`
      ),
    ].join("\n");

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const prompt = `아래는 팝업 운영 현황 구글 시트 데이터야. 각 셀은 "열문자=값" 형식으로 표시했어.

시트를 분석해서 아래 정보를 정확히 찾아줘.

**찾아야 할 정보:**
1. dateHeaderRows: MM/DD 형식 날짜(예: 6/8, 6/9)가 여러 열에 걸쳐 나열된 행 번호 배열. 팝업 운영 블록마다 반복될 수 있음.
2. dateStartCol: 날짜 헤더가 시작하는 열 문자 (대문자 한 글자, 예: "E"). 모든 블록에서 같은 열에서 시작하면 하나만 반환.
3. colSpan: 날짜 1개당 사용하는 열 수.
   - 2이면: 건수 열(VIP/건수)과 명수 열(일반/명수)이 나란히 있는 듀얼 컬럼 구조.
   - 1이면: 한 셀에 "건수/명수" 형태로 같이 있는 싱글 컬럼 구조.
4. vipReserve: VIP 사전 예약 신청 건수 행 번호 배열 (블록마다 반복)
5. generalReserve: 일반 사전 예약 신청 건수 행 번호 배열
6. actualVisit: 실제 방문자 수 행 번호 배열 (VIP 방문 + 일반 방문)
7. totalVisit: 총 방문객 수 행 번호 배열

**규칙:**
- 행 번호는 1부터 시작하는 정수
- 날짜 블록이 여러 개면(예: 6/8~6/13 블록, 6/14~6/20 블록, 6/21~6/27 블록) 각 블록의 해당 행을 모두 배열에 포함
- dateStartCol 예시: 날짜가 E열부터 시작하면 "E", G열부터면 "G"
- colSpan=2면 날짜 열(E)과 그 다음 열(F)이 한 날짜의 데이터. 다음 날짜는 G,H 열.
- 항목을 찾지 못한 경우 빈 배열 [] 또는 null 반환

반드시 아래 JSON 형식으로만 응답해:
{
  "dateHeaderRows": [행번호 배열],
  "dateStartCol": "열문자",
  "colSpan": 1 또는 2,
  "dataRows": {
    "vipReserve": [행번호 배열],
    "generalReserve": [행번호 배열],
    "actualVisit": [행번호 배열],
    "totalVisit": [행번호 배열]
  },
  "confidence": 0~100 사이 정수,
  "notes": "분석 시 특이사항 (한국어)"
}

시트 데이터:
${formattedData}`;

    let mapping: any = {
      dateHeaderRows: [],
      dateStartCol: "",
      colSpan: 2,
      dataRows: {
        vipReserve: [], generalReserve: [],
        actualVisit: [], totalVisit: [],
      },
      confidence: 0,
      notes: "AI 분석 실패",
    };

    let aiSuccess = false;
    try {
      const aiRes = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
        temperature: 0.1,
      });
      const parsed = JSON.parse(aiRes.choices[0].message.content || "{}");
      if (parsed.dateHeaderRows && parsed.dateHeaderRows.length > 0) {
        mapping = {
          ...parsed,
          dataRows: parsed.dataRows || {},
        };
        aiSuccess = true;
      }
    } catch (aiErr: any) {
      console.warn("[analyze-popup-sheet] AI 분석 실패:", aiErr.message);
    }

    if (!aiSuccess || mapping.confidence < 40 || mapping.dateHeaderRows.length === 0) {
      const fallbackMapping = analyzeSheetStatistically(allRows);
      if (fallbackMapping.dateHeaderRows.length > 0) {
        mapping = fallbackMapping;
      }
    }

    return NextResponse.json({
      success: true,
      mapping,
      totalRows: allRows.length,
      previewRows: allRows.slice(0, 50),
    });
  } catch (e: any) {
    console.error("[analyze-popup-sheet] Error:", e);
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}

function analyzeSheetStatistically(allRows: string[][]) {
  const dateHeaderRows: number[] = [];
  const vipReserve: number[] = [];
  const generalReserve: number[] = [];
  const actualVisit: number[] = [];
  const totalVisit: number[] = [];

  const datePattern = /(\d{1,2})[\/\.]\s*(\d{1,2})/;
  let dateStartColNum = -1;
  let colSpan = 2;

  allRows.forEach((row, idx) => {
    const rowNum = idx + 1;
    const rowStr = row.join(" ").toLowerCase();

    // 날짜 헤더 감지
    let dateCount = 0;
    let firstDateCol = -1;
    let secondDateCol = -1;
    row.forEach((cell, ci) => {
      if (datePattern.test(cell)) {
        dateCount++;
        if (firstDateCol === -1) firstDateCol = ci;
        else if (secondDateCol === -1) secondDateCol = ci;
      }
    });
    if (dateCount >= 3) {
      dateHeaderRows.push(rowNum);
      if (dateStartColNum === -1 && firstDateCol >= 0) dateStartColNum = firstDateCol;
      if (firstDateCol >= 0 && secondDateCol >= 0) colSpan = secondDateCol - firstDateCol;
      return;
    }

    if (rowStr.includes("vip") && (rowStr.includes("예약") || rowStr.includes("신청"))) vipReserve.push(rowNum);
    if (rowStr.includes("일반") && (rowStr.includes("예약") || rowStr.includes("신청"))) generalReserve.push(rowNum);
    if (rowStr.includes("실 방문") || rowStr.includes("실방문") || rowStr.includes("실제 방문")) actualVisit.push(rowNum);
    if (rowStr.includes("총 방문") || rowStr.includes("총방문")) totalVisit.push(rowNum);
  });

  return {
    dateHeaderRows,
    dateStartCol: dateStartColNum >= 0 ? String.fromCharCode(65 + dateStartColNum) : "",
    colSpan,
    dataRows: { vipReserve, generalReserve, actualVisit, totalVisit },
    confidence: 75,
    notes: "규칙 기반 정적 분석 결과가 자동 적용되었습니다.",
  };
}
