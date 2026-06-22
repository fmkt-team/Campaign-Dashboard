"use server";

import { google } from "googleapis";

export async function fetchSpreadsheetData(sheetUrl: string, range: string = 'A1:Z500') {
  try {
    const match = sheetUrl.match(/\/d\/([a-zA-Z0-9-_]+)/);
    if (!match) throw new Error("유효하지 않은 구글 스프레드시트 주소입니다.");
    
    const spreadsheetId = match[1];
    
    // Extract gid if present
    const gidMatch = sheetUrl.match(/gid=([0-9]+)/);
    const targetGid = gidMatch ? parseInt(gidMatch[1]) : null;

    const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    const key = process.env.GOOGLE_SERVICE_ACCOUNT_KEY?.replace(/\\n/g, "\n"); 

    if (!email || !key) {
      throw new Error("서버 환경 변수에 구글 서비스 계정 인증 정보가 없습니다 (GOOGLE_SERVICE_ACCOUNT_KEY).");
    }

    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: email,
        private_key: key,
      },
      scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
    });

    const sheets = google.sheets({ version: "v4", auth });
    
    // Get spreadsheet info to find all sheet titles and their gids
    const info = await sheets.spreadsheets.get({ spreadsheetId });
    const allSheets = info.data.sheets || [];
    
    let targetSheetTitle = allSheets[0]?.properties?.title || "Sheet1";

    if (targetGid !== null) {
      const foundSheet = allSheets.find(s => s.properties?.sheetId === targetGid);
      if (foundSheet && foundSheet.properties?.title) {
        targetSheetTitle = foundSheet.properties.title;
      }
    }

    const targetRange = `'${targetSheetTitle}'!${range}`;

    console.log(`Fetching from range: ${targetRange}`);

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: targetRange,
    });

    const rows = response.data.values;
    if (!rows || rows.length === 0) {
      return { success: false, error: `'${targetSheetTitle}' 시트에서 데이터를 찾을 수 없습니다. (비어있음)` };
    }

    return { success: true, data: rows, sheetTitle: targetSheetTitle };
  } catch (error: any) {
    console.error("fetchSpreadsheetData Error:", error);
    return { success: false, error: error.message || "알 수 없는 오류가 발생했습니다." };
  }
}

/**
 * 셀 텍스트 + 하이퍼링크를 함께 반환하는 fetch 함수.
 * "온에어" 컬럼처럼 텍스트에 URL이 삽입된 경우에 사용.
 * hyperlinks[row][col] = URL 문자열 or null
 */
export async function fetchSpreadsheetDataWithHyperlinks(sheetUrl: string, range: string = "A1:AZ2000") {
  try {
    const match = sheetUrl.match(/\/d\/([a-zA-Z0-9-_]+)/);
    if (!match) throw new Error("유효하지 않은 구글 스프레드시트 주소입니다.");

    const spreadsheetId = match[1];
    const gidMatch = sheetUrl.match(/gid=([0-9]+)/);
    const targetGid = gidMatch ? parseInt(gidMatch[1]) : null;

    const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    const key = process.env.GOOGLE_SERVICE_ACCOUNT_KEY?.replace(/\\n/g, "\n");

    if (!email || !key) {
      throw new Error("서버 환경 변수에 구글 서비스 계정 인증 정보가 없습니다.");
    }

    const auth = new google.auth.GoogleAuth({
      credentials: { client_email: email, private_key: key },
      scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
    });

    const sheets = google.sheets({ version: "v4", auth });

    const info = await sheets.spreadsheets.get({ spreadsheetId });
    const allSheets = info.data.sheets || [];
    let targetSheetTitle = allSheets[0]?.properties?.title || "Sheet1";

    if (targetGid !== null) {
      const foundSheet = allSheets.find((s) => s.properties?.sheetId === targetGid);
      if (foundSheet?.properties?.title) targetSheetTitle = foundSheet.properties.title;
    }

    // includeGridData: true → 전체 셀 데이터 반환 (fields 마스크 없이 사용해야 hyperlink 누락 없음)
    const response = await sheets.spreadsheets.get({
      spreadsheetId,
      ranges: [`'${targetSheetTitle}'!${range}`],
      includeGridData: true,
    });

    const sheetData = response.data.sheets?.[0];
    if (!sheetData) {
      return { success: false, error: `'${targetSheetTitle}' 시트 데이터를 가져오지 못했습니다.` };
    }

    const gridData = sheetData.data?.[0];
    if (!gridData?.rowData?.length) {
      return { success: false, error: `'${targetSheetTitle}' 시트가 비어있습니다.` };
    }

    const values: string[][] = [];
    const hyperlinks: (string | null)[][] = [];

    for (const rowData of gridData.rowData ?? []) {
      const valueRow: string[] = [];
      const hlRow: (string | null)[] = [];
      for (const cell of rowData.values ?? []) {
        valueRow.push(cell.formattedValue ?? "");

        // 하이퍼링크 추출 — 3가지 저장 방식 모두 커버
        let hl: string | null = null;

        // ① 직접 삽입 링크 (오른쪽 클릭 → 링크 삽입)
        if (cell.hyperlink) {
          hl = cell.hyperlink;
        }

        // ② =HYPERLINK("url","텍스트") 수식
        if (!hl && cell.userEnteredValue?.formulaValue) {
          const m = cell.userEnteredValue.formulaValue.match(/=HYPERLINK\s*\(\s*"([^"]+)"/i);
          if (m) hl = m[1];
        }

        // ③ textFormat.link (리치 텍스트 형식 — 모든 run 순회)
        if (!hl) {
          const runs = (cell as any).textFormatRuns;
          if (Array.isArray(runs)) {
            for (const run of runs) {
              const uri = run?.format?.link?.uri;
              if (uri) { hl = uri; break; }
            }
          }
          if (!hl) {
            const uri =
              (cell.userEnteredFormat as any)?.textFormat?.link?.uri ??
              (cell.effectiveFormat as any)?.textFormat?.link?.uri;
            if (uri) hl = uri;
          }
        }

        hlRow.push(hl);
      }
      values.push(valueRow);
      hyperlinks.push(hlRow);
    }

    return { success: true, data: values, hyperlinks, sheetTitle: targetSheetTitle };
  } catch (error: any) {
    console.error("fetchSpreadsheetDataWithHyperlinks Error:", error);
    return { success: false, error: error.message || "알 수 없는 오류가 발생했습니다." };
  }
}

export async function fetchGanttSheetData(sheetUrl: string) {
  try {
    const match = sheetUrl.match(/\/d\/([a-zA-Z0-9-_]+)/);
    if (!match) throw new Error("유효하지 않은 구글 스프레드시트 주소입니다.");
    
    const spreadsheetId = match[1];
    const gidMatch = sheetUrl.match(/gid=([0-9]+)/);
    const targetGid = gidMatch ? parseInt(gidMatch[1]) : null;

    const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    const key = process.env.GOOGLE_SERVICE_ACCOUNT_KEY?.replace(/\\n/g, "\n"); 

    if (!email || !key) {
      throw new Error("서버 환경 변수에 구글 서비스 계정 인증 정보가 없습니다 (GOOGLE_SERVICE_ACCOUNT_KEY).");
    }

    const auth = new google.auth.GoogleAuth({
      credentials: { client_email: email, private_key: key },
      scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
    });

    const sheets = google.sheets({ version: "v4", auth });
    
    const info = await sheets.spreadsheets.get({ spreadsheetId });
    const allSheets = info.data.sheets || [];
    let targetSheetTitle = allSheets[0]?.properties?.title || "Sheet1";

    if (targetGid !== null) {
      const foundSheet = allSheets.find(s => s.properties?.sheetId === targetGid);
      if (foundSheet && foundSheet.properties?.title) {
        targetSheetTitle = foundSheet.properties.title;
      }
    }

    const response = await sheets.spreadsheets.get({
      spreadsheetId,
      ranges: [targetSheetTitle],
      includeGridData: true,
    });

    const sheetData = response.data.sheets?.[0];
    if (!sheetData) {
      return { success: false, error: `'${targetSheetTitle}' 시트 데이터를 가져오지 못했습니다.` };
    }

    return { success: true, sheetData, sheetTitle: targetSheetTitle };
  } catch (error: any) {
    console.error("fetchGanttSheetData Error:", error);
    return { success: false, error: error.message || "알 수 없는 오류가 발생했습니다." };
  }
}
