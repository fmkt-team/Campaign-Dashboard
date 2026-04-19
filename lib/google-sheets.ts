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
