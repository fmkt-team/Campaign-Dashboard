import { NextResponse } from "next/server";
import { fetchGanttSheetData } from "@/lib/google-sheets";
import { parseGanttSheetData } from "@/lib/sheet-parser";

export async function POST(req: Request) {
  try {
    const { sheetUrl, campaignStartDate } = await req.json();
    if (!sheetUrl) return NextResponse.json({ success: false, error: "sheetUrl이 필요합니다." }, { status: 400 });
    
    const result = await fetchGanttSheetData(sheetUrl);
    if (!result.success || !result.sheetData) {
      return NextResponse.json({ success: false, error: result.error }, { status: 500 });
    }

    const tasks = parseGanttSheetData(result.sheetData, campaignStartDate);
    
    // 프론트엔드의 PastedRow 포맷에 맞게 데이터 전달
    return NextResponse.json({ success: true, data: tasks });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}
