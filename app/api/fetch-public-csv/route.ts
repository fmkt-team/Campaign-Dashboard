import { NextRequest, NextResponse } from "next/server";

/**
 * 공개 구글 시트를 CSV로 가져와 2D 배열로 반환.
 * 서비스 계정 인증 없이 "링크 공개" 시트에 접근 가능.
 */
export async function POST(req: NextRequest) {
  try {
    const { sheetUrl } = await req.json();
    if (!sheetUrl) {
      return NextResponse.json({ success: false, error: "sheetUrl이 필요합니다." }, { status: 400 });
    }

    // 시트 ID 추출
    const idMatch = sheetUrl.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
    if (!idMatch) {
      return NextResponse.json({ success: false, error: "올바른 구글 시트 URL이 아닙니다." }, { status: 400 });
    }
    const sheetId = idMatch[1];

    // gid 파라미터 추출 (없으면 기본 시트)
    const gidMatch = sheetUrl.match(/[?&]gid=(\d+)/);
    const gid = gidMatch ? gidMatch[1] : null;

    const csvUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv${gid ? `&gid=${gid}` : ""}`;

    const res = await fetch(csvUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0",
      },
    });

    if (!res.ok) {
      return NextResponse.json(
        { success: false, error: `시트 접근 실패 (HTTP ${res.status}). 시트가 "링크 공개" 상태인지 확인해주세요.` },
        { status: res.status }
      );
    }

    const csv = await res.text();

    // CSV → 2D 배열 파싱
    const rows = parseCSV(csv);

    return NextResponse.json({ success: true, data: rows });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}

function parseCSV(csv: string): string[][] {
  const rows: string[][] = [];
  const lines = csv.split("\n");
  for (const line of lines) {
    if (!line.trim()) continue;
    const cells: string[] = [];
    let cur = "";
    let inQuote = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuote && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuote = !inQuote;
        }
      } else if (ch === "," && !inQuote) {
        cells.push(cur.trim());
        cur = "";
      } else {
        cur += ch;
      }
    }
    cells.push(cur.trim());
    rows.push(cells);
  }
  return rows;
}
