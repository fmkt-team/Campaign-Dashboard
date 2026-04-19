import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";
import { parseCsv, parseTimelineSheet } from "@/lib/sheet-parser";

const SHEET_ID = "1p6ILP4rv6NF4u6MaUfhkI4zZtATkuhsfOF0XWlz-DS8";
const SHEET_GID = "598518381"; // 🕒 TimeLine 시트

/**
 * GET /api/sync-sheet?campaignStartDate=YYYY-MM-DD
 *
 * 서비스 계정(Service Account) 인증을 사용해 비공개 구글 시트를 읽어옵니다.
 * 
 * 필요한 환경 변수 (.env.local):
 *   GOOGLE_SERVICE_ACCOUNT_EMAIL=xxx@project.iam.gserviceaccount.com
 *   GOOGLE_SERVICE_ACCOUNT_KEY=-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n
 */
export async function GET(req: NextRequest) {
  const campaignStartDate =
    req.nextUrl.searchParams.get("campaignStartDate") || "2026-01-01";

  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const rawKey = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;

  // ── 환경 변수 미설정 안내 ──────────────────────────────────────────────────
  if (!email || !rawKey) {
    return NextResponse.json(
      {
        error: "NO_CREDENTIALS",
        message:
          "Google 서비스 계정 환경 변수가 설정되지 않았습니다. " +
          ".env.local 에 GOOGLE_SERVICE_ACCOUNT_EMAIL 과 GOOGLE_SERVICE_ACCOUNT_KEY 를 추가해 주세요.",
        guide: [
          "1. Google Cloud Console → [IAM 및 관리자] → [서비스 계정] → [+ 서비스 계정 만들기]",
          "2. 생성 후 [키] 탭 → [키 추가] → JSON 다운로드",
          "3. JSON 파일에서 client_email → GOOGLE_SERVICE_ACCOUNT_EMAIL",
          "4. JSON 파일에서 private_key  → GOOGLE_SERVICE_ACCOUNT_KEY",
          "5. 구글 시트에서 해당 이메일을 '뷰어'로 공유",
        ],
      },
      { status: 503 }
    );
  }

  try {
    // \n 이스케이프 복원 (환경 변수에 저장 시 \\n 으로 저장된 경우)
    const privateKey = rawKey.replace(/\\n/g, "\n");

    // ── Google Auth 초기화 ─────────────────────────────────────────────────
    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: email,
        private_key: privateKey,
      },
      scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
    });

    const sheets = google.sheets({ version: "v4", auth });

    // ── 시트 메타데이터 조회 (gid → sheetTitle 변환) ──────────────────────
    const meta = await sheets.spreadsheets.get({
      spreadsheetId: SHEET_ID,
    });
    
    const targetSheet = meta.data.sheets?.find(
      (s) => String(s.properties?.sheetId) === SHEET_GID
    );
    const sheetTitle = targetSheet?.properties?.title || "Sheet1";

    // ── 시트 데이터 조회 ────────────────────────────────────────────────────
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: sheetTitle, // 시트 전체
    });

    const rawRows = response.data.values;
    if (!rawRows || rawRows.length === 0) {
      return NextResponse.json(
        { error: "EMPTY_SHEET", message: "시트가 비어있거나 읽을 수 없습니다." },
        { status: 400 }
      );
    }

    // 모든 셀을 string 배열로 정규화
    const rows: string[][] = rawRows.map((row) =>
      row.map((cell) => String(cell ?? ""))
    );

    const tasks = parseTimelineSheet(rows, campaignStartDate);

    return NextResponse.json({ tasks, totalRows: rows.length, sheetTitle });
  } catch (err: any) {
    const message = err?.message || "알 수 없는 오류";
    const isAuthError =
      message.includes("invalid_grant") ||
      message.includes("PERMISSION_DENIED") ||
      message.includes("not have access");

    return NextResponse.json(
      {
        error: isAuthError ? "AUTH_FAILED" : "INTERNAL_ERROR",
        message: isAuthError
          ? `서비스 계정 인증에 실패했습니다. 구글 시트에 ${email} 이메일이 '뷰어'로 공유되어 있는지 확인해 주세요.`
          : message,
      },
      { status: isAuthError ? 403 : 500 }
    );
  }
}
