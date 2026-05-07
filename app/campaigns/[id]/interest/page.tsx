"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { useParams } from "next/navigation";
import { useRefresh } from "@/lib/refresh-context";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { GlassCard } from "@/components/glass-card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Check, X, Settings2, Link2, RefreshCw, Users, CalendarDays, BarChart3, Ticket, TrendingUp, MessageSquare, MapPin, PieChart, List, Smile, Frown, MessageCircle, Star, Quote, ArrowUpRight } from "lucide-react";
import { BarChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ComposedChart, Cell, PieChart as RechartsPieChart, Pie } from "recharts";
import { cn } from "@/lib/utils";

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
      <p className="text-gray-900 font-semibold mb-1">{label}</p>
      {payload.map((p: any, i: number) => (
        <p key={i} className="text-gray-600 flex items-center gap-1.5 mt-1">
          <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: p.color }} />
          {p.name}: <span className="font-mono font-bold text-gray-900">{p.value?.toLocaleString()}</span>
        </p>
      ))}
    </div>
  );
};

function extractSheetId(url: string): string | null {
  const m = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  return m ? m[1] : null;
}

// ─── Mock Data ─────────────────────────────────────────────────────────
const MOCK_QUESTIONS = [
  { id: "q1", text: "참여 동기가 무엇인가요?", type: "choice" },
  { id: "q2", text: "가장 기대되는 프로그램은?", type: "choice" },
  { id: "q3", text: "우리 브랜드를 어떻게 알게 되셨나요?", type: "choice" },
  { id: "q4", text: "오프라인 행사에 바라는 점 (주관식)", type: "text" },
  { id: "q5", text: "기타 문의사항 (주관식)", type: "text" },
];

const MOCK_ANSWERS: Record<string, any[]> = {
  "참여 동기가 무엇인가요?": [
    { name: "SNS 광고", value: 450, fill: "#818cf8" },
    { name: "지인 추천", value: 300, fill: "#a78bfa" },
    { name: "평소 관심", value: 200, fill: "#f472b6" },
    { name: "경품 이벤트", value: 50, fill: "#fb923c" },
  ],
  "가장 기대되는 프로그램은?": [
    { name: "체험존", value: 500, fill: "#60a5fa" },
    { name: "강연", value: 250, fill: "#34d399" },
    { name: "굿즈 증정", value: 150, fill: "#fbbf24" },
    { name: "기타", value: 100, fill: "#9ca3af" },
  ],
  "우리 브랜드를 어떻게 알게 되셨나요?": [
    { name: "인스타그램", value: 600, fill: "#e879f9" },
    { name: "유튜브", value: 200, fill: "#f87171" },
    { name: "블로그", value: 100, fill: "#4ade80" },
    { name: "검색", value: 100, fill: "#94a3b8" },
  ]
};

const MOCK_KEYWORDS = [
  { text: "다양한 체험", weight: 80 },
  { text: "예쁜 포토존", weight: 65 },
  { text: "사은품 퀄리티", weight: 50 },
  { text: "친절한 안내", weight: 40 },
  { text: "주차 공간", weight: 30 },
];

const MOCK_RAW_RESPONSES = [
  { date: "2026-05-01", text: "다양한 체험 프로그램이 많았으면 좋겠습니다. 특히 사진 찍을 곳이 많길 바라요." },
  { date: "2026-05-02", text: "사은품 퀄리티가 기대됩니다! 지난번 행사 때 너무 좋았거든요." },
  { date: "2026-05-02", text: "아이들과 함께 가기 좋은 편안한 분위기면 좋겠습니다." },
  { date: "2026-05-03", text: "주차 공간 안내가 미리 잘 되었으면 좋겠어요." },
  { date: "2026-05-04", text: "예쁜 포토존 많이 만들어주세요~" },
];

const MOCK_POPUP_RESERVATIONS = [
  { date: "04/28", count: 80, cumulative: 80 },
  { date: "04/29", count: 120, cumulative: 200 },
  { date: "04/30", count: 200, cumulative: 400 },
  { date: "05/01", count: 150, cumulative: 550 },
  { date: "05/02", count: 90, cumulative: 640 },
];

const MOCK_POPUP_VISITORS = [
  { date: "05/01", scheduled: 120, actual: 100, rate: "83.3%" },
  { date: "05/02", scheduled: 150, actual: 140, rate: "93.3%" },
  { date: "05/03", scheduled: 200, actual: 190, rate: "95.0%" },
  { date: "05/04", scheduled: 180, actual: 160, rate: "88.9%" },
  { date: "05/05", scheduled: 220, actual: 210, rate: "95.5%" },
];

const MOCK_REVIEWS = [
  { date: "2026-05-02", rating: 5, text: "공간이 너무 예쁘고 직원분들이 친절해요! 굿즈도 퀄리티 대박입니다.", sentiment: "positive", keywords: ["예쁜 공간", "친절함", "굿즈"] },
  { date: "2026-05-03", rating: 4, text: "체험할 거리가 많아서 시간 가는 줄 몰랐어요. 다만 사람이 너무 많아서 조금 대기했습니다.", sentiment: "positive", keywords: ["다양한 체험", "대기 시간"] },
  { date: "2026-05-04", rating: 5, text: "인생샷 건졌습니다! 포토존 조명이 예술이에요.", sentiment: "positive", keywords: ["포토존", "인생샷"] },
  { date: "2026-05-05", rating: 3, text: "주차하기가 너무 힘들었어요. 행사 자체는 나쁘지 않았습니다.", sentiment: "negative", keywords: ["주차 불편"] },
  { date: "2026-05-06", rating: 5, text: "다양한 체험 프로그램 덕분에 아이들과 즐거운 시간 보냈습니다.", sentiment: "positive", keywords: ["다양한 체험"] },
  { date: "2026-05-06", rating: 4, text: "굿즈 퀄리티가 정말 좋네요. 재방문 의사 있습니다.", sentiment: "positive", keywords: ["굿즈"] },
];

const MOCK_REVIEW_STATS = {
  total: 1245,
  keywords: [
    { text: "예쁜 공간", count: 850, sentiment: "positive" },
    { text: "다양한 체험", count: 720, sentiment: "positive" },
    { text: "친절함", count: 530, sentiment: "positive" },
    { text: "굿즈", count: 420, sentiment: "positive" },
    { text: "인생샷", count: 310, sentiment: "positive" },
    { text: "대기 시간", count: 180, sentiment: "negative" },
    { text: "주차 불편", count: 150, sentiment: "negative" },
  ]
};

// ─── 메인 ──────────────────────────────────────────────────────────────
export default function InterestPage() {
  const params = useParams();
  const id = params.id as string;
  const campaignId = id as Id<"campaigns">;

  const { refreshTrigger } = useRefresh();
  const [lastRefresh, setLastRefresh] = useState(0);

  const activities = useQuery(api.interest.getInterestActivities, { campaignId }) ?? [];
  const syncActivities = useMutation(api.interest.syncInterestActivities);

  const [pastedData, setPastedData] = useState<any[] | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [activeTab, setActiveTab] = useState<"event" | "popup">("event");
  const [selectedQuestionId, setSelectedQuestionId] = useState<string>("q1");

  // ── 스프레드시트 URL 상태 ──
  const [eventSheetUrl, setEventSheetUrl] = useState("");
  const [popupSheetUrl, setPopupSheetUrl] = useState("");
  const [syncing, setSyncing] = useState<"event" | "popup" | null>(null);
  const [syncMessage, setSyncMessage] = useState("");

  useEffect(() => {
    const savedEvent = localStorage.getItem(`interest_event_sheet_${campaignId}`);
    const savedPopup = localStorage.getItem(`interest_popup_sheet_${campaignId}`);
    if (savedEvent) setEventSheetUrl(savedEvent);
    if (savedPopup) setPopupSheetUrl(savedPopup);
  }, [campaignId]);

  useEffect(() => {
    if (refreshTrigger !== lastRefresh) {
      setLastRefresh(refreshTrigger);
    }
  }, [refreshTrigger, lastRefresh]);

  const syncFromSheet = useCallback(async (type: "event" | "popup", url: string) => {
    const sheetId = extractSheetId(url);
    if (!sheetId) { setSyncMessage("❌ 올바른 구글 시트 URL이 아닙니다."); return; }
    setSyncing(type);
    setSyncMessage("");
    try {
      const csvUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv`;
      const res = await fetch(csvUrl);
      if (!res.ok) throw new Error("시트 접근 실패. 공유 설정을 확인하세요.");
      const text = await res.text();
      const rows = text.split("\n").map(line => {
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

      const headers = rows[0].map(h => h.toLowerCase());
      const dataRows = rows.slice(1);
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

  const eventActivities = useMemo(() => activities.filter(a => a.activityType !== "팝업"), [activities]);
  const popupActivities = useMemo(() => activities.filter(a => a.activityType === "팝업"), [activities]);

  const eventStats = useMemo(() => ({
    participants: eventActivities.reduce((s, a) => s + a.participants, 0) || 1250, // mock fallback
    traffic: eventActivities.reduce((s, a) => s + a.visitors, 0) || 4500, // mock fallback
  }), [eventActivities]);

  const popupStats = useMemo(() => ({
    visitors: popupActivities.reduce((s, a) => s + a.participants, 0) || 800, // mock fallback
    reservations: popupActivities.reduce((s, a) => s + a.visitors, 0) || 870, // mock fallback
  }), [popupActivities]);

  const combinedChartData = useMemo(() => {
    const map = new Map<string, any>();
    
    eventActivities.forEach(a => {
      const date = a.startDate ? a.startDate.slice(5).replace("-", "/") : "미상";
      if(!map.has(date)) map.set(date, { name: date, 이벤트참여자: 0, 팝업방문객: 0 });
      map.get(date).이벤트참여자 += a.participants;
    });

    popupActivities.forEach(a => {
      const date = a.startDate ? a.startDate.slice(5).replace("-", "/") : "미상";
      if(!map.has(date)) map.set(date, { name: date, 이벤트참여자: 0, 팝업방문객: 0 });
      map.get(date).팝업방문객 += a.participants; 
    });

    const arr = Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
    if (arr.length === 0) {
      return [
        { name: "05/01", 이벤트참여자: 120, 팝업방문객: 100 },
        { name: "05/02", 이벤트참여자: 150, 팝업방문객: 140 },
        { name: "05/03", 이벤트참여자: 200, 팝업방문객: 190 },
        { name: "05/04", 이벤트참여자: 180, 팝업방문객: 160 },
        { name: "05/05", 이벤트참여자: 220, 팝업방문객: 210 },
      ];
    }
    return arr;
  }, [eventActivities, popupActivities]);

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
          <p className="text-xs text-gray-400 mt-1">캠페인 내 이벤트 참여 성과와 오프라인 팝업 방문 성과를 종합적으로 확인합니다.</p>
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

      {showSettings && (
        <GlassCard className="p-6 border-indigo-100 bg-indigo-50/30">
          <h3 className="text-sm font-bold text-gray-900 mb-4 flex items-center gap-2">
            <Link2 className="w-4 h-4 text-indigo-500" /> 스프레드시트 연결
          </h3>
          <p className="text-xs text-gray-500 mb-4">구글 시트 URL을 입력하면 자동으로 데이터를 파싱합니다. 시트는 <strong>링크가 있는 모든 사용자에게 공개</strong>되어야 합니다.</p>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div className="flex flex-col gap-2">
              <label className="text-xs font-semibold text-gray-700">📋 이벤트 신청 데이터</label>
              <div className="flex gap-2">
                <input
                  className="flex-1 bg-white border border-gray-200 rounded-lg px-3 py-2 text-xs text-gray-900 outline-none focus:border-indigo-400 placeholder:text-gray-400"
                  placeholder="구글 시트 URL 입력"
                  value={eventSheetUrl}
                  onChange={e => setEventSheetUrl(e.target.value)}
                />
                <Button size="sm" disabled={syncing === "event" || !eventSheetUrl} onClick={() => syncFromSheet("event", eventSheetUrl)} className="bg-indigo-600 text-white hover:bg-indigo-700 border-0 gap-1 px-3">
                  {syncing === "event" ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />} 동기화
                </Button>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-xs font-semibold text-gray-700">🏬 팝업 예약/방문 데이터</label>
              <div className="flex gap-2">
                <input
                  className="flex-1 bg-white border border-gray-200 rounded-lg px-3 py-2 text-xs text-gray-900 outline-none focus:border-amber-400 placeholder:text-gray-400"
                  placeholder="구글 시트 URL 입력"
                  value={popupSheetUrl}
                  onChange={e => setPopupSheetUrl(e.target.value)}
                />
                <Button size="sm" disabled={syncing === "popup" || !popupSheetUrl} onClick={() => syncFromSheet("popup", popupSheetUrl)} className="bg-amber-600 text-white hover:bg-amber-700 border-0 gap-1 px-3">
                  {syncing === "popup" ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />} 동기화
                </Button>
              </div>
            </div>
          </div>

          {syncMessage && (
            <p className={`text-xs mt-2 ${syncMessage.startsWith("✅") ? "text-green-600" : "text-red-500"}`}>{syncMessage}</p>
          )}
        </GlassCard>
      )}

      {/* 1. 상단 : 핵심 참여 현황 요약 (KPI 카드) */}
      <section>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <GlassCard className="p-6 flex flex-col justify-center border-t-4 border-t-red-600">
            <div className="flex justify-between items-start mb-2">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-red-50 flex items-center justify-center"><Users className="w-4 h-4 text-red-600" /></div>
                <p className="text-sm text-gray-500 font-medium">총 참여자 수</p>
              </div>
              <span className="flex items-center text-xs font-semibold text-green-600 bg-green-50 px-2 py-0.5 rounded-full"><ArrowUpRight className="w-3 h-3 mr-0.5"/> 12.5%</span>
            </div>
            <p className="text-3xl font-bold font-mono text-gray-900 mt-2">{(eventStats.participants + popupStats.visitors).toLocaleString()}<span className="text-sm font-sans text-gray-400 ml-1 font-medium">명</span></p>
            <p className="text-[11px] text-gray-400 mt-2">이벤트 참여자 + 팝업 방문객 합산</p>
          </GlassCard>
          
          <GlassCard className="p-6 flex flex-col justify-center">
            <div className="flex justify-between items-start mb-2">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-red-50 flex items-center justify-center"><Ticket className="w-4 h-4 text-red-600" /></div>
                <p className="text-sm text-gray-500 font-medium">이벤트 참여자 수</p>
              </div>
              <span className="flex items-center text-xs font-semibold text-green-600 bg-green-50 px-2 py-0.5 rounded-full"><ArrowUpRight className="w-3 h-3 mr-0.5"/> 8.2%</span>
            </div>
            <p className="text-3xl font-bold font-mono text-gray-900 mt-2">{(eventStats.participants).toLocaleString()}<span className="text-sm font-sans text-gray-400 ml-1 font-medium">명</span></p>
            <p className="text-[11px] text-gray-400 mt-2 flex items-center gap-1">
              이벤트 페이지 누적 트래픽: <span className="font-mono text-gray-600 font-semibold">{eventStats.traffic.toLocaleString()}</span>
            </p>
          </GlassCard>
          
          <GlassCard className="p-6 flex flex-col justify-center">
            <div className="flex justify-between items-start mb-2">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center"><MapPin className="w-4 h-4 text-gray-900" /></div>
                <p className="text-sm text-gray-500 font-medium">실제 팝업 방문객 수</p>
              </div>
              <span className="flex items-center text-xs font-semibold text-green-600 bg-green-50 px-2 py-0.5 rounded-full"><ArrowUpRight className="w-3 h-3 mr-0.5"/> 15.3%</span>
            </div>
            <p className="text-3xl font-bold font-mono text-gray-900 mt-2">{(popupStats.visitors).toLocaleString()}<span className="text-sm font-sans text-gray-400 ml-1 font-medium">명</span></p>
            <p className="text-[11px] text-gray-400 mt-2 flex items-center gap-1">
              누적 예약 고객 수: <span className="font-mono text-gray-600 font-semibold">{popupStats.reservations.toLocaleString()}</span>
            </p>
          </GlassCard>
        </div>
      </section>

      {/* 2. 중단 : 일별 참여 추이 그래프 */}
      <section>
        <GlassCard className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-gray-500" /> 일별 참여 추이
            </h3>
          </div>
          <div style={{ height: 320 }}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={combinedChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.04)" vertical={false} />
                <XAxis dataKey="name" stroke="rgba(0,0,0,0.4)" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} dy={10} />
                <YAxis stroke="rgba(0,0,0,0.3)" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
                <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(0,0,0,0.02)' }} />
                <Legend wrapperStyle={{ fontSize: "12px", paddingTop: "16px" }} iconType="circle" />
                <Bar dataKey="이벤트참여자" name="이벤트 참여자" fill="#e50010" radius={[4, 4, 0, 0]} barSize={32} />
                <Line type="monotone" dataKey="팝업방문객" name="팝업 방문객" stroke="#111827" strokeWidth={3} dot={{ r: 4, fill: "#111827", strokeWidth: 2, stroke: "#fff" }} activeDot={{ r: 6 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </GlassCard>
      </section>

      {/* 3. 하단 : 이벤트 / 팝업 상세 분석 영역 */}
      <section>
        <div className="flex gap-4 border-b border-gray-200 mb-6">
          <button
            onClick={() => setActiveTab("event")}
            className={cn("px-4 py-3 text-sm font-bold flex items-center gap-2 border-b-2 transition-all", activeTab === "event" ? "border-red-600 text-red-600" : "border-transparent text-gray-400 hover:text-gray-600")}
          >
            <MessageSquare className="w-4 h-4" /> 이벤트 응답 분석
          </button>
          <button
            onClick={() => setActiveTab("popup")}
            className={cn("px-4 py-3 text-sm font-bold flex items-center gap-2 border-b-2 transition-all", activeTab === "popup" ? "border-gray-900 text-gray-900" : "border-transparent text-gray-400 hover:text-gray-600")}
          >
            <MapPin className="w-4 h-4" /> 팝업 성과 & 리뷰 분석
          </button>
        </div>

        {activeTab === "event" && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <GlassCard className="p-6">
              <div className="flex flex-col md:flex-row gap-6">
                <div className="w-full md:w-1/3 border-r border-gray-100 pr-0 md:pr-6">
                  <h4 className="text-sm font-bold text-gray-900 mb-4 flex items-center gap-2">
                    <List className="w-4 h-4 text-red-600" /> 분석할 질문 선택
                  </h4>
                  <div className="space-y-2">
                    {MOCK_QUESTIONS.map(q => (
                      <button
                        key={q.id}
                        onClick={() => setSelectedQuestionId(q.id)}
                        className={cn("w-full text-left px-3 py-2.5 rounded-lg text-xs font-medium transition-all border",
                          selectedQuestionId === q.id ? "bg-red-50 border-red-200 text-red-700" : "bg-white border-gray-200 text-gray-600 hover:border-gray-300")}
                      >
                        <div className="flex items-center justify-between">
                          <span className="truncate">{q.text}</span>
                          {selectedQuestionId === q.id && <Check className="w-3.5 h-3.5 shrink-0" />}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
                
                <div className="w-full md:w-2/3">
                  {(() => {
                    const q = MOCK_QUESTIONS.find(x => x.id === selectedQuestionId);
                    if (!q) return null;

                    if (q.type === "choice") {
                      return (
                        <div className="border border-gray-100 rounded-xl p-5 bg-white shadow-sm h-full flex flex-col">
                          <h5 className="text-sm font-bold text-gray-800 mb-4">{q.text}</h5>
                          <div className="flex-1 min-h-[250px] w-full">
                            <ResponsiveContainer width="100%" height="100%">
                              <RechartsPieChart>
                                <Pie
                                  data={MOCK_ANSWERS[q.text] || MOCK_ANSWERS["참여 동기가 무엇인가요?"]}
                                  cx="50%" cy="50%"
                                  innerRadius={60} outerRadius={100}
                                  paddingAngle={2}
                                  dataKey="value"
                                >
                                  {(MOCK_ANSWERS[q.text] || MOCK_ANSWERS["참여 동기가 무엇인가요?"]).map((entry: any, index: number) => (
                                    <Cell key={`cell-${index}`} fill={entry.fill} />
                                  ))}
                                </Pie>
                                <Tooltip content={<CustomTooltip />} />
                                <Legend layout="vertical" verticalAlign="middle" align="right" wrapperStyle={{ fontSize: '11px' }} iconType="circle" />
                              </RechartsPieChart>
                            </ResponsiveContainer>
                          </div>
                        </div>
                      );
                    }

                    if (q.type === "text") {
                      return (
                        <div className="border border-gray-100 rounded-xl p-5 bg-white shadow-sm h-full flex flex-col gap-6">
                          <div>
                            <h5 className="text-sm font-bold text-gray-800 mb-4 flex items-center gap-2">
                              <MessageCircle className="w-4 h-4 text-red-600" /> 주관식 키워드 분석
                            </h5>
                            <div className="flex flex-wrap gap-2">
                              {MOCK_KEYWORDS.map((kw, i) => (
                                <div key={i} className="bg-red-50 text-red-700 px-3 py-1.5 rounded-full text-sm font-medium border border-red-100 flex items-center gap-1.5" style={{ transform: `scale(${1 + (kw.weight - 30) / 100})`, transformOrigin: 'left center' }}>
                                  #{kw.text} <span className="text-[10px] text-red-400 font-mono bg-white px-1.5 py-0.5 rounded-full">{kw.weight}%</span>
                                </div>
                              ))}
                            </div>
                          </div>
                          <div className="flex-1 flex flex-col">
                            <h5 className="text-sm font-bold text-gray-800 mb-3 flex items-center gap-2">
                              <Quote className="w-4 h-4 text-red-600" /> 주요 주관식 원문
                            </h5>
                            <div className="space-y-3 flex-1 overflow-y-auto pr-2 custom-scrollbar max-h-[250px]">
                              {MOCK_RAW_RESPONSES.map((r, i) => (
                                <div key={i} className="bg-gray-50 border border-gray-100 rounded-lg p-3">
                                  <p className="text-xs text-gray-400 mb-1 font-mono">{r.date}</p>
                                  <p className="text-sm text-gray-700 leading-relaxed">"{r.text}"</p>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      );
                    }
                  })()}
                </div>
              </div>
            </GlassCard>
          </div>
        )}

        {activeTab === "popup" && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <GlassCard className="p-0 overflow-hidden border-t-4 border-t-gray-900">
                <div className="p-5 border-b border-gray-100 bg-white">
                  <h4 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                    <CalendarDays className="w-4 h-4 text-gray-900" /> 일자별 예약 신청 건 수
                  </h4>
                </div>
                <Table>
                  <TableHeader className="bg-gray-50/50">
                    <TableRow className="border-gray-100 hover:bg-transparent">
                      <TableHead className="text-gray-500 text-xs font-semibold">신청 일자</TableHead>
                      <TableHead className="text-gray-500 text-xs font-semibold text-right">당일 신청 건</TableHead>
                      <TableHead className="text-gray-500 text-xs font-semibold text-right">누적 신청 건</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {MOCK_POPUP_RESERVATIONS.map((row, i) => (
                      <TableRow key={i} className="border-gray-100 hover:bg-gray-50 text-sm">
                        <TableCell className="text-gray-600 font-mono font-medium">{row.date}</TableCell>
                        <TableCell className="text-right font-mono text-gray-900 font-bold">{row.count.toLocaleString()}</TableCell>
                        <TableCell className="text-right font-mono text-gray-600 bg-gray-50">{row.cumulative.toLocaleString()}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </GlassCard>

              <GlassCard className="p-0 overflow-hidden border-t-4 border-t-gray-900">
                <div className="p-5 border-b border-gray-100 bg-white">
                  <h4 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                    <Users className="w-4 h-4 text-gray-900" /> 일자별 방문자 수
                  </h4>
                </div>
                <Table>
                  <TableHeader className="bg-gray-50/50">
                    <TableRow className="border-gray-100 hover:bg-transparent">
                      <TableHead className="text-gray-500 text-xs font-semibold">방문 일자</TableHead>
                      <TableHead className="text-gray-500 text-xs font-semibold text-right">예약/예정 인원</TableHead>
                      <TableHead className="text-gray-500 text-xs font-semibold text-right">실 방문객</TableHead>
                      <TableHead className="text-gray-500 text-xs font-semibold text-right">방문율</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {MOCK_POPUP_VISITORS.map((row, i) => (
                      <TableRow key={i} className="border-gray-100 hover:bg-gray-50 text-sm">
                        <TableCell className="text-gray-600 font-mono font-medium">{row.date}</TableCell>
                        <TableCell className="text-right font-mono text-gray-600">{row.scheduled.toLocaleString()}</TableCell>
                        <TableCell className="text-right font-mono text-gray-900 font-bold">{row.actual.toLocaleString()}</TableCell>
                        <TableCell className="text-right font-mono text-gray-900 font-bold bg-gray-50">{row.rate}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </GlassCard>
            </div>

            <GlassCard className="p-6">
              <div className="flex flex-col md:flex-row md:items-center justify-between mb-4 border-b border-gray-100 pb-4 gap-4">
                <div className="flex items-center gap-3">
                  <h4 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                    <Star className="w-4 h-4 text-gray-900 fill-gray-900" /> 네이버 플레이스 방문자 리뷰 분석
                  </h4>
                  <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-bold">
                    총 {MOCK_REVIEW_STATS.total.toLocaleString()}건
                  </span>
                </div>
                <div className="flex gap-2">
                  <span className="text-xs bg-green-50 text-green-700 px-2 py-1 rounded-md font-medium border border-green-100 flex items-center gap-1"><Smile className="w-3 h-3"/> 긍정 85%</span>
                  <span className="text-xs bg-red-50 text-red-700 px-2 py-1 rounded-md font-medium border border-red-100 flex items-center gap-1"><Frown className="w-3 h-3"/> 부정 15%</span>
                </div>
              </div>

              {/* Keyword Analysis */}
              <div className="mb-6">
                <h5 className="text-xs font-bold text-gray-700 mb-3">주요 언급 키워드</h5>
                <div className="flex flex-wrap gap-2">
                  {MOCK_REVIEW_STATS.keywords.map((kw, i) => (
                    <div key={i} className={cn("px-3 py-1.5 rounded-full text-xs font-medium border flex items-center gap-1.5", 
                      kw.sentiment === "positive" ? "bg-green-50 text-green-700 border-green-100" : "bg-red-50 text-red-700 border-red-100"
                    )}>
                      #{kw.text} <span className="font-mono bg-white px-1.5 py-0.5 rounded-full opacity-80">{kw.count}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Scrollable Reviews */}
              <div>
                <h5 className="text-xs font-bold text-gray-700 mb-3">최근 리뷰 목록</h5>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                  {MOCK_REVIEWS.map((review, i) => (
                    <div key={i} className="bg-white border border-gray-100 hover:border-gray-300 transition-colors shadow-sm rounded-xl p-4 flex flex-col justify-between">
                      <div>
                        <div className="flex justify-between items-start mb-2">
                          <div className="flex gap-0.5">
                            {[...Array(5)].map((_, j) => (
                              <Star key={j} className={cn("w-3.5 h-3.5", j < review.rating ? "text-yellow-400 fill-yellow-400" : "text-gray-200 fill-gray-200")} />
                            ))}
                          </div>
                          <span className="text-[10px] font-mono text-gray-400">{review.date}</span>
                        </div>
                        <p className="text-sm text-gray-800 leading-snug mb-3">{review.text}</p>
                      </div>
                      <div className="flex flex-wrap gap-1.5 mt-auto pt-3 border-t border-gray-50">
                        {review.keywords.map(kw => (
                          <span key={kw} className={cn("text-[10px] px-2 py-0.5 rounded-full font-medium", review.sentiment === 'positive' ? "bg-green-50 text-green-600" : "bg-red-50 text-red-600")}>
                            {kw}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </GlassCard>
          </div>
        )}
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
