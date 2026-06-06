import { NextResponse } from "next/server";
import { fetchSpreadsheetData, fetchSpreadsheetDataWithHyperlinks } from "@/lib/google-sheets";

/**
 * 구글 스프레드시트를 raw 2D 배열로 반환하는 엔드포인트.
 * - type="viral" 일 때는 하이퍼링크 포함 데이터(hyperlinks[][])도 함께 반환
 * - /api/fetch-sheet (Gantt 전용)와 구별됨
 */
export async function POST(req: Request) {
  try {
    const { sheetUrl, type } = await req.json();
    if (!sheetUrl) {
      return NextResponse.json({ success: false, error: "sheetUrl이 필요합니다." }, { status: 400 });
    }

    // 바이럴 시트는 하이퍼링크(온에어 URL 등)가 필요하므로 전용 fetch 사용
    if (type === "viral") {
      const result = await fetchSpreadsheetDataWithHyperlinks(sheetUrl, "A1:AZ2000");
      if (!result.success || !result.data) {
        return NextResponse.json({ success: false, error: result.error }, { status: 500 });
      }
      return NextResponse.json({ success: true, data: result.data, hyperlinks: result.hyperlinks });
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
