import { NextResponse } from "next/server";
import { fetchSpreadsheetData } from "@/lib/google-sheets";

export async function POST(req: Request) {
  try {
    const { sheetUrl, range } = await req.json();
    if (!sheetUrl) return NextResponse.json({ success: false, error: "sheetUrl이 필요합니다." }, { status: 400 });
    const result = await fetchSpreadsheetData(sheetUrl, range);
    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}
