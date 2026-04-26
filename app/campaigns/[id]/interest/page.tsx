"use client";

import { use, useState, useEffect, useMemo, useCallback } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { GlassCard } from "@/components/glass-card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Check, X, Settings2, Link2, RefreshCw, Users, CalendarDays, BarChart3, Ticket, TrendingUp } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";

// ─── 유틸 ──────────────────────────────────────────────────────────────
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

// ─── 커스텀 Tooltip ──────────────────────────────────────────────────
const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-lg px-4 py-3 text-xs">
      <p className="text-gray-900 font-semibold mb-1">{payload[0]?.payload?.fullName || label}</p>
      {payload.map((p: any, i: number) => (
        <p key={i} className="text-gray-600">
          <span className="inline-block w-2 h-2 rounded-full mr-1.5" style={{ backgroundColor: p.color }} />
          {p.name}: <span className="font-mono font-bold text-gray-900">{p.value?.toLocaleString()}</span>
        </p>
      ))}
    </div>
  );
};

// ─── 스프레드시트 URL → 시트 ID 추출 ─────────────────────────────────
function extractSheetId(url: string): string | null {
  const m = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  return m ? m[1] : null;
}

// ─── 메인 ──────────────────────────────────────────────────────────────
export default function InterestPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const campaignId = id as Id<"campaigns">;

  const activities = useQuery(api.interest.getInterestActivities, { campaignId }) ?? [];
  const syncActivities = useMutation(api.interest.syncInterestActivities);

  const [pastedData, setPastedData] = useState<any[] | null>(null);
  const [showSettings, setShowSettings] = useState(false);

  // ── 스프레드시트 URL 상태 ──
  const [eventSheetUrl, setEventSheetUrl] = useState("");
  const [popupSheetUrl, setPopupSheetUrl] = useState("");
  const [syncing, setSyncing] = useState<"event" | "popup" | null>(null);
  const [syncMessage, setSyncMessage] = useState("");

  // localStorage 에서 복원
  useEffect(() => {
    const savedEvent = localStorage.getItem(`interest_event_sheet_${campaignId}`);
    const savedPopup = localStorage.getItem(`interest_popup_sheet_${campaignId}`);
    if (savedEvent) setEventSheetUrl(savedEvent);
    if (savedPopup) setPopupSheetUrl(savedPopup);
  }, [campaignId]);

  // ── 스프레드시트 싱크 ──
  const syncFromSheet = useCallback(async (type: "event" | "popup", url: string) => {
    const sheetId = extractSheetId(url);
    if (!sheetId) { setSyncMessage("❌ 올바른 구글 시트 URL이 아닙니다."); return; }
    setSyncing(type);
    setSyncMessage("");
    try {
      // Google Sheets 공개 CSV로 가져오기
      const csvUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv`;
      const res = await fetch(csvUrl);
      if (!res.ok) throw new Error("시트 접근 실패. 공유 설정을 확인하세요.");
      const text = await res.text();
      const rows = text.split("\n").map(line => {
        // CSV 파싱 (간단 버전)
        const cells: string[] = [];
        let current = "";
        let inQuotes = false;
        for (const ch of line) {
          if (ch === '"') { inQuotes = !inQuotes; continue; }
          if (ch === ',' && !inQuotes) { cells.push(current.trim()); current = ""; continue; }
          current += ch;
        }
        cells.push(current.trim());
        return cells;
      }).filter(r => r.some(c => c));

      if (rows.length < 2) throw new Error("데이터가 2행 미만입니다.");

      // 헤더 분석 후 데이터 변환
      const headers = rows[0].map(h => h.toLowerCase());
      const dataRows = rows.slice(1);

      // 자동 매핑
      const findCol = (keywords: string[]) => headers.findIndex(h => keywords.some(k => h.includes(k)));
      
      let mapped: any[];
      if (type === "event") {
        const dateCol = findCol(["날짜", "일자", "date", "기간"]);
        const titleCol = findCol(["이벤트", "행사", "title", "이름", "명"]);
        const participantsCol = findCol(["참여", "신청", "참가", "접수"]);
        const visitorsCol = findCol(["방문", "조회", "노출", "view"]);

        mapped = dataRows.map(r => ({
          activityType: "이벤트",
          title: titleCol >= 0 ? r[titleCol] || "" : "",
          locationOrTarget: "",
          startDate: dateCol >= 0 ? r[dateCol] || "" : "",
          endDate: dateCol >= 0 ? r[dateCol] || "" : "",
          visitors: visitorsCol >= 0 ? processNumber(r[visitorsCol] || "0") : 0,
          participants: participantsCol >= 0 ? processNumber(r[participantsCol] || "0") : 0,
          budget: 0,
        })).filter(r => r.title || r.participants > 0 || r.startDate);
      } else {
        const dateCol = findCol(["날짜", "일자", "date", "기간"]);
        const titleCol = findCol(["팝업", "장소", "title", "이름", "명"]);
        const reservationsCol = findCol(["예약", "사전", "신청", "reserve"]);
        const visitorsCol = findCol(["방문", "집객", "입장", "visitor"]);

        mapped = dataRows.map(r => ({
          activityType: "팝업",
          title: titleCol >= 0 ? r[titleCol] || "" : "",
          locationOrTarget: "",
          startDate: dateCol >= 0 ? r[dateCol] || "" : "",
          endDate: dateCol >= 0 ? r[dateCol] || "" : "",
          visitors: reservationsCol >= 0 ? processNumber(r[reservationsCol] || "0") : 0,
          participants: visitorsCol >= 0 ? processNumber(r[visitorsCol] || "0") : 0,
          budget: 0,
        })).filter(r => r.title || r.visitors > 0 || r.participants > 0 || r.startDate);
      }

      if (mapped.length === 0) throw new Error("매핑 가능한 데이터가 없습니다. 컬럼 헤더를 확인하세요.");

      // 기존 데이터 중 다른 타입은 유지, 현재 타입만 교체
      const otherType = type === "event" ? "팝업" : "이벤트";
      const keepRows = activities
        .filter(a => a.activityType === otherType)
        .map(a => ({
          activityType: a.activityType,
          title: a.title,
          locationOrTarget: a.locationOrTarget,
          startDate: a.startDate,
          endDate: a.endDate,
          visitors: a.visitors,
          participants: a.participants,
          budget: a.budget,
        }));

      await syncActivities({ campaignId, rows: [...keepRows, ...mapped] });
      localStorage.setItem(`interest_${type}_sheet_${campaignId}`, url);
      setSyncMessage(`✅ ${type === "event" ? "이벤트" : "팝업"} 데이터 ${mapped.length}건 동기화 완료!`);
    } catch (e: any) {
      setSyncMessage(`❌ ${e.message}`);
    } finally {
      setSyncing(null);
    }
  }, [activities, syncActivities, campaignId]);

  // ─── 데이터 분류 ───────────────────────────────────────────────────
  const eventActivities = useMemo(() =>
    activities.filter(a => a.activityType !== "팝업"),
    [activities]
  );
  const popupActivities = useMemo(() =>
    activities.filter(a => a.activityType === "팝업"),
    [activities]
  );

  // ─── 이벤트 통계 ───────────────────────────────────────────────────
  const eventStats = useMemo(() => ({
    totalParticipants: eventActivities.reduce((s, a) => s + a.participants, 0),
    totalVisitors: eventActivities.reduce((s, a) => s + a.visitors, 0),
    count: eventActivities.length,
  }), [eventActivities]);

  const eventChartData = useMemo(() =>
    eventActivities.map(a => ({
      name: a.startDate || a.title.slice(0, 8),
      참여자: a.participants,
      방문자: a.visitors,
      fullName: `${a.startDate} ${a.title}`,
    })),
    [eventActivities]
  );

  // ─── 팝업 통계 ───────────────────────────────────────────────────
  const popupStats = useMemo(() => ({
    totalReservations: popupActivities.reduce((s, a) => s + a.visitors, 0),
    totalVisitors: popupActivities.reduce((s, a) => s + a.participants, 0),
    count: popupActivities.length,
  }), [popupActivities]);

  const popupChartData = useMemo(() =>
    popupActivities.map(a => ({
      name: a.startDate || a.title.slice(0, 8),
      사전예약: a.visitors,
      방문객: a.participants,
      fullName: `${a.startDate} ${a.title}`,
    })),
    [popupActivities]
  );

  // ─── 클립보드 붙여넣기 ─────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: ClipboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") return;
      const text = e.clipboardData?.getData("text") ?? "";
      if (!text.trim()) return;
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
      activityType: cols[0], title: cols[1], locationOrTarget: cols[2],
      startDate: cols[3], endDate: cols[4],
      visitors: processNumber(cols[5]), participants: processNumber(cols[6]), budget: processNumber(cols[7])
    }));
    await syncActivities({ campaignId, rows });
    setPastedData(null);
  };

  return (
    <div className="flex flex-col gap-10 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20">

      {/* ── 헤더 + 설정 토글 ── */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900">흥미 상세</h2>
          <p className="text-xs text-gray-400 mt-1">이벤트 · 팝업 · 오프라인 체험 프로그램의 성과를 확인합니다.</p>
        </div>
        <Button
          variant="outline" size="sm"
          onClick={() => setShowSettings(!showSettings)}
          className={`gap-2 ${showSettings ? "bg-gray-900 text-white border-gray-900" : "text-gray-600 border-gray-200"}`}
        >
          <Settings2 className="w-4 h-4" />
          데이터 소스 관리
        </Button>
      </div>

      {/* ── 데이터 소스 관리 패널 (토글) ── */}
      {showSettings && (
        <GlassCard className="p-6 border-indigo-100 bg-indigo-50/30">
          <h3 className="text-sm font-bold text-gray-900 mb-4 flex items-center gap-2">
            <Link2 className="w-4 h-4 text-indigo-500" /> 스프레드시트 연결
          </h3>
          <p className="text-xs text-gray-500 mb-4">구글 시트 URL을 입력하면 자동으로 데이터를 파싱합니다. 시트는 <strong>링크가 있는 모든 사용자에게 공개</strong>되어야 합니다.</p>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            {/* 이벤트 시트 */}
            <div className="flex flex-col gap-2">
              <label className="text-xs font-semibold text-gray-700">📋 이벤트 신청 데이터</label>
              <div className="flex gap-2">
                <input
                  className="flex-1 bg-white border border-gray-200 rounded-lg px-3 py-2 text-xs text-gray-900 outline-none focus:border-indigo-400 placeholder:text-gray-400"
                  placeholder="구글 시트 URL 입력"
                  value={eventSheetUrl}
                  onChange={e => setEventSheetUrl(e.target.value)}
                />
                <Button
                  size="sm" disabled={syncing === "event" || !eventSheetUrl}
                  onClick={() => syncFromSheet("event", eventSheetUrl)}
                  className="bg-indigo-600 text-white hover:bg-indigo-700 border-0 gap-1 px-3"
                >
                  {syncing === "event" ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                  동기화
                </Button>
              </div>
              <p className="text-[10px] text-gray-400">필수 컬럼: 날짜, 이벤트명, 참여자수 (선택: 방문자수)</p>
            </div>

            {/* 팝업 시트 */}
            <div className="flex flex-col gap-2">
              <label className="text-xs font-semibold text-gray-700">🏬 팝업 예약/방문 데이터</label>
              <div className="flex gap-2">
                <input
                  className="flex-1 bg-white border border-gray-200 rounded-lg px-3 py-2 text-xs text-gray-900 outline-none focus:border-amber-400 placeholder:text-gray-400"
                  placeholder="구글 시트 URL 입력"
                  value={popupSheetUrl}
                  onChange={e => setPopupSheetUrl(e.target.value)}
                />
                <Button
                  size="sm" disabled={syncing === "popup" || !popupSheetUrl}
                  onClick={() => syncFromSheet("popup", popupSheetUrl)}
                  className="bg-amber-600 text-white hover:bg-amber-700 border-0 gap-1 px-3"
                >
                  {syncing === "popup" ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                  동기화
                </Button>
              </div>
              <p className="text-[10px] text-gray-400">필수 컬럼: 날짜, 예약/사전신청수, 방문/집객수 (선택: 팝업명)</p>
            </div>
          </div>

          {syncMessage && (
            <p className={`text-xs mt-2 ${syncMessage.startsWith("✅") ? "text-green-600" : "text-red-500"}`}>{syncMessage}</p>
          )}
        </GlassCard>
      )}

      {/* ════════════════════════════════════════════════════════════ */}
      {/* 이벤트 섹션 */}
      {/* ════════════════════════════════════════════════════════════ */}
      <section>
        <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
          <Ticket className="w-5 h-5 text-indigo-500" /> 이벤트 참여 현황
        </h3>

        {/* KPI 카드 */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <GlassCard className="p-5 flex flex-col justify-center">
            <div className="flex items-center gap-2 mb-1.5">
              <div className="w-7 h-7 rounded-lg bg-indigo-50 flex items-center justify-center"><Users className="w-3.5 h-3.5 text-indigo-600" /></div>
              <p className="text-[11px] text-gray-400 font-medium">총 누적 참여자</p>
            </div>
            <p className="text-2xl font-bold font-mono text-gray-900">{eventStats.totalParticipants.toLocaleString()}<span className="text-xs text-gray-400 ml-1">명</span></p>
          </GlassCard>
          <GlassCard className="p-5 flex flex-col justify-center">
            <div className="flex items-center gap-2 mb-1.5">
              <div className="w-7 h-7 rounded-lg bg-violet-50 flex items-center justify-center"><TrendingUp className="w-3.5 h-3.5 text-violet-600" /></div>
              <p className="text-[11px] text-gray-400 font-medium">총 방문자</p>
            </div>
            <p className="text-2xl font-bold font-mono text-gray-900">{eventStats.totalVisitors.toLocaleString()}<span className="text-xs text-gray-400 ml-1">명</span></p>
          </GlassCard>
          <GlassCard className="p-5 flex flex-col justify-center">
            <div className="flex items-center gap-2 mb-1.5">
              <div className="w-7 h-7 rounded-lg bg-gray-100 flex items-center justify-center"><BarChart3 className="w-3.5 h-3.5 text-gray-600" /></div>
              <p className="text-[11px] text-gray-400 font-medium">진행 이벤트</p>
            </div>
            <p className="text-2xl font-bold font-mono text-gray-900">{eventStats.count}<span className="text-xs text-gray-400 ml-1">건</span></p>
          </GlassCard>
        </div>

        {/* 이벤트 일별 추이 그래프 */}
        {eventChartData.length > 0 && (
          <GlassCard className="p-6 mb-6">
            <h4 className="text-xs font-bold text-gray-700 mb-4">일별 이벤트 참여 추이</h4>
            <div style={{ height: 300 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={eventChartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.04)" vertical={false} />
                  <XAxis dataKey="name" stroke="rgba(0,0,0,0.4)" tickLine={false} axisLine={false} tick={{ fontSize: 10 }} />
                  <YAxis stroke="rgba(0,0,0,0.3)" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend wrapperStyle={{ fontSize: "11px", paddingTop: "8px" }} />
                  <Bar dataKey="참여자" fill="#6366f1" radius={[4, 4, 0, 0]} barSize={24} />
                  <Bar dataKey="방문자" fill="#c7d2fe" radius={[4, 4, 0, 0]} barSize={24} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </GlassCard>
        )}

        {/* 이벤트 테이블 */}
        <GlassCard className="p-0 overflow-hidden">
          {eventActivities.length === 0 ? (
            <div className="flex items-center justify-center h-[100px] text-gray-400 text-sm">
              등록된 이벤트가 없습니다. 상단 데이터 소스 관리에서 시트를 연결하거나 <kbd className="bg-gray-100 px-1.5 py-0.5 rounded text-gray-500 font-mono mx-1">Ctrl+V</kbd>로 붙여넣기 하세요.
            </div>
          ) : (
            <Table>
              <TableHeader className="bg-gray-50">
                <TableRow className="border-gray-100 hover:bg-transparent">
                  <TableHead className="text-gray-500 text-xs">날짜</TableHead>
                  <TableHead className="text-gray-500 text-xs">이벤트명</TableHead>
                  <TableHead className="text-gray-500 text-xs text-right">방문자</TableHead>
                  <TableHead className="text-gray-500 text-xs text-right">참여자</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {eventActivities.map(row => (
                  <TableRow key={row._id} className="border-gray-100 hover:bg-gray-50 text-sm">
                    <TableCell className="text-gray-500 text-xs font-mono">{row.startDate}</TableCell>
                    <TableCell className="font-medium text-gray-900">{row.title}</TableCell>
                    <TableCell className="text-right font-mono text-gray-600">{row.visitors.toLocaleString()}</TableCell>
                    <TableCell className="text-right font-mono text-gray-900 font-bold">{row.participants.toLocaleString()}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </GlassCard>
      </section>

      {/* ════════════════════════════════════════════════════════════ */}
      {/* 팝업 섹션 */}
      {/* ════════════════════════════════════════════════════════════ */}
      <section>
        <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
          <CalendarDays className="w-5 h-5 text-amber-500" /> 팝업 예약 & 방문 현황
        </h3>

        {/* KPI 카드 */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <GlassCard className="p-5 flex flex-col justify-center">
            <div className="flex items-center gap-2 mb-1.5">
              <div className="w-7 h-7 rounded-lg bg-amber-50 flex items-center justify-center"><CalendarDays className="w-3.5 h-3.5 text-amber-600" /></div>
              <p className="text-[11px] text-gray-400 font-medium">사전 예약 수</p>
            </div>
            <p className="text-2xl font-bold font-mono text-gray-900">{popupStats.totalReservations.toLocaleString()}<span className="text-xs text-gray-400 ml-1">명</span></p>
          </GlassCard>
          <GlassCard className="p-5 flex flex-col justify-center">
            <div className="flex items-center gap-2 mb-1.5">
              <div className="w-7 h-7 rounded-lg bg-orange-50 flex items-center justify-center"><Users className="w-3.5 h-3.5 text-orange-600" /></div>
              <p className="text-[11px] text-gray-400 font-medium">실 방문객 수</p>
            </div>
            <p className="text-2xl font-bold font-mono text-gray-900">{popupStats.totalVisitors.toLocaleString()}<span className="text-xs text-gray-400 ml-1">명</span></p>
          </GlassCard>
          <GlassCard className="p-5 flex flex-col justify-center">
            <div className="flex items-center gap-2 mb-1.5">
              <div className="w-7 h-7 rounded-lg bg-gray-100 flex items-center justify-center"><BarChart3 className="w-3.5 h-3.5 text-gray-600" /></div>
              <p className="text-[11px] text-gray-400 font-medium">진행 팝업</p>
            </div>
            <p className="text-2xl font-bold font-mono text-gray-900">{popupStats.count}<span className="text-xs text-gray-400 ml-1">건</span></p>
          </GlassCard>
        </div>

        {/* 팝업 일별 추이 그래프 */}
        {popupChartData.length > 0 && (
          <GlassCard className="p-6 mb-6">
            <h4 className="text-xs font-bold text-gray-700 mb-4">일별 팝업 예약 & 방문 추이</h4>
            <div style={{ height: 300 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={popupChartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.04)" vertical={false} />
                  <XAxis dataKey="name" stroke="rgba(0,0,0,0.4)" tickLine={false} axisLine={false} tick={{ fontSize: 10 }} />
                  <YAxis stroke="rgba(0,0,0,0.3)" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend wrapperStyle={{ fontSize: "11px", paddingTop: "8px" }} />
                  <Bar dataKey="사전예약" fill="#f59e0b" radius={[4, 4, 0, 0]} barSize={24} />
                  <Bar dataKey="방문객" fill="#fcd34d" radius={[4, 4, 0, 0]} barSize={24} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </GlassCard>
        )}

        {/* 팝업 테이블 */}
        <GlassCard className="p-0 overflow-hidden">
          {popupActivities.length === 0 ? (
            <div className="flex items-center justify-center h-[100px] text-gray-400 text-sm">
              등록된 팝업 데이터가 없습니다. 시트를 연결하거나 데이터를 붙여넣어 주세요.
            </div>
          ) : (
            <Table>
              <TableHeader className="bg-gray-50">
                <TableRow className="border-gray-100 hover:bg-transparent">
                  <TableHead className="text-gray-500 text-xs">날짜</TableHead>
                  <TableHead className="text-gray-500 text-xs">팝업명</TableHead>
                  <TableHead className="text-gray-500 text-xs text-right">사전예약</TableHead>
                  <TableHead className="text-gray-500 text-xs text-right">방문객</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {popupActivities.map(row => (
                  <TableRow key={row._id} className="border-gray-100 hover:bg-gray-50 text-sm">
                    <TableCell className="text-gray-500 text-xs font-mono">{row.startDate}</TableCell>
                    <TableCell className="font-medium text-gray-900">{row.title}</TableCell>
                    <TableCell className="text-right font-mono text-gray-600">{row.visitors.toLocaleString()}</TableCell>
                    <TableCell className="text-right font-mono text-gray-900 font-bold">{row.participants.toLocaleString()}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </GlassCard>
      </section>

      {/* ── 붙여넣기 확인 모달 ── */}
      {pastedData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm">
          <div className="bg-white border border-gray-200 rounded-2xl p-6 w-[600px] flex flex-col shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-gray-900 font-bold">활동 데이터 감지됨 ({pastedData.length}건)</h3>
              <button onClick={() => setPastedData(null)} className="text-gray-400 hover:text-gray-900"><X className="w-4 h-4" /></button>
            </div>
            <div className="overflow-y-auto max-h-[40vh] space-y-1 mb-6 border border-gray-100 p-2 rounded-lg">
              {pastedData.slice(0, 5).map((row, i) => (
                <div key={i} className="flex gap-2 text-xs text-gray-500 whitespace-nowrap bg-gray-50 rounded p-1.5 overflow-hidden">
                  {row.map((col: string, j: number) => <span key={j} className="w-20 truncate">{col}</span>)}
                </div>
              ))}
              {pastedData.length > 5 && <div className="text-center text-xs text-gray-300 pt-2">+ {pastedData.length - 5} rows</div>}
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="ghost" className="text-gray-500" onClick={() => setPastedData(null)}>취소</Button>
              <Button className="bg-gray-900 text-white hover:bg-gray-800" onClick={handleApplyPaste}>
                <Check className="w-4 h-4 mr-2" /> 확인 및 업로드
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
