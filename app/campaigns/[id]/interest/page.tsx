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
  Star, Quote, ArrowUpRight, Crown, Edit2, ExternalLink, Trash2, Plus, ChevronDown, ChevronUp, ClipboardList
} from "lucide-react";
import {
  BarChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Legend, ComposedChart, Cell, PieChart as RechartsPieChart, Pie
} from "recharts";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";

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

// 다양한 타임스탬프/날짜 포맷 → YYYY-MM-DD 변환
// 처리: "2026-05-30 14:23", "2026/5/30 오후 2:23", "2026. 5. 30.", "5/30/2026 14:23"
function extractDate(raw: string): string {
  if (!raw) return "";
  const s = raw.trim();
  // YYYY-MM-DD or YYYY/MM/DD or YYYY. M. D
  const m1 = s.match(/(\d{4})[-\/.](\s*\d{1,2})[-\/.\s]\s*(\d{1,2})/);
  if (m1) return `${m1[1]}-${m1[2].trim().padStart(2, "0")}-${m1[3].trim().padStart(2, "0")}`;
  // M/D/YYYY
  const m2 = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m2) return `${m2[3]}-${m2[1].padStart(2, "0")}-${m2[2].padStart(2, "0")}`;
  return "";
}

// CSV 파싱 (쌍따옴표로 묶인 필드 지원)
function parseCsv(text: string): string[][] {
  return text.split("\n").map(line => {
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
}

// 날짜 문자열 → YYYY-MM-DD 정규화 (MM/DD, YYYY/MM/DD 등 처리)
function normalizeDate(raw: string): string {
  if (!raw) return "";
  raw = raw.trim();
  
  // 1. YYYY-MM-DD 형식 검증
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  
  // 2. YYYY.MM.DD 또는 YYYY/MM/DD 형식 처리
  const ymdMatch = raw.match(/^(\d{4})[\/\.](\d{1,2})[\/\.](\d{1,2})/);
  if (ymdMatch) {
    return `${ymdMatch[1]}-${ymdMatch[2].padStart(2, "0")}-${ymdMatch[3].padStart(2, "0")}`;
  }
  
  // 3. MM/DD 또는 MM.DD 형식 처리 (뒤에 요일이나 설명이 붙어있어도 매치되도록)
  const mmddMatch = raw.match(/^(\d{1,2})[\/\.]\s*(\d{1,2})/);
  if (mmddMatch) {
    const y = new Date().getFullYear();
    return `${y}-${mmddMatch[1].padStart(2, "0")}-${mmddMatch[2].padStart(2, "0")}`;
  }
  
  // 4. 일반적인 Date 파싱 시도 (KST 안전 처리를 위해 T00:00:00 추가)
  try {
    const cleaned = raw.replace(/[^\d\-\/]/g, "");
    if (cleaned) {
      const d = new Date(cleaned.includes("-") ? cleaned + "T00:00:00" : (cleaned.includes("/") ? cleaned : cleaned.slice(0, 4) + "-" + cleaned.slice(4, 6) + "-" + cleaned.slice(6, 8) + "T00:00:00"));
      if (!isNaN(d.getTime())) return d.toISOString().split("T")[0];
    }
  } catch {}
  return "";
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
function KeywordBubbles({
  keywords,
  selectedKeyword,
  onSelectKeyword
}: {
  keywords: { text: string; weight: number }[];
  selectedKeyword: string | null;
  onSelectKeyword: (kw: string | null) => void;
}) {
  const max = Math.max(...keywords.map(k => k.weight));
  const colors = ["#e50010", "#ef4444", "#f97316", "#f59e0b", "#8b5cf6", "#6366f1", "#3b82f6"];
  const isAnySelected = selectedKeyword !== null;
  return (
    <div className="flex flex-wrap gap-3 items-end py-3">
      {[...keywords].sort((a, b) => b.weight - a.weight).map((kw, i) => {
        const ratio = kw.weight / max;
        const fontSize = Math.round(11 + ratio * 11);
        const px = Math.round(10 + ratio * 8);
        const py = Math.round(5 + ratio * 5);
        const isSelected = selectedKeyword === kw.text;
        const isDimmed = isAnySelected && !isSelected;
        return (
          <button
            key={i}
            type="button"
            onClick={() => onSelectKeyword(isSelected ? null : kw.text)}
            className={cn(
              "flex flex-col items-center gap-1 transition-all duration-200 active:scale-95 outline-none cursor-pointer",
              isDimmed ? "opacity-35" : "opacity-100 hover:scale-105"
            )}
          >
            <span
              className={cn(
                "rounded-full font-bold text-white shadow-md whitespace-nowrap border-2",
                isSelected ? "border-gray-900 scale-105" : "border-transparent"
              )}
              style={{
                backgroundColor: colors[i % colors.length],
                fontSize: `${fontSize}px`,
                padding: `${py}px ${px}px`,
              }}
            >
              {kw.text}
            </span>
            <span className="text-[10px] font-mono text-gray-400 font-semibold">{kw.weight}%</span>
          </button>
        );
      })}
    </div>
  );
}

// ─── 리뷰 키워드 버블 차트 ──────────────────────────────────────────
function ReviewKeywordBubbles({ keywords }: {
  keywords: { text: string; count: number; posCount: number; negCount: number; sentiment: "positive" | "negative" }[];
}) {
  const max = Math.max(...keywords.map(k => k.count), 1);
  return (
    <div className="flex flex-wrap gap-3 justify-center items-center py-4 min-h-[180px]">
      {[...keywords].sort((a, b) => b.count - a.count).map((kw, i) => {
        const ratio = kw.count / max;
        const size = Math.round(64 + ratio * 80);   // 64 – 144px
        const fs   = Math.round(10 + ratio * 7);    // 10 – 17px
        // 빈도 높을수록 진한 색 (lightness 낮아짐)
        const hue  = kw.sentiment === "positive" ? 142 : 0;
        const sat  = kw.sentiment === "positive" ? "60%" : "70%";
        const lit  = `${68 - Math.round(ratio * 26)}%`;
        const bg   = `hsl(${hue},${sat},${lit})`;
        return (
          <div
            key={i}
            className="rounded-full flex flex-col items-center justify-center text-center
                       hover:scale-110 active:scale-95 transition-transform cursor-default flex-shrink-0
                       shadow-sm select-none"
            style={{ width: size, height: size, backgroundColor: bg }}
            title={`${kw.text}: 총 ${kw.count}건 (긍정 ${kw.posCount} / 부정 ${kw.negCount})`}
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

// ─── 네이버 리뷰 분석기 ─────────────────────────────────────────────
// ─── 리뷰 감성 분석 헬퍼 ─────────────────────────────────────────────

// 긍정 시그널 단어 (문맥 의존 낮은 것만)
const POS_WORDS = [
  "좋아", "좋았", "좋은", "좋습", "예쁘", "친절", "최고", "대박", "추천",
  "만족", "훌륭", "깔끔", "편안", "편리", "재밌", "즐거", "행복", "완벽",
  "굿", "멋지", "멋있", "감동", "아늑", "쾌적", "깨끗", "강추",
  "재방문", "기대이상", "감사", "고마", "설레", "기쁘", "탁월", "뛰어",
];

// 부정 시그널 단어 (명백한 부정 감정만, 주제어·조사 제외)
const NEG_WORDS = [
  "불편", "별로", "아쉽", "실망", "나쁘", "최악", "더럽", "지저분",
  "불친절", "부족", "불만", "짜증", "불쾌", "후회", "비추", "다시는",
  "안올", "안 올", "오래 걸", "느리", "시끄럽", "낡은", "노후",
];

// 감성 점수 기반 분류 (단어 개수 비교)
function classifySentiment(text: string): "positive" | "negative" {
  const posScore = POS_WORDS.reduce((s, w) => s + (text.includes(w) ? 1 : 0), 0);
  const negScore = NEG_WORDS.reduce((s, w) => s + (text.includes(w) ? 1 : 0), 0);
  return negScore > posScore ? "negative" : "positive";
}

// 한국어 불용어 — 마케팅 인사이트 무관 어휘 제외 기준
const KR_STOPWORDS = new Set([
  // ① 대명사
  "나는","나도","나를","내가","우리","누구","모두","한명","저는","저도","저를",
  "이분","본인","저희","그분","당신","자신","자기",
  // ② 지시어·관계어
  "이런","저런","그런","어떤","이렇게","저렇게","그렇게","이게","저게","그게",
  "이렇","저렇","그렇","어떻","이것","저것","그것","이때","그때","저때",
  "여기","거기","저기","이곳","그곳","저곳","뭔가","뭔지","뭔데",
  // ③ 단순 접속어·접속조사
  "그리고","하지만","그래서","때문에","그러나","그런데","그러면","그러므로",
  "또한","따라서","즉","반면","결국",
  // ④ 단독 감탄사·강조 부사 (수식어 없이 단독)
  "너무","정말","진짜","매우","아주","조금","가장","항상","자주","거의",
  "바로","다시","함께","계속","이미","워낙","특히","주로","보통","온전히",
  "완전히","전혀","확실히","직접","잠깐","그냥","약간","잠시","참으로",
  // ⑤ 맥락 없는 단독 동사·활용형
  "있는","없는","하는","되는","같은","보고","해서","하고","하면","되어",
  "하여","이고","이며","이라","이어","봐서","보니","같이","처럼",
  "했고","했던","됐고","됐던","있었","없었","했어","됐어",
  "되고","있고","보면","하면","같고","알고",
  // ⑥ 추상명사·고빈도 일반명사 (맥락 의존도 높음)
  "마음","생각","느낌","부분","내용","정도","모습","이후","이전","현재",
  "다음","오늘","어제","것이","것도","것은","때문","위해","통해","대해",
  "하나","여러","모든","각각","이번","저번","요즘",
  "사람","경우","방법","이유","문제","결과","상황","관련","특성",
  "방향","수준","이상","이하","기준","측면","입장","관계",
]);

// 조사·어미 제거 (공간을→공간, 한강이→한강, 봄이→봄)
function stripParticle(word: string): string {
  const endings = [
    "으로", "에서", "에게", "부터", "까지", "인가",
    "을","를","이","가","은","는","에","의","로","와","과","도","만","서","게","고","며","나","라","야","아","까","상","적",
  ];
  for (const e of endings) {
    if (word.endsWith(e) && word.length > e.length) {
      const stripped = word.slice(0, -e.length);
      if (stripped.length >= 2) return stripped;
    }
  }
  return word;
}

// 동사구·활용형·부정형 패턴 포함 여부 → 마케팅 인사이트 없음
function isNounLike(word: string): boolean {
  // [최우선] 부정형 어미로 끝나는 단어
  const negEnds = [
    "않는","않아","않고","않네","않죠","않은",
    "아닌","아니고","아니야","아니죠",
    "없는","없어","없고","없네","없죠",
    "못한","못해","못하고","못하는",
  ];
  if (negEnds.some(e => word.endsWith(e))) return false;
  // ~지 로 끝나는 짧은 용언형 (보이지, 알지 등)
  if (word.endsWith("지") && word.length <= 5) return false;
  // 단독 이동·상태 동사
  const standaloneVerbs = ["갑니다","옵니다","됩니다","떠납니다","나옵니다","보이지","느껴지지","들리지"];
  if (standaloneVerbs.includes(word)) return false;
  // 기존 동사 어미 패턴
  const badEndings = [
    "할때","할수","하여","됩니","됐어","했어","입니","습니",
    "하며","하면","하지","하니","됩","됐","했","겠","였","었",
  ];
  if (badEndings.some(e => word.endsWith(e))) return false;
  const badInternals = ["할때","할수","수있","하면서","하는데","되는데"];
  if (badInternals.some(p => word.includes(p))) return false;
  return true;
}

function extractKwFromText(text: string): string[] {
  // 우선적으로 매칭할 빈출 마케팅 테마 키워드들 (사연/예약 관련)
  const THEME_KEYWORDS = [
    "체험", "포토존", "사은품", "안내", "직원", "대기", "주차", "대기시간", 
    "사전예약", "방문", "이벤트", "기념품", "굿즈", "프로그램", "대관", 
    "분위기", "가구", "의자", "퍼시스", "트로피", "브랜드", "공간", "성수", "렉처", "시상식"
  ];

  const foundKeywords = new Set<string>();
  
  // 1. 빈출 테마 키워드 사전 매칭
  THEME_KEYWORDS.forEach(kw => {
    if (text.includes(kw)) {
      foundKeywords.add(kw);
    }
  });

  // 2. 일반 2~5자 한글 명사구 정제 매칭
  const raw = text.match(/[가-힣]{2,5}/g) || [];
  for (const w of raw) {
    const clean = stripParticle(w);
    if (clean.length < 2) continue;
    if (KR_STOPWORDS.has(clean)) continue;
    if (!isNounLike(clean)) continue;
    foundKeywords.add(clean);
  }

  // 최대 6개 키워드만 반환 (다양성 제공)
  return Array.from(foundKeywords).slice(0, 6);
}

function buildAnalysis(rawReviews: { text: string; date: string; rating: number; keywords: string[] }[]) {
  const reviews = rawReviews.map(r => ({
    ...r,
    sentiment: r.text.trim() ? (classifySentiment(r.text) as "positive" | "negative") : ("positive" as "positive" | "negative"),
    keywords: r.keywords?.length ? r.keywords : extractKwFromText(r.text),
  }));

  const kwMap = new Map<string, { count: number; posCount: number }>();
  reviews.forEach(r => {
    r.keywords.forEach(rawKw => {
      const kw = stripParticle(rawKw.trim());
      if (!kw || kw.length < 2 || KR_STOPWORDS.has(kw) || !isNounLike(kw)) return;
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
      posCount: v.posCount,
      negCount: v.count - v.posCount,
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

// ── AI 키워드 추출 헬퍼 ─────────────────────────────────────────
async function fetchAIKeywords(texts: string[]): Promise<string[][]> {
  try {
    const res = await fetch("/api/extract-keywords", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ texts }),
    });
    const data = await res.json();
    if (!res.ok || !data.results) return texts.map(() => []);
    return data.results as string[][];
  } catch {
    return texts.map(() => []);
  }
}

// ─── 팝업 현장 VOC ────────────────────────────────────────────────────
function PopupVocSection({ campaignId, isAdmin }: { campaignId: string; isAdmin: boolean }) {
  const vocEntries = useQuery(api.popupVoc.getVocEntries, { campaignId: campaignId as Id<"campaigns"> }) ?? [];
  const addVoc     = useMutation(api.popupVoc.addVocEntry);
  const updateVoc  = useMutation(api.popupVoc.updateVocEntry);
  const deleteVoc  = useMutation(api.popupVoc.deleteVocEntry);

  const [showForm, setShowForm]     = useState(false);
  const [editId, setEditId]         = useState<string | null>(null);
  const [formDate, setFormDate]     = useState("");
  const [formContent, setFormContent] = useState("");
  const [saving, setSaving]         = useState(false);
  const [expanded, setExpanded]     = useState<Record<string, boolean>>({});

  // 날짜별 그룹핑 (내림차순)
  const grouped = useMemo(() => {
    const map = new Map<string, typeof vocEntries>();
    for (const e of vocEntries) {
      if (!map.has(e.date)) map.set(e.date, []);
      map.get(e.date)!.push(e);
    }
    return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [vocEntries]);

  const openAdd = () => {
    setEditId(null);
    setFormDate("");
    setFormContent("");
    setShowForm(true);
  };

  const openEdit = (entry: any) => {
    setEditId(entry._id);
    setFormDate(entry.date);
    setFormContent(entry.content);
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!formDate.trim() || !formContent.trim()) return;
    setSaving(true);
    try {
      if (editId) {
        await updateVoc({ id: editId as Id<"popupVocEntries">, date: formDate.trim(), content: formContent.trim() });
      } else {
        await addVoc({ campaignId: campaignId as Id<"campaigns">, date: formDate.trim(), content: formContent.trim() });
      }
      setShowForm(false);
      setEditId(null);
      setFormDate("");
      setFormContent("");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("이 VOC를 삭제할까요?")) return;
    await deleteVoc({ id: id as Id<"popupVocEntries"> });
  };

  const toggleDate = (date: string) =>
    setExpanded(prev => ({ ...prev, [date]: !prev[date] }));

  return (
    <GlassCard className="p-6 mt-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-5">
        <h4 className="text-sm font-bold text-gray-900 flex items-center gap-2">
          <ClipboardList className="w-4 h-4 text-gray-900" />
          현장 고객 VOC
          {vocEntries.length > 0 && (
            <span className="text-xs font-normal text-gray-400 ml-1">{vocEntries.length}건</span>
          )}
        </h4>
        {isAdmin && (
          <Button size="sm" onClick={openAdd}
            className="bg-gray-900 text-white hover:bg-gray-800 border-0 gap-1.5 text-xs h-8 px-3">
            <Plus className="w-3.5 h-3.5" /> VOC 추가
          </Button>
        )}
      </div>

      {/* 입력 폼 */}
      {showForm && (
        <div className="mb-5 bg-gray-50 border border-gray-200 rounded-xl p-4 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-700">{editId ? "VOC 수정" : "새 VOC 입력"}</span>
            <button onClick={() => { setShowForm(false); setEditId(null); }} className="text-gray-400 hover:text-gray-600">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-500 shrink-0 w-14">일자</label>
            <input
              type="date"
              className="bg-white border border-gray-200 rounded-lg px-3 py-1.5 text-xs text-gray-900 outline-none focus:border-gray-400"
              value={formDate}
              onChange={e => setFormDate(e.target.value)}
            />
          </div>
          <div className="flex gap-2 items-start">
            <label className="text-xs text-gray-500 shrink-0 w-14 pt-2">내용</label>
            <textarea
              className="flex-1 bg-white border border-gray-200 rounded-lg px-3 py-2 text-xs text-gray-900 outline-none focus:border-gray-400 resize-none leading-relaxed"
              rows={10}
              placeholder={"운영팀 현장 VOC를 입력하세요.\n\n예)\n1) 입장존에서 박수 트로피를 보고 감동받으셨다는 고객님이 계셨습니다.\n\n2) 드레스업 체험 후 결과물을 보고 모두 웃으며 매우 만족해하셨습니다."}
              value={formContent}
              onChange={e => setFormContent(e.target.value)}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" className="text-gray-500 text-xs"
              onClick={() => { setShowForm(false); setEditId(null); }}>
              취소
            </Button>
            <Button size="sm" disabled={saving || !formDate.trim() || !formContent.trim()}
              className="bg-gray-900 text-white hover:bg-gray-800 border-0 text-xs gap-1.5"
              onClick={handleSave}>
              {saving ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
              {editId ? "수정 저장" : "저장"}
            </Button>
          </div>
        </div>
      )}

      {/* 빈 상태 */}
      {vocEntries.length === 0 && !showForm && (
        <div className="flex flex-col items-center justify-center py-10 gap-2 text-gray-400">
          <ClipboardList className="w-8 h-8 opacity-30" />
          <p className="text-sm">아직 입력된 VOC가 없습니다.</p>
          {isAdmin && (
            <button onClick={openAdd} className="text-xs text-blue-500 hover:text-blue-700 underline underline-offset-2 mt-1">
              + 첫 번째 VOC 추가하기
            </button>
          )}
        </div>
      )}

      {/* 날짜별 리스트 */}
      <div className="flex flex-col gap-3">
        {grouped.map(([date, entries]) => {
          const isOpen = expanded[date] !== false; // 기본 펼침
          const displayDate = (() => {
            try {
              const d = new Date(date);
              return `${d.getMonth() + 1}/${d.getDate()} (${["일","월","화","수","목","금","토"][d.getDay()]})`;
            } catch { return date; }
          })();
          return (
            <div key={date} className="border border-gray-100 rounded-xl overflow-hidden">
              {/* 날짜 헤더 */}
              <button
                className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors"
                onClick={() => toggleDate(date)}
              >
                <div className="flex items-center gap-2">
                  <CalendarDays className="w-3.5 h-3.5 text-gray-500" />
                  <span className="text-sm font-semibold text-gray-800">{displayDate}</span>
                  <span className="text-[11px] text-gray-400">{entries.length}건</span>
                </div>
                {isOpen ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
              </button>

              {/* VOC 내용 */}
              {isOpen && (
                <div className="divide-y divide-gray-50">
                  {entries.map((entry) => (
                    <div key={entry._id} className="px-4 py-4 bg-white group">
                      <div className="flex items-start justify-between gap-3">
                        <p className="text-xs text-gray-700 leading-relaxed whitespace-pre-wrap flex-1">
                          {entry.content}
                        </p>
                        {isAdmin && (
                          <div className="flex gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onClick={() => openEdit(entry)}
                              className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-700">
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={() => handleDelete(entry._id)}
                              className="p-1 rounded hover:bg-red-50 text-gray-400 hover:text-red-500">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </div>
                      {entry.updatedAt && (
                        <p className="text-[10px] text-gray-300 mt-2">
                          수정됨 {new Date(entry.updatedAt).toLocaleDateString("ko-KR")}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </GlassCard>
  );
}

function NaverReviewAnalyzer({ autoTrigger, onNewReviews }: { autoTrigger?: number; onNewReviews?: () => void }) {
  const params = useParams();
  const analyzerCampaignId = params.id as string;
  const NAVER_URL_LS_KEY  = `naverReviewUrl_${analyzerCampaignId}`;
  const NAVER_DATA_LS_KEY = `naverReviewData_${analyzerCampaignId}`;
  const { isAdmin } = useAuth();

  // ── Convex 연동 ──
  const analyzerCampaignData = useQuery(api.campaigns.getCampaignById, { id: analyzerCampaignId as Id<"campaigns"> });
  const updateCampaignLinks  = useMutation(api.campaigns.updateCampaignLinks);

  const [naverUrl, setNaverUrl] = useState("");
  const [urlSaved, setUrlSaved] = useState(false);
  const [crawling, setCrawling] = useState(false);
  const [crawlError, setCrawlError] = useState("");
  const [pasteText, setPasteText] = useState("");
  const [showPasteArea, setShowPasteArea] = useState(false);
  const [extractingKw, setExtractingKw] = useState(false);
  // 방문자 리뷰 탭 / 블로그 리뷰 탭
  const [reviewTab, setReviewTab] = useState<"visitor" | "blog">("visitor");
  const [blogPosts, setBlogPosts] = useState<null | {
    total: number;
    posts: { id: string; title: string; text: string; blogName: string; url: string; thumbnailUrl: string; date: string; manual?: boolean }[];
    source?: string;
    searchQuery?: string;
  }>(null);
  const [showAddLink, setShowAddLink] = useState(false);
  const [addLinkUrl, setAddLinkUrl] = useState("");
  const [addLinkLoading, setAddLinkLoading] = useState(false);
  const [addLinkPreview, setAddLinkPreview] = useState<{ title: string; text: string; thumbnailUrl: string; blogName: string; date: string } | null>(null);
  const BLOG_DATA_LS_KEY = `naverBlogData_${analyzerCampaignId}`;
  const [analyzed, setAnalyzed] = useState<null | {
    total: number;
    textTotal?: number;
    keywords: { text: string; count: number; posCount: number; negCount: number; sentiment: "positive" | "negative" }[];
    reviews: { text: string; date: string; rating: number; sentiment: "positive" | "negative"; keywords: string[] }[];
    posRate: number;
    source?: string;
  }>(null);

  // ── URL 로드: Convex 우선 → localStorage fallback ──
  useEffect(() => {
    if (analyzerCampaignData === undefined) return; // 아직 로딩 중
    try {
      const convexUrl = analyzerCampaignData?.naverPlaceUrl ?? "";
      const lsUrl     = localStorage.getItem(NAVER_URL_LS_KEY) ?? "";
      const url = convexUrl || lsUrl;
      if (url) setNaverUrl(url);

      const savedData = localStorage.getItem(NAVER_DATA_LS_KEY);
      if (savedData) setAnalyzed(JSON.parse(savedData));
      const savedBlog = localStorage.getItem(BLOG_DATA_LS_KEY);
      if (savedBlog) setBlogPosts(JSON.parse(savedBlog));
    } catch {}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analyzerCampaignData, analyzerCampaignId]);

  // ── 분석 결과 변경 시 localStorage 자동 저장 ──
  useEffect(() => {
    if (analyzed) {
      try { localStorage.setItem(NAVER_DATA_LS_KEY, JSON.stringify(analyzed)); } catch {}
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analyzed]);

  useEffect(() => {
    if (blogPosts) {
      try { localStorage.setItem(BLOG_DATA_LS_KEY, JSON.stringify(blogPosts)); } catch {}
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blogPosts]);

  const saveNaverUrl = async () => {
    try {
      const trimmed = naverUrl.trim();
      // Convex + localStorage 동시 저장 → 뷰어/다기기 공유
      await updateCampaignLinks({ id: analyzerCampaignId as Id<"campaigns">, naverPlaceUrl: trimmed });
      localStorage.setItem(NAVER_URL_LS_KEY, trimmed);
      setUrlSaved(true);
      setTimeout(() => setUrlSaved(false), 2000);
    } catch {}
  };

  // ── AI 키워드 주입 후 분석 ──
  const analyzeWithAI = async (
    rawReviews: { text: string; date: string; rating: number; keywords: string[] }[],
    extraFields?: Partial<typeof analyzed>
  ) => {
    setExtractingKw(true);
    try {
      const texts = rawReviews.map(r => r.text);
      const aiKeywords = await fetchAIKeywords(texts);
      const enriched = rawReviews.map((r, i) => ({
        ...r,
        keywords: aiKeywords[i]?.length ? aiKeywords[i] : r.keywords,
      }));
      const result = buildAnalysis(enriched);
      setAnalyzed({ ...result, ...extraFields });
    } finally {
      setExtractingKw(false);
    }
  };

  // ── 크롤링 (방문자 / 블로그 공통) ──
  const crawl = async (type: "visitor" | "blog" = reviewTab) => {
    if (!naverUrl.trim()) return;
    setCrawling(true);
    setCrawlError("");
    try {
      const res = await fetch("/api/naver-reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: naverUrl.trim(), reviewType: type }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        setCrawlError(data.error || "크롤링 실패");
        return;
      }
      if (type === "blog") {
        setBlogPosts({
          total: data.total || (data.reviews?.length ?? 0),
          posts: data.reviews || [],
          source: data.source,
          searchQuery: data.searchQuery,
        });
      } else {
        await analyzeWithAI(data.reviews || [], {
          total: data.total,
          textTotal: data.textTotal,
          source: data.source,
        });
      }
    } catch (e: any) {
      setCrawlError(e.message || "네트워크 오류");
    } finally {
      setCrawling(false);
    }
  };

  // ── 자동 새로고침 트리거 — 네이버 플레이스 리뷰 재크롤 ────────────
  const prevAutoTriggerRef = useRef(0);
  useEffect(() => {
    if (!autoTrigger || autoTrigger === prevAutoTriggerRef.current) return;
    prevAutoTriggerRef.current = autoTrigger;
    const effectiveUrl = naverUrl.trim() || (analyzerCampaignData?.naverPlaceUrl?.trim() ?? "");
    if (!effectiveUrl || crawling) return;
    if (!naverUrl.trim()) setNaverUrl(effectiveUrl);
    // crawl() 직접 실행 (naverUrl 상태 업데이트 비동기 문제 우회)
    (async () => {
      setCrawling(true);
      setCrawlError("");
      try {
        const res = await fetch("/api/naver-reviews", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: effectiveUrl }),
        });
        const data = await res.json();
        if (!res.ok || data.error) { setCrawlError(data.error || "크롤링 실패"); return; }
        // NEW 뱃지: 리뷰 수 증가 감지
        try {
          const REVIEW_CNT_KEY = `dashboard_comment_count_review_${analyzerCampaignId}`;
          const savedCnt = parseInt(localStorage.getItem(REVIEW_CNT_KEY) ?? "0");
          if ((data.total ?? 0) > savedCnt) onNewReviews?.();
          localStorage.setItem(REVIEW_CNT_KEY, String(data.total ?? 0));
        } catch {}
        await analyzeWithAI(data.reviews || [], { total: data.total, textTotal: data.textTotal, source: data.source });
      } catch (e: any) {
        setCrawlError(e.message || "네트워크 오류");
      } finally {
        setCrawling(false);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoTrigger]);

  // ── 붙여넣기 분석 ──
  const analyzeFromPaste = async () => {
    const lines = pasteText.split(/\r?\n/).filter(l => l.trim().length > 5);
    if (lines.length === 0) return;
    setShowPasteArea(false);
    const raw = lines.map(line => ({
      text: line.trim(),
      date: "",
      rating: classifySentiment(line) === "positive" ? 5 : 3,
      keywords: [] as string[],
    }));
    await analyzeWithAI(raw, { source: "paste" });
  };

  const useDemo = () => setAnalyzed({
    ...buildAnalysis(MOCK_REVIEWS.map(r => ({ text: r.text, date: r.date, rating: r.rating, keywords: r.keywords }))),
    total: MOCK_REVIEW_STATS.total,
    source: "demo",
  });

  const reset = () => {
    if (reviewTab === "blog") {
      setBlogPosts(null);
      try { localStorage.removeItem(BLOG_DATA_LS_KEY); } catch {}
    } else {
      setAnalyzed(null);
      try { localStorage.removeItem(NAVER_DATA_LS_KEY); } catch {}
    }
    setCrawlError("");
    setPasteText("");
  };

  const fetchLinkPreview = async (url: string) => {
    if (!url.trim()) return;
    setAddLinkLoading(true);
    setAddLinkPreview(null);
    try {
      const res = await fetch(`/api/fetch-og?url=${encodeURIComponent(url.trim())}`);
      const data = await res.json();
      setAddLinkPreview({
        title: data.title || url,
        text: data.text || "",
        thumbnailUrl: data.thumbnailUrl || "",
        blogName: data.blogName || new URL(url).hostname.replace("www.", ""),
        date: data.date || "",
      });
    } catch {
      setAddLinkPreview({ title: url, text: "", thumbnailUrl: "", blogName: "", date: "" });
    } finally {
      setAddLinkLoading(false);
    }
  };

  const confirmAddLink = () => {
    if (!addLinkPreview) return;
    const newPost = {
      id: addLinkUrl.trim(),
      url: addLinkUrl.trim(),
      ...addLinkPreview,
      manual: true,
    };
    const updated = blogPosts
      ? { ...blogPosts, posts: [newPost, ...blogPosts.posts], total: blogPosts.total + 1 }
      : { posts: [newPost], total: 1, source: "manual" };
    setBlogPosts(updated);
    setAddLinkUrl("");
    setAddLinkPreview(null);
    setShowAddLink(false);
  };

  return (
    <GlassCard className="p-6">
      {/* 헤더 */}
      <div className="flex flex-col gap-3 mb-5 border-b border-gray-100 pb-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <h4 className="text-sm font-bold text-gray-900 flex items-center gap-2">
            <Star className="w-4 h-4 text-gray-900 fill-gray-900" /> 네이버 플레이스 리뷰 분석
          </h4>
          {reviewTab === "visitor" && analyzed && (
            <div className="flex gap-2">
              <span className="text-xs bg-green-50 text-green-700 px-2 py-1 rounded-md font-medium border border-green-100 flex items-center gap-1">
                <Smile className="w-3 h-3" /> 긍정 {analyzed.posRate}%
              </span>
              <span className="text-xs bg-red-50 text-red-700 px-2 py-1 rounded-md font-medium border border-red-100 flex items-center gap-1">
                <Frown className="w-3 h-3" /> 부정 {100 - analyzed.posRate}%
              </span>
            </div>
          )}
          {reviewTab === "blog" && blogPosts && (
            <span className="text-xs bg-blue-50 text-blue-700 px-2 py-1 rounded-md font-medium border border-blue-100">
              블로그 리뷰 {blogPosts.posts.length}건
            </span>
          )}
        </div>
        {/* 방문자 / 블로그 탭 */}
        <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit">
          {([
            { key: "visitor" as const, label: "👥 방문자 리뷰" },
            { key: "blog"    as const, label: "📝 블로그 리뷰" },
          ]).map(t => (
            <button
              key={t.key}
              onClick={() => { setReviewTab(t.key); setCrawlError(""); }}
              className={cn(
                "px-3 py-1.5 rounded-md text-xs font-semibold transition-all",
                reviewTab === t.key
                  ? "bg-white shadow-sm text-gray-900"
                  : "text-gray-500 hover:text-gray-700"
              )}
            >
              {t.label}
              {t.key === "visitor" && analyzed && (
                <span className="ml-1.5 bg-gray-200 text-gray-600 rounded-full px-1.5 text-[10px]">
                  {analyzed.total.toLocaleString()}
                </span>
              )}
              {t.key === "blog" && blogPosts && (
                <span className="ml-1.5 bg-blue-100 text-blue-600 rounded-full px-1.5 text-[10px]">
                  {blogPosts.total.toLocaleString()}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* URL 입력 + 크롤링 버튼 */}
      {isAdmin ? (
        <>
          <div className="flex gap-2 mb-1">
            <input
              className="flex-1 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-xs text-gray-900 outline-none focus:border-gray-400 placeholder:text-gray-400"
              placeholder="네이버 지도 URL 붙여넣기 (예: https://map.naver.com/v5/entry/place/12345...)"
              value={naverUrl}
              onChange={e => { setNaverUrl(e.target.value); setCrawlError(""); }}
              onKeyDown={e => e.key === "Enter" && crawl()}
            />
            <Button
              size="sm"
              disabled={!naverUrl.trim() || crawling || extractingKw}
              onClick={() => crawl()}
              className="bg-green-600 text-white hover:bg-green-700 border-0 gap-1.5 px-4 shrink-0"
            >
              {crawling
                ? <><RefreshCw className="w-3 h-3 animate-spin" /> 크롤링 중...</>
                : extractingKw
                ? <><RefreshCw className="w-3 h-3 animate-spin" /> AI 분석 중...</>
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
          <div className="flex items-center justify-end gap-2 mb-3">
            {urlSaved && (
              <span className="text-[10px] text-green-500 font-medium">✓ URL 저장됨</span>
            )}
            <button
              onClick={saveNaverUrl}
              disabled={!naverUrl.trim()}
              className="text-[10px] font-medium text-gray-500 hover:text-gray-900 disabled:opacity-40 transition-colors underline underline-offset-2">
              URL 저장
            </button>
          </div>
        </>
      ) : (
        <div className="mb-3 text-xs text-gray-400 flex items-center gap-2">
          <span>분석 URL: {naverUrl || "미설정"}</span>
          {naverUrl && (
            <Button size="sm" variant="outline" className="gap-1 text-xs border-gray-200 text-gray-600 h-6"
              onClick={() => window.open(naverUrl, "_blank")}>
              <ExternalLink className="w-3 h-3" />
            </Button>
          )}
        </div>
      )}

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
              onClick={analyzeFromPaste} disabled={!pasteText.trim() || extractingKw}>
              {extractingKw
                ? <><RefreshCw className="w-3 h-3 animate-spin" /> AI 분석 중...</>
                : <><BarChart3 className="w-3 h-3" /> AI 키워드 분석</>
              }
            </Button>
          </div>
        </div>
      )}

      {/* 빈 상태 */}
      {reviewTab === "visitor" && !analyzed && !showPasteArea && (
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

      {reviewTab === "blog" && !blogPosts && !showPasteArea && !showAddLink && (
        <div className="flex flex-col items-center justify-center py-10 gap-3">
          <div className="w-12 h-12 rounded-full bg-blue-50 flex items-center justify-center">
            <ArrowUpRight className="w-5 h-5 text-blue-400" />
          </div>
          <p className="text-sm text-gray-400 text-center">위 URL을 입력하고 블로그 리뷰 크롤링을 시작하세요</p>
          <button
            onClick={() => setShowAddLink(true)}
            className="text-xs text-blue-500 hover:text-blue-700 underline underline-offset-2"
          >
            + 블로그 링크 직접 추가
          </button>
        </div>
      )}

      {/* 블로그 링크 수동 추가 */}
      {reviewTab === "blog" && showAddLink && (
        <div className="mb-4 bg-blue-50 border border-blue-100 rounded-xl p-4 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-blue-800">블로그 링크 추가</span>
            <button onClick={() => { setShowAddLink(false); setAddLinkUrl(""); setAddLinkPreview(null); }}
              className="text-gray-400 hover:text-gray-600">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="flex gap-2">
            <input
              className="flex-1 bg-white border border-blue-200 rounded-lg px-3 py-2 text-xs text-gray-900 outline-none focus:border-blue-400 placeholder:text-gray-400"
              placeholder="블로그 URL 붙여넣기 (예: https://blog.naver.com/...)"
              value={addLinkUrl}
              onChange={e => { setAddLinkUrl(e.target.value); setAddLinkPreview(null); }}
              onKeyDown={e => e.key === "Enter" && fetchLinkPreview(addLinkUrl)}
            />
            <Button size="sm"
              disabled={!addLinkUrl.trim() || addLinkLoading}
              onClick={() => fetchLinkPreview(addLinkUrl)}
              className="bg-blue-600 text-white hover:bg-blue-700 border-0 shrink-0 gap-1.5 px-3"
            >
              {addLinkLoading ? <RefreshCw className="w-3 h-3 animate-spin" /> : "미리보기"}
            </Button>
          </div>
          {addLinkPreview && (
            <div className="bg-white border border-blue-100 rounded-lg p-3 flex gap-3 items-start">
              {addLinkPreview.thumbnailUrl && (
                <img src={addLinkPreview.thumbnailUrl} alt="" className="w-16 h-16 object-cover rounded shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-gray-900 line-clamp-2 mb-1">{addLinkPreview.title}</p>
                {addLinkPreview.text && <p className="text-[11px] text-gray-500 line-clamp-2">{addLinkPreview.text}</p>}
                <div className="flex items-center gap-2 mt-1">
                  {addLinkPreview.blogName && <span className="text-[10px] text-blue-600">{addLinkPreview.blogName}</span>}
                  {addLinkPreview.date && <span className="text-[10px] text-gray-400">{addLinkPreview.date}</span>}
                </div>
              </div>
              <Button size="sm" onClick={confirmAddLink}
                className="bg-blue-600 text-white hover:bg-blue-700 border-0 shrink-0 text-xs px-3">
                추가
              </Button>
            </div>
          )}
        </div>
      )}

      {/* 블로그 리뷰 목록 */}
      {reviewTab === "blog" && blogPosts && blogPosts.posts.length > 0 && (
        <>
          {/* 목록이 있을 때 링크 추가 폼 */}
          {showAddLink && (
            <div className="mb-4 bg-blue-50 border border-blue-100 rounded-xl p-4 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-blue-800">블로그 링크 추가</span>
                <button onClick={() => { setShowAddLink(false); setAddLinkUrl(""); setAddLinkPreview(null); }}
                  className="text-gray-400 hover:text-gray-600">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="flex gap-2">
                <input
                  className="flex-1 bg-white border border-blue-200 rounded-lg px-3 py-2 text-xs text-gray-900 outline-none focus:border-blue-400 placeholder:text-gray-400"
                  placeholder="블로그 URL 붙여넣기 (예: https://blog.naver.com/...)"
                  value={addLinkUrl}
                  onChange={e => { setAddLinkUrl(e.target.value); setAddLinkPreview(null); }}
                  onKeyDown={e => e.key === "Enter" && fetchLinkPreview(addLinkUrl)}
                />
                <Button size="sm"
                  disabled={!addLinkUrl.trim() || addLinkLoading}
                  onClick={() => fetchLinkPreview(addLinkUrl)}
                  className="bg-blue-600 text-white hover:bg-blue-700 border-0 shrink-0 gap-1.5 px-3"
                >
                  {addLinkLoading ? <RefreshCw className="w-3 h-3 animate-spin" /> : "미리보기"}
                </Button>
              </div>
              {addLinkPreview && (
                <div className="bg-white border border-blue-100 rounded-lg p-3 flex gap-3 items-start">
                  {addLinkPreview.thumbnailUrl && (
                    <img src={addLinkPreview.thumbnailUrl} alt="" className="w-16 h-16 object-cover rounded shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-gray-900 line-clamp-2 mb-1">{addLinkPreview.title}</p>
                    {addLinkPreview.text && <p className="text-[11px] text-gray-500 line-clamp-2">{addLinkPreview.text}</p>}
                    <div className="flex items-center gap-2 mt-1">
                      {addLinkPreview.blogName && <span className="text-[10px] text-blue-600">{addLinkPreview.blogName}</span>}
                      {addLinkPreview.date && <span className="text-[10px] text-gray-400">{addLinkPreview.date}</span>}
                    </div>
                  </div>
                  <Button size="sm" onClick={confirmAddLink}
                    className="bg-blue-600 text-white hover:bg-blue-700 border-0 shrink-0 text-xs px-3">
                    추가
                  </Button>
                </div>
              )}
            </div>
          )}
          <div className="flex items-center justify-between mb-3">
            <h5 className="text-xs font-bold text-gray-700">
              블로그 리뷰 목록
              <span className="ml-1 text-gray-400 font-normal">총 {blogPosts.total.toLocaleString()}건</span>
              {blogPosts.searchQuery && (
                <span className="ml-2 text-[10px] text-blue-500 font-normal">검색어: &quot;{blogPosts.searchQuery}&quot;</span>
              )}
            </h5>
            <div className="flex items-center gap-3">
              <button
                onClick={() => { setShowAddLink(v => !v); setAddLinkUrl(""); setAddLinkPreview(null); }}
                className="text-[10px] text-blue-500 hover:text-blue-700 flex items-center gap-0.5"
              >
                + 링크 추가
              </button>
              <button className="text-[10px] text-gray-400 hover:text-gray-600 underline" onClick={reset}>다시 불러오기</button>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
            {blogPosts.posts.map((post, i) => (
              <div key={i} className={`bg-white border shadow-sm rounded-xl overflow-hidden flex flex-col transition-colors ${post.manual ? "border-blue-200 hover:border-blue-400" : "border-gray-100 hover:border-blue-200"}`}>
                {post.thumbnailUrl && (
                  <div className="w-full h-28 bg-gray-100 overflow-hidden">
                    <img src={post.thumbnailUrl} alt={post.title} className="w-full h-full object-cover" />
                  </div>
                )}
                <div className="p-4 flex flex-col gap-2 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    {post.title && (
                      <h6 className="text-sm font-semibold text-gray-900 line-clamp-1 flex-1">{post.title}</h6>
                    )}
                    {post.manual && (
                      <button
                        onClick={() => {
                          const updated = { ...blogPosts, posts: blogPosts.posts.filter((_, j) => j !== i), total: blogPosts.total - 1 };
                          setBlogPosts(updated);
                        }}
                        className="shrink-0 text-gray-300 hover:text-red-400 transition-colors"
                        title="삭제"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                  {post.text && (
                    <p className="text-xs text-gray-600 line-clamp-3 leading-relaxed">{post.text}</p>
                  )}
                  <div className="flex items-center justify-between mt-auto pt-2 border-t border-gray-50">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] text-blue-600 font-medium">{post.blogName}</span>
                      {post.manual && <span className="text-[9px] bg-blue-50 text-blue-400 px-1 py-0.5 rounded">수동</span>}
                    </div>
                    <div className="flex items-center gap-2">
                      {post.date && <span className="text-[10px] text-gray-400 font-mono">{post.date.slice(0, 10)}</span>}
                      {post.url && (
                        <a href={post.url} target="_blank" rel="noopener noreferrer"
                          className="text-[10px] text-gray-400 hover:text-blue-600 flex items-center gap-0.5">
                          <ExternalLink className="w-3 h-3" /> 원문
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* 방문자 리뷰 분석 결과 */}
      {reviewTab === "visitor" && analyzed && (
        <>
          {/* ── 감성 분포 + 키워드 바 차트 ── */}
          <div className="grid grid-cols-1 lg:grid-cols-[200px_1fr] gap-5 mb-6 items-start">

            {/* 감성 도넛 차트 */}
            <div className="flex flex-col gap-3 bg-gray-50 rounded-xl p-4 border border-gray-100">
              <h5 className="text-xs font-bold text-gray-700">리뷰 감성 분포</h5>
              <div className="relative">
                <div style={{ height: 150 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <RechartsPieChart>
                      <Pie
                        data={[
                          { name: "긍정", value: analyzed.posRate },
                          { name: "부정", value: 100 - analyzed.posRate },
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
                  <span className="text-2xl font-bold text-gray-900">{analyzed.posRate}%</span>
                  <span className="text-[10px] text-gray-400">긍정률</span>
                </div>
              </div>
              <div className="h-2 rounded-full bg-red-200 overflow-hidden">
                <div className="h-full bg-green-400 rounded-full transition-all duration-700" style={{ width: `${analyzed.posRate}%` }} />
              </div>
              <div className="flex justify-between text-[11px] font-semibold">
                <span className="flex items-center gap-1 text-green-700">
                  <Smile className="w-3.5 h-3.5" /> 긍정 {analyzed.posRate}%
                </span>
                <span className="flex items-center gap-1 text-red-500">
                  {100 - analyzed.posRate}% 부정 <Frown className="w-3.5 h-3.5" />
                </span>
              </div>
              {analyzed.textTotal !== undefined && (
                <p className="text-[10px] text-gray-400 text-center border-t border-gray-100 pt-2">
                  분석 대상 {analyzed.textTotal.toLocaleString()}건
                </p>
              )}
            </div>

            {/* 키워드 버블 차트 */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <h5 className="text-xs font-bold text-gray-700">
                  주요 언급 키워드
                  <span className="text-gray-400 font-normal ml-1">({analyzed.keywords.length}개)</span>
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
              <ReviewKeywordBubbles keywords={analyzed.keywords} />
            </div>
          </div>

          {/* 리뷰 목록 */}
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
                      <div className="flex items-center gap-2">
                        {review.date && <span className="text-[10px] font-mono text-gray-400">{review.date}</span>}
                        <span className={cn("text-[10px] px-1.5 py-0.5 rounded-full font-medium",
                          review.sentiment === "positive" ? "bg-green-50 text-green-600" : "bg-red-50 text-red-600"
                        )}>
                          {review.sentiment === "positive" ? "😊 긍정" : "😞 부정"}
                        </span>
                      </div>
                    </div>
                    <p className="text-sm text-gray-800 leading-snug mb-3">{review.text}</p>
                  </div>
                  <div className="flex flex-wrap gap-1.5 mt-auto pt-3 border-t border-gray-50">
                    {review.keywords.map(kw => (
                      <span key={kw} className={cn("text-[10px] px-2 py-0.5 rounded-full font-medium",
                        review.sentiment === "positive" ? "bg-green-50 text-green-600" : "bg-red-50 text-red-600"
                      )}>#{kw}</span>
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

  const { isAdmin } = useAuth();
  const { refreshTrigger } = useRefresh();
  const [lastRefresh, setLastRefresh] = useState(0);

  // NEW 뱃지 (팝업 리뷰 새 댓글 감지)
  const [newBadgeReview, setNewBadgeReview] = useState(false);

  const campaign = useQuery(api.campaigns.getCampaignById, { id: campaignId });
  const activities = useQuery(api.interest.getInterestActivities, { campaignId }) ?? [];
  const syncActivities = useMutation(api.interest.syncInterestActivities);
  const updateCampaignSettings = useMutation(api.campaigns.updateCampaignSettings);
  const updateInterestResponseData = useMutation(api.campaigns.updateInterestResponseData);

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
  const [confirmDelete, setConfirmDelete] = useState<"event" | "popup" | "vip" | "response" | null>(null);

  // ── 이벤트 응답 분석 실제 데이터 ──
  const [responseData, setResponseData] = useState<{name: string; text: string; date: string}[] | null>(null);

  // ── 마이크로사이트 세션 수 가져오기 (이벤트 누적 트래픽용) ──
  const [micrositeTraffic, setMicrositeTraffic] = useState<number | null>(null);

  const resolvedGa4Id = useMemo(() => {
    if (campaign?.microGa4Id) return campaign.microGa4Id as string;
    try { return localStorage.getItem(`microGa4Id_${campaignId}`) ?? ""; } catch { return ""; }
  }, [campaign?.microGa4Id, campaignId]);

  const fetchMicrositeTraffic = useCallback(async () => {
    if (!resolvedGa4Id || !campaign?.startDate) return;
    try {
      const today = new Date().toISOString().split("T")[0];
      const endDate = campaign.endDate && campaign.endDate < today ? campaign.endDate : today;
      const res = await fetch("/api/ga4-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startDate: campaign.startDate,
          endDate,
          timeUnit: "month",
          propertyId: resolvedGa4Id,
          metrics: [{ name: "sessions" }],
        }),
      });
      const data = await res.json();
      if (res.ok && data.rows?.length) {
        const total = data.rows.reduce((s: number, r: any) => s + (r.sessions || 0), 0);
        setMicrositeTraffic(Math.round(total));
      } else if (res.ok) {
        setMicrositeTraffic(0);
      }
    } catch (e) {
      console.error("[GA4 Traffic] fetch 실패:", e);
    }
  }, [resolvedGa4Id, campaign?.startDate, campaign?.endDate]);

  useEffect(() => {
    fetchMicrositeTraffic();
  }, [fetchMicrositeTraffic]);

  // ── 팝업 AI 매핑 (이벤트 신청 + 팝업 예약 일자별) ──
  type PopupMappingData = {
    url: string;
    dateHeaderRows: number[];
    dateStartCol?: string;  // 날짜 시작 열 문자 (예: "E")
    colSpan?: number;       // 날짜당 열 수 (1=싱글, 2=듀얼)
    dataRows: {
      vipReserve: number[];
      generalReserve: number[];
      actualVisit: number[];
      walkin?: number[];
      totalVisit?: number[];
    };
    confidence?: number;
    notes?: string;
  };
  const [popupAnalysisUrl, setPopupAnalysisUrl]     = useState("");
  const [popupAnalysisStep, setPopupAnalysisStep]   = useState<"idle" | "analyzing" | "review" | "confirmed">("idle");
  const [popupDraftMapping, setPopupDraftMapping]   = useState<PopupMappingData | null>(null);
  const [popupConfirmedMapping, setPopupConfirmedMapping] = useState<PopupMappingData | null>(null);
  const [popupAnalysisMsg, setPopupAnalysisMsg]     = useState("");
  const [popupSyncing, setPopupSyncing]             = useState(false);
  // 행 번호 편집용 임시 문자열 (comma-separated)
  const [draftRows, setDraftRows] = useState<Record<string, string>>({});
  const [previewRows, setPreviewRows] = useState<string[][]>([]);
  const [selectedKeyword, setSelectedKeyword] = useState<string | null>(null);

  // ── 팝업 예약 신청 시트 (일자별 예약 신청 건 수) ──
  const [reservationUrl, setReservationUrl] = useState("");
  const [reservationDateFrom, setReservationDateFrom] = useState("");
  const [reservationDateTo, setReservationDateTo] = useState("");
  const [reservationAllRows, setReservationAllRows] = useState<{ date: string; count: number; vipCount: number; people?: number; vipPeople?: number }[] | null>(null);
  const [reservationSyncing, setReservationSyncing] = useState(false);
  const [showReservationUrl, setShowReservationUrl] = useState(false);
  const [reservationSyncMsg, setReservationSyncMsg] = useState("");


  // ── 팝업 방문자 시트 (일자별 방문자 수) ──
  const [visitorUrl, setVisitorUrl] = useState("");
  const [visitorDateFrom, setVisitorDateFrom] = useState("");
  const [visitorDateTo, setVisitorDateTo] = useState("");
  const [visitorAllRows, setVisitorAllRows] = useState<{ date: string; actual: number; vipActual: number; actualCount?: number; rate: string }[] | null>(null);
  const [visitorSyncing, setVisitorSyncing] = useState(false);
  const [showVisitorUrl, setShowVisitorUrl] = useState(false);
  const [visitorSyncMsg, setVisitorSyncMsg] = useState("");

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

    // 팝업 AI 매핑 복원
    const savedPopupMapping = localStorage.getItem(`popup_ai_mapping_${campaignId}`);
    if (savedPopupMapping) {
      try {
        const m = JSON.parse(savedPopupMapping);
        setPopupConfirmedMapping(m);
        setPopupAnalysisUrl(m.url || "");
        setPopupAnalysisStep("confirmed");
      } catch {}
    }

    const savedResponseData = localStorage.getItem(`interest_response_data_${campaignId}`);
    if (savedResponseData) { try { setResponseData(JSON.parse(savedResponseData)); } catch {} }
    // localStorage에 없으면 Convex에서 로드 (뷰어 지원)
    // → campaign 데이터 로드 후 별도 useEffect에서 처리

    // 팝업 예약 신청 시트
    const savedResUrl  = localStorage.getItem(`popup_reservation_url_${campaignId}`);
    const savedResFrom = localStorage.getItem(`popup_reservation_from_${campaignId}`);
    const savedResTo   = localStorage.getItem(`popup_reservation_to_${campaignId}`);
    const savedResAll  = localStorage.getItem(`popup_reservation_all_${campaignId}`);
    if (savedResUrl)  setReservationUrl(savedResUrl);
    if (savedResFrom) setReservationDateFrom(savedResFrom);
    if (savedResTo)   setReservationDateTo(savedResTo);
    if (savedResAll)  { try { setReservationAllRows(JSON.parse(savedResAll)); } catch {} }

    // 팝업 방문자 시트
    const savedVisUrl  = localStorage.getItem(`popup_visitor_url_${campaignId}`);
    const savedVisFrom = localStorage.getItem(`popup_visitor_from_${campaignId}`);
    const savedVisTo   = localStorage.getItem(`popup_visitor_to_${campaignId}`);
    const savedVisAll  = localStorage.getItem(`popup_visitor_all_${campaignId}`);
    if (savedVisUrl)  setVisitorUrl(savedVisUrl);
    if (savedVisFrom) setVisitorDateFrom(savedVisFrom);
    if (savedVisTo)   setVisitorDateTo(savedVisTo);
    if (savedVisAll)  { try { setVisitorAllRows(JSON.parse(savedVisAll)); } catch {} }
  }, [campaignId]);

  // Convex fallback: localStorage에 없으면 Convex에서 responseData 로드 (뷰어 지원)
  useEffect(() => {
    if (!campaign) return;
    const hasLocal = !!localStorage.getItem(`interest_response_data_${campaignId}`);
    if (!hasLocal && campaign.interestResponseData) {
      try { setResponseData(JSON.parse(campaign.interestResponseData)); } catch {}
    }
    if (!localStorage.getItem(`interest_response_sheet_${campaignId}`) && campaign.interestResponseSheetUrl) {
      setResponseSheetUrl(campaign.interestResponseSheetUrl);
    }
  }, [campaign, campaignId]);

  // DB의 팝업 일별 데이터를 reservationAllRows / visitorAllRows 상태에 동기화
  useEffect(() => {
    if (!activities) return;
    const popupDays = activities.filter(a => a.activityType === "팝업일별데이터");
    if (popupDays.length === 0) return;

    const resRows = popupDays.map(a => ({
      date: a.startDate,
      count: a.generalReserveCount ?? a.visitors, // fallback
      people: a.generalReservePeople ?? a.participants,
      vipCount: a.vipReserveCount ?? a.vipCount ?? 0,
      vipPeople: a.vipReservePeople ?? 0,
    })).filter(r => r.count > 0 || r.people > 0 || r.vipCount > 0);

    const visRows = popupDays.map(a => ({
      date: a.startDate,
      actual: a.actualVisitCount ?? a.visitors,
      vipActual: a.vipActualVisitCount ?? 0,
      actualCount: 0,
      rate: "—",
    })).filter(r => r.actual > 0 || r.vipActual > 0);

    if (resRows.length > 0) setReservationAllRows(resRows as any);
    if (visRows.length > 0) setVisitorAllRows(visRows as any);
  }, [activities]);

  const updateCardLabel = (key: keyof typeof defaultCardLabels, value: string) => {
    const next = { ...cardLabels, [key]: value };
    setCardLabels(next);
    try { localStorage.setItem(`interest_card_labels_${campaignId}`, JSON.stringify(next)); } catch {}
  };

  useEffect(() => {
    if (refreshTrigger !== lastRefresh) {
      setLastRefresh(refreshTrigger);
      // 흥미 상세 — 저장된 시트 URL로 자동 재동기화
      (["event", "popup", "vip", "response"] as const).forEach(type => {
        try {
          const savedUrl = localStorage.getItem(`interest_${type}_sheet_${campaignId}`);
          if (savedUrl) syncFromSheet(type, savedUrl);
        } catch {}
      });
      // 팝업 AI 매핑 — 저장된 매핑으로 자동 재동기화
      try {
        const savedMapping = localStorage.getItem(`popup_ai_mapping_${campaignId}`);
        if (savedMapping) {
          const m = JSON.parse(savedMapping);
          syncWithPopupMapping(m);
        }
      } catch {}
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshTrigger, lastRefresh]);

  const syncFromSheet = useCallback(async (type: "event" | "popup" | "vip" | "response", url: string) => {
    if (!url) return;
    setSyncing(type);
    setSyncMessage("");
    try {
      // 서버사이드 서비스 계정으로 fetch (CORS 우회)
      const apiRes = await fetch("/api/fetch-raw-sheet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sheetUrl: url }),
      });
      const apiJson = await apiRes.json();
      if (!apiJson.success || !apiJson.data) throw new Error(apiJson.error || "시트 데이터를 가져오지 못했습니다.");
      const rows: string[][] = apiJson.data;

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
        // response type — 실제 응답 건수 기반 파싱
        localStorage.setItem(`interest_response_sheet_${campaignId}`, url);

        // ── 데이터 패턴 분석 기반 컬럼 자동 감지 (헤더 없는 시트도 지원) ──
        // Step A: 타이틀/설명 행 스킵 — 실제 데이터 시작 행 찾기
        let dataStartIdx = 0;
        for (let i = 0; i < rows.length; i++) {
          const filledCols = rows[i].filter(c => c.trim()).length;
          // 3개 이상 열에 값이 있는 행 = 데이터 행 후보
          if (filledCols >= 3) {
            // 이 행에 날짜 패턴이 있으면 데이터 행, 없으면 타이틀 행이므로 스킵
            const hasDate = rows[i].some(c => extractDate(c));
            if (hasDate) { dataStartIdx = i; break; }
            // 타이틀 행은 스킵하고 다음 행 검사
            continue;
          }
        }
        const actualDataRows = rows.slice(dataStartIdx).filter(r => r.some(c => c.trim()));

        // Step B: 각 열의 데이터 패턴 분석 (최대 30행 샘플)
        const colCount = Math.max(...actualDataRows.slice(0, 30).map(r => r.length), 0);
        type ColProfile = { idx: number; numericRate: number; phoneRate: number; dateRate: number; nameRate: number; avgLen: number; emptyRate: number };
        const colProfiles: ColProfile[] = [];

        for (let ci = 0; ci < colCount; ci++) {
          const samples = actualDataRows.slice(0, 30).map(r => r[ci]?.trim() || "");
          const nonEmpty = samples.filter(v => v);
          const total = nonEmpty.length || 1;
          colProfiles.push({
            idx: ci,
            numericRate: nonEmpty.filter(v => /^\d+$/.test(v)).length / total,
            phoneRate: nonEmpty.filter(v => /01[0-9]/.test(v)).length / total,
            dateRate: nonEmpty.filter(v => !!extractDate(v)).length / total,
            nameRate: nonEmpty.filter(v => /^[가-힣]{2,4}$/.test(v)).length / total,
            avgLen: nonEmpty.reduce((s, v) => s + v.length, 0) / total,
            emptyRate: (samples.length - nonEmpty.length) / (samples.length || 1),
          });
        }

        // Step C: 컬럼 타입 분류 (번호/전화번호 → 제외, 날짜/이름/사연 → 할당)
        const excludedCols = new Set<number>();
        // 빈 열 제외
        colProfiles.filter(p => p.emptyRate > 0.8).forEach(p => excludedCols.add(p.idx));
        // 순수 숫자열 (1,2,3... = 번호) 제외
        colProfiles.filter(p => p.numericRate > 0.7 && !excludedCols.has(p.idx)).forEach(p => excludedCols.add(p.idx));
        // 전화번호열 제외
        colProfiles.filter(p => p.phoneRate > 0.5 && !excludedCols.has(p.idx)).forEach(p => excludedCols.add(p.idx));

        // 날짜열: dateRate 가장 높은 열 (제외 대상 아닌 것 중)
        const dateCandidates = colProfiles.filter(p => p.dateRate > 0.3 && !excludedCols.has(p.idx));
        const dateColIdx = dateCandidates.length > 0
          ? dateCandidates.sort((a, b) => b.dateRate - a.dateRate)[0].idx
          : -1;

        // 이름열: nameRate 가장 높은 열 (제외 대상 + 날짜열 아닌 것 중)
        const nameCandidates = colProfiles.filter(p => p.nameRate > 0.3 && !excludedCols.has(p.idx) && p.idx !== dateColIdx);
        const nameColIdx = nameCandidates.length > 0
          ? nameCandidates.sort((a, b) => b.nameRate - a.nameRate)[0].idx
          : -1;

        // 사연열: 나머지 중 avgLen이 가장 긴 열
        const textCandidates = colProfiles.filter(p => !excludedCols.has(p.idx) && p.idx !== dateColIdx && p.idx !== nameColIdx);
        const textColIdx = textCandidates.length > 0
          ? textCandidates.sort((a, b) => b.avgLen - a.avgLen)[0].idx
          : -1;

        // 열 이름 문자열 (디버그용)
        const colLetter = (idx: number) => idx >= 0 ? String.fromCharCode(65 + idx) + "열" : "?";

        if (textColIdx < 0) {
          setSyncMessage("⚠️ 사연 텍스트 열을 자동 감지할 수 없습니다. 시트 구조를 확인해주세요.");
        } else {
          const parsed: {name: string; text: string; date: string}[] = [];
          for (const r of actualDataRows) {
            if (r.every(c => !c.trim())) continue;
            const text = r[textColIdx]?.trim() || "";
            if (!text) continue;

            const rawDate = dateColIdx >= 0 ? (r[dateColIdx] || "") : "";
            let date = extractDate(rawDate);
            if (!date) {
              date = campaign?.startDate ? campaign.startDate.split("T")[0] : new Date().toISOString().split("T")[0];
            }
            const name = nameColIdx >= 0 ? (r[nameColIdx]?.trim() || "") : "";
            parsed.push({ name, text, date });
          }

          if (parsed.length > 0) {
            setResponseData(parsed);
            try { localStorage.setItem(`interest_response_data_${campaignId}`, JSON.stringify(parsed)); } catch {}
            // Convex에도 저장 → 뷰어에서도 볼 수 있음
            try {
              await updateInterestResponseData({
                id: campaignId as Id<"campaigns">,
                interestResponseData: JSON.stringify(parsed),
                interestResponseSheetUrl: responseSheetUrl,
              });
            } catch {}
            setSyncMessage(`✅ ${parsed.length}건 응답 (${new Set(parsed.map(r => r.date)).size}일) 연동 완료! [날짜=${colLetter(dateColIdx)}, 이름=${colLetter(nameColIdx)}, 사연=${colLetter(textColIdx)}]`);
          } else {
            setSyncMessage("✅ 이벤트 응답 시트 URL이 저장되었습니다. (응답 데이터 없음)");
          }
        }
      }
    } catch (e: any) {
      setSyncMessage(`❌ ${e.message}`);
    } finally {
      setSyncing(null);
    }
  }, [activities, syncActivities, campaignId]);

  // ── 데이터 소스 삭제 ────────────────────────────────────────────────────────
  const clearDataSource = useCallback(async (type: "event" | "popup" | "vip" | "response") => {
    const mapActivity = (a: any) => ({
      activityType: a.activityType, title: a.title, locationOrTarget: a.locationOrTarget,
      startDate: a.startDate, endDate: a.endDate,
      visitors: a.visitors, participants: a.participants, budget: a.budget, vipCount: a.vipCount,
    });

    if (type === "event") {
      setEventSheetUrl("");
      try { localStorage.removeItem(`interest_event_sheet_${campaignId}`); } catch {}
      // 이벤트 타입 행만 제거 (팝업 유지)
      await syncActivities({ campaignId, rows: activities.filter(a => a.activityType !== "이벤트").map(mapActivity) });
    } else if (type === "popup") {
      setPopupSheetUrl("");
      try { localStorage.removeItem(`interest_popup_sheet_${campaignId}`); } catch {}
      // 팝업 타입 행만 제거 (이벤트 유지)
      await syncActivities({ campaignId, rows: activities.filter(a => a.activityType !== "팝업").map(mapActivity) });
    } else if (type === "vip") {
      setVipSheetUrl("");
      try { localStorage.removeItem(`interest_vip_sheet_${campaignId}`); } catch {}
      // 팝업 행의 vipCount만 0으로 초기화
      await syncActivities({ campaignId, rows: activities.map(a => ({ ...mapActivity(a), vipCount: a.activityType === "팝업" ? 0 : a.vipCount })) });
    } else if (type === "response") {
      setResponseSheetUrl("");
      setResponseData(null);
      try {
        localStorage.removeItem(`interest_response_sheet_${campaignId}`);
        localStorage.removeItem(`interest_response_data_${campaignId}`);
      } catch {}
    }

    const labels: Record<string, string> = { event: "이벤트", popup: "팝업", vip: "VIP", response: "이벤트 응답" };
    setSyncMessage(`🗑️ ${labels[type]} 데이터가 삭제되었습니다.`);
    setConfirmDelete(null);
  }, [activities, syncActivities, campaignId]);

  // ── 캠페인 시작일 ~ 오늘을 기간 기본값으로 (localStorage 값이 없을 때만, DB 설정값 우선) ──
  useEffect(() => {
    if (!campaign) return;
    const today = new Date().toISOString().split("T")[0];
    const dbFrom = (campaign as any).popupDefaultDateFrom;
    const dbTo   = (campaign as any).popupDefaultDateTo;
    if (!localStorage.getItem(`popup_reservation_from_${campaignId}`)) {
      setReservationDateFrom(dbFrom || campaign.startDate || today);
    }
    if (!localStorage.getItem(`popup_reservation_to_${campaignId}`)) {
      setReservationDateTo(dbTo || today);
    }
    if (!localStorage.getItem(`popup_visitor_from_${campaignId}`)) {
      setVisitorDateFrom(dbFrom || campaign.startDate || today);
    }
    if (!localStorage.getItem(`popup_visitor_to_${campaignId}`)) {
      setVisitorDateTo(dbTo || today);
    }
  }, [campaign, campaignId]);

  // ── 팝업 예약 신청 시트 동기화 ──
  const syncReservationSheet = useCallback(async () => {
    if (!reservationUrl) return;
    setReservationSyncing(true);
    setReservationSyncMsg("");
    try {
      const apiRes = await fetch("/api/fetch-raw-sheet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sheetUrl: reservationUrl }),
      });
      const apiJson = await apiRes.json();
      if (!apiJson.success || !apiJson.data) throw new Error(apiJson.error || "시트 데이터를 가져오지 못했습니다.");
      const rows: string[][] = apiJson.data;
      if (rows.length < 2) throw new Error("데이터가 2행 미만입니다.");
      const headers = rows[0].map(h => h.toLowerCase());
      const dataRows = rows.slice(1);
      const findCol = (kws: string[]) => headers.findIndex(h => kws.some(k => h.includes(k)));
      const dateCol  = findCol(["날짜", "일자", "date"]);
      const countCol = findCol(["일반", "신청", "건수", "count", "예약"]);
      const vipCol   = findCol(["vip", "브이아이피"]);
      const parsed = dataRows.map(r => ({
        date:     dateCol  >= 0 ? (r[dateCol]  || "") : "",
        count:    countCol >= 0 ? processNumber(r[countCol]  || "0") : 0,
        vipCount: vipCol   >= 0 ? processNumber(r[vipCol]    || "0") : 0,
      })).filter(r => r.date);
      if (parsed.length === 0) throw new Error("매핑 가능한 데이터가 없습니다. 컬럼 헤더를 확인하세요.");
      setReservationAllRows(parsed);
      localStorage.setItem(`popup_reservation_url_${campaignId}`, reservationUrl);
      localStorage.setItem(`popup_reservation_all_${campaignId}`, JSON.stringify(parsed));
      setReservationSyncMsg(`✅ ${parsed.length}건 동기화 완료!`);
    } catch (e: any) {
      setReservationSyncMsg(`❌ ${e.message}`);
    } finally {
      setReservationSyncing(false);
    }
  }, [reservationUrl, campaignId]);

  // ── 팝업 방문자 시트 동기화 ──
  const syncVisitorSheet = useCallback(async () => {
    if (!visitorUrl) return;
    setVisitorSyncing(true);
    setVisitorSyncMsg("");
    try {
      const apiRes = await fetch("/api/fetch-raw-sheet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sheetUrl: visitorUrl }),
      });
      const apiJson = await apiRes.json();
      if (!apiJson.success || !apiJson.data) throw new Error(apiJson.error || "시트 데이터를 가져오지 못했습니다.");
      const rows: string[][] = apiJson.data;
      if (rows.length < 2) throw new Error("데이터가 2행 미만입니다.");
      const headers = rows[0].map(h => h.toLowerCase());
      const dataRows = rows.slice(1);
      const findCol = (kws: string[]) => headers.findIndex(h => kws.some(k => h.includes(k)));
      const dateCol   = findCol(["날짜", "일자", "date"]);
      const totalCol  = findCol(["총", "전체", "actual", "방문자"]);
      const vipCol    = findCol(["vip", "브이아이피"]);
      const rateCol   = findCol(["방문율", "rate", "비율", "%"]);
      const parsed = dataRows.map(r => {
        const total  = totalCol >= 0 ? processNumber(r[totalCol]  || "0") : 0;
        const vipAct = vipCol   >= 0 ? processNumber(r[vipCol]    || "0") : 0;
        const rateRaw = rateCol >= 0 ? (r[rateCol] || "") : "";
        const rate = rateRaw
          ? (rateRaw.includes("%") ? rateRaw : `${rateRaw}%`)
          : (total > 0 ? "—" : "0%");
        return {
          date:      dateCol >= 0 ? (r[dateCol] || "") : "",
          actual:    total,
          vipActual: vipAct,
          rate,
        };
      }).filter(r => r.date);
      if (parsed.length === 0) throw new Error("매핑 가능한 데이터가 없습니다. 컬럼 헤더를 확인하세요.");
      setVisitorAllRows(parsed);
      localStorage.setItem(`popup_visitor_url_${campaignId}`, visitorUrl);
      localStorage.setItem(`popup_visitor_all_${campaignId}`, JSON.stringify(parsed));
      setVisitorSyncMsg(`✅ ${parsed.length}건 동기화 완료!`);
    } catch (e: any) {
      setVisitorSyncMsg(`❌ ${e.message}`);
    } finally {
      setVisitorSyncing(false);
    }
  }, [visitorUrl, campaignId]);

  // ── 캘린더 형식 시트 파서 + 동기화 ──
  // ── AI 매핑으로 시트 파싱 (공통 파서) ──────────────────────────────
  const parseSheetWithMapping = useCallback((allRows: string[][], mapping: any) => {
    const datePattern = /^(\d{1,2})[\/\.]\s*(\d{1,2})/;
    const year = new Date().getFullYear();

    const generalRes: {date: string; count: number; people: number}[] = [];
    const vipRes: {date: string; count: number; people: number}[] = [];
    const visitorRows_: {date: string; actual: number; vipActual: number; actualCount: number}[] = [];

    // "건수 / 인원" 형태로 한 셀에 입력된 수치를 분리하는 헬퍼 함수
    const parseSlashValue = (val: string) => {
      if (!val) return { count: 0, people: 0 };
      const s = val.trim();
      if (s.includes("/")) {
        const parts = s.split("/").map(p => processNumber(p.trim()));
        return { count: parts[0] || 0, people: parts[1] || 0 };
      }
      const num = processNumber(s);
      return { count: num, people: num }; // 슬래시가 없는 경우 동일값 할당
    };

    const dateHeaderRows: number[] = (mapping.dateHeaderRows || []).map((r: number) => r - 1); // 0-based
    const dr = mapping.dataRows || {};
    const toIdx = (arr: number[], i: number) => ((arr || [])[i] ?? 0) - 1;

    for (let hi = 0; hi < dateHeaderRows.length; hi++) {
      const headerRowIdx = dateHeaderRows[hi];
      if (headerRowIdx < 0 || headerRowIdx >= allRows.length) continue;

      // 7행 블록(설치기간 및 사연신청만 있는 영역)은 예약/방문 파싱에서 무시 처리 (0-based로 8 이하일 때 스킵)
      if (headerRowIdx <= 8) continue;

      const headerRow = allRows[headerRowIdx];

      // 날짜 컬럼 추출
      const dateCols: {col: number; date: string}[] = [];

      // dateStartCol이 지정된 경우: 지정 열부터 colSpan 간격으로 스캔
      const forcedStartCol = mapping.dateStartCol
        ? mapping.dateStartCol.trim().toUpperCase().charCodeAt(0) - 65
        : -1;
      const forcedColSpan = mapping.colSpan && mapping.colSpan > 0 ? mapping.colSpan : 0;

      if (forcedStartCol >= 0) {
        // 전체 행을 스캔해서 날짜가 있는 컬럼들을 우선 수집
        const allDateCols: {col: number; date: string}[] = [];
        for (let c = 0; c < headerRow.length; c++) {
          const m = headerRow[c].match(datePattern);
          if (m) allDateCols.push({ col: c, date: `${year}-${m[1].padStart(2,"0")}-${m[2].padStart(2,"0")}` });
        }
        // 지정 시작 열부터 지정 간격으로 필터
        const span = forcedColSpan > 0 ? forcedColSpan
          : (allDateCols.length >= 2 ? allDateCols[1].col - allDateCols[0].col : 2);
        for (let step = 0; step < 30; step++) {
          const col = forcedStartCol + step * span;
          if (col >= headerRow.length) break;
          const found = allDateCols.find(d => d.col === col);
          if (found) dateCols.push(found);
          else if (step > 0 && dateCols.length > 0) break; // 연속이 끊기면 종료
        }
      } else {
        // 기존 자동 감지: 전체 행 스캔
        for (let c = 0; c < headerRow.length; c++) {
          const m = headerRow[c].match(datePattern);
          if (m) dateCols.push({ col: c, date: `${year}-${m[1].padStart(2,"0")}-${m[2].padStart(2,"0")}` });
        }
      }

      if (dateCols.length === 0) continue;

      // 듀얼 컬럼 감지: 지정된 colSpan 우선, 없으면 자동 감지
      const colSpan = forcedColSpan > 0 ? forcedColSpan
        : (dateCols.length >= 2 ? dateCols[1].col - dateCols[0].col : 1);
      const isDualCol = colSpan >= 2;

      // 듀얼/싱글 컬럼에 따라 건수와 명수를 읽는 헬퍼
      const readCountPeople = (row: string[], col: number) => {
        // 날짜 형식("6/18" 등) 또는 숫자로 시작하지 않는 셀(설치, 철거, D-1 등)은 0 처리
        const isDateLike = (s: string) => /^\d{1,2}[\/\.]\d{1,2}/.test(s.trim());
        const isNumericCell = (s: string) => s.trim() === "" || /^\d/.test(s.trim());
        if (isDualCol) {
          const raw = row[col] || "";
          const raw2 = row[col + 1] || "";
          const count = (isDateLike(raw) || !isNumericCell(raw)) ? 0 : processNumber(raw);
          const people = (isDateLike(raw2) || !isNumericCell(raw2)) ? 0 : processNumber(raw2);
          return { count, people };
        }
        const raw = row[col] || "";
        return (isDateLike(raw) || !isNumericCell(raw)) ? { count: 0, people: 0 } : parseSlashValue(raw);
      };

      // 일반 예약
      const gIdx = toIdx(dr.generalReserve, hi);
      if (gIdx >= 0 && allRows[gIdx]) {
        for (const {col, date} of dateCols) {
          const { count, people } = readCountPeople(allRows[gIdx], col);
          if (count > 0 || people > 0) generalRes.push({date, count, people});
        }
      }

      // VIP 예약
      const vIdx = toIdx(dr.vipReserve, hi);
      if (vIdx >= 0 && allRows[vIdx]) {
        for (const {col, date} of dateCols) {
          const { count, people } = readCountPeople(allRows[vIdx], col);
          if (count > 0 || people > 0) vipRes.push({date, count, people});
        }
      }

      // 총 방문객(row22) / 실제 방문(row19)
      // row22: E=총팀(건), F=총인원(명)
      // row19: E=VIP방문명, F=일반방문명  (VIP/일반 순서)
      const tvIdx = toIdx(dr.totalVisit, hi);
      const avIdx = toIdx(dr.actualVisit, hi);

      if (tvIdx >= 0 || avIdx >= 0) {
        for (const {col, date} of dateCols) {
          let actual = 0;      // 일반 방문 명수
          let vipActual = 0;   // VIP 방문 명수
          let actualCount = 0; // 총 방문 건수(팀수)

          if (tvIdx >= 0 && allRows[tvIdx]) {
            const { count: teams } = readCountPeople(allRows[tvIdx], col);
            actualCount = teams; // E22 = 총 방문 팀수
          }

          if (avIdx >= 0 && allRows[avIdx]) {
            // row19: 듀얼컬럼에서 count=VIP명, people=일반명
            const { count: vipPpl, people: genPpl } = readCountPeople(allRows[avIdx], col);
            vipActual = vipPpl;  // E19
            actual    = genPpl;  // F19
          } else if (tvIdx >= 0 && allRows[tvIdx]) {
            // row19 없으면 row22 명수를 총방문으로 사용
            const { people: totalPpl } = readCountPeople(allRows[tvIdx], col);
            actual = totalPpl;
          }

          if (actual > 0 || vipActual > 0 || actualCount > 0) {
            visitorRows_.push({date, actual, vipActual, actualCount});
          }
        }
      }
    }

    return { generalRes, vipRes, visitorRows_ };
  }, []);

  // ── AI 매핑으로 데이터 저장 ──────────────────────────────────────
  const syncWithPopupMapping = useCallback(async (mapping: any) => {
    if (!mapping?.url) return;
    setPopupSyncing(true);
    setPopupAnalysisMsg("");
    try {
      const res = await fetch("/api/fetch-raw-sheet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sheetUrl: mapping.url }),
      });
      const json = await res.json();
      if (!json.success || !json.data) throw new Error(json.error || "시트 데이터 없음");

      const allRows: string[][] = json.data;
      const { generalRes, vipRes, visitorRows_ } = parseSheetWithMapping(allRows, mapping);
      const msgs: string[] = [];

      // 팝업 예약 및 방문 데이터 병합
      const allPopupDates = Array.from(new Set([
        ...generalRes.map(r => r.date),
        ...vipRes.map(r => r.date),
        ...visitorRows_.map(r => r.date)
      ])).sort();

      const popupDayRows = allPopupDates.map(date => {
        const g = generalRes.find(r => r.date === date);
        const v = vipRes.find(r => r.date === date);
        const vis = visitorRows_.find(r => r.date === date);
        return {
          activityType: "팝업일별데이터",
          title: "팝업 일별 성과",
          locationOrTarget: "",
          startDate: date,
          endDate: date,
          visitors: vis?.actual ?? 0,
          participants: g?.people ?? 0,
          budget: 0,
          vipCount: v?.count ?? 0,
          generalReserveCount: g?.count ?? 0,
          generalReservePeople: g?.people ?? 0,
          vipReserveCount: v?.count ?? 0,
          vipReservePeople: v?.people ?? 0,
          actualVisitCount: vis?.actual ?? 0,
          vipActualVisitCount: vis?.vipActual ?? 0,
        };
      });

      // 기존 activities 중 팝업일별데이터 제외한 행들 보존
      const keep = activities
        .filter(a => a.activityType !== "팝업일별데이터")
        .map(a => ({
          activityType: a.activityType, title: a.title, locationOrTarget: a.locationOrTarget,
          startDate: a.startDate, endDate: a.endDate,
          visitors: a.visitors, participants: a.participants, budget: a.budget, vipCount: a.vipCount,
          generalReserveCount: a.generalReserveCount,
          generalReservePeople: a.generalReservePeople,
          vipReserveCount: a.vipReserveCount,
          vipReservePeople: a.vipReservePeople,
          actualVisitCount: a.actualVisitCount,
          vipActualVisitCount: a.vipActualVisitCount,
        }));

      // 최종 동기화 행 구성
      const finalRows = [
        ...keep,
        ...popupDayRows
      ];

      await syncActivities({ campaignId, rows: finalRows });

      // 팝업 예약 로컬 상태 설정
      if (generalRes.length > 0 || vipRes.length > 0) {
        const merged = generalRes.map(g => {
          const v = vipRes.find(r => r.date === g.date);
          return { date: g.date, count: g.count, people: g.people, vipCount: v?.count ?? 0, vipPeople: v?.people ?? 0 };
        });
        setReservationAllRows(merged as any);
        localStorage.setItem(`popup_reservation_url_${campaignId}`, mapping.url);
        localStorage.setItem(`popup_reservation_all_${campaignId}`, JSON.stringify(merged));
        msgs.push(`팝업 예약 ${merged.length}일`);
      }

      // 방문자 로컬 상태 설정
      if (visitorRows_.length > 0) {
        const visRows = visitorRows_.map(r => ({ date: r.date, actual: r.actual, vipActual: r.vipActual, actualCount: r.actualCount ?? 0, rate: "—" }));
        setVisitorAllRows(visRows);
        localStorage.setItem(`popup_visitor_url_${campaignId}`, mapping.url);
        localStorage.setItem(`popup_visitor_all_${campaignId}`, JSON.stringify(visRows));
        msgs.push(`방문자 ${visRows.length}일`);
      }

      setPopupAnalysisMsg(msgs.length > 0 ? `✅ 동기화 완료: ${msgs.join(", ")}` : "⚠️ 파싱된 데이터가 없습니다. 매핑을 확인해주세요.");
    } catch (e: any) {
      setPopupAnalysisMsg(`❌ ${e.message}`);
    } finally {
      setPopupSyncing(false);
    }
  }, [campaignId, activities, syncActivities, parseSheetWithMapping]);

  // ── AI 시트 분석 ─────────────────────────────────────────────────
  const analyzePopupSheet = useCallback(async () => {
    if (!popupAnalysisUrl) return;
    setPopupAnalysisStep("analyzing");
    setPopupAnalysisMsg("");
    try {
      const res = await fetch("/api/analyze-popup-sheet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sheetUrl: popupAnalysisUrl }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "분석 실패");
      const m = { ...json.mapping, url: popupAnalysisUrl };
      setPopupDraftMapping(m);
      setPreviewRows(json.previewRows || []);
      // draftRows 초기화 (comma-separated 문자열)
      const dr = m.dataRows || {};
      setDraftRows({
        dateHeaderRows:  (m.dateHeaderRows  || []).join(", "),
        dateStartCol:    m.dateStartCol || "",
        colSpan:         m.colSpan != null ? String(m.colSpan) : "2",
        vipReserve:      (dr.vipReserve     || []).join(", "),
        generalReserve:  (dr.generalReserve || []).join(", "),
        actualVisit:     (dr.actualVisit    || []).join(", "),
        walkin:          (dr.walkin         || []).join(", "),
        totalVisit:      (dr.totalVisit     || []).join(", "),
      });
      setPopupAnalysisStep("review");
    } catch (e: any) {
      setPopupAnalysisMsg(`❌ ${e.message}`);
      setPopupAnalysisStep("idle");
    }
  }, [popupAnalysisUrl]);

  // 행 번호 문자열 → 숫자 배열 파서
  const parseRowNums = (s: string): number[] =>
    s.split(/[,\s]+/).map(n => parseInt(n.trim())).filter(n => !isNaN(n) && n > 0);

  const toggleRowMapping = (key: string, rowNum: number) => {
    setDraftRows(prev => {
      const currentVal = prev[key] || "";
      const nums = currentVal.split(/[,\s]+/).map(n => parseInt(n.trim())).filter(n => !isNaN(n) && n > 0);
      const exists = nums.includes(rowNum);
      let nextNums: number[];
      if (exists) {
        nextNums = nums.filter(n => n !== rowNum);
      } else {
        nextNums = [...nums, rowNum].sort((a, b) => a - b);
      }
      return { ...prev, [key]: nextNums.join(", ") };
    });
  };

  // ── 매핑 확정 & 저장 ──────────────────────────────────────────────
  const confirmPopupMapping = useCallback(async () => {
    if (!popupDraftMapping) return;
    const colSpanNum = parseInt(draftRows.colSpan || "2", 10);
    const confirmed: any = {
      url: popupAnalysisUrl,
      dateHeaderRows: parseRowNums(draftRows.dateHeaderRows || ""),
      dateStartCol:   (draftRows.dateStartCol || "").trim().toUpperCase() || undefined,
      colSpan:        isNaN(colSpanNum) ? undefined : colSpanNum,
      dataRows: {
        vipReserve:     parseRowNums(draftRows.vipReserve    || ""),
        generalReserve: parseRowNums(draftRows.generalReserve|| ""),
        actualVisit:    parseRowNums(draftRows.actualVisit   || ""),
        walkin:         parseRowNums(draftRows.walkin        || ""),
        totalVisit:     parseRowNums(draftRows.totalVisit    || ""),
      },
      confidence: popupDraftMapping.confidence,
      notes: popupDraftMapping.notes,
    };
    setPopupConfirmedMapping(confirmed);
    setPopupAnalysisStep("confirmed");
    try { localStorage.setItem(`popup_ai_mapping_${campaignId}`, JSON.stringify(confirmed)); } catch {}
    await syncWithPopupMapping(confirmed);
  }, [popupDraftMapping, popupAnalysisUrl, draftRows, campaignId, syncWithPopupMapping]);


  // ── 기간 필터 적용된 행 ──
  const reservationRows = useMemo(() => {
    if (!reservationAllRows) return null;
    return reservationAllRows.filter(r => {
      const d = normalizeDate(r.date);
      if (!d) return true;
      if (reservationDateFrom && d < reservationDateFrom) return false;
      if (reservationDateTo   && d > reservationDateTo)   return false;
      return true;
    });
  }, [reservationAllRows, reservationDateFrom, reservationDateTo]);

  const visitorRows = useMemo(() => {
    if (!visitorAllRows) return null;
    return visitorAllRows.filter(r => {
      const d = normalizeDate(r.date);
      if (!d) return true;
      if (reservationDateFrom && d < reservationDateFrom) return false;
      if (reservationDateTo   && d > reservationDateTo)   return false;
      return true;
    });
  }, [visitorAllRows, reservationDateFrom, reservationDateTo]);

  const eventActivities = useMemo(() => activities.filter(a => a.activityType !== "팝업" && a.activityType !== "팝업일별데이터"), [activities]);
  const popupActivities = useMemo(() => activities.filter(a => a.activityType === "팝업" || a.activityType === "팝업일별데이터"), [activities]);

  // 응답 데이터가 있으면 실제 응답 건수 기준, 없으면 activities 수동 입력값 사용
  const eventStats = useMemo(() => {
    const participants = responseData && responseData.length > 0
      ? responseData.length
      : eventActivities.reduce((s, a) => s + a.participants, 0);
    const traffic = eventActivities.reduce((s, a) => s + a.visitors, 0);
    return { participants, traffic };
  }, [responseData, eventActivities]);

  // 응답 일자별 집계 (responseData 기반)
  const responseDailyMap = useMemo(() => {
    if (!responseData || responseData.length === 0) return null;
    const map = new Map<string, number>();
    responseData.forEach(r => {
      if (!r.date) return;
      const key = r.date.slice(5).replace("-", "/"); // "MM/DD"
      map.set(key, (map.get(key) || 0) + 1);
    });
    return map;
  }, [responseData]);

  const popupStats = useMemo(() => {
    let visitors = 0;
    let vipVisitors = 0;
    let reservations = 0;

    const hasDailyData = popupActivities.some(a => a.activityType === "팝업일별데이터");

    popupActivities.forEach(a => {
      if (a.activityType === "팝업일별데이터") {
        visitors += a.actualVisitCount ?? 0;
        vipVisitors += a.vipActualVisitCount ?? 0;
        reservations += (a.generalReservePeople ?? 0) + (a.vipReservePeople ?? 0);
      } else if (!hasDailyData) {
        // 일별 데이터가 없을 때만 요약형 팝업 activity 사용
        visitors += a.participants;
        vipVisitors += a.vipCount ?? 0;
        reservations += a.visitors;
      }
    });

    return { visitors, vipVisitors, reservations };
  }, [popupActivities]);

  // 날짜 필터 연동 팝업 누적 예약 합계 계산
  const reservationStats = useMemo(() => {
    let generalCount = 0;
    let generalPeople = 0;
    let vipCount = 0;
    let vipPeople = 0;
    let totalPeople = 0;

    if (reservationRows) {
      reservationRows.forEach(row => {
        generalCount += row.count || 0;
        generalPeople += row.people ?? row.count ?? 0;
        vipCount += row.vipCount || 0;
        vipPeople += row.vipPeople ?? row.vipCount ?? 0;
      });
      totalPeople = generalPeople + vipPeople;
    }

    return { generalCount, generalPeople, vipCount, vipPeople, totalPeople };
  }, [reservationRows]);

  // 날짜 필터 연동 팝업 누적 방문자 합계 계산
  const visitorStats = useMemo(() => {
    let actual = 0;
    let vipActual = 0;
    let actualCount = 0;
    if (visitorRows) {
      visitorRows.forEach(row => {
        actual += row.actual || 0;
        vipActual += row.vipActual || 0;
        actualCount += (row as any).actualCount || 0;
      });
    }
    return { actual, vipActual, actualCount };
  }, [visitorRows]);

  const combinedChartData = useMemo(() => {
    const map = new Map<string, any>();

    // 캠페인 시작일~종료일(또는 오늘)로 날짜 축 채우기
    // T00:00:00 추가로 UTC가 아닌 로컬 시간대로 파싱하여 한국 시간대 버그 방지
    if (campaign?.startDate && campaign?.endDate) {
      const start = new Date(campaign.startDate.includes("T") ? campaign.startDate : campaign.startDate + "T00:00:00");
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const end = new Date(campaign.endDate.includes("T") ? campaign.endDate : campaign.endDate + "T00:00:00");
      // 캠페인이 아직 시작 전(today < start)이면 종료일까지 전체 표시
      // 진행 중이면 오늘까지, 종료됐으면 종료일까지
      const limit = today < start ? end : (today <= end ? today : end);
      const cur = new Date(start);
      while (cur <= limit) {
        const key = `${String(cur.getMonth() + 1).padStart(2, "0")}/${String(cur.getDate()).padStart(2, "0")}`;
        map.set(key, { name: key, 이벤트참여자: 0, 팝업방문객: 0, VIP방문객: 0 });
        cur.setDate(cur.getDate() + 1);
      }
    }

    // 이벤트 참여자: responseData 응답 일자별 집계 우선, 없으면 activities 수동값
    if (responseDailyMap && responseDailyMap.size > 0) {
      responseDailyMap.forEach((count, dateKey) => {
        if (!map.has(dateKey)) map.set(dateKey, { name: dateKey, 이벤트참여자: 0, 팝업방문객: 0, VIP방문객: 0 });
        map.get(dateKey).이벤트참여자 += count;
      });
    } else {
      eventActivities.forEach(a => {
        const date = a.startDate ? a.startDate.slice(5).replace("-", "/") : "미상";
        if (!map.has(date)) map.set(date, { name: date, 이벤트참여자: 0, 팝업방문객: 0, VIP방문객: 0 });
        map.get(date).이벤트참여자 += a.participants;
      });
    }

    popupActivities.forEach(a => {
      const date = a.startDate ? a.startDate.slice(5).replace("-", "/") : "미상";
      if (!map.has(date)) map.set(date, { name: date, 이벤트참여자: 0, 팝업방문객: 0, VIP방문객: 0 });
      if (a.activityType === "팝업일별데이터") {
        // 팝업방문객 = 일반+VIP 합산 (그래프에 총 방문자 표시)
        map.get(date).팝업방문객 += (a.actualVisitCount ?? 0) + (a.vipActualVisitCount ?? 0);
        map.get(date).VIP방문객 += a.vipActualVisitCount ?? 0;
      } else {
        map.get(date).팝업방문객 += a.participants;
        map.get(date).VIP방문객 += a.vipCount ?? 0;
      }
    });

    const arr = Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
    return arr;
  }, [eventActivities, popupActivities, campaign, responseDailyMap]);

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
        {isAdmin && (
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
        )}
      </div>

      {showSettings && (
        <GlassCard className="p-6 border-indigo-100 bg-indigo-50/30">
          <h3 className="text-sm font-bold text-gray-900 mb-4 flex items-center gap-2">
            <Link2 className="w-4 h-4 text-indigo-500" /> 스프레드시트 연결
          </h3>
          <p className="text-xs text-gray-500 mb-4">구글 시트 URL을 입력하면 자동으로 데이터를 파싱합니다. 시트는 <strong>링크가 있는 모든 사용자에게 공개</strong>되어야 합니다.</p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            {([
              { type: "event"    as const, label: "📋 이벤트 신청 데이터",              url: eventSheetUrl,    setUrl: setEventSheetUrl,    accentClass: "focus:border-indigo-400", btnClass: "bg-indigo-600 hover:bg-indigo-700", action: "동기화" },
              { type: "response" as const, label: "📝 이벤트 응답 분석 데이터",         url: responseSheetUrl, setUrl: setResponseSheetUrl, accentClass: "focus:border-violet-400", btnClass: "bg-violet-600 hover:bg-violet-700", action: "저장" },
            ]).map(({ type, label, url, setUrl, accentClass, btnClass, action }) => (
              <div key={type} className="flex flex-col gap-2">
                {/* 레이블 행 — 삭제 확인 시 교체 */}
                <div className="flex items-center justify-between min-h-[18px]">
                  {confirmDelete === type ? (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-red-600 font-semibold">정말 삭제하시겠습니까?</span>
                      <button
                        onClick={() => clearDataSource(type)}
                        className="px-2 py-0.5 bg-red-600 text-white rounded text-[11px] font-bold hover:bg-red-700 transition-colors"
                      >
                        삭제
                      </button>
                      <button
                        onClick={() => setConfirmDelete(null)}
                        className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-[11px] font-bold hover:bg-gray-200 transition-colors"
                      >
                        취소
                      </button>
                    </div>
                  ) : (
                    <label className="text-xs font-semibold text-gray-700">{label}</label>
                  )}
                  {/* 항상 삭제 버튼 표시 (URL 없어도 Convex 데이터가 남아있을 수 있음) */}
                  {confirmDelete !== type && (
                    <button
                      onClick={() => { setConfirmDelete(type); setSyncMessage(""); }}
                      className="flex items-center gap-1 text-[11px] text-gray-400 hover:text-red-500 transition-colors"
                      title="데이터 삭제"
                    >
                      <Trash2 className="w-3 h-3" /> 삭제
                    </button>
                  )}
                </div>
                {/* URL 입력 + 동기화/저장 버튼 */}
                <div className="flex gap-2">
                  <input
                    className={`flex-1 bg-white border border-gray-200 rounded-lg px-3 py-2 text-xs text-gray-900 outline-none ${accentClass} placeholder:text-gray-400`}
                    placeholder="구글 시트 URL 입력"
                    value={url}
                    onChange={e => { setUrl(e.target.value); setConfirmDelete(null); }}
                  />
                  <Button
                    size="sm"
                    disabled={syncing === type || !url}
                    onClick={() => syncFromSheet(type, url)}
                    className={`${btnClass} text-white border-0 gap-1 px-3`}
                  >
                    {syncing === type ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                    {action}
                  </Button>
                </div>
              </div>
            ))}
          </div>

          {syncMessage && (
            <p className={`text-xs mt-2 ${syncMessage.startsWith("✅") ? "text-green-600" : "text-red-500"}`}>{syncMessage}</p>
          )}

          {/* ── AI 팝업 시트 매핑 ── */}
          <div className="border-t border-indigo-100 pt-4 mt-2">
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-gray-700">🤖 팝업 운영 현황 시트 (AI 자동 매핑)</label>
              {popupAnalysisStep === "confirmed" && (
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-green-600 bg-green-50 border border-green-100 px-2 py-0.5 rounded-full">✓ 매핑 저장됨</span>
                  <button
                    onClick={() => {
                      setPopupAnalysisStep("idle");
                      setPopupDraftMapping(null);
                      setPopupConfirmedMapping(null);
                      setPopupAnalysisMsg("");
                      try { localStorage.removeItem(`popup_ai_mapping_${campaignId}`); } catch {}
                    }}
                    className="flex items-center gap-1 text-[11px] text-gray-400 hover:text-red-500"
                  ><Trash2 className="w-3 h-3" /> 초기화</button>
                </div>
              )}
            </div>

            {/* Step 1: URL 입력 + 분석 버튼 */}
            <div className="flex gap-2 mb-2">
              <input
                className="flex-1 bg-white border border-gray-200 rounded-lg px-3 py-2 text-xs text-gray-900 outline-none focus:border-orange-400 placeholder:text-gray-400"
                placeholder="구글 시트 URL 입력 (gid 포함)"
                value={popupAnalysisUrl}
                onChange={e => { setPopupAnalysisUrl(e.target.value); setPopupAnalysisMsg(""); }}
              />
              <Button
                size="sm"
                disabled={popupAnalysisStep === "analyzing" || !popupAnalysisUrl}
                onClick={popupAnalysisStep === "confirmed" ? () => { setPopupAnalysisStep("idle"); setPopupDraftMapping(null); } : analyzePopupSheet}
                className="bg-orange-600 hover:bg-orange-700 text-white border-0 gap-1 px-3 whitespace-nowrap"
              >
                {popupAnalysisStep === "analyzing"
                  ? <><RefreshCw className="w-3 h-3 animate-spin" /> 분석 중...</>
                  : popupAnalysisStep === "confirmed"
                  ? <><RefreshCw className="w-3 h-3" /> 재분석</>
                  : <><Settings2 className="w-3 h-3" /> AI 분석</>}
              </Button>
              {popupAnalysisStep === "confirmed" && (
                <Button
                  size="sm"
                  disabled={popupSyncing}
                  onClick={() => popupConfirmedMapping && syncWithPopupMapping(popupConfirmedMapping)}
                  className="bg-green-600 hover:bg-green-700 text-white border-0 gap-1 px-3"
                >
                  {popupSyncing ? <RefreshCw className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                  재동기화
                </Button>
              )}
            </div>

            {/* Step 2: 분석 결과 검토 UI */}
            {popupAnalysisStep === "review" && popupDraftMapping && (
              <div className="bg-orange-50 border border-orange-100 rounded-xl p-4 mt-2">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-orange-800">AI 분석 결과</span>
                    <span className={cn(
                      "text-[10px] px-2 py-0.5 rounded-full font-medium",
                      (popupDraftMapping.confidence || 0) >= 70 ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"
                    )}>
                      신뢰도 {popupDraftMapping.confidence ?? "?"}%
                    </span>
                  </div>
                </div>
                {popupDraftMapping.notes && (
                  <p className="text-[11px] text-orange-600 bg-orange-100 rounded px-2 py-1 mb-3">{popupDraftMapping.notes}</p>
                )}
                {/* 열 설정 */}
                <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 mb-3">
                  <p className="text-[11px] font-bold text-blue-800 mb-2">📐 열(Column) 구조 설정</p>
                  <div className="flex flex-wrap gap-3 items-end">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-gray-600 shrink-0">날짜 시작 열</span>
                      <input
                        className="w-16 bg-white border border-blue-200 rounded px-2 py-1 text-xs text-gray-900 outline-none focus:border-blue-400 uppercase text-center font-mono font-bold"
                        value={draftRows.dateStartCol || ""}
                        onChange={e => setDraftRows(prev => ({ ...prev, dateStartCol: e.target.value.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 2) }))}
                        placeholder="E"
                        maxLength={2}
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-gray-600 shrink-0">열 간격</span>
                      <select
                        className="bg-white border border-blue-200 rounded px-2 py-1 text-xs text-gray-900 outline-none focus:border-blue-400"
                        value={draftRows.colSpan || "2"}
                        onChange={e => setDraftRows(prev => ({ ...prev, colSpan: e.target.value }))}
                      >
                        <option value="1">1 (싱글: 건수/명수 한 셀)</option>
                        <option value="2">2 (듀얼: VIP/일반 나뉨)</option>
                      </select>
                    </div>
                  </div>
                  <p className="text-[10px] text-gray-400 mt-1.5">미리보기 테이블의 열 헤더를 클릭해서 날짜 시작 열을 설정할 수 있어요</p>
                </div>

                {/* 행 설정 */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mb-3">
                  {([
                    { key: "dateHeaderRows",  label: "📅 날짜 헤더 행" },
                    { key: "vipReserve",      label: "👑 VIP 사전 예약" },
                    { key: "generalReserve",  label: "🏬 일반 사전 예약" },
                    { key: "actualVisit",     label: "✅ 실제 방문자" },
                    { key: "walkin",          label: "🚶 워크인 방문" },
                    { key: "totalVisit",      label: "👥 총 방문객" },
                  ] as const).map(({ key, label }) => (
                    <div key={key} className="flex items-center gap-2">
                      <span className="text-[11px] text-gray-600 w-[130px] shrink-0">{label}</span>
                      <input
                        className="flex-1 bg-white border border-orange-200 rounded px-2 py-1 text-xs text-gray-900 outline-none focus:border-orange-400"
                        value={draftRows[key] || ""}
                        onChange={e => setDraftRows(prev => ({ ...prev, [key]: e.target.value }))}
                        placeholder="행 번호 (예: 7, 15, 23)"
                      />
                    </div>
                  ))}
                </div>
                <p className="text-[10px] text-gray-400 mb-3">행 번호는 쉼표로 구분. 날짜 블록이 여러 개면 순서대로 입력 (예: 16, 27, 39)</p>

                {/* 시트 데이터 미리보기 & 클릭 매핑 도구 */}
                {previewRows && previewRows.length > 0 && (
                  <div className="mt-4 border-t border-orange-100 pt-4 mb-4">
                    <h5 className="text-[11px] font-bold text-orange-800 mb-2">📋 시트 데이터 미리보기 (각 행 좌측의 뱃지를 클릭하여 매핑을 쉽고 빠르게 설정하세요)</h5>
                    <div className="overflow-x-auto border border-orange-200 rounded-xl max-h-[300px] overflow-y-auto bg-white">
                      <table className="w-full text-left border-collapse text-[10px]">
                        <thead>
                          <tr className="bg-orange-50/50 sticky top-0 border-b border-orange-100 z-20">
                            <th className="p-2 border-r border-orange-100 font-bold text-orange-950 w-[120px] text-center bg-orange-50/80 sticky left-0 z-30">
                              <span className="block">행번호</span>
                              <span className="text-[9px] text-gray-400 font-normal">매핑 설정</span>
                            </th>
                            {previewRows[0]?.map((_, colIdx) => {
                              const letter = String.fromCharCode(65 + colIdx);
                              const isSelected = (draftRows.dateStartCol || "").toUpperCase() === letter;
                              return (
                                <th
                                  key={colIdx}
                                  className={cn(
                                    "p-2 font-bold min-w-[90px] cursor-pointer transition-colors select-none",
                                    isSelected
                                      ? "bg-blue-500 text-white"
                                      : "text-gray-500 hover:bg-blue-50 hover:text-blue-700"
                                  )}
                                  title={`${letter}열을 날짜 시작 열로 지정`}
                                  onClick={() => setDraftRows(prev => ({
                                    ...prev,
                                    dateStartCol: isSelected ? "" : letter,
                                  }))}
                                >
                                  {letter}열
                                  {isSelected && <span className="block text-[9px] font-normal">📅시작</span>}
                                </th>
                              );
                            })}
                          </tr>
                        </thead>
                        <tbody>
                          {previewRows.map((row, rowIdx) => {
                            const rowNum = rowIdx + 1;
                            return (
                              <tr key={rowIdx} className="border-b border-orange-100/50 hover:bg-orange-50/20 transition-colors">
                                <td className="p-2 border-r border-orange-100 sticky left-0 bg-white font-mono text-center flex flex-col gap-1 items-center justify-center min-h-[45px] shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)] z-10">
                                  <span className="font-bold text-gray-700 text-[9px]">{rowNum} 행</span>
                                  <div className="flex flex-wrap gap-0.5 justify-center max-w-[110px]">
                                    {([
                                      { key: "dateHeaderRows",  label: "날짜", color: "bg-blue-600 border-blue-600 text-white" },
                                      { key: "generalReserve",  label: "일반", color: "bg-amber-600 border-amber-600 text-white" },
                                      { key: "vipReserve",      label: "VIP",  color: "bg-yellow-600 border-yellow-600 text-white" },
                                      { key: "actualVisit",     label: "방문", color: "bg-green-600 border-green-600 text-white" },
                                    ] as const).map(({ key, label, color }) => {
                                      const isActive = parseRowNums(draftRows[key] || "").includes(rowNum);
                                      return (
                                        <button
                                          key={key}
                                          type="button"
                                          onClick={() => toggleRowMapping(key, rowNum)}
                                          className={cn(
                                            "px-1 py-0.5 text-[8px] rounded border font-medium transition-all duration-150 active:scale-95",
                                            isActive
                                              ? `${color} font-bold shadow-sm`
                                              : "bg-gray-50 text-gray-400 border-gray-200 hover:border-gray-400 hover:text-gray-600"
                                          )}
                                        >
                                          {label}
                                        </button>
                                      );
                                    })}
                                  </div>
                                </td>
                                {row.map((cell, colIdx) => (
                                  <td key={colIdx} className="p-2 text-gray-600 truncate max-w-[160px] font-sans" title={cell}>
                                    {cell}
                                  </td>
                                ))}
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
                <div className="flex gap-2">
                  <Button size="sm" onClick={confirmPopupMapping}
                    className="bg-orange-600 hover:bg-orange-700 text-white border-0 gap-1">
                    <Check className="w-3 h-3" /> 저장 및 동기화
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setPopupAnalysisStep("idle")}
                    className="border-gray-200 text-gray-600">
                    취소
                  </Button>
                </div>
              </div>
            )}

            {/* Step 3: 확정된 매핑 요약 */}
            {popupAnalysisStep === "confirmed" && popupConfirmedMapping && (
              <div className="bg-green-50 border border-green-100 rounded-lg p-3 mt-2">
                <p className="text-[11px] text-green-700 font-semibold mb-1">✓ 저장된 매핑</p>
                <div className="flex gap-4 mb-2">
                  {popupConfirmedMapping.dateStartCol && (
                    <p className="text-[10px] text-blue-700 font-medium bg-blue-50 px-2 py-0.5 rounded">📐 날짜 시작: {popupConfirmedMapping.dateStartCol}열 / 간격: {popupConfirmedMapping.colSpan ?? "자동"}열</p>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
                  {([
                    ["날짜 헤더", (popupConfirmedMapping.dateHeaderRows || []).join(", ")],
                    ["VIP 예약", (popupConfirmedMapping.dataRows?.vipReserve || []).join(", ")],
                    ["일반 예약", (popupConfirmedMapping.dataRows?.generalReserve || []).join(", ")],
                    ["실제 방문", (popupConfirmedMapping.dataRows?.actualVisit || []).join(", ")],
                    ["총 방문객", ((popupConfirmedMapping.dataRows as any)?.totalVisit || []).join(", ")],
                  ] as [string, string][]).map(([k, v]) => v && (
                    <p key={k} className="text-[10px] text-gray-500"><span className="font-medium text-gray-600">{k}:</span> {v}행</p>
                  ))}
                </div>
              </div>
            )}

            {popupAnalysisMsg && (
              <p className={cn("text-xs mt-2", popupAnalysisMsg.startsWith("✅") ? "text-green-600" : popupAnalysisMsg.startsWith("⚠️") ? "text-amber-600" : "text-red-500")}>
                {popupAnalysisMsg}
              </p>
            )}
          </div>
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
              />: <span className="font-mono text-gray-600 font-semibold">
                {micrositeTraffic !== null ? micrositeTraffic.toLocaleString() : eventStats.traffic.toLocaleString()}
              </span>
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
              <ComposedChart data={combinedChartData} margin={{ top: 10, right: 30, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.04)" vertical={false} />
                <XAxis dataKey="name" stroke="rgba(0,0,0,0.4)" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} dy={10} />
                <YAxis yAxisId="left" stroke="rgba(229,0,16,0.4)" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#e50010" }} />
                <YAxis yAxisId="right" orientation="right" stroke="rgba(0,0,0,0.2)" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#9ca3af" }} />
                <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(0,0,0,0.02)" }} />
                <Legend wrapperStyle={{ fontSize: "12px", paddingTop: "16px" }} iconType="circle" />
                <Bar yAxisId="right" dataKey="팝업방문객" name="팝업 방문객" fill="#9ca3af" radius={[4, 4, 0, 0]} barSize={28} stackId="popup" />
                <Bar yAxisId="right" dataKey="VIP방문객" name="VIP 방문객" fill="#f59e0b" radius={[4, 4, 0, 0]} barSize={28} stackId="popup" />
                <Line yAxisId="left" type="monotone" dataKey="이벤트참여자" name="이벤트 참여자" stroke="#e50010" strokeWidth={3} dot={{ r: 4, fill: "#e50010", strokeWidth: 2, stroke: "#fff" }} activeDot={{ r: 6 }} />
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
            onClick={() => { setActiveTab("popup"); setNewBadgeReview(false); }}
            className={cn("relative px-4 py-3 text-sm font-bold flex items-center gap-2 border-b-2 transition-all", activeTab === "popup" ? "border-gray-900 text-gray-900" : "border-transparent text-gray-400 hover:text-gray-600")}
          >
            <MapPin className="w-4 h-4" /> 팝업 성과 & 리뷰 분석
            {newBadgeReview && (
              <span className="w-2 h-2 rounded-full bg-red-500 ml-0.5" />
            )}
          </button>
        </div>

        {activeTab === "event" && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
            {responseSheetUrl && isAdmin && (
              <div className="flex items-center gap-2 text-xs text-gray-500 bg-gray-50 border border-gray-100 rounded-lg px-3 py-2">
                <Link2 className="w-3 h-3 text-violet-500" />
                연결된 시트:
                <a href={responseSheetUrl} target="_blank" rel="noopener noreferrer" className="text-violet-600 hover:underline truncate max-w-xs">{responseSheetUrl}</a>
                {responseData && (
                  <span className="ml-auto text-violet-600 font-semibold">{responseData.length}건 응답</span>
                )}
              </div>
            )}
            {responseData && responseData.length > 0 ? (() => {
              // 실제 데이터에서 키워드 추출
              const realKeywords = (() => {
                const kwCount = new Map<string, number>();
                responseData.forEach(r => {
                  extractKwFromText(r.text).forEach(kw => {
                    kwCount.set(kw, (kwCount.get(kw) ?? 0) + 1);
                  });
                });
                const total = responseData.length || 1;
                return [...kwCount.entries()]
                  .sort((a, b) => b[1] - a[1])
                  .slice(0, 12)
                  .map(([text, count]) => ({text, weight: Math.round(count / total * 100)}));
              })();

              return (
                <GlassCard className="p-6">
                  <div className="flex flex-col gap-6">

                    <div>
                      <h4 className="text-sm font-bold text-gray-900 mb-1 flex items-center gap-2">
                        <MessageCircle className="w-4 h-4 text-red-600" /> 사연 신청 키워드 분석
                        <span className="text-xs font-normal text-gray-400">총 {responseData.length}건</span>
                      </h4>
                      <p className="text-xs text-gray-400 mb-3">실제 사연 내용에서 추출한 키워드 빈도입니다.</p>
                      {realKeywords.length > 0
                        ? <KeywordBubbles keywords={realKeywords} selectedKeyword={selectedKeyword} onSelectKeyword={setSelectedKeyword} />
                        : <p className="text-xs text-gray-400">키워드를 추출할 수 없습니다.</p>
                      }
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-gray-900 mb-3 flex items-center gap-2">
                        <Quote className="w-4 h-4 text-red-600" /> 사연 신청 원문
                        {selectedKeyword && (
                          <button
                            onClick={() => setSelectedKeyword(null)}
                            className="bg-red-50 hover:bg-red-100 text-red-600 text-[10px] px-2 py-0.5 rounded-full font-bold ml-2 transition-colors flex items-center gap-1 border border-red-200"
                          >
                            "{selectedKeyword}" 필터 해제 ✕
                          </button>
                        )}
                      </h4>
                      <div className="space-y-3 overflow-y-auto pr-2 custom-scrollbar max-h-[360px]">
                        {(() => {
                          const filtered = selectedKeyword
                            ? responseData.filter(r => r.text.includes(selectedKeyword))
                            : responseData;
                          if (filtered.length === 0) {
                            return <p className="text-xs text-gray-400 py-4 text-center">해당 키워드가 포함된 사연이 없습니다.</p>;
                          }
                          return filtered.map((r, i) => (
                            <div key={i} className="bg-gray-50 border border-gray-100 rounded-lg p-3">
                              <div className="flex items-center gap-2 mb-1">
                                {r.name && <span className="text-xs font-semibold text-gray-700">{r.name}</span>}
                                {r.date && <span className="text-xs text-gray-400 font-mono">{r.date}</span>}
                              </div>
                              <p className="text-sm text-gray-700 leading-relaxed">"{r.text}"</p>
                            </div>
                          ));
                        })()}
                      </div>
                    </div>
                  </div>
                </GlassCard>
              );
            })() : (
              <GlassCard className="p-6">
                <div className="flex flex-col items-center gap-3 py-10 text-gray-400">
                  <MessageSquare className="w-8 h-8 opacity-30" />
                  <p className="text-sm font-medium">이벤트 응답 데이터가 없습니다.</p>
                  {isAdmin && (
                    <p className="text-xs">
                      데이터 소스 관리에서{" "}
                      <button onClick={() => setShowSettings(true)} className="text-violet-600 underline">
                        📝 이벤트 응답 분석 데이터
                      </button>
                      를 연결하세요.
                    </p>
                  )}
                </div>
              </GlassCard>
            )}
          </div>
        )}

        {activeTab === "popup" && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

              {/* ── 일자별 예약 신청 건 수 ── */}
              <GlassCard className="p-0 overflow-hidden border-t-4 border-t-gray-900">
                <div className="p-5 border-b border-gray-100 bg-white space-y-3">
                  {/* 제목 + 기간 설정 */}
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <h4 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                      <CalendarDays className="w-4 h-4 text-gray-900" /> 일자별 예약 신청 건 수
                    </h4>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <input
                        type="date"
                        value={reservationDateFrom}
                        onChange={e => {
                          setReservationDateFrom(e.target.value);
                          localStorage.setItem(`popup_reservation_from_${campaignId}`, e.target.value);
                        }}
                        className="border border-gray-200 rounded px-2 py-1 text-xs text-gray-700 outline-none focus:border-gray-400 bg-white"
                      />
                      <span className="text-xs text-gray-400">~</span>
                      <input
                        type="date"
                        value={reservationDateTo}
                        onChange={e => {
                          setReservationDateTo(e.target.value);
                          localStorage.setItem(`popup_reservation_to_${campaignId}`, e.target.value);
                        }}
                        className="border border-gray-200 rounded px-2 py-1 text-xs text-gray-700 outline-none focus:border-gray-400 bg-white"
                      />
                      {isAdmin && (
                        <button
                          onClick={() => setShowReservationUrl(!showReservationUrl)}
                          className={`flex items-center gap-1 text-xs border rounded px-2 py-1 transition-colors ${showReservationUrl ? "bg-gray-900 text-white border-gray-900" : "text-gray-500 border-gray-200 hover:border-gray-400"}`}
                        >
                          <Link2 className="w-3 h-3" /> 시트 연동
                        </button>
                      )}
                    </div>
                  </div>
                  {/* 시트 URL 입력 (토글) */}
                  {showReservationUrl && isAdmin && (
                    <div className="space-y-2">
                      <div className="flex gap-2">
                        <input
                          className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-xs outline-none focus:border-gray-400 placeholder:text-gray-400"
                          placeholder="구글 시트 URL (링크가 있는 모든 사용자에게 공개 필요)"
                          value={reservationUrl}
                          onChange={e => setReservationUrl(e.target.value)}
                        />
                        <Button
                          size="sm"
                          disabled={reservationSyncing || !reservationUrl}
                          onClick={syncReservationSheet}
                          className="bg-gray-900 text-white hover:bg-gray-800 gap-1 text-xs px-3"
                        >
                          {reservationSyncing ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                          동기화
                        </Button>
                        {reservationAllRows && (
                          <button
                            onClick={() => {
                              setReservationAllRows(null);
                              setReservationUrl("");
                              setShowReservationUrl(false);
                              localStorage.removeItem(`popup_reservation_url_${campaignId}`);
                              localStorage.removeItem(`popup_reservation_all_${campaignId}`);
                            }}
                            className="p-1.5 text-gray-400 hover:text-red-500 transition-colors border border-gray-200 rounded"
                            title="데이터 삭제"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                      {reservationSyncMsg && (
                        <p className={`text-xs ${reservationSyncMsg.startsWith("✅") ? "text-green-600" : "text-red-500"}`}>
                          {reservationSyncMsg}
                        </p>
                      )}
                    </div>
                  )}
                </div>
                <Table>
                  <TableHeader className="bg-gray-50/50">
                    <TableRow className="border-gray-100 hover:bg-transparent">
                      <TableHead className="text-gray-500 text-xs font-semibold">방문 희망일자</TableHead>
                      <TableHead className="text-gray-500 text-xs font-semibold text-right">일반 신청 (명)</TableHead>
                      <TableHead className="text-gray-500 text-xs font-semibold text-right">
                        <span className="flex items-center justify-end gap-1"><Crown className="w-3 h-3 text-yellow-500" />VIP (건/명)</span>
                      </TableHead>
                      <TableHead className="text-gray-500 text-xs font-semibold text-right">총 예약 (명)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {reservationRows && reservationRows.length > 0 && (
                      <TableRow className="bg-slate-700 font-bold border-b-2 border-slate-500 text-sm hover:bg-slate-700">
                        <TableCell className="text-white font-extrabold py-3.5 text-xs uppercase tracking-wider">누계 (합계)</TableCell>
                        <TableCell className="text-right font-mono text-slate-100 py-3.5 font-extrabold">
                          {reservationStats.generalPeople.toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right font-mono text-amber-300 py-3.5 font-extrabold">
                          {reservationStats.vipCount.toLocaleString()} / {reservationStats.vipPeople.toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right font-mono text-white font-black bg-slate-600 py-3.5 rounded-sm">
                          {reservationStats.totalPeople.toLocaleString()}
                        </TableCell>
                      </TableRow>
                    )}
                    {reservationRows && reservationRows.length > 0 ? (
                      reservationRows.map((row: any, i: number) => {
                        const hasPeople = (row.people ?? 0) > 0 || (row.vipPeople ?? 0) > 0;
                        const genDisplay = hasPeople ? (row.people ?? 0).toLocaleString() : row.count.toLocaleString();
                        const vipDisplay = hasPeople ? `${row.vipCount} / ${row.vipPeople}` : row.vipCount.toLocaleString();
                        const totalPeople = hasPeople ? ((row.people ?? 0) + (row.vipPeople ?? 0)) : (row.count + row.vipCount);
                        return (
                        <TableRow key={i} className="border-gray-100 hover:bg-gray-50 text-sm">
                          <TableCell className="text-gray-600 font-mono font-medium">{row.date}</TableCell>
                          <TableCell className="text-right font-mono text-gray-900 font-bold">{genDisplay}</TableCell>
                          <TableCell className="text-right font-mono text-yellow-700 font-bold bg-yellow-50/30">{vipDisplay}</TableCell>
                          <TableCell className="text-right font-mono text-gray-900 font-bold bg-gray-50">{totalPeople.toLocaleString()}</TableCell>
                        </TableRow>
                        );
                      })
                    ) : reservationRows && reservationRows.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center text-xs text-gray-400 py-8">
                          {reservationAllRows ? "해당 기간에 데이터가 없습니다." : ""}
                        </TableCell>
                      </TableRow>
                    ) : (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center py-8">
                          <div className="flex flex-col items-center gap-2 text-gray-400">
                            <Link2 className="w-5 h-5 opacity-40" />
                            <p className="text-xs">구글 시트를 연동하면 실제 데이터가 표시됩니다.</p>
                            {isAdmin && (
                              <button onClick={() => setShowReservationUrl(true)} className="text-xs text-gray-900 underline">
                                시트 연동하기
                              </button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </GlassCard>

              {/* ── 일자별 방문자 수 ── */}
              <GlassCard className="p-0 overflow-hidden border-t-4 border-t-gray-900">
                <div className="p-5 border-b border-gray-100 bg-white space-y-3">
                  {/* 제목 + 기간 설정 */}
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <h4 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                      <Users className="w-4 h-4 text-gray-900" /> 일자별 실 방문자 수
                    </h4>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <input
                        type="date"
                        value={reservationDateFrom}
                        onChange={e => {
                          setReservationDateFrom(e.target.value);
                          localStorage.setItem(`popup_reservation_from_${campaignId}`, e.target.value);
                        }}
                        className="border border-gray-200 rounded px-2 py-1 text-xs text-gray-700 outline-none focus:border-gray-400 bg-white"
                      />
                      <span className="text-xs text-gray-400">~</span>
                      <input
                        type="date"
                        value={reservationDateTo}
                        onChange={e => {
                          setReservationDateTo(e.target.value);
                          localStorage.setItem(`popup_reservation_to_${campaignId}`, e.target.value);
                        }}
                        className="border border-gray-200 rounded px-2 py-1 text-xs text-gray-700 outline-none focus:border-gray-400 bg-white"
                      />
                      {isAdmin && (
                        <>
                          <button
                            onClick={async () => {
                              await updateCampaignSettings({
                                id: campaignId,
                                popupDefaultDateFrom: reservationDateFrom || undefined,
                                popupDefaultDateTo: reservationDateTo || undefined,
                              });
                            }}
                            className="flex items-center gap-1 text-xs border rounded px-2 py-1 transition-colors text-blue-600 border-blue-200 hover:bg-blue-50"
                            title="현재 날짜 범위를 기본값으로 저장"
                          >
                            기본값 저장
                          </button>
                          <button
                            onClick={() => setShowVisitorUrl(!showVisitorUrl)}
                            className={`flex items-center gap-1 text-xs border rounded px-2 py-1 transition-colors ${showVisitorUrl ? "bg-gray-900 text-white border-gray-900" : "text-gray-500 border-gray-200 hover:border-gray-400"}`}
                          >
                            <Link2 className="w-3 h-3" /> 시트 연동
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                  {/* 시트 URL 입력 (토글) */}
                  {showVisitorUrl && isAdmin && (
                    <div className="space-y-2">
                      <div className="flex gap-2">
                        <input
                          className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-xs outline-none focus:border-gray-400 placeholder:text-gray-400"
                          placeholder="구글 시트 URL (링크가 있는 모든 사용자에게 공개 필요)"
                          value={visitorUrl}
                          onChange={e => setVisitorUrl(e.target.value)}
                        />
                        <Button
                          size="sm"
                          disabled={visitorSyncing || !visitorUrl}
                          onClick={syncVisitorSheet}
                          className="bg-gray-900 text-white hover:bg-gray-800 gap-1 text-xs px-3"
                        >
                          {visitorSyncing ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                          동기화
                        </Button>
                        {visitorAllRows && (
                          <button
                            onClick={() => {
                              setVisitorAllRows(null);
                              setVisitorUrl("");
                              setShowVisitorUrl(false);
                              localStorage.removeItem(`popup_visitor_url_${campaignId}`);
                              localStorage.removeItem(`popup_visitor_all_${campaignId}`);
                            }}
                            className="p-1.5 text-gray-400 hover:text-red-500 transition-colors border border-gray-200 rounded"
                            title="데이터 삭제"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                      {visitorSyncMsg && (
                        <p className={`text-xs ${visitorSyncMsg.startsWith("✅") ? "text-green-600" : "text-red-500"}`}>
                          {visitorSyncMsg}
                        </p>
                      )}
                    </div>
                  )}
                </div>
                <Table>
                  <TableHeader className="bg-gray-50/50">
                    <TableRow className="border-gray-100 hover:bg-transparent">
                      <TableHead className="text-gray-500 text-xs font-semibold">방문 일자</TableHead>
                      <TableHead className="text-gray-500 text-xs font-semibold text-right">일반 방문자 수 (명)</TableHead>
                      <TableHead className="text-gray-500 text-xs font-semibold text-right">
                        <span className="flex items-center justify-end gap-1"><Crown className="w-3 h-3 text-yellow-500" />VIP 방문 (명)</span>
                      </TableHead>
                      <TableHead className="text-gray-500 text-xs font-semibold text-right">총 방문 (명)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visitorRows && visitorRows.length > 0 && (
                      <TableRow className="bg-slate-700 font-bold border-b-2 border-slate-500 text-sm hover:bg-slate-700">
                        <TableCell className="text-white font-extrabold py-3.5 text-xs uppercase tracking-wider">누계 (합계)</TableCell>
                        <TableCell className="text-right font-mono text-slate-100 py-3.5 font-extrabold">
                          {visitorStats.actual.toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right font-mono text-amber-300 py-3.5 font-extrabold">
                          {visitorStats.vipActual.toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right font-mono text-white font-black bg-slate-600 py-3.5 rounded-sm">
                          {(visitorStats.actual + visitorStats.vipActual).toLocaleString()}
                        </TableCell>
                      </TableRow>
                    )}
                    {visitorRows && visitorRows.length > 0 ? (
                      visitorRows.map((row, i) => (
                        <TableRow key={i} className="border-gray-100 hover:bg-gray-50 text-sm">
                          <TableCell className="text-gray-600 font-mono font-medium">{row.date}</TableCell>
                          <TableCell className="text-right font-mono text-gray-900">
                            {row.actual.toLocaleString()}
                          </TableCell>
                          <TableCell className="text-right font-mono text-yellow-700 font-bold bg-yellow-50/30">{row.vipActual.toLocaleString()}</TableCell>
                          <TableCell className="text-right font-mono text-gray-900 font-bold">{(row.actual + row.vipActual).toLocaleString()}</TableCell>
                        </TableRow>
                      ))
                    ) : visitorRows && visitorRows.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center text-xs text-gray-400 py-8">
                          {visitorAllRows ? "해당 기간에 데이터가 없습니다." : ""}
                        </TableCell>
                      </TableRow>
                    ) : (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center py-8">
                          <div className="flex flex-col items-center gap-2 text-gray-400">
                            <Link2 className="w-5 h-5 opacity-40" />
                            <p className="text-xs">구글 시트를 연동하면 실제 데이터가 표시됩니다.</p>
                            {isAdmin && (
                              <button onClick={() => setShowVisitorUrl(true)} className="text-xs text-gray-900 underline">
                                시트 연동하기
                              </button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </GlassCard>
            </div>

            <NaverReviewAnalyzer autoTrigger={refreshTrigger} onNewReviews={() => setNewBadgeReview(true)} />
            <PopupVocSection campaignId={campaignId as string} isAdmin={isAdmin} />
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
