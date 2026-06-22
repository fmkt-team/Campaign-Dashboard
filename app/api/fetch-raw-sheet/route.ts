import { NextResponse } from "next/server";
import { fetchSpreadsheetData, fetchSpreadsheetDataWithHyperlinks } from "@/lib/google-sheets";

export async function POST(req: Request) {
  try {
    const { sheetUrl, type } = await req.json();
    if (!sheetUrl) {
      return NextResponse.json({ success: false, error: "sheetUrl이 필요합니다." }, { status: 400 });
    }

    if (type === "viral") {
      const result = await fetchSpreadsheetDataWithHyperlinks(sheetUrl, "A1:AZ2000");
      if (!result.success || !result.data) {
        return NextResponse.json({ success: false, error: result.error }, { status: 500 });
      }

      // 진단 로그: 하이퍼링크가 발견된 셀 목록
      const foundLinks: { row: number; col: number; text: string; url: string }[] = [];
      result.hyperlinks?.forEach((rowLinks, rIdx) => {
        rowLinks.forEach((link, cIdx) => {
          if (link) {
            foundLinks.push({ row: rIdx, col: cIdx, text: result.data![rIdx]?.[cIdx] ?? "", url: link });
          }
        });
      });
      console.log(`[fetch-raw-sheet] viral sync — totalRows: ${result.data.length}, hyperlinks found: ${foundLinks.length}`);
      console.log(`[fetch-raw-sheet] hyperlinks:`, JSON.stringify(foundLinks.slice(0, 30)));

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
