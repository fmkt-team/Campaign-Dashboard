
import { NextResponse } from "next/server";
import { google } from "googleapis";

export const dynamic = "force-dynamic";

// GET /api/debug-sheet?url=<spreadsheet_url>&raw=1
// raw=1 이면 각 셀의 모든 API 필드를 그대로 반환 (textFormatRuns 포함)
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const sheetUrl = searchParams.get("url");
    const showRaw = searchParams.get("raw") === "1";
    if (!sheetUrl) {
      return NextResponse.json({ error: "url 파라미터가 필요합니다. ?url=<spreadsheet_url>" }, { status: 400 });
    }

    const match = sheetUrl.match(/\/d\/([a-zA-Z0-9-_]+)/);
    if (!match) return NextResponse.json({ error: "유효하지 않은 스프레드시트 URL" }, { status: 400 });
    const spreadsheetId = match[1];
    const gidMatch = sheetUrl.match(/gid=([0-9]+)/);
    const targetGid = gidMatch ? parseInt(gidMatch[1]) : null;

    const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    const key = process.env.GOOGLE_SERVICE_ACCOUNT_KEY?.replace(/\\n/g, "\n");
    if (!email || !key) return NextResponse.json({ error: "서비스 계정 환경변수 없음" }, { status: 500 });

    const auth = new google.auth.GoogleAuth({
      credentials: { client_email: email, private_key: key },
      scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
    });
    const sheets = google.sheets({ version: "v4", auth });

    const info = await sheets.spreadsheets.get({ spreadsheetId });
    const allSheets = info.data.sheets || [];
    let targetSheetTitle = allSheets[0]?.properties?.title || "Sheet1";
    if (targetGid !== null) {
      const found = allSheets.find(s => s.properties?.sheetId === targetGid);
      if (found?.properties?.title) targetSheetTitle = found.properties.title;
    }

    const response = await sheets.spreadsheets.get({
      spreadsheetId,
      ranges: [`'${targetSheetTitle}'!A1:AZ100`],
      includeGridData: true,
    });

    const gridData = response.data.sheets?.[0]?.data?.[0];
    if (!gridData?.rowData) {
      return NextResponse.json({ error: "데이터 없음", sheetTitle: targetSheetTitle });
    }

    const foundLinks: { row: number; col: number; text: string; url: string; method: string }[] = [];
    const rowSummary: any[] = [];

    for (let rIdx = 0; rIdx < gridData.rowData.length; rIdx++) {
      const rowData = gridData.rowData[rIdx];
      const cells: any[] = [];

      for (let cIdx = 0; cIdx < (rowData.values?.length ?? 0); cIdx++) {
        const cell = rowData.values![cIdx];
        const text = cell.formattedValue ?? "";

        let hl: string | null = null;
        let method = "";

        if (cell.hyperlink) {
          hl = cell.hyperlink;
          method = "hyperlink";
        }
        if (!hl && cell.userEnteredValue?.formulaValue) {
          const m = cell.userEnteredValue.formulaValue.match(/=HYPERLINK\s*\(\s*"([^"]+)"/i);
          if (m) { hl = m[1]; method = "formula"; }
        }
        if (!hl) {
          const runs = (cell as any).textFormatRuns;
          if (Array.isArray(runs)) {
            for (const run of runs) {
              const uri = run?.format?.link?.uri;
              if (uri) { hl = uri; method = "textFormatRuns"; break; }
            }
          }
        }
        if (!hl) {
          const uri =
            (cell.userEnteredFormat as any)?.textFormat?.link?.uri ??
            (cell.effectiveFormat as any)?.textFormat?.link?.uri;
          if (uri) { hl = uri; method = "textFormat"; }
        }

        if (hl) {
          foundLinks.push({ row: rIdx, col: cIdx, text, url: hl, method });
        }

        if (text || hl) {
          const cellInfo: any = { col: cIdx, text, hyperlink: hl };
          if (showRaw) {
            // raw 모드: 모든 API 필드 노출
            cellInfo.raw = {
              formattedValue: cell.formattedValue,
              hyperlink: cell.hyperlink,
              userEnteredValue: cell.userEnteredValue,
              userEnteredFormat: cell.userEnteredFormat,
              effectiveFormat: cell.effectiveFormat,
              textFormatRuns: (cell as any).textFormatRuns,
            };
          }
          cells.push(cellInfo);
        }
      }
      if (cells.length > 0) {
        rowSummary.push({ rowIndex: rIdx, cells });
      }
    }

    return NextResponse.json({
      sheetTitle: targetSheetTitle,
      allSheetTabs: allSheets.map(s => ({ title: s.properties?.title, gid: s.properties?.sheetId })),
      totalRows: gridData.rowData.length,
      foundLinksCount: foundLinks.length,
      foundLinks,
      rowSummary: rowSummary.slice(0, 50),
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
