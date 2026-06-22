
import { NextResponse } from "next/server";
import { fetchSpreadsheetDataWithHyperlinks } from "@/lib/google-sheets";

export const dynamic = "force-dynamic";

// GET /api/debug-sheet?url=<spreadsheet_url>
// 하이퍼링크 추출 상태 진단용 — 각 셀의 formattedValue + hyperlink + 원시 필드 반환
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const sheetUrl = searchParams.get("url");
    if (!sheetUrl) {
      return NextResponse.json({ error: "url 파라미터가 필요합니다. ?url=<spreadsheet_url>" }, { status: 400 });
    }

    const result = await fetchSpreadsheetDataWithHyperlinks(sheetUrl, "A1:AZ100");
    if (!result.success || !result.data) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }

    // 하이퍼링크가 존재하는 셀만 추출해서 보기 쉽게 정리
    const foundLinks: { row: number; col: number; text: string; url: string }[] = [];
    result.hyperlinks?.forEach((rowLinks, rIdx) => {
      rowLinks.forEach((link, cIdx) => {
        if (link) {
          foundLinks.push({
            row: rIdx,
            col: cIdx,
            text: result.data![rIdx]?.[cIdx] ?? "",
            url: link,
          });
        }
      });
    });

    // 각 행을 {text, url} 쌍으로 보여주는 요약
    const rowSummary = result.data.slice(0, 30).map((row, rIdx) => ({
      rowIndex: rIdx,
      cells: row.map((text, cIdx) => ({
        col: cIdx,
        text,
        hyperlink: result.hyperlinks?.[rIdx]?.[cIdx] ?? null,
      })).filter(c => c.text || c.hyperlink), // 비어있는 셀 제외
    }));

    return NextResponse.json({
      sheetTitle: result.sheetTitle,
      totalRows: result.data.length,
      totalCols: Math.max(...result.data.map(r => r.length), 0),
      foundLinksCount: foundLinks.length,
      foundLinks,
      rowSummary,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
