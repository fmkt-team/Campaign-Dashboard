"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import { useRefresh } from "@/lib/refresh-context";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { GlassCard } from "@/components/glass-card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import {
  Check, X, Settings2, Link2, RefreshCw, Users, CalendarDays, BarChart3, Ticket,
  TrendingUp, MessageSquare, MapPin, PieChart, List, Smile, Frown, MessageCircle,
  Star, Quote, ArrowUpRight, Crown, Edit2, ExternalLink
} from "lucide-react";
import {
  BarChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Legend, ComposedChart, Cell, PieChart as RechartsPieChart, Pie
} from "recharts";
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
  const num = parseFloat(val.replace(/[^0-9.-]+/g, ""));
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
  { text: "분위기", weight: 55 },
  { text: "대기 시간", weight: 25 },
];

const MOCK_RAW_RESPONSES = [
  { date: "2026-05-01", text: "다양한 체험 프로그램이 많았으면 좋겠습니다. 특히 사진 찍을 곳이 많길 바라요." },
  { date: "2026-05-02", text: "사은품 퀄리티가 기대됩니다! 지난번 행사 때 너무 좋았거든요." },
  { date: "2026-05-02", text: "아이들과 함께 가기 좋은 편안한 분위기면 좋겠습니다." },
  { date: "2026-05-03", text: "주차 공간 안내가 미리 잘 되어있으면 좋겠어요." },
  { date: "2026-05-04", text: "예쁜 포토존 많이 만들어주세요~" },
];

const MOCK_POPUP_RESERVATIONS = [
  { date: "04/28", count: 80, vipCount: 15, cumulative: 80 },
  { date: "04/29", count: 120, vipCount: 22, cumulative: 200 },
  { date: "04/30", count: 200, vipCount: 40, cumulative: 400 },
  { date: "05/01", count: 150, vipCount: 28, cumulative: 550 },
  { date: "05/02", count: 90, vipCount: 18, cumulative: 640 },
];

const MOCK_POPUP_VISITORS = [
  { date: "05/01", scheduled: 120, vipScheduled: 20, actual: 100, vipActual: 18, rate: "83.3%" },
  { date: "05/02", scheduled: 150, vipScheduled: 25, actual: 140, vipActual: 23, rate: "93.3%" },
  { date: "05/03", scheduled: 200, vipScheduled: 40, actual: 190, vipActual: 38, rate: "95.0%" },
  { date: "05/04", scheduled: 180, vipScheduled: 35, actual: 160, vipActual: 30, rate: "88.9%" },
  { date: "05/05", scheduled: 220, vipScheduled: 45, actual: 210, vipActual: 43, rate: "95.5%" },
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

// ─── 인라인 편집 가능한 텍스트 컴포넌트 ────────────────────────────────
function EditableText({
  value, onChange, className, placeholder, dark = false, editMode = false
}: {
  value: string;
  onChange: (v: string) => void;
  className?: string;
  placeholder?: string;
  dark?: boolean;
  editMode?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (editing) inputRef.current?.focus(); }, [editing]);
  useEffect(() => { setDraft(value); }, [value]);

  const commit = () => { onChange(draft); setEditing(false); };

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => { if (e.key === "Enter") commit(); if (e.key === "Escape") { setDraft(value); setEditing(false); } }}
        className={cn(
          "bg-transparent border-b outline-none w-full",
          dark ? "border-white/30 text-white" : "border-gray-400 text-gray-900",
          className
        )}
        placeholder={placeholder}
      />
    );
  }

  return (
    <span
      className={cn(
        "cursor-pointer group inline-flex items-center gap-1 hover:opacity-80 rounded transition-colors",
        editMode && (dark ? "bg-white/10 px-1" : "bg-blue-50/60 px-1"),
        className
      )}
      onClick={() => setEditing(true)}
    >
      {value || <span className="opacity-40">{placeholder}</span>}
      <Edit2 className={cn(
        "w-3 h-3 shrink-0 transition-opacity",
        editMode ? "opacity-50" : "opacity-0 group-hover:opacity-60",
        dark ? "text-white" : "text-blue-500"
      )} />
    </span>
  );
}

// ─── 키워드 버블 차트 ────────────────────────────────────────────────
function KeywordBubbles({ keywords }: { keywords: { text: string; weight: number }[] }) {
  const max = Math.max(...keywords.map(k => k.weight));
  const colors = ["#e50010", "#ef4444", "#f97316", "#f59e0b", "#8b5cf6", "#6366f1", "#3b82f6"];
  return (
    <div className="flex flex-wrap gap-3 items-end py-3">
      {[...keywords].sort((a, b) => b.weight - a.weight).map((kw, i) => {
        const ratio = kw.weight / max;
        const fontSize = Math.round(11 + ratio * 11);
        const px = Math.round(10 + ratio * 8);
        const py = Math.round(5 + ratio * 5);
        return (
          <div key={i} className="flex flex-col items-center gap-1 transition-transform hover:scale-105">
            <span
              className="rounded-full font-bold text-white shadow-md whitespace-nowrap"
              style={{
                backgroundColor: colors[i % colors.length],
                fontSize: `${fontSize}px`,
                padding: `${py}px ${px}px`,
                opacity: 0.75 + ratio * 0.25,
              }}
            >
              {kw.text}
            </span>
            <span className="text-[10px] font-mono text-gray-400 font-semibold">{kw.weight}%</span>
          </div>
        );
      })}
    </div>
  );
}

// ─── 네이버 리뷰 분석기 ─────────────────────────────────────────────
// ─── 리뷰 감성 분석 헬퍼 ─────────────────────────────────────────────
const POS_WORDS = ["좋아", "좋았", "예쁘", "친절", "최고", "대박", "추천", "만족", "훌륭", "깔끔", "편안", "재밌", "즐거", "행복", "완벽", "굿", "좋은", "멋", "감동"];
const NEG_WORDS = ["불편", "별로", "아쉽", "힘들", "어렵", "복잡", "혼잡", "대기", "주차", "비싸", "실망", "나쁘", "최악", "더러", "불친절", "부족", "없어"];

function classifySentiment(text: string): "positive" | "negative" {
  const lower = text.toLowerCase();
  return NEG_WORDS.some(w => lower.includes(w)) ? "negative" : "positive";
}

function extractKwFromText(text: string): string[] {
  const words: string[] = [];
  const m = text.match(/[가-힣]{2,6}/g) || [];
  words.push(...m.filter(w => w.length >= 2 && w.length <= 7));
  return [...new Set(words)].slice(0, 5);
}

function buildAnalysis(rawReviews: { text: string; date: string; rating: number; keywords: string[] }[]) {
  const reviews = rawReviews.map(r => ({
    ...r,
    sentiment: r.text.trim() ? (classifySentiment(r.text) as "positive" | "negative") : ("positive" as "positive" | "negative"),
    keywords: r.keywords?.length ? r.keywords : extractKwFromText(r.text),
  }));

  const kwMap = new Map<string, { count: number; posCount: number }>();
  reviews.forEach(r => {
    r.keywords.forEach(kw => {
      if (!kw.trim()) return;
      const e = kwMap.get(kw) || { count: 0, posCount: 0 };
      e.count++;
      if (r.sentiment === "positive") e.posCount++;
      kwMap.set(kw, e);
    });
  });

  const keywords = [...kwMap.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 14)
    .map(([text, v]) => ({
      text,
      count: v.count,
      sentiment: (v.posCount / v.count >= 0.5 ? "positive" : "negative") as "positive" | "negative",
    }));

  // 감성 분석은 텍스트가 있는 리뷰만
  const textReviews = reviews.filter(r => r.text.trim());
  const posCount = textReviews.filter(r => r.sentiment === "positive").length;
  return {
    total: reviews.length,
    textTotal: textReviews.length,
    keywords,
    reviews: textReviews,
    posRate: textReviews.length > 0 ? Math.round((posCount / textReviews.length) * 100) : 0,
  };
}

function NaverReviewAnalyzer() {
  const [naverUrl, setNaverUrl] = useState("");
  const [crawling, setCrawling] = useState(false);
  const [crawlError, setCrawlError] = useState("");
  const [pasteText, setPasteText] = useState("");
  const [showPasteArea, setShowPasteArea] = useState(false);
  const [analyzed, setAnalyzed] = useState<null | {
    total: number;
    textTotal?: number;
    keywords: { text: string; count: number; sentiment: "positive" | "negative" }[];
    reviews: { text: string; date: string; rating: number; sentiment: "positive" | "negative"; keywords: string[] }[];
    posRate: number;
    source?: string;
  }>(null);

  // ── 크롤링 ──
  const crawl = async () => {
    if (!naverUrl.trim()) return;
    setCrawling(true);
    setCrawlError("");
    try {
      const res = await fetch("/api/naver-reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: naverUrl.trim() }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        setCrawlError(data.error || "크롤링 실패");
        return;
      }
      const result = buildAnalysis(data.reviews || []);
      setAnalyzed({
        ...result,
        total: data.total || result.total,
        textTotal: data.textTotal ?? result.textTotal,
        source: data.source,
      });
    } catch (e: any) {
      setCrawlError(e.message || "네트워크 오류");
    } finally {
      setCrawling(false);
    }
  };

  // ── 붙여넣기 분석 ──
  const analyzeFromPaste = () => {
    const lines = pasteText.split(/\r?\n/).filter(l => l.trim().length > 5);
    if (lines.length === 0) return;
    const raw = lines.map(line => ({ text: line.trim(), date: "", rating: classifySentiment(line) === "positive" ? 5 : 3, keywords: [] }));
    setAnalyzed({ ...buildAnalysis(raw), source: "paste" });
    setShowPasteArea(false);
  };

  const useDemo = () => setAnalyzed({
    ...buildAnalysis(MOCK_REVIEWS.map(r => ({ text: r.text, date: r.date, rating: r.rating, keywords: r.keywords }))),
    total: MOCK_REVIEW_STATS.total,
    source: "demo",
  });

  const reset = () => { setAnalyzed(null); setCrawlError(""); setPasteText(""); };

  return (
    <GlassCard className="p-6">
      {/* 헤더 */}
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-5 border-b border-gray-100 pb-4 gap-3">
        <div className="flex items-center gap-3">
          <h4 className="text-sm font-bold text-gray-900 flex items-center gap-2">
            <Star className="w-4 h-4 text-gray-900 fill-gray-900" /> 네이버 플레이스 방문자 리뷰 분석
          </h4>
          {analyzed && (
            <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-bold">
              총 {analyzed.total.toLocaleString()}건
              {analyzed.textTotal !== undefined && analyzed.textTotal < analyzed.total && (
                <span className="text-gray-400 font-normal ml-1">(텍스트 {analyzed.textTotal}건)</span>
              )}
            </span>
          )}
          {analyzed?.source === "graphql" && (
            <span className="text-[10px] bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">자동 크롤링</span>
          )}
          {analyzed?.source === "paste" && (
            <span className="text-[10px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">직접 입력</span>
          )}
        </div>
        {analyzed && (
          <div className="flex gap-2">
            <span className="text-xs bg-green-50 text-green-700 px-2 py-1 rounded-md font-medium border border-green-100 flex items-center gap-1">
              <Smile className="w-3 h-3" /> 긍정 {analyzed.posRate}%
            </span>
            <span className="text-xs bg-red-50 text-red-700 px-2 py-1 rounded-md font-medium border border-red-100 flex items-center gap-1">
              <Frown className="w-3 h-3" /> 부정 {100 - analyzed.posRate}%
            </span>
          </div>
        )}
      </div>

      {/* URL 입력 + 크롤링 버튼 */}
      <div className="flex gap-2 mb-3">
        <input
          className="flex-1 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-xs text-gray-900 outline-none focus:border-gray-400 placeholder:text-gray-400"
          placeholder="네이버 지도 URL 붙여넣기 (예: https://map.naver.com/v5/entry/place/12345...)"
          value={naverUrl}
          onChange={e => { setNaverUrl(e.target.value); setCrawlError(""); }}
          onKeyDown={e => e.key === "Enter" && crawl()}
        />
        <Button
          size="sm"
          disabled={!naverUrl.trim() || crawling}
          onClick={crawl}
          className="bg-green-600 text-white hover:bg-green-700 border-0 gap-1.5 px-4 shrink-0"
        >
          {crawling
            ? <><RefreshCw className="w-3 h-3 animate-spin" /> 크롤링 중...</>
            : <><BarChart3 className="w-3 h-3" /> 리뷰 크롤링</>
          }
        </Button>
        {naverUrl && (
          <Button size="sm" variant="outline" className="gap-1 text-xs border-gray-200 text-gray-600 shrink-0"
            onClick={() => window.open(naverUrl, "_blank")}>
            <ExternalLink className="w-3 h-3" />
          </Button>
        )}
      </div>

      {/* 크롤링 에러 */}
      {crawlError && (
        <div className="mb-3 flex items-start gap-2 bg-red-50 border border-red-100 rounded-lg px-3 py-2.5">
          <X className="w-3.5 h-3.5 text-red-500 mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-xs text-red-700">{crawlError}</p>
            <p className="text-[11px] text-red-400 mt-0.5">
              네이버 정책으로 자동 수집이 제한될 수 있습니다.
              <button className="underline ml-1" onClick={() => setShowPasteArea(true)}>직접 붙여넣기</button>를 이용해주세요.
            </p>
          </div>
        </div>
      )}

      {/* 구분선 + 수동 입력 토글 */}
      <div className="flex items-center gap-3 mb-4">
        <div className="flex-1 h-px bg-gray-100" />
        <button
          onClick={() => setShowPasteArea(!showPasteArea)}
          className="text-[11px] text-gray-400 hover:text-gray-600 flex items-center gap-1 shrink-0"
        >
          <MessageCircle className="w-3 h-3" />
          {showPasteArea ? "입력창 닫기" : "리뷰 직접 붙여넣기"}
        </button>
        <div className="flex-1 h-px bg-gray-100" />
      </div>

      {/* 붙여넣기 입력 영역 */}
      {showPasteArea && (
        <div className="mb-4 border border-gray-200 rounded-xl p-4 bg-gray-50">
          <p className="text-xs text-gray-500 mb-2">
            네이버 플레이스 리뷰를 복사하여 붙여넣으세요. 한 줄에 리뷰 하나씩 입력하면 자동으로 분석합니다.
          </p>
          <textarea
            className="w-full h-32 bg-white border border-gray-200 rounded-lg px-3 py-2 text-xs text-gray-900 outline-none focus:border-gray-400 resize-none"
            placeholder={"공간이 너무 예쁘고 직원분들이 친절해요!\n체험할 거리가 많아서 시간 가는 줄 몰랐어요.\n주차하기가 너무 힘들었어요..."}
            value={pasteText}
            onChange={e => setPasteText(e.target.value)}
          />
          <div className="flex gap-2 mt-2 justify-end">
            <Button size="sm" variant="ghost" className="text-xs text-gray-500"
              onClick={() => { setShowPasteArea(false); setPasteText(""); }}>취소</Button>
            <Button size="sm" className="bg-gray-900 text-white hover:bg-gray-800 text-xs gap-1"
              onClick={analyzeFromPaste} disabled={!pasteText.trim()}>
              <BarChart3 className="w-3 h-3" /> 분석하기
            </Button>
          </div>
        </div>
      )}

      {/* 빈 상태 */}
      {!analyzed && !showPasteArea && (
        <div className="flex flex-col items-center justify-center py-10 gap-3">
          <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center">
            <Star className="w-5 h-5 text-gray-400" />
          </div>
          <p className="text-sm text-gray-400 text-center">네이버 지도 URL을 입력하고 크롤링하거나<br />리뷰를 직접 붙여넣어 분석을 시작하세요</p>
          <Button size="sm" variant="ghost" className="text-xs text-gray-400" onClick={useDemo}>
            데모 데이터 보기
          </Button>
        </div>
      )}

      {/* 분석 결과 */}
      {analyzed && (
        <>
          <div className="mb-6">
            <h5 className="text-xs font-bold text-gray-700 mb-3">주요 언급 키워드</h5>
            <div className="flex flex-wrap gap-2">
              {analyzed.keywords.map((kw, i) => (
                <div
                  key={i}
                  className={cn("px-3 py-1.5 rounded-full text-xs font-medium border flex items-center gap-1.5",
                    kw.sentiment === "positive" ? "bg-green-50 text-green-700 border-green-100" : "bg-red-50 text-red-700 border-red-100"
                  )}
                  style={{ fontSize: `${Math.max(10, 10 + Math.min(kw.count, 8))}px` }}
                >
                  #{kw.text} <span className="font-mono bg-white px-1.5 py-0.5 rounded-full opacity-80">{kw.count}</span>
                </div>
              ))}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-3">
              <h5 className="text-xs font-bold text-gray-700">리뷰 목록</h5>
              <button className="text-[10px] text-gray-400 hover:text-gray-600 underline" onClick={reset}>
                다시 분석
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[320px] overflow-y-auto pr-2 custom-scrollbar">
              {analyzed.reviews.map((review, i) => (
                <div key={i} className="bg-white border border-gray-100 hover:border-gray-300 transition-colors shadow-sm rounded-xl p-4 flex flex-col justify-between">
                  <div>
                    <div className="flex justify-between items-start mb-2">
                      <div className="flex gap-0.5">
                        {[...Array(5)].map((_, j) => (
                          <Star key={j} className={cn("w-3.5 h-3.5", j < review.rating ? "text-yellow-400 fill-yellow-400" : "text-gray-200 fill-gray-200")} />
                        ))}
                      </div>
                      {review.date && <span className="text-[10px] font-mono text-gray-400">{review.date}</span>}
                    </div>
                    <p className="text-sm text-gray-800 leading-snug mb-3">{review.text}</p>
                  </div>
                  <div className="flex flex-wrap gap-1.5 mt-auto pt-3 border-t border-gray-50">
                    {review.keywords.map(kw => (
                      <span key={kw} className={cn("text-[10px] px-2 py-0.5 rounded-full font-medium",
                        review.sentiment === "positive" ? "bg-green-50 text-green-600" : "bg-red-50 text-red-600"
                      )}>
                        {kw}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </GlassCard>
  );
}

// ─── 메인 ──────────────────────────────────────────────────────────────
export default function InterestPage() {
  const params = useParams();
  const id = params.id as string;
  const campaignId = id as Id<"campaigns">;

  const { refreshTrigger } = useRefresh();
  const [lastRefresh, setLastRefresh] = useState(0);

  const campaign = useQuery(api.campaigns.getCampaignById, { id: campaignId });
  const activities = useQuery(api.interest.getInterestActivities, { campaignId }) ?? [];
  const syncActivities = useMutation(api.interest.syncInterestActivities);

  const [pastedData, setPastedData] = useState<any[] | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [isCardEditMode, setIsCardEditMode] = useState(false);
  const [activeTab, setActiveTab] = useState<"event" | "popup">("event");
  const [selectedQuestionId, setSelectedQuestionId] = useState<string>("q1");

  // ── 스프레드시트 URL 상태 ──
  const [eventSheetUrl, setEventSheetUrl] = useState("");
  const [popupSheetUrl, setPopupSheetUrl] = useState("");
  const [vipSheetUrl, setVipSheetUrl] = useState("");
  const [responseSheetUrl, setResponseSheetUrl] = useState("");
  const [syncing, setSyncing] = useState<"event" | "popup" | "vip" | "response" | null>(null);
  const [syncMessage, setSyncMessage] = useState("");

  // ── 편집 가능 카드 타이틀/설명 ──
  const defaultCardLabels = {
    totalTitle: "총 참여자 수",
    totalDesc: "이벤트 참여자 + 팝업 방문객 합산",
    eventTitle: "이벤트 참여자 수",
    eventDesc: "이벤트 페이지 누적 트래픽",
    popupGroupTitle: "팝업 방문자 현황",
    popupGeneralTitle: "팝업 방문자 수(전체)",
    popupGeneralDesc: "일반 방문자 + VIP 방문자 합산",
    popupVipTitle: "팝업 방문자 수(VIP)",
    popupVipDesc: "VIP 사전 예약 기준",
  };
  const [cardLabels, setCardLabels] = useState(defaultCardLabels);

  useEffect(() => {
    const savedEvent = localStorage.getItem(`interest_event_sheet_${campaignId}`);
    const savedPopup = localStorage.getItem(`interest_popup_sheet_${campaignId}`);
    const savedVip = localStorage.getItem(`interest_vip_sheet_${campaignId}`);
    const savedResponse = localStorage.getItem(`interest_response_sheet_${campaignId}`);
    const savedLabels = localStorage.getItem(`interest_card_labels_${campaignId}`);
    if (savedEvent) setEventSheetUrl(savedEvent);
    if (savedPopup) setPopupSheetUrl(savedPopup);
    if (savedVip) setVipSheetUrl(savedVip);
    if (savedResponse) setResponseSheetUrl(savedResponse);
    if (savedLabels) { try { setCardLabels(JSON.parse(savedLabels)); } catch {} }
  }, [campaignId]);

  const updateCardLabel = (key: keyof typeof defaultCardLabels, value: string) => {
    const next = { ...cardLabels, [key]: value };
    setCardLabels(next);
    try { localStorage.setItem(`interest_card_labels_${campaignId}`, JSON.stringify(next)); } catch {}
  };

  useEffect(() => {
    if (refreshTrigger !== lastRefresh) setLastRefresh(refreshTrigger);
  }, [refreshTrigger, lastRefresh]);

  const syncFromSheet = useCallback(async (type: "event" | "popup" | "vip" | "response", url: string) => {
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

      if (type === "event" || type === "popup" || type === "vip") {
        let mapped: any[];
        const actType = type === "event" ? "이벤트" : "팝업";

        const dateCol = findCol(["날짜", "일자", "date", "기간"]);
        const titleCol = findCol(["이벤트", "팝업", "장소", "title", "이름", "명"]);
        const participantsCol = findCol(["참여", "신청", "참가", "접수"]);
        const visitorsCol = findCol(["방문", "조회", "노출", "집객", "입장", "view"]);
        const vipCol = findCol(["vip", "브이아이피"]);

        mapped = dataRows.map(r => ({
          activityType: actType,
          title: titleCol >= 0 ? r[titleCol] || "" : "",
          locationOrTarget: "",
          startDate: dateCol >= 0 ? r[dateCol] || "" : "",
          endDate: dateCol >= 0 ? r[dateCol] || "" : "",
          visitors: visitorsCol >= 0 ? processNumber(r[visitorsCol] || "0") : 0,
          participants: participantsCol >= 0 ? processNumber(r[participantsCol] || "0") : 0,
          budget: 0,
          vipCount: vipCol >= 0 ? processNumber(r[vipCol] || "0") : undefined,
        })).filter(r => r.title || r.participants > 0 || r.startDate);

        if (mapped.length === 0) throw new Error("매핑 가능한 데이터가 없습니다. 컬럼 헤더를 확인하세요.");

        const keepRows = activities
          .filter(a => type === "event" ? a.activityType !== "이벤트" : a.activityType !== "팝업")
          .map(a => ({
            activityType: a.activityType,
            title: a.title,
            locationOrTarget: a.locationOrTarget,
            startDate: a.startDate,
            endDate: a.endDate,
            visitors: a.visitors,
            participants: a.participants,
            budget: a.budget,
            vipCount: a.vipCount,
          }));

        await syncActivities({ campaignId, rows: [...keepRows, ...mapped] });
        localStorage.setItem(`interest_${type}_sheet_${campaignId}`, url);
        setSyncMessage(`✅ ${mapped.length}건 동기화 완료!`);
      } else {
        // response type — just store url, data stays as mock
        localStorage.setItem(`interest_response_sheet_${campaignId}`, url);
        setSyncMessage("✅ 이벤트 응답 시트 URL이 저장되었습니다.");
      }
    } catch (e: any) {
      setSyncMessage(`❌ ${e.message}`);
    } finally {
      setSyncing(null);
    }
  }, [activities, syncActivities, campaignId]);

  const eventActivities = useMemo(() => activities.filter(a => a.activityType !== "팝업"), [activities]);
  const popupActivities = useMemo(() => activities.filter(a => a.activityType === "팝업"), [activities]);

  const eventStats = useMemo(() => ({
    participants: eventActivities.reduce((s, a) => s + a.participants, 0) || 1250,
    traffic: eventActivities.reduce((s, a) => s + a.visitors, 0) || 4500,
  }), [eventActivities]);

  const popupStats = useMemo(() => ({
    visitors: popupActivities.reduce((s, a) => s + a.participants, 0) || 800,
    vipVisitors: popupActivities.reduce((s, a) => s + (a.vipCount ?? 0), 0) || 123,
    reservations: popupActivities.reduce((s, a) => s + a.visitors, 0) || 870,
  }), [popupActivities]);

  const combinedChartData = useMemo(() => {
    const map = new Map<string, any>();

    // 캠페인 시작일~오늘(최대 종료일)로 날짜 축 채우기
    // T00:00:00 추가로 UTC가 아닌 로컬 시간대로 파싱하여 한국 시간대 버그 방지
    if (campaign?.startDate && campaign?.endDate) {
      const start = new Date(campaign.startDate.includes("T") ? campaign.startDate : campaign.startDate + "T00:00:00");
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const end = new Date(campaign.endDate.includes("T") ? campaign.endDate : campaign.endDate + "T00:00:00");
      const limit = today <= end ? today : end;
      const cur = new Date(start);
      while (cur <= limit) {
        const key = `${String(cur.getMonth() + 1).padStart(2, "0")}/${String(cur.getDate()).padStart(2, "0")}`;
        map.set(key, { name: key, 이벤트참여자: 0, 팝업방문객: 0, VIP방문객: 0 });
        cur.setDate(cur.getDate() + 1);
      }
    }

    eventActivities.forEach(a => {
      const date = a.startDate ? a.startDate.slice(5).replace("-", "/") : "미상";
      if (!map.has(date)) map.set(date, { name: date, 이벤트참여자: 0, 팝업방문객: 0, VIP방문객: 0 });
      map.get(date).이벤트참여자 += a.participants;
    });

    popupActivities.forEach(a => {
      const date = a.startDate ? a.startDate.slice(5).replace("-", "/") : "미상";
      if (!map.has(date)) map.set(date, { name: date, 이벤트참여자: 0, 팝업방문객: 0, VIP방문객: 0 });
      map.get(date).팝업방문객 += a.participants;
      map.get(date).VIP방문객 += a.vipCount ?? 0;
    });

    const arr = Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
    if (arr.length === 0) {
      return [
        { name: "05/01", 이벤트참여자: 120, 팝업방문객: 100, VIP방문객: 18 },
        { name: "05/02", 이벤트참여자: 150, 팝업방문객: 140, VIP방문객: 23 },
        { name: "05/03", 이벤트참여자: 200, 팝업방문객: 190, VIP방문객: 38 },
        { name: "05/04", 이벤트참여자: 180, 팝업방문객: 160, VIP방문객: 30 },
        { name: "05/05", 이벤트참여자: 220, 팝업방문객: 210, VIP방문객: 43 },
      ];
    }
    return arr;
  }, [eventActivities, popupActivities, campaign]);

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
        <div className="flex items-center gap-2">
          <Button
            variant="outline" size="sm"
            onClick={() => setIsCardEditMode(!isCardEditMode)}
            className={`gap-2 ${isCardEditMode ? "bg-blue-600 text-white border-blue-600 hover:bg-blue-700" : "text-gray-600 border-gray-200"}`}
          >
            <Edit2 className="w-4 h-4" />
            {isCardEditMode ? "편집 완료" : "카드 편집"}
          </Button>
          <Button
            variant="outline" size="sm"
            onClick={() => setShowSettings(!showSettings)}
            className={`gap-2 ${showSettings ? "bg-gray-900 text-white border-gray-900" : "text-gray-600 border-gray-200"}`}
          >
            <Settings2 className="w-4 h-4" />
            데이터 소스 관리
          </Button>
        </div>
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
              <label className="text-xs font-semibold text-gray-700">📝 이벤트 응답 분석 데이터</label>
              <div className="flex gap-2">
                <input
                  className="flex-1 bg-white border border-gray-200 rounded-lg px-3 py-2 text-xs text-gray-900 outline-none focus:border-violet-400 placeholder:text-gray-400"
                  placeholder="구글 시트 URL 입력"
                  value={responseSheetUrl}
                  onChange={e => setResponseSheetUrl(e.target.value)}
                />
                <Button size="sm" disabled={syncing === "response" || !responseSheetUrl} onClick={() => syncFromSheet("response", responseSheetUrl)} className="bg-violet-600 text-white hover:bg-violet-700 border-0 gap-1 px-3">
                  {syncing === "response" ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />} 저장
                </Button>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-xs font-semibold text-gray-700">🏬 팝업 일반 고객 예약/방문 데이터</label>
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

            <div className="flex flex-col gap-2">
              <label className="text-xs font-semibold text-gray-700">👑 팝업 VIP 고객 예약/방문 데이터</label>
              <div className="flex gap-2">
                <input
                  className="flex-1 bg-white border border-gray-200 rounded-lg px-3 py-2 text-xs text-gray-900 outline-none focus:border-yellow-400 placeholder:text-gray-400"
                  placeholder="구글 시트 URL 입력"
                  value={vipSheetUrl}
                  onChange={e => setVipSheetUrl(e.target.value)}
                />
                <Button size="sm" disabled={syncing === "vip" || !vipSheetUrl} onClick={() => syncFromSheet("vip", vipSheetUrl)} className="bg-yellow-600 text-white hover:bg-yellow-700 border-0 gap-1 px-3">
                  {syncing === "vip" ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />} 동기화
                </Button>
              </div>
            </div>
          </div>

          {syncMessage && (
            <p className={`text-xs mt-2 ${syncMessage.startsWith("✅") ? "text-green-600" : "text-red-500"}`}>{syncMessage}</p>
          )}
        </GlassCard>
      )}

      {/* 1. 상단 KPI 카드 */}
      <section>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* 총 참여자 수 - 다크 */}
          <div className="bg-gray-900 rounded-2xl p-6 flex flex-col justify-between shadow-lg">
            <div className="flex justify-between items-start mb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center">
                  <Users className="w-4 h-4 text-white" />
                </div>
                <EditableText
                  value={cardLabels.totalTitle}
                  onChange={v => updateCardLabel("totalTitle", v)}
                  className="text-sm text-white font-medium"
                  dark editMode={isCardEditMode}
                />
              </div>
              <span className="flex items-center text-xs font-semibold text-emerald-400 bg-emerald-400/10 px-2 py-0.5 rounded-full">
                <ArrowUpRight className="w-3 h-3 mr-0.5" /> 12.5%
              </span>
            </div>
            <p className="text-3xl font-bold font-mono text-white my-2">
              {(eventStats.participants + popupStats.visitors).toLocaleString()}
              <span className="text-sm font-sans text-white/50 ml-1 font-medium">명</span>
            </p>
            <EditableText
              value={cardLabels.totalDesc}
              onChange={v => updateCardLabel("totalDesc", v)}
              className="text-[11px] text-white/40"
              placeholder="설명 입력"
              dark editMode={isCardEditMode}
            />
          </div>

          {/* 이벤트 참여자 수 */}
          <GlassCard className="p-6 flex flex-col justify-center">
            <div className="flex justify-between items-start mb-2">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-red-50 flex items-center justify-center"><Ticket className="w-4 h-4 text-red-600" /></div>
                <EditableText
                  value={cardLabels.eventTitle}
                  onChange={v => updateCardLabel("eventTitle", v)}
                  className="text-sm text-gray-500 font-medium"
                  editMode={isCardEditMode}
                />
              </div>
              <span className="flex items-center text-xs font-semibold text-green-600 bg-green-50 px-2 py-0.5 rounded-full"><ArrowUpRight className="w-3 h-3 mr-0.5" /> 8.2%</span>
            </div>
            <p className="text-3xl font-bold font-mono text-gray-900 mt-2">{eventStats.participants.toLocaleString()}<span className="text-sm font-sans text-gray-400 ml-1 font-medium">명</span></p>
            <p className="text-[11px] text-gray-400 mt-2 flex items-center gap-1">
              <EditableText
                value={cardLabels.eventDesc}
                onChange={v => updateCardLabel("eventDesc", v)}
                className="text-[11px] text-gray-400"
                editMode={isCardEditMode}
              />: <span className="font-mono text-gray-600 font-semibold">{eventStats.traffic.toLocaleString()}</span>
            </p>
          </GlassCard>

          {/* 팝업 방문자 통합 그룹 */}
          <div className="rounded-2xl border border-gray-100 bg-white shadow-sm overflow-hidden flex flex-col">
            {/* 그룹 헤더 */}
            <div className="px-5 pt-4 pb-3 border-b border-gray-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center">
                  <MapPin className="w-3 h-3 text-gray-600" />
                </div>
                <EditableText
                  value={cardLabels.popupGroupTitle}
                  onChange={v => updateCardLabel("popupGroupTitle", v)}
                  className="text-sm text-gray-500 font-medium"
                  editMode={isCardEditMode}
                />
              </div>
              <span className="flex items-center text-xs font-semibold text-green-600 bg-green-50 px-2 py-0.5 rounded-full">
                <ArrowUpRight className="w-3 h-3 mr-0.5" /> 15.3%
              </span>
            </div>
            {/* 두 카드 분할 */}
            <div className="grid grid-cols-2 divide-x divide-gray-100 flex-1">
              {/* 전체 */}
              <div className="px-5 py-4 flex flex-col justify-center">
                <div className="flex items-center gap-1.5 mb-2">
                  <div className="w-5 h-5 rounded-full bg-gray-100 flex items-center justify-center">
                    <Users className="w-2.5 h-2.5 text-gray-600" />
                  </div>
                  <EditableText
                    value={cardLabels.popupGeneralTitle}
                    onChange={v => updateCardLabel("popupGeneralTitle", v)}
                    className="text-xs text-gray-500 font-medium"
                    editMode={isCardEditMode}
                  />
                </div>
                <p className="text-2xl font-bold font-mono text-gray-900">
                  {(popupStats.visitors + popupStats.vipVisitors).toLocaleString()}
                  <span className="text-xs font-sans text-gray-400 ml-1">명</span>
                </p>
                <EditableText
                  value={cardLabels.popupGeneralDesc}
                  onChange={v => updateCardLabel("popupGeneralDesc", v)}
                  className="text-[10px] text-gray-400 mt-1.5"
                  editMode={isCardEditMode}
                />
              </div>
              {/* VIP */}
              <div className="px-5 py-4 flex flex-col justify-center">
                <div className="flex items-center gap-1.5 mb-2">
                  <div className="w-5 h-5 rounded-full bg-yellow-50 flex items-center justify-center">
                    <Crown className="w-2.5 h-2.5 text-yellow-600" />
                  </div>
                  <EditableText
                    value={cardLabels.popupVipTitle}
                    onChange={v => updateCardLabel("popupVipTitle", v)}
                    className="text-xs text-gray-500 font-medium"
                    editMode={isCardEditMode}
                  />
                </div>
                <p className="text-2xl font-bold font-mono text-yellow-600">
                  {popupStats.vipVisitors.toLocaleString()}
                  <span className="text-xs font-sans text-gray-400 ml-1">명</span>
                </p>
                <EditableText
                  value={cardLabels.popupVipDesc}
                  onChange={v => updateCardLabel("popupVipDesc", v)}
                  className="text-[10px] text-gray-400 mt-1.5"
                  editMode={isCardEditMode}
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 2. 일별 참여 추이 그래프 */}
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
                <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(0,0,0,0.02)" }} />
                <Legend wrapperStyle={{ fontSize: "12px", paddingTop: "16px" }} iconType="circle" />
                <Bar dataKey="팝업방문객" name="팝업 방문객" fill="#9ca3af" radius={[4, 4, 0, 0]} barSize={28} stackId="popup" />
                <Bar dataKey="VIP방문객" name="VIP 방문객" fill="#f59e0b" radius={[4, 4, 0, 0]} barSize={28} stackId="popup" />
                <Line type="monotone" dataKey="이벤트참여자" name="이벤트 참여자" stroke="#e50010" strokeWidth={3} dot={{ r: 4, fill: "#e50010", strokeWidth: 2, stroke: "#fff" }} activeDot={{ r: 6 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </GlassCard>
      </section>

      {/* 3. 하단 탭 */}
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
            {responseSheetUrl && (
              <div className="flex items-center gap-2 text-xs text-gray-500 bg-gray-50 border border-gray-100 rounded-lg px-3 py-2">
                <Link2 className="w-3 h-3 text-violet-500" />
                연결된 시트:
                <a href={responseSheetUrl} target="_blank" rel="noopener noreferrer" className="text-violet-600 hover:underline truncate max-w-xs">{responseSheetUrl}</a>
              </div>
            )}
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
                      const data = MOCK_ANSWERS[q.text] || MOCK_ANSWERS["참여 동기가 무엇인가요?"];
                      const total = data.reduce((s, d) => s + d.value, 0);
                      return (
                        <div className="border border-gray-100 rounded-xl p-5 bg-white shadow-sm h-full flex flex-col">
                          <h5 className="text-sm font-bold text-gray-800 mb-4">{q.text}</h5>
                          <div className="flex gap-6 flex-1">
                            <div className="flex-shrink-0" style={{ width: 180, height: 180 }}>
                              <ResponsiveContainer width="100%" height="100%">
                                <RechartsPieChart>
                                  <Pie data={data} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={2} dataKey="value">
                                    {data.map((entry: any, index: number) => <Cell key={`cell-${index}`} fill={entry.fill} />)}
                                  </Pie>
                                  <Tooltip content={<CustomTooltip />} />
                                </RechartsPieChart>
                              </ResponsiveContainer>
                            </div>
                            <div className="flex-1 space-y-2 py-1">
                              {data.map((item: any, i: number) => (
                                <div key={i} className="flex items-center gap-2">
                                  <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: item.fill }} />
                                  <span className="text-xs text-gray-600 flex-1 truncate">{item.name}</span>
                                  <span className="text-xs font-mono font-bold text-gray-900">{Math.round(item.value / total * 100)}%</span>
                                  <span className="text-[10px] font-mono text-gray-400">{item.value.toLocaleString()}</span>
                                </div>
                              ))}
                            </div>
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
                            <KeywordBubbles keywords={MOCK_KEYWORDS} />
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
                      <TableHead className="text-gray-500 text-xs font-semibold text-right">일반 신청</TableHead>
                      <TableHead className="text-gray-500 text-xs font-semibold text-right">
                        <span className="flex items-center justify-end gap-1"><Crown className="w-3 h-3 text-yellow-500" />VIP 신청</span>
                      </TableHead>
                      <TableHead className="text-gray-500 text-xs font-semibold text-right">총 예약 신청</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {MOCK_POPUP_RESERVATIONS.map((row, i) => (
                      <TableRow key={i} className="border-gray-100 hover:bg-gray-50 text-sm">
                        <TableCell className="text-gray-600 font-mono font-medium">{row.date}</TableCell>
                        <TableCell className="text-right font-mono text-gray-900 font-bold">{row.count.toLocaleString()}</TableCell>
                        <TableCell className="text-right font-mono text-yellow-700 font-bold bg-yellow-50/30">{row.vipCount.toLocaleString()}</TableCell>
                        <TableCell className="text-right font-mono text-gray-900 font-bold bg-gray-50">{(row.count + row.vipCount).toLocaleString()}</TableCell>
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
                      <TableHead className="text-gray-500 text-xs font-semibold text-right">일반 방문자 수</TableHead>
                      <TableHead className="text-gray-500 text-xs font-semibold text-right">
                        <span className="flex items-center justify-end gap-1"><Crown className="w-3 h-3 text-yellow-500" />VIP 방문</span>
                      </TableHead>
                      <TableHead className="text-gray-500 text-xs font-semibold text-right">총 방문</TableHead>
                      <TableHead className="text-gray-500 text-xs font-semibold text-right">방문율</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {MOCK_POPUP_VISITORS.map((row, i) => (
                      <TableRow key={i} className="border-gray-100 hover:bg-gray-50 text-sm">
                        <TableCell className="text-gray-600 font-mono font-medium">{row.date}</TableCell>
                        <TableCell className="text-right font-mono text-gray-900">{(row.actual - row.vipActual).toLocaleString()}</TableCell>
                        <TableCell className="text-right font-mono text-yellow-700 font-bold bg-yellow-50/30">{row.vipActual.toLocaleString()}</TableCell>
                        <TableCell className="text-right font-mono text-gray-900 font-bold">{row.actual.toLocaleString()}</TableCell>
                        <TableCell className="text-right font-mono text-gray-900 font-bold bg-gray-50">{row.rate}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </GlassCard>
            </div>

            <NaverReviewAnalyzer />
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
