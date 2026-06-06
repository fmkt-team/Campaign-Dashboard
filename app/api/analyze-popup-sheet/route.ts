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

    // 시트 데이터 fetch (기존 구글 시트 연동 방식 그대로)
    const sheetResult = await fetchSpreadsheetData(sheetUrl, "A1:AZ300");
    if (!sheetResult.success || !sheetResult.data) {
      return NextResponse.json({ success: false, error: sheetResult.error }, { status: 500 });
    }

    const allRows = sheetResult.data;
    // AI 분석용 샘플: 최대 80행 (토큰 절약)
    const sampleRows = allRows.slice(0, 80);
    const formattedData = sampleRows
      .map((row, i) => `행${i + 1}: [${row.map(c => `"${String(c).substring(0, 30)}"`).join(", ")}]`)
      .join("\n");

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const prompt = `아래는 팝업 운영 현황 구글 시트 데이터야. 시트를 분석해서 아래 항목들이 어느 행/열에 있는지 찾아줘.
찾아야 할 항목:
* 날짜 헤더 (일자가 나열된 행, MM/DD 패턴이 여러 열에 걸쳐 있음)
* 이벤트/사연 신청 건수
* VIP 사전 예약 (건수 / 명수)
* 일반 사전 예약 (건수 / 명수)
* 실제 방문자 수 (VIP / 일반)
* 워크인 방문 (팀 / 인원)
* 총 방문객 수
* 시상/이벤트 참여 수

행 번호는 1부터 시작하는 정수야. 각 항목이 반복되는 경우(날짜 섹션이 여러 블록) 모든 해당 행 번호를 배열로 반환해.
항목을 찾지 못한 경우 빈 배열 []로 반환해.

반드시 아래 JSON 형식으로만 응답해:
{
  "dateHeaderRows": [행번호 배열],
  "dataRows": {
    "eventApply": [행번호 배열],
    "vipReserve": [행번호 배열],
    "generalReserve": [행번호 배열],
    "actualVisit": [행번호 배열],
    "walkin": [행번호 배열],
    "totalVisit": [행번호 배열],
    "awardEvent": [행번호 배열]
  },
  "confidence": 0~100 사이 정수,
  "notes": "분석 시 특이사항 (한국어)"
}

시트 데이터:
${formattedData}`;

    let mapping: any = {
      dateHeaderRows: [],
      dataRows: {
        eventApply: [], vipReserve: [], generalReserve: [],
        actualVisit: [], walkin: [], totalVisit: [], awardEvent: [],
      },
      confidence: 0,
      notes: "AI 분석 실패",
    };

    let aiSuccess = false;
    try {
      const aiRes = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
        temperature: 0.1,
      });
      const parsed = JSON.parse(aiRes.choices[0].message.content || "{}");
      if (parsed.dateHeaderRows && parsed.dateHeaderRows.length > 0) {
        mapping = parsed;
        aiSuccess = true;
      }
    } catch (aiErr: any) {
      console.warn("[analyze-popup-sheet] AI 분석 실패:", aiErr.message);
    }

    // AI 분석이 실패했거나 신뢰할 수 없는 경우 규칙 기반 정적 분석 수행
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
      previewRows: allRows.slice(0, 30),
    });
  } catch (e: any) {
    console.error("[analyze-popup-sheet] Error:", e);
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}

function analyzeSheetStatistically(allRows: string[][]) {
  const dateHeaderRows: number[] = [];
  const eventApply: number[] = [];
  const vipReserve: number[] = [];
  const generalReserve: number[] = [];
  const actualVisit: number[] = [];
  const walkin: number[] = [];
  const totalVisit: number[] = [];
  const awardEvent: number[] = [];

  const datePattern = /(\d{1,2})[\/\.]\s*(\d{1,2})/;

  allRows.forEach((row, idx) => {
    const rowNum = idx + 1; // 1-based
    const rowStr = row.join(" ").toLowerCase();

    // 1. 날짜 헤더 감지 (행 내에 날짜 포맷이 3개 이상 들어있으면 날짜 헤더로 추정)
    let dateCount = 0;
    row.forEach(cell => {
      if (datePattern.test(cell)) dateCount++;
    });
    if (dateCount >= 3) {
      dateHeaderRows.push(rowNum);
      return;
    }

    // 2. 각 항목별 키워드 매칭
    if (rowStr.includes("사연") || (rowStr.includes("이벤트") && (rowStr.includes("신청") || rowStr.includes("참여")))) {
      eventApply.push(rowNum);
    }
    if (rowStr.includes("vip") && (rowStr.includes("예약") || rowStr.includes("신청"))) {
      vipReserve.push(rowNum);
    }
    if (rowStr.includes("일반") && (rowStr.includes("예약") || rowStr.includes("신청"))) {
      generalReserve.push(rowNum);
    }
    if (rowStr.includes("실 방문") || rowStr.includes("실방문") || rowStr.includes("실제 방문") || rowStr.includes("實 방문") || rowStr.includes("실제방문")) {
      actualVisit.push(rowNum);
    }
    if (rowStr.includes("워크인") || rowStr.includes("현장")) {
      walkin.push(rowNum);
    }
    if (rowStr.includes("총 방문") || rowStr.includes("총방문") || (rowStr.includes("방문객") && rowStr.includes("총"))) {
      totalVisit.push(rowNum);
    }
    if (rowStr.includes("시상") || rowStr.includes("어워드")) {
      awardEvent.push(rowNum);
    }
  });

  return {
    dateHeaderRows,
    dataRows: {
      eventApply,
      vipReserve,
      generalReserve,
      actualVisit,
      walkin,
      totalVisit,
      awardEvent
    },
    confidence: 80,
    notes: "규칙 기반 정적 분석 결과가 자동 적용되었습니다."
  };
}
