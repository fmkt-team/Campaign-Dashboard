"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useParams } from "next/navigation";
import { useRefresh } from "@/lib/refresh-context";
import { GlassCard } from "@/components/glass-card";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend, PieChart, Pie, Cell,
} from "recharts";
import { RefreshCw, Search, X, Check, GripVertical, Copy, ClipboardCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";
import { DatePickerWithRange } from "@/components/date-range-picker";
import { DateRange } from "react-day-picker";
import { format, startOfMonth, endOfMonth, parseISO } from "date-fns";
import { Id } from "@/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";

const LINE_COLORS = ["#6366f1", "#10b981", "#f59e0b", "#ef4444", "#38bdf8", "#8b5cf6"];
const SERVICE_ACCOUNT_EMAIL = "dashboard-bot@fursys-website-maps.iam.gserviceaccount.com";

// ─── 도넛 차트 공통 컴포넌트 ─────────────────────────────────────────────────
const GENDER_COLORS: Record<string, string> = {
  male: "#6366f1", female: "#ec4899", unknown: "#e2e8f0",
};
const AGE_PALETTE = ["#818cf8","#6366f1","#4f46e5","#4338ca","#3730a3","#312e81","#e2e8f0"];
const AGE_ORDER   = ["18-24","25-34","35-44","45-54","55-64","65+","unknown"];

function DonutChart({ data, title, compact = false, className }: {
  data: { name: string; value: number; color: string }[];
  title: string;
  compact?: boolean;
  className?: string;
}) {
  const total = data.reduce((s, d) => s + d.value, 0);
  const RADIAN = Math.PI / 180;
  const renderLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent }: any) => {
    if (percent < 0.04) return null;
    const r = innerRadius + (outerRadius - innerRadius) * 0.5;
    const x = cx + r * Math.cos(-midAngle * RADIAN);
    const y = cy + r * Math.sin(-midAngle * RADIAN);
    return (
      <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central"
        fontSize={11} fontWeight={700}>
        {`${(percent * 100).toFixed(0)}%`}
      </text>
    );
  };
  const tooltipStyle = { fontSize: "12px", borderRadius: "10px", border: "1px solid #f0f0f0" };
  const tooltipFmt  = (v: any) =>
    [`${Number(v).toLocaleString()}명 (${total > 0 ? ((v / total) * 100).toFixed(1) : 0}%)`];

  if (compact) {
    return (
      <GlassCard className={cn("p-4 flex flex-col", className)}>
        <h4 className="text-sm font-bold text-gray-900 mb-2 flex-shrink-0">{title}</h4>
        {data.length === 0 ? (
          <div className="flex-1 flex items-center justify-center text-gray-300 text-xs text-center leading-relaxed">
            데이터 없음<br/>(Google 신호 미활성화)
          </div>
        ) : (
          <div className="flex-1 flex items-center gap-3 min-h-0">
            <div className="w-[120px] flex-shrink-0 self-stretch">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={data} cx="50%" cy="50%"
                    innerRadius={36} outerRadius={56}
                    dataKey="value" labelLine={false}
                    startAngle={90} endAngle={-270}>
                    {data.map((entry, i) => (
                      <Cell key={i} fill={entry.color} stroke="white" strokeWidth={2} />
                    ))}
                  </Pie>
                  <Tooltip formatter={tooltipFmt} contentStyle={tooltipStyle} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex flex-col justify-center gap-2 flex-1 min-w-0">
              {data.map((d, i) => (
                <div key={i} className="flex items-center gap-2 text-[11px]">
                  <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: d.color }} />
                  <span className="text-gray-600 truncate">{d.name}</span>
                  <span className="text-gray-500 font-mono ml-auto flex-shrink-0">
                    {total > 0 ? `${((d.value / total) * 100).toFixed(1)}%` : "—"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </GlassCard>
    );
  }

  return (
    <GlassCard className="p-6">
      <h4 className="text-sm font-bold text-gray-900 mb-3">{title}</h4>
      {data.length === 0 ? (
        <div className="flex items-center justify-center h-[200px] text-gray-300 text-xs text-center leading-relaxed">
          데이터 없음<br/>(Google 신호 미활성화)
        </div>
      ) : (
        <div className="flex items-center gap-4">
          <div className="h-[200px] w-[180px] flex-shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={data} cx="50%" cy="50%"
                  innerRadius={52} outerRadius={82}
                  dataKey="value" labelLine={false} label={renderLabel}
                  startAngle={90} endAngle={-270}>
                  {data.map((entry, i) => (
                    <Cell key={i} fill={entry.color} stroke="white" strokeWidth={2} />
                  ))}
                </Pie>
                <Tooltip formatter={tooltipFmt} contentStyle={tooltipStyle} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex flex-col gap-2.5 flex-1 min-w-0">
            {data.map((d, i) => (
              <div key={i} className="flex items-center gap-2 text-xs">
                <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: d.color }} />
                <span className="text-gray-600 truncate">{d.name}</span>
                <span className="text-gray-400 font-mono ml-auto flex-shrink-0 text-[10px]">
                  {total > 0 ? `${((d.value / total) * 100).toFixed(1)}%` : "—"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </GlassCard>
  );
}

function DemoSection({ gender, age, compact = false }: { gender: any[]; age: any[]; compact?: boolean }) {
  const genderData = gender
    .map(r => ({
      name: r.userGender === "male" ? "남성" : r.userGender === "female" ? "여성" : "미분류",
      value: r.activeUsers,
      color: GENDER_COLORS[r.userGender] ?? "#e2e8f0",
    }))
    .sort((a, b) => (a.name === "미분류" ? 1 : b.name === "미분류" ? -1 : 0));

  const sortedAge = [...age].sort((a, b) => {
    const ai = AGE_ORDER.indexOf(a.userAgeBracket);
    const bi = AGE_ORDER.indexOf(b.userAgeBracket);
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
  });
  const ageData = sortedAge.map((r, i) => ({
    name: r.userAgeBracket === "unknown" ? "미분류" : r.userAgeBracket,
    value: r.activeUsers,
    color: r.userAgeBracket === "unknown" ? "#e2e8f0" : AGE_PALETTE[i % AGE_PALETTE.length],
  }));

  return (
    <div className={compact ? "flex flex-col gap-4 h-full" : "grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6"}>
      <DonutChart data={genderData} title="성별 분포" compact={compact} className={compact ? "flex-1" : undefined} />
      <DonutChart data={ageData}   title="연령 분포" compact={compact} className={compact ? "flex-1" : undefined} />
    </div>
  );
}

// ─── TOP5 유입 소스 테이블 ────────────────────────────────────────────────────
function fmtDuration(secs: number): string {
  if (!secs || isNaN(secs)) return "—";
  const m = Math.floor(secs / 60);
  const s = Math.round(secs % 60);
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function TopSourcesTable({ sources, className }: { sources: any[] | null; className?: string }) {
  return (
    <div className={cn("flex flex-col", className)}>
      <GlassCard className="p-0 overflow-hidden flex flex-col flex-1">
        <div className="px-6 py-4 border-b border-gray-100 flex-shrink-0">
          <h3 className="text-sm font-bold text-gray-900">TOP 7 유입 소스 / 매체</h3>
        </div>
        <div className="overflow-x-auto flex-1">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="px-6 py-3 font-medium text-gray-500 text-xs">소스 / 매체</th>
                <th className="px-6 py-3 font-medium text-gray-500 text-xs text-right">세션</th>
                <th className="px-6 py-3 font-medium text-gray-500 text-xs text-right">사용자</th>
                <th className="px-6 py-3 font-medium text-gray-500 text-xs text-right">평균 참여시간</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {sources?.map((row, i) => (
                <tr key={i} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-3 text-gray-900 font-medium">
                    {row.sessionSource === "(direct)" ? "Direct" : row.sessionSource} /{" "}
                    {row.sessionMedium === "(none)" ? "None" : row.sessionMedium}
                  </td>
                  <td className="px-6 py-3 text-gray-600 text-right font-mono">{row.sessions?.toLocaleString() ?? 0}</td>
                  <td className="px-6 py-3 text-gray-600 text-right font-mono">{row.activeUsers?.toLocaleString() ?? 0}</td>
                  <td className="px-6 py-3 text-gray-600 text-right font-mono">{fmtDuration(row.averageSessionDuration)}</td>
                </tr>
              ))}
              {!sources?.length && (
                <tr>
                  <td colSpan={4} className="px-6 py-8 text-center text-gray-400 text-xs">데이터가 없습니다.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </GlassCard>
    </div>
  );
}

// ─── 권한 오류 카드 ────────────────────────────────────────────────────────────
function GA4PermissionError({
  error,
  onRetry,
  copiedEmail,
  onCopy,
}: {
  error: string;
  onRetry: () => void;
  copiedEmail: boolean;
  onCopy: () => void;
}) {
  const isPermission = error.includes("403") || error.includes("PERMISSION");
  return (
    <GlassCard className="p-8 border-red-500/20 bg-red-500/5">
      <p className="text-red-400 text-sm font-medium mb-1 text-center">⚠️ GA4 연동 오류</p>
      <p className="text-red-300 text-xs mb-4 text-center line-clamp-2">{error}</p>
      {isPermission && (
        <div className="bg-white border border-red-100 rounded-xl p-4 text-xs text-gray-600 space-y-3 mb-4">
          <p className="font-semibold text-red-500">🔐 권한 설정 필요 (속성 레벨)</p>
          <ol className="list-decimal list-inside space-y-1 text-gray-500">
            <li>Google Analytics → <strong>⚙️ 관리</strong></li>
            <li><strong>속성(Property)</strong> 열 → <strong>속성 액세스 관리</strong></li>
            <li>우측 상단 <strong>＋</strong> → 사용자 추가</li>
            <li>아래 이메일을 <strong>뷰어</strong> 권한으로 추가</li>
          </ol>
          <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
            <span className="font-mono text-[11px] text-gray-600 flex-1 select-all">{SERVICE_ACCOUNT_EMAIL}</span>
            <button
              onClick={onCopy}
              className="flex items-center gap-1 text-[10px] px-2 py-1 rounded-md bg-white border border-gray-200 hover:bg-gray-100 transition-colors flex-shrink-0"
            >
              {copiedEmail
                ? <><ClipboardCheck className="w-3 h-3 text-green-500" /><span className="text-green-500">복사됨</span></>
                : <><Copy className="w-3 h-3 text-gray-500" /><span className="text-gray-500">복사</span></>}
            </button>
          </div>
          <p className="text-gray-400 text-[11px]">⚠️ <strong>속성(Property) 레벨</strong>에서 추가해야 합니다.</p>
        </div>
      )}
      <div className="text-center">
        <button onClick={onRetry} className="text-xs text-gray-400 hover:text-gray-900 underline">다시 시도</button>
      </div>
    </GlassCard>
  );
}

// ─── 메인 ─────────────────────────────────────────────────────────────────────
export default function InflowPage() {
  const params = useParams();
  const id = params.id as string;
  const campaignId = id as Id<"campaigns">;
  const { isAdmin } = useAuth();
  const syncTrafficWeekly   = useMutation(api.inflow.syncTrafficWeekly);
  const updateGa4Ids        = useMutation(api.campaigns.updateCampaignGa4Ids);
  const updateCampaignLinks = useMutation(api.campaigns.updateCampaignLinks);
  const campaignData        = useQuery(api.campaigns.getCampaignById, { id: campaignId });
  const { refreshTrigger } = useRefresh();
  const [lastRefresh, setLastRefresh] = useState(0);

  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
  const [dateRangeInitialized, setDateRangeInitialized] = useState(false);

  // 캠페인 데이터 로드 후 기간을 캠페인 시작일 ~ 오늘로 초기화 (최초 1회)
  useEffect(() => {
    if (campaignData && !dateRangeInitialized) {
      const today = new Date();
      const from = campaignData.startDate
        ? parseISO(campaignData.startDate)
        : startOfMonth(today);
      setDateRange({ from, to: today });
      setDateRangeInitialized(true);
    }
  }, [campaignData, dateRangeInitialized]);
  const [activeTab, setActiveTab] = useState<"ga4" | "naver">("ga4");
  const [sectionOrder, setSectionOrder] = useState<("official" | "micro")[]>(["micro", "official"]);
  const [draggedSection, setDraggedSection] = useState<"official" | "micro" | null>(null);
  const [dragOverSection, setDragOverSection] = useState<"official" | "micro" | null>(null);
  const [copiedEmail, setCopiedEmail] = useState(false);

  const copyEmail = () => {
    navigator.clipboard.writeText(SERVICE_ACCOUNT_EMAIL).then(() => {
      setCopiedEmail(true);
      setTimeout(() => setCopiedEmail(false), 2000);
    });
  };

  const dateStr = useMemo(() => ({
    start: dateRange?.from ? format(dateRange.from, "yyyy-MM-dd") : "",
    end: dateRange?.to ? format(dateRange.to, "yyyy-MM-dd") : format(dateRange?.from || new Date(), "yyyy-MM-dd"),
  }), [dateRange]);

  // ─── 드래그 앤 드롭 ─────────────────────────────────────────────────────────
  const handleDragStart = (e: React.DragEvent, section: "official" | "micro") => {
    setDraggedSection(section);
    e.dataTransfer.effectAllowed = "move";
  };
  const handleDragOver = (e: React.DragEvent, section: "official" | "micro") => {
    e.preventDefault();
    if (draggedSection && draggedSection !== section) setDragOverSection(section);
  };
  const handleDrop = (e: React.DragEvent, target: "official" | "micro") => {
    e.preventDefault();
    if (draggedSection && draggedSection !== target) {
      const newOrder = [...sectionOrder];
      const a = newOrder.indexOf(draggedSection), b = newOrder.indexOf(target);
      [newOrder[a], newOrder[b]] = [newOrder[b], newOrder[a]];
      setSectionOrder(newOrder as ("official" | "micro")[]);
      localStorage.setItem(`sectionOrder_${campaignId}`, JSON.stringify(newOrder));
    }
    setDraggedSection(null); setDragOverSection(null);
  };
  const handleDragEnd = () => { setDraggedSection(null); setDragOverSection(null); };

  // ─── 공식몰 GA4 ─────────────────────────────────────────────────────────────
  const [officialGa4Id, setOfficialGa4Id] = useState("");
  const [officialGa4IdInput, setOfficialGa4IdInput] = useState("");
  const [ga4Data, setGa4Data] = useState<any[] | null>(null);
  const [ga4Loading, setGa4Loading] = useState(false);
  const [ga4Error, setGa4Error] = useState("");
  const [ga4TimeUnit, setGa4TimeUnit] = useState<"date" | "week" | "month">("date");

  const [topSources, setTopSources] = useState<any[] | null>(null);
  const [officialDemo, setOfficialDemo] = useState<{ gender: any[]; age: any[] } | null>(null);

  const fetchGA4 = useCallback(async () => {
    if (!dateStr.start) return;
    setGa4Loading(true); setGa4Error("");
    try {
      const res = await fetch("/api/ga4-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startDate: dateStr.start, endDate: dateStr.end, timeUnit: ga4TimeUnit, propertyId: officialGa4Id || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "GA4 API 오류");
      setGa4Data(data.rows ?? []);
    } catch (e: any) { setGa4Error(e.message); }
    finally { setGa4Loading(false); }
  }, [dateStr.start, dateStr.end, ga4TimeUnit, officialGa4Id]);

  const fetchGA4Tops = useCallback(async () => {
    if (!dateStr.start) return;
    const pid = officialGa4Id || undefined;
    try {
      const rs = await fetch("/api/ga4-report", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startDate: dateStr.start, endDate: dateStr.end, propertyId: pid,
          dimensions: [{ name: "sessionSource" }, { name: "sessionMedium" }],
          metrics: [{ name: "sessions" }, { name: "activeUsers" }, { name: "averageSessionDuration" }] }) });
      if (rs.ok) setTopSources(((await rs.json()).rows ?? []).slice(0, 7));
    } catch (e) { console.error(e); }
  }, [dateStr.start, dateStr.end, officialGa4Id]);

  const fetchOfficialDemo = useCallback(async () => {
    if (!dateStr.start) return;
    const pid = officialGa4Id || undefined;
    try {
      const [rg, ra] = await Promise.all([
        fetch("/api/ga4-report", { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ startDate: dateStr.start, endDate: dateStr.end, propertyId: pid,
            dimensions: [{ name: "userGender" }], metrics: [{ name: "activeUsers" }] }) }),
        fetch("/api/ga4-report", { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ startDate: dateStr.start, endDate: dateStr.end, propertyId: pid,
            dimensions: [{ name: "userAgeBracket" }], metrics: [{ name: "activeUsers" }] }) }),
      ]);
      const gender = rg.ok ? ((await rg.json()).rows ?? []).filter((r: any) => r.userGender !== "(not set)") : [];
      const age    = ra.ok ? ((await ra.json()).rows ?? []).filter((r: any) => r.userAgeBracket !== "(not set)") : [];
      setOfficialDemo({ gender, age });
    } catch (e) { console.error(e); }
  }, [dateStr.start, dateStr.end, officialGa4Id]);

  // ─── 마이크로사이트 GA4 ──────────────────────────────────────────────────────
  const [microGa4Id, setMicroGa4Id] = useState("");
  const [microGa4IdInput, setMicroGa4IdInput] = useState("");
  const [microGa4Data, setMicroGa4Data] = useState<any[] | null>(null);
  const [microGa4Loading, setMicroGa4Loading] = useState(false);
  const [microGa4Error, setMicroGa4Error] = useState("");
  const [microGa4TimeUnit, setMicroGa4TimeUnit] = useState<"date" | "week" | "month">("date");

  const [microTopSources, setMicroTopSources] = useState<any[] | null>(null);
  const [microDemo, setMicroDemo] = useState<{ gender: any[]; age: any[] } | null>(null);

  const fetchMicroGA4 = useCallback(async () => {
    if (!dateStr.start || !microGa4Id) return;
    setMicroGa4Loading(true); setMicroGa4Error("");
    try {
      const res = await fetch("/api/ga4-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startDate: dateStr.start, endDate: dateStr.end, timeUnit: microGa4TimeUnit, propertyId: microGa4Id.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "마이크로사이트 GA4 오류");
      setMicroGa4Data(data.rows ?? []);
    } catch (e: any) { setMicroGa4Error(e.message); setMicroGa4Data(null); }
    finally { setMicroGa4Loading(false); }
  }, [dateStr.start, dateStr.end, microGa4TimeUnit, microGa4Id]);

  const fetchMicroGA4Tops = useCallback(async () => {
    if (!dateStr.start || !microGa4Id) return;
    const pid = microGa4Id.trim();
    try {
      const rs = await fetch("/api/ga4-report", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startDate: dateStr.start, endDate: dateStr.end, propertyId: pid,
          dimensions: [{ name: "sessionSource" }, { name: "sessionMedium" }],
          metrics: [{ name: "sessions" }, { name: "activeUsers" }, { name: "averageSessionDuration" }] }) });
      if (rs.ok) setMicroTopSources(((await rs.json()).rows ?? []).slice(0, 7));
    } catch (e) { console.error(e); }
  }, [dateStr.start, dateStr.end, microGa4Id]);

  const fetchMicroDemo = useCallback(async () => {
    if (!dateStr.start || !microGa4Id) return;
    const pid = microGa4Id.trim();
    try {
      const [rg, ra] = await Promise.all([
        fetch("/api/ga4-report", { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ startDate: dateStr.start, endDate: dateStr.end, propertyId: pid,
            dimensions: [{ name: "userGender" }], metrics: [{ name: "activeUsers" }] }) }),
        fetch("/api/ga4-report", { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ startDate: dateStr.start, endDate: dateStr.end, propertyId: pid,
            dimensions: [{ name: "userAgeBracket" }], metrics: [{ name: "activeUsers" }] }) }),
      ]);
      const gender = rg.ok ? ((await rg.json()).rows ?? []).filter((r: any) => r.userGender !== "(not set)") : [];
      const age    = ra.ok ? ((await ra.json()).rows ?? []).filter((r: any) => r.userAgeBracket !== "(not set)") : [];
      setMicroDemo({ gender, age });
    } catch (e) { console.error(e); }
  }, [dateStr.start, dateStr.end, microGa4Id]);

  // ─── 네이버 키워드 트렌드 ───────────────────────────────────────────────────
  const [keywordGroups, setKeywordGroups] = useState<{ groupName: string; keywords: string[] }[]>([
    { groupName: "퍼시스", keywords: ["퍼시스", "FURSYS"] },
  ]);
  const [newGroupName, setNewGroupName]       = useState("");
  const [newGroupKeywords, setNewGroupKeywords] = useState("");
  const [keywordSaved, setKeywordSaved]       = useState(false);
  const [showKeywordForm, setShowKeywordForm] = useState(false);
  const [trendData, setTrendData] = useState<any | null>(null);
  const [loadingTrend, setLoadingTrend] = useState(false);
  const [trendError, setTrendError] = useState("");
  const [timeUnit, setTimeUnit] = useState<"date" | "week" | "month">("date");
  const [selectedKeyword, setSelectedKeyword] = useState<string | null>(null);

  const fetchTrend = useCallback(async () => {
    if (!dateStr.start || keywordGroups.length === 0) return;
    setLoadingTrend(true); setTrendError("");
    try {
      const res = await fetch("/api/naver-keyword-trend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startDate: dateStr.start, endDate: dateStr.end, timeUnit, keywordGroups }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "네이버 API 오류");
      setTrendData(data);
    } catch (e: any) { setTrendError(e.message); }
    finally { setLoadingTrend(false); }
  }, [dateStr.start, dateStr.end, timeUnit, keywordGroups]);

  // ─── Convex + localStorage 복원 ─────────────────────────────────────────────
  useEffect(() => {
    if (campaignData === undefined) return; // 아직 로딩 중

    // GA4 ID: Convex 우선, 없으면 localStorage fallback
    const convexMicro    = campaignData?.microGa4Id ?? "";
    const convexOfficial = campaignData?.officialGa4Id ?? "";
    const savedMicro     = localStorage.getItem(`microGa4Id_${campaignId}`) ?? "";
    const savedOfficial  = localStorage.getItem(`officialGa4Id_${campaignId}`) ?? "";

    const microId    = convexMicro    || savedMicro;
    const officialId = convexOfficial || savedOfficial;

    if (microId)    { setMicroGa4Id(microId);       setMicroGa4IdInput(microId); }
    if (officialId) { setOfficialGa4Id(officialId); setOfficialGa4IdInput(officialId); }

    const savedOrder    = localStorage.getItem(`sectionOrder_${campaignId}`);
    // 키워드: Convex 우선 → localStorage fallback
    const convexKeywords = campaignData?.naverKeywordGroups;
    const savedKeywords  = convexKeywords || localStorage.getItem(`naverKeywords_${campaignId}`);
    if (savedOrder)    { try { setSectionOrder(JSON.parse(savedOrder)); } catch {} }
    if (savedKeywords) { try { setKeywordGroups(JSON.parse(savedKeywords)); } catch {} }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaignData, campaignId]);

  useEffect(() => { if (microGa4Id) localStorage.setItem(`microGa4Id_${campaignId}`, microGa4Id); }, [microGa4Id, campaignId]);

  const saveKeywords = async () => {
    try {
      const json = JSON.stringify(keywordGroups);
      // Convex + localStorage 동시 저장 → 뷰어/다기기 공유
      await updateCampaignLinks({ id: campaignId, naverKeywordGroups: json });
      localStorage.setItem(`naverKeywords_${campaignId}`, json);
      setKeywordSaved(true);
      setTimeout(() => setKeywordSaved(false), 2000);
    } catch {}
  };

  // ─── 자동 페칭 ──────────────────────────────────────────────────────────────
  useEffect(() => { fetchGA4(); }, [fetchGA4]);
  useEffect(() => { fetchGA4Tops(); }, [fetchGA4Tops]);
  useEffect(() => { fetchOfficialDemo(); }, [fetchOfficialDemo]);
  useEffect(() => { fetchTrend(); }, [fetchTrend]);
  useEffect(() => { if (microGa4Id) fetchMicroGA4(); }, [fetchMicroGA4, microGa4Id]);
  useEffect(() => { if (microGa4Id) fetchMicroGA4Tops(); }, [fetchMicroGA4Tops, microGa4Id]);
  useEffect(() => { if (microGa4Id) fetchMicroDemo(); }, [fetchMicroDemo, microGa4Id]);

  useEffect(() => {
    if (refreshTrigger !== lastRefresh) {
      setLastRefresh(refreshTrigger);
      // 모든 GA4 데이터 재호출
      fetchGA4();
      fetchGA4Tops();
      fetchOfficialDemo();
      fetchTrend();
      if (microGa4Id) {
        fetchMicroGA4();
        fetchMicroGA4Tops();
        fetchMicroDemo();
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshTrigger, lastRefresh]);

  // ─── GA4 rows → 주차별 집계 → Convex trafficWeekly 동기화 헬퍼 ──────────────
  const aggregateAndSync = useCallback(async (dailyRows: any[]) => {
    if (!dailyRows.length) return;
    const weekMap = new Map<string, { sessions: number; users: number; engSec: number; count: number }>();
    for (const r of dailyRows) {
      const dateStr8: string = r.date || "";
      if (dateStr8.length !== 8) continue;
      const y = parseInt(dateStr8.slice(0, 4));
      const m = parseInt(dateStr8.slice(4, 6)) - 1;
      const d = parseInt(dateStr8.slice(6, 8));
      const dt = new Date(y, m, d);
      const dow = (dt.getDay() + 6) % 7;
      const mon = new Date(dt);
      mon.setDate(dt.getDate() - dow);
      const wk = `${mon.getFullYear()}${String(mon.getMonth() + 1).padStart(2, "0")}${String(mon.getDate()).padStart(2, "0")}`;
      const ex = weekMap.get(wk) ?? { sessions: 0, users: 0, engSec: 0, count: 0 };
      ex.sessions += r.sessions || 0;
      ex.users    += r.activeUsers || 0;
      ex.engSec   += r.averageSessionDuration || 0;
      ex.count    += 1;
      weekMap.set(wk, ex);
    }
    const rows = Array.from(weekMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([wk, v]) => ({
        weekLabel: `${wk.slice(4, 6)}/${wk.slice(6, 8)}`,
        weekStart: `${wk.slice(0, 4)}-${wk.slice(4, 6)}-${wk.slice(6, 8)}`,
        sessions: Math.round(v.sessions),
        users: Math.round(v.users),
        avgEngagementSec: v.count > 0 ? Math.round(v.engSec / v.count) : 0,
      }));
    if (rows.length > 0) {
      try {
        await syncTrafficWeekly({ campaignId, rows });
      } catch (e) { console.error("[GA4 Sync] Convex 저장 실패:", e); }
    }
  }, [campaignId, syncTrafficWeekly]);

  // ① 차트 데이터가 로드될 때 즉시 동기화 (일별 단위일 때 직접, 그 외에는 재취득)
  useEffect(() => {
    if (!microGa4Id) return;

    if (microGa4TimeUnit === "date" && microGa4Data && microGa4Data.length > 0) {
      // 일별 차트 데이터를 그대로 사용 → 추가 fetch 없이 바로 sync
      aggregateAndSync(microGa4Data);
    } else if (microGa4TimeUnit !== "date" && microGa4Data && microGa4Data.length > 0 && dateStr.start) {
      // 주·월 단위로 표시 중 → 동일 기간의 일별 데이터를 별도 취득
      fetch("/api/ga4-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startDate: dateStr.start, endDate: dateStr.end, timeUnit: "date", propertyId: microGa4Id }),
      })
        .then(r => r.json())
        .then(data => { if (data.rows?.length) aggregateAndSync(data.rows); })
        .catch(e => console.error("[GA4 Sync] 일별 재취득 실패:", e));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [microGa4Data, microGa4TimeUnit]);

  // ② 페이지 최초 진입 시 캠페인 전체 기간 동기화 (차트 범위 이전 주차까지 보완)
  useEffect(() => {
    if (!microGa4Id || !campaignData?.startDate) return;
    const today = new Date().toISOString().split("T")[0];
    const end   = campaignData.endDate && campaignData.endDate < today ? campaignData.endDate : today;
    fetch("/api/ga4-report", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ startDate: campaignData.startDate, endDate: end, timeUnit: "date", propertyId: microGa4Id }),
    })
      .then(r => r.json())
      .then(data => { if (data.rows?.length) aggregateAndSync(data.rows); })
      .catch(e => console.error("[GA4 Sync] 전체기간 취득 실패:", e));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [microGa4Id, campaignData?.startDate]);

  // ─── 차트 데이터 변환 ───────────────────────────────────────────────────────
  const naverChartData = useMemo(() => {
    if (!trendData?.results?.length) return [];
    const allDates = trendData.results[0].data.map((d: any) => d.period);
    return allDates.map((date: string, i: number) => {
      const row: any = { date: date.slice(5) };
      for (const g of trendData.results) row[g.title] = g.data[i]?.ratio ?? 0;
      return row;
    });
  }, [trendData]);

  const formatGA4Rows = (rows: any[] | null, unit: "date"|"week"|"month") => {
    if (!rows) return [];
    return rows.map(r => {
      let label = r.date || r.isoYearIsoWeek || r.yearMonth || "";
      if (unit === "date"  && label.length === 8) label = label.slice(4).replace(/(\d{2})(\d{2})/, "$1/$2");
      if (unit === "week"  && label.length === 6) label = `W${label.slice(4)}`;
      if (unit === "month" && label.length === 6) label = label.replace(/(\d{4})(\d{2})/, "$1/$2");
      return { ...r, label, "세션": r.sessions, "유저": r.activeUsers };
    });
  };
  const formattedGa4Data    = useMemo(() => formatGA4Rows(ga4Data, ga4TimeUnit),       [ga4Data, ga4TimeUnit]);
  const formattedMicroGa4Data = useMemo(() => formatGA4Rows(microGa4Data, microGa4TimeUnit), [microGa4Data, microGa4TimeUnit]);

  // ─── 섹션 헤더 렌더 ─────────────────────────────────────────────────────────
  const renderSectionHeader = (type: "official" | "micro") => {
    if (type === "official") return (
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <h3 className="text-lg font-bold text-gray-900">공식몰 유입 성과 (GA4)</h3>
          {isAdmin && (
            <div className="flex items-center gap-2 bg-gray-50 border border-gray-100 rounded-xl px-3 h-[32px] focus-within:border-gray-300 transition-all">
              <input className="bg-transparent border-none text-[11px] text-gray-900 outline-none w-48 placeholder:text-gray-400"
                placeholder="GA4 Property ID (엔터 적용)" value={officialGa4IdInput}
                onChange={e => setOfficialGa4IdInput(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") { const v = officialGa4IdInput.trim(); setOfficialGa4Id(v); localStorage.setItem(`officialGa4Id_${campaignId}`, v); updateGa4Ids({ id: campaignId, officialGa4Id: v }).catch(console.error); } }} />
            </div>
          )}
          <div className="flex rounded-lg border border-gray-100 overflow-hidden bg-gray-50 p-1">
            {(["date","week","month"] as const).map(u => (
              <button key={u} onClick={() => setGa4TimeUnit(u)}
                className={cn("px-3 py-1 text-[10px] rounded-md transition-all", ga4TimeUnit === u ? "bg-white text-black font-semibold shadow-lg" : "text-gray-400 hover:text-gray-900")}>
                {u === "date" ? "일" : u === "week" ? "주" : "월"}
              </button>
            ))}
          </div>
        </div>
      </div>
    );

    return (
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <h3 className="text-lg font-bold text-gray-900">마이크로사이트 유입 성과 (GA4)</h3>
          {isAdmin && (
            <div className="flex items-center gap-2 bg-gray-50 border border-gray-100 rounded-xl px-3 h-[32px] focus-within:border-gray-300 transition-all">
              <input className="bg-transparent border-none text-[11px] text-gray-900 outline-none w-48 placeholder:text-gray-400"
                placeholder="GA4 Property ID (엔터 적용)" value={microGa4IdInput}
                onChange={e => setMicroGa4IdInput(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") { const v = microGa4IdInput.trim(); setMicroGa4Id(v); localStorage.setItem(`microGa4Id_${campaignId}`, v); updateGa4Ids({ id: campaignId, microGa4Id: v }).catch(console.error); } }} />
            </div>
          )}
          <div className="flex rounded-lg border border-gray-100 overflow-hidden bg-gray-50 p-1">
            {(["date","week","month"] as const).map(u => (
              <button key={u} onClick={() => setMicroGa4TimeUnit(u)}
                className={cn("px-3 py-1 text-[10px] rounded-md transition-all", microGa4TimeUnit === u ? "bg-white text-black font-semibold shadow-lg" : "text-gray-400 hover:text-gray-900")}>
                {u === "date" ? "일" : u === "week" ? "주" : "월"}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2 text-gray-400 text-xs">
          {microGa4Loading ? <><RefreshCw className="w-3 h-3 animate-spin" />업데이트 중...</> : microGa4Data ? <><Check className="w-3 h-3 text-green-400" />데이터 최신화됨</> : null}
        </div>
      </div>
    );
  };

  // ─── GA4 메인 차트 + KPI 카드 ────────────────────────────────────────────────
  const renderMainChart = (
    data: any[] | null,
    loading: boolean,
    formatted: any[],
    colors: { line1: string; line2: string; accent: string },
    label: string,
  ) => (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
      <div className="lg:col-span-1 flex flex-col gap-4">
        {[
          { title: `${label} 총 세션`, key: "sessions", color: "text-gray-900" },
          { title: `${label} 총 사용자`, key: "activeUsers", color: "text-gray-900" },
        ].map(({ title, key, color }) => (
          <GlassCard key={key} className="p-6 flex-1 flex flex-col justify-center">
            <p className="text-xs text-gray-400 mb-1 font-medium">{title}</p>
            <p className={`text-3xl font-bold font-mono tracking-tight ${color}`}>
              {loading ? <span className="text-gray-300 animate-pulse">—</span>
                : (data ?? []).reduce((s, r) => s + (r[key] || 0), 0).toLocaleString()}
            </p>
          </GlassCard>
        ))}
        <GlassCard className="p-6 flex-1 flex flex-col justify-center">
          <p className="text-xs text-gray-400 mb-1 font-medium">{label} 평균 참여시간</p>
          <p className={`text-3xl font-bold font-mono tracking-tight ${colors.accent}`}>
            {loading ? <span className="text-gray-300 animate-pulse">—</span>
              : data?.length
                ? (() => {
                    const avg = data.reduce((s, r) => s + (r.averageSessionDuration || 0), 0) / data.length;
                    return `${Math.floor(avg / 60)}m ${Math.round(avg % 60)}s`;
                  })()
                : "—"}
          </p>
        </GlassCard>
      </div>
      <GlassCard className="lg:col-span-3 p-6 h-[360px]">
        {loading ? (
          <div className="flex items-center justify-center h-full text-gray-300 text-sm">
            <RefreshCw className="w-5 h-5 animate-spin mr-2" /> 데이터 로딩 중...
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={formatted} margin={{ top: 10, right: 30, left: 10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.05)" vertical={false} />
              <XAxis dataKey="label" stroke="rgba(0,0,0,0.4)" tickLine={false} axisLine={false} tick={{ fontSize: 10 }}
                interval={Math.max(0, Math.floor((formatted.length) / 12) - 1)} />
              <YAxis stroke="rgba(0,0,0,0.4)" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
              <Tooltip contentStyle={{ backgroundColor: "#fff", border: "1px solid rgba(0,0,0,0.1)", borderRadius: "12px", fontSize: "12px", color: "#333" }} />
              <Legend wrapperStyle={{ paddingTop: "20px", fontSize: "12px" }} />
              <Line type="monotone" dataKey="세션" stroke={colors.line1} strokeWidth={3} dot={{ r: 3, fill: colors.line1 }} activeDot={{ r: 6 }} />
              <Line type="monotone" dataKey="유저" stroke={colors.line2} strokeWidth={2} dot={{ r: 3, fill: colors.line2 }} activeDot={{ r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </GlassCard>
    </div>
  );

  // ─── 섹션 본문 렌더 ─────────────────────────────────────────────────────────
  const renderSectionBody = (type: "official" | "micro") => {
    if (type === "official") {
      if (ga4Error) return <GA4PermissionError error={ga4Error} onRetry={fetchGA4} copiedEmail={copiedEmail} onCopy={copyEmail} />;
      return (
        <>
          {renderMainChart(ga4Data, ga4Loading, formattedGa4Data, { line1: "#333333", line2: "#818cf8", accent: "text-indigo-400" }, "공식몰")}
          <div className="mt-6 grid grid-cols-1 xl:grid-cols-[1fr_300px] gap-5 items-stretch">
            <TopSourcesTable sources={topSources} />
            <DemoSection gender={officialDemo?.gender ?? []} age={officialDemo?.age ?? []} compact />
          </div>
        </>
      );
    }

    if (!microGa4Id) return (
      <GlassCard className="p-10 text-center border-gray-200 bg-gray-50">
        <p className="text-gray-500 text-sm">마이크로사이트의 GA4 Property ID를 상단에 입력해주세요.</p>
      </GlassCard>
    );

    if (microGa4Loading && !microGa4Data) return (
      <GlassCard className="p-10 text-center bg-gray-50">
        <RefreshCw className="w-6 h-6 animate-spin text-gray-400 mx-auto mb-3" />
        <p className="text-gray-400 text-sm">GA4 데이터를 불러오는 중...</p>
      </GlassCard>
    );

    if (microGa4Error) return <GA4PermissionError error={microGa4Error} onRetry={fetchMicroGA4} copiedEmail={copiedEmail} onCopy={copyEmail} />;

    if (microGa4Data && microGa4Data.length === 0) return (
      <GlassCard className="p-10 text-center bg-gray-50">
        <p className="text-gray-400 text-sm">선택한 기간에 데이터가 없습니다.</p>
        <p className="text-gray-300 text-xs mt-1">날짜 범위를 변경하거나 Property ID를 확인해주세요.</p>
      </GlassCard>
    );

    return (
      <>
        {renderMainChart(microGa4Data, microGa4Loading, formattedMicroGa4Data, { line1: "#333333", line2: "#f472b6", accent: "text-pink-500" }, "마이크로사이트")}
        <div className="mt-6 grid grid-cols-1 xl:grid-cols-[1fr_300px] gap-5 items-stretch">
          <TopSourcesTable sources={microTopSources} />
          <DemoSection gender={microDemo?.gender ?? []} age={microDemo?.age ?? []} compact />
        </div>
      </>
    );
  };

  return (
    <div className="flex flex-col gap-10 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20">

      {/* 상단 고정 필터 바 */}
      <div className="sticky top-0 z-30 -mx-4 px-4 py-4 bg-white/90 backdrop-blur-xl border-b border-white/5 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            유입 상세 리포트
            <span className="text-[10px] bg-gray-100 px-2 py-0.5 rounded text-gray-500 font-normal uppercase">Real-Time Sync</span>
          </h2>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-gray-400 text-xs mr-2">
            {ga4Loading || loadingTrend || microGa4Loading
              ? <><RefreshCw className="w-3 h-3 animate-spin" />업데이트 중...</>
              : <><Check className="w-3 h-3 text-green-400" />데이터 최신화됨</>}
          </div>
          <DatePickerWithRange date={dateRange} setDate={setDateRange} />
        </div>
      </div>

      {/* 탭 네비게이션 */}
      <div className="flex gap-4 border-b border-gray-200 -mt-4 mb-2">
        {[
          { key: "ga4", label: "GA4 유입 성과", color: "border-gray-900 text-gray-900" },
          { key: "naver", label: "네이버 브랜드 검색", color: "border-blue-600 text-blue-600" },
        ].map(t => (
          <button key={t.key} onClick={() => setActiveTab(t.key as any)}
            className={cn("px-4 py-3 text-sm font-bold border-b-2 transition-all",
              activeTab === t.key ? t.color : "border-transparent text-gray-400 hover:text-gray-600")}>
            {t.label}
          </button>
        ))}
      </div>

      {/* GA4 탭 */}
      {activeTab === "ga4" && (
        <div className="flex flex-col gap-14">
          <p className="text-xs text-gray-400 -mt-6 flex items-center gap-1">
            <GripVertical className="w-3 h-3" />섹션 헤더를 드래그해서 순서를 변경할 수 있습니다.
          </p>
          {sectionOrder.map(s => (
            <div key={s} draggable
              onDragStart={e => handleDragStart(e, s)} onDragOver={e => handleDragOver(e, s)}
              onDrop={e => handleDrop(e, s)} onDragEnd={handleDragEnd}
              className={cn("transition-all duration-200 rounded-2xl",
                draggedSection === s && "opacity-40 scale-[0.99]",
                dragOverSection === s && draggedSection !== s && "ring-2 ring-indigo-400 ring-offset-2 bg-indigo-50/30")}>
              <div className="flex items-center gap-2">
                <div className="cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500 p-1 -ml-1 rounded-lg hover:bg-gray-100 flex-shrink-0">
                  <GripVertical className="w-5 h-5" />
                </div>
                <div className="flex-1">{renderSectionHeader(s)}</div>
              </div>
              {renderSectionBody(s)}
            </div>
          ))}
        </div>
      )}

      {/* 네이버 탭 */}
      {activeTab === "naver" && (
        <section>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-4">
              <h3 className="text-lg font-bold text-gray-900">네이버 브랜드 검색 트렌드</h3>
              <div className="flex rounded-lg border border-gray-100 overflow-hidden bg-gray-50 p-1">
                {(["date","week","month"] as const).map(u => (
                  <button key={u} onClick={() => setTimeUnit(u)}
                    className={cn("px-3 py-1 text-[10px] rounded-md transition-all", timeUnit === u ? "bg-white text-black font-semibold shadow-lg" : "text-gray-400 hover:text-gray-900")}>
                    {u === "date" ? "일" : u === "week" ? "주" : "월"}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {keywordSaved && (
                <span className="flex items-center gap-1 text-[10px] text-green-500 font-medium">
                  <Check className="w-3 h-3" /> 저장됨
                </span>
              )}
              <button
                onClick={saveKeywords}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium border transition-all bg-gray-900 text-white border-gray-900 hover:bg-gray-700">
                저장
              </button>
              <button
                onClick={() => setShowKeywordForm(p => !p)}
                className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium border transition-all",
                  showKeywordForm ? "bg-gray-900 text-white border-gray-900" : "bg-gray-50 text-gray-700 border-gray-200 hover:border-gray-400")}>
                <Search className="w-3 h-3" />
                키워드 관리
              </button>
            </div>
          </div>

          {/* 키워드 그룹 추가 패널 */}
          {showKeywordForm && (
            <GlassCard className="p-4 mb-4">
              <p className="text-xs font-semibold text-gray-600 mb-3">키워드 그룹 추가</p>
              <div className="flex items-center gap-2">
                <div className="flex flex-col gap-1 flex-1">
                  <input
                    value={newGroupName}
                    onChange={e => setNewGroupName(e.target.value)}
                    className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5 text-xs text-gray-900 outline-none focus:border-gray-400 transition-all placeholder:text-gray-400"
                    placeholder="그룹명 (예: 브랜드명)"
                  />
                </div>
                <div className="flex flex-col gap-1 flex-[2]">
                  <input
                    value={newGroupKeywords}
                    onChange={e => setNewGroupKeywords(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === "Enter") {
                        const kws = newGroupKeywords.split(",").map(k => k.trim()).filter(Boolean);
                        if (kws.length > 0) {
                          setKeywordGroups(prev => [...prev, { groupName: newGroupName || kws[0], keywords: kws }]);
                          setNewGroupName("");
                          setNewGroupKeywords("");
                        }
                      }
                    }}
                    className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5 text-xs text-gray-900 outline-none focus:border-gray-400 transition-all placeholder:text-gray-400"
                    placeholder="키워드 입력 (쉼표 구분, 예: 퍼시스,FURSYS)"
                  />
                </div>
                <button
                  onClick={() => {
                    const kws = newGroupKeywords.split(",").map(k => k.trim()).filter(Boolean);
                    if (kws.length > 0) {
                      setKeywordGroups(prev => [...prev, { groupName: newGroupName || kws[0], keywords: kws }]);
                      setNewGroupName("");
                      setNewGroupKeywords("");
                    }
                  }}
                  className="px-4 py-1.5 bg-gray-900 text-white text-[11px] font-medium rounded-lg hover:bg-gray-700 transition-all whitespace-nowrap">
                  + 추가 및 저장
                </button>
              </div>
              <p className="text-[10px] text-gray-400 mt-2">Enter 키 또는 버튼으로 추가 후, '저장' 버튼을 눌러 저장하세요.</p>
            </GlassCard>
          )}

          {trendError ? (
            <GlassCard className="p-10 text-center border-red-500/20 bg-red-500/5">
              <p className="text-red-400 text-sm">⚠️ {trendError}</p>
            </GlassCard>
          ) : (
            <div className="space-y-6">
              <div className="flex flex-wrap gap-2">
                {keywordGroups.map((g, i) => {
                  const color   = LINE_COLORS[i % LINE_COLORS.length];
                  const isSelected = selectedKeyword === g.groupName;
                  const isDimmed   = selectedKeyword !== null && !isSelected;
                  return (
                    <div
                      key={i}
                      onClick={() => setSelectedKeyword(isSelected ? null : g.groupName)}
                      className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-[11px] cursor-pointer transition-all select-none
                        ${isSelected
                          ? "border-2 bg-white shadow-sm"
                          : isDimmed
                            ? "border border-gray-100 bg-gray-50 opacity-40"
                            : "border border-gray-100 bg-gray-50 hover:bg-gray-100"
                        }`}
                      style={{ borderLeft: `3px solid ${color}`, borderColor: isSelected ? color : undefined }}
                    >
                      <span className={`font-medium ${isSelected ? "text-gray-900" : "text-gray-700"}`}>{g.groupName}</span>
                      <span className="text-gray-400">{g.keywords.join(", ")}</span>
                      <button
                        onClick={(e) => { e.stopPropagation(); setKeywordGroups(prev => prev.filter((_, idx) => idx !== i)); if (selectedKeyword === g.groupName) setSelectedKeyword(null); }}
                        className="text-gray-300 hover:text-red-400 ml-1"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  );
                })}
                {selectedKeyword && (
                  <button onClick={() => setSelectedKeyword(null)} className="text-[11px] text-gray-400 hover:text-gray-700 px-2 underline">
                    전체 보기
                  </button>
                )}
              </div>
              <GlassCard className="p-6 h-[420px]">
                {naverChartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={naverChartData} margin={{ top: 10, right: 30, left: 10, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.05)" vertical={false} />
                      <XAxis dataKey="date" stroke="rgba(0,0,0,0.4)" tickLine={false} axisLine={false} tick={{ fontSize: 10 }} />
                      <YAxis stroke="rgba(0,0,0,0.4)" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} unit="%" />
                      <Tooltip contentStyle={{ backgroundColor: "#fff", border: "1px solid rgba(0,0,0,0.1)", borderRadius: "12px", fontSize: "12px", color: "#333" }} />
                      <Legend wrapperStyle={{ paddingTop: "20px", fontSize: "12px" }} />
                      {trendData?.results?.map((g: any, i: number) => {
                        // selectedKeyword가 있으면 해당 그룹만 표시
                        if (selectedKeyword && g.title !== selectedKeyword) return null;
                        return (
                          <Line key={g.title} type="monotone" dataKey={g.title}
                            stroke={LINE_COLORS[i % LINE_COLORS.length]}
                            strokeWidth={selectedKeyword ? 3 : 2.5}
                            dot={{ r: selectedKeyword ? 3 : 2, fill: LINE_COLORS[i % LINE_COLORS.length] }}
                            activeDot={{ r: 5 }} />
                        );
                      })}
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-full text-gray-900/20 text-sm">추가된 키워드 그룹이 없습니다.</div>
                )}
              </GlassCard>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
