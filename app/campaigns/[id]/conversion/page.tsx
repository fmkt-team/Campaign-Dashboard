"use client";

import { use, useState, useEffect, useCallback, useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { GlassCard } from "@/components/glass-card";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend,
} from "recharts";
import { RefreshCw, Search, Calendar as CalendarIcon, X, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { DatePickerWithRange } from "@/components/date-range-picker";
import { DateRange } from "react-day-picker";
import { format, startOfMonth, endOfMonth } from "date-fns";

// ─── 색상 팔레트 ──────────────────────────────────────────────────────────────
const LINE_COLORS = ["#ffffff", "#818cf8", "#34d399", "#f59e0b", "#f87171", "#38bdf8"];

// ─── 메인 ─────────────────────────────────────────────────────────────────────
export default function InflowPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const campaignId = id as Id<"campaigns">;

  // 1. 통합 날짜 범위 상태 (기본값: 이번 달)
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: startOfMonth(new Date()),
    to: endOfMonth(new Date()),
  });

  // 2. 데이터 유효성 검사 및 변환
  const dateStr = useMemo(() => ({
    start: dateRange?.from ? format(dateRange.from, "yyyy-MM-dd") : "",
    end: dateRange?.to ? format(dateRange.to, "yyyy-MM-dd") : format(dateRange?.from || new Date(), "yyyy-MM-dd"),
  }), [dateRange]);

  // ─── GA4 자동 조회 로직 ────────────────────────────────────────────────────
  const [ga4Data, setGa4Data] = useState<any[] | null>(null);
  const [ga4Loading, setGa4Loading] = useState(false);
  const [ga4Error, setGa4Error] = useState("");
  const [ga4TimeUnit, setGa4TimeUnit] = useState<"date" | "week" | "month">("date");

  const fetchGA4 = useCallback(async () => {
    if (!dateStr.start) return;
    setGa4Loading(true); setGa4Error("");
    try {
      const res = await fetch("/api/ga4-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
            startDate: dateStr.start, 
            endDate: dateStr.end,
            timeUnit: ga4TimeUnit 
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "GA4 API 오류");
      setGa4Data(data.rows ?? []);
    } catch (e: any) {
      setGa4Error(e.message);
    } finally {
      setGa4Loading(false);
    }
  }, [dateStr.start, dateStr.end, ga4TimeUnit]);

  // ─── 네이버 키워드 트렌드 로직 ───────────────────────────────────────────────
  const [keywordGroups, setKeywordGroups] = useState<{ groupName: string; keywords: string[] }[]>([
    { groupName: "퍼시스", keywords: ["퍼시스", "FURSYS"] },
  ]);
  const [trendData, setTrendData]     = useState<any | null>(null);
  const [loadingTrend, setLoadingTrend] = useState(false);
  const [trendError, setTrendError]   = useState("");
  const [timeUnit, setTimeUnit] = useState<"date" | "week" | "month">("date");

  const fetchTrend = useCallback(async () => {
    if (!dateStr.start || keywordGroups.length === 0) return;
    setLoadingTrend(true); setTrendError("");
    try {
      const res = await fetch("/api/naver-keyword-trend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
            startDate: dateStr.start, 
            endDate: dateStr.end, 
            timeUnit: timeUnit, 
            keywordGroups 
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "네이버 API 오류");
      setTrendData(data);
    } catch (e: any) {
      setTrendError(e.message);
    } finally {
      setLoadingTrend(false);
    }
  }, [dateStr.start, dateStr.end, timeUnit, keywordGroups]);

  // 3. 자동 페칭
  useEffect(() => { fetchGA4(); }, [fetchGA4]);
  useEffect(() => { fetchTrend(); }, [fetchTrend]);

  // ─── 차트 데이터 변환 ───────────────────────────────────────────────────────
  const naverChartData = useMemo(() => {
    if (!trendData?.results?.length) return [];
    const allDates = trendData.results[0].data.map((d: any) => d.period);
    return allDates.map((date: string, i: number) => {
      const row: any = { date: date.slice(5) }; // MM-DD
      for (const g of trendData.results) {
        row[g.title] = g.data[i]?.ratio ?? 0;
      }
      return row;
    });
  }, [trendData]);

  const formattedGa4Data = useMemo(() => {
    if (!ga4Data) return [];
    return ga4Data.map(r => {
      let label = r.date || r.isoYearIsoWeek || r.yearMonth || "";
      // GA4 형식 변환 (YYYYMMDD -> MM/DD, YYYYWW -> Wxx, YYYYMM -> YYYY/MM)
      if (ga4TimeUnit === "date" && label.length === 8) {
        label = label.slice(4).replace(/(\d{2})(\d{2})/, "$1/$2");
      } else if (ga4TimeUnit === "week" && label.length === 6) {
        label = `W${label.slice(4)}`;
      } else if (ga4TimeUnit === "month" && label.length === 6) {
        label = label.replace(/(\d{4})(\d{2})/, "$1/$2");
      }
      return { 
        ...r, 
        label,
        "세션": r.sessions,
        "유저": r.activeUsers
      };
    });
  }, [ga4Data, ga4TimeUnit]);

  return (
    <div className="flex flex-col gap-10 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20">

      {/* ── 상단 고정 필터 바 ─────────────────────────────────────── */}
      <div className="sticky top-0 z-30 -mx-4 px-4 py-4 bg-black/40 backdrop-blur-xl border-b border-white/5 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            유입 상세 리포트
            <span className="text-[10px] bg-white/10 px-2 py-0.5 rounded text-white/50 font-normal uppercase">Real-Time Sync</span>
          </h2>
        </div>
        <div className="flex items-center gap-4">
             <div className="flex items-center gap-2 text-white/40 text-xs mr-2">
                {ga4Loading || loadingTrend ? (
                    <><RefreshCw className="w-3 h-3 animate-spin" /> 업데이트 중...</>
                ) : (
                    <><Check className="w-3 h-3 text-green-400" /> 데이터 최신화됨</>
                )}
             </div>
             <DatePickerWithRange date={dateRange} setDate={setDateRange} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-12">
        
        {/* ── GA4 데이터 섹션 ─────────────────────────────────────── */}
        <section>
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-4">
                <h3 className="text-lg font-bold text-white">공식몰 유입 성과 (GA4)</h3>
                <div className="flex rounded-lg border border-white/10 overflow-hidden bg-white/5 p-1">
                    {(["date", "week", "month"] as const).map(u => (
                    <button key={u} onClick={() => setGa4TimeUnit(u)}
                        className={cn("px-3 py-1 text-[10px] rounded-md transition-all", ga4TimeUnit === u ? "bg-white text-black font-semibold shadow-lg" : "text-white/40 hover:text-white")}>
                        {u === "date" ? "일" : u === "week" ? "주" : "월"}
                    </button>
                    ))}
                </div>
            </div>
          </div>

          {ga4Error ? (
            <GlassCard className="p-10 text-center border-red-500/20 bg-red-500/5">
                <p className="text-red-400 text-sm">⚠️ {ga4Error}</p>
                <button onClick={fetchGA4} className="mt-4 text-xs text-white/40 hover:text-white underline">다시 시도</button>
            </GlassCard>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
               {/* KPI 카드들 */}
               <div className="lg:col-span-1 flex flex-col gap-4">
                  <GlassCard className="p-6 flex-1 flex flex-col justify-center">
                    <p className="text-xs text-white/40 mb-1 font-medium">총 세션 수</p>
                    <p className="text-3xl font-bold font-mono text-white tracking-tight">
                      {ga4Data ? ga4Data.reduce((s, r) => s + (r.sessions || 0), 0).toLocaleString() : "—"}
                    </p>
                  </GlassCard>
                  <GlassCard className="p-6 flex-1 flex flex-col justify-center">
                    <p className="text-xs text-white/40 mb-1 font-medium">총 사용자 수</p>
                    <p className="text-3xl font-bold font-mono text-white tracking-tight">
                      {ga4Data ? ga4Data.reduce((s, r) => s + (r.activeUsers || 0), 0).toLocaleString() : "—"}
                    </p>
                  </GlassCard>
                  <GlassCard className="p-6 flex-1 flex flex-col justify-center">
                    <p className="text-xs text-white/40 mb-1 font-medium">평균 참여 시간</p>
                    <p className="text-3xl font-bold font-mono text-white tracking-tight text-indigo-400">
                      {ga4Data?.length
                        ? `${Math.floor(ga4Data.reduce((s, r) => s + (r.averageSessionDuration || 0), 0) / ga4Data.length / 60)}m ${Math.round(ga4Data.reduce((s, r) => s + (r.averageSessionDuration || 0), 0) / ga4Data.length % 60)}s`
                        : "—"}
                    </p>
                  </GlassCard>
               </div>

               {/* 차트 */}
               <GlassCard className="lg:col-span-3 p-6 h-[420px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={formattedGa4Data} margin={{ top: 10, right: 30, left: 10, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                      <XAxis dataKey="label" stroke="rgba(255,255,255,0.3)" tickLine={false} axisLine={false} tick={{ fontSize: 10 }}
                        interval={Math.max(0, Math.floor((formattedGa4Data?.length ?? 0) / 12) - 1)} />
                      <YAxis stroke="rgba(255,255,255,0.3)" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
                      <Tooltip contentStyle={{ backgroundColor: "#000", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "12px", fontSize: "12px" }} />
                      <Legend wrapperStyle={{ paddingTop: "20px", fontSize: "12px" }} />
                      <Line type="monotone" dataKey="세션" stroke="#ffffff" strokeWidth={3} dot={{ r: 3, fill: "#fff" }} activeDot={{ r: 6 }} />
                      <Line type="monotone" dataKey="유저" stroke="#818cf8" strokeWidth={2} dot={{ r: 3, fill: "#818cf8" }} activeDot={{ r: 4 }} />
                    </LineChart>
                  </ResponsiveContainer>
               </GlassCard>
            </div>
          )}
        </section>

        {/* ── 네이버 데이터 섹션 ─────────────────────────────────────── */}
        <section>
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-4">
                <h3 className="text-lg font-bold text-white">네이버 브랜드 검색 트렌드</h3>
                <div className="flex rounded-lg border border-white/10 overflow-hidden bg-white/5 p-1">
                    {(["date", "week", "month"] as const).map(u => (
                    <button key={u} onClick={() => setTimeUnit(u)}
                        className={cn("px-3 py-1 text-[10px] rounded-md transition-all", timeUnit === u ? "bg-white text-black font-semibold shadow-lg" : "text-white/40 hover:text-white")}>
                        {u === "date" ? "일" : u === "week" ? "주" : "월"}
                    </button>
                    ))}
                </div>
            </div>
            <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-xl px-4 h-[42px] focus-within:border-white/30 transition-all">
                <Search className="w-4 h-4 text-white/30" />
                <input 
                    className="bg-transparent border-none text-xs text-white outline-none w-56 placeholder:text-white/20"
                    placeholder="키워드 추가 (쉼표 구분)"
                    onKeyDown={e => {
                        if (e.key === "Enter") {
                            const val = (e.currentTarget.value).trim();
                            if (val) {
                                const kws = val.split(",").map(k => k.trim()).filter(Boolean);
                                setKeywordGroups(prev => [...prev, { groupName: kws[0], keywords: kws }]);
                                e.currentTarget.value = "";
                            }
                        }
                    }}
                />
            </div>
          </div>

          {trendError ? (
            <GlassCard className="p-10 text-center border-red-500/20 bg-red-500/5">
                <p className="text-red-400 text-sm">⚠️ {trendError}</p>
            </GlassCard>
          ) : (
            <div className="space-y-6">
                {/* 검색 그룹 태그 */}
                <div className="flex flex-wrap gap-2">
                    {keywordGroups.map((g, i) => (
                        <div key={i} className="flex items-center gap-2 bg-white/5 border border-white/10 px-3 py-1.5 rounded-full text-[11px] group transition-all hover:bg-white/10"
                             style={{ borderLeft: `3px solid ${LINE_COLORS[i % LINE_COLORS.length]}` }}>
                            <span className="text-white font-medium">{g.groupName}</span>
                            <span className="text-white/30">{g.keywords.join(", ")}</span>
                            <button onClick={() => setKeywordGroups(prev => prev.filter((_, idx) => idx !== i))} className="text-white/20 hover:text-red-400 ml-1">
                                <X className="w-3 h-3 transition-transform group-hover:scale-110" />
                            </button>
                        </div>
                    ))}
                </div>

                <GlassCard className="p-6 h-[420px]">
                    {naverChartData.length > 0 ? (
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={naverChartData} margin={{ top: 10, right: 30, left: 10, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                                <XAxis dataKey="date" stroke="rgba(255,255,255,0.3)" tickLine={false} axisLine={false} tick={{ fontSize: 10 }} />
                                <YAxis stroke="rgba(255,255,255,0.3)" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} unit="%" />
                                <Tooltip contentStyle={{ backgroundColor: "#000", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "12px", fontSize: "12px" }} />
                                <Legend wrapperStyle={{ paddingTop: "20px", fontSize: "12px" }} />
                                {trendData?.results?.map((g: any, i: number) => (
                                    <Line key={g.title} type="monotone" dataKey={g.title}
                                        stroke={LINE_COLORS[i % LINE_COLORS.length]}
                                        strokeWidth={2.5} dot={{ r: 2, fill: LINE_COLORS[i % LINE_COLORS.length] }} activeDot={{ r: 5 }} />
                                ))}
                            </LineChart>
                        </ResponsiveContainer>
                    ) : (
                        <div className="flex items-center justify-center h-full text-white/20 text-sm">추가된 키워드 그룹이 없습니다.</div>
                    )}
                </GlassCard>
            </div>
          )}
        </section>

      </div>

    </div>
  );
}
