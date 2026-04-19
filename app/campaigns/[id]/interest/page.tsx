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

export default function InterestPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const campaignId = id as Id<"campaigns">;

  const activities = useQuery(api.interest.getInterestActivities, { campaignId }) ?? [];
  const syncActivities = useMutation(api.interest.syncInterestActivities);

  const [pastedData, setPastedData] = useState<any[] | null>(null);

  useEffect(() => {
    const handler = (e: ClipboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") return;
      const text = e.clipboardData?.getData("text") ?? "";
      if (!text.trim()) return;

      // 8열 (유형, 타이틀, 장소/대상, 시작일, 종료일, 예상방문, 참여, 예산)
      const parsed = parsePasteText(text, 8);
      setPastedData(parsed);
      e.preventDefault();
    };
    window.addEventListener("paste", handler);
    return () => window.removeEventListener("paste", handler);
  }, []);

  const handleApplyPaste = async () => {
    if (!pastedData) return;
    const rows = pastedData.map(cols => ({
      activityType: cols[0],
      title: cols[1],
      locationOrTarget: cols[2],
      startDate: cols[3],
      endDate: cols[4],
      visitors: processNumber(cols[5]),
      participants: processNumber(cols[6]),
      budget: processNumber(cols[7])
    }));
    await syncActivities({ campaignId, rows });
    setPastedData(null);
  };

  return (
    <div className="flex flex-col gap-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
      
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl font-bold text-white">흥미 상세 (팝업/이벤트) 모니터링</h2>
            <p className="text-xs text-white/40 mt-1">
              소비자 흥미 유도를 위한 오프라인 팝업 및 이벤트 성과를 공유합니다.<br/>
              빈 화면에서 <kbd className="bg-white/10 px-1.5 py-0.5 rounded text-white/80">Ctrl+V</kbd> 로 엑셀(유형,명칭,장소,시작,종료,방문자,참여자,진행예산 8개열)을 붙여넣으세요.
            </p>
          </div>
        </div>
        
        <GlassCard className="p-0 overflow-hidden min-h-[150px]">
          {activities.length === 0 ? (
             <div className="flex items-center justify-center h-[150px] text-white/30 text-sm">
               엑셀/스프레드시트에서 표를 복사한 뒤 이 화면에서 붙여넣기 해보세요.
             </div>
          ) : (
            <Table>
              <TableHeader className="bg-white/5">
                <TableRow className="border-white/10 hover:bg-transparent">
                  <TableHead className="text-white/60">유형</TableHead>
                  <TableHead className="text-white/60">행사 / 이벤트명</TableHead>
                  <TableHead className="text-white/60">장소 / 타겟</TableHead>
                  <TableHead className="text-white/60 text-right">방문자 수</TableHead>
                  <TableHead className="text-white/60 text-right">참여자 (액션) 수</TableHead>
                  <TableHead className="text-white/60 text-right">진행 예산</TableHead>
                  <TableHead className="text-white/60 text-right">진행 기간</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {activities.map(row => (
                  <TableRow key={row._id} className="border-white/10 hover:bg-white/5 text-sm">
                    <TableCell className="text-white/80">
                      <span className="bg-indigo-500/20 text-indigo-300 px-2 py-0.5 rounded border border-indigo-500/30 text-xs">
                        {row.activityType}
                      </span>
                    </TableCell>
                    <TableCell className="font-medium text-white">{row.title}</TableCell>
                    <TableCell className="text-white/60">{row.locationOrTarget}</TableCell>
                    <TableCell className="text-right font-mono text-white/80">{row.visitors.toLocaleString()}</TableCell>
                    <TableCell className="text-right font-mono text-white font-bold">{row.participants.toLocaleString()}</TableCell>
                    <TableCell className="text-right text-white/50">{row.budget.toLocaleString()}원</TableCell>
                    <TableCell className="text-right text-white/50">{row.startDate} ~ {row.endDate}</TableCell>
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
              <h3 className="text-white font-bold">오프라인/이벤트 활동 감지됨 ({pastedData.length}건)</h3>
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
