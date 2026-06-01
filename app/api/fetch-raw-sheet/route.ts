import { NextResponse } from "next/server";
import { fetchSpreadsheetData } from "@/lib/google-sheets";

/**
 * 구글 스프레드시트를 raw 2D 배열로 반환하는 엔드포인트.
 * - /api/fetch-sheet (Gantt 전용, parseGanttSheetData 결과)와 구별됨
 * - AI 매체 분석·바이럴 매핑 등 raw 데이터가 필요한 경우에 사용
 */
export async function POST(req: Request) {
  try {
    const { sheetUrl } = await req.json();
    if (!sheetUrl) {
      return NextResponse.json({ success: false, error: "sheetUrl이 필요합니다." }, { status: 400 });
    }

    const result = await fetchSpreadsheetData(sheetUrl, "A1:AZ2000");
    if (!result.success || !result.data) {
      return NextResponse.json({ success: false, error: result.error }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: result.data });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}
