"use client";

import { use, useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { GlassCard } from "@/components/glass-card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Check, X, UploadCloud, TrendingUp, TrendingDown, Minus } from "lucide-react";
import * as xlsx from "xlsx";

// ── 숫자 파싱 ──────────────────────────────────────────────────────
function parseNum(val: any): number {
  if (val === null || val === undefined || val === "") return 0;
  const n = parseFloat(String(val).replace(/[^0-9.-]+/g, ""));
  return isNaN(n) ? 0 : n;
}

// ── 붙여넣기 텍스트 파싱 ──────────────────────────────────────────
function parsePasteText(text: string, colsCount: number): string[][] {
  return text
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .map((line) => {
      const cols = line.split("\t").map((c) => c.trim() || "");
      while (cols.length < colsCount) cols.push("");
      return cols;
    });
}

// ── 제품별 합산 ───────────────────────────────────────────────────
function aggregateByProduct(data: any[]) {
  const map = new Map<string, { revenue2025: number; revenue2026: number }>();
  for (const row of data) {
    const prev = map.get(row.productName) ?? { revenue2025: 0, revenue2026: 0 };
    map.set(row.productName, {
      revenue2025: prev.revenue2025 + row.revenue2025,
      revenue2026: prev.revenue2026 + row.revenue2026,
    });
  }
  return Array.from(map.entries())
    .map(([productName, vals]) => ({ productName, ...vals }))
    .sort((a, b) => b.revenue2026 - a.revenue2026);
}

// ── 주차별 합산 ───────────────────────────────────────────────────
function aggregateByWeek(data: any[]) {
  const map = new Map<string, { revenue2025: number; revenue2026: number }>();
  for (const row of data) {
    const prev = map.get(row.weekLabel) ?? { revenue2025: 0, revenue2026: 0 };
    map.set(row.weekLabel, {
      revenue2025: prev.revenue2025 + row.revenue2025,
      revenue2026: prev.revenue2026 + row.revenue2026,
    });
  }
  return Array.from(map.entries())
    .map(([weekLabel, vals]) => ({ weekLabel, ...vals }))
    .sort((a, b) => a.weekLabel.localeCompare(b.weekLabel));
}

// ── 차트 바 ───────────────────────────────────────────────────────
function MiniBarChart({ data, max }: { data: { label: string; v2025: number; v2026: number }[]; max: number }) {
  return (
    <div className="flex flex-col gap-3">
      {data.map((item) => {
        const pct2025 = max > 0 ? (item.v2025 / max) * 100 : 0;
        const pct2026 = max > 0 ? (item.v2026 / max) * 100 : 0;
        const growth = item.v2025 > 0 ? ((item.v2026 - item.v2025) / item.v2025) * 100 : 0;
        return (
          <div key={item.label} className="flex items-center gap-4">
            <span className="text-xs text-gray-900/50 w-20 shrink-0 truncate">{item.label}</span>
            <div className="flex-1 flex flex-col gap-1">
              <div className="flex items-center gap-1">
                <span className="text-[10px] text-gray-900/30 w-8">전년</span>
                <div className="flex-1 h-3 bg-gray-50 rounded overflow-hidden">
                  <div
                    className="h-full bg-white/20 rounded transition-all duration-700"
                    style={{ width: `${pct2025}%` }}
                  />
                </div>
                <span className="text-[10px] text-gray-900/40 w-20 text-right">{item.v2025.toLocaleString()}</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="text-[10px] text-indigo-400 w-8">올해</span>
                <div className="flex-1 h-3 bg-gray-50 rounded overflow-hidden">
                  <div
                    className="h-full bg-indigo-500 rounded transition-all duration-700"
                    style={{ width: `${pct2026}%` }}
                  />
                </div>
                <span className="text-[10px] text-gray-900 w-20 text-right font-bold">{item.v2026.toLocaleString()}</span>
              </div>
            </div>
            <div className={`text-xs font-bold w-14 text-right shrink-0 ${
              growth > 0 ? "text-green-400" : growth < 0 ? "text-red-400" : "text-gray-900/30"
            }`}>
              {growth > 0 ? "+" : ""}{growth.toFixed(1)}%
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── 메인 페이지 ───────────────────────────────────────────────────
export default function SalesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const campaignId = id as Id<"campaigns">;

  const salesData = useQuery(api.sales.getSalesWeekly, { campaignId }) ?? [];
  const syncSales = useMutation(api.sales.syncSalesWeekly);

  const [pastedData, setPastedData] = useState<string[][] | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [tab, setTab] = useState<"product" | "week">("product");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── 클립보드 붙여넣기 감지 ──
  useEffect(() => {
    const handler = (e: ClipboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") return;
      const text = e.clipboardData?.getData("text") ?? "";
      if (!text.trim()) return;
      // 4열: 제품명, 주차, 전년수주액, 금년수주액
      setPastedData(parsePasteText(text, 4));
      e.preventDefault();
    };
    window.addEventListener("paste", handler);
    return () => window.removeEventListener("paste", handler);
  }, []);

  // ── 엑셀 파일 업로드 ──
  const handleExcelUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const wb = xlsx.read(evt.target?.result, { type: "binary" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const raw = xlsx.utils.sheet_to_json(ws, { header: 1, raw: false }) as string[][];
      setPastedData(raw.filter((r) => r.some((c) => c)));
    };
    reader.readAsBinaryString(file);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // ── 동기화 ──
  const handleApply = async () => {
    if (!pastedData) return;
    setIsSyncing(true);
    try {
      const rows = pastedData.map((cols) => ({
        productName: cols[0] || "-",
        weekLabel: cols[1] || "-",
        revenue2025: parseNum(cols[2]),
        revenue2026: parseNum(cols[3]),
      }));
      await syncSales({ campaignId, rows });
    } catch (e: any) {
      alert("동기화 실패: " + e.message);
    } finally {
      setIsSyncing(false);
      setPastedData(null);
    }
  };

  // ── 집계 데이터 ──
  const byProduct = aggregateByProduct(salesData);
  const byWeek = aggregateByWeek(salesData);

  const total2025 = salesData.reduce((s, r) => s + r.revenue2025, 0);
  const total2026 = salesData.reduce((s, r) => s + r.revenue2026, 0);
  const totalGrowth = total2025 > 0 ? ((total2026 - total2025) / total2025) * 100 : 0;

  const maxProductVal = Math.max(...byProduct.map((r) => Math.max(r.revenue2025, r.revenue2026)), 1);
  const maxWeekVal = Math.max(...byWeek.map((r) => Math.max(r.revenue2025, r.revenue2026)), 1);

  return (
    <div className="flex flex-col gap-8 animate-in fade-in slide-in-from-bottom-4 duration-500">

      {/* 헤더 & 업로드 버튼 */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900">매출 상세 분석</h2>
          <p className="text-xs text-gray-900/40 mt-1">
            전년 동기 대비 수주액 비교 · 제품별/주차별 뷰
          </p>
        </div>
        <div className="flex gap-2">
          <label className="cursor-pointer">
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              ref={fileInputRef}
              onChange={handleExcelUpload}
              className="hidden"
            />
            <span className="inline-flex items-center gap-2 text-xs font-medium px-3 py-1.5 rounded-md border border-gray-200 text-gray-900/80 hover:bg-gray-100 transition-colors">
              <UploadCloud className="w-3.5 h-3.5" /> 엑셀 업로드
            </span>
          </label>
          <div className="text-xs text-gray-900/30 flex items-center gap-1.5 border border-gray-100 rounded-md px-3 py-1.5">
            또는 <kbd className="bg-gray-100 px-1.5 py-0.5 rounded text-gray-900/60">Ctrl+V</kbd> 로 붙여넣기
          </div>
        </div>
      </div>

      {/* KPI 요약 카드 */}
      {salesData.length > 0 && (
        <div className="grid grid-cols-3 gap-4">
          <GlassCard className="p-5">
            <p className="text-xs text-gray-900/40 mb-1">전년 총 수주액</p>
            <p className="text-2xl font-bold font-mono text-gray-900/60">
              {(total2025 / 1e4).toFixed(0)}만원
            </p>
          </GlassCard>
          <GlassCard className="p-5">
            <p className="text-xs text-gray-900/40 mb-1">올해 총 수주액</p>
            <p className="text-2xl font-bold font-mono text-gray-900">
              {(total2026 / 1e4).toFixed(0)}만원
            </p>
          </GlassCard>
          <GlassCard className="p-5 relative overflow-hidden">
            <div className={`absolute inset-0 opacity-10 ${totalGrowth >= 0 ? "bg-green-500" : "bg-red-500"}`} />
            <p className="text-xs text-gray-900/40 mb-1">전년 대비 성장률</p>
            <div className="flex items-center gap-2">
              {totalGrowth > 0
                ? <TrendingUp className="w-5 h-5 text-green-400" />
                : totalGrowth < 0
                ? <TrendingDown className="w-5 h-5 text-red-400" />
                : <Minus className="w-5 h-5 text-gray-900/40" />}
              <p className={`text-2xl font-bold font-mono ${
                totalGrowth > 0 ? "text-green-400" : totalGrowth < 0 ? "text-red-400" : "text-gray-900/40"
              }`}>
                {totalGrowth > 0 ? "+" : ""}{totalGrowth.toFixed(1)}%
              </p>
            </div>
          </GlassCard>
        </div>
      )}

      {/* 탭 전환 */}
      <div className="flex items-center gap-1 bg-white w-max p-1 rounded-lg border border-gray-100">
        {(["product", "week"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-1.5 text-xs font-medium rounded-md transition-colors ${
              tab === t ? "bg-white text-black" : "text-gray-900/50 hover:text-gray-900/80"
            }`}
          >
            {t === "product" ? "제품별" : "주차별"} 비교
          </button>
        ))}
      </div>

      {/* 차트 섹션 */}
      {salesData.length === 0 ? (
        <GlassCard className="h-64 flex flex-col items-center justify-center gap-3 border-dashed">
          <UploadCloud className="w-8 h-8 text-gray-900/20" />
          <p className="text-gray-900/30 text-sm">
            엑셀 파일 업로드 또는 스프레드시트 데이터를 붙여넣으세요
          </p>
          <p className="text-gray-900/20 text-xs">
            형식: 제품명 | 주차(예: 25W1) | 전년수주액 | 금년수주액
          </p>
        </GlassCard>
      ) : (
        <>
          {/* 차트 */}
          <GlassCard className="p-6">
            <h3 className="text-sm font-semibold text-gray-900/60 uppercase tracking-wider mb-6">
              {tab === "product" ? "제품별" : "주차별"} 전년 대비 수주액
            </h3>
            <MiniBarChart
              data={
                tab === "product"
                  ? byProduct.map((r) => ({ label: r.productName, v2025: r.revenue2025, v2026: r.revenue2026 }))
                  : byWeek.map((r) => ({ label: r.weekLabel, v2025: r.revenue2025, v2026: r.revenue2026 }))
              }
              max={tab === "product" ? maxProductVal : maxWeekVal}
            />
          </GlassCard>

          {/* 상세 테이블 */}
          <GlassCard className="p-0 overflow-hidden">
            <Table>
              <TableHeader className="bg-gray-50">
                <TableRow className="border-gray-100 hover:bg-transparent">
                  {tab === "product" ? (
                    <>
                      <TableHead className="text-gray-900/60">제품명</TableHead>
                      <TableHead className="text-gray-900/60 text-right">전년 수주액</TableHead>
                      <TableHead className="text-gray-900/60 text-right">올해 수주액</TableHead>
                      <TableHead className="text-gray-900/60 text-right">증감액</TableHead>
                      <TableHead className="text-gray-900/60 text-right">성장률</TableHead>
                    </>
                  ) : (
                    <>
                      <TableHead className="text-gray-900/60">주차</TableHead>
                      <TableHead className="text-gray-900/60 text-right">전년 수주액</TableHead>
                      <TableHead className="text-gray-900/60 text-right">올해 수주액</TableHead>
                      <TableHead className="text-gray-900/60 text-right">증감액</TableHead>
                      <TableHead className="text-gray-900/60 text-right">성장률</TableHead>
                    </>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {(tab === "product" ? byProduct : byWeek).map((row: any, i) => {
                  const label = tab === "product" ? row.productName : row.weekLabel;
                  const diff = row.revenue2026 - row.revenue2025;
                  const growth = row.revenue2025 > 0 ? ((diff) / row.revenue2025) * 100 : 0;
                  return (
                    <TableRow key={i} className="border-gray-100 hover:bg-gray-50 text-sm">
                      <TableCell className="font-medium text-gray-900">{label}</TableCell>
                      <TableCell className="text-right font-mono text-gray-900/50">
                        {row.revenue2025.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right font-mono text-gray-900 font-bold">
                        {row.revenue2026.toLocaleString()}
                      </TableCell>
                      <TableCell className={`text-right font-mono ${diff >= 0 ? "text-green-400" : "text-red-400"}`}>
                        {diff >= 0 ? "+" : ""}{diff.toLocaleString()}
                      </TableCell>
                      <TableCell className={`text-right font-bold ${
                        growth > 0 ? "text-green-400" : growth < 0 ? "text-red-400" : "text-gray-900/30"
                      }`}>
                        {growth > 0 ? "+" : ""}{growth.toFixed(1)}%
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </GlassCard>
        </>
      )}

      {/* 붙여넣기 확인 모달 */}
      {pastedData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-white/90 backdrop-blur-sm">
          <div className="bg-white border border-gray-200 rounded-2xl p-6 w-[600px] flex flex-col shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-gray-900 font-bold">매출 데이터 감지됨 ({pastedData.length}건)</h3>
              <button onClick={() => setPastedData(null)} className="text-gray-900/40 hover:text-gray-900">
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-gray-900/40 mb-3">
              예상 형식: <span className="text-gray-900/60">[제품명] [주차] [전년수주액] [금년수주액]</span>
            </p>
            <div className="overflow-y-auto max-h-[40vh] space-y-1 mb-6 border border-gray-100 p-2 rounded-lg">
              {pastedData.slice(0, 8).map((row, i) => (
                <div key={i} className="flex gap-2 text-xs text-gray-900/50 whitespace-nowrap bg-gray-50 rounded p-1.5 overflow-hidden">
                  {row.map((col, j) => (
                    <span key={j} className="w-24 truncate">{col || "(빈값)"}</span>
                  ))}
                </div>
              ))}
              {pastedData.length > 8 && (
                <div className="text-center text-xs text-gray-900/30 pt-2">+ {pastedData.length - 8}행 더 있음</div>
              )}
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="ghost" className="text-gray-900/50" onClick={() => setPastedData(null)}>취소</Button>
              <Button
                className="bg-white text-black hover:bg-white/80"
                onClick={handleApply}
                disabled={isSyncing}
              >
                <Check className="w-4 h-4 mr-2" />
                {isSyncing ? "저장 중..." : "확인 및 업로드"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
