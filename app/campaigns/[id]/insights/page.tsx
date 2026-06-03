"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { useParams } from "next/navigation";
import { useRefresh } from "@/lib/refresh-context";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { GlassCard } from "@/components/glass-card";
import { Button } from "@/components/ui/button";
import { Plus, Pencil, Trash2, Check, X, ChevronDown, ChevronUp, TrendingUp, TrendingDown, Eye, Users, Activity, BarChart2, Sparkles, RefreshCw } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid,
} from "recharts";

// ── 주간 계산 헬퍼 ─────────────────────────────────────────────────
type WeekInfo = {
  label: string;        // "WEEK 1"
  rangeLabel: string;   // "5/27 수 ~ 5/31 일"
  start: string;        // "2026-05-27"
  end: string;          // "2026-05-31"
};

// KST(UTC+9) 기준 오늘 날짜 반환
function getKstToday(): string {
  const kst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 10);
}

// 날짜 문자열에 N일 더하기 (정오 UTC 기준으로 DST 오류 방지)
function addDaysToDate(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const KR_DAYS = ["일", "월", "화", "수", "목", "금", "토"];

// "M/D 요" 형식 포맷 (예: "5/27 수")
function fmtDayLabel(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00Z");
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()} ${KR_DAYS[d.getUTCDay()]}`;
}

function calculateWeeks(startDate: string, endDate: string): WeekInfo[] {
  if (!startDate || !endDate) return [];
  const kstToday = getKstToday();
  // 표시 상한: KST 오늘 또는 캠페인 종료일 중 더 이른 날
  const capDate = kstToday < endDate ? kstToday : endDate;

  const weeks: WeekInfo[] = [];
  let weekNum  = 1;
  let curStart = startDate;

  while (curStart <= capDate) {
    // 이 주(월~일)에서 curStart가 속한 일요일을 찾음
    // getUTCDay(): 0=일, 1=월, ..., 6=토
    const dow           = new Date(curStart + "T12:00:00Z").getUTCDay();
    const daysToSunday  = (7 - dow) % 7; // 일=0, 월=6, 화=5, ..., 토=1
    const weekEndFull   = addDaysToDate(curStart, daysToSunday); // 이 주 일요일
    // 실제 종료: 이 주 일요일 vs 상한 중 더 이른 날
    const actualEnd     = weekEndFull < capDate ? weekEndFull : capDate;

    weeks.push({
      label:      `WEEK ${weekNum}`,
      rangeLabel: `${fmtDayLabel(curStart)} ~ ${fmtDayLabel(actualEnd)}`,
      start:      curStart,
      end:        actualEnd,
    });

    // 다음 주는 이 주 일요일 다음 날(월요일)부터
    curStart = addDaysToDate(weekEndFull, 1);
    weekNum++;
    if (weekNum > 52) break; // 안전 가드
  }
  return weeks;
}

function getCurrentWeekIdx(weeks: WeekInfo[]): number {
  if (weeks.length === 0) return 0;
  const kstToday = getKstToday();
  for (let i = 0; i < weeks.length; i++) {
    if (kstToday >= weeks[i].start && kstToday <= weeks[i].end) return i;
  }
  return weeks.length - 1;
}

// ── 증감 배지 ──────────────────────────────────────────────────────
function DeltaBadge({ current, prev }: { current: number; prev: number }) {
  if (prev === 0 || current === prev) return null;
  const pct = Math.round(((current - prev) / prev) * 100);
  const positive = pct > 0;
  return (
    <span className={`inline-flex items-center gap-0.5 text-[10px] font-bold ${positive ? "text-green-500" : "text-red-500"}`}>
      {positive
        ? <TrendingUp className="w-2.5 h-2.5" />
        : <TrendingDown className="w-2.5 h-2.5" />}
      {positive ? "+" : ""}{pct}%
    </span>
  );
}

// ── 자동 데이터 리포트 ─────────────────────────────────────────────
// 날짜 → 주차 레이블 변환 (WEEK N 형식)
function getWeekLabelForDate(dateStr: string, weeks: WeekInfo[]): string {
  const d = dateStr.slice(0, 10);
  for (const w of weeks) {
    if (d >= w.start && d <= w.end) return w.label;
  }
  return dateStr;
}

function AutoDataReport({
  campaignId,
  currentWeek,
  prevWeek,
  weeks,
}: {
  campaignId: Id<"campaigns">;
  currentWeek: WeekInfo | null;
  prevWeek: WeekInfo | null;
  weeks: WeekInfo[];
}) {
  const digitalKpis   = useQuery(api.awareness.getDigitalKpis,      { campaignId }) ?? [];
  const youtubeVideos = useQuery(api.awareness.getYouTubeVideos,     { campaignId }) ?? [];
  const viralContents = useQuery(api.awareness.getViralContents,     { campaignId }) ?? [];
  const trafficWeekly = useQuery(api.inflow.getTrafficWeekly,        { campaignId }) ?? [];
  const activities    = useQuery(api.interest.getInterestActivities, { campaignId }) ?? [];

  const [expanded, setExpanded] = useState(true);

  // ── 주차 필터 함수 ──────────────────────────────────────────────
  const filterByWeek = useCallback((rows: any[], dateField: string, week: WeekInfo | null) => {
    if (!week) return rows;
    return rows.filter((r: any) => {
      const d = r[dateField] as string;
      if (!d) return false;
      const date = d.length === 8
        ? `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`
        : d.slice(0, 10);
      return date >= week.start && date <= week.end;
    });
  }, []);

  // ── 현재 주차 집계 ──────────────────────────────────────────────
  const curKpis  = useMemo(() => filterByWeek(digitalKpis,   "date", currentWeek), [digitalKpis,   currentWeek, filterByWeek]);
  const prevKpis = useMemo(() => filterByWeek(digitalKpis,   "date", prevWeek),    [digitalKpis,   prevWeek,    filterByWeek]);
  const curViral = useMemo(() => filterByWeek(viralContents, "date", currentWeek), [viralContents, currentWeek, filterByWeek]);

  // YouTube: uploadDate 기준으로 해당 주차에 업로드된 영상만 필터
  const curYoutube = useMemo(() => {
    if (!currentWeek) return youtubeVideos;
    return youtubeVideos.filter((v: any) => {
      const d = (v.uploadDate as string)?.slice(0, 10) ?? "";
      return d >= currentWeek.start && d <= currentWeek.end;
    });
  }, [youtubeVideos, currentWeek]);

  const prevYoutube = useMemo(() => {
    if (!prevWeek) return [];
    return youtubeVideos.filter((v: any) => {
      const d = (v.uploadDate as string)?.slice(0, 10) ?? "";
      return d >= prevWeek.start && d <= prevWeek.end;
    });
  }, [youtubeVideos, prevWeek]);

  // 활동: startDate~endDate가 선택 주차와 겹치는 경우 포함
  const curActivities = useMemo(() => {
    if (!currentWeek) return activities;
    return activities.filter((a: any) => {
      const s = (a.startDate as string)?.slice(0, 10) ?? "";
      const e = (a.endDate   as string)?.slice(0, 10) ?? s;
      return s <= currentWeek.end && e >= currentWeek.start;
    });
  }, [activities, currentWeek]);

  // trafficWeekly: 주차 overlap으로 매칭 (캘린더 주와 캠페인 주가 다를 수 있어 넓게 매칭)
  const curTraffic = useMemo(() => {
    if (!currentWeek) return trafficWeekly;
    const matched = trafficWeekly.filter((r: any) => {
      const ws = (r.weekStart as string)?.slice(0, 10) ?? "";
      if (!ws) return false;
      const weDate = new Date(ws + "T00:00:00");
      weDate.setDate(weDate.getDate() + 6);
      const we = weDate.toISOString().slice(0, 10);
      return ws <= currentWeek.end && we >= currentWeek.start;
    });
    // 매칭 없으면 전체 표시 (날짜 불일치 방어)
    return matched.length > 0 ? matched : trafficWeekly;
  }, [trafficWeekly, currentWeek]);

  const prevTraffic = useMemo(() => {
    if (!prevWeek) return [];
    return trafficWeekly.filter((r: any) => {
      const ws = (r.weekStart as string)?.slice(0, 10) ?? "";
      if (!ws) return false;
      const weDate = new Date(ws + "T00:00:00");
      weDate.setDate(weDate.getDate() + 6);
      const we = weDate.toISOString().slice(0, 10);
      return ws <= prevWeek.end && we >= prevWeek.start;
    });
  }, [trafficWeekly, prevWeek]);

  const awareness = useMemo(() => {
    const sum = (rows: any[], field: string) => rows.reduce((s: number, r: any) => s + (r[field] || 0), 0);
    const cur  = { impressions: sum(curKpis,  "impressions"), views: sum(curKpis,  "views"), clicks: sum(curKpis,  "clicks"), spend: sum(curKpis, "spend") };
    const prev = { impressions: sum(prevKpis, "impressions"), views: sum(prevKpis, "views"), clicks: sum(prevKpis, "clicks"), spend: sum(prevKpis, "spend") };
    const ctr = cur.views > 0 ? (cur.clicks / cur.views * 100).toFixed(2) : "0.00";
    const cpv = cur.views > 0 ? Math.round(cur.spend / cur.views) : 0;
    const ytViews       = curYoutube.reduce((s: number, v: any) => s + (v.views || 0), 0);
    const ytComments    = curYoutube.reduce((s: number, v: any) => s + (v.comments || 0), 0);
    const prevYtViews   = prevYoutube.reduce((s: number, v: any) => s + (v.views || 0), 0);
    const viralViews    = curViral.reduce((s: number, v: any) => s + (v.views || 0), 0);
    const viralComments = curViral.reduce((s: number, v: any) => s + (v.comments || 0), 0);
    // 필터 여부 표시용
    const ytFiltered    = !!currentWeek;
    return { cur, prev, ctr, cpv, ytViews, ytComments, prevYtViews, viralViews, viralComments, ytFiltered };
  }, [curKpis, prevKpis, curYoutube, prevYoutube, curViral, currentWeek]);

  // 주차별 조회수 집계 (인지 성과 카드 그래프용)
  const viewsChartData = useMemo(() => {
    if (weeks.length === 0) return [];
    return weeks.map(w => ({
      label: w.label,
      views: digitalKpis.filter((r: any) => {
        const d = (r.date as string)?.slice(0, 10);
        return d && d >= w.start && d <= w.end;
      }).reduce((s: number, r: any) => s + (r.views || 0), 0),
    })).filter(d => d.views > 0);
  }, [digitalKpis, weeks]);

  const interest = useMemo(() => {
    const totalVisitors     = curActivities.reduce((s: number, a: any) => s + (a.visitors || 0), 0);
    const totalParticipants = curActivities.reduce((s: number, a: any) => s + (a.participants || 0), 0);
    const totalBudget       = curActivities.reduce((s: number, a: any) => s + (a.budget || 0), 0);
    const actCount          = curActivities.length;
    const convRate = totalVisitors > 0 ? (totalParticipants / totalVisitors * 100).toFixed(1) : "0.0";
    // 활동 유형 목록 (중복 제거)
    const actTypes = [...new Set(curActivities.map((a: any) => a.activityType as string).filter(Boolean))];
    return { totalVisitors, totalParticipants, totalBudget, actCount, convRate, actTypes };
  }, [curActivities]);

  const inflow = useMemo(() => {
    const totalUsers    = curTraffic.reduce((s: number, r: any) => s + (r.users || 0), 0);
    const totalSessions = curTraffic.reduce((s: number, r: any) => s + (r.sessions || 0), 0);
    const prevUsers     = prevTraffic.reduce((s: number, r: any) => s + (r.users || 0), 0);
    const prevSessions  = prevTraffic.reduce((s: number, r: any) => s + (r.sessions || 0), 0);
    // X축 레이블을 WEEK N 형식으로 변환
    const chartData = trafficWeekly.slice(-8).map((r: any) => {
      const weekStart = (r.weekStart as string)?.slice(0, 10) ?? "";
      const label = weeks.length > 0 && weekStart
        ? getWeekLabelForDate(weekStart, weeks)
        : (r.weekLabel || "");
      return { label, users: r.users || 0, sessions: r.sessions || 0 };
    });
    return { totalUsers, totalSessions, prevUsers, prevSessions, chartData };
  }, [curTraffic, prevTraffic, trafficWeekly]);

  const hasData = digitalKpis.length > 0 || youtubeVideos.length > 0 || activities.length > 0 || trafficWeekly.length > 0;
  if (!hasData) return null;

  return (
    <GlassCard className="p-5">
      <button
        onClick={() => setExpanded(p => !p)}
        className="flex items-center justify-between w-full mb-1"
      >
        <div className="flex items-center gap-2">
          <BarChart2 className="w-4 h-4 text-indigo-500" />
          <h3 className="text-sm font-bold text-gray-900">자동 데이터 리포트</h3>
          <span className="text-[10px] text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
            {currentWeek ? currentWeek.label : "전체 누적"}
          </span>
        </div>
        {expanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
      </button>
      {!expanded && <p className="text-xs text-gray-400 ml-6">클릭하여 펼치기</p>}

      {expanded && (
        <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* 인지 성과 */}
          <div className="bg-indigo-50/60 border border-indigo-100 rounded-xl p-4">
            <div className="flex items-center gap-1.5 mb-3">
              <Eye className="w-3.5 h-3.5 text-indigo-500" />
              <span className="text-xs font-bold text-indigo-700">인지 성과</span>
            </div>
            <div className="space-y-2">
              {(awareness.cur.impressions > 0 || awareness.prev.impressions > 0) && (
                <div className="flex justify-between items-center text-[11px]">
                  <span className="text-gray-500">노출수</span>
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold text-gray-900">{awareness.cur.impressions.toLocaleString()}</span>
                    <DeltaBadge current={awareness.cur.impressions} prev={awareness.prev.impressions} />
                  </div>
                </div>
              )}
              {(awareness.cur.views > 0 || awareness.prev.views > 0) && (
                <div className="flex justify-between items-center text-[11px]">
                  <span className="text-gray-500">조회수</span>
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold text-gray-900">{awareness.cur.views.toLocaleString()}</span>
                    <DeltaBadge current={awareness.cur.views} prev={awareness.prev.views} />
                  </div>
                </div>
              )}
              {(awareness.cur.clicks > 0 || awareness.prev.clicks > 0) && (
                <div className="flex justify-between items-center text-[11px]">
                  <span className="text-gray-500">클릭수</span>
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold text-gray-900">{awareness.cur.clicks.toLocaleString()}</span>
                    <DeltaBadge current={awareness.cur.clicks} prev={awareness.prev.clicks} />
                  </div>
                </div>
              )}
              {(awareness.viralViews + awareness.ytViews) > 0 && (
                <div className="flex justify-between items-center text-[11px]">
                  <div>
                    <span className="text-gray-500">YT+바이럴 조회</span>
                    {awareness.ytFiltered && (
                      <span className="ml-1 text-[9px] text-gray-400 bg-gray-100 px-1 rounded">이 주차</span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold text-gray-900">{(awareness.ytViews + awareness.viralViews).toLocaleString()}</span>
                    {awareness.ytFiltered && awareness.prevYtViews > 0 && (
                      <DeltaBadge current={awareness.ytViews} prev={awareness.prevYtViews} />
                    )}
                  </div>
                </div>
              )}
              {(awareness.ytComments + awareness.viralComments) > 0 && (
                <div className="flex justify-between items-center text-[11px]">
                  <span className="text-gray-500">YT+바이럴 댓글</span>
                  <span className="font-bold text-indigo-600">{(awareness.ytComments + awareness.viralComments).toLocaleString()}</span>
                </div>
              )}
              {awareness.cur.impressions === 0 && awareness.cur.views === 0 && (
                <p className="text-[11px] text-gray-400">이 주차 데이터 없음</p>
              )}
            </div>
            {/* 조회수 추이 미니 그래프 */}
            {viewsChartData.length > 1 && (
              <div className="h-[60px] mt-2">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={viewsChartData} margin={{ top: 0, right: 0, left: -30, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.05)" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 8 }} tickLine={false} axisLine={false} />
                    <YAxis tick={{ fontSize: 8 }} tickLine={false} axisLine={false} />
                    <Tooltip contentStyle={{ fontSize: "10px", borderRadius: "8px", border: "1px solid #e0e7ff" }} formatter={(v: number) => [v.toLocaleString(), "조회수"]} />
                    <Line type="monotone" dataKey="views" stroke="#6366f1" strokeWidth={1.5} dot={false} name="조회수" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          {/* 흥미 성과 */}
          <div className="bg-emerald-50/60 border border-emerald-100 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-1.5">
                <Activity className="w-3.5 h-3.5 text-emerald-600" />
                <span className="text-xs font-bold text-emerald-700">흥미 성과</span>
              </div>
              {currentWeek && interest.actTypes.length > 0 && (
                <span className="text-[9px] text-emerald-600 bg-emerald-100 px-1.5 py-0.5 rounded">이 주차</span>
              )}
            </div>
            {interest.actCount > 0 ? (
              <div className="space-y-2">
                {/* 활동 유형 태그 */}
                {interest.actTypes.length > 0 && (
                  <div className="flex flex-wrap gap-1 pb-1 border-b border-emerald-100 mb-1">
                    {interest.actTypes.map(t => (
                      <span key={t} className="text-[9px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded">{t}</span>
                    ))}
                  </div>
                )}
                <div className="flex justify-between text-[11px]">
                  <div>
                    <span className="text-gray-500">오프라인/팝업 활동</span>
                    <span className="ml-1 text-[9px] text-gray-400">(행사·이벤트 수)</span>
                  </div>
                  <span className="font-bold text-gray-900">{interest.actCount}건</span>
                </div>
                <div className="flex justify-between text-[11px]">
                  <div>
                    <span className="text-gray-500">내방객 수</span>
                    <span className="ml-1 text-[9px] text-gray-400">(행사장 방문자)</span>
                  </div>
                  <span className="font-bold text-gray-900">{interest.totalVisitors.toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-[11px]">
                  <div>
                    <span className="text-gray-500">체험 참여자</span>
                    <span className="ml-1 text-[9px] text-gray-400">(직접 체험·신청)</span>
                  </div>
                  <span className="font-bold text-gray-900">{interest.totalParticipants.toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-[11px]">
                  <span className="text-gray-500">방문→참여 전환율</span>
                  <span className="font-bold text-emerald-600">{interest.convRate}%</span>
                </div>
                {interest.totalBudget > 0 && (
                  <div className="flex justify-between text-[11px]">
                    <span className="text-gray-500">활동 예산</span>
                    <span className="font-bold text-gray-900">₩{interest.totalBudget.toLocaleString()}</span>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-[11px] text-gray-400">{currentWeek ? "이 주차 활동 없음" : "데이터 없음"}</p>
            )}
          </div>

          {/* 유입 성과 */}
          <div className="bg-rose-50/60 border border-rose-100 rounded-xl p-4">
            <div className="flex items-center gap-1.5 mb-3">
              <Users className="w-3.5 h-3.5 text-rose-500" />
              <span className="text-xs font-bold text-rose-700">유입 성과 (마이크로사이트)</span>
            </div>
            {trafficWeekly.length > 0 ? (
              <>
                <div className="space-y-2 mb-3">
                  <div className="flex justify-between items-center text-[11px]">
                    <span className="text-gray-500">유저</span>
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold text-gray-900">{inflow.totalUsers.toLocaleString()}</span>
                      {prevWeek && <DeltaBadge current={inflow.totalUsers} prev={inflow.prevUsers} />}
                    </div>
                  </div>
                  <div className="flex justify-between items-center text-[11px]">
                    <span className="text-gray-500">세션</span>
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold text-gray-900">{inflow.totalSessions.toLocaleString()}</span>
                      {prevWeek && <DeltaBadge current={inflow.totalSessions} prev={inflow.prevSessions} />}
                    </div>
                  </div>
                </div>
                {inflow.chartData.length > 1 && (
                  <div className="h-[70px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={inflow.chartData} margin={{ top: 0, right: 0, left: -30, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.05)" vertical={false} />
                        <XAxis dataKey="label" tick={{ fontSize: 8 }} tickLine={false} axisLine={false} />
                        <YAxis tick={{ fontSize: 8 }} tickLine={false} axisLine={false} />
                        <Tooltip contentStyle={{ fontSize: "10px", borderRadius: "8px", border: "1px solid #f0f0f0" }} />
                        <Line type="monotone" dataKey="users" stroke="#f43f5e" strokeWidth={1.5} dot={false} name="유저" />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </>
            ) : (
              <p className="text-[11px] text-gray-400">유입상세 페이지에서 마이크로사이트 GA4를 연결하면 자동 집계됩니다.</p>
            )}
          </div>
        </div>
      )}
    </GlassCard>
  );
}

// ── 주간 요약 노트 ─────────────────────────────────────────────────
function WeeklyNoteSection({
  campaignId,
  week,
}: {
  campaignId: string;
  week: WeekInfo;
}) {
  const LS_KEY = `weekSummary_${campaignId}_${week.label}`;
  const [note, setNote] = useState("");
  const [saved, setSaved] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);

  // Convex 연동 (뷰어 공유)
  const campaignData   = useQuery(api.campaigns.getCampaignById, { id: campaignId as Id<"campaigns"> });
  const updateCampaign = useMutation(api.campaigns.updateCampaignSettings);

  const digitalKpis   = useQuery(api.awareness.getDigitalKpis, { campaignId: campaignId as Id<"campaigns"> }) ?? [];
  const trafficWeekly = useQuery(api.inflow.getTrafficWeekly,  { campaignId: campaignId as Id<"campaigns"> }) ?? [];
  const activities    = useQuery(api.interest.getInterestActivities, { campaignId: campaignId as Id<"campaigns"> }) ?? [];

  // 현재 주차 데이터 집계
  const weekKpis = useMemo(() =>
    digitalKpis.filter((r: any) => {
      const d = (r.date as string);
      if (!d) return false;
      return d >= week.start && d <= week.end;
    }), [digitalKpis, week]);

  const weekTraffic = useMemo(() =>
    trafficWeekly.filter((r: any) => {
      const ws = (r.weekStart as string)?.slice(0, 10) ?? "";
      return ws >= week.start && ws <= week.end;
    }), [trafficWeekly, week]);

  useEffect(() => {
    // Convex 우선 → localStorage 폴백
    if (campaignData === undefined) return; // 아직 로딩 중
    try {
      const convexMemos = campaignData?.weeklyMemos
        ? JSON.parse(campaignData.weeklyMemos as string) : {};
      const convexNote = convexMemos[week.label];
      if (convexNote !== undefined) { setNote(convexNote); return; }
      const lsNote = localStorage.getItem(LS_KEY);
      if (lsNote !== null) setNote(lsNote);
    } catch {}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [LS_KEY, campaignData]);

  const saveNote = async () => {
    try {
      localStorage.setItem(LS_KEY, note);
    } catch {}
    try {
      const existing = campaignData?.weeklyMemos
        ? JSON.parse(campaignData.weeklyMemos as string) : {};
      const updated = { ...existing, [week.label]: note };
      await updateCampaign({ id: campaignId as Id<"campaigns">, weeklyMemos: JSON.stringify(updated) });
    } catch {}
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const generateAIDraft = async () => {
    setIsGenerating(true);
    try {
      const impressions = weekKpis.reduce((s: number, r: any) => s + (r.impressions || 0), 0);
      const views       = weekKpis.reduce((s: number, r: any) => s + (r.views || 0), 0);
      const clicks      = weekKpis.reduce((s: number, r: any) => s + (r.clicks || 0), 0);
      const spend       = weekKpis.reduce((s: number, r: any) => s + (r.spend || 0), 0);
      const users       = weekTraffic.reduce((s: number, r: any) => s + (r.users || 0), 0);
      const sessions    = weekTraffic.reduce((s: number, r: any) => s + (r.sessions || 0), 0);
      const visitors    = activities.reduce((s: number, a: any) => s + (a.visitors || 0), 0);
      const participants = activities.reduce((s: number, a: any) => s + (a.participants || 0), 0);

      const hasData = impressions > 0 || views > 0 || users > 0 || visitors > 0;

      const prompt = `다음은 마케팅 캠페인 ${week.label} (${week.rangeLabel}) 성과 데이터입니다.

인지 성과:
- 노출수: ${impressions.toLocaleString()}회
- 조회수: ${views.toLocaleString()}회
- 클릭수: ${clicks.toLocaleString()}회
- 집행비용: ₩${spend.toLocaleString()}
${views > 0 ? `- CTR: ${(clicks / views * 100).toFixed(2)}%` : ""}

유입 성과 (마이크로사이트):
- 유저: ${users.toLocaleString()}명
- 세션: ${sessions.toLocaleString()}회

흥미/체험 성과:
- 방문자: ${visitors.toLocaleString()}명
- 참여자: ${participants.toLocaleString()}명
${visitors > 0 ? `- 참여 전환율: ${(participants / visitors * 100).toFixed(1)}%` : ""}

${hasData
  ? "위 데이터를 바탕으로 마케팅 관점의 주간 인사이트를 3~4문장으로 작성해주세요. 핵심 성과 → 주목할 지표 → 개선점 또는 다음 주 방향 순으로 작성해주세요."
  : "이번 주 데이터가 아직 없습니다. 캠페인 목표와 기대 성과를 중심으로 주간 모니터링 포인트를 3문장으로 작성해주세요."
}`;

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 25000);
      try {
        const res = await fetch(
          "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=AIzaSyBogkDbzmrI0h_sAwtUZyTmvMnH2P2PZkw",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }],
              generationConfig: { temperature: 0.7, maxOutputTokens: 500 },
            }),
            signal: controller.signal,
          }
        );
        clearTimeout(timer);
        const data = await res.json();
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? "";
        if (text) setNote(text);
      } finally {
        clearTimeout(timer);
      }
    } catch (e: any) {
      if (e.name !== "AbortError") console.error("AI draft error", e);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <GlassCard className="p-5">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-sm font-bold text-gray-900">{week.label} 요약 메모</h3>
          <p className="text-[10px] text-gray-400 mt-0.5">{week.rangeLabel}</p>
        </div>
        <div className="flex items-center gap-2">
          {saved && (
            <span className="text-[11px] text-green-500 font-semibold flex items-center gap-1 bg-green-50 px-2 py-0.5 rounded-full border border-green-200">
              <Check className="w-3 h-3" /> 저장되었습니다
            </span>
          )}
          <button
            onClick={generateAIDraft}
            disabled={isGenerating}
            className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium text-indigo-600 border border-indigo-200 bg-indigo-50 rounded-lg hover:bg-indigo-100 transition-all disabled:opacity-50">
            {isGenerating
              ? <><RefreshCw className="w-3 h-3 animate-spin" /> 생성 중...</>
              : <><Sparkles className="w-3 h-3" /> AI 초안</>}
          </button>
          <button
            onClick={saveNote}
            className="px-3 py-1 text-[11px] font-medium bg-gray-900 text-white rounded-lg hover:bg-gray-700 transition-all">
            저장
          </button>
        </div>
      </div>
      <textarea
        value={note}
        onChange={e => setNote(e.target.value)}
        rows={4}
        placeholder={`${week.label} (${week.rangeLabel}) 주요 성과 및 인사이트를 입력하거나 AI 초안 버튼으로 자동 생성하세요...`}
        className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-xs text-gray-900 outline-none focus:border-gray-400 resize-none placeholder:text-gray-400"
      />
    </GlassCard>
  );
}

// ── 헬퍼: 성장률 색상 ────────────────────────────────────────────
function growthColor(val: string) {
  if (!val) return "text-gray-900/40";
  const n = parseFloat(val.replace(/[^0-9.-]/g, ""));
  if (val.startsWith("+") || n > 0) return "text-green-400";
  if (val.startsWith("-") || n < 0) return "text-red-400";
  return "text-gray-900/40";
}

// ── 인사이트 카드 ─────────────────────────────────────────────────
type Insight = {
  _id: Id<"campaignInsights">;
  weekLabel: string;
  headline: string;
  body: string;
  kpiLabel?: string;
  kpiValue?: string;
  kpiColor?: string;
  growthLabel?: string;
  growthValue?: string;
  sortOrder: number;
};

function InsightCard({
  insight,
  onEdit,
  onDelete,
  isAdmin,
}: {
  insight: Insight;
  onEdit: (i: Insight) => void;
  onDelete: (id: Id<"campaignInsights">) => void;
  isAdmin: boolean;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <GlassCard className="p-6 group relative overflow-hidden transition-all duration-300 hover:border-gray-200 hover:shadow-md">
      {/* 배경 그라디언트 강조 */}
      <div className="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-indigo-500 to-purple-600 rounded-l-xl" />

      <div className="flex items-start justify-between gap-4 pl-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 mb-2">
            <span className="text-xs font-bold text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-full border border-indigo-100">
              {insight.weekLabel}
            </span>
          </div>
          <h3 className="text-lg font-bold text-gray-900 leading-snug mb-3">
            {insight.headline}
          </h3>
          <p className={`text-sm text-gray-500 leading-relaxed ${!expanded ? "line-clamp-3" : ""}`}>
            {insight.body}
          </p>
          {insight.body.length > 120 && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="mt-2 text-xs text-indigo-500 hover:text-indigo-600 flex items-center gap-1"
            >
              {expanded ? (
                <><ChevronUp className="w-3 h-3" />접기</>
              ) : (
                <><ChevronDown className="w-3 h-3" />더 보기</>
              )}
            </button>
          )}
        </div>

        {/* KPI 영역 */}
        {(insight.kpiValue || insight.growthValue) && (
          <div className="shrink-0 flex flex-col gap-2 text-right">
            {insight.kpiValue && (
              <div>
                <p className="text-[10px] text-gray-400 mb-0.5">{insight.kpiLabel || "핵심 지표"}</p>
                <p className={`text-2xl font-bold font-mono ${insight.kpiColor || "text-gray-900"}`}>
                  {insight.kpiValue}
                </p>
              </div>
            )}
            {insight.growthValue && (
              <div>
                <p className="text-[10px] text-gray-400 mb-0.5">{insight.growthLabel || "성장률"}</p>
                <p className={`text-xl font-bold font-mono ${growthColor(insight.growthValue)}`}>
                  {insight.growthValue}
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 관리자 액션 버튼 */}
      {isAdmin && (
        <div className="absolute top-4 right-4 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={() => onEdit(insight)}
            className="p-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-500 hover:text-gray-700 transition-colors"
          >
            <Pencil className="w-3 h-3" />
          </button>
          <button
            onClick={() => onDelete(insight._id)}
            className="p-1.5 rounded-lg bg-red-50 hover:bg-red-100 text-red-400 transition-colors"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      )}
    </GlassCard>
  );
}

// ── 편집 모달 ─────────────────────────────────────────────────────
type FormState = {
  weekLabel: string;
  headline: string;
  body: string;
  kpiLabel: string;
  kpiValue: string;
  kpiColor: string;
  growthLabel: string;
  growthValue: string;
};

const EMPTY_FORM: FormState = {
  weekLabel: "",
  headline: "",
  body: "",
  kpiLabel: "",
  kpiValue: "",
  kpiColor: "text-gray-900",
  growthLabel: "전년 대비",
  growthValue: "",
};

function InsightFormModal({
  initial,
  onSave,
  onCancel,
  isSaving,
}: {
  initial: FormState;
  onSave: (form: FormState) => void;
  onCancel: () => void;
  isSaving: boolean;
}) {
  const [form, setForm] = useState<FormState>(initial);
  const set = (k: keyof FormState, v: string) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-white/80/20 backdrop-blur-sm p-4">
      <div className="bg-white border border-gray-200 rounded-2xl p-6 w-[600px] max-h-[90vh] overflow-y-auto shadow-xl">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-lg font-bold text-gray-900">인사이트 작성</h3>
          <button onClick={onCancel}>
            <X className="w-5 h-5 text-gray-400 hover:text-gray-600" />
          </button>
        </div>

        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-400 mb-1 block">주차 라벨 *</label>
              <input
                value={form.weekLabel}
                onChange={(e) => set("weekLabel", e.target.value)}
                placeholder="예: WEEK 1"
                className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 outline-none focus:border-gray-400"
              />
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">KPI 색상</label>
              <select
                value={form.kpiColor}
                onChange={(e) => set("kpiColor", e.target.value)}
                className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 outline-none"
              >
                <option value="text-gray-900">기본 (검정)</option>
                <option value="text-green-500">초록 (긍정)</option>
                <option value="text-red-500">빨강 (경고)</option>
                <option value="text-indigo-500">인디고 (정보)</option>
                <option value="text-amber-500">노랑 (주의)</option>
              </select>
            </div>
          </div>

          <div>
            <label className="text-xs text-gray-400 mb-1 block">헤드라인 *</label>
            <input
              value={form.headline}
              onChange={(e) => set("headline", e.target.value)}
              placeholder="예: 바이럴 확산 속도 예상치 200% 상회"
              className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 outline-none focus:border-gray-400"
            />
          </div>

          <div>
            <label className="text-xs text-gray-400 mb-1 block">본문 내용 *</label>
            <textarea
              value={form.body}
              onChange={(e) => set("body", e.target.value)}
              rows={4}
              placeholder="이번 주 주요 성과와 시사점을 입력하세요..."
              className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 outline-none focus:border-gray-400 resize-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3 border-t border-gray-100 pt-4">
            <div>
              <label className="text-xs text-gray-400 mb-1 block">핵심 KPI 라벨</label>
              <input
                value={form.kpiLabel}
                onChange={(e) => set("kpiLabel", e.target.value)}
                placeholder="예: 총 조회수"
                className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 outline-none focus:border-gray-400"
              />
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">핵심 KPI 값</label>
              <input
                value={form.kpiValue}
                onChange={(e) => set("kpiValue", e.target.value)}
                placeholder="예: 1.2M"
                className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 outline-none focus:border-gray-400"
              />
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">성장률 라벨</label>
              <input
                value={form.growthLabel}
                onChange={(e) => set("growthLabel", e.target.value)}
                placeholder="예: 전년 대비"
                className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 outline-none focus:border-gray-400"
              />
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">성장률 값</label>
              <input
                value={form.growthValue}
                onChange={(e) => set("growthValue", e.target.value)}
                placeholder="예: +12.5%"
                className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 outline-none focus:border-gray-400"
              />
            </div>
          </div>
        </div>

        <div className="flex gap-3 justify-end mt-6 pt-4 border-t border-gray-100">
          <Button variant="ghost" className="text-gray-500" onClick={onCancel}>취소</Button>
          <Button
            className="bg-gray-900 text-gray-900 hover:bg-gray-800"
            onClick={() => onSave(form)}
            disabled={isSaving || !form.weekLabel || !form.headline || !form.body}
          >
            <Check className="w-4 h-4 mr-2" />
            {isSaving ? "저장 중..." : "저장"}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── 메인 페이지 ───────────────────────────────────────────────────
export default function InsightsPage() {
  const params = useParams();
  const id = params.id as string;
  const campaignId = id as Id<"campaigns">;

  const { isAdmin } = useAuth();
  const { refreshTrigger } = useRefresh();
  const [lastRefresh, setLastRefresh] = useState(0);

  const campaign      = useQuery(api.campaigns.getCampaignById, { id: campaignId });
  const insights      = (useQuery(api.insights.getInsights, { campaignId }) ?? []) as Insight[];
  const addInsight    = useMutation(api.insights.addInsight);
  const updateInsight = useMutation(api.insights.updateInsight);
  const deleteInsight = useMutation(api.insights.deleteInsight);

  const [editing,  setEditing]  = useState<Insight | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // ── 주간 탭 ──────────────────────────────────────────────────────
  const weeks = useMemo(() => {
    if (!campaign?.startDate || !campaign?.endDate) return [];
    return calculateWeeks(campaign.startDate, campaign.endDate);
  }, [campaign]);

  const [selectedWeekIdx, setSelectedWeekIdx] = useState<number>(-1);

  // 주차 계산 완료 후 현재 주차로 초기화
  useEffect(() => {
    if (weeks.length > 0 && selectedWeekIdx === -1) {
      setSelectedWeekIdx(getCurrentWeekIdx(weeks));
    }
  }, [weeks, selectedWeekIdx]);

  const selectedWeek = weeks[selectedWeekIdx] ?? null;
  const prevWeek     = selectedWeekIdx > 0 ? weeks[selectedWeekIdx - 1] : null;

  // 새로고침 컨텍스트 리스너
  useEffect(() => {
    if (refreshTrigger !== lastRefresh) setLastRefresh(refreshTrigger);
  }, [refreshTrigger, lastRefresh]);

  const handleSave = async (form: FormState) => {
    setIsSaving(true);
    try {
      if (editing) {
        await updateInsight({ id: editing._id, ...form, sortOrder: editing.sortOrder });
        setEditing(null);
      } else {
        await addInsight({ campaignId, ...form, sortOrder: insights.length });
        setIsAdding(false);
      }
    } catch (e: any) {
      alert("저장 실패: " + e.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (insightId: Id<"campaignInsights">) => {
    if (!confirm("이 인사이트를 삭제할까요?")) return;
    await deleteInsight({ id: insightId });
  };

  // 선택된 주차에 해당하는 인사이트만 필터링 (주차 탭이 없으면 전체)
  const filteredInsights = useMemo(() => {
    const sorted = [...insights].sort((a, b) => b.sortOrder - a.sortOrder);
    if (!selectedWeek) return sorted;
    return sorted.filter(i => i.weekLabel === selectedWeek.label);
  }, [insights, selectedWeek]);

  return (
    <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* 헤더 */}
      <div>
        <h2 className="text-xl font-bold text-gray-900">주간 캠페인 인사이트</h2>
        <p className="text-xs text-gray-400 mt-1">
          주차별 성과 요약 및 핵심 시사점을 기록합니다
        </p>
      </div>

      {/* 주차 탭 */}
      {weeks.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          {weeks.map((week, idx) => (
            <button
              key={week.label}
              onClick={() => setSelectedWeekIdx(idx)}
              className={`flex flex-col items-start px-3 py-2 rounded-xl border text-left transition-all ${
                selectedWeekIdx === idx
                  ? "bg-gray-900 text-white border-gray-900"
                  : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"
              }`}
            >
              <span className="text-[11px] font-bold">{week.label}</span>
              <span className={`text-[10px] ${selectedWeekIdx === idx ? "text-gray-300" : "text-gray-400"}`}>{week.rangeLabel}</span>
            </button>
          ))}
        </div>
      )}

      {/* 자동 데이터 리포트 */}
      <AutoDataReport
        campaignId={campaignId}
        currentWeek={selectedWeek}
        prevWeek={prevWeek}
        weeks={weeks}
      />

      {/* 주간 요약 메모 (관리자만 편집/추가 가능) */}
      {isAdmin && selectedWeek && (
        <WeeklyNoteSection campaignId={id} week={selectedWeek} />
      )}

      {/* 인사이트 카드 목록 */}
      {filteredInsights.length === 0 ? (
        <GlassCard className="h-40 flex flex-col items-center justify-center gap-2 border-dashed border-gray-200">
          <p className="text-gray-400 text-sm">
            {selectedWeek ? `${selectedWeek.label} 등록된 인사이트가 없습니다` : "등록된 인사이트가 없습니다"}
          </p>
        </GlassCard>
      ) : (
        <div className="flex flex-col gap-4">
          {filteredInsights.map((insight) => (
            <InsightCard
              key={insight._id}
              insight={insight}
              onEdit={setEditing}
              onDelete={handleDelete}
              isAdmin={isAdmin}
            />
          ))}
        </div>
      )}

      {/* 추가/수정 모달 */}
      {(isAdding || editing) && (
        <InsightFormModal
          initial={
            editing
              ? {
                  weekLabel:   editing.weekLabel,
                  headline:    editing.headline,
                  body:        editing.body,
                  kpiLabel:    editing.kpiLabel ?? "",
                  kpiValue:    editing.kpiValue ?? "",
                  kpiColor:    editing.kpiColor ?? "text-gray-900",
                  growthLabel: editing.growthLabel ?? "전년 대비",
                  growthValue: editing.growthValue ?? "",
                }
              : selectedWeek
              ? { ...EMPTY_FORM, weekLabel: selectedWeek.label }
              : EMPTY_FORM
          }
          onSave={handleSave}
          onCancel={() => { setIsAdding(false); setEditing(null); }}
          isSaving={isSaving}
        />
      )}
    </div>
  );
}
