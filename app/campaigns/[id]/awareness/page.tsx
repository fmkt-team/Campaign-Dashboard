"use client";
import React from "react";

import { useState, useRef, useEffect, useMemo } from "react";
import { useParams } from "next/navigation";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { GlassCard } from "@/components/glass-card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { BarChart, Bar, ComposedChart, ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, PieChart as RechartsPieChart, Pie, Cell } from "recharts";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarIcon } from "lucide-react";
import { DateRange } from "react-day-picker";
import { Input } from "@/components/ui/input";
import {
  Check, X, UploadCloud, FileSpreadsheet, RefreshCw, Settings2,
  Pencil, Trash, Link as LinkIcon, SlidersHorizontal,
  MessageSquare, ThumbsUp, Eye, Target, TrendingUp, ArrowUpDown,
  ChevronUp, ChevronDown, ChevronRight, Smile, Frown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import * as xlsx from "xlsx";
import { format, startOfWeek, parseISO } from "date-fns";
import { useRefresh } from "@/lib/refresh-context";
import { useAuth } from "@/lib/auth-context";

type ViewMode  = "daily" | "weekly" | "monthly" | "total";
type ActiveTab = "media" | "video" | "viral";

const VIEW_MODE_LABELS: Record<ViewMode, string> = {
  daily: "일별", weekly: "주차별", monthly: "월별", total: "전체",
};

const FIXED_COLS = [
  { key: "spend",             label: "집행 비용" },
  { key: "impressions",       label: "노출수" },
  { key: "views",             label: "조회수" },
  { key: "clicks",            label: "클릭수" },
  { key: "cpv",               label: "CPV" },
  { key: "ctrVtr",            label: "VTR / CTR" },
  { key: "conversions",       label: "전환수" },
  { key: "conversionRevenue", label: "전환 매출" },
  { key: "roas",              label: "ROAS" },
  { key: "signupCorporate",   label: "기업가입" },
  { key: "signupPersonal",    label: "개인가입" },
  { key: "leadsCollected",    label: "리드수집" },
];

const DEFAULT_VISIBLE: Record<string, boolean> = {
  spend: true, impressions: true, views: true, clicks: true, cpv: true, ctrVtr: true,
  conversions: true, conversionRevenue: true, roas: true,
  signupCorporate: false, signupPersonal: false, leadsCollected: false,
};

// FIXED_COLS가 이미 커버하는 extra col 이름 (대소문자 불일치 중복 방지)
// cpv → "CPV", ctrVtr → "CTR"/"VTR", roas → "ROAS"
const FIXED_COVERED_LOWER = new Set(["cpv", "ctr", "vtr", "roas"]);

/** detectedExtraCols 중 FIXED_COLS와 중복되는 항목을 제거한 필터 함수 */
function filterExtraCols(detectedExtraCols: string[], mediaColOrder: string[]): string[] {
  const orderLower = new Set(mediaColOrder.map(c => c.toLowerCase()));
  return detectedExtraCols.filter(col =>
    !mediaColOrder.includes(col) &&
    !orderLower.has(col.toLowerCase()) &&
    !FIXED_COVERED_LOWER.has(col.toLowerCase())
  );
}

// ── 포맷 헬퍼 ────────────────────────────────────────────────
function fmt(n: number)    { return n.toLocaleString(); }
function pct(n: number)    { return n.toFixed(1) + "%"; }
function pct2(n: number)   { return n.toFixed(2) + "%"; }  // 인게이지먼트 등 소수점 2자리
function fmtKrw(n: number) { return "₩" + n.toLocaleString(); }

function processNumber(val: any) {
  if (typeof val === "number") return val;
  if (!val) return 0;
  const n = parseFloat(String(val).replace(/[^0-9.-]+/g, ""));
  return isNaN(n) ? 0 : n;
}
function processDate(val: any): string {
  if (!val) return "";
  const s = String(val).trim();
  const m = s.match(/(\d{2,4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) {
    const y = m[1].length === 2 ? `20${m[1]}` : m[1];
    return `${y}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  }
  return "";
}
const VALID_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// extraData JSON 문자열 → 객체 파싱 헬퍼
function parseExtra(raw: any): Record<string, number> {
  if (!raw) return {};
  if (typeof raw === "string") {
    try { return JSON.parse(raw); } catch { return {}; }
  }
  return raw as Record<string, number>;
}

// 집계 후 합산하면 안 되는 비율 지표를 재계산 (CPM/CPV/CPC/CTR/VTR)
// groupDigitalKpis, getChartData 집계 후 호출
const RATIO_EXTRA_KEYS: Record<string, (d: any) => number> = {
  "CPM":  (d) => d.impressions > 0 ? Math.round((d.spend / d.impressions) * 1000) : 0,
  "CPV":  (d) => d.views > 0       ? Math.round(d.spend / d.views) : 0,
  "CPC":  (d) => d.clicks > 0      ? Math.round(d.spend / d.clicks) : 0,
  "CTR":  (d) => d.impressions > 0 ? Number(((d.clicks / d.impressions) * 100).toFixed(2)) : 0,
  "VTR":  (d) => d.impressions > 0 ? Number(((d.views  / d.impressions) * 100).toFixed(2)) : 0,
};
function recalcRatioExtra(obj: any) {
  for (const [k, fn] of Object.entries(RATIO_EXTRA_KEYS)) {
    if (k in (obj.extra || {})) obj.extra[k] = fn(obj);
  }
}

// ────────────────────────────────────────────────────────────
// 댓글 감성 분석 NLP 유틸
// ────────────────────────────────────────────────────────────
const POS_WORDS_CMT = [
  "좋아","좋았","좋은","좋습","예쁘","친절","최고","대박","추천",
  "만족","훌륭","깔끔","편안","편리","재밌","즐거","행복","완벽",
  "굿","멋지","멋있","감동","아늑","쾌적","깨끗","강추",
  "재방문","기대이상","감사","고마","설레","기쁘","탁월","뛰어",
];
const NEG_WORDS_CMT = [
  "불편","별로","아쉽","실망","나쁘","최악","더럽","지저분",
  "불친절","부족","불만","짜증","불쾌","후회","비추","다시는",
  "안올","안 올","느리","시끄럽","낡은","노후",
];
function classifyCommentSentiment(text: string): "positive" | "negative" {
  const p = POS_WORDS_CMT.reduce((s, w) => s + (text.includes(w) ? 1 : 0), 0);
  const n = NEG_WORDS_CMT.reduce((s, w) => s + (text.includes(w) ? 1 : 0), 0);
  return n > p ? "negative" : "positive";
}
const CMT_STOPWORDS = new Set([
  // ① 대명사
  "나는","나도","나를","내가","우리","누구","모두","한명","저는","저도","저를",
  "이분","본인","저희","그분","당신","자신","자기",
  // ② 지시어·관계어
  "이런","저런","그런","어떤","이렇게","저렇게","그렇게","이게","저게","그게",
  "이렇","저렇","그렇","어떻","이것","저것","그것","이때","그때","저때",
  "여기","거기","저기","이곳","그곳","저곳","뭔가","뭔지","뭔데",
  // ③ 단순 접속어
  "그리고","하지만","그래서","때문에","그러나","그런데","그러면","그러므로",
  "또한","따라서","즉","반면","결국",
  // ④ 단독 강조 부사·감탄사
  "너무","정말","진짜","매우","아주","조금","가장","항상","자주","거의",
  "바로","다시","함께","계속","이미","특히","주로","보통","그냥","약간",
  // ⑤ 맥락 없는 동사·활용형
  "있는","없는","하는","되는","같은","해서","하고","하면","되어","하여","이고","이며",
  "했고","됐고","있었","없었","했어","됐어","되고","있고","보고","같고","알고",
  // ⑥ 고빈도 추상·일반 명사
  "마음","생각","느낌","부분","내용","정도","모습","이후","이전","현재",
  "다음","오늘","어제","것이","것도","것은","때문","위해","통해","대해",
  "하나","여러","모든","이번","요즘","사람","경우","방법","이유","문제",
]);
function stripCmtParticle(word: string): string {
  const endings = ["을","를","이","가","은","는","에","의","로","와","과","도","만","서","게","고","며","나","라","야","아","까","으로","상","적"];
  for (const e of endings) {
    if (word.endsWith(e) && word.length > 2) return word.slice(0, -e.length);
  }
  return word;
}
function isCmtNounLike(word: string): boolean {
  // [최우선] 부정형 어미·불완전 어미로 끝나는 단어 제거
  const negEnds = [
    "않는","않아","않고","않네","않죠","않은",
    "아닌","아니고","아니야","아니죠",
    "없는","없어","없고","없네","없죠",
    "못한","못해","못하고","못하는",
  ];
  if (negEnds.some(e => word.endsWith(e))) return false;
  // ~지 로 끝나면서 앞이 용언인 경우 (보이지, 느껴지지, 알지 등)
  if (word.endsWith("지") && word.length <= 5) return false;
  // 단독 이동·상태 동사
  const standaloneVerbs = ["갑니다","옵니다","됩니다","떠납니다","나옵니다","보이지","느껴지지","들리지"];
  if (standaloneVerbs.includes(word)) return false;
  // 기존 동사 어미 필터
  const badEnd = [
    "할때","할수","하여","됩니","됐어","했어","입니","습니",
    "하며","하면","하지","하니","됩","됐","했","겠","였","었",
  ];
  if (badEnd.some(e => word.endsWith(e))) return false;
  const badIn = ["할때","할수","수있","하면서","하는데","되는데"];
  if (badIn.some(p => word.includes(p))) return false;
  return true;
}
function extractCmtKeywords(text: string): string[] {
  const raw = text.match(/[가-힣]{2,5}/g) || [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const w of raw) {
    const clean = stripCmtParticle(w);
    if (clean.length < 2) continue;
    if (CMT_STOPWORDS.has(clean)) continue;
    if (!isCmtNounLike(clean)) continue;
    if (seen.has(clean)) continue;
    seen.add(clean);
    result.push(clean);
    if (result.length >= 5) break;
  }
  return result;
}

// ─── 댓글 분석: 키워드 버블 차트 ────────────────────────────────────
function CommentKeywordBubbles({ keywords }: {
  keywords: { text: string; count: number; sentiment: "positive" | "negative" }[];
}) {
  const max = Math.max(...keywords.map(k => k.count), 1);
  return (
    <div className="flex flex-wrap gap-3 justify-center items-center py-4 min-h-[160px]">
      {[...keywords].sort((a, b) => b.count - a.count).map((kw, i) => {
        const ratio = kw.count / max;
        const size  = Math.round(58 + ratio * 76);   // 58~134px
        const fs    = Math.round(10 + ratio * 6);    // 10~16px
        const hue   = kw.sentiment === "positive" ? 142 : 0;
        const sat   = kw.sentiment === "positive" ? "60%" : "70%";
        const lit   = `${68 - Math.round(ratio * 26)}%`;
        return (
          <div
            key={i}
            className="rounded-full flex flex-col items-center justify-center text-center
                       hover:scale-110 active:scale-95 transition-transform cursor-default flex-shrink-0
                       shadow-sm select-none"
            style={{ width: size, height: size, backgroundColor: `hsl(${hue},${sat},${lit})` }}
            title={`${kw.text}: ${kw.count}건`}
          >
            <span className="font-bold text-white leading-tight px-2 w-full text-center break-keep"
              style={{ fontSize: fs }}>
              #{kw.text}
            </span>
            <span className="text-white/75 font-mono font-semibold mt-0.5"
              style={{ fontSize: Math.max(9, fs - 2) }}>
              {kw.count}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ─── 댓글 종합 분석 컴포넌트 (AI 기반, 흥미상세 리뷰 분석 동일 디자인) ────
type CommentAnalysisResult = {
  total: number;
  textTotal: number;
  keywords: { text: string; count: number; sentiment: "positive" | "negative" }[];
  comments: { text: string; author?: string; date?: string; sentiment: "positive" | "negative"; keywords: string[] }[];
  posRate: number;
  posCount: number;
  negCount: number;
};

function buildCommentAnalysis(
  items: { text: string; author?: string; date?: string; sentiment: "positive" | "negative"; keywords: string[] }[]
): CommentAnalysisResult {
  const kwMap = new Map<string, { count: number; posCount: number }>();
  const textItems = items.filter(it => it.text.trim());
  textItems.forEach(it => {
    it.keywords.forEach(kw => {
      const clean = kw.trim();
      if (!clean || clean.length < 2) return;
      const e = kwMap.get(clean) || { count: 0, posCount: 0 };
      e.count++;
      if (it.sentiment === "positive") e.posCount++;
      kwMap.set(clean, e);
    });
  });
  const keywords = [...kwMap.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 20)
    .map(([text, v]) => ({
      text,
      count: v.count,
      sentiment: (v.posCount / v.count >= 0.5 ? "positive" : "negative") as "positive" | "negative",
    }));
  const posCount = textItems.filter(it => it.sentiment === "positive").length;
  const negCount = textItems.length - posCount;
  return {
    total: items.length,
    textTotal: textItems.length,
    keywords,
    comments: textItems,
    posRate: textItems.length > 0 ? Math.round((posCount / textItems.length) * 100) : 0,
    posCount,
    negCount,
  };
}

function CommentAnalysisSection({ comments, title = "종합 댓글 분석" }: {
  comments: { text: string; author?: string; likes?: number; date?: string }[];
  title?: string;
}) {
  const [analysis, setAnalysis]     = useState<CommentAnalysisResult | null>(null);
  const [aiRefining, setAiRefining] = useState(false);
  const [aiDone, setAiDone]         = useState(false);
  const [showComments, setShowComments] = useState(false);

  // ── 재분석 트리거: 댓글 수가 변할 때만 (텍스트 변경은 무시해 루프 방지) ──
  const commentCount = comments.length;

  useEffect(() => {
    if (!commentCount) { setAnalysis(null); setAiDone(false); return; }

    // ① 클라이언트 NLP로 즉시 1차 분석 (로딩 없음)
    const sentimentItems = comments.map(c => ({
      text:      c.text || "",
      author:    c.author,
      date:      c.date,
      sentiment: classifyCommentSentiment(c.text || ""),
      keywords:  extractCmtKeywords(c.text || ""),
    }));
    setAnalysis(buildCommentAnalysis(sentimentItems));
    setAiDone(false);

    // ② AI로 키워드 보강 (배경 실행, 최대 50건 샘플)
    const MAX = 50;
    const step = comments.length > MAX ? Math.ceil(comments.length / MAX) : 1;
    const sample = comments.filter((_, i) => i % step === 0).slice(0, MAX);

    let cancelled = false;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 25000); // 25초 타임아웃
    setAiRefining(true);

    fetch("/api/extract-keywords", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ texts: sample.map(c => c.text || "") }),
      signal:  controller.signal,
    })
      .then(r => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((data: any) => {
        if (cancelled || !data?.results) return;
        const aiResults = data.results as string[][];
        // 샘플 인덱스로 매핑 (샘플 외 항목은 1차 키워드 그대로 유지)
        const sampleTexts = sample.map(c => c.text || "");
        const updated = sentimentItems.map(it => {
          const si = sampleTexts.indexOf(it.text);
          return {
            ...it,
            keywords: si >= 0 && aiResults[si]?.length
              ? aiResults[si]
              : it.keywords,
          };
        });
        setAnalysis(buildCommentAnalysis(updated));
        setAiDone(true);
      })
      .catch(() => { /* 타임아웃/실패 시 1차 분석 유지 */ })
      .finally(() => {
        clearTimeout(timer);
        if (!cancelled) setAiRefining(false);
      });

    return () => {
      cancelled = true;
      controller.abort();
      clearTimeout(timer);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [commentCount]);

  if (!analysis) return null;

  return (
    <GlassCard className="p-6">
      {/* ── 헤더 ── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-5 border-b border-gray-100 pb-4 gap-3">
        <div className="flex items-center gap-3 flex-wrap">
          <h4 className="text-sm font-bold text-gray-900 flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-gray-400" /> {title}
          </h4>
          {aiRefining && (
            <span className="flex items-center gap-1 text-[10px] text-indigo-500 bg-indigo-50 px-2 py-0.5 rounded-full">
              <RefreshCw className="w-2.5 h-2.5 animate-spin" /> AI 키워드 보강 중...
            </span>
          )}
          {aiDone && !aiRefining && (
            <span className="text-[10px] text-indigo-400 bg-indigo-50 px-2 py-0.5 rounded-full">
              ✦ AI 보강 완료
            </span>
          )}
        </div>
        <div className="flex gap-2">
          <span className="text-xs bg-green-50 text-green-700 px-2 py-1 rounded-md font-medium border border-green-100 flex items-center gap-1">
            <Smile className="w-3 h-3" /> 긍정 {analysis.posRate}%
          </span>
          <span className="text-xs bg-red-50 text-red-700 px-2 py-1 rounded-md font-medium border border-red-100 flex items-center gap-1">
            <Frown className="w-3 h-3" /> 부정 {100 - analysis.posRate}%
          </span>
        </div>
      </div>

      {/* ── 분석 결과 ── */}
      <div className="grid grid-cols-1 lg:grid-cols-[200px_1fr] gap-5 mb-6 items-start">
        {/* 감성 도넛 차트 */}
        <div className="flex flex-col gap-3 bg-gray-50 rounded-xl p-4 border border-gray-100">
          <h5 className="text-xs font-bold text-gray-700">댓글 감성 분포</h5>
          <div className="relative">
            <div style={{ height: 150 }}>
              <ResponsiveContainer width="100%" height="100%">
                <RechartsPieChart>
                  <Pie
                    data={[
                      { name: "긍정", value: analysis.posRate },
                      { name: "부정", value: 100 - analysis.posRate },
                    ]}
                    cx="50%" cy="50%"
                    innerRadius={44} outerRadius={65}
                    startAngle={90} endAngle={-270}
                    dataKey="value" paddingAngle={3}
                  >
                    <Cell fill="#4ade80" stroke="white" strokeWidth={2} />
                    <Cell fill="#f87171" stroke="white" strokeWidth={2} />
                  </Pie>
                </RechartsPieChart>
              </ResponsiveContainer>
            </div>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-2xl font-bold text-gray-900">{analysis.posRate}%</span>
              <span className="text-[10px] text-gray-400">긍정률</span>
            </div>
          </div>
          <div className="h-2 rounded-full bg-red-200 overflow-hidden">
            <div className="h-full bg-green-400 rounded-full transition-all duration-700" style={{ width: `${analysis.posRate}%` }} />
          </div>
          <div className="flex justify-between text-[11px] font-semibold">
            <span className="flex items-center gap-1 text-green-700">
              <Smile className="w-3.5 h-3.5" /> 긍정 {analysis.posRate}%
            </span>
            <span className="flex items-center gap-1 text-red-500">
              {100 - analysis.posRate}% 부정 <Frown className="w-3.5 h-3.5" />
            </span>
          </div>
          <p className="text-[10px] text-gray-400 text-center border-t border-gray-100 pt-2">
            분석 대상 {analysis.textTotal.toLocaleString()}건
          </p>
        </div>

        {/* 키워드 버블 차트 */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <h5 className="text-xs font-bold text-gray-700">
              주요 언급 키워드
              <span className="text-gray-400 font-normal ml-1">({analysis.keywords.length}개)</span>
            </h5>
            <div className="flex items-center gap-3 text-[10px] text-gray-500">
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-green-400 inline-block" />긍정
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-red-400 inline-block" />부정
              </span>
              <span className="text-gray-300">· 크기 = 언급 빈도</span>
            </div>
          </div>
          {analysis.keywords.length > 0
            ? <CommentKeywordBubbles keywords={analysis.keywords} />
            : <div className="flex items-center justify-center h-[120px] text-sm text-gray-400">추출된 키워드가 없습니다.</div>
          }
        </div>
      </div>

      {/* 댓글 목록 (토글) */}
      {analysis.comments.length > 0 && (
        <div>
          <button
            onClick={() => setShowComments(p => !p)}
            className="flex items-center gap-1.5 text-[11px] text-gray-500 hover:text-gray-700 mb-3"
          >
            {showComments
              ? <><ChevronUp className="w-3.5 h-3.5" /> 댓글 목록 접기</>
              : <><ChevronDown className="w-3.5 h-3.5" /> 댓글 목록 보기 ({analysis.comments.length}건)</>
            }
          </button>
          {showComments && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[320px] overflow-y-auto pr-1">
              {analysis.comments.map((c, i) => (
                <div key={i} className="bg-white border border-gray-100 hover:border-gray-200 rounded-xl p-4 flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {c.author && <span className="text-[10px] font-medium text-gray-500">{c.author}</span>}
                      {c.date && <span className="text-[10px] font-mono text-gray-400">{c.date}</span>}
                    </div>
                    <span className={cn("text-[10px] px-1.5 py-0.5 rounded-full font-medium",
                      c.sentiment === "positive" ? "bg-green-50 text-green-600" : "bg-red-50 text-red-500"
                    )}>
                      {c.sentiment === "positive" ? "😊 긍정" : "😞 부정"}
                    </span>
                  </div>
                  <p className="text-xs text-gray-800 leading-snug">{c.text}</p>
                  <div className="flex flex-wrap gap-1 pt-2 border-t border-gray-50">
                    {c.keywords.map((kw, j) => (
                      <span key={j} className={cn("text-[10px] px-2 py-0.5 rounded-full font-medium",
                        c.sentiment === "positive" ? "bg-green-50 text-green-600" : "bg-red-50 text-red-500"
                      )}>#{kw}</span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </GlassCard>
  );
}

// ── 날짜 포맷 헬퍼 ──────────────────────────────────────────────
function formatDateLabel(dateStr: string, viewMode: ViewMode): string {
  try {
    if (viewMode === "monthly") {
      const [year, month] = dateStr.split("-");
      return `${year}년 ${month}월`;
    }
    if (viewMode === "weekly") {
      return `${dateStr} 주차`;
    }
  } catch {}
  return dateStr;
}

// ── 그루핑 ───────────────────────────────────────────────────
function groupDigitalKpis(
  data: any[],
  viewMode: ViewMode,
  filterAgenda: string,
  filterDevice: string,
  filterMedium: string = "none",
  filterMediumDetail: string = "none",
  dateRange: { from: Date | undefined; to?: Date | undefined } | null = null
) {
  const valid = data.filter(r => {
    const dValid = r.date && r.date !== "1970-01-01" && VALID_DATE_RE.test(r.date);
    if (!dValid) return false;
    if (filterAgenda !== "all" && r.agenda !== filterAgenda) return false;
    if (filterDevice !== "all" && r.device !== filterDevice) return false;
    if (filterMedium !== "none" && filterMedium !== "all" && r.medium !== filterMedium) return false;
    if (filterMediumDetail !== "none" && filterMediumDetail !== "all" && (r.mediumDetail || "-") !== filterMediumDetail) return false;
    
    if (dateRange?.from || dateRange?.to) {
      const rowDate = new Date(r.date);
      if (dateRange.from && rowDate < dateRange.from) return false;
      if (dateRange.to && rowDate > dateRange.to) return false;
    }
    return true;
  });

  const dateGroups = new Map<string, any>();

  for (const row of valid) {
    const extra = parseExtra(row.extraData);
    let key = row.date;
    try {
      if (viewMode === "weekly")  key = format(startOfWeek(parseISO(row.date), { weekStartsOn: 1 }), "yyyy-MM-dd");
      else if (viewMode === "monthly") key = row.date.substring(0, 7);
      else if (viewMode === "total")   key = "전체";
    } catch {}

    if (!dateGroups.has(key)) {
      dateGroups.set(key, {
        isSubtotal: true,
        dateLabel: formatDateLabel(key, viewMode),
        medium: "합계",
        mediumDetail: "-",
        spend: 0, impressions: 0, views: 0, clicks: 0,
        conversions: 0, conversionRevenue: 0,
        signupCorporate: 0, signupPersonal: 0, leadsCollected: 0,
        extra: {} as Record<string, number>,
        itemsMap: new Map<string, any>()
      });
    }

    const dateGroup = dateGroups.get(key)!;
    
    // Subtotal 누적
    dateGroup.spend += row.spend || 0;
    dateGroup.impressions += row.impressions || 0;
    dateGroup.views += row.views || 0;
    dateGroup.clicks += row.clicks || 0;
    dateGroup.conversions += row.conversions || 0;
    dateGroup.conversionRevenue += row.conversionRevenue || 0;
    dateGroup.signupCorporate += row.signupCorporate || 0;
    dateGroup.signupPersonal += row.signupPersonal || 0;
    dateGroup.leadsCollected += row.leadsCollected || 0;
    for (const [k, v] of Object.entries(extra)) {
      dateGroup.extra[k] = (dateGroup.extra[k] || 0) + (v as number);
    }

    // 개별 항목 누적 (필터 조건에 따라 묶는 기준 변경)
    const groupByDetail = filterMediumDetail !== "none";
    const detailKey = groupByDetail ? `${row.medium}_${row.mediumDetail || "-"}` : row.medium;
    if (!dateGroup.itemsMap.has(detailKey)) {
      dateGroup.itemsMap.set(detailKey, {
        isSubtotal: false,
        dateLabel: formatDateLabel(key, viewMode),
        medium: row.medium,
        mediumDetail: groupByDetail ? (row.mediumDetail || "-") : "-",
        spend: 0, impressions: 0, views: 0, clicks: 0,
        conversions: 0, conversionRevenue: 0,
        signupCorporate: 0, signupPersonal: 0, leadsCollected: 0,
        extra: {} as Record<string, number>,
      });
    }

    const item = dateGroup.itemsMap.get(detailKey)!;
    item.spend += row.spend || 0;
    item.impressions += row.impressions || 0;
    item.views += row.views || 0;
    item.clicks += row.clicks || 0;
    item.conversions += row.conversions || 0;
    item.conversionRevenue += row.conversionRevenue || 0;
    item.signupCorporate += row.signupCorporate || 0;
    item.signupPersonal += row.signupPersonal || 0;
    item.leadsCollected += row.leadsCollected || 0;
    for (const [k, v] of Object.entries(extra)) {
      item.extra[k] = (item.extra[k] || 0) + (v as number);
    }
  }

  const flatResult: any[] = [];
  const sortedDates = Array.from(dateGroups.keys()).sort((a, b) => a.localeCompare(b));

  // 표시 로직 플래그
  const showSubtotal = filterMedium === "none" || filterMedium === "all";
  const showItems = filterMedium !== "none";

  for (const dKey of sortedDates) {
    const p = dateGroups.get(dKey)!;
    p.cpv = p.views > 0 ? Math.round(p.spend / p.views) : 0;
    p.ctr = p.impressions > 0 ? Number(((p.clicks / p.impressions) * 100).toFixed(2)) : 0;
    p.vtr = p.impressions > 0 ? Number(((p.views / p.impressions) * 100).toFixed(2)) : 0;
    p.roas = p.spend > 0 ? Number(((p.conversionRevenue / p.spend) * 100).toFixed(1)) : 0;
    recalcRatioExtra(p); // Task 5: 합산된 CPM 등 비율 지표 재계산

    const items = Array.from(p.itemsMap.values()) as any[];
    items.forEach((item: any) => {
      item.cpv = item.views > 0 ? Math.round(item.spend / item.views) : 0;
      item.ctr = item.impressions > 0 ? Number(((item.clicks / item.impressions) * 100).toFixed(2)) : 0;
      item.vtr = item.impressions > 0 ? Number(((item.views / item.impressions) * 100).toFixed(2)) : 0;
      item.roas = item.spend > 0 ? Number(((item.conversionRevenue / item.spend) * 100).toFixed(1)) : 0;
      recalcRatioExtra(item); // Task 5: 개별 항목도 재계산
    });
    items.sort((a, b) => b.spend - a.spend); // 광고비 순 정렬

    if (showSubtotal) {
      flatResult.push(p);
    }
    if (showItems) {
      flatResult.push(...items);
    }
  }

  return flatResult;
}

// 추가 컬럼 차트 색상 팔레트
const EXTRA_COL_COLORS = [
  "#0EA5E9","#F97316","#A855F7","#22C55E",
  "#EF4444","#EAB308","#06B6D4","#84CC16",
  "#F43F5E","#3B82F6","#14B8A6","#E879F9",
];

// 차트에서 제외할 extra 컬럼 이름 목록
// (기본 지표와 중복되거나, 단가 섹션 전용이거나, 텍스트형 컬럼)
const EXCLUDED_EXTRA_CHART_COLS = new Set([
  "CTR","VTR","CPM","CPV","CPC","ROAS",
  "ctr","vtr","cpm","cpv","cpc","roas",
  "소재","상품",
]);

// ── 차트 전용 데이터 추출 (viewMode 연동) ─────────────────────────────
function getChartData(
  data: any[],
  filterAgenda: string = "all",
  dateRange: { from: Date | undefined; to?: Date | undefined } | null = null,
  chartViewMode: ViewMode = "daily"
) {
  const valid = data.filter(r => {
    const dValid = r.date && r.date !== "1970-01-01" && VALID_DATE_RE.test(r.date);
    if (!dValid) return false;
    if (filterAgenda !== "all" && r.agenda !== filterAgenda) return false;

    if (dateRange?.from || dateRange?.to) {
      const rowDate = new Date(r.date);
      if (dateRange.from && rowDate < dateRange.from) return false;
      if (dateRange.to && rowDate > dateRange.to) return false;
    }
    return true;
  });

  const dateGroups = new Map<string, any>();
  for (const row of valid) {
    const extra = parseExtra(row.extraData);
    // viewMode에 따라 집계 키 결정 (total → 월별로 표시)
    let key = row.date;
    try {
      if (chartViewMode === "weekly")
        key = format(startOfWeek(parseISO(row.date), { weekStartsOn: 1 }), "yyyy-MM-dd");
      else if (chartViewMode === "monthly" || chartViewMode === "total")
        key = row.date.substring(0, 7);
    } catch {}
    if (!dateGroups.has(key)) {
      // viewMode별 표시용 레이블 생성
      let displayLabel = key;
      try {
        if (chartViewMode === "daily" && key.length >= 10)
          displayLabel = key.substring(5).replace('-', '/');         // "2026-05-01" → "05/01"
        else if (chartViewMode === "weekly" && key.length >= 10)
          displayLabel = key.substring(5).replace('-', '/') + " 주"; // "2026-05-05" → "05/05 주"
        else if ((chartViewMode === "monthly" || chartViewMode === "total") && key.length >= 7)
          displayLabel = key.substring(2, 4) + "년 " + key.substring(5) + "월"; // "2026-05" → "26년 05월"
      } catch {}
      dateGroups.set(key, {
        dateLabel: displayLabel,
        spend: 0, impressions: 0, views: 0, clicks: 0, conversions: 0, conversionRevenue: 0,
        extra: {} as Record<string, number>,
      });
    }
    const g = dateGroups.get(key)!;
    g.spend += row.spend || 0;
    g.impressions += row.impressions || 0;
    g.views += row.views || 0;
    g.clicks += row.clicks || 0;
    g.conversions += row.conversions || 0;
    g.conversionRevenue += row.conversionRevenue || 0;
    for (const [k, v] of Object.entries(extra)) {
      g.extra[k] = (g.extra[k] || 0) + (v as number);
    }
  }

  const result = Array.from(dateGroups.values()).sort((a, b) => a.dateLabel.localeCompare(b.dateLabel));
  result.forEach(r => {
    r.cpv  = r.views > 0       ? Math.round(r.spend / r.views) : 0;
    r.ctr  = r.impressions > 0 ? Number(((r.clicks / r.impressions) * 100).toFixed(2)) : 0;
    r.vtr  = r.impressions > 0 ? Number(((r.views  / r.impressions) * 100).toFixed(2)) : 0;
    r.roas = r.spend > 0       ? Number(((r.conversionRevenue / r.spend) * 100).toFixed(1)) : 0;
    // Task 2: CPM / CPC 계산값 (null = 데이터 없음 → 툴팁에서 "-" 처리)
    r.cpm_calc = r.impressions > 0 ? Math.round((r.spend / r.impressions) * 1000) : null;
    r.cpv_calc = r.views > 0       ? Math.round(r.spend / r.views) : null;
    r.cpc_calc = r.clicks > 0      ? Math.round(r.spend / r.clicks) : null;
    recalcRatioExtra(r); // Task 5: extra 비율 지표 재계산
  });
  return result;
}

function groupViral(data: any[], viewMode: ViewMode) {
  return data.map(row => {
    let key = row.date || "";
    try {
      if (viewMode === "weekly")  key = format(startOfWeek(parseISO(row.date), { weekStartsOn: 1 }), "yyyy-MM-dd");
      else if (viewMode === "monthly") key = row.date.substring(0, 7);
    } catch {}
    return { ...row, dateLabel: key };
  }).sort((a, b) => (a.date || "").localeCompare(b.date || ""));
}



// ── 요약 카드 컴포넌트 ────────────────────────────────────────
function StatCard({
  label, value, sub, accent, kpiInfo, onKpiEdit, isHighlight
}: {
  label: string; value: string; sub?: string; accent?: boolean;
  kpiInfo?: { target: number | string; rate?: number; isBudget?: boolean };
  onKpiEdit?: () => void;
  isHighlight?: boolean;
}) {
  const bgColor = accent !== false ? "#1A1A1A" : "#ffffff";
  const textColor = accent !== false ? "text-white" : "text-gray-900";
  const subTextColor = accent !== false ? "text-white/60" : "text-gray-400";

  return (
    <div className={`rounded-xl p-5 flex flex-col gap-2 border cursor-pointer transition-all hover:shadow-lg`}
      style={{ backgroundColor: bgColor, borderColor: isHighlight ? "#DC2626" : (accent !== false ? "#1A1A1A" : "#E5E7EB") }}
      onClick={onKpiEdit}>
      <span className={`text-xs font-medium ${accent !== false ? "text-white/70" : "text-gray-400"}`}>{label}</span>
      <span className={`text-2xl font-bold tracking-tight ${textColor}`}>{value}</span>
      {sub && <span className={`text-xs ${subTextColor}`}>{sub}</span>}
      {kpiInfo && (
        <div className="flex flex-col gap-2 pt-2 border-t border-white/10">
          <div className="flex items-center justify-between">
            <span className={`text-[11px] ${subTextColor}`}>
              {kpiInfo.isBudget ? `예산 ${kpiInfo.target}` : `목표 ${kpiInfo.target}`}
            </span>
            {kpiInfo.rate !== undefined && (
              <span className={`text-[11px] font-medium ${kpiInfo.rate >= 100 ? "text-green-400" : "text-gray-400"}`}>
                {kpiInfo.rate.toFixed(1)}%
              </span>
            )}
          </div>
          {kpiInfo.rate !== undefined && (
            <div className="w-full bg-gray-700 rounded-full h-1.5 overflow-hidden">
              <div
                className={`h-full transition-all ${kpiInfo.rate >= 100 ? "bg-green-400" : "bg-fursys-red"}`}
                style={{ width: `${Math.min(kpiInfo.rate, 100)}%` }}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── 댓글 모달 ─────────────────────────────────────────────────
function CommentsModal({
  title, commentsList, isLoading, errorMsg, onClose, onFetch,
}: {
  title: string; commentsList: any[]; isLoading: boolean;
  errorMsg?: string; onClose: () => void; onFetch: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-[560px] max-h-[80vh] flex flex-col border border-gray-100">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h3 className="font-bold text-gray-900 text-sm flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-fursys-red" /> 댓글 — {title}
          </h3>
          <button onClick={onClose}><X className="w-4 h-4 text-gray-400 hover:text-gray-700" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-5">
          {isLoading ? (
            <div className="flex flex-col items-center gap-3 py-12">
              <RefreshCw className="w-6 h-6 animate-spin text-fursys-red" />
              <p className="text-sm text-gray-400">댓글을 불러오는 중...</p>
            </div>
          ) : errorMsg ? (
            <div className="py-10 text-center">
              <p className="text-sm text-gray-400 mb-4">{errorMsg}</p>
              <Button size="sm" onClick={onFetch} className="bg-fursys-red hover:bg-red-700 text-white">
                다시 불러오기
              </Button>
            </div>
          ) : commentsList.length === 0 ? (
            <div className="py-10 text-center">
              <p className="text-sm text-gray-400 mb-4">저장된 댓글이 없습니다.</p>
              <Button size="sm" onClick={onFetch} className="bg-fursys-red hover:bg-red-700 text-white">
                댓글 수집하기
              </Button>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {commentsList.map((c, i) => (
                <div key={i} className="border border-gray-100 rounded-lg p-3 bg-gray-50">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-semibold text-gray-700">{c.author || "익명"}</span>
                    <div className="flex items-center gap-2 text-[11px] text-gray-400">
                      {c.likes !== undefined && <span>👍 {c.likes}</span>}
                      {c.date && <span>{c.date}</span>}
                    </div>
                  </div>
                  <p className="text-sm text-gray-700 leading-relaxed">{c.text}</p>
                </div>
              ))}
              <Button size="sm" variant="outline" onClick={onFetch} className="mt-2 self-center">
                <RefreshCw className="w-3 h-3 mr-1" /> 새로고침
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
export default function AwarenessPage() {
  const params = useParams();
  const campaignId = params.id as Id<"campaigns">;
  const { isAdmin } = useAuth();
  const { refreshTrigger } = useRefresh();
  const [lastRefresh, setLastRefresh] = useState(0);

  const digitalKpis   = useQuery(api.awareness.getDigitalKpis,   { campaignId }) ?? [];
  const viralContents = useQuery(api.awareness.getViralContents,  { campaignId }) ?? [];
  const youtubeVideos = useQuery(api.awareness.getYouTubeVideos,  { campaignId }) ?? [];
  const campaign      = useQuery(api.campaigns.getCampaignById,   { id: campaignId }) ?? null;

  const syncDigitalKpis   = useMutation(api.awareness.syncDigitalKpis);
  const clearDigitalKpis  = useMutation(api.awareness.clearDigitalKpis);
  const syncViralContents = useMutation(api.awareness.syncViralContents);
  const clearViralContents = useMutation(api.awareness.clearViralContents);
  const updateViralRow    = useMutation(api.awareness.updateViralRow);
  const deleteViralRow    = useMutation(api.awareness.deleteViralRow);
  const addYouTubeVideo    = useMutation(api.awareness.addYouTubeVideo);
  const deleteYouTubeVideo = useMutation(api.awareness.deleteYouTubeVideo);
  const updateYouTubeVideo = useMutation(api.awareness.updateYouTubeVideo);
  const updateCampaign     = useMutation(api.campaigns.updateCampaignSettings);

  // ── 탭·뷰 ────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<ActiveTab>("media");
  const [viewMode,  setViewMode]  = useState<ViewMode>("daily");
  const [showCumulative, setShowCumulative] = useState(true);

  // ── 테이블 컬럼 설정 저장 키 ────────────────────────────────
  const TABLE_COLS_LS_KEY = `awareness-table-cols-${campaignId}`;

  // ── 누적 성과 항목 선택 ──────────────────────────────────────
  const CUMULATIVE_LS_KEY = `awareness-cumulative-${campaignId}`;
  const DEFAULT_VISIBLE_ITEMS: Record<string, boolean> = {
    spend: true, impressions: true, views: true, clicks: true, cpv: true, ctr: true,
    conversions: true, conversionRevenue: true, roas: true,
    signupCorporate: false, signupPersonal: false, leadsCollected: false,
  };
  const DEFAULT_ITEM_ORDER = [
    "spend", "impressions", "views", "clicks", "cpv", "ctr",
    "conversions", "conversionRevenue", "roas", "signupCorporate", "signupPersonal", "leadsCollected"
  ];

  const [cumulativeVisibleItems, setCumulativeVisibleItems] = useState<Record<string, boolean>>(DEFAULT_VISIBLE_ITEMS);
  const [cumulativeSaved, setCumulativeSaved] = useState(false);
  const [cumulativeItemOrder, setCumulativeItemOrder] = useState<string[]>(DEFAULT_ITEM_ORDER);
  const [showCumulativeSettings, setShowCumulativeSettings] = useState(false);

  // localStorage 초기 로드 (마운트 1회) — 저장은 하지 않음
  useEffect(() => {
    try {
      // 누적 성과 설정
      const saved = localStorage.getItem(CUMULATIVE_LS_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.visibleItems) setCumulativeVisibleItems(parsed.visibleItems);
        if (parsed.itemOrder)    setCumulativeItemOrder(parsed.itemOrder);
      }
      // 테이블 컬럼 설정 (관리자 저장 → 뷰어도 동일하게 적용)
      const savedTable = localStorage.getItem(TABLE_COLS_LS_KEY);
      if (savedTable) {
        const pt = JSON.parse(savedTable);
        if (pt.visibleCols)  setVisibleCols(pt.visibleCols);
        if (pt.mediaColOrder) setMediaColOrder(pt.mediaColOrder);
      }
    } catch {}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaignId]);

  // 뷰어 노출 항목 초기 로드 (설정A: viewerItems, 설정B: viewerDefaults)
  useEffect(() => {
    try {
      const savedItems   = localStorage.getItem(VIEWER_ITEMS_LS_KEY);
      const savedDefault = localStorage.getItem(VIEWER_DEFAULT_LS_KEY);
      const items: Record<string, boolean>    = savedItems   ? JSON.parse(savedItems)   : { ...DEFAULT_VIEWER_PRESET };
      const defaults: Record<string, boolean> = savedDefault ? JSON.parse(savedDefault) : { ...DEFAULT_VIEWER_PRESET };
      setViewerItems(items);
      setViewerDefaults(defaults);
      setDraftItems(items);
      setDraftDefaults(defaults);
      // chartMetrics 초기값 = 기본 체크(defaults) 기준 (extra_ 유지)
      setChartMetrics(prev => {
        const next: Record<string, boolean> = { ...defaults };
        for (const [k, v] of Object.entries(prev)) {
          if (k.startsWith("extra_")) next[k] = v;
        }
        return next;
      });
    } catch {}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 테이블 컬럼 설정 저장 (관리자 → 뷰어 공유)
  const [tableColSaved, setTableColSaved] = useState(false);
  const saveTableColSettings = () => {
    try {
      localStorage.setItem(TABLE_COLS_LS_KEY, JSON.stringify({ visibleCols, mediaColOrder }));
      setTableColSaved(true);
      setTimeout(() => setTableColSaved(false), 2000);
    } catch {}
  };

  // 사용자 상호작용 시에만 저장 (effect 타이밍 문제 회피)
  const persistCumulative = (
    visibleItems: Record<string, boolean>,
    itemOrder: string[]
  ) => {
    try {
      localStorage.setItem(CUMULATIVE_LS_KEY, JSON.stringify({ visibleItems, itemOrder }));
    } catch {}
  };

  const [showItemOrder, setShowItemOrder] = useState(false);
  const [draggedCumulativeItem, setDraggedCumulativeItem] = useState<string | null>(null);

  // ── 매디어 퍼포먼스 컬럼 순서 편집 ──────────────────────────
  const [mediaColOrder, setMediaColOrder] = useState<string[]>([
    "spend", "impressions", "views", "clicks", "cpv", "ctrVtr",
    "conversions", "conversionRevenue", "roas", "signupCorporate", "signupPersonal", "leadsCollected"
  ]);
  const [showMediaColOrder, setShowMediaColOrder] = useState(false);
  const [draggedMediaCol, setDraggedMediaCol] = useState<string | null>(null);

  // ── 컬럼 설정 ────────────────────────────────────────────────
  const [visibleCols,    setVisibleCols]    = useState<Record<string, boolean>>(DEFAULT_VISIBLE);
  const [extraColLabels, setExtraColLabels] = useState<string[]>([]); // 시트에서 감지된 추가 컬럼
  const [showColSettings, setShowColSettings] = useState(false);

  // ── 아코디언 접기/펼치기 상태 ──────────────────────────────
  const [expandedMediums, setExpandedMediums] = useState<Record<string, boolean>>({});

  // ── 다차원 필터 상태 ──────────────────────────────────────────
  const [filterAgenda, setFilterAgenda] = useState("all");
  const [filterDevice, setFilterDevice] = useState("all");
  const [filterMedium, setFilterMedium] = useState("none");
  const [filterMediumDetail, setFilterMediumDetail] = useState("none");
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
  // ── 차트 항목 체크 상태 ──────────────────────────────────────────
  const VIEWER_ITEMS_LS_KEY   = "dashboard_media_viewer_items";   // 설정A: 뷰어 선택 가능 항목
  const VIEWER_DEFAULT_LS_KEY = "dashboard_media_viewer_default"; // 설정B: 기본 체크 항목
  const ALL_CHART_ITEMS = [
    { key: "impressions", label: "노출수" },
    { key: "views",       label: "조회수" },
    { key: "clicks",      label: "클릭수" },
    { key: "conversions", label: "전환수" },
    { key: "spend",       label: "집행비용" },
    { key: "vtr",         label: "VTR" },
    { key: "ctr",         label: "CTR" },
    { key: "roas",        label: "ROAS" },
  ] as const;
  const DEFAULT_VIEWER_PRESET: Record<string, boolean> = {
    impressions: true, views: true, clicks: true, spend: true,
  };
  const [chartMetrics, setChartMetrics] = useState<Record<string, boolean>>({
    impressions: true, views: true, clicks: true, spend: true, ctr: true, vtr: true,
  });
  // 설정A: 뷰어에게 노출할 항목 목록
  const [viewerItems, setViewerItems]       = useState<Record<string, boolean>>(DEFAULT_VIEWER_PRESET);
  // 설정B: 뷰어 접속 시 기본 체크 항목
  const [viewerDefaults, setViewerDefaults] = useState<Record<string, boolean>>(DEFAULT_VIEWER_PRESET);
  const [showItemEditPanel, setShowItemEditPanel] = useState(false);
  const [draftItems, setDraftItems]     = useState<Record<string, boolean>>(DEFAULT_VIEWER_PRESET);
  const [draftDefaults, setDraftDefaults] = useState<Record<string, boolean>>(DEFAULT_VIEWER_PRESET);
  const [itemEditSaved, setItemEditSaved] = useState(false);
  // CPM / CPV / CPC 별도 차트
  const [cpcMetrics, setCpcMetrics] = useState({ cpm: true, cpv: true, cpc: true });

  // ── KPI 카드 ─────────────────────────────────────────────────
  const [showKpiEdit,  setShowKpiEdit]  = useState(false);
  const [editingKpi,   setEditingKpi]   = useState<{ label: string; target: number; idx: number } | null>(null);
  const [kpiTargetVal, setKpiTargetVal] = useState("");

  // ── 업로드 ───────────────────────────────────────────────────
  const [showConfig, setShowConfig] = useState<{ type: "digital" | "viral"; source: "sheet" | "excel" } | null>(null);
  const [sheetUrl,   setSheetUrl]   = useState("");
  const [isSyncing,  setIsSyncing]  = useState(false);
  const [syncStatus, setSyncStatus] = useState("");

  // 자동 재동기화용 localStorage 키 (campaignId 기반)
  const DIGITAL_SHEET_LS_KEY = `awareness-digital-url-${campaignId}`;

  // ── 바이럴 매핑 ──────────────────────────────────────────────
  const [previewData,    setPreviewData]    = useState<any[][] | null>(null);
  const [mapping,        setMapping]        = useState<Record<string, string>>({});
  const [headerRowIdx,   setHeaderRowIdx]   = useState(0);
  const [isGuessingCols, setIsGuessingCols] = useState(false);

  // ── 바이럴 필터·편집 ─────────────────────────────────────────
  const [filterMonth,    setFilterMonth]    = useState("all");
  const [filterPlatform, setFilterPlatform] = useState("all");
  const [editingViralId, setEditingViralId] = useState<string | null>(null);
  const [editViralForm,  setEditViralForm]  = useState<any>({});
  const [isFetchingUrl,  setIsFetchingUrl]  = useState<string | null>(null);

  // ── 유튜브 ───────────────────────────────────────────────────
  const [newYoutubeUrl,   setNewYoutubeUrl]   = useState("");
  const [isAddingYoutube, setIsAddingYoutube] = useState(false);
  const [autoFetchingIds, setAutoFetchingIds] = useState<Set<string>>(new Set());

  // ── 댓글 모달 ────────────────────────────────────────────────
  const [commentModal, setCommentModal] = useState<{
    type: "yt" | "viral"; id: string; title: string;
    url: string; commentsList: any[]; isLoading: boolean; error?: string;
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── 전역 새로고침 감지 → 매체 시트 + YouTube + 바이럴 일괄 업데이트 ────
  useEffect(() => {
    if (refreshTrigger !== lastRefresh) {
      setLastRefresh(refreshTrigger);

      // 1) 매체 퍼포먼스 구글 시트 재동기화 (Convex URL 우선 → localStorage 폴백)
      const convexUrl = campaign?.digitalSheetUrl ?? "";
      const localUrl  = (() => { try { return localStorage.getItem(DIGITAL_SHEET_LS_KEY) ?? ""; } catch { return ""; } })();
      const savedUrl  = convexUrl || localUrl;
      if (savedUrl) {
        setSyncStatus("✨ 구글 시트에서 매체 데이터 새로고침 중...");
        fetch("/api/fetch-raw-sheet", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sheetUrl: savedUrl }),
        })
          .then(r => r.json())
          .then(res => { if (res.success && res.data) return runDigitalAI(res.data); setSyncStatus(""); })
          .catch(() => { setSyncStatus(""); });
      }

      // 2) 캠페인 광고 영상 — YouTube 통계 일괄 업데이트
      if (youtubeVideos.length > 0) {
        (async () => {
          for (const video of youtubeVideos) {
            if (!video.youtubeId || video.youtubeId === "-") continue;
            try {
              const ytUrl = `https://www.youtube.com/watch?v=${video.youtubeId}`;
              const res = await fetch("/api/fetch-sns-stats", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ url: ytUrl }),
              });
              const data = await res.json();
              if (data.success && data.stats) {
                await updateYouTubeVideo({
                  videoId: video._id,
                  updates: {
                    views:        data.stats.views    ?? video.views,
                    likes:        data.stats.likes    ?? video.likes,
                    comments:     data.stats.comments ?? video.comments,
                    title:        data.stats.title && data.stats.title !== "-" ? data.stats.title : undefined,
                    thumbnailUrl: data.stats.thumbnailUrl,
                  },
                });
              }
            } catch {}
          }
        })();
      }

      // 3) 바이럴 컨텐츠 성과 — URL 접속 통계 일괄 업데이트
      if (viralContents.length > 0) {
        (async () => {
          for (const row of viralContents) {
            if (!row.url) continue;
            try {
              const res = await fetch("/api/fetch-sns-stats", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ url: row.url }),
              });
              const data = await res.json();
              if (data.success && data.stats) {
                await updateViralRow({
                  viralId: row._id,
                  updates: {
                    views:        data.stats.views,
                    likes:        data.stats.likes,
                    comments:     data.stats.comments,
                    title:        data.stats.title && data.stats.title !== "-" ? data.stats.title : undefined,
                    thumbnailUrl: data.stats.thumbnailUrl,
                    date:         data.stats.date,
                  },
                });
              }
            } catch {}
          }
        })();
      }

      if (!savedUrl && youtubeVideos.length === 0 && viralContents.length === 0) {
        setSyncStatus("✨ 데이터 새로고침 중...");
        setTimeout(() => setSyncStatus(""), 2000);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshTrigger, lastRefresh]);

  // ── AI 매체 분석 ─────────────────────────────────────────────
  const runDigitalAI = async (rawData: any[][]) => {
    setIsSyncing(true);
    setSyncStatus("AI가 매체 데이터를 분석 중...");
    try {
      const payload = rawData.filter(r => r.some(c => c !== ""));
      const res = await fetch("/api/parse-sheet-ai", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: payload, type: "digital" }),
      });
      const parsed = await res.json();
      if (!res.ok) throw new Error(parsed.error || "AI 분석 실패");
      if (!parsed.rows) throw new Error("AI 응답 형식 오류");

      const totalParsed = (parsed.rows as any[]).length;
      const rows = (parsed.rows as any[])
        .map((r: any) => {
          const date = processDate(r.date) || "";
          if (!date || date === "1970-01-01" || !VALID_DATE_RE.test(date)) return null;
          return {
            date,
            medium: r.medium || "-",
            mediumDetail: r.mediumDetail || undefined,
            agenda: r.agenda || undefined,
            device: r.device || undefined,
            spend: processNumber(r.spend),
            impressions: processNumber(r.impressions),
            views: processNumber(r.views),
            clicks: processNumber(r.clicks),
            cpv: processNumber(r.views) > 0 ? processNumber(r.spend) / processNumber(r.views) : 0,
            ctr: processNumber(r.impressions) > 0 ? (processNumber(r.clicks) / processNumber(r.impressions)) * 100 : 0,
            vtr: processNumber(r.impressions) > 0 ? (processNumber(r.views) / processNumber(r.impressions)) * 100 : 0,
            conversions: r.conversions !== undefined ? Number(r.conversions) : undefined,
            conversionRevenue: r.conversionRevenue !== undefined ? Number(r.conversionRevenue) : undefined,
            signupCorporate: r.signupCorporate !== undefined ? Number(r.signupCorporate) : undefined,
            signupPersonal: r.signupPersonal !== undefined ? Number(r.signupPersonal) : undefined,
            leadsCollected: r.leadsCollected !== undefined ? Number(r.leadsCollected) : undefined,
            recordedAt: Date.now(),
            // extraData의 키가 한글일 수 있으므로 JSON 문자열로 직렬화
            extraData: r.extraData && Object.keys(r.extraData).length > 0
              ? JSON.stringify(r.extraData)
              : undefined,
          };
        })
        .filter(Boolean);

      // 안전 가드: 유효 행 0개이면 기존 데이터를 삭제하지 않고 오류 처리
      if (rows.length === 0) {
        throw new Error(
          `유효한 날짜 데이터가 없습니다 (전체 ${totalParsed}행 파싱됨).\n` +
          `시트의 날짜 컬럼(일자/날짜/date)이 올바른 형식(YYYY-MM-DD 또는 YYYY/MM/DD)인지 확인해주세요.`
        );
      }

      await syncDigitalKpis({ campaignId, rows: rows as any[] });

      // 추가 컬럼 레이블 저장
      if (parsed.extraColDefs?.length) {
        const newLabels = (parsed.extraColDefs as any[]).map((c: any) => c.label).filter(Boolean);
        setExtraColLabels(newLabels);
        setVisibleCols(v => {
          const next = { ...v };
          newLabels.forEach((l: string) => { if (!(l in next)) next[l] = true; });
          return next;
        });
        // 차트에서도 추가 컬럼을 기본 활성화
        setChartMetrics(prev => {
          const next = { ...prev };
          newLabels.forEach((l: string) => { if (!(`extra_${l}` in next)) next[`extra_${l}`] = true; });
          return next;
        });
      }

      setSyncStatus(`✅ ${rows.length}개 행 동기화 완료!`);
      setTimeout(() => setSyncStatus(""), 3000);
      setShowConfig(null);
      setShowColSettings(true);
    } catch (e: any) {
      alert("AI 매체 분석 오류: " + e.message);
      setSyncStatus("");
    } finally { setIsSyncing(false); }
  };

  // ── 바이럴 AI 컬럼 추론 ──────────────────────────────────────
  const openViralMapper = async (rawData: any[][]) => {
    setPreviewData(rawData); setMapping({}); setHeaderRowIdx(0); setIsGuessingCols(true); setShowConfig(null);
    try {
      const res = await fetch("/api/parse-sheet-ai", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: rawData.slice(0, 15), type: "viral", mode: "guess_columns" }),
      });
      const parsed = await res.json();
      if (parsed.headerRowIndex !== undefined) setHeaderRowIdx(parsed.headerRowIndex);
      if (parsed.mapping) {
        const sm: Record<string, string> = {};
        Object.entries(parsed.mapping).forEach(([k, v]) => { if (v != null) sm[k] = String(v); });
        setMapping(sm);
      }
    } catch {}
    finally { setIsGuessingCols(false); }
  };

  // ── 구글 시트 동기화 ─────────────────────────────────────────
  // /api/fetch-raw-sheet → raw 2D 배열 반환 (AI 매체 분석용)
  // /api/fetch-sheet    → parseGanttSheetData 결과 (타임라인 전용) — 여기서는 사용하지 않음
  const handleSheetSync = async (type: "digital" | "viral") => {
    if (!sheetUrl) return alert("스프레드시트 주소를 입력해주세요.");
    // 자동 재동기화를 위해 디지털 시트 URL 저장 (Convex + localStorage)
    if (type === "digital" && campaign) {
      try { localStorage.setItem(DIGITAL_SHEET_LS_KEY, sheetUrl); } catch {}
      updateCampaign({ id: campaign._id, digitalSheetUrl: sheetUrl }).catch(() => {});
    }
    setIsSyncing(true);
    try {
      const res = await fetch("/api/fetch-raw-sheet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sheetUrl }),
      }).then(r => r.json());
      if (!res.success || !res.data) throw new Error(res.error || "데이터 없음");
      if (type === "digital") await runDigitalAI(res.data); else await openViralMapper(res.data);
    } catch (e: any) { alert("구글 시트 연동 에러: " + e.message); }
    finally { setIsSyncing(false); setSheetUrl(""); }
  };

  // ── 엑셀 업로드 ──────────────────────────────────────────────
  const handleExcelUpload = (e: React.ChangeEvent<HTMLInputElement>, type: "digital" | "viral") => {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const wb = xlsx.read(evt.target?.result, { type: "binary", cellText: false, cellDates: true });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const data = xlsx.utils.sheet_to_json(ws, { header: 1, raw: false, dateNF: "yyyy-mm-dd" }) as any[][];
        if (type === "digital") await runDigitalAI(data); else await openViralMapper(data);
      } catch (err: any) { alert("엑셀 파싱 에러: " + err.message); }
      finally { if (fileInputRef.current) fileInputRef.current.value = ""; }
    };
    reader.readAsBinaryString(file);
  };

  // ── 바이럴 매핑 확정 ─────────────────────────────────────────
  const handleConfirmMapping = async () => {
    if (!previewData) return;
    setIsSyncing(true);
    try {
      let lDate = "", lPlat = "-", lCreator = "-";
      const rows = previewData.slice(headerRowIdx + 1)
        .filter(row => Object.values(mapping).some(ci => { const v = row[parseInt(ci)]; return v !== undefined && v !== ""; }))
        .map(cols => {
          let date = mapping["date"] ? processDate(cols[parseInt(mapping["date"])]) : "";
          if (!date) date = lDate; else lDate = date;
          let platform = mapping["platform"] ? String(cols[parseInt(mapping["platform"])] || "").trim() : "";
          if (!platform || platform === "-") platform = lPlat; else lPlat = platform;
          const rawUrl = mapping["url"] ? String(cols[parseInt(mapping["url"])] || "").trim() : "";
          if (rawUrl.includes("youtube.com") || rawUrl.includes("youtu.be")) platform = "YouTube";
          else if (rawUrl.includes("instagram.com")) platform = "Instagram";
          else if (rawUrl.includes("blog.naver.com") || rawUrl.includes("naver.com")) platform = "Naver Blog";
          let creator = mapping["creator"] ? String(cols[parseInt(mapping["creator"])] || "").trim() : "";
          if (!creator || creator === "-") creator = lCreator; else lCreator = creator;
          return { date, platform: platform || "-", creator: creator || "-", title: "-", views: 0, likes: 0, comments: 0, url: rawUrl, thumbnailUrl: undefined };
        });

      setSyncStatus("URL 성과 데이터 실시간 수집 중...");
      const enriched = await Promise.all(rows.map(async row => {
        if (!row.url) return row;
        try {
          const res = await fetch("/api/fetch-sns-stats", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: row.url }) });
          const data = await res.json();
          if (data.success && data.stats) {
            row.views = data.stats.views !== undefined ? processNumber(data.stats.views) : 0;
            row.likes = data.stats.likes !== undefined ? processNumber(data.stats.likes) : 0;
            row.comments = data.stats.comments !== undefined ? processNumber(data.stats.comments) : 0;
            if (data.stats.title && data.stats.title !== "-") row.title = data.stats.title;
            if (data.stats.thumbnailUrl) row.thumbnailUrl = data.stats.thumbnailUrl;
            if (data.stats.date && !row.date) row.date = data.stats.date;
          }
        } catch {}
        return row;
      }));

      setSyncStatus("저장 중...");
      await syncViralContents({ campaignId, rows: enriched });
    } catch (e: any) { alert("동기화 실패: " + e.message); }
    finally { setIsSyncing(false); setPreviewData(null); setMapping({}); }
  };

  // ── 유튜브 추가 ──────────────────────────────────────────────
  const handleAddYoutube = async () => {
    if (!newYoutubeUrl) return;
    setIsAddingYoutube(true);
    try {
      const res = await fetch("/api/fetch-sns-stats", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: newYoutubeUrl }) });
      const data = await res.json();
      if (data.success && data.stats) {
        const idMatch = newYoutubeUrl.match(/(?:v=|youtu\.be\/|shorts\/)([^&?]+)/);
        await addYouTubeVideo({
          campaignId, youtubeId: idMatch ? idMatch[1] : "-",
          title: data.stats.title !== "-" ? data.stats.title : "제목 없음",
          thumbnailUrl: data.stats.thumbnailUrl || "",
          views: data.stats.views || 0, likes: data.stats.likes || 0, comments: data.stats.comments || 0,
          likeRate: 0, uploadDate: data.stats.date || new Date().toISOString().split("T")[0],
        });
        setNewYoutubeUrl("");
      } else alert(data.error || "수집 실패");
    } catch (e: any) { alert("오류: " + e.message); }
    finally { setIsAddingYoutube(false); }
  };

  const handleFetchSnsStats = async (rowId: string, url: string) => {
    if (!url) return alert("URL이 없습니다.");
    setIsFetchingUrl(rowId);
    try {
      const res = await fetch("/api/fetch-sns-stats", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url }) });
      const data = await res.json();
      if (data.success && data.stats) {
        await updateViralRow({ viralId: rowId as Id<"viralContents">, updates: { views: data.stats.views, likes: data.stats.likes, comments: data.stats.comments, title: data.stats.title !== "-" ? data.stats.title : undefined, thumbnailUrl: data.stats.thumbnailUrl, date: data.stats.date } });
      } else alert(data.error || "수집 실패");
    } catch (e: any) { alert("오류: " + e.message); }
    finally { setIsFetchingUrl(null); }
  };

  // ── 댓글 불러오기 (로컬 상태 + Convex 저장) ───
  const fetchComments = async (modalState?: typeof commentModal) => {
    const modal = modalState || commentModal;
    if (!modal) return;
    setCommentModal(prev => prev ? { ...prev, isLoading: true, error: undefined } : null);
    try {
      const res = await fetch("/api/fetch-comments", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: modal.url }),
      });
      const data = await res.json();
      if (data.commentsList !== undefined) {
        setCommentModal(prev => prev ? { ...prev, commentsList: data.commentsList, isLoading: false, error: data.error } : null);
        // 댓글을 Convex에 저장 (YouTube / 바이럴 공통)
        if (modal.type === "yt") {
          await updateYouTubeVideo({ videoId: modal.id as Id<"youtubeVideos">, updates: { commentsList: data.commentsList } });
        } else if (modal.type === "viral") {
          await updateViralRow({ viralId: modal.id as Id<"viralContents">, updates: { commentsList: data.commentsList } });
        }
      } else {
        setCommentModal(prev => prev ? { ...prev, isLoading: false, error: data.error || "수집 실패" } : null);
      }
    } catch (e: any) {
      setCommentModal(prev => prev ? { ...prev, isLoading: false, error: e.message } : null);
    }
  };

  // ── 댓글 자동 로드 (YouTube & 바이럴) ─────────────────────────
  useEffect(() => {
    if (commentModal && commentModal.commentsList.length === 0 && commentModal.isLoading && !commentModal.error) {
      const fetchAsync = async () => {
        setCommentModal(prev => prev ? { ...prev, isLoading: true, error: undefined } : null);
        try {
          const res = await fetch("/api/fetch-comments", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ url: commentModal.url }),
          });
          const data = await res.json();
          if (data.commentsList !== undefined) {
            setCommentModal(prev => prev ? { ...prev, commentsList: data.commentsList, isLoading: false, error: data.error } : null);
            if (commentModal.type === "yt") {
              await updateYouTubeVideo({ videoId: commentModal.id as Id<"youtubeVideos">, updates: { commentsList: data.commentsList } });
            } else if (commentModal.type === "viral") {
              await updateViralRow({ viralId: commentModal.id as Id<"viralContents">, updates: { commentsList: data.commentsList } });
            }
          } else {
            setCommentModal(prev => prev ? { ...prev, isLoading: false, error: data.error || "수집 실패" } : null);
          }
        } catch (e: any) {
          setCommentModal(prev => prev ? { ...prev, isLoading: false, error: e.message } : null);
        }
      };
      fetchAsync();
    }
  }, [commentModal?.id, commentModal?.url]);

  // ── 영상 탭 진입 시 댓글 자동 수집 ───────────────────────────
  useEffect(() => {
    if (activeTab !== "video" || youtubeVideos.length === 0) return;
    const unFetched = youtubeVideos.filter(
      (vid: any) => !vid.commentsList?.length && vid.youtubeId !== "-"
    );
    if (unFetched.length === 0) return;

    const fetchAll = async () => {
      for (const vid of unFetched) {
        setAutoFetchingIds(prev => new Set(prev).add(vid._id));
        try {
          const ctrl = new AbortController();
          const t = setTimeout(() => ctrl.abort(), 12000); // 12초 타임아웃
          const res = await fetch("/api/fetch-comments", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ url: `https://youtube.com/watch?v=${vid.youtubeId}` }),
            signal: ctrl.signal,
          });
          clearTimeout(t);
          const data = await res.json();
          if (data.commentsList?.length) {
            await updateYouTubeVideo({
              videoId: vid._id as Id<"youtubeVideos">,
              updates: { commentsList: data.commentsList },
            });
          }
        } catch {} // 타임아웃·네트워크 오류 무시
        setAutoFetchingIds(prev => { const s = new Set(prev); s.delete(vid._id); return s; });
      }
    };
    fetchAll();
  // youtubeVideos 길이 변경 or 탭 전환 시에만 재실행
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, youtubeVideos.length]);

  // ── 바이럴 탭 진입 시 댓글 자동 수집 ───────────────────────
  useEffect(() => {
    if (activeTab !== "viral" || viralContents.length === 0) return;
    const unFetched = (viralContents as any[]).filter(
      (v: any) => !v.commentsList?.length && v.url
    );
    if (unFetched.length === 0) return;

    const fetchAll = async () => {
      for (const row of unFetched) {
        setAutoFetchingIds(prev => new Set(prev).add(row._id));
        try {
          const ctrl = new AbortController();
          const t = setTimeout(() => ctrl.abort(), 12000); // 12초 타임아웃
          const res = await fetch("/api/fetch-comments", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ url: row.url }),
            signal: ctrl.signal,
          });
          clearTimeout(t);
          const data = await res.json();
          if (data.commentsList?.length) {
            await updateViralRow({
              viralId: row._id as Id<"viralContents">,
              updates: { commentsList: data.commentsList },
            });
          }
        } catch {} // 타임아웃·네트워크 오류 무시, 다음 항목으로 진행
        setAutoFetchingIds(prev => { const s = new Set(prev); s.delete(row._id); return s; });
      }
    };
    fetchAll();
  // 바이럴 컨텐츠 길이 변경 or 탭 전환 시에만 재실행
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, viralContents.length]);

  // ── KPI 저장 ─────────────────────────────────────────────────
  const saveKpiTarget = async () => {
    if (!editingKpi || !campaign) return;
    const targets = [...(campaign.kpiTargets || [])];
    const newTarget = { label: editingKpi.label, target: parseFloat(kpiTargetVal) || 0, current: 0, category: "awareness" };
    if (editingKpi.idx >= 0) targets[editingKpi.idx] = { ...targets[editingKpi.idx], target: newTarget.target };
    else targets.push(newTarget);
    await updateCampaign({ id: campaign._id, kpiTargets: targets });
    setEditingKpi(null); setKpiTargetVal("");
  };

  // ── 매핑 드롭다운 ────────────────────────────────────────────
  const numCols = previewData ? Math.max(...previewData.slice(0, 10).map(r => r.length), 0) : 0;
  const colSamples = Array.from({ length: numCols }).map((_, i) => {
    const s = previewData?.[headerRowIdx]?.[i];
    return s ? String(s).substring(0, 15) : "(빈값)";
  });
  const renderMappingSelect = (field: string, label: string, required = false) => {
    const detected = mapping[field] !== undefined;
    return (
      <div key={field} className={`flex flex-col gap-1 p-2 rounded border ${!detected && required ? "border-amber-500/40 bg-amber-500/5" : "border-gray-100 bg-gray-50"}`}>
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-gray-900/80">{label}</span>
          {detected ? <span className="text-[10px] bg-green-500/20 text-green-600 px-1.5 py-0.5 rounded">✓ 자동 감지</span>
                    : <span className="text-[10px] bg-gray-100 text-gray-400 px-1.5 py-0.5 rounded">{required ? "⚠ 필수" : "선택"}</span>}
        </div>
        <select value={mapping[field] ?? ""} onChange={e => setMapping({ ...mapping, [field]: e.target.value })}
          className="w-full bg-white text-gray-900 border border-gray-200 rounded p-1.5 text-xs outline-none">
          <option value="">-- 매핑 안 함 --</option>
          {Array.from({ length: numCols }).map((_, i) => (
            <option key={i} value={i}>{`${i + 1}열 [${String.fromCharCode(65 + i)}] — ${colSamples[i]}`}</option>
          ))}
        </select>
      </div>
    );
  };

  // ── 집계 ────────────────────────────────────────────────────
  // 고유 아젠다 및 디바이스 목록 추출 (필터용)
  const uniqueAgendas = Array.from(new Set(digitalKpis.map(r => r.agenda).filter(Boolean))).sort() as string[];
  const uniqueDevices = Array.from(new Set(digitalKpis.map(r => r.device).filter(Boolean))).sort() as string[];
  const uniqueMediums = Array.from(new Set(digitalKpis.map(r => r.medium).filter(Boolean))).sort() as string[];
  // 현재 선택된 매체에 해당하는 매체상세만 필터링하거나, 전체를 가져옵니다.
  const uniqueMediumDetails = Array.from(new Set(digitalKpis.filter(r => filterMedium === "all" || r.medium === filterMedium).map(r => r.mediumDetail).filter(Boolean))).sort() as string[];

  const groupedDigital = groupDigitalKpis(digitalKpis, viewMode, filterAgenda, filterDevice, filterMedium, filterMediumDetail, dateRange || null);
  const chartData      = getChartData(digitalKpis, filterAgenda, dateRange || null, viewMode);
  const allDigital     = groupDigitalKpis(digitalKpis, "total", filterAgenda, filterDevice, filterMedium, filterMediumDetail, dateRange || null);
  const groupedViral   = groupViral(viralContents, "daily");

  // 매체 퍼포먼스 누적 합계
  const totalSpend             = allDigital.reduce((a, r) => a + r.spend, 0);
  const totalImpressions       = allDigital.reduce((a, r) => a + r.impressions, 0);
  const totalViews             = allDigital.reduce((a, r) => a + r.views, 0);
  const totalClicks            = allDigital.reduce((a, r) => a + r.clicks, 0);
  const totalConversions       = allDigital.reduce((a, r) => a + (r.conversions || 0), 0);
  const totalConversionRevenue = allDigital.reduce((a, r) => a + (r.conversionRevenue || 0), 0);
  const totalSignupCorporate   = allDigital.reduce((a, r) => a + (r.signupCorporate || 0), 0);
  const totalSignupPersonal    = allDigital.reduce((a, r) => a + (r.signupPersonal || 0), 0);
  const totalLeadsCollected    = allDigital.reduce((a, r) => a + (r.leadsCollected || 0), 0);

  const avgCpv                 = totalViews > 0 ? Math.round(totalSpend / totalViews) : 0;
  const avgCtr                 = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;
  const avgRoas                = totalSpend > 0 ? (totalConversionRevenue / totalSpend) * 100 : 0;
  const totalSignups           = totalSignupCorporate + totalSignupPersonal;
  const avgCpa                 = totalSignups > 0 ? Math.round(totalSpend / totalSignups) : 0;

  // 추가 컬럼 누적
  const extraTotals: Record<string, number> = {};
  for (const row of digitalKpis) {
    const extra = parseExtra(row.extraData);
    for (const [k, v] of Object.entries(extra)) {
      extraTotals[k] = (extraTotals[k] || 0) + (v as number);
    }
  }
  // CPM, VTR, CTR, CPV, CPC 는 합산이 아닌 총합 기반 재계산
  {
    const totalsCtx = { spend: totalSpend, impressions: totalImpressions, views: totalViews, clicks: totalClicks };
    for (const [key, fn] of Object.entries(RATIO_EXTRA_KEYS)) {
      if (key in extraTotals) extraTotals[key] = fn(totalsCtx);
    }
  }
  // 감지된 추가 컬럼 목록 (DB 데이터에서 추출)
  const detectedExtraCols = Array.from(new Set(
    digitalKpis.flatMap(r => Object.keys(parseExtra(r.extraData)))
  ));

  // KPI 타겟 목록
  const kpiTargets = campaign?.kpiTargets || [];

  // 바이럴 통계
  const viralMonths    = Array.from(new Set(groupedViral.map(v => v.date?.substring(0, 7)))).filter(Boolean).sort().reverse();
  const viralPlatforms = Array.from(new Set(groupedViral.map(v => v.platform))).filter(Boolean).sort();
  const filteredViral  = groupedViral.filter(v => {
    if (filterMonth !== "all" && v.date?.substring(0, 7) !== filterMonth) return false;
    if (filterPlatform !== "all" && v.platform !== filterPlatform) return false;
    return true;
  });
  const viralTotalViews    = filteredViral.reduce((a, v) => a + (v.views    || 0), 0);
  const viralTotalLikes    = filteredViral.reduce((a, v) => a + (v.likes    || 0), 0);
  const viralTotalComments = filteredViral.reduce((a, v) => a + (v.comments || 0), 0);
  const viralEngagePct     = viralTotalViews > 0 ? ((viralTotalLikes + viralTotalComments) / viralTotalViews) * 100 : 0;

  // 유튜브 통계
  const ytTotalViews    = youtubeVideos.reduce((a, v) => a + (v.views    || 0), 0);
  const ytTotalLikes    = youtubeVideos.reduce((a, v) => a + (v.likes    || 0), 0);
  const ytTotalComments = youtubeVideos.reduce((a, v) => a + (v.comments || 0), 0);
  const ytEngagePct     = ytTotalViews > 0 ? ((ytTotalLikes + ytTotalComments) / ytTotalViews) * 100 : 0;

  const TABS = [
    { key: "media" as ActiveTab, label: "매체 퍼포먼스" },
    { key: "video" as ActiveTab, label: "캠페인 광고 영상" },
    { key: "viral" as ActiveTab, label: "바이럴 컨텐츠 성과" },
  ];

  return (
    <div className="flex flex-col gap-8 animate-in fade-in slide-in-from-bottom-4 duration-500">

      {/* ── 탭 네비게이션 ── */}
      <div className="flex border-b border-gray-200">
        {TABS.map(tab => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)}
            className={`px-5 py-3 text-sm font-medium transition-colors border-b-2 -mb-px ${
              activeTab === tab.key ? "border-fursys-red text-fursys-red" : "border-transparent text-gray-400 hover:text-gray-700"
            }`}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* ════════════════════════════════════════════════════
          탭 1: 매체 퍼포먼스
      ════════════════════════════════════════════════════ */}
      {activeTab === "media" && (
        <div className="flex flex-col gap-6">

          {/* KPI 요약 카드 */}
          {digitalKpis.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold text-gray-900">전체 누적 성과</h3>
                {isAdmin && (
                  <div className="flex items-center gap-2">
                    <button onClick={() => setShowItemOrder(v => !v)}
                      className="text-xs flex items-center gap-1 text-gray-400 hover:text-fursys-red transition-colors">
                      <ArrowUpDown className="w-3 h-3" /> 순서 편집
                    </button>
                    <button onClick={() => setShowCumulativeSettings(v => !v)}
                      className="text-xs flex items-center gap-1 text-gray-400 hover:text-fursys-red transition-colors">
                      <SlidersHorizontal className="w-3 h-3" /> 항목 선택
                    </button>
                  </div>
                )}
              </div>
              {showCumulativeSettings && (
                <div className="bg-gray-50 p-3 rounded-lg mb-3 flex flex-wrap gap-2 border border-gray-200">
                  {[
                    { key: "spend",             label: "집행 비용" },
                    { key: "impressions",        label: "노출수" },
                    { key: "views",              label: "조회수" },
                    { key: "clicks",             label: "클릭수" },
                    { key: "cpv",                label: "CPV" },
                    { key: "ctr",                label: "CTR" },
                    { key: "conversions",        label: "전환수" },
                    { key: "conversionRevenue",  label: "전환 매출" },
                    { key: "roas",               label: "평균 ROAS" },
                    { key: "signupCorporate",    label: "기업가입" },
                    { key: "signupPersonal",     label: "개인가입" },
                    { key: "leadsCollected",     label: "리드수집" },
                  ].map(item => (
                    <label key={item.key} className="flex items-center gap-2 cursor-pointer text-xs">
                      <input type="checkbox" checked={cumulativeVisibleItems[item.key] ?? true}
                        onChange={e => {
                          const next = { ...cumulativeVisibleItems, [item.key]: e.target.checked };
                          setCumulativeVisibleItems(next);
                        }}
                        className="accent-fursys-red w-3 h-3" />
                      <span>{item.label}</span>
                    </label>
                  ))}
                  {detectedExtraCols.map(col => (
                    <label key={col} className="flex items-center gap-2 cursor-pointer text-xs">
                      <input type="checkbox" checked={cumulativeVisibleItems[col] ?? true}
                        onChange={e => {
                          const next = { ...cumulativeVisibleItems, [col]: e.target.checked };
                          setCumulativeVisibleItems(next);
                        }}
                        className="accent-fursys-red w-3 h-3" />
                      <span className="bg-blue-50 px-1.5 py-0.5 rounded">{col}</span>
                    </label>
                  ))}
                  <div className="w-full flex items-center justify-end gap-2 pt-1 mt-1 border-t border-gray-200">
                    {cumulativeSaved && (
                      <span className="text-[10px] text-green-500 font-medium flex items-center gap-1">
                        ✓ 저장됨
                      </span>
                    )}
                    <button
                      onClick={() => {
                        persistCumulative(cumulativeVisibleItems, cumulativeItemOrder);
                        setCumulativeSaved(true);
                        setTimeout(() => setCumulativeSaved(false), 2000);
                      }}
                      className="px-3 py-1 text-[11px] font-medium bg-gray-900 text-white rounded-lg hover:bg-gray-700 transition-all">
                      저장
                    </button>
                  </div>
                </div>
              )}
              {showItemOrder && (
                <div className="bg-gray-50 p-3 rounded-lg mb-3 border border-gray-200 flex flex-col gap-2">
                  <p className="text-xs text-gray-400 mb-2">드래그하여 순서를 변경할 수 있습니다. (회색 = 숨김 항목)</p>
                  {(() => {
                    // 대소문자 구분 없이 fixed 항목과 중복되는 extra 컬럼 제외
                    const fixedLower = new Set(cumulativeItemOrder.map(k => k.toLowerCase()));
                    const allItems = [...cumulativeItemOrder, ...detectedExtraCols.filter(col =>
                      !cumulativeItemOrder.includes(col) && !fixedLower.has(col.toLowerCase())
                    )];
                    return allItems.map((item, idx) => {
                      const itemLabels: Record<string, string> = {
                        spend: "집행 비용", impressions: "노출수", views: "조회수",
                        clicks: "클릭수", cpv: "CPV", ctr: "CTR",
                        conversions: "전환수", conversionRevenue: "전환 매출", roas: "ROAS",
                        signupCorporate: "기업가입", signupPersonal: "개인가입", leadsCollected: "리드수집"
                      };
                      const itemLabel = itemLabels[item] || item;
                      const isExtra = detectedExtraCols.includes(item);
                      const isDragging = draggedCumulativeItem === item;
                      const isVisible = cumulativeVisibleItems[item];

                      return (
                        <div
                          key={item}
                          draggable
                          onDragStart={() => setDraggedCumulativeItem(item)}
                          onDragOver={(e) => e.preventDefault()}
                          onDrop={() => {
                            if (!draggedCumulativeItem || draggedCumulativeItem === item) return;
                            // extra cols 포함한 전체 목록에서 순서 재계산
                            const fixedLowerSet = new Set(cumulativeItemOrder.map(k => k.toLowerCase()));
                            const all = [...cumulativeItemOrder, ...detectedExtraCols.filter(col =>
                              !cumulativeItemOrder.includes(col) && !fixedLowerSet.has(col.toLowerCase())
                            )];
                            const draggedIdx = all.indexOf(draggedCumulativeItem);
                            const targetIdx  = all.indexOf(item);
                            if (draggedIdx < targetIdx) {
                              all.splice(draggedIdx, 1);
                              all.splice(targetIdx - 1, 0, draggedCumulativeItem);
                            } else {
                              all.splice(draggedIdx, 1);
                              all.splice(targetIdx, 0, draggedCumulativeItem);
                            }
                            // extra cols도 순서에 포함해서 저장 (드래그 결과 유지)
                            setCumulativeItemOrder(all);
                            setDraggedCumulativeItem(null);
                          }}
                          onDragEnd={() => setDraggedCumulativeItem(null)}
                          className={`flex items-center gap-2 px-3 py-2 rounded cursor-move transition-all ${
                            isDragging
                              ? "bg-fursys-red/10 border-fursys-red/30 border"
                              : "bg-white border border-gray-200 hover:border-fursys-red/50"
                          } ${!isVisible ? "opacity-40 bg-gray-200" : ""}`}>
                          <span className="text-lg text-gray-300">⋮⋮</span>
                          <span className={`text-xs font-medium flex-1 ${isExtra ? "bg-blue-50 px-1.5 py-0.5 rounded" : ""} ${isVisible ? "text-gray-700" : "text-gray-400 line-through"}`}>
                            {itemLabel}
                            {!isVisible && <span className="ml-1 text-[10px] bg-gray-300 text-white px-1.5 py-0.5 rounded">숨김</span>}
                          </span>
                        </div>
                      );
                    });
                  })()}
                  <div className="flex items-center justify-end gap-2 pt-1 mt-1 border-t border-gray-200">
                    {cumulativeSaved && (
                      <span className="text-[10px] text-green-500 font-medium flex items-center gap-1">
                        ✓ 저장됨
                      </span>
                    )}
                    <button
                      onClick={() => {
                        persistCumulative(cumulativeVisibleItems, cumulativeItemOrder);
                        setCumulativeSaved(true);
                        setTimeout(() => setCumulativeSaved(false), 2000);
                      }}
                      className="px-3 py-1 text-[11px] font-medium bg-gray-900 text-white rounded-lg hover:bg-gray-700 transition-all">
                      저장
                    </button>
                  </div>
                </div>
              )}
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                {(() => {
                  // 대소문자 중복 제거: cumulativeItemOrder에 이미 있는 항목은 extra에서 제외
                  const fixedLowerSet = new Set(cumulativeItemOrder.map(k => k.toLowerCase()));
                  return [...cumulativeItemOrder, ...detectedExtraCols.filter(col =>
                    !cumulativeItemOrder.includes(col) && !fixedLowerSet.has(col.toLowerCase())
                  )];
                })().map(item => {
                  const spendKpi = kpiTargets.find(t => t.label?.includes("비용") || t.label?.includes("집행"));
                  const impressKpi = kpiTargets.find(t => t.label?.includes("노출"));
                  const viewsKpi = kpiTargets.find(t => t.label?.includes("조회"));
                  const clicksKpi = kpiTargets.find(t => t.label?.includes("클릭"));
                  const cpvKpi = kpiTargets.find(t => t.label?.includes("CPV"));
                  const ctrKpi = kpiTargets.find(t => t.label?.includes("CTR"));
                  const conversionsKpi = kpiTargets.find(t => t.label?.includes("전환수") || t.label?.includes("전환"));
                  const revenueKpi = kpiTargets.find(t => t.label?.includes("매출") || t.label?.includes("수익"));
                  const roasKpi = kpiTargets.find(t => t.label?.includes("ROAS"));

                  if (item === "spend" && cumulativeVisibleItems.spend) {
                    const kpiInfo = spendKpi ? {
                      target: fmtKrw(spendKpi.target),
                      rate: spendKpi.target > 0 ? (totalSpend / spendKpi.target) * 100 : 0,
                      isBudget: true
                    } : undefined;
                    return (
                      <StatCard
                        key="spend"
                        label="집행 비용"
                        value={fmtKrw(totalSpend)}
                        kpiInfo={kpiInfo}
                        onKpiEdit={() => { setEditingKpi({ label: "집행 비용", target: spendKpi?.target || 0, idx: kpiTargets.findIndex(t => t.label?.includes("비용") || t.label?.includes("집행")) }); setKpiTargetVal(String(spendKpi?.target || "")); }}
                      />
                    );
                  }
                  if (item === "impressions" && cumulativeVisibleItems.impressions) {
                    const kpiInfo = impressKpi ? {
                      target: fmt(impressKpi.target),
                      rate: impressKpi.target > 0 ? (totalImpressions / impressKpi.target) * 100 : 0,
                      isBudget: false
                    } : undefined;
                    return (
                      <StatCard
                        key="impressions"
                        label="노출수"
                        value={fmt(totalImpressions)}
                        kpiInfo={kpiInfo}
                        onKpiEdit={() => { setEditingKpi({ label: "노출수", target: impressKpi?.target || 0, idx: kpiTargets.findIndex(t => t.label?.includes("노출")) }); setKpiTargetVal(String(impressKpi?.target || "")); }}
                      />
                    );
                  }
                  if (item === "views" && cumulativeVisibleItems.views) {
                    const kpiInfo = viewsKpi ? {
                      target: fmt(viewsKpi.target),
                      rate: viewsKpi.target > 0 ? (totalViews / viewsKpi.target) * 100 : 0,
                      isBudget: false
                    } : undefined;
                    return (
                      <StatCard
                        key="views"
                        label="조회수"
                        value={fmt(totalViews)}
                        kpiInfo={kpiInfo}
                        onKpiEdit={() => { setEditingKpi({ label: "조회수", target: viewsKpi?.target || 0, idx: kpiTargets.findIndex(t => t.label?.includes("조회")) }); setKpiTargetVal(String(viewsKpi?.target || "")); }}
                      />
                    );
                  }
                  if (item === "clicks" && cumulativeVisibleItems.clicks) {
                    const kpiInfo = clicksKpi ? {
                      target: fmt(clicksKpi.target),
                      rate: clicksKpi.target > 0 ? (totalClicks / clicksKpi.target) * 100 : 0,
                      isBudget: false
                    } : undefined;
                    return (
                      <StatCard
                        key="clicks"
                        label="클릭수"
                        value={fmt(totalClicks)}
                        kpiInfo={kpiInfo}
                        onKpiEdit={() => { setEditingKpi({ label: "클릭수", target: clicksKpi?.target || 0, idx: kpiTargets.findIndex(t => t.label?.includes("클릭")) }); setKpiTargetVal(String(clicksKpi?.target || "")); }}
                      />
                    );
                  }
                  if (item === "cpv" && cumulativeVisibleItems.cpv) {
                    // 평균 지표 → 목표치만 표시, 달성률 숨김 (rate 없음)
                    const kpiInfo = cpvKpi ? { target: fmtKrw(cpvKpi.target), isBudget: false } : undefined;
                    return (
                      <StatCard
                        key="cpv"
                        label="평균 CPV"
                        value={fmtKrw(avgCpv)}
                        kpiInfo={kpiInfo}
                        onKpiEdit={() => { setEditingKpi({ label: "CPV", target: cpvKpi?.target || 0, idx: kpiTargets.findIndex(t => t.label?.includes("CPV")) }); setKpiTargetVal(String(cpvKpi?.target || "")); }}
                      />
                    );
                  }
                  if (item === "ctr" && cumulativeVisibleItems.ctr) {
                    // 평균 지표 → 목표치만 표시, 달성률 숨김
                    const kpiInfo = ctrKpi ? { target: pct(ctrKpi.target), isBudget: false } : undefined;
                    return (
                      <StatCard
                        key="ctr"
                        label="평균 CTR"
                        value={pct(avgCtr)}
                        kpiInfo={kpiInfo}
                        onKpiEdit={() => { setEditingKpi({ label: "CTR", target: ctrKpi?.target || 0, idx: kpiTargets.findIndex(t => t.label?.includes("CTR")) }); setKpiTargetVal(String(ctrKpi?.target || "")); }}
                      />
                    );
                  }
                  if (item === "conversions" && cumulativeVisibleItems.conversions) {
                    const kpiInfo = conversionsKpi ? {
                      target: fmt(conversionsKpi.target),
                      rate: conversionsKpi.target > 0 ? (totalConversions / conversionsKpi.target) * 100 : 0,
                      isBudget: false
                    } : undefined;
                    return (
                      <StatCard
                        key="conversions"
                        label="전환수"
                        value={fmt(totalConversions)}
                        kpiInfo={kpiInfo}
                        onKpiEdit={() => { setEditingKpi({ label: "전환수", target: conversionsKpi?.target || 0, idx: kpiTargets.findIndex(t => t.label?.includes("전환수") || t.label?.includes("전환")) }); setKpiTargetVal(String(conversionsKpi?.target || "")); }}
                      />
                    );
                  }
                  if (item === "conversionRevenue" && cumulativeVisibleItems.conversionRevenue) {
                    const kpiInfo = revenueKpi ? {
                      target: fmtKrw(revenueKpi.target),
                      rate: revenueKpi.target > 0 ? (totalConversionRevenue / revenueKpi.target) * 100 : 0,
                      isBudget: false
                    } : undefined;
                    return (
                      <StatCard
                        key="conversionRevenue"
                        label="전환 매출"
                        value={fmtKrw(totalConversionRevenue)}
                        kpiInfo={kpiInfo}
                        onKpiEdit={() => { setEditingKpi({ label: "전환 매출", target: revenueKpi?.target || 0, idx: kpiTargets.findIndex(t => t.label?.includes("매출") || t.label?.includes("수익")) }); setKpiTargetVal(String(revenueKpi?.target || "")); }}
                      />
                    );
                  }
                  if (item === "roas" && cumulativeVisibleItems.roas) {
                    // 평균 지표 → 목표치만 표시, 달성률 숨김
                    const kpiInfo = roasKpi ? { target: pct(roasKpi.target), isBudget: false } : undefined;
                    return (
                      <StatCard
                        key="roas"
                        label="평균 ROAS"
                        value={pct(avgRoas)}
                        kpiInfo={kpiInfo}
                        onKpiEdit={() => { setEditingKpi({ label: "ROAS", target: roasKpi?.target || 0, idx: kpiTargets.findIndex(t => t.label?.includes("ROAS")) }); setKpiTargetVal(String(roasKpi?.target || "")); }}
                        isHighlight={avgRoas >= 300}
                      />
                    );
                  }
                  if (item === "signupCorporate" && cumulativeVisibleItems.signupCorporate) {
                    const sgCorpKpi = kpiTargets.find(t => t.label?.includes("기업가입") || t.label?.includes("기업회원"));
                    const kpiInfo = sgCorpKpi ? { target: fmt(sgCorpKpi.target), rate: sgCorpKpi.target > 0 ? (totalSignupCorporate / sgCorpKpi.target) * 100 : 0, isBudget: false } : undefined;
                    return <StatCard key="signupCorporate" label="기업가입" value={fmt(totalSignupCorporate)} kpiInfo={kpiInfo}
                      onKpiEdit={() => { setEditingKpi({ label: "기업가입", target: sgCorpKpi?.target || 0, idx: kpiTargets.findIndex(t => t.label?.includes("기업가입") || t.label?.includes("기업회원")) }); setKpiTargetVal(String(sgCorpKpi?.target || "")); }} />;
                  }
                  if (item === "signupPersonal" && cumulativeVisibleItems.signupPersonal) {
                    const sgPerKpi = kpiTargets.find(t => t.label?.includes("개인가입") || t.label?.includes("개인회원"));
                    const kpiInfo = sgPerKpi ? { target: fmt(sgPerKpi.target), rate: sgPerKpi.target > 0 ? (totalSignupPersonal / sgPerKpi.target) * 100 : 0, isBudget: false } : undefined;
                    return <StatCard key="signupPersonal" label="개인가입" value={fmt(totalSignupPersonal)} kpiInfo={kpiInfo}
                      onKpiEdit={() => { setEditingKpi({ label: "개인가입", target: sgPerKpi?.target || 0, idx: kpiTargets.findIndex(t => t.label?.includes("개인가입") || t.label?.includes("개인회원")) }); setKpiTargetVal(String(sgPerKpi?.target || "")); }} />;
                  }
                  if (item === "leadsCollected" && cumulativeVisibleItems.leadsCollected) {
                    const leadsKpi = kpiTargets.find(t => t.label?.includes("리드"));
                    const kpiInfo = leadsKpi ? { target: fmt(leadsKpi.target), rate: leadsKpi.target > 0 ? (totalLeadsCollected / leadsKpi.target) * 100 : 0, isBudget: false } : undefined;
                    return <StatCard key="leadsCollected" label="리드수집" value={fmt(totalLeadsCollected)} kpiInfo={kpiInfo}
                      onKpiEdit={() => { setEditingKpi({ label: "리드수집", target: leadsKpi?.target || 0, idx: kpiTargets.findIndex(t => t.label?.includes("리드")) }); setKpiTargetVal(String(leadsKpi?.target || "")); }} />;
                  }
                  if (detectedExtraCols.includes(item) && cumulativeVisibleItems[item]) {
                    const val = extraTotals[item] || 0;
                    const isPct  = ["VTR","CTR","vtr","ctr"].includes(item);
                    const isCrcy = ["CPM","CPV","CPC","cpm","cpv","cpc"].includes(item);
                    const displayVal = isPct ? `${val.toFixed(1)}%` : isCrcy ? fmtKrw(Math.round(val)) : fmt(val);
                    const avgLabel   = (isPct || isCrcy) ? `평균 ${item.toUpperCase()}` : item;
                    const extraKpi   = kpiTargets.find(t => t.label === avgLabel || t.label === item);
                    const extraKpiInfo = extraKpi ? { target: isPct ? pct(extraKpi.target) : isCrcy ? fmtKrw(extraKpi.target) : fmt(extraKpi.target), isBudget: false } : undefined;
                    return <StatCard key={item} label={avgLabel} value={displayVal} kpiInfo={extraKpiInfo}
                      onKpiEdit={() => { setEditingKpi({ label: avgLabel, target: extraKpi?.target || 0, idx: kpiTargets.findIndex(t => t.label === avgLabel || t.label === item) }); setKpiTargetVal(String(extraKpi?.target || "")); }} />;
                  }
                  return null;
                })}
              </div>
            </div>
          )}


          {/* KPI 편집 모달 */}
          {editingKpi && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
              <div className="bg-white rounded-2xl p-6 w-[380px] shadow-2xl border border-gray-100">
                <h3 className="font-bold text-gray-900 mb-4">KPI 목표 설정</h3>
                <div className="flex flex-col gap-3">
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">KPI 항목명</label>
                    <Input value={editingKpi.label} onChange={e => setEditingKpi({ ...editingKpi, label: e.target.value })}
                      placeholder="예: 캠페인 노출수" className="text-sm" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">목표 수치</label>
                    <Input value={kpiTargetVal} onChange={e => setKpiTargetVal(e.target.value)}
                      type="number" placeholder="0" className="text-sm" />
                  </div>
                </div>
                <div className="flex gap-2 mt-5 justify-end">
                  <Button variant="ghost" size="sm" onClick={() => setEditingKpi(null)}>취소</Button>
                  <Button size="sm" onClick={saveKpiTarget} className="bg-fursys-red hover:bg-red-700 text-white">저장</Button>
                </div>
              </div>
            </div>
          )}

          {/* 헤더 */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <h2 className="text-xl font-bold text-gray-900">매체 퍼포먼스 모니터링</h2>
                <div className="flex bg-gray-100 rounded-lg p-0.5 gap-0.5">
                  {(["total", "monthly", "weekly", "daily"] as ViewMode[]).map(m => (
                    <button key={m} onClick={() => setViewMode(m)}
                      className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${viewMode === m ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-800"}`}>
                      {VIEW_MODE_LABELS[m]}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {digitalKpis.length > 0 && (
                <div className="flex gap-2 items-center">
                  <select value={filterAgenda} onChange={e => setFilterAgenda(e.target.value)}
                    className="bg-white border border-gray-200 text-gray-700 text-[13px] rounded p-1.5 outline-none font-semibold">
                    <option value="all">전체 소재</option>
                    {uniqueAgendas.map(agenda => <option key={agenda} value={agenda}>{agenda}</option>)}
                  </select>
                </div>
              )}
              <div className="flex-1" />
              {isAdmin && (
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" className="border-gray-200 text-gray-700 hover:bg-gray-100"
                    onClick={() => setShowConfig({ type: "digital", source: "excel" })}>
                    <UploadCloud className="w-4 h-4 mr-2" /> 엑셀 파일
                  </Button>
                  <Button size="sm" className="bg-[#0F9D58] hover:bg-[#0b7a45] text-white border-0"
                    onClick={() => setShowConfig({ type: "digital", source: "sheet" })}>
                    <FileSpreadsheet className="w-4 h-4 mr-2" /> 구글 시트
                  </Button>
                </div>
              )}
            </div>
          </div>


          {/* 업로드 패널 */}
          {showConfig?.type === "digital" && (
            <GlassCard className="p-4 border-dashed bg-gray-50 animate-in slide-in-from-top-2">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-semibold text-gray-900">매체 데이터 소스 연동</span>
                <div className="flex items-center gap-2">
                  {digitalKpis.length > 0 && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={async () => {
                        if (confirm("모든 매체 데이터를 삭제하시겠습니까?")) {
                          await clearDigitalKpis({ campaignId });
                          setShowConfig(null);
                        }
                      }}
                      className="text-red-500 hover:text-red-700 hover:bg-red-50 text-xs h-8"
                    >
                      <Trash className="w-3.5 h-3.5 mr-1" /> 데이터 삭제
                    </Button>
                  )}
                  <button onClick={() => setShowConfig(null)}><X className="w-4 h-4 text-gray-400" /></button>
                </div>
              </div>
              {showConfig.source === "sheet" ? (
                <div className="flex flex-col gap-2">
                  <div className="flex gap-2">
                    <Input value={sheetUrl} onChange={e => setSheetUrl(e.target.value)}
                      placeholder="스프레드시트 URL..." className="bg-white border-gray-200 text-xs text-gray-900" />
                    <Button size="sm" onClick={() => handleSheetSync("digital")} disabled={isSyncing}
                      className="bg-white text-black whitespace-nowrap border border-gray-200">
                      {isSyncing ? <RefreshCw className="w-4 h-4 animate-spin" /> : "AI 분석"}
                    </Button>
                  </div>
                  <p className="text-[10px] text-gray-400">* 모든 컬럼을 자동 감지해 저장합니다. 날짜 행만 수집됩니다.</p>
                </div>
              ) : (
                <input type="file" accept=".xlsx,.xls,.csv" ref={fileInputRef}
                  onChange={e => handleExcelUpload(e, "digital")}
                  className="text-xs text-gray-600 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-gray-100 file:text-gray-900" />
              )}
              {isSyncing && syncStatus && (
                <div className="mt-3 flex items-center gap-2 text-xs text-fursys-red">
                  <RefreshCw className="w-3 h-3 animate-spin" /><span>{syncStatus}</span>
                </div>
              )}
            </GlassCard>
          )}

          {/* 상단 트렌드 차트 */}
          {chartData.length > 0 && (
            <>
            {/* ── 일자별 그래프 카드 ── */}
            <GlassCard className="p-5">
              <div className="flex justify-between items-start mb-4 gap-3">
                <div className="flex items-center gap-2 shrink-0">
                  <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
                    <span className="w-2 h-4 bg-fursys-red rounded-sm"></span>
                    {VIEW_MODE_LABELS[viewMode]} 그래프
                  </h3>
                  {/* 항목 편집 버튼 (관리자 전용) — Task 4 */}
                  {isAdmin && (
                    <button
                      onClick={() => { setDraftItems({ ...viewerItems }); setDraftDefaults({ ...viewerDefaults }); setShowItemEditPanel(true); }}
                      className="flex items-center gap-1 text-xs text-gray-400 hover:text-fursys-red border border-gray-200 rounded px-2 py-1 transition-colors"
                    >
                      <SlidersHorizontal className="w-3 h-3" /> 항목 편집
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-3 flex-wrap flex-1 justify-end">
                  {/* 체크박스 — admin: 전체 표시 / viewer: viewerItems 범위 내 표시, 기본값=viewerDefaults */}
                  {ALL_CHART_ITEMS.map(metric => {
                    const isVisible = isAdmin ? true : !!viewerItems[metric.key];
                    if (!isVisible) return null;
                    return (
                      <label key={metric.key} className="flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={!!chartMetrics[metric.key]}
                          onChange={(e) => setChartMetrics(prev => ({ ...prev, [metric.key]: e.target.checked }))}
                          className="accent-fursys-red w-3.5 h-3.5"
                        />
                        <span className="text-xs text-gray-600 font-medium">{metric.label}</span>
                      </label>
                    );
                  })}
                  {/* 시트 추가 컬럼 — 관리자만 표시, 중복/불필요 컬럼 제외 */}
                  {isAdmin && detectedExtraCols
                    .filter(col => !EXCLUDED_EXTRA_CHART_COLS.has(col))
                    .map((col, idx) => {
                      const color = EXTRA_COL_COLORS[idx % EXTRA_COL_COLORS.length];
                      return (
                        <label key={`extra_${col}`} className="flex items-center gap-1.5 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={!!chartMetrics[`extra_${col}`]}
                            onChange={(e) => setChartMetrics(prev => ({ ...prev, [`extra_${col}`]: e.target.checked }))}
                            className="w-3.5 h-3.5"
                            style={{ accentColor: color }}
                          />
                          <span className="text-xs font-medium px-1.5 py-0.5 rounded" style={{ color, backgroundColor: `${color}18` }}>
                            {col}
                          </span>
                        </label>
                      );
                    })}
                </div>
              </div>
              <div className="h-[280px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                    <XAxis
                      dataKey="dateLabel"
                      tick={{fontSize: 11, fill: '#9ca3af'}}
                      axisLine={false}
                      tickLine={false}
                      dy={10}
                    />
                    {/* 왼쪽 Y축: 수량 (노출수, 조회수, 클릭수, 전환수, 집행비용) */}
                    <YAxis
                      yAxisId="left"
                      orientation="left"
                      tick={{fontSize: 11, fill: '#9ca3af'}}
                      axisLine={false}
                      tickLine={false}
                      dx={-10}
                      tickFormatter={(val) => val >= 10000 ? `${(val/10000).toFixed(0)}만` : val.toLocaleString()}
                    />
                    {/* 오른쪽 Y축: 비율 (VTR, CTR, ROAS) */}
                    <YAxis
                      yAxisId="right"
                      orientation="right"
                      tick={{fontSize: 11, fill: '#9ca3af'}}
                      axisLine={false}
                      tickLine={false}
                      dx={10}
                      tickFormatter={(val) => `${val}%`}
                    />
                    <RechartsTooltip
                      contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', padding: '12px' }}
                      formatter={(val: number, name: string) => {
                        const labels: Record<string, string> = { spend: "집행비용", views: "조회수", impressions: "노출수", clicks: "클릭수", conversions: "전환수", ctr: "CTR", vtr: "VTR", roas: "ROAS" };
                        const label = labels[name] || name;
                        if (name === "spend") return [`${val.toLocaleString()}원`, label];
                        if (name === "ctr" || name === "vtr" || name === "roas") return [`${val}%`, label];
                        return [val.toLocaleString(), label];
                      }}
                      labelStyle={{ color: '#6b7280', marginBottom: '8px', fontSize: '12px', fontWeight: 600 }}
                    />

                    {/* ── 막대그래프: 수량 지표 (Task 1-3) ── */}
                    {chartMetrics["impressions"] && (
                      <Bar yAxisId="left" dataKey="impressions" name="impressions" fill="#2563EB26" stroke="#2563EB" strokeWidth={1} radius={[3,3,0,0]} barSize={14} />
                    )}
                    {chartMetrics["views"] && (
                      <Bar yAxisId="left" dataKey="views" name="views" fill="#DC262626" stroke="#DC2626" strokeWidth={1} radius={[3,3,0,0]} barSize={14} />
                    )}
                    {chartMetrics["clicks"] && (
                      <Bar yAxisId="left" dataKey="clicks" name="clicks" fill="#D9770626" stroke="#D97706" strokeWidth={1} radius={[3,3,0,0]} barSize={14} />
                    )}
                    {chartMetrics["conversions"] && (
                      <Bar yAxisId="left" dataKey="conversions" name="conversions" fill="#05966926" stroke="#059669" strokeWidth={1} radius={[3,3,0,0]} barSize={14} />
                    )}
                    {chartMetrics["spend"] && (
                      <Bar yAxisId="left" dataKey="spend" name="spend" fill="#F59E0B26" stroke="#F59E0B" strokeWidth={1} radius={[3,3,0,0]} barSize={14} />
                    )}

                    {/* ── 꺾은선그래프: 비율 지표 (Task 1-3) ── */}
                    {chartMetrics["vtr"] && (
                      <Line yAxisId="right" type="monotone" dataKey="vtr" name="vtr" stroke="#8B5CF6" strokeWidth={2.5} strokeDasharray="5 5" dot={{r: 3, fill: '#8B5CF6', strokeWidth: 2, stroke: '#fff'}} activeDot={{r: 5}} />
                    )}
                    {chartMetrics["ctr"] && (
                      <Line yAxisId="right" type="monotone" dataKey="ctr" name="ctr" stroke="#EC4899" strokeWidth={2.5} strokeDasharray="5 5" dot={{r: 3, fill: '#EC4899', strokeWidth: 2, stroke: '#fff'}} activeDot={{r: 5}} />
                    )}
                    {chartMetrics["roas"] && (
                      <Line yAxisId="right" type="monotone" dataKey="roas" name="roas" stroke="#10B981" strokeWidth={2.5} strokeDasharray="5 5" dot={{r: 3, fill: '#10B981', strokeWidth: 2, stroke: '#fff'}} activeDot={{r: 5}} />
                    )}

                    {/* ── 시트 추가 컬럼 (관리자만, 중복/불필요 제외) ── */}
                    {isAdmin && detectedExtraCols
                      .filter(col => !EXCLUDED_EXTRA_CHART_COLS.has(col))
                      .map((col, idx) => {
                        if (!chartMetrics[`extra_${col}`]) return null;
                        const color = EXTRA_COL_COLORS[idx % EXTRA_COL_COLORS.length];
                        return (
                          <Line
                            key={`extra_${col}`}
                            yAxisId="left"
                            type="monotone"
                            dataKey={(d: any) => d.extra?.[col] ?? 0}
                            name={col}
                            stroke={color}
                            strokeWidth={2.5}
                            dot={{ r: 3, fill: color, strokeWidth: 2, stroke: '#fff' }}
                            activeDot={{ r: 5 }}
                          />
                        );
                      })}
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </GlassCard>

            {/* ── CPM / CPV / CPC 추이 차트 (Task 2) ── */}
            <GlassCard className="p-5">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
                  <span className="w-2 h-4 bg-blue-400 rounded-sm"></span>
                  단가 지표 추이 (CPM / CPV / CPC)
                </h3>
                <div className="flex items-center gap-3">
                  {([
                    { key: "cpm" as const, label: "CPM", color: "#0EA5E9" },
                    { key: "cpv" as const, label: "CPV", color: "#F97316" },
                    { key: "cpc" as const, label: "CPC", color: "#A855F7" },
                  ]).map(m => (
                    <label key={m.key} className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={cpcMetrics[m.key]}
                        onChange={e => setCpcMetrics(prev => ({ ...prev, [m.key]: e.target.checked }))}
                        className="w-3.5 h-3.5"
                        style={{ accentColor: m.color }}
                      />
                      <span className="text-xs font-medium" style={{ color: m.color }}>{m.label}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div className="h-[200px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                    <XAxis dataKey="dateLabel" tick={{fontSize: 11, fill: '#9ca3af'}} axisLine={false} tickLine={false} dy={10} />
                    <YAxis
                      yAxisId="cost"
                      orientation="left"
                      tick={{fontSize: 11, fill: '#9ca3af'}}
                      axisLine={false}
                      tickLine={false}
                      dx={-10}
                      tickFormatter={(v) => v >= 10000 ? `${(v/10000).toFixed(0)}만` : v.toLocaleString()}
                    />
                    <RechartsTooltip
                      contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', padding: '12px' }}
                      formatter={(val: any, name: string) => {
                        if (val === null || val === undefined) return ["-", name.toUpperCase()];
                        return [`₩${Number(val).toLocaleString()}`, name.toUpperCase()];
                      }}
                      labelStyle={{ color: '#6b7280', marginBottom: '8px', fontSize: '12px', fontWeight: 600 }}
                    />
                    {cpcMetrics.cpm && (
                      <Line yAxisId="cost" type="monotone" dataKey="cpm_calc" name="cpm" stroke="#0EA5E9" strokeWidth={2} dot={{r: 3, fill: '#0EA5E9', strokeWidth: 2, stroke: '#fff'}} activeDot={{r: 5}} connectNulls={false} />
                    )}
                    {cpcMetrics.cpv && (
                      <Line yAxisId="cost" type="monotone" dataKey="cpv_calc" name="cpv" stroke="#F97316" strokeWidth={2} dot={{r: 3, fill: '#F97316', strokeWidth: 2, stroke: '#fff'}} activeDot={{r: 5}} connectNulls={false} />
                    )}
                    {cpcMetrics.cpc && (
                      <Line yAxisId="cost" type="monotone" dataKey="cpc_calc" name="cpc" stroke="#A855F7" strokeWidth={2} dot={{r: 3, fill: '#A855F7', strokeWidth: 2, stroke: '#fff'}} activeDot={{r: 5}} connectNulls={false} />
                    )}
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </GlassCard>
            </>
          )}

          {/* 테이블 – 평탄화된 데이터(합계/개별) 표시 */}
          <GlassCard className="p-0 overflow-hidden min-h-[120px] bg-white">
            {groupedDigital.length > 0 && (
              <div className="flex items-center justify-between p-4 border-b border-gray-100 bg-white">
                <div className="flex items-center gap-4">
                  <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
                    <span className="w-2 h-4 bg-fursys-red rounded-sm"></span>
                    상세 데이터
                  </h3>
                  <div className="flex gap-2 items-center">
                    <select value={filterMedium} onChange={e => { setFilterMedium(e.target.value); setFilterMediumDetail("none"); }}
                      className="bg-gray-50 border border-gray-200 text-gray-700 text-xs rounded p-1.5 outline-none font-semibold w-[120px]">
                      <option value="none">-</option>
                      <option value="all">전체 매체</option>
                      {uniqueMediums.map(medium => <option key={medium} value={medium}>{medium}</option>)}
                    </select>
                    <select value={filterMediumDetail} onChange={e => setFilterMediumDetail(e.target.value)}
                      className="bg-gray-50 border border-gray-200 text-gray-700 text-xs rounded p-1.5 outline-none font-semibold w-[140px]"
                      disabled={filterMedium === "none"}
                    >
                      <option value="none">-</option>
                      <option value="all">전체 매체 상세</option>
                      {uniqueMediumDetails.map(detail => <option key={detail} value={detail}>{detail}</option>)}
                    </select>
                  </div>
                </div>
                {isAdmin && (
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" className="border-gray-200 text-gray-700 hover:bg-gray-100 h-[32px]"
                      onClick={() => setShowMediaColOrder(v => !v)}>
                      <ArrowUpDown className="w-3.5 h-3.5 mr-1.5" /> 컬럼 순서
                    </Button>
                    <Button size="sm" variant="outline" className="border-gray-200 text-gray-700 hover:bg-gray-100 h-[32px]"
                      onClick={() => setShowColSettings(v => !v)}>
                      <SlidersHorizontal className="w-3.5 h-3.5 mr-1.5" /> 컬럼 설정
                    </Button>
                  </div>
                )}
              </div>
            )}

            {/* 컬럼 순서 편집 패널 */}
            {showMediaColOrder && (
              <div className="p-4 bg-gray-50 border-b border-gray-100 animate-in slide-in-from-top-2">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                    <ArrowUpDown className="w-4 h-4" /> 테이블 컬럼 순서
                  </span>
                  <button onClick={() => setShowMediaColOrder(false)}><X className="w-4 h-4 text-gray-400" /></button>
                </div>
                <p className="text-xs text-gray-400 mb-3">드래그하여 컬럼 순서를 변경할 수 있습니다. (회색 = 숨김 항목)</p>
                <div className="flex flex-col gap-2">
                  {(() => {
                    // mediaColOrder를 그대로 사용해 interleaved 순서 유지 (fixed/extra 분리 금지)
                    const allCols = [...mediaColOrder, ...filterExtraCols(detectedExtraCols, mediaColOrder)];

                    return allCols.map((col) => {
                      const label = FIXED_COLS.find(fc => fc.key === col)?.label || col;
                      const isExtra = detectedExtraCols.includes(col);
                      const isDragging = draggedMediaCol === col;
                      const isVisible = visibleCols[col];

                      return (
                        <div
                          key={col}
                          draggable
                          onDragStart={() => setDraggedMediaCol(col)}
                          onDragOver={(e) => e.preventDefault()}
                          onDrop={() => {
                            if (!draggedMediaCol || draggedMediaCol === col) return;
                            // 저장된 순서 그대로 + 신규 extra cols 추가 (interleaved 위치 유지)
                            const all = [...mediaColOrder, ...filterExtraCols(detectedExtraCols, mediaColOrder)];
                            const draggedIdx = all.indexOf(draggedMediaCol);
                            const targetIdx  = all.indexOf(col);
                            if (draggedIdx < targetIdx) {
                              all.splice(draggedIdx, 1);
                              all.splice(targetIdx - 1, 0, draggedMediaCol);
                            } else {
                              all.splice(draggedIdx, 1);
                              all.splice(targetIdx, 0, draggedMediaCol);
                            }
                            // extra cols 포함 전체 순서 저장 (필터 없이)
                            const loadedOrder = [...all];
                            FIXED_COLS.forEach(fc => {
                              if (!loadedOrder.includes(fc.key)) loadedOrder.push(fc.key);
                            });
                            setMediaColOrder(loadedOrder);
                            setDraggedMediaCol(null);
                          }}
                          onDragEnd={() => setDraggedMediaCol(null)}
                          className={`flex items-center gap-2 px-3 py-2 rounded cursor-move transition-all ${
                            isDragging
                              ? "bg-fursys-red/10 border-fursys-red/30 border"
                              : "bg-white border border-gray-200 hover:border-fursys-red/50"
                          } ${!isVisible ? "opacity-40 bg-gray-200" : ""}`}>
                          <span className="text-lg text-gray-300">⋮⋮</span>
                          <span className={`text-sm flex-1 ${isExtra ? "bg-blue-50 px-2 py-0.5 rounded" : ""} ${isVisible ? "text-gray-800" : "text-gray-400 line-through"}`}>
                            {label}
                            {!isVisible && <span className="ml-1 text-[10px] bg-gray-300 text-white px-1.5 py-0.5 rounded">숨김</span>}
                          </span>
                        </div>
                      );
                    });
                  })()}
                </div>
                {/* 저장 버튼 */}
                {isAdmin && (
                  <div className="flex items-center justify-end gap-2 pt-3 mt-2 border-t border-gray-200">
                    {tableColSaved && <span className="text-[10px] text-green-500 font-medium flex items-center gap-1">✓ 저장됨</span>}
                    <button onClick={saveTableColSettings}
                      className="px-3 py-1 text-[11px] font-medium bg-gray-900 text-white rounded-lg hover:bg-gray-700 transition-all">
                      저장
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* 컬럼 설정 패널 */}
            {showColSettings && (
              <div className="p-4 bg-gray-50 border-b border-gray-100 animate-in slide-in-from-top-2">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                    <SlidersHorizontal className="w-4 h-4" /> 대시보드 노출 항목
                  </span>
                  <button onClick={() => setShowColSettings(false)}><X className="w-4 h-4 text-gray-400" /></button>
                </div>
                <p className="text-xs text-gray-400 mb-3">체크한 항목만 테이블에 표시됩니다.</p>
                <div className="flex flex-wrap gap-3">
                  {FIXED_COLS.map(col => (
                    <label key={col.key} className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={visibleCols[col.key] ?? true}
                        onChange={e => setVisibleCols(v => ({ ...v, [col.key]: e.target.checked }))}
                        className="accent-fursys-red w-4 h-4" />
                      <span className="text-sm text-gray-800">{col.label}</span>
                    </label>
                  ))}
                  {filterExtraCols(detectedExtraCols, mediaColOrder).concat(
                    // mediaColOrder에 포함된 extra col(순서 저장된 것)도 체크박스에 표시
                    mediaColOrder.filter(c => !FIXED_COLS.some(fc => fc.key === c) && detectedExtraCols.includes(c) && !filterExtraCols(detectedExtraCols, mediaColOrder).includes(c))
                  ).map(label => (
                    <label key={label} className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={visibleCols[label] ?? true}
                        onChange={e => setVisibleCols(v => ({ ...v, [label]: e.target.checked }))}
                        className="accent-fursys-red w-4 h-4" />
                      <span className="text-sm text-gray-800 bg-blue-50 px-2 py-0.5 rounded">{label}</span>
                    </label>
                  ))}
                </div>
                {/* 저장 버튼 */}
                {isAdmin && (
                  <div className="flex items-center justify-end gap-2 pt-3 mt-2 border-t border-gray-200">
                    {tableColSaved && <span className="text-[10px] text-green-500 font-medium flex items-center gap-1">✓ 저장됨</span>}
                    <button onClick={saveTableColSettings}
                      className="px-3 py-1 text-[11px] font-medium bg-gray-900 text-white rounded-lg hover:bg-gray-700 transition-all">
                      저장
                    </button>
                  </div>
                )}
              </div>
            )}

            {groupedDigital.length === 0 ? (
              <div className="flex items-center justify-center h-[120px] text-gray-400 text-sm">
                구글 시트 또는 엑셀 파일을 연동하면 AI가 자동으로 분석합니다.
              </div>
            ) : (
              <Table>
                <TableHeader className="bg-gray-50">
                  <TableRow className="border-gray-100 hover:bg-transparent">
                    <TableHead className="text-gray-500 text-[13px] whitespace-nowrap w-[130px]">기간 ({VIEW_MODE_LABELS[viewMode]})</TableHead>
                    {filterMedium !== "none" && (
                      <>
                        <TableHead className="text-gray-500 text-[13px] whitespace-nowrap w-[130px]">매체</TableHead>
                        <TableHead className="text-gray-500 text-[13px] whitespace-nowrap w-[130px]">매체 상세</TableHead>
                      </>
                    )}
                    {(() => {
                      const allCols = [...mediaColOrder, ...filterExtraCols(detectedExtraCols, mediaColOrder)];
                      return allCols.map(col => {
                        const isVisible = visibleCols[col];
                        if (!isVisible) return null;
                        if (col === "spend")       return <TableHead key="spend"       className="text-gray-500 text-[13px] whitespace-nowrap text-right">집행 비용</TableHead>;
                        if (col === "impressions") return <TableHead key="impressions" className="text-gray-500 text-[13px] whitespace-nowrap text-right">노출수</TableHead>;
                        if (col === "views")       return <TableHead key="views"       className="text-gray-500 text-[13px] whitespace-nowrap text-right">조회수</TableHead>;
                        if (col === "clicks")      return <TableHead key="clicks"      className="text-gray-500 text-[13px] whitespace-nowrap text-right">클릭수</TableHead>;
                        if (col === "cpv")         return <TableHead key="cpv"         className="text-gray-500 text-[13px] whitespace-nowrap text-right">CPV</TableHead>;
                        if (col === "ctrVtr")      return <TableHead key="ctrVtr"      className="text-gray-500 text-[13px] whitespace-nowrap text-right">VTR / CTR</TableHead>;
                        if (col === "conversions") return <TableHead key="conversions" className="text-gray-500 text-[13px] whitespace-nowrap text-right">전환수</TableHead>;
                        if (col === "conversionRevenue") return <TableHead key="conversionRevenue" className="text-gray-500 text-[13px] whitespace-nowrap text-right">전환매출</TableHead>;
                        if (col === "roas")        return <TableHead key="roas"        className="text-gray-500 text-[13px] whitespace-nowrap text-right">ROAS</TableHead>;
                        if (col === "signupCorporate")   return <TableHead key="signupCorporate"   className="text-gray-500 text-[13px] whitespace-nowrap text-right">기업가입</TableHead>;
                        if (col === "signupPersonal")    return <TableHead key="signupPersonal"    className="text-gray-500 text-[13px] whitespace-nowrap text-right">개인가입</TableHead>;
                        if (col === "leadsCollected")    return <TableHead key="leadsCollected"    className="text-gray-500 text-[13px] whitespace-nowrap text-right">리드수집</TableHead>;
                        return <TableHead key={col} className="text-gray-500 text-[13px] whitespace-nowrap text-right">{col}</TableHead>;
                      });
                    })()}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {groupedDigital.map((row, i) => {
                    // 컬럼 목록 계산 (저장된 순서 그대로, 신규 extra 추가)
                    const allCols = [...mediaColOrder, ...filterExtraCols(detectedExtraCols, mediaColOrder)];

                    // 셀 렌더 헬퍼
                    const renderCells = (data: any, isSubtotal: boolean) =>
                      allCols.map(col => {
                        if (!visibleCols[col]) return null;
                        
                        const roasHighlight = col === "roas" && data.roas >= 300
                          ? "text-emerald-600 font-extrabold"
                          : col === "roas" && data.roas > 0
                          ? "text-gray-700 font-bold"
                          : "";

                        const baseClass = `text-right ${isSubtotal ? "font-bold text-gray-900 text-[13px]" : "text-[13px] text-gray-700"}`;

                        if (col === "spend")        return <TableCell key="spend"        className={`${baseClass} py-3`}>{fmt(data.spend)}원</TableCell>;
                        if (col === "impressions")  return <TableCell key="impressions"  className={`${baseClass} py-3`}>{fmt(data.impressions)}</TableCell>;
                        if (col === "views")        return <TableCell key="views"        className={`${baseClass} py-3`}>{fmt(data.views)}</TableCell>;
                        if (col === "clicks")       return <TableCell key="clicks"       className={`${baseClass} py-3`}>{fmt(data.clicks)}</TableCell>;
                        if (col === "cpv")          return <TableCell key="cpv"          className={`${baseClass} py-3`}>{fmtKrw(data.cpv)}</TableCell>;
                        if (col === "ctrVtr")       return <TableCell key="ctrVtr"       className={`${baseClass} py-3`}>{data.vtr}% / {data.ctr}%</TableCell>;
                        if (col === "conversions")  return <TableCell key="conversions"  className={`${baseClass} py-3`}>{fmt(data.conversions || 0)}</TableCell>;
                        if (col === "conversionRevenue") return <TableCell key="conversionRevenue" className={`${baseClass} py-3`}>{fmtKrw(data.conversionRevenue || 0)}</TableCell>;
                        if (col === "roas")         return <TableCell key="roas"         className={`${baseClass} py-3 ${roasHighlight}`}>
                          {data.roas > 0 ? `${data.roas}%` : "-"}
                        </TableCell>;
                        if (col === "signupCorporate") return <TableCell key="signupCorporate" className={`${baseClass} py-3`}>{fmt(data.signupCorporate || 0)}</TableCell>;
                        if (col === "signupPersonal")  return <TableCell key="signupPersonal"  className={`${baseClass} py-3`}>{fmt(data.signupPersonal || 0)}</TableCell>;
                        if (col === "leadsCollected")  return <TableCell key="leadsCollected"  className={`${baseClass} py-3`}>{fmt(data.leadsCollected || 0)}</TableCell>;
                        return <TableCell key={col} className={`${baseClass} py-3`}>{fmt(data.extra?.[col] || 0)}</TableCell>;
                      });

                    return (
                      <TableRow
                        key={`row_${i}_${row.dateLabel}_${row.medium}_${row.mediumDetail}`}
                        className={`border-gray-100 text-[13px] hover:bg-gray-50/50 ${row.isSubtotal ? "bg-red-50/40 border-t-2 border-red-100" : ""}`}
                      >
                        {row.isSubtotal ? (
                          filterMedium === "none" ? (
                            <TableCell className="font-bold text-red-900 text-[13px] align-middle py-3 whitespace-nowrap">
                              {row.dateLabel}
                            </TableCell>
                          ) : (
                            <>
                              <TableCell className="font-bold text-red-900 text-[13px] align-middle py-3 whitespace-nowrap">
                                합계
                              </TableCell>
                              <TableCell className="font-bold text-red-900 text-[13px] align-middle py-3 whitespace-nowrap" colSpan={2}>
                                {row.dateLabel}
                              </TableCell>
                            </>
                          )
                        ) : (
                          <>
                            <TableCell className="text-gray-400 text-[13px] align-middle py-3 whitespace-nowrap">{row.dateLabel}</TableCell>
                            <TableCell className="text-gray-700 text-[13px] font-medium align-middle py-3 whitespace-nowrap">{row.medium}</TableCell>
                            <TableCell className="text-gray-600 text-[13px] align-middle py-3 whitespace-nowrap">{row.mediumDetail}</TableCell>
                          </>
                        )}
                        {/* 지표 셀들 */}
                        {renderCells(row, row.isSubtotal)}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </GlassCard>
        </div>
      )}

      {/* ════════════════════════════════════════════════════
          탭 2: 캠페인 광고 영상
      ════════════════════════════════════════════════════ */}
      {activeTab === "video" && (
        <div className="flex flex-col gap-6">
          {/* 요약 통계 */}
          {youtubeVideos.length > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <StatCard label="누적 조회수"          value={fmt(ytTotalViews)} />
              <StatCard label="누적 좋아요"           value={fmt(ytTotalLikes)} />
              <StatCard label="누적 댓글"             value={fmt(ytTotalComments)} />
              <StatCard label="조회 대비 인게이지먼트" value={pct2(ytEngagePct)}
                sub={`(좋아요+댓글) / 조회 × 100`} />
            </div>
          )}

          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-gray-900">캠페인 연계 광고 영상</h2>
            {isAdmin && (
              <div className="flex gap-2 items-center">
                <Input value={newYoutubeUrl} onChange={e => setNewYoutubeUrl(e.target.value)}
                  placeholder="유튜브 영상 URL 입력..."
                  className="h-8 w-64 bg-white border-gray-200 text-xs text-gray-900" />
                <Button size="sm" onClick={handleAddYoutube} disabled={isAddingYoutube}
                  className="h-8 bg-fursys-red hover:bg-red-700 text-white">
                  {isAddingYoutube ? <RefreshCw className="w-3 h-3 animate-spin mr-1" /> : <LinkIcon className="w-3 h-3 mr-1" />}
                  추가/수집
                </Button>
              </div>
            )}
          </div>

          {youtubeVideos.length === 0 ? (
            <GlassCard className="flex items-center justify-center p-8 text-gray-400 text-sm">
              유튜브 영상 링크를 입력하여 영상을 추가하세요.
            </GlassCard>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {youtubeVideos.map((vid: any) => {
                const eng = vid.views > 0 ? ((vid.likes + vid.comments) / vid.views * 100).toFixed(2) : "0.00";
                const pinnedComments: any[] = vid.commentsList || [];
                return (
                  <GlassCard key={vid._id} className="p-0 overflow-hidden flex flex-col">
                    {/* 상단: 썸네일 + 제목 */}
                    <div className="flex gap-4 p-4 border-b border-gray-100">
                      {vid.thumbnailUrl ? (
                        <img src={`/api/proxy-image?url=${encodeURIComponent(vid.thumbnailUrl)}`}
                          referrerPolicy="no-referrer" alt="thumb"
                          className="w-28 h-[63px] object-cover rounded-lg border border-gray-100 shrink-0" />
                      ) : (
                        <div className="w-28 h-[63px] bg-gray-100 rounded-lg shrink-0 border border-gray-100 flex items-center justify-center text-[10px] text-gray-300">No Img</div>
                      )}
                      <div className="flex flex-col justify-between flex-1 min-w-0">
                        <div>
                          <div className="flex items-center gap-1.5 mb-1">
                            <span className="px-1.5 py-0.5 bg-red-100 text-fursys-red rounded text-[10px] font-bold shrink-0">YT</span>
                            <span className="text-[10px] text-gray-400 font-mono shrink-0">{vid.uploadDate}</span>
                          </div>
                          <p className="text-sm font-bold text-gray-900 line-clamp-2 leading-snug">{vid.title}</p>
                        </div>
                        {vid.youtubeId !== "-" && (
                          <a href={`https://youtube.com/watch?v=${vid.youtubeId}`} target="_blank" rel="noreferrer"
                            className="text-[10px] text-blue-500 hover:underline mt-1">🔗 영상 보러가기</a>
                        )}
                      </div>
                      <button onClick={() => { if (confirm("삭제하시겠습니까?")) deleteYouTubeVideo({ videoId: vid._id }); }}
                        className="shrink-0 p-1 rounded hover:bg-red-50 text-gray-300 hover:text-red-400 self-start">
                        <Trash className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {/* 통계 행 */}
                    <div className="grid grid-cols-4 divide-x divide-gray-100 border-b border-gray-100">
                      {[
                        { label: "조회수",        value: fmt(vid.views) },
                        { label: "좋아요",         value: `👍 ${fmt(vid.likes)}` },
                        { label: "댓글",           value: fmt(vid.comments) },
                        { label: "인게이지먼트",   value: `${eng}%`, highlight: true },
                      ].map(stat => (
                        <div key={stat.label} className="flex flex-col items-center py-2.5 px-1">
                          <span className="text-[10px] text-gray-400 mb-0.5">{stat.label}</span>
                          <span className={`text-sm font-bold font-mono ${stat.highlight ? "text-fursys-red" : "text-gray-900"}`}>{stat.value}</span>
                        </div>
                      ))}
                    </div>

                    {/* 주요 댓글 */}
                    <div className="flex-1 p-4">
                      {(() => {
                        const isAutoFetching = autoFetchingIds.has(vid._id);
                        return (
                          <>
                            <div className="flex items-center justify-between mb-2.5">
                              <span className="text-xs font-semibold text-gray-700 flex items-center gap-1.5">
                                <MessageSquare className="w-3.5 h-3.5 text-gray-400" />
                                주요 댓글
                                {isAutoFetching && (
                                  <RefreshCw className="w-3 h-3 animate-spin text-gray-400" />
                                )}
                                {!isAutoFetching && pinnedComments.length > 0 && (
                                  <span className="text-[10px] text-gray-400">({pinnedComments.length}개)</span>
                                )}
                              </span>
                              {!isAutoFetching && (
                                <button
                                  onClick={() => setCommentModal({ type: "yt", id: vid._id, title: vid.title, url: `https://youtube.com/watch?v=${vid.youtubeId}`, commentsList: pinnedComments, isLoading: pinnedComments.length === 0 })}
                                  className="text-[10px] text-fursys-red hover:underline font-medium"
                                >
                                  {pinnedComments.length > 0 ? "전체 보기 / 새로고침" : "직접 수집하기"}
                                </button>
                              )}
                            </div>
                            {isAutoFetching ? (
                              <div className="flex items-center justify-center py-5 text-[11px] text-gray-400 bg-gray-50 rounded-lg border border-gray-100 gap-2">
                                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                댓글을 수집하는 중입니다...
                              </div>
                            ) : pinnedComments.length > 0 ? (
                              <div className="space-y-2">
                                {pinnedComments.slice(0, 3).map((c: any, i: number) => (
                                  <div key={i} className="bg-gray-50 rounded-lg px-3 py-2 border border-gray-100">
                                    <div className="flex items-center justify-between mb-1">
                                      <span className="text-[11px] font-semibold text-gray-700 truncate">{c.author || "익명"}</span>
                                      <div className="flex items-center gap-2 text-[10px] text-gray-400 shrink-0 ml-2">
                                        {c.likes !== undefined && <span>👍 {c.likes}</span>}
                                        {c.date && <span>{c.date}</span>}
                                      </div>
                                    </div>
                                    <p className="text-xs text-gray-600 leading-relaxed line-clamp-2">{c.text}</p>
                                  </div>
                                ))}
                                {pinnedComments.length > 3 && (
                                  <button
                                    onClick={() => setCommentModal({ type: "yt", id: vid._id, title: vid.title, url: `https://youtube.com/watch?v=${vid.youtubeId}`, commentsList: pinnedComments, isLoading: false })}
                                    className="w-full text-[11px] text-gray-400 hover:text-fursys-red transition-colors py-1"
                                  >
                                    +{pinnedComments.length - 3}개 댓글 더 보기
                                  </button>
                                )}
                              </div>
                            ) : (
                              <div className="flex items-center justify-center py-4 text-[11px] text-gray-300 bg-gray-50 rounded-lg border border-dashed border-gray-200">
                                댓글을 가져오지 못했습니다. 직접 수집해 주세요.
                              </div>
                            )}
                          </>
                        );
                      })()}
                    </div>
                  </GlassCard>
                );
              })}
            </div>
          )}

          {/* 댓글 종합 분석 */}
          {youtubeVideos.some((v: any) => v.commentsList?.length) && (
            <CommentAnalysisSection
              title="광고 영상 댓글 종합 분석"
              comments={youtubeVideos.flatMap((v: any) => v.commentsList || [])}
            />
          )}
        </div>
      )}

      {/* ════════════════════════════════════════════════════
          탭 3: 바이럴 컨텐츠 성과
      ════════════════════════════════════════════════════ */}
      {activeTab === "viral" && (
        <div className="flex flex-col gap-6">
          {/* 요약 통계 */}
          {viralContents.length > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <StatCard label="누적 조회수"          value={fmt(viralTotalViews)} />
              <StatCard label="누적 좋아요"           value={fmt(viralTotalLikes)} />
              <StatCard label="누적 댓글"             value={fmt(viralTotalComments)} />
              <StatCard label="조회 대비 인게이지먼트" value={pct2(viralEngagePct)}
                sub="(좋아요+댓글) / 조회 × 100" />
            </div>
          )}

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <h2 className="text-xl font-bold text-gray-900">바이럴 컨텐츠 성과</h2>
              <div className="flex items-center gap-2">
                <select className="bg-white border border-gray-200 text-gray-700 text-xs rounded p-1.5 outline-none"
                  value={filterMonth} onChange={e => setFilterMonth(e.target.value)}>
                  <option value="all">전체 월</option>
                  {viralMonths.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
                <select className="bg-white border border-gray-200 text-gray-700 text-xs rounded p-1.5 outline-none"
                  value={filterPlatform} onChange={e => setFilterPlatform(e.target.value)}>
                  <option value="all">전체 플랫폼</option>
                  {viralPlatforms.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
            </div>
            {isAdmin && (
              <div className="flex gap-2">
                <Button size="sm" variant="outline" className="border-gray-200 text-gray-700 hover:bg-gray-100"
                  onClick={() => setShowConfig({ type: "viral", source: "excel" })}>
                  <UploadCloud className="w-4 h-4 mr-2" /> 엑셀 파일
                </Button>
                <Button size="sm" className="bg-[#0F9D58] hover:bg-[#0b7a45] text-white border-0"
                  onClick={() => setShowConfig({ type: "viral", source: "sheet" })}>
                  <FileSpreadsheet className="w-4 h-4 mr-2" /> 구글 시트
                </Button>
              </div>
            )}
          </div>

          {showConfig?.type === "viral" && (
            <GlassCard className="p-4 border-dashed bg-gray-50 animate-in slide-in-from-top-2">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-semibold text-gray-900">바이럴 데이터 소스 연동</span>
                <div className="flex items-center gap-2">
                  {viralContents.length > 0 && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={async () => {
                        if (confirm("모든 바이럴 데이터를 삭제하시겠습니까?")) {
                          await clearViralContents({ campaignId });
                          setShowConfig(null);
                        }
                      }}
                      className="text-red-500 hover:text-red-700 hover:bg-red-50 text-xs h-8"
                    >
                      <Trash className="w-3.5 h-3.5 mr-1" /> 데이터 삭제
                    </Button>
                  )}
                  <button onClick={() => setShowConfig(null)}><X className="w-4 h-4 text-gray-400" /></button>
                </div>
              </div>
              {showConfig.source === "sheet" ? (
                <div className="flex flex-col gap-2">
                  <div className="flex gap-2">
                    <Input value={sheetUrl} onChange={e => setSheetUrl(e.target.value)}
                      placeholder="스프레드시트 URL..." className="bg-white border-gray-200 text-xs text-gray-900" />
                    <Button size="sm" onClick={() => handleSheetSync("viral")} disabled={isSyncing}
                      className="bg-white text-black whitespace-nowrap border border-gray-200">
                      {isSyncing ? <RefreshCw className="w-4 h-4 animate-spin" /> : "가져오기"}
                    </Button>
                  </div>
                  <p className="text-[10px] text-gray-400">* AI가 컬럼을 자동 감지하고 매핑 미리보기를 생성합니다.</p>
                </div>
              ) : (
                <input type="file" accept=".xlsx,.xls,.csv" ref={fileInputRef}
                  onChange={e => handleExcelUpload(e, "viral")}
                  className="text-xs text-gray-600 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-gray-100 file:text-gray-900" />
              )}
            </GlassCard>
          )}

          <GlassCard className="p-0 overflow-hidden min-h-[120px]">
            {groupedViral.length === 0 ? (
              <div className="flex items-center justify-center h-[120px] text-gray-400 text-sm">데이터를 연동해 주세요.</div>
            ) : (
              <Table>
                <TableHeader className="bg-gray-50">
                  <TableRow className="border-gray-100 hover:bg-transparent">
                    <TableHead className="text-gray-500 text-xs">업로드</TableHead>
                    <TableHead className="text-gray-500 text-xs">플랫폼</TableHead>
                    <TableHead className="text-gray-500 text-xs">크리에이터</TableHead>
                    <TableHead className="text-gray-500 text-xs">콘텐츠 제목</TableHead>
                    <TableHead className="text-right text-gray-500 text-xs">조회수</TableHead>
                    <TableHead className="text-right text-gray-500 text-xs">좋아요</TableHead>
                    <TableHead className="text-right text-gray-500 text-xs">댓글</TableHead>
                    <TableHead className="text-right text-gray-500 text-xs">인게이지먼트</TableHead>
                    <TableHead className="text-gray-500 text-xs text-center">관리</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredViral.map(row => {
                    const isEditing = editingViralId === row._id;
                    const eng = row.views > 0 ? ((row.likes + row.comments) / row.views * 100).toFixed(2) : "0.00";
                    const isAutoFetchingViral = autoFetchingIds.has(row._id);
                    const hasComments = (row.commentsList?.length ?? 0) > 0;
                    return (
                      <TableRow key={row._id} className="border-gray-100 hover:bg-gray-50 text-sm">
                        <TableCell className="text-gray-400 font-mono text-xs">{row.dateLabel}</TableCell>
                        <TableCell>
                          <span className="bg-gray-100 px-2 py-0.5 rounded text-xs text-gray-700">{row.platform}</span>
                        </TableCell>
                        <TableCell className="font-medium text-gray-900">
                          {isEditing
                            ? <Input value={editViralForm.creator} onChange={e => setEditViralForm({ ...editViralForm, creator: e.target.value })} className="h-6 text-xs w-20 bg-transparent border-gray-200" />
                            : row.creator}
                        </TableCell>
                        <TableCell className="max-w-[200px]">
                          {isEditing ? (
                            <Input placeholder="URL" value={editViralForm.url || ""} onChange={e => setEditViralForm({ ...editViralForm, url: e.target.value })} className="h-6 text-xs bg-transparent border-gray-200" />
                          ) : (
                            <div className="flex items-center gap-3">
                              {row.thumbnailUrl ? (
                                <img src={`/api/proxy-image?url=${encodeURIComponent(row.thumbnailUrl)}`} referrerPolicy="no-referrer" alt="thumb" className="w-14 h-14 object-cover rounded-md border border-gray-100 shrink-0" />
                              ) : (
                                <div className="w-14 h-14 bg-gray-100 rounded-md shrink-0 border border-gray-100 flex items-center justify-center text-[10px] text-gray-300">No Img</div>
                              )}
                              <div className="flex flex-col gap-1 overflow-hidden">
                                <div className="font-bold text-xs truncate max-w-[130px]" title={row.title !== "-" ? row.title : "제목 없음"}>
                                  {row.title !== "-" ? row.title : "제목 없음"}
                                </div>
                                {row.url ? <a href={row.url} target="_blank" rel="noreferrer" className="text-[10px] text-blue-500 hover:underline truncate">🔗 컨텐츠 보러가기</a> : null}
                              </div>
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-mono text-gray-900">
                          {isEditing ? <Input value={editViralForm.views} onChange={e => setEditViralForm({ ...editViralForm, views: e.target.value })} className="h-6 text-xs w-16 text-right bg-transparent border-gray-200 ml-auto" /> : fmt(row.views)}
                        </TableCell>
                        <TableCell className="text-right font-mono text-gray-700">
                          {isEditing ? <Input placeholder="Likes" value={editViralForm.likes} onChange={e => setEditViralForm({ ...editViralForm, likes: e.target.value })} className="h-6 text-xs w-12 text-right bg-transparent border-gray-200 ml-auto" /> : `👍 ${fmt(row.likes)}`}
                        </TableCell>
                        <TableCell className="text-right font-mono text-gray-700">
                          {isEditing ? (
                            <Input placeholder="Comms" value={editViralForm.comments} onChange={e => setEditViralForm({ ...editViralForm, comments: e.target.value })} className="h-6 text-xs w-12 text-right bg-transparent border-gray-200 ml-auto" />
                          ) : isAutoFetchingViral ? (
                            <div className="flex items-center gap-1 ml-auto text-gray-400 justify-end">
                              <RefreshCw className="w-3 h-3 animate-spin" />
                              <span className="text-[10px]">수집 중</span>
                            </div>
                          ) : (
                            <button
                              onClick={() => setCommentModal({ type: "viral", id: row._id, title: row.title !== "-" ? row.title : row.creator, url: row.url, commentsList: row.commentsList || [], isLoading: !hasComments })}
                              className={cn(
                                "flex items-center gap-1 ml-auto transition-colors",
                                hasComments ? "text-indigo-500 hover:text-indigo-700" : "text-gray-700 hover:text-fursys-red"
                              )}>
                              <MessageSquare className="w-3.5 h-3.5" />
                              {fmt(row.comments)}
                            </button>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-bold text-fursys-red">{eng}%</TableCell>
                        <TableCell className="text-center w-[110px]">
                          <div className="flex items-center justify-center gap-1">
                            {isEditing ? (
                              <>
                                <button onClick={async () => { await updateViralRow({ viralId: editingViralId as Id<"viralContents">, updates: { url: editViralForm.url, creator: editViralForm.creator, views: processNumber(editViralForm.views), likes: processNumber(editViralForm.likes), comments: processNumber(editViralForm.comments) } }); setEditingViralId(null); }} className="p-1 rounded hover:bg-gray-100 text-green-500"><Check className="w-4 h-4" /></button>
                                <button onClick={() => setEditingViralId(null)} className="p-1 rounded hover:bg-gray-100 text-gray-400"><X className="w-4 h-4" /></button>
                              </>
                            ) : (
                              <>
                                {row.url && (
                                  <button onClick={() => handleFetchSnsStats(row._id, row.url)} className="p-1 rounded hover:bg-gray-100 text-blue-400" title="자동 수집">
                                    {isFetchingUrl === row._id ? <RefreshCw className="w-4 h-4 animate-spin" /> : <LinkIcon className="w-4 h-4" />}
                                  </button>
                                )}
                                <button onClick={() => { setEditingViralId(row._id); setEditViralForm({ ...row }); }} className="p-1 rounded hover:bg-gray-100 text-gray-400"><Pencil className="w-4 h-4" /></button>
                                <button onClick={() => { if (confirm("삭제하시겠습니까?")) deleteViralRow({ viralId: row._id }); }} className="p-1 rounded hover:bg-red-50 text-red-400"><Trash className="w-4 h-4" /></button>
                              </>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </GlassCard>

          {/* 바이럴 댓글 종합 분석 */}
          {viralContents.some((v: any) => v.commentsList?.length) && (
            <CommentAnalysisSection
              title="바이럴 컨텐츠 댓글 종합 분석"
              comments={viralContents.flatMap((v: any) => v.commentsList || [])}
            />
          )}
        </div>
      )}

      {/* ── 항목 편집 모달 (두 가지 설정: 뷰어 노출 + 기본 체크) ── */}
      {isAdmin && showItemEditPanel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
          <div className="bg-white rounded-2xl p-6 w-[480px] shadow-2xl border border-gray-100">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-gray-900 text-sm flex items-center gap-2">
                <SlidersHorizontal className="w-4 h-4 text-fursys-red" /> 뷰어 항목 설정
              </h3>
              <button onClick={() => setShowItemEditPanel(false)}><X className="w-4 h-4 text-gray-400 hover:text-gray-700" /></button>
            </div>
            {/* 컬럼 헤더 */}
            <div className="flex items-center gap-2 mb-2 px-3 pb-2 border-b border-gray-100">
              <span className="flex-1 text-xs font-semibold text-gray-500">항목</span>
              <span className="text-xs font-semibold text-gray-400 text-center w-16">뷰어 노출</span>
              <span className="text-xs font-semibold text-gray-400 text-center w-16">기본 체크</span>
            </div>
            <div className="flex flex-col gap-1.5 mb-4 max-h-[360px] overflow-y-auto pr-1">
              {([
                ...ALL_CHART_ITEMS,
                { key: "cpm_chart", label: "CPM (단가)" },
                { key: "cpv_chart", label: "CPV (단가)" },
                { key: "cpc_chart", label: "CPC (단가)" },
              ] as { key: string; label: string }[]).map(item => {
                const isItemOn = !!draftItems[item.key];
                return (
                  <div key={item.key} className="flex items-center gap-2 bg-gray-50 hover:bg-gray-100 rounded-lg px-3 py-2 transition-colors border border-gray-100">
                    <span className="flex-1 text-sm font-medium text-gray-800">{item.label}</span>
                    {/* 설정A: 뷰어 노출 */}
                    <div className="flex justify-center w-16">
                      <input
                        type="checkbox"
                        checked={isItemOn}
                        onChange={e => {
                          const on = e.target.checked;
                          setDraftItems(prev => ({ ...prev, [item.key]: on }));
                          if (!on) setDraftDefaults(prev => ({ ...prev, [item.key]: false }));
                        }}
                        className="accent-fursys-red w-4 h-4 cursor-pointer"
                      />
                    </div>
                    {/* 설정B: 기본 체크 (뷰어 노출 꺼지면 비활성) */}
                    <div className="flex justify-center w-16">
                      <input
                        type="checkbox"
                        checked={!!draftDefaults[item.key]}
                        disabled={!isItemOn}
                        onChange={e => setDraftDefaults(prev => ({ ...prev, [item.key]: e.target.checked }))}
                        className="w-4 h-4 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                        style={{ accentColor: isItemOn ? '#DC2626' : undefined }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="text-xs text-gray-500 bg-blue-50 rounded-lg px-3 py-2.5 border border-blue-100 mb-4 leading-relaxed">
              <span className="font-semibold text-blue-600">뷰어 노출</span> — 뷰어 화면에 항목을 표시합니다.<br/>
              <span className="font-semibold text-blue-600">기본 체크</span> — 뷰어 첫 접속 시 체크 상태. 뷰어도 직접 변경 가능합니다.
            </div>
            <div className="flex items-center justify-end gap-2 pt-3 border-t border-gray-100">
              {itemEditSaved && (
                <span className="text-xs text-green-500 font-medium flex items-center gap-1 mr-auto">
                  <Check className="w-3 h-3" /> 저장됨
                </span>
              )}
              <Button variant="ghost" size="sm" onClick={() => setShowItemEditPanel(false)}>취소</Button>
              <Button size="sm" onClick={() => {
                try {
                  localStorage.setItem(VIEWER_ITEMS_LS_KEY, JSON.stringify(draftItems));
                  localStorage.setItem(VIEWER_DEFAULT_LS_KEY, JSON.stringify(draftDefaults));
                } catch {}
                setViewerItems({ ...draftItems });
                setViewerDefaults({ ...draftDefaults });
                // 관리자 chartMetrics = draftDefaults 기준으로 동기화 (extra_ 유지)
                setChartMetrics(prev => {
                  const next: Record<string, boolean> = { ...draftDefaults };
                  for (const [k, v] of Object.entries(prev)) {
                    if (k.startsWith("extra_")) next[k] = v;
                  }
                  return next;
                });
                setItemEditSaved(true);
                setTimeout(() => { setItemEditSaved(false); setShowItemEditPanel(false); }, 1400);
              }} className="bg-fursys-red hover:bg-red-700 text-white">
                저장
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── 바이럴 컬럼 매핑 모달 ── */}
      {previewData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4">
          <div className="bg-white border border-gray-100 rounded-2xl p-6 w-[820px] max-h-[90vh] flex flex-col shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg text-gray-900 font-bold flex items-center gap-2">
                <Settings2 className="w-5 h-5 text-fursys-red" /> 바이럴 컨텐츠 컬럼 매핑
              </h3>
              <button onClick={() => { setPreviewData(null); setMapping({}); }}>
                <X className="w-5 h-5 text-gray-400 hover:text-gray-700" />
              </button>
            </div>
            {isGuessingCols ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3">
                <RefreshCw className="w-7 h-7 animate-spin text-fursys-red" />
                <p className="text-sm text-gray-400">AI가 시트 구조를 분석 중...</p>
              </div>
            ) : (
              <>
                <p className="text-sm text-gray-400 mb-5">AI가 열을 자동 감지했습니다. 확인 후 수정해주세요.</p>
                <div className="flex gap-6 overflow-hidden flex-1">
                  <div className="w-1/2 flex flex-col gap-2 overflow-y-auto pr-2">
                    {renderMappingSelect("date", "업로드 일자", false)}
                    {renderMappingSelect("platform", "플랫폼/채널", false)}
                    {renderMappingSelect("creator", "크리에이터", true)}
                    {renderMappingSelect("url", "게시물 URL")}
                  </div>
                  <div className="w-1/2 flex flex-col border-l border-gray-100 pl-6 overflow-y-auto">
                    <span className="text-gray-500 text-xs font-semibold uppercase tracking-wider mb-2">미리보기 (상위 5행)</span>
                    <div className="bg-gray-50 p-3 rounded-lg overflow-x-auto border border-gray-100">
                      <table className="text-xs text-gray-700 w-full text-left border-collapse">
                        <thead>
                          <tr>{Array.from({ length: Math.min(numCols, 12) }).map((_, i) => (
                            <th key={i} className="border-b border-gray-200 pb-2 px-1 text-gray-400 font-mono font-normal whitespace-nowrap">
                              {i + 1}열({String.fromCharCode(65 + i)})
                            </th>
                          ))}</tr>
                        </thead>
                        <tbody>
                          {previewData.slice(0, 5).map((row, rIdx) => (
                            <tr key={rIdx}>{Array.from({ length: Math.min(numCols, 12) }).map((_, cIdx) => (
                              <td key={cIdx} className="py-1.5 px-1 border-b border-gray-100 truncate max-w-[80px]">
                                {row[cIdx] !== undefined ? String(row[cIdx]) : ""}
                              </td>
                            ))}</tr>
                          ))}
                        </tbody>
                      </table>
                      {numCols > 12 && <div className="text-gray-300 text-xs mt-2 text-center">... (이후 열 생략)</div>}
                    </div>
                  </div>
                </div>
                <div className="flex gap-3 justify-end mt-6 pt-4 border-t border-gray-100">
                  <Button variant="ghost" onClick={() => { setPreviewData(null); setMapping({}); }} className="text-gray-400">취소</Button>
                  <Button onClick={handleConfirmMapping} disabled={Object.values(mapping).length === 0 || isSyncing}
                    className="bg-fursys-red hover:bg-red-700 text-white">
                    {isSyncing ? <RefreshCw className="w-4 h-4 animate-spin mr-2" /> : <Check className="w-4 h-4 mr-2" />}
                    매핑 확인 및 동기화
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── 댓글 모달 ── */}
      {commentModal && (
        <CommentsModal
          title={commentModal.title}
          commentsList={commentModal.commentsList}
          isLoading={commentModal.isLoading}
          errorMsg={commentModal.error}
          onClose={() => setCommentModal(null)}
          onFetch={fetchComments}
        />
      )}
    </div>
  );
}
