"use client";

import { use, useState, useEffect } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { GlassCard } from "@/components/glass-card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Check, X } from "lucide-react";

function parsePasteText(text: string, colsCount: number) {
  const rows = text.split(/\r?\n/).filter(line => line.trim());
  return rows.map(line => {
    const cols = line.split("\t").map(c => c.trim() || "");
    while (cols.length < colsCount) cols.push("");
    return cols;
  });
}

function processNumber(val: string) {
  const num = parseFloat(val.replace(/[^0-9.-]+/g,""));
  return isNaN(num) ? 0 : num;
}

export default function InflowPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const campaignId = id as Id<"campaigns">;

  const traffic = useQuery(api.inflow.getTrafficWeekly, { campaignId }) ?? [];
  const syncTraffic = useMutation(api.inflow.syncTrafficWeekly);

  const [pastedData, setPastedData] = useState<any[] | null>(null);

  useEffect(() => {
    const handler = (e: ClipboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") return;
      const text = e.clipboardData?.getData("text") ?? "";
      if (!text.trim()) return;

      // 5열 (주차라벨, 주차시작일, 세션수, 유저수, 평균체류시간)
      const parsed = parsePasteText(text, 5);
      setPastedData(parsed);
      e.preventDefault();
    };
    window.addEventListener("paste", handler);
    return () => window.removeEventListener("paste", handler);
  }, []);

  const handleApplyPaste = async () => {
    if (!pastedData) return;
    const rows = pastedData.map(cols => ({
      weekLabel: cols[0],
      weekStart: cols[1],
      sessions: processNumber(cols[2]),
      users: processNumber(cols[3]),
      avgEngagementSec: processNumber(cols[4]),
    }));
    await syncTraffic({ campaignId, rows });
    setPastedData(null);
  };

  return (
    <div className="flex flex-col gap-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
      
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl font-bold text-white">유입 통계 (GA 데이터 연동)</h2>
            <p className="text-xs text-white/40 mt-1">
              특정 페이지나 캠페인의 요일/주차별 GA 데이터를 모니터링합니다.<br/>
              빈 화면에서 <kbd className="bg-white/10 px-1.5 py-0.5 rounded text-white/80">Ctrl+V</kbd> 로 엑셀(주차명, 주시작일, 세션, 유저, 참여시간)을 붙여넣으세요.
            </p>
          </div>
        </div>
        
        <GlassCard className="p-0 overflow-hidden min-h-[150px]">
          {traffic.length === 0 ? (
             <div className="flex items-center justify-center h-[150px] text-white/30 text-sm">
               구글 애널리틱스 리포트 시트를 복사한 뒤 이 화면에서 붙여넣기 기능으로 연동하세요.
             </div>
          ) : (
            <Table>
              <TableHeader className="bg-white/5">
                <TableRow className="border-white/10 hover:bg-transparent">
                  <TableHead className="text-white/60">기간(Label)</TableHead>
                  <TableHead className="text-white/60">측정 시작일</TableHead>
                  <TableHead className="text-white/60 text-right">세션 수 (Sessions)</TableHead>
                  <TableHead className="text-white/60 text-right">유저 수 (Users)</TableHead>
                  <TableHead className="text-white/60 text-right">평균 참여 시간(초)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {traffic.map(row => (
                  <TableRow key={row._id} className="border-white/10 hover:bg-white/5 text-sm">
                    <TableCell className="font-medium text-white">{row.weekLabel}</TableCell>
                    <TableCell className="text-white/50">{row.weekStart}</TableCell>
                    <TableCell className="text-right font-mono text-white/80">{row.sessions.toLocaleString()}</TableCell>
                    <TableCell className="text-right font-mono text-white font-bold">{row.users.toLocaleString()}</TableCell>
                    <TableCell className="text-right font-mono text-white/60">{row.avgEngagementSec}s</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </GlassCard>
      </div>

      {pastedData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="bg-[#111] border border-white/20 rounded-2xl p-6 w-[600px] flex flex-col shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-white font-bold">유입 데이터 감지됨 ({pastedData.length}건)</h3>
              <button onClick={() => setPastedData(null)} className="text-white/40 hover:text-white"><X className="w-4 h-4" /></button>
            </div>
            <div className="overflow-y-auto max-h-[40vh] space-y-1 mb-6 border border-white/10 p-2 rounded-lg">
              {pastedData.slice(0, 5).map((row, i) => (
                <div key={i} className="flex gap-2 text-xs text-white/50 whitespace-nowrap bg-white/5 rounded p-1.5 overflow-hidden">
                  {row.map((col: string, j: number) => <span key={j} className="w-20 truncate">{col}</span>)}
                </div>
              ))}
              {pastedData.length > 5 && <div className="text-center text-xs text-white/30 pt-2">+ {pastedData.length - 5} rows</div>}
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="ghost" className="text-white/50" onClick={() => setPastedData(null)}>취소</Button>
              <Button className="bg-white text-black hover:bg-white/80" onClick={handleApplyPaste}>
                <Check className="w-4 h-4 mr-2" /> 확인 및 업로드 적용
              </Button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
