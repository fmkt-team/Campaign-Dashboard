
import { NextResponse } from "next/server";
import { fetchSpreadsheetData } from "@/lib/google-sheets";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const result = await fetchSpreadsheetData("https://docs.google.com/spreadsheets/d/1dO-gUh7pzaw9kFf5TSU1nUlTk1PXhbAXbGctW9bG8ao/edit?gid=1989526753#gid=1989526753", "A1:Z10");
    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json({ error: e.message });
  }
}

