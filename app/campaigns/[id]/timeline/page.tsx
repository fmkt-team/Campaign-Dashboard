"use client";

import React, { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { useParams } from "next/navigation";
import { useRefresh } from "@/lib/refresh-context";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { GlassCard } from "@/components/glass-card";
import { Button } from "@/components/ui/button";
import { Plus, X, Check, ArrowRight, Trash2, Target, Pencil, FileSpreadsheet, Link, Loader2, CalendarDays } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";

// ─── 날짜 유틸 ────────────────────────────────────────────────────────────────
const MS_DAY   = 86400000;
const toTs     = (s: string) => new Date(s).getTime();
const toStr    = (ts: number) => new Date(ts).toISOString().split("T")[0];
const diffDays = (a: string, b: string) =>
  Math.floor((toTs(b) - toTs(a)) / MS_DAY);

const fmtMD = (d: string) => {
  if (!d) return "";
  const [, m, dy] = d.split("-");
  return `${parseInt(m)}/${parseInt(dy)}`;
};
const formatDDay = (start: string) => {
  const diff = Math.floor((Date.now() - toTs(start)) / MS_DAY);
  if (diff === 0) return "D-DAY";
  return diff > 0 ? `D+${diff}` : `D${diff}`;
};

// 카테고리별 색상
const PALETTE = ["#3b82f6","#8b5cf6","#f59e0b","#10b981","#ec4899","#f97316","#06b6d4","#6366f1","#e50010","#84cc16","#14b8a6"];

// 대분류 필터 칩 전용 — 인접 색상 간 최대 채도·색상 차이 보장
const CHIP_PALETTE = [
  "#e50010", // 0 레드 (Fursys)
  "#f97316", // 1 오렌지
  "#ca8a04", // 2 앰버
  "#16a34a", // 3 그린
  "#0891b2", // 4 사이안
  "#2563eb", // 5 블루
  "#7c3aed", // 6 바이올렛
  "#db2777", // 7 핑크
  "#0d9488", // 8 틸
  "#4f46e5", // 9 인디고
  "#65a30d", // 10 라임
  "#be185d", // 11 로즈
];
const COLOR_MAP: [string, string][] = [
  ["계약","#6366f1"],["제안","#6366f1"],
  ["디지털","#3b82f6"],["온라인","#3b82f6"],
  ["OOH","#8b5cf6"],["오프라인","#8b5cf6"],
  ["Branding","#e50010"],["브랜딩","#e50010"],["Film","#e50010"],
  ["TVC","#ec4899"],["PPL","#ec4899"],
  ["팝업","#10b981"],["Pop","#10b981"],["Exhibition","#10b981"],
  ["SNS","#06b6d4"],["PR","#f59e0b"],["미디어","#f59e0b"],
  ["Trophy","#f97316"],["Site","#14b8a6"],
];
const pickColor = (cat: string) => {
  for (const [k, v] of COLOR_MAP) if (cat.includes(k)) return v;
  const h = [...cat].reduce((a, c) => a * 31 + c.charCodeAt(0), 0);
  return PALETTE[Math.abs(h) % PALETTE.length];
};
const getNewColor = (newCat: string, oldColor: string) => {
  for (const [k, v] of COLOR_MAP) if (newCat.includes(k)) return v;
  return oldColor;
};

// ─── 붙여넣기 파서 ───────────────────────────────────────────────────────────
interface PastedRow {
  category: string;
  subTask: string;
  progress: number;
  startDate: string;
  endDate: string;
}
function parsePasteText(text: string, year: string): PastedRow[] {
  const results: PastedRow[] = [];
  let lastCategory = "";

  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const cols = line.split("\t").map(c => c.trim());

    // A열만 있으면 → 대분류 행
    // A열 + B열 이상 있으면 → 소분류 행
    const [colA = "", colB = "", colC = "", colD = "", colE = ""] = cols;

    if (colA && !colB) {
      lastCategory = colA;
      continue; // 대분류 전용 행은 저장 안 함 (헤더 역할)
    }

    const category = colA || lastCategory;
    if (colA) lastCategory = colA;

    const subTask = colB || colA; // B열이 없으면 A열이 업무명
    if (!subTask) continue;

    const progressRaw = colC.replace(/[%\s]/g, "");
    const progress = Math.min(100, Math.max(0, parseFloat(progressRaw) || 0));

    const parseDate = (raw: string): string => {
      if (!raw) return "";
      if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
      const m = raw.match(/^(\d{1,2})[\/\-](\d{1,2})$/);
      if (m) return `${year}-${m[1].padStart(2,"0")}-${m[2].padStart(2,"0")}`;
      return "";
    };

    results.push({
      category: category || "미분류",
      subTask,
      progress,
      startDate: parseDate(colD),
      endDate:   parseDate(colE),
    });
  }
  return results;
}

// ─── 날짜 편집 팝업 ──────────────────────────────────────────────────────────
function DatePopup({ task, onSave, onClose, onSaveLabel, updateTask }: {
  task: any; onSave: (id: string, s: string, e: string) => void; onClose: () => void; onSaveLabel?: (id: string, label: string) => void; updateTask?: any;
}) {
  const [s, setS] = useState(task.startDate || "");
  const [e, setE] = useState(task.endDate   || "");
  const [label, setLabel] = useState(task.barLabel || "");

  const handleSave = async () => {
    onSave(task._id, s, e);
    if (label !== task.barLabel && updateTask) {
      await updateTask({ taskId: task._id, barLabel: label });
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-white/90 backdrop-blur-sm"
      onClick={onClose}>
      <div className="bg-white border border-gray-200 rounded-2xl p-6 w-72 shadow-xl"
        onClick={ev => ev.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-gray-900 text-sm font-semibold truncate">{task.subTask || "기간 편집"}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 ml-2 shrink-0"><X className="w-4 h-4" /></button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-gray-500 block mb-1">텍스트</label>
            <input type="text" value={label} onChange={v => setLabel(v.target.value)}
              placeholder="바에 표시할 텍스트 (선택)"
              className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-gray-900 text-sm outline-none focus:border-gray-400" />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">시작일</label>
            <input type="date" value={s} onChange={v => setS(v.target.value)}
              className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-gray-900 text-sm outline-none focus:border-gray-400" />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">종료일</label>
            <input type="date" value={e} onChange={v => setE(v.target.value)}
              className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-gray-900 text-sm outline-none focus:border-gray-400" />
          </div>
        </div>
        <div className="flex gap-2 mt-4">
          <Button variant="ghost" size="sm" className="flex-1 text-gray-500 hover:bg-gray-50" onClick={onClose}>취소</Button>
          <Button size="sm" className="flex-1 bg-gray-900 text-white hover:bg-gray-800"
            onClick={handleSave}>
            <Check className="w-3.5 h-3.5 mr-1" />저장
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── 활동 편집 팝업 ──────────────────────────────────────────────────────────
function ActivityEditPopup({ activity, actIdx, onSave, onClose }: {
  activity: any; actIdx: number; onSave: (actIdx: number, name: string, s: string, e: string) => void; onClose: () => void;
}) {
  const [name, setName] = useState(activity.name || "");
  const [s, setS] = useState(activity.startDate || "");
  const [e, setE] = useState(activity.endDate || "");

  const handleSave = () => {
    onSave(actIdx, name, s, e);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-white/90 backdrop-blur-sm"
      onClick={onClose}>
      <div className="bg-white border border-gray-200 rounded-2xl p-6 w-72 shadow-xl"
        onClick={ev => ev.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-gray-900 text-sm font-semibold truncate">활동 편집</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 ml-2 shrink-0"><X className="w-4 h-4" /></button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-gray-500 block mb-1">활동명</label>
            <input type="text" value={name} onChange={v => setName(v.target.value)}
              placeholder="활동명"
              className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-gray-900 text-sm outline-none focus:border-gray-400" />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">시작일</label>
            <input type="date" value={s} onChange={v => setS(v.target.value)}
              className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-gray-900 text-sm outline-none focus:border-gray-400" />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">종료일</label>
            <input type="date" value={e} onChange={v => setE(v.target.value)}
              className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-gray-900 text-sm outline-none focus:border-gray-400" />
          </div>
        </div>
        <div className="flex gap-2 mt-4">
          <Button variant="ghost" size="sm" className="flex-1 text-gray-500 hover:bg-gray-50" onClick={onClose}>취소</Button>
          <Button size="sm" className="flex-1 bg-gray-900 text-white hover:bg-gray-800"
            onClick={handleSave}>
            <Check className="w-3.5 h-3.5 mr-1" />저장
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── 드래그 간트 바 ──────────────────────────────────────────────────────────
function GanttBar({ task, chartStartTs, totalDays, containerW, rowH, barColor, onSave, onClickEdit, onClear, onSaveLabel, isDraggingRef, readOnly }: {
  task: any; chartStartTs: number; totalDays: number; containerW: number;
  rowH: number; barColor: string;
  onSave: (id: string, s: string, e: string) => void;
  onClickEdit: (task: any) => void;
  onClear: (id: string) => void;
  onSaveLabel?: (id: string, label: string) => void;
  isDraggingRef?: React.MutableRefObject<boolean>;
  readOnly?: boolean;
}) {
  const pxDay = containerW / totalDays;
  const [ls, setLs] = useState(task.startDate);
  const [le, setLe] = useState(task.endDate);
  const lsRef = useRef(ls); const leRef = useRef(le);
  useEffect(() => { setLs(task.startDate); setLe(task.endDate); }, [task.startDate, task.endDate]);
  lsRef.current = ls; leRef.current = le;

  const leftPx  = Math.max(0, (toTs(ls) - chartStartTs) / MS_DAY * pxDay);
  const widthPx = Math.max(pxDay * 0.5, (toTs(le) - toTs(ls)) / MS_DAY * pxDay + pxDay);

  const drag = useCallback((e: React.MouseEvent, mode: "move"|"left"|"right") => {
    e.preventDefault(); e.stopPropagation();
    if (isDraggingRef) isDraggingRef.current = true;
    const ox = e.clientX, os = toTs(lsRef.current), oe = toTs(leRef.current);
    let moved = false;

    const mv = (ev: MouseEvent) => {
      const dd = Math.round((ev.clientX - ox) / pxDay);
      if (dd === 0) return;
      moved = true;
      if (mode === "move")  { setLs(toStr(os + dd * MS_DAY)); setLe(toStr(oe + dd * MS_DAY)); }
      if (mode === "left")  { setLs(toStr(Math.min(os + dd * MS_DAY, oe - MS_DAY))); }
      if (mode === "right") { setLe(toStr(Math.max(oe + dd * MS_DAY, os + MS_DAY))); }
    };
    const up = () => {
      if (moved) onSave(task._id, lsRef.current, leRef.current);
      else onClickEdit(task); // 드래그 없이 클릭 → 편집 모달 (resize 핸들 클릭 포함)
      if (isDraggingRef) {
        setTimeout(() => { isDraggingRef.current = false; }, 100);
      }
      window.removeEventListener("mousemove", mv);
      window.removeEventListener("mouseup", up);
    };
    window.addEventListener("mousemove", mv);
    window.addEventListener("mouseup", up);
  }, [pxDay, task, onSave, onClickEdit, isDraggingRef]);

  return (
    <div className={cn("absolute top-1/2 -translate-y-1/2 rounded-lg select-none group/b pointer-events-auto z-10 hover:z-[60]", readOnly ? "cursor-default" : "cursor-grab")}
      style={{ left: leftPx, width: widthPx, height: rowH - 10, backgroundColor: barColor }}
      onMouseDown={readOnly ? undefined : e => drag(e, "move")}
    >
      {/* 툴팁 */}
      <span className="absolute z-50 invisible opacity-0 group-hover/b:visible group-hover/b:opacity-100 bg-gray-900 text-white text-[10px] px-2 py-1 rounded shadow-md whitespace-nowrap transition-all pointer-events-none bottom-full mb-1 left-1/2 -translate-x-1/2">
        {task.barLabel ? `${task.barLabel} | ` : ""}{fmtMD(ls)}{ls !== le ? `~${fmtMD(le)}` : ""}
        <div className="absolute top-full left-1/2 -translate-x-1/2 border-[4px] border-transparent border-t-gray-900" />
      </span>

      {!readOnly && (
        <div className="absolute left-0 top-0 h-full w-2.5 cursor-ew-resize rounded-l-lg flex items-center justify-center opacity-0 group-hover/b:opacity-100 transition-opacity bg-white/90 z-20"
          onMouseDown={e => drag(e, "left")}><div className="w-0.5 h-4 bg-white/70 rounded-full" /></div>
      )}

      {/* 바 텍스트/날짜 */}
      <div className={cn("absolute inset-0 flex items-center justify-center px-2", !readOnly && "cursor-pointer")}
        onMouseDown={readOnly ? undefined : (e) => { e.stopPropagation(); e.preventDefault(); }}
        onClick={readOnly ? undefined : (e) => { e.stopPropagation(); onClickEdit(task); }}>
        {task.barLabel ? (
          <span className="text-xs text-gray-900 font-semibold truncate">{task.barLabel} | {fmtMD(ls)}{ls !== le ? `~${fmtMD(le)}` : ""}</span>
        ) : (
          <span className="text-[10px] text-gray-900/60 font-medium">{fmtMD(ls)}{ls !== le ? ` ~ ${fmtMD(le)}` : ""}</span>
        )}
      </div>

      {/* 진척도 바 */}
      {task.progress > 0 && (
        <div className="absolute left-0 top-0 h-full rounded-lg bg-white/90 pointer-events-none"
          style={{ width: `${task.progress}%` }} />
      )}
      {!readOnly && (
        <div className="absolute right-0 top-0 h-full w-2.5 cursor-ew-resize rounded-r-lg flex items-center justify-center opacity-0 group-hover/b:opacity-100 transition-opacity bg-white/90 z-20"
          onMouseDown={e => drag(e, "right")}><div className="w-0.5 h-4 bg-white/70 rounded-full" /></div>
      )}
      {/* X 삭제 버튼 - 막대 위에 호버 시 표시 */}
      {!readOnly && (
        <button
          onMouseDown={e => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); onClear(task._id); }}
          className="absolute -top-2 -right-2 z-30 opacity-0 group-hover/b:opacity-100 transition-opacity w-4 h-4 rounded-full bg-white/90 border border-white/20 flex items-center justify-center text-gray-900/60 hover:text-red-400 hover:border-red-400/60"
          title="날짜 초기화">
          <X className="w-2.5 h-2.5" />
        </button>
      )}
    </div>
  );
}

// ─── 인라인 편집 ─────────────────────────────────────────────────────────────
function InlineEdit({ value, onSave, onEnter, placeholder, className, style, readOnly }: {
  value: string; onSave: (v: string) => void; onEnter?: (v: string) => void;
  placeholder?: string; className?: string; style?: React.CSSProperties; readOnly?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const spanRef = useRef<HTMLSpanElement>(null);

  const commit = () => { onSave(draft); setEditing(false); };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") { commit(); onEnter?.(draft); }
    if (e.key === "Escape") setEditing(false);
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      commit();
      setTimeout(() => {
        const triggers = Array.from(document.querySelectorAll('.inline-edit-trigger')) as HTMLElement[];
        const myIdx = triggers.indexOf(spanRef.current!);
        if (myIdx !== -1) {
          const nextIdx = e.key === "ArrowDown" ? myIdx + 1 : myIdx - 1;
          if (triggers[nextIdx]) triggers[nextIdx].click();
        }
      }, 50);
    }
  };

  if (editing && !readOnly) return (
    <div className="w-full relative flex-1">
      <span ref={spanRef} className="inline-edit-trigger hidden" />
      <input autoFocus value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={handleKeyDown}
        className={cn("w-full bg-white/10 border border-white/25 rounded px-2 py-0.5 text-xs outline-none text-gray-900", className)}
      />
    </div>
  );
  return (
    <span ref={spanRef} onClick={readOnly ? undefined : () => { setDraft(value); setEditing(true); }}
      className={cn("inline-edit-trigger block flex-1 rounded px-2 py-0.5 text-xs truncate min-h-[22px]", !readOnly && "cursor-text hover:bg-white/10", !value && "text-gray-900/25 italic", className)}
      style={style}>
      {value || placeholder}
    </span>
  );
}

// ─── 붙여넣기 프리뷰 모달 ───────────────────────────────────────────────────
function PasteModal({ rows, onApply, onClose }: {
  rows: PastedRow[]; onApply: () => void; onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-white/90 backdrop-blur-sm"
      onClick={onClose}>
      <div className="bg-white border border-gray-200 rounded-2xl p-6 w-[520px] max-h-[70vh] flex flex-col shadow-xl"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-gray-900 font-semibold">{rows.length}개 항목 감지됨</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
        </div>
        <div className="overflow-y-auto flex-1 space-y-1 mb-4">
          {rows.map((r, i) => (
            <div key={i} className="flex gap-2 items-center bg-gray-50 rounded-lg px-3 py-2 text-xs">
              <span className="text-gray-400 w-20 shrink-0 truncate">{r.category}</span>
              <span className="text-gray-900 flex-1 truncate">{r.subTask}</span>
              <span className="text-gray-500 font-mono w-10 text-right">{r.progress}%</span>
              <span className="text-gray-400 font-mono whitespace-nowrap">
                {r.startDate ? fmtMD(r.startDate) : "—"} ~ {r.endDate ? fmtMD(r.endDate) : "—"}
              </span>
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" className="flex-1 text-gray-500" onClick={onClose}>취소</Button>
          <Button size="sm" className="flex-1 bg-gray-900 text-gray-900 hover:bg-gray-800" onClick={onApply}>
            <Check className="w-3.5 h-3.5 mr-1.5" />타임라인에 추가
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── KPI 달성률 패널 ─────────────────────────────────────────────────────────
function KpiAchievementPanel({ campaignId, campaign }: { campaignId: Id<"campaigns">; campaign: any }) {
  const digitalKpis        = useQuery(api.awareness.getDigitalKpis,     { campaignId }) ?? [];
  const viralContents      = useQuery(api.awareness.getViralContents,    { campaignId }) ?? [];
  const youtubeVideos      = useQuery(api.awareness.getYouTubeVideos,    { campaignId }) ?? [];
  const interestActivities = useQuery(api.interest.getInterestActivities,{ campaignId }) ?? [];
  const updateSettings     = useMutation(api.campaigns.updateCampaignSettings);
  const { isAdmin } = useAuth();
  const { refreshTrigger } = useRefresh();
  const [lastKpiRefresh, setLastKpiRefresh] = useState(0);

  // ── GA4 Property ID: Convex 우선 → localStorage fallback ─────────────────
  const resolvedGa4Id = useMemo(() => {
    if (campaign?.microGa4Id) return campaign.microGa4Id as string;
    try { return localStorage.getItem(`microGa4Id_${campaignId}`) ?? ""; } catch { return ""; }
  }, [campaign?.microGa4Id, campaignId]);

  // ── 마이크로사이트 KPI: 캠페인 전체 기간 세션 수 직접 GA4 호출 ──────────────
  // 날짜 필터와 완전 독립 — campaignStartDate ~ 오늘 고정
  const [micrositeKpiSessions, setMicrositeKpiSessions] = useState<number | null>(null);
  const [kpiSyncing, setKpiSyncing] = useState(false);
  // useRef로 syncing 여부 추적 → useCallback 클로저 stale 문제 방지
  const kpiSyncingRef = useRef(false);

  const fetchMicrositeKpi = useCallback(async () => {
    if (!resolvedGa4Id || !campaign?.startDate || kpiSyncingRef.current) return;
    kpiSyncingRef.current = true;
    setKpiSyncing(true);
    try {
      const today   = new Date().toISOString().split("T")[0];
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
        setMicrositeKpiSessions(Math.round(total));
      } else if (res.ok) {
        setMicrositeKpiSessions(0);
      }
    } catch (e) { console.error("[KPI GA4] fetch 실패:", e); }
    finally { kpiSyncingRef.current = false; setKpiSyncing(false); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolvedGa4Id, campaign?.startDate, campaign?.endDate]);

  // 페이지 최초 진입 시 자동 fetch (GA4 ID 또는 캠페인 시작일이 준비되면)
  useEffect(() => {
    fetchMicrositeKpi();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolvedGa4Id, campaign?.startDate]);

  // "모든 데이터 업데이트" 버튼 클릭 시 KPI GA4 재호출
  useEffect(() => {
    if (refreshTrigger !== lastKpiRefresh) {
      setLastKpiRefresh(refreshTrigger);
      fetchMicrositeKpi();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshTrigger, lastKpiRefresh]);

  const [editingKpi, setEditingKpi] = useState(false);
  const [kpiDraft, setKpiDraft] = useState<any[]>([]);

  // ── Exposure KPI 항목 설정 ─────────────────────────────────────
  const EXPOSURE_LS_KEY = "dashboard_kpi_exposure_items";
  const DEFAULT_EXPOSURE_ITEMS = { media: true, viral: true, youtube: true };
  const [exposureItems, setExposureItems] = useState(DEFAULT_EXPOSURE_ITEMS);
  const [showExposureEdit, setShowExposureEdit] = useState(false);
  const [exposureDraft, setExposureDraft] = useState(DEFAULT_EXPOSURE_ITEMS);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(EXPOSURE_LS_KEY);
      if (saved) {
        const p = JSON.parse(saved);
        setExposureItems({
          media:   p.media   ?? true,
          viral:   p.viral   ?? true,
          youtube: p.youtube ?? true,
        });
      }
    } catch {}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const kpiTargets = campaign?.kpiTargets ?? [];

  // 자동 합산 계산 — 4개 KPI
  const autoValues: Record<string, number> = {
    // 1) 캠페인 노출: 선택된 항목만 합산 (매체 노출수 / 바이럴 조회수 / YouTube 조회수)
    exposure: (() => {
      const mediaVal = exposureItems.media
        ? digitalKpis.reduce((s: number, r: any) => s + (r.impressions || 0), 0) : 0;
      const viralVal = exposureItems.viral
        ? viralContents.reduce((s: number, r: any) => s + (r.views || 0), 0) : 0;
      const ytVal = exposureItems.youtube
        ? youtubeVideos.reduce((s: number, r: any) => s + (r.views || 0), 0) : 0;
      return mediaVal + viralVal + ytVal;
    })(),
    // 2) 이벤트 신청: 흥미 상세 중 팝업이 아닌 활동의 participants 합산
    event: interestActivities
      .filter((r: any) => r.activityType !== "팝업")
      .reduce((s: number, r: any) => s + (r.participants || 0), 0),
    // 3) 팝업스토어 집객: 흥미 상세 중 팝업 활동의 participants 합산
    popup: interestActivities
      .filter((r: any) => r.activityType === "팝업")
      .reduce((s: number, r: any) => s + (r.participants || 0), 0),
    // 4) 마이크로사이트 유입: 캠페인 전체 기간 GA4 세션 수 (직접 fetch, 날짜 필터와 독립)
    microsite: micrositeKpiSessions ?? 0,
  };

  const getKpiCurrent = (kpi: any) => {
    const auto = autoValues[kpi.category] || 0;
    return auto + (kpi.current || 0);
  };

  // 기본 KPI 초기화 — 4개 항목
  const initDefaultKpis = async () => {
    const defaults = [
      { label: "캠페인 노출", target: 42000000, current: 0, category: "exposure", description: "매체 노출수 + 바이럴 조회수 + YouTube 조회수" },
      { label: "이벤트 신청", target: 3000, current: 0, category: "event", description: "팝업 외 활동 참여자 수 합산" },
      { label: "팝업스토어 집객", target: 6000, current: 0, category: "popup", description: "팝업 활동 참여자 수 합산" },
      { label: "마이크로사이트 유입", target: 100000, current: 0, category: "microsite", description: "캠페인 기간 누적 세션 수 (GA4 직접 연동)" },
    ];
    await updateSettings({ id: campaign._id, kpiTargets: defaults });
  };

  const startEdit = () => {
    setKpiDraft(kpiTargets.map((k: any) => ({ ...k })));
    setEditingKpi(true);
  };

  const saveEdit = async () => {
    await updateSettings({ id: campaign._id, kpiTargets: kpiDraft });
    setEditingKpi(false);
  };

  const formatNum = (n: number) => {
    if (n >= 1e8) return `${(n / 1e8).toFixed(1)}억`;
    if (n >= 1e4) return `${(n / 1e4).toFixed(0)}만`;
    return n.toLocaleString();
  };

  if (kpiTargets.length === 0) {
    return (
      <GlassCard className="p-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Target className="w-5 h-5 text-gray-400" />
          <div>
            <p className="text-sm font-semibold text-gray-900">KPI 목표 설정</p>
            <p className="text-xs text-gray-400 mt-0.5">캠페인 KPI 목표를 설정하고 달성률을 실시간으로 추적하세요.</p>
          </div>
        </div>
        <Button onClick={initDefaultKpis} size="sm" className="bg-gray-900 text-gray-900 hover:bg-gray-800 gap-2">
          <Plus className="w-4 h-4" /> 기본 KPI 설정
        </Button>
      </GlassCard>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Target className="w-4 h-4 text-indigo-500" />
          <h2 className="text-lg font-bold text-gray-900">KPI 달성률</h2>
        </div>
        {isAdmin && (
          <Button onClick={startEdit} variant="ghost" size="sm" className="text-gray-400 hover:text-gray-700 gap-1.5 text-xs">
            <Pencil className="w-3 h-3" /> 목표 수정
          </Button>
        )}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {kpiTargets.slice(0, 4).map((kpi: any, idx: number) => {
          const current = getKpiCurrent(kpi);
          const pct = kpi.target > 0 ? Math.min(100, (current / kpi.target) * 100) : 0;
          const colorClass = pct >= 100 ? "text-green-500" : pct >= 60 ? "text-indigo-500" : pct >= 30 ? "text-amber-500" : "text-gray-400";
          const barColor = pct >= 100 ? "bg-green-500" : pct >= 60 ? "bg-indigo-500" : pct >= 30 ? "bg-amber-500" : "bg-gray-300";
          const isMicrosite = kpi.category === "microsite";
          const isExposure  = kpi.category === "exposure";
          return (
            <GlassCard key={idx} className="p-5 relative overflow-hidden">
              <div className="flex items-start justify-between mb-2">
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">{kpi.label}</p>
                <div className="flex items-center gap-1.5">
                  {/* 마이크로사이트 카드 전용: GA4 새로고침 버튼 */}
                  {isMicrosite && resolvedGa4Id && (
                    <button
                      onClick={fetchMicrositeKpi}
                      disabled={kpiSyncing}
                      title="GA4 데이터 새로고침 (캠페인 전체 기간)"
                      className="p-1 rounded text-gray-300 hover:text-indigo-400 disabled:cursor-not-allowed transition-colors"
                    >
                      <Loader2 className={`w-3 h-3 ${kpiSyncing ? "animate-spin text-indigo-400" : ""}`} />
                    </button>
                  )}
                  {/* exposure 카드 전용: 항목 편집 버튼 (관리자 전용) */}
                  {isAdmin && isExposure && (
                    <button
                      onClick={() => { setExposureDraft({ ...exposureItems }); setShowExposureEdit(true); }}
                      title="노출 KPI 항목 설정"
                      className="p-1 rounded text-gray-300 hover:text-indigo-400 transition-colors"
                    >
                      <Pencil className="w-3 h-3" />
                    </button>
                  )}
                  <span className={`text-xl font-bold font-mono ${colorClass}`}>{pct.toFixed(1)}%</span>
                </div>
              </div>
              <div className="flex items-baseline gap-2 mb-1">
                <span className="text-2xl font-bold font-mono text-gray-900">{formatNum(current)}</span>
                <span className="text-sm text-gray-400">/ {formatNum(kpi.target)}</span>
              </div>
              {kpi.description && <p className="text-[10px] text-gray-400 mb-3">{kpi.description}</p>}
              <div className="w-full h-2 rounded-full bg-gray-100 overflow-hidden">
                <div className={`h-full rounded-full transition-all duration-700 ${barColor}`} style={{ width: `${pct}%` }} />
              </div>
            </GlassCard>
          );
        })}
      </div>

      {/* ── Exposure 항목 편집 모달 ── */}
      {isAdmin && showExposureEdit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
          <div className="bg-white rounded-2xl p-6 w-[380px] shadow-2xl border border-gray-100">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-gray-900 text-sm flex items-center gap-2">
                <Target className="w-4 h-4 text-indigo-500" /> 노출 KPI 항목 설정
              </h3>
              <button onClick={() => setShowExposureEdit(false)}><X className="w-4 h-4 text-gray-400 hover:text-gray-700" /></button>
            </div>
            <p className="text-xs text-gray-400 mb-4">합산에 포함할 항목을 선택하세요 (1개 이상 필수)</p>
            <div className="flex flex-col gap-2.5 mb-5">
              {([
                { key: "media"   as const, label: "매체 노출수",          desc: "매체 퍼포먼스 데이터의 총 노출 수 (impressions)" },
                { key: "viral"   as const, label: "바이럴 컨텐츠 조회수",  desc: "바이럴 컨텐츠 누적 조회 수" },
                { key: "youtube" as const, label: "YouTube 조회수",       desc: "YouTube 영상 누적 조회 수" },
              ]).map(item => (
                <label key={item.key} className="flex items-start gap-3 cursor-pointer bg-gray-50 rounded-xl p-3 hover:bg-gray-100 border border-gray-100 transition-colors">
                  <input
                    type="checkbox"
                    checked={!!exposureDraft[item.key]}
                    onChange={e => setExposureDraft(prev => ({ ...prev, [item.key]: e.target.checked }))}
                    className="accent-indigo-500 w-4 h-4 mt-0.5 flex-shrink-0"
                  />
                  <div>
                    <p className="text-sm font-medium text-gray-800">{item.label}</p>
                    <p className="text-xs text-gray-400">{item.desc}</p>
                  </div>
                </label>
              ))}
            </div>
            <div className="flex justify-end gap-2 pt-3 border-t border-gray-100">
              <Button variant="ghost" size="sm" onClick={() => setShowExposureEdit(false)}>취소</Button>
              <Button
                size="sm"
                disabled={!Object.values(exposureDraft).some(Boolean)}
                onClick={() => {
                  try { localStorage.setItem(EXPOSURE_LS_KEY, JSON.stringify(exposureDraft)); } catch {}
                  setExposureItems({ ...exposureDraft });
                  setShowExposureEdit(false);
                }}
                className="bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Check className="w-3.5 h-3.5 mr-1.5" /> 저장
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* KPI 수정 모달 */}
      {isAdmin && editingKpi && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-white/90 backdrop-blur-sm">
          <div className="bg-white border border-gray-200 rounded-2xl p-6 w-[520px] max-h-[80vh] overflow-y-auto shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-gray-900 font-bold">KPI 목표 수정</h3>
              <button onClick={() => setEditingKpi(false)} className="text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
            </div>
            <div className="space-y-4">
              {kpiDraft.map((kpi: any, i: number) => (
                <div key={i} className="bg-gray-50 rounded-xl p-4 space-y-2">
                  <input value={kpi.label} onChange={e => { const d = [...kpiDraft]; d[i].label = e.target.value; setKpiDraft(d); }}
                    className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 outline-none" placeholder="KPI 라벨" />
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] text-gray-400">목표값</label>
                      <input type="number" value={kpi.target} onChange={e => { const d = [...kpiDraft]; d[i].target = Number(e.target.value); setKpiDraft(d); }}
                        className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 outline-none" />
                    </div>
                    <div>
                      <label className="text-[10px] text-gray-400">수동 보정값</label>
                      <input type="number" value={kpi.current} onChange={e => { const d = [...kpiDraft]; d[i].current = Number(e.target.value); setKpiDraft(d); }}
                        className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 outline-none" />
                    </div>
                  </div>
                  {/* 자동 집계 카테고리 — GA4·매체 데이터와 연결 */}
                  <div>
                    <label className="text-[10px] text-gray-400 block mb-1">자동 집계 연결 <span className="text-indigo-400">(마이크로사이트 유입은 반드시 microsite 선택)</span></label>
                    <select
                      value={kpi.category || ""}
                      onChange={e => { const d = [...kpiDraft]; d[i].category = e.target.value; setKpiDraft(d); }}
                      className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 outline-none"
                    >
                      <option value="exposure">exposure — 캠페인 노출 (매체+바이럴+YouTube 조회수)</option>
                      <option value="event">event — 이벤트 신청 (팝업 외 활동 참여자)</option>
                      <option value="popup">popup — 팝업스토어 집객 (팝업 활동 참여자)</option>
                      <option value="microsite">microsite — 마이크로사이트 유입 (GA4 세션)</option>
                      <option value="awareness">awareness — 수동 입력만 사용</option>
                      <option value="">기타 (수동 입력만 사용)</option>
                    </select>
                  </div>
                  <input value={kpi.description || ""} onChange={e => { const d = [...kpiDraft]; d[i].description = e.target.value; setKpiDraft(d); }}
                    className="w-full bg-white border border-gray-200 rounded-lg px-3 py-1.5 text-xs text-gray-700 outline-none" placeholder="설명 (선택)" />
                </div>
              ))}
            </div>
            <div className="flex gap-2 justify-end mt-4">
              <Button variant="ghost" className="text-gray-500" onClick={() => setEditingKpi(false)}>취소</Button>
              <Button className="bg-gray-900 text-gray-900 hover:bg-gray-800" onClick={saveEdit}>
                <Check className="w-4 h-4 mr-2" />저장
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── 메인 ────────────────────────────────────────────────────────────────────
const ROW_H   = 40;
const CAT_H   = 32;
const LABEL_W = 220;

// ─── 그래프 관리 모달 ──────────────────────────────────────────────────────────
function GraphManagerModal({
  taskId,
  task,
  onClose,
  onAddGraph
}: {
  taskId: string;
  task: any;
  onClose: () => void;
  onAddGraph: (title: string, type: string, description: string) => void;
}) {
  const [title, setTitle] = useState("");
  const [type, setType] = useState<"line" | "bar" | "area" | "pie">("line");
  const [description, setDescription] = useState("");

  const handleAdd = async () => {
    if (!title.trim()) return;
    await onAddGraph(title, type, description);
    setTitle("");
    setType("line");
    setDescription("");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-white/90 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white border border-gray-200 rounded-2xl p-6 w-[420px] max-h-[70vh] overflow-y-auto shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-gray-900 font-bold">그래프 추가</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
        </div>

        <div className="space-y-4 mb-4">
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1.5">그래프 제목</label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="예: 월간 트래픽"
              className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-gray-400"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1.5">차트 유형</label>
            <select
              value={type}
              onChange={e => setType(e.target.value as any)}
              className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-gray-400"
            >
              <option value="line">라인 차트</option>
              <option value="bar">바 차트</option>
              <option value="area">에어리어 차트</option>
              <option value="pie">파이 차트</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1.5">설명 (선택)</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="그래프에 대한 설명..."
              className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-gray-400 h-20 resize-none"
            />
          </div>
        </div>

        {task?.graphs && task.graphs.length > 0 && (
          <div className="border-t border-gray-100 pt-4 mb-4">
            <p className="text-xs font-semibold text-gray-700 mb-3">현재 그래프 ({task.graphs.length})</p>
            <div className="space-y-2">
              {task.graphs.map((graph: any) => (
                <div key={graph.id} className="flex items-start justify-between gap-2 bg-gray-50 p-3 rounded">
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-900">{graph.title}</p>
                    <p className="text-xs text-gray-500">{graph.type}</p>
                    {graph.description && <p className="text-xs text-gray-400 mt-1">{graph.description}</p>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex gap-2">
          <Button variant="ghost" size="sm" className="flex-1 text-gray-500" onClick={onClose}>취소</Button>
          <Button
            size="sm"
            className="flex-1 bg-gray-900 text-gray-900 hover:bg-gray-800"
            onClick={handleAdd}
            disabled={!title.trim()}
          >
            <Plus className="w-3.5 h-3.5 mr-1" />추가
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── 월간 캘린더 뷰 컴포넌트 ─────────────────────────────────────────────────
function CalendarView({ tasks, chartStart, chartEnd }: {
  tasks: any[]; chartStart: string; chartEnd: string;
}) {
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(new Set());

  // 오늘 날짜를 기준으로 초기 월 설정
  const today = new Date();
  const [displayYear, setDisplayYear] = useState(today.getFullYear());
  const [displayMonth, setDisplayMonth] = useState(today.getMonth());

  const allCategories = Array.from(new Set(tasks.map(t => t.category || "미분류")));
  const categoryColors = useMemo(() => {
    const map = new Map<string, string>();
    allCategories.forEach((cat, idx) => {
      map.set(cat, CHIP_PALETTE[idx % CHIP_PALETTE.length]);
    });
    return map;
  }, [allCategories]);
  const filteredTasks = selectedCategories.size === 0
    ? tasks
    : tasks.filter(t => selectedCategories.has(t.category));

  // 현재 표시할 월의 달력 생성
  const year = displayYear;
  const month = displayMonth;
  const monthStr = new Date(year, month).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long' });
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startDayOfWeek = firstDay.getDay();

  const weeks: { date: string; tasks: any[] }[][] = [];
  let currentWeek: { date: string; tasks: any[] }[] = [];

  for (let i = 0; i < startDayOfWeek; i++) {
    currentWeek.push({ date: '', tasks: [] });
  }

  for (let day = 1; day <= lastDay.getDate(); day++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const dayTasks = filteredTasks.filter(t => {
      if (!t.startDate || !t.endDate) return false;
      const tStart = new Date(t.startDate).getTime();
      const tEnd = new Date(t.endDate).getTime();
      const dTs = new Date(dateStr).getTime();
      return tStart <= dTs && dTs <= tEnd;
    });

    // 활동(activities)도 함께 표시
    const allItemsForDay = dayTasks.map(t => ({ ...t, isActivity: false }));
    for (const task of filteredTasks) {
      if (task.activities) {
        for (let actIdx = 0; actIdx < task.activities.length; actIdx++) {
          const activity = task.activities[actIdx];
          if (!activity.startDate || !activity.endDate) continue;
          const actStart = new Date(activity.startDate).getTime();
          const actEnd = new Date(activity.endDate).getTime();
          const dTs = new Date(dateStr).getTime();
          if (actStart <= dTs && dTs <= actEnd) {
            console.log("[CAL] day:", dateStr, "task:", task.subTask, "activity name:", activity.name, "actIdx:", actIdx);
            allItemsForDay.push({
              ...activity,
              parentTask: task,
              isActivity: true,
              __calendarKey: `${task._id}-act-${actIdx}`,
            });
          }
        }
      }
    }

    currentWeek.push({ date: dateStr, tasks: allItemsForDay });

    if (currentWeek.length === 7) {
      weeks.push(currentWeek);
      currentWeek = [];
    }
  }

  if (currentWeek.length > 0) {
    while (currentWeek.length < 7) {
      currentWeek.push({ date: '', tasks: [] });
    }
    weeks.push(currentWeek);
  }

  const goToPreviousMonth = () => {
    if (displayMonth === 0) {
      setDisplayYear(displayYear - 1);
      setDisplayMonth(11);
    } else {
      setDisplayMonth(displayMonth - 1);
    }
  };

  const goToNextMonth = () => {
    if (displayMonth === 11) {
      setDisplayYear(displayYear + 1);
      setDisplayMonth(0);
    } else {
      setDisplayMonth(displayMonth + 1);
    }
  };

  return (
    <GlassCard className="p-6">
      {/* 대분류 필터 */}
      <div className="mb-6 pb-4 border-b border-gray-100">
        <p className="text-xs font-semibold text-gray-600 mb-3">대분류 필터</p>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setSelectedCategories(new Set())}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-all text-white ${
              selectedCategories.size === 0
                ? 'opacity-100 bg-gray-600'
                : 'opacity-40 bg-gray-400'
            }`}
          >
            전체
          </button>
          {allCategories.map(cat => (
            <button
              key={cat}
              onClick={() => {
                const newSet = new Set(selectedCategories);
                if (newSet.has(cat)) {
                  newSet.delete(cat);
                } else {
                  newSet.add(cat);
                }
                setSelectedCategories(newSet);
              }}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-all text-white ${
                selectedCategories.size === 0 || selectedCategories.has(cat)
                  ? 'opacity-100'
                  : 'opacity-40'
              }`}
              style={{
                backgroundColor: CHIP_PALETTE[allCategories.indexOf(cat) % CHIP_PALETTE.length],
              }}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* 월 이동 */}
      <div className="border border-gray-100 rounded-lg p-6 bg-white">
        <div className="flex items-center justify-center gap-3 mb-4">
          <button
            onClick={goToPreviousMonth}
            className="p-1.5 rounded hover:bg-gray-100 transition-colors"
            title="이전 달"
          >
            <ArrowRight className="w-4 h-4 rotate-180" />
          </button>
          <h3 className="text-lg font-bold text-gray-900">{monthStr}</h3>
          <button
            onClick={goToNextMonth}
            className="p-1.5 rounded hover:bg-gray-100 transition-colors"
            title="다음 달"
          >
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>

        {/* 요일 헤더 */}
        <div className="grid grid-cols-7 gap-2 mb-3">
          {['일', '월', '화', '수', '목', '금', '토'].map(d => (
            <div key={d} className="text-xs font-semibold text-gray-500 text-center py-2">
              {d}
            </div>
          ))}
        </div>

        {/* 날짜 그리드 - 주(week) 단위로 렌더링 */}
        <div className="border border-gray-100 rounded-lg overflow-hidden">
          {weeks.map((week, wIdx) => {
            // 이 주(week)에 걸치는 태스크 바 계산
            const monthStartStr = `${year}-${String(month + 1).padStart(2, '0')}-01`;
            const lastDayOfMonth = new Date(year, month + 1, 0).getDate();
            const monthEndStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(lastDayOfMonth).padStart(2, '0')}`;

            const weekBars: { task: any; startCol: number; endCol: number }[] = [];

            // 주의 모든 tasks (main + activities 포함)에서 weekBars 생성
            const allTasksInWeek = new Map<string, any>();
            for (const day of week) {
              for (const task of day.tasks) {
                if (!task.startDate || !task.endDate) continue;
                const uniqueId = task.__calendarKey || task._id || task.id || `temp_${Math.random()}`;
                const key = `${uniqueId}-${task.isActivity ? 'activity' : 'task'}`;
                if (!allTasksInWeek.has(key)) {
                  allTasksInWeek.set(key, { ...task, _id: uniqueId, __key: key });
                }
              }
            }

            // 이 주의 첫 번째 유효 날짜 (empty 셀 제외)
            const weekFirstDate = week.find(d => d.date)?.date ?? "";

            for (const task of Array.from(allTasksInWeek.values())) {
              const visStart = task.startDate < monthStartStr ? monthStartStr : task.startDate;
              const visEnd = task.endDate > monthEndStr ? monthEndStr : task.endDate;
              if (visStart > visEnd) continue;

              let startCol = -1, endCol = -1;
              for (let i = 0; i < 7; i++) {
                const d = week[i].date;
                if (!d) continue;
                if (d >= visStart && startCol === -1) startCol = i;
                if (d <= visEnd) endCol = i;
              }

              // 이전 주(또는 이전 달)에서 이어지는 항목은 이 주의 첫 번째 유효 칸부터 시작
              if (endCol !== -1 && (startCol === -1 || visStart < weekFirstDate)) {
                for (let i = 0; i < 7; i++) {
                  if (week[i].date) { startCol = i; break; }
                }
              }

              if (startCol !== -1 && endCol !== -1 && startCol <= endCol) {
                weekBars.push({ task, startCol, endCol });
              }
            }

            const todayStr = new Date().toISOString().split('T')[0];

            return (
              <div key={wIdx} className={wIdx > 0 ? 'border-t border-gray-100' : ''}>
                {/* 날짜 숫자 행 */}
                <div className="grid grid-cols-7">
                  {week.map((day, dIdx) => {
                    const isToday = day.date === todayStr;
                    const isWeekend = dIdx === 0 || dIdx === 6;
                    return (
                      <div
                        key={dIdx}
                        className={`p-2 min-h-[36px] ${dIdx > 0 ? 'border-l border-gray-100' : ''} ${!day.date ? 'bg-gray-50' : ''}`}
                      >
                        {day.date && (
                          <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium ${
                            isToday
                              ? 'bg-blue-500 text-white'
                              : isWeekend
                                ? 'text-gray-400'
                                : 'text-gray-700'
                          }`}>
                            {new Date(day.date + 'T00:00:00').getDate()}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* 이 주의 태스크 바들 */}
                {weekBars.length > 0 && (
                  <div className="relative" style={{ height: weekBars.length * 24 + 4 }}>
                    {weekBars.map((bar, barIdx) => {
                      const colW = 100 / 7;
                      const isActivity = bar.task.isActivity;
                      const displayText = isActivity
                        ? (bar.task.name ? `${bar.task.parentTask?.subTask || ''} | ${bar.task.name}` : `${bar.task.parentTask?.subTask || ''}`)
                        : (bar.task.barLabel ? `${bar.task.subTask} | ${bar.task.barLabel}` : bar.task.subTask);
                      const tooltipText = isActivity
                        ? (bar.task.name 
                            ? `${bar.task.parentTask?.subTask || ''} | ${bar.task.name} (${bar.task.startDate} ~ ${bar.task.endDate})`
                            : `${bar.task.parentTask?.subTask || ''} (${bar.task.startDate} ~ ${bar.task.endDate})`)
                        : `${bar.task.barLabel || bar.task.subTask} (${bar.task.startDate} ~ ${bar.task.endDate})`;
                      return (
                        <div
                          key={`${bar.task.__key}-${barIdx}`}
                          className="absolute rounded px-2 flex items-center text-[10px] text-white font-medium group z-10 hover:z-[60]"
                          style={{
                            top: barIdx * 24 + 2,
                            left: `calc(${bar.startCol * colW}% + 2px)`,
                            width: `calc(${(bar.endCol - bar.startCol + 1) * colW}% - 4px)`,
                            height: 20,
                            backgroundColor: isActivity
                              ? (categoryColors.get(bar.task.parentTask?.category || '미분류') || pickColor(bar.task.parentTask?.category || ''))
                              : (categoryColors.get(bar.task.category || '미분류') || pickColor(bar.task.category || '')),
                          }}
                        >
                          <span className="truncate block w-full">{displayText}</span>
                          <span className="absolute z-[99] invisible opacity-0 group-hover:visible group-hover:opacity-100 bg-gray-900 text-white text-xs px-2 py-1 rounded shadow-md whitespace-nowrap transition-all pointer-events-none bottom-full mb-1 left-1/2 -translate-x-1/2">
                            {tooltipText}
                            <div className="absolute top-full left-1/2 -translate-x-1/2 border-[4px] border-transparent border-t-gray-900" />
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </GlassCard>
  );
}

export default function TimelinePage() {
  const params = useParams();
  const id = params.id as string;
  const campaignId = id as Id<"campaigns">;

  const { isAdmin, isViewer } = useAuth();
  const { refreshTrigger } = useRefresh();
  const [lastRefresh, setLastRefresh] = useState(0);

  const campaign   = useQuery(api.campaigns.getCampaignById, { id: campaignId });
  const ganttTasks = useQuery(api.gantt.getGanttTasks, { campaignId });
  const syncGantt  = useMutation(api.gantt.syncGanttFromSheet);
  const updateCampaignDates = useMutation(api.campaigns.updateCampaignDates);
  const updateTask = useMutation(api.gantt.updateGanttTask);
  const insertTask = useMutation(api.gantt.insertGanttTask);
  const deleteCategoryMutation = useMutation(api.gantt.deleteGanttCategory);
  const addGraph   = useMutation(api.gantt.addGraphToTask);
  const removeGraph = useMutation(api.gantt.removeGraphFromTask);

  const chartRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);
  const [chartW, setChartW] = useState(1200);
  const [editBar, setEditBar] = useState<any | null>(null);
  const [editActivity, setEditActivity] = useState<any | null>(null);
  const [editActivityIdx, setEditActivityIdx] = useState<number>(0);
  const [pasteRows, setPasteRows] = useState<PastedRow[] | null>(null);

  // 구글 시트 연동 상태
  const [showSheetInput, setShowSheetInput] = useState(false);
  const [sheetUrl, setSheetUrl] = useState("");
  const [isSyncingSheet, setIsSyncingSheet] = useState(false);

  // 월 연장 상태 - localStorage에 저장하여 탭 이동 후에도 유지
  const [extraStartMonths, setExtraStartMonthsRaw] = useState(0);
  const [extraEndMonths, setExtraEndMonthsRaw] = useState(0);

  const lsKey = `timeline-months-${id}`;
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(lsKey) || "{}");
      if (saved.s != null) setExtraStartMonthsRaw(saved.s);
      if (saved.e != null) setExtraEndMonthsRaw(saved.e);
    } catch {}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // 새로고침 컨텍스트 리스너
  useEffect(() => {
    if (refreshTrigger !== lastRefresh) {
      setLastRefresh(refreshTrigger);
      // Show a brief notification or update status
    }
  }, [refreshTrigger, lastRefresh]);

  const setExtraStartMonths = (updater: number | ((prev: number) => number)) => {
    setExtraStartMonthsRaw(prev => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      try { const saved = JSON.parse(localStorage.getItem(lsKey) || "{}"); localStorage.setItem(lsKey, JSON.stringify({ ...saved, s: next })); } catch {}
      return next;
    });
  };
  const setExtraEndMonths = (updater: number | ((prev: number) => number)) => {
    setExtraEndMonthsRaw(prev => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      try { const saved = JSON.parse(localStorage.getItem(lsKey) || "{}"); localStorage.setItem(lsKey, JSON.stringify({ ...saved, e: next })); } catch {}
      return next;
    });
  };

  const [dragItem, setDragItem] = useState<{type: "category"|"task", id: string}|null>(null);
  const [dragOverItem, setDragOverItem] = useState<{type: "category"|"task", id: string}|null>(null);

  // 채널별 업무 타임라인 뷰 모드 — 뷰어는 Calendar 우선
  const [timelineViewMode, setTimelineViewMode] = useState<"gantt" | "calendar">(isViewer ? "calendar" : "gantt");

  // 그래프 관리 모달 상태
  const [graphModalTaskId, setGraphModalTaskId] = useState<string | null>(null);
  const [newGraphTitle, setNewGraphTitle] = useState("");
  const [newGraphType, setNewGraphType] = useState<"line" | "bar" | "area" | "pie">("line");
  const [newGraphDescription, setNewGraphDescription] = useState("");

  // 캠페인 단계 (Phases)
  const phases = useQuery(api.phases.getPhases, { campaignId });
  const upsertPhase = useMutation(api.phases.upsertPhase);
  const deletePhase = useMutation(api.phases.deletePhase);

  const [showDateEditor, setShowDateEditor] = useState(false);
  const [dateDraftStart, setDateDraftStart] = useState("");
  const [dateDraftEnd, setDateDraftEnd] = useState("");

  const openDateEditor = () => {
    setDateDraftStart(campaign?.startDate || "");
    setDateDraftEnd(campaign?.endDate || "");
    setShowDateEditor(true);
  };

  const handleSaveDates = async () => {
    if (!campaign || !dateDraftStart || !dateDraftEnd) return;
    await updateCampaignDates({ id: campaign._id, startDate: dateDraftStart, endDate: dateDraftEnd });
    setShowDateEditor(false);
  };

  const [isExtracting, setIsExtracting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleExtractPhases = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsExtracting(true);
    try {
      const reader = new FileReader();
      reader.onload = async () => {
        const base64Image = reader.result as string;
        try {
          const res = await fetch("/api/extract-phases", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ base64Image }),
          });
          if (!res.ok) {
            const errData = await res.json();
            throw new Error(errData.error || "Failed to extract");
          }
          const data = await res.json();
          
          if (phases) {
            for (const p of phases) {
              await deletePhase({ id: p._id as any });
            }
          }
          
          if (data.phases && Array.isArray(data.phases)) {
            for (let i = 0; i < data.phases.length; i++) {
              const ph = data.phases[i];
              await upsertPhase({
                campaignId,
                title: ph.title || `Phase ${i+1}`,
                subtitle: ph.subtitle || "",
                sortOrder: i,
                color: ["#3b82f6","#8b5cf6","#f59e0b","#10b981","#ec4899","#f97316"][i % 6],
                items: ph.items || []
              });
            }
          }
        } catch (innerErr: any) {
          alert(innerErr.message);
        } finally {
          setIsExtracting(false);
          if (fileInputRef.current) fileInputRef.current.value = "";
        }
      };
      reader.readAsDataURL(file);
    } catch (err: any) {
      alert("Error reading file");
      setIsExtracting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const year       = campaign?.startDate?.substring(0, 4) || String(new Date().getFullYear());
  const baseChartStart = campaign?.startDate || toStr(Date.now());
  const baseChartEnd   = campaign?.endDate   || toStr(Date.now() + 60 * MS_DAY);
  
  const chartStart = toStr(toTs(baseChartStart) - extraStartMonths * 30 * MS_DAY);
  const chartEnd = toStr(toTs(baseChartEnd) + extraEndMonths * 30 * MS_DAY);

  const totalDays  = Math.max(30, diffDays(chartStart, chartEnd) + 1);
  const dynamicChartMin = Math.max(700, totalDays * 8); // 일당 8px — 3개월(~90일) 기준 약 720px, 한 화면에 전체 일정이 보이도록 축소

  // 차트 너비 측정
  useEffect(() => {
    const ob = new ResizeObserver(([e]) => setChartW(Math.max(dynamicChartMin, e.contentRect.width)));
    if (chartRef.current) ob.observe(chartRef.current);
    return () => ob.disconnect();
  }, [dynamicChartMin]);

  const todayStr   = toStr(Date.now());
  const todayPct   = Math.min(100, Math.max(0, (diffDays(chartStart, todayStr) / totalDays) * 100));

  // 월 눈금
  const monthTicks: { label: string; pct: number }[] = [];
  const mc = new Date(chartStart); mc.setDate(1);
  while (toStr(mc.getTime()) <= chartEnd) {
    const p = (diffDays(chartStart, toStr(mc.getTime())) / totalDays) * 100;
    if (p >= -5 && p <= 105) monthTicks.push({ label: `${mc.getMonth() + 1}월`, pct: Math.max(0, p) });
    mc.setMonth(mc.getMonth() + 1);
  }

  // 全体 작업 목록을 순서대로 유지
  const allTasks = ganttTasks ?? [];
  const totalTasks  = allTasks.length;
  const hasTaskProgress = allTasks.some(t => t.progress > 0);
  const taskAvgProgress = totalTasks ? Math.round(allTasks.reduce((s, t) => s + t.progress, 0) / totalTasks) : 0;
  // 작업 진행률이 모두 0이면 캠페인 날짜 기반 진행률 사용
  const dateProgress = (() => {
    if (!campaign?.startDate) return 0;
    const start = new Date(campaign.startDate).getTime();
    const end   = campaign.endDate ? new Date(campaign.endDate).getTime() : start + 90 * 24 * 60 * 60 * 1000;
    if (end <= start) return 0;
    return Math.max(0, Math.min(100, Math.round((Date.now() - start) / (end - start) * 100)));
  })();
  const avgProgress = hasTaskProgress ? taskAvgProgress : dateProgress;

  // 카테고리별 그룹핑 + 순서 보존
  const grouped: { category: string; color: string; tasks: typeof allTasks }[] = [];
  const seen = new Map<string, typeof allTasks>();
  for (const t of allTasks) {
    const key = t.category || "미분류";
    if (!seen.has(key)) {
      const catIdx = grouped.length; // 삽입 순서 = CHIP_PALETTE 인덱스
      seen.set(key, []);
      grouped.push({ category: key, color: CHIP_PALETTE[catIdx % CHIP_PALETTE.length], tasks: seen.get(key)! });
    }
    seen.get(key)!.push(t);
  }

  // 현재 tasks를 직렬화 (syncGantt 재사용)
  const serialize = (tasks: typeof allTasks) => tasks.map((t, i) => ({
    ...((t._id && t._id !== "temp") ? { _id: t._id } : {}),
    category: t.category, subTask: t.subTask, assignee: t.assignee ?? "",
    progress: t.progress, startDate: t.startDate, endDate: t.endDate,
    sortOrder: i, color: t.color,
  }));

  // 새 소분류 추가 (특정 카테고리 맨 아래)
  const addSubTask = async (category: string) => {
    await insertTask({
      campaignId, category, subTask: "", assignee: "", progress: 0,
      startDate: "", endDate: "", sortOrder: totalTasks, color: pickColor(category)
    });
    setTimeout(() => {
      const triggers = Array.from(document.querySelectorAll(`[data-task-cat="${category}"] .inline-edit-trigger`)) as HTMLElement[];
      if (triggers.length > 0) {
        triggers[triggers.length - 1].click();
      }
    }, 500);
  };

  // 새 대분류 추가
  const addCategory = async () => {
    let category = "새 대분류";
    if (grouped.some(g => g.category === category)) {
      category = "새 대분류 " + Math.floor(Math.random() * 100);
    }
    const usedColors = new Set(grouped.map(g => g.color));
    const available = PALETTE.filter(c => !usedColors.has(c));
    const newColor = available.length > 0 ? available[Math.floor(Math.random() * available.length)] : PALETTE[Math.floor(Math.random() * PALETTE.length)];

    await insertTask({
      campaignId, category, subTask: "", assignee: "", progress: 0,
      startDate: "", endDate: "", sortOrder: totalTasks, color: newColor
    });
    setTimeout(() => {
      const el = document.querySelector(`[data-cat-group="${category}"] .inline-edit-trigger`) as HTMLElement;
      if (el) el.click();
    }, 500);
  };

  // 막대 저장
  const handleBarSave = useCallback(async (taskId: string, s: string, e: string) => {
    await updateTask({ taskId: taskId as Id<"ganttTasks">, startDate: s, endDate: e });
  }, [updateTask]);

  const handleSaveBarLabel = useCallback(async (taskId: string, label: string) => {
    await updateTask({ taskId: taskId as Id<"ganttTasks">, barLabel: label });
  }, [updateTask]);

  // 막대 날짜 삭제 (날짜 비우기)
  const handleBarClear = async (taskId: string) => {
    await updateTask({ taskId: taskId as Id<"ganttTasks">, startDate: "", endDate: "" });
  };

  // 활동 추가 (클릭 위치 기반)
  const handleAddActivity = async (taskId: Id<"ganttTasks">, clickX?: number, containerEl?: HTMLElement) => {
    const task = allTasks.find(t => t._id === taskId);
    if (!task) return;

    let startDate = chartStart;
    if (clickX !== undefined && containerEl) {
      const rect = containerEl.getBoundingClientRect();
      const relativeX = clickX - rect.left;
      const pct = Math.max(0, Math.min(100, (relativeX / rect.width) * 100));
      const offset = Math.floor((pct / 100) * totalDays);
      startDate = toStr(toTs(chartStart) + offset * MS_DAY);
    }

    const newActivity = {
      id: `activity_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      name: "",
      startDate: startDate,
      endDate: toStr(toTs(startDate) + 6 * MS_DAY),
      progress: 0,
      color: task.color,
    };
    const activities = [...(task.activities || []), newActivity];
    await updateTask({ taskId, activities });
  };

  // 활동 저장
  const handleSaveActivity = async (actIdx: number, name: string, startDate: string, endDate: string) => {
    const taskId = editActivity?.taskId;
    const task = allTasks.find(t => t._id === taskId);
    console.log("[SAVE] actIdx:", actIdx, "taskId:", taskId, "task found:", !!task, "activities count:", task?.activities?.length);
    if (!task) return;
    const activities = (task.activities || []).map((a, i) =>
      i === actIdx ? { ...a, name, startDate, endDate } : a
    );
    console.log("[SAVE] updated activities:", JSON.stringify(activities));
    await updateTask({ taskId: task._id, activities });
  };

  // 활동 삭제
  const handleRemoveActivity = async (taskId: Id<"ganttTasks">, activityIdx: number) => {
    const task = allTasks.find(t => t._id === taskId);
    if (!task) return;
    const activities = (task.activities || []).filter((_a, i) => i !== activityIdx);
    await updateTask({ taskId, activities });
  };

  // 빈 행에서 클릭 위치로 날짜 계산 후 7일짜리 막대 생성
  const handleEmptyRowClick = async (task: typeof allTasks[0], e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const clickPct = (e.clientX - rect.left) / rect.width;
    const clickDay = Math.floor(clickPct * totalDays);
    const startTs = toTs(chartStart) + clickDay * MS_DAY;
    const endTs = startTs + 6 * MS_DAY;
    await updateTask({ taskId: task._id, startDate: toStr(startTs), endDate: toStr(endTs) });
  };

  // 소분류 삭제
  const handleDelete = async (taskId: Id<"ganttTasks">) => {
    const remaining = serialize(allTasks.filter(t => t._id !== taskId));
    await syncGantt({ campaignId, tasks: remaining });
  };

  // 대분류 전체 삭제
  const handleDeleteCategory = async (cat: string) => {
    if (!confirm(`'${cat}' 대분류와 하위 ${allTasks.filter(t => t.category === cat).length}개 업무를 모두 삭제하시겠습니까?`)) return;
    await deleteCategoryMutation({ campaignId, category: cat });
  };

  // 대분류 상대 위치 추가
  const handleAddCategoryRelative = async (targetIdx: number, offset: number) => {
    const insertIdx = targetIdx + offset;
    const newGrouped = [...grouped];
    
    // 유일한 새 대분류 이름 생성
    let newCat = "새 대분류";
    if (newGrouped.some(g => g.category === newCat)) {
      newCat = "새 대분류 " + Math.floor(Math.random()*100);
    }
    const usedColors = new Set(grouped.map(g => g.color));
    const available = PALETTE.filter(c => !usedColors.has(c));
    const newColor = available.length > 0 ? available[Math.floor(Math.random() * available.length)] : PALETTE[Math.floor(Math.random() * PALETTE.length)];

    const newTask = { category: newCat, subTask: "", assignee: "", progress: 0, startDate: chartStart, endDate: chartStart, sortOrder: 0, color: newColor, _id: "temp" as any } as any;
    
    newGrouped.splice(insertIdx, 0, { category: newCat, color: newColor, tasks: [newTask] });
    
    const flat = newGrouped.flatMap(g => g.tasks).map((t, i) => ({
      category: t.category, subTask: t.subTask, assignee: t.assignee ?? "", progress: t.progress, 
      startDate: t.startDate, endDate: t.endDate, sortOrder: i, color: t.color
    }));
    await syncGantt({ campaignId, tasks: flat });
  };

  // 드래그 앤 드롭 종료
  const handleDragEnd = async () => {
    if (!dragItem || !dragOverItem || dragItem.id === dragOverItem.id) {
      setDragItem(null); setDragOverItem(null); return;
    }

    if (dragItem.type === "category" && dragOverItem.type === "category") {
      // 대분류 뭉치 통째로 순서 변경
      const g = [...grouped];
      const fromIdx = g.findIndex(x => x.category === dragItem.id);
      const toIdx = g.findIndex(x => x.category === dragOverItem.id);
      if (fromIdx !== -1 && toIdx !== -1) {
        const [moved] = g.splice(fromIdx, 1);
        g.splice(toIdx, 0, moved);
        // 직렬화 함수를 통해 시스템 필드 필터링
        const newFlat = serialize(g.flatMap(grp => grp.tasks));
        await syncGantt({ campaignId, tasks: newFlat });
      }
    } else if (dragItem.type === "task" && dragOverItem.type === "task") {
      // 소분류 순서 변경
      const fromTask = allTasks.find(t => t._id === dragItem.id);
      const toTask = allTasks.find(t => t._id === dragOverItem.id);
      if (fromTask && toTask) {
        const rem = allTasks.filter(t => t._id !== dragItem.id);
        const toIdx = rem.findIndex(t => t._id === dragOverItem.id);
        // 드롭된 위치의 카테고리와 색상 상속
        const updatedFrom = { ...fromTask, category: toTask.category, color: toTask.color };
        rem.splice(toIdx, 0, updatedFrom);
        // 직렬화를 통해 시스템 필드 필터링 (기존 serialize 사용)
        const newFlat = serialize(rem);
        await syncGantt({ campaignId, tasks: newFlat });
      }
    }
    setDragItem(null); setDragOverItem(null);
  };

  // 붙여넣기 적용
  const applyPaste = async () => {
    if (!pasteRows) return;
    const newRows = pasteRows.map((r, i) => ({
      category: r.category || "미분류", subTask: r.subTask || "",
      assignee: "", progress: r.progress,
      startDate: r.startDate || chartStart, endDate: r.endDate || chartStart,
      sortOrder: totalTasks + i, color: pickColor(r.category || ""),
    }));
    await syncGantt({ campaignId, tasks: [...serialize(allTasks), ...newRows] });
    setPasteRows(null);
  };

  // 전역 Ctrl+V 감지 (입력창 제외, 관리자만)
  useEffect(() => {
    if (!isAdmin) return;
    const handler = (e: ClipboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") return;
      const text = e.clipboardData?.getData("text") ?? "";
      if (!text.trim()) return;
      const rows = parsePasteText(text, year);
      if (rows.length > 0) {
        e.preventDefault();
        setPasteRows(rows);
      }
    };
    window.addEventListener("paste", handler);
    return () => window.removeEventListener("paste", handler);
  }, [year, isAdmin]);

  // 구글 시트 연동 처리
  const handleSyncFromSheet = async () => {
    if (!sheetUrl) return;
    setIsSyncingSheet(true);
    try {
      // API 라우트(서비스 계정)를 통해 데이터 패치
      const res = await fetch('/api/fetch-sheet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sheetUrl, campaignStartDate: campaign?.startDate })
      });
      const result = await res.json();
      
      if (!result.success) {
        throw new Error(result.error || "시트 데이터를 가져오지 못했습니다. 서비스 계정 권한을 확인해주세요.");
      }
      
      const parsedData = result.data; // 서버에서 완벽히 파싱된 데이터 반환

      if (parsedData && parsedData.length > 0) {
        setPasteRows(parsedData);
      } else {
        alert("파싱할 데이터가 없습니다.");
      }
      setShowSheetInput(false);
      setSheetUrl("");
    } catch (e: any) {
      alert(e.message);
    } finally {
      setIsSyncingSheet(false);
    }
  };

  return (
    <div className="flex flex-col gap-8 animate-in fade-in slide-in-from-bottom-4 duration-500">

      {/* D-DAY 배너 */}
      <div className="flex gap-4">
        <GlassCard className="flex-1 flex items-center justify-between p-6">
          <div>
            <p className="text-xs text-gray-400 mb-1 font-mono uppercase tracking-widest">Campaign Status</p>
            {campaign ? (
              <div className="flex items-baseline gap-3">
                <span className="text-5xl font-bold font-mono text-gray-900">{formatDDay(campaign.startDate)}</span>
                {campaign.endDate && diffDays(todayStr, campaign.endDate) >= 0 && (
                  <span className="text-sm border border-gray-200 bg-gray-50 text-gray-500 rounded-full px-3 py-1 font-mono">
                    종료까지 {diffDays(todayStr, campaign.endDate)}일
                  </span>
                )}
              </div>
            ) : <span className="text-gray-300">로딩 중...</span>}
            {isAdmin ? (
              <button
                onClick={openDateEditor}
                className="flex items-center gap-1.5 mt-2 text-xs text-gray-400 font-mono hover:text-gray-700 hover:bg-gray-100 px-2 py-1 rounded-lg transition-all group"
              >
                <CalendarDays className="w-3.5 h-3.5 opacity-50 group-hover:opacity-100" />
                {campaign?.startDate} ~ {campaign?.endDate || "미정"}
              </button>
            ) : (
              <p className="mt-2 text-xs text-gray-400 font-mono px-2 py-1">
                {campaign?.startDate} ~ {campaign?.endDate || "미정"}
              </p>
            )}
          </div>
          <div className="text-right">
            <p className="text-xs text-gray-400 mb-1">Today</p>
            <p className="text-xl font-mono text-gray-500">{todayStr.replace(/-/g, ".")}</p>
          </div>
        </GlassCard>
        <GlassCard className="min-w-[180px] flex flex-col justify-center p-6">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs text-gray-400">전체 진행률</p>
            {!hasTaskProgress && (
              <span className="text-[9px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-full">일정 기준</span>
            )}
          </div>
          <p className="text-4xl font-bold font-mono text-gray-900 mb-2">{avgProgress}%</p>
          <div className="w-full h-1.5 rounded-full bg-gray-100">
            <div className="h-full rounded-full bg-gray-900 transition-all" style={{ width: `${avgProgress}%` }} />
          </div>
        </GlassCard>
      </div>

      {/* 캠페인 기간 편집 모달 */}
      {isAdmin && showDateEditor && campaign && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-white/90 backdrop-blur-sm"
          onClick={() => setShowDateEditor(false)}>
          <div className="bg-white border border-gray-200 rounded-2xl p-6 w-80 shadow-xl"
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-gray-900 text-sm font-semibold">캠페인 기간 수정</h3>
              <button onClick={() => setShowDateEditor(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-gray-500 block mb-1">시작일</label>
                <input type="date" value={dateDraftStart} onChange={e => setDateDraftStart(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-gray-900 text-sm outline-none focus:border-gray-400" />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">종료일</label>
                <input type="date" value={dateDraftEnd} onChange={e => setDateDraftEnd(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-gray-900 text-sm outline-none focus:border-gray-400" />
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <Button variant="ghost" size="sm" className="flex-1 text-gray-500 hover:bg-gray-50" onClick={() => setShowDateEditor(false)}>취소</Button>
              <Button size="sm" className="flex-1 bg-gray-900 text-white hover:bg-gray-800"
                onClick={handleSaveDates} disabled={!dateDraftStart || !dateDraftEnd}>
                <Check className="w-3.5 h-3.5 mr-1" />저장
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── KPI 달성률 패널 ── */}
      <KpiAchievementPanel campaignId={campaignId} campaign={campaign} />

      {/* ── 캠페인 단계 (Phases) ── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-bold text-gray-900">캠페인 단계 (Phases)</h2>
          {isAdmin && (
            <div className="flex items-center gap-2">
              <input type="file" accept="image/*" className="hidden" ref={fileInputRef} onChange={handleExtractPhases} />
              <Button
                onClick={() => fileInputRef.current?.click()}
                size="sm"
                disabled={isExtracting}
                className="bg-indigo-600 hover:bg-indigo-700 text-gray-900 gap-2 border-0"
              >
                {isExtracting ? (
                  <span className="font-mono animate-pulse">분석 중...</span>
                ) : (
                  <>✨ 구조도 AI 스캔</>
                )}
              </Button>
              <Button
                onClick={() => upsertPhase({
                  campaignId,
                  title: `Phase ${((phases?.length || 0) + 1)}`,
                  subtitle: "새로운 단계 목표",
                  sortOrder: phases?.length || 0,
                  color: ["#3b82f6","#8b5cf6","#f59e0b","#10b981","#ec4899","#f97316"][(phases?.length || 0) % 6],
                  items: [{ name: "새 이벤트", description: "주요 내용 입력" }]
                })}
                size="sm"
                className="bg-white/10 text-gray-900 hover:bg-white/20 gap-2 border border-white/20"
              >
                <Plus className="w-4 h-4" /> 단계 추가
              </Button>
            </div>
          )}
        </div>

        <div className="flex gap-4 overflow-x-auto pb-4">
          {(phases ?? []).map((phase, idx) => (
            <React.Fragment key={phase._id}>
              {/* 단계 카드 */}
              <GlassCard
                className="min-w-[220px] p-4 relative group border transition-all"
                style={{
                  backgroundColor: (phase.color || "#3b82f6") + "15",
                  borderColor: (phase.color || "#3b82f6") + "40"
                }}
              >
                {isAdmin && (
                  <button
                    onClick={() => deletePhase({ id: phase._id })}
                    className="absolute top-3 right-3 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                    style={{ color: phase.color + "60" }}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
                <div className="text-center mb-3">
                  <InlineEdit
                    value={phase.title}
                    placeholder="Phase 1"
                    onSave={v => upsertPhase({
                      id: phase._id, campaignId: phase.campaignId, title: v,
                      subtitle: phase.subtitle, sortOrder: phase.sortOrder,
                      color: phase.color, items: phase.items
                    })}
                    readOnly={!isAdmin}
                    className="text-xs tracking-widest uppercase font-mono mb-0.5 text-center"
                    style={{ color: phase.color + "80" }}
                  />
                  <InlineEdit
                    value={phase.subtitle}
                    placeholder="목표 입력"
                    onSave={v => upsertPhase({
                      id: phase._id, campaignId: phase.campaignId, title: phase.title,
                      subtitle: v, sortOrder: phase.sortOrder,
                      color: phase.color, items: phase.items
                    })}
                    readOnly={!isAdmin}
                    className="text-sm font-bold text-center"
                    style={{ color: phase.color }}
                  />
                </div>

                <div className="space-y-2">
                  {phase.items.map((item, iOffset) => (
                    <div
                      key={iOffset}
                      className={cn(
                        "p-4 rounded-xl border relative group/item transition-colors shadow-md",
                        item.isHighlighted
                          ? "bg-indigo-500/10 border-indigo-500/30"
                          : "bg-gray-50 border-gray-200"
                      )}
                    >
                      {isAdmin && (
                        <button
                          onClick={() => {
                            const newItems = [...phase.items];
                            newItems.splice(iOffset, 1);
                            upsertPhase({
                              id: phase._id, campaignId: phase.campaignId, title: phase.title,
                              subtitle: phase.subtitle, sortOrder: phase.sortOrder,
                              color: phase.color, items: newItems
                            });
                          }}
                          className="absolute top-2 right-2 text-gray-900/20 hover:text-red-400 opacity-0 group-hover/item:opacity-100"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      )}
                      <div
                        className="mb-1 w-full"
                        onDoubleClick={isAdmin ? () => {
                          const newItems = [...phase.items];
                          newItems[iOffset].isHighlighted = !newItems[iOffset].isHighlighted;
                          upsertPhase({
                            id: phase._id, campaignId: phase.campaignId, title: phase.title,
                            subtitle: phase.subtitle, sortOrder: phase.sortOrder,
                            color: phase.color, items: newItems
                          });
                        } : undefined}
                      >
                        <InlineEdit
                          value={item.name}
                          placeholder="항목명"
                          onSave={v => {
                            const newItems = [...phase.items];
                            newItems[iOffset].name = v;
                            upsertPhase({
                              id: phase._id, campaignId: phase.campaignId, title: phase.title,
                              subtitle: phase.subtitle, sortOrder: phase.sortOrder,
                              color: phase.color, items: newItems
                            });
                          }}
                          readOnly={!isAdmin}
                          className={cn(
                            "font-bold text-base",
                            item.isHighlighted ? "text-indigo-400" : "text-gray-900/90"
                          )}
                        />
                      </div>
                      <InlineEdit
                        value={item.description}
                        placeholder="상세 설명"
                        onSave={v => {
                          const newItems = [...phase.items];
                          newItems[iOffset].description = v;
                          upsertPhase({
                            id: phase._id, campaignId: phase.campaignId, title: phase.title,
                            subtitle: phase.subtitle, sortOrder: phase.sortOrder,
                            color: phase.color, items: newItems
                          });
                        }}
                        readOnly={!isAdmin}
                        className="text-sm text-gray-900/50"
                      />
                    </div>
                  ))}
                  
                  {isAdmin && (
                    <button
                      onClick={() => {
                        const newItems = [...phase.items, { name: "추가 항목", description: "세부 내용" }];
                        upsertPhase({
                          id: phase._id, campaignId: phase.campaignId, title: phase.title,
                          subtitle: phase.subtitle, sortOrder: phase.sortOrder,
                          color: phase.color, items: newItems
                        });
                      }}
                      className="w-full py-2 flex items-center justify-center border border-dashed border-white/20 rounded-xl text-gray-900/30 hover:text-gray-900/60 hover:bg-white/5 transition-colors text-sm"
                    >
                      <Plus className="w-3.5 h-3.5 mr-1" /> 항목 추가
                    </button>
                  )}
                </div>
              </GlassCard>

              {/* 화살표 */}
              {idx < phases!.length - 1 && (
                <div className="flex items-center justify-center shrink-0 w-8">
                  <ArrowRight className="w-6 h-6 text-gray-900/20" />
                </div>
              )}
            </React.Fragment>
          ))}
          {phases?.length === 0 && (
            <div className="text-gray-900/30 text-sm py-12 text-center w-full border border-dashed border-white/20 rounded-2xl">
              [+ 단계 추가] 버튼을 눌러 캠페인 구조도를 작성해보세요.
            </div>
          )}
        </div>
      </div>

      {/* 간트 차트 */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-lg font-bold text-gray-900">채널별 업무 타임라인</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              셀 클릭으로 편집 · Enter로 다음 행 추가 · 막대 드래그로 기간 조절 ·
              <kbd className="ml-1 bg-gray-100 px-1.5 py-0.5 rounded text-gray-500 font-mono">Ctrl+V</kbd>로 스프레드시트 붙여넣기
            </p>
          </div>
          <div className="flex items-center gap-2">
            {isAdmin && (
              <Button onClick={() => setShowSheetInput(true)} size="sm" variant="outline" className="text-emerald-600 border-emerald-200 hover:bg-emerald-50 gap-2 font-semibold bg-white">
                <FileSpreadsheet className="w-4 h-4" /> 구글 시트 연동
              </Button>
            )}
            <div className="flex gap-1 bg-gray-100 p-1 rounded-lg">
              {/* 뷰어: Calendar → Table 순서 / 관리자: Table → Calendar 순서 */}
              {(isViewer ? (["calendar", "gantt"] as const) : (["gantt", "calendar"] as const)).map(mode => (
                <button
                  key={mode}
                  onClick={() => setTimelineViewMode(mode)}
                  className={cn(
                    "px-3 py-1.5 rounded text-xs font-medium transition-all",
                    timelineViewMode === mode
                      ? "bg-gray-900 text-white"
                      : "text-gray-600 hover:bg-white"
                  )}
                >
                  {mode === "gantt" ? "Table" : "Calendar"}
                </button>
              ))}
            </div>
            {isAdmin && (
              <Button onClick={addCategory} size="sm"
                className="bg-gray-900 text-white hover:bg-gray-800 gap-2 font-semibold ml-2">
                <Plus className="w-4 h-4" /> 대분류 추가
              </Button>
            )}
          </div>
        </div>

        {timelineViewMode === "gantt" ? (
        <GlassCard className="p-0 overflow-hidden">
          <div className="overflow-auto" style={{ maxHeight: "72vh", scrollbarWidth: "thin", scrollbarColor: "rgba(0,0,0,0.1) transparent" }}>
            <div style={{ minWidth: LABEL_W + dynamicChartMin }}>

              {/* 날짜 헤더 */}
              <div className="flex border-b border-gray-100 bg-gray-50 sticky top-0 z-20">
                <div style={{ minWidth: LABEL_W, width: LABEL_W }}
                  className="px-4 py-2 flex items-end border-r border-gray-100">
                  <span className="text-xs text-gray-400 uppercase tracking-wider">업무</span>
                </div>
                <div ref={chartRef} className="relative flex-1 h-10" style={{ minWidth: dynamicChartMin }}>
                  {/* 왼쪽 끝 + 버튼 (이전 월 추가) */}
                  <button
                    onClick={() => setExtraStartMonths(p => p + 1)}
                    className="absolute left-0 top-0 h-full w-8 flex items-center justify-center z-20 text-gray-900/30 hover:text-gray-900 hover:bg-white/10 transition-all"
                    title="이전 달 추가">
                    <span className="text-base font-bold leading-none">‹+</span>
                  </button>
                  {monthTicks.map(({ label, pct }, tickIdx) => {
                    // 캠페인 기간 밖의 월(추가된 달)인지 판단
                    const isExtraStart = tickIdx < extraStartMonths;
                    const isExtraEnd = tickIdx >= monthTicks.length - extraEndMonths;
                    const isExtra = isExtraStart || isExtraEnd;
                    return (
                      <div key={label} className="absolute flex flex-col justify-end h-full pb-2 group/tick" style={{ left: `${pct}%` }}>
                        <div className="absolute top-0 bottom-0 left-0 w-px bg-white/10" />
                        {isExtra ? (
                          // 추가된 달: 클릭하면 삭제
                          <button
                            onClick={() => {
                              if (isExtraStart) setExtraStartMonths(p => Math.max(0, p - 1));
                              else setExtraEndMonths(p => Math.max(0, p - 1));
                            }}
                            className="text-xs text-gray-900/25 pl-2 hover:text-red-400 transition-colors flex items-center gap-1"
                            title="이 달 제거">
                            {label}
                            <X className="w-2.5 h-2.5 opacity-0 group-hover/tick:opacity-100" />
                          </button>
                        ) : (
                          <span className="text-xs text-gray-900/40 pl-2">{label}</span>
                        )}
                      </div>
                    );
                  })}
                  {/* 오른쪽 끝 + 버튼 (이후 월 추가) */}
                  <button
                    onClick={() => setExtraEndMonths(p => p + 1)}
                    className="absolute right-0 top-0 h-full w-8 flex items-center justify-center z-20 text-gray-900/30 hover:text-gray-900 hover:bg-white/10 transition-all"
                    title="다음 달 추가">
                    <span className="text-base font-bold leading-none">+›</span>
                  </button>
                  <div className="absolute top-0 bottom-0 z-10 pointer-events-none" style={{ left: `${todayPct}%` }}>
                    <div className="w-px h-full bg-red-400/70" />
                    <span className="absolute top-1 left-1 text-[10px] text-red-400 font-mono whitespace-nowrap">{fmtMD(todayStr)}</span>
                  </div>
                </div>
              </div>

              {/* 빈 상태 */}
              {totalTasks === 0 && (
                <div className="flex flex-col items-center py-16 gap-3">
                  <p className="text-gray-400 text-sm">업무가 없습니다. 대분류를 추가하거나 스프레드시트를 붙여넣기하세요.</p>
                  <p className="text-gray-300 text-xs">
                    <kbd className="bg-gray-100 px-1.5 py-0.5 rounded font-mono">Ctrl+V</kbd> 로 스프레드시트 내용 붙여넣기 가능
                  </p>
                </div>
              )}

              {/* 카테고리 그룹 */}
              {grouped.map(({ category, color, tasks }, catIdx) => {
                const isDragOverCategory = dragOverItem?.type === "category" && dragOverItem.id === category;
                return (
                <React.Fragment key={category}>

                  {/* 대분류 헤더 행 */}
                  <div className={cn("flex items-center border-b border-gray-100 sticky group/cat transition-all select-none bg-gray-100", isDragOverCategory && "border-t-2 border-t-gray-400")}
                    data-cat-group={category}
                    style={{ top: 40, height: CAT_H, zIndex: 15 }}
                    draggable={isAdmin}
                    onDragStart={isAdmin ? (e) => { e.dataTransfer.effectAllowed = "move"; setDragItem({ type: "category", id: category }); } : undefined}
                    onDragOver={isAdmin ? (e) => { e.preventDefault(); setDragOverItem({ type: "category", id: category }); } : undefined}
                    onDragEnd={isAdmin ? handleDragEnd : undefined}
                    onDrop={isAdmin ? (e) => { e.preventDefault(); handleDragEnd(); } : undefined}
                  >
                    <div style={{ minWidth: LABEL_W, width: LABEL_W }}
                      className="flex items-center gap-2 px-4 border-r border-white/10 h-full cursor-grab active:cursor-grabbing">
                      <div className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: color }} />
                      <InlineEdit
                        value={category}
                        placeholder="대분류명"
                        onSave={async v => {
                          const updated = serialize(allTasks).map(t =>
                            t.category === category ? { ...t, category: v, color: getNewColor(v, t.color) } : t
                          );
                          await syncGantt({ campaignId, tasks: updated });
                        }}
                        onEnter={(newVal) => {
                          const targetCat = newVal || category;
                          const catTasks = grouped.find(g => g.category === category)?.tasks || [];
                          if (catTasks.length === 0) {
                            addSubTask(targetCat);
                          } else {
                            setTimeout(() => {
                              const triggers = Array.from(document.querySelectorAll(`[data-task-cat="${targetCat}"] .inline-edit-trigger`)) as HTMLElement[];
                              if (triggers.length > 0) triggers[0].click();
                            }, 500);
                          }
                        }}
                        readOnly={!isAdmin}
                        className="text-gray-900 font-semibold text-xs flex-1"
                      />
                      {isAdmin && (
                        <>
                          <button onClick={() => handleAddCategoryRelative(catIdx, 0)} className="opacity-0 group-hover/cat:opacity-100 transition-opacity shrink-0 p-1 rounded text-gray-900/30 hover:text-indigo-400" title="위에 대분류 추가">
                            <Plus className="w-3 h-3" />
                          </button>
                          <button onClick={() => handleAddCategoryRelative(catIdx, 1)} className="opacity-0 group-hover/cat:opacity-100 transition-opacity shrink-0 p-1 rounded text-gray-900/30 hover:text-indigo-400" title="아래에 대분류 추가">
                            <Plus className="w-3 h-3" />
                          </button>
                          <button onClick={() => handleDeleteCategory(category)} className="opacity-0 group-hover/cat:opacity-100 transition-opacity shrink-0 p-1 rounded text-gray-900/30 hover:text-red-400" title="대분류 삭제">
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </>
                      )}
                    </div>
                    {/* 차트 영역 - 대분류 배경 */}
                    <div className="relative flex-1 h-full" style={{ minWidth: dynamicChartMin }}>
                      {monthTicks.map(({ label, pct }) => (
                        <div key={label} className="absolute top-0 bottom-0 w-px bg-white/5" style={{ left: `${pct}%` }} />
                      ))}
                      <div className="absolute top-0 bottom-0 w-px bg-red-400/20 pointer-events-none" style={{ left: `${todayPct}%` }} />
                    </div>
                  </div>

                  {/* 소분류 행 */}
                  {tasks.map((task, taskIdx) => {
                    const isDragOverTask = dragOverItem?.type === "task" && dragOverItem.id === task._id;
                    return (
                    <div key={task._id} className={cn("flex border-b border-gray-100 hover:bg-gray-50 bg-white group/row transition-all select-none", isDragOverTask && "border-t-2 border-t-gray-400")}
                      data-task-cat={category}
                      style={{ minHeight: ROW_H }}
                      draggable={isAdmin}
                      onDragStart={isAdmin ? (e) => { e.dataTransfer.effectAllowed = "move"; setDragItem({ type: "task", id: task._id }); e.stopPropagation(); } : undefined}
                      onDragOver={isAdmin ? (e) => { e.preventDefault(); e.stopPropagation(); setDragOverItem({ type: "task", id: task._id }); } : undefined}
                      onDragEnd={isAdmin ? (e) => { e.stopPropagation(); handleDragEnd(); } : undefined}
                      onDrop={isAdmin ? (e) => { e.preventDefault(); e.stopPropagation(); handleDragEnd(); } : undefined}
                    >

                      {/* 소분류 라벨 */}
                      <div className="flex flex-col border-r border-white/5" style={{ minWidth: LABEL_W, width: LABEL_W, minHeight: ROW_H }}>
                        {/* 업무명 */}
                        <div className="flex items-center pl-8 pr-2 gap-1 overflow-hidden cursor-grab active:cursor-grabbing" style={{ minHeight: ROW_H }}>
                          <div className="w-1 h-4 rounded-full shrink-0" style={{ backgroundColor: color }} />
                          <InlineEdit
                            value={task.subTask}
                            placeholder="소분류 / 업무명"
                            onSave={v => updateTask({ taskId: task._id, subTask: v })}
                            onEnter={(newVal) => {
                              const isLast = taskIdx === tasks.length - 1;
                              if (isLast) {
                                addSubTask(category);
                              } else {
                                setTimeout(() => {
                                  const triggers = Array.from(document.querySelectorAll(`[data-task-cat="${category}"] .inline-edit-trigger`)) as HTMLElement[];
                                  if (triggers[taskIdx + 1]) triggers[taskIdx + 1].click();
                                }, 100);
                              }
                            }}
                            readOnly={!isAdmin}
                            className="text-gray-900/80 flex-1"
                          />
                          {/* 삭제 버튼 */}
                          {isAdmin && (
                            <button
                              onClick={() => handleDelete(task._id)}
                              className="opacity-0 group-hover/row:opacity-100 transition-opacity shrink-0 p-1 rounded text-gray-900/30 hover:text-red-400"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* 간트 바 영역 - 기본 활동 + 추가 활동들 */}
                      <div className="flex-1 min-w-max">
                        {/* 기본 활동 + 추가 활동들 컨테이너 */}
                        <div
                          onClick={isAdmin ? (e) => {
                            if (!isDraggingRef.current) {
                              handleAddActivity(task._id, e.clientX, e.currentTarget as HTMLElement);
                            }
                          } : undefined}
                          className={cn("relative group/activities", isAdmin ? "cursor-crosshair" : "cursor-default")}
                          style={{
                            height: ROW_H,
                            minWidth: dynamicChartMin,
                          }}
                        >
                          {/* 기본 활동 */}
                          <div className="absolute inset-x-0 top-0" style={{ height: ROW_H }}>
                            {monthTicks.map(({ label, pct }) => (
                              <div key={label} className="absolute top-0 bottom-0 w-px bg-white/5" style={{ left: `${pct}%` }} />
                            ))}
                            <div className="absolute top-0 bottom-0 w-px bg-red-400/25 pointer-events-none" style={{ left: `${todayPct}%` }} />

                            {task.startDate && task.endDate ? (
                              <div className="absolute inset-0 cursor-pointer group/bar pointer-events-none">
                                <GanttBar
                                  task={task}
                                  chartStartTs={toTs(chartStart)}
                                  totalDays={totalDays}
                                  containerW={chartW}
                                  rowH={ROW_H}
                                  barColor={color}
                                  onSave={handleBarSave}
                                  onClickEdit={setEditBar}
                                  onClear={handleBarClear}
                                  onSaveLabel={handleSaveBarLabel}
                                  isDraggingRef={isDraggingRef}
                                  readOnly={!isAdmin}
                                />
                              </div>
                            ) : (
                              isAdmin ? (
                                <div
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleEmptyRowClick(task, e);
                                  }}
                                  className="absolute inset-0 flex items-center pl-4 text-xs text-gray-900/0 hover:text-gray-900/30 hover:bg-white/3 transition-colors cursor-crosshair group/empty"
                                >
                                  <span className="opacity-0 group-hover/empty:opacity-100 transition-opacity select-none">클릭하여 일정 추가</span>
                                </div>
                              ) : null
                            )}
                          </div>

                          {/* 추가 활동들 */}
                          {task.activities && task.activities.map((activity, idx) => {
                            const actStart = toTs(activity.startDate);
                            const actEnd = toTs(activity.endDate);
                            const chartStartTs = toTs(chartStart);
                            const left = ((actStart - chartStartTs) / MS_DAY / totalDays) * 100;
                            // +1 to include end day (consistent with GanttBar widthPx = (diff + 1) * pxDay)
                            const width = ((actEnd - actStart) / MS_DAY + 1) / totalDays * 100;
                            const pxDay = chartW / totalDays;

                            const handleActivityDrag = (e: React.MouseEvent, mode: "move" | "left" | "right") => {
                              e.preventDefault();
                              e.stopPropagation();
                              isDraggingRef.current = true;
                              console.log("[DRAG] idx:", idx, "mode:", mode, "task._id:", task._id);
                              const ox = e.clientX;
                              const os = actStart;
                              const oe = actEnd;
                              const actIdx = idx;
                              const taskId = task._id;
                              let moved = false;

                              const mv = (ev: MouseEvent) => {
                                const dd = Math.round((ev.clientX - ox) / pxDay);
                                if (dd === 0) return;
                                moved = true;
                                const currentTask = allTasks.find(t => t._id === taskId);
                                if (!currentTask?.activities) return;
                                const currentActivity = currentTask.activities[actIdx];
                                if (!currentActivity) return;
                                const newStart = mode === "move" || mode === "left" ? toStr(os + dd * MS_DAY) : currentActivity.startDate;
                                const newEnd = mode === "move" || mode === "right" ? toStr(oe + dd * MS_DAY) : currentActivity.endDate;
                                const updatedActivities = currentTask.activities.map((a, i) => i === actIdx ? { ...a, startDate: newStart, endDate: newEnd } : a);
                                updateTask({ taskId, activities: updatedActivities });
                              };

                              const up = () => {
                                if (!moved) {
                                  const currentTask = allTasks.find(t => t._id === taskId);
                                  const currentActivity = currentTask?.activities?.[actIdx];
                                  console.log("[UP] actIdx:", actIdx, "currentActivity:", currentActivity?.name, "activities count:", currentTask?.activities?.length);
                                  if (currentActivity) { setEditActivityIdx(actIdx); setEditActivity({ ...currentActivity, taskId }); }
                                }
                                setTimeout(() => { isDraggingRef.current = false; }, 100);
                                window.removeEventListener("mousemove", mv);
                                window.removeEventListener("mouseup", up);
                              };

                              window.addEventListener("mousemove", mv);
                              window.addEventListener("mouseup", up);
                            };

                            return (
                              <div
                                key={`${task._id}-act-${idx}`}
                                className={cn("absolute rounded-lg select-none z-10 hover:z-[60] group/activity", isAdmin ? "cursor-move" : "cursor-default")}
                                style={{
                                  height: ROW_H - 10,
                                  top: 5,
                                  left: `${Math.max(0, left)}%`,
                                  width: `${Math.max(1 / totalDays * 100, width)}%`,
                                  backgroundColor: color,
                                }}
                                onMouseDown={isAdmin ? (e) => console.log("[OUTER BAR mousedown] idx:", idx, "task:", task.subTask) : undefined}
                              >
                                {/* 왼쪽 리사이징 핸들 */}
                                {isAdmin && <div className="absolute left-0 top-0 h-full w-2.5 cursor-ew-resize rounded-l-lg flex items-center justify-center opacity-0 group-hover/activity:opacity-100 transition-opacity bg-white/90 z-20"
                                  onMouseDown={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    isDraggingRef.current = true;
                                    const ox = e.clientX;
                                    const os = actStart;
                                    const oe = actEnd;
                                    const actIdx = idx;
                                    const taskId = task._id;
                                    let moved = false;
                                    const pxDay = chartW / totalDays;

                                    const mv = (ev: MouseEvent) => {
                                      const dd = Math.round((ev.clientX - ox) / pxDay);
                                      if (dd === 0) return;
                                      moved = true;
                                      const currentTask = allTasks.find(t => t._id === taskId);
                                      if (!currentTask?.activities) return;
                                      const newStart = toStr(Math.min(os + dd * MS_DAY, oe - MS_DAY));
                                      const updatedActivities = currentTask.activities.map((a, i) => i === actIdx ? { ...a, startDate: newStart } : a);
                                      updateTask({ taskId, activities: updatedActivities });
                                    };
                                    const up = () => {
                                      setTimeout(() => { isDraggingRef.current = false; }, 100);
                                      window.removeEventListener("mousemove", mv);
                                      window.removeEventListener("mouseup", up);
                                    };
                                    window.addEventListener("mousemove", mv);
                                    window.addEventListener("mouseup", up);
                                  }}
                                ><div className="w-0.5 h-4 bg-white/70 rounded-full" /></div>}

                                {/* 텍스트 */}
                                <div className={cn("absolute inset-0 flex items-center justify-center px-2", isAdmin && "cursor-pointer")}
                                  onMouseDown={isAdmin ? (e) => { e.stopPropagation(); e.preventDefault(); handleActivityDrag(e, "move"); } : undefined}>
                                  {/* 툴팁 */}
                                  <span className="absolute z-50 invisible opacity-0 group-hover/activity:visible group-hover/activity:opacity-100 bg-gray-900 text-white text-[10px] px-2 py-1 rounded shadow-md whitespace-nowrap transition-all pointer-events-none bottom-full mb-1 left-1/2 -translate-x-1/2">
                                    {activity.name ? `${activity.name} | ` : ""}{fmtMD(activity.startDate)}{activity.startDate !== activity.endDate ? `~${fmtMD(activity.endDate)}` : ""}
                                    <div className="absolute top-full left-1/2 -translate-x-1/2 border-[4px] border-transparent border-t-gray-900" />
                                  </span>

                                  {activity.name ? (
                                    <span className="text-xs text-gray-900 font-semibold truncate">{activity.name} | {fmtMD(activity.startDate)}~{fmtMD(activity.endDate)}</span>
                                  ) : (
                                    <span className="text-[10px] text-gray-900/60 font-medium">{fmtMD(activity.startDate)} ~ {fmtMD(activity.endDate)}</span>
                                  )}
                                </div>

                                {/* 오른쪽 리사이징 핸들 */}
                                {isAdmin && <div className="absolute right-0 top-0 h-full w-2.5 cursor-ew-resize rounded-r-lg flex items-center justify-center opacity-0 group-hover/activity:opacity-100 transition-opacity bg-white/90 z-20"
                                  onMouseDown={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    isDraggingRef.current = true;
                                    const ox = e.clientX;
                                    const os = actStart;
                                    const oe = actEnd;
                                    const actIdx = idx;
                                    const taskId = task._id;
                                    let moved = false;
                                    const pxDay = chartW / totalDays;

                                    const mv = (ev: MouseEvent) => {
                                      const dd = Math.round((ev.clientX - ox) / pxDay);
                                      if (dd === 0) return;
                                      moved = true;
                                      const currentTask = allTasks.find(t => t._id === taskId);
                                      if (!currentTask?.activities) return;
                                      const newEnd = toStr(Math.max(oe + dd * MS_DAY, os + MS_DAY));
                                      const updatedActivities = currentTask.activities.map((a, i) => i === actIdx ? { ...a, endDate: newEnd } : a);
                                      updateTask({ taskId, activities: updatedActivities });
                                    };
                                    const up = () => {
                                      setTimeout(() => { isDraggingRef.current = false; }, 100);
                                      window.removeEventListener("mousemove", mv);
                                      window.removeEventListener("mouseup", up);
                                    };
                                    window.addEventListener("mousemove", mv);
                                    window.addEventListener("mouseup", up);
                                  }}
                                ><div className="w-0.5 h-4 bg-white/70 rounded-full" /></div>}

                                {/* X 삭제 버튼 */}
                                {isAdmin && (
                                  <button
                                    onMouseDown={e => e.stopPropagation()}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleRemoveActivity(task._id, idx);
                                    }}
                                    className="absolute -top-2 -right-2 z-30 opacity-0 group-hover/activity:opacity-100 transition-opacity w-4 h-4 rounded-full bg-white/90 border border-white/20 flex items-center justify-center text-gray-900/60 hover:text-red-400 hover:border-red-400/60"
                                    title="활동 삭제">
                                    <X className="w-2.5 h-2.5" />
                                  </button>
                                )}
                              </div>
                            );
                          })}

                          {(!task.activities || task.activities.length === 0) && (
                            <div className="absolute inset-0 flex items-center pl-4 text-xs text-gray-900/0 group-hover/activities:text-gray-900/30 transition-colors">
                              <span className="select-none">클릭하여 활동 추가</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )})}

                  {/* 소분류 추가 버튼 */}
                  {isAdmin && (
                    <div className="flex border-b border-white/5">
                      <div style={{ minWidth: LABEL_W, width: LABEL_W }}
                        className="border-r border-white/5">
                        <button onClick={() => addSubTask(category)}
                          className="w-full pl-8 py-2 text-xs text-gray-900/25 hover:text-gray-900/50 hover:bg-white/5 transition-colors text-left flex items-center gap-1">
                          <Plus className="w-3 h-3" /> 소분류 추가
                        </button>
                      </div>
                      <div className="flex-1" />
                    </div>
                  )}
                </React.Fragment>
              )})}

              {/* 대분류 추가 */}
              {isAdmin && totalTasks > 0 && (
                <button onClick={addCategory}
                  className="w-full py-3 text-sm text-gray-900/25 hover:text-gray-900/50 hover:bg-white/5 transition-colors flex items-center justify-center gap-2">
                  <Plus className="w-4 h-4" /> 대분류 추가
                </button>
              )}
            </div>
          </div>
        </GlassCard>
        ) : (
        <CalendarView key={allTasks.length} tasks={allTasks} chartStart={chartStart} chartEnd={chartEnd} />
        )}
      </div>

      {/* 날짜 편집 팝업 */}
      {editBar && <DatePopup task={editBar} onSave={handleBarSave} onClose={() => setEditBar(null)} updateTask={updateTask} />}

      {/* 활동 편집 팝업 */}
      {editActivity && <ActivityEditPopup activity={editActivity} actIdx={editActivityIdx} onSave={handleSaveActivity} onClose={() => setEditActivity(null)} />}

      {/* 붙여넣기 확인 모달 */}
      {pasteRows && <PasteModal rows={pasteRows} onApply={applyPaste} onClose={() => setPasteRows(null)} />}

      {/* 구글 시트 연동 모달 */}
      {showSheetInput && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-white/90 backdrop-blur-sm" onClick={() => setShowSheetInput(false)}>
          <div className="bg-white border border-gray-200 rounded-2xl p-6 w-[520px] shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-gray-900 font-bold flex items-center gap-2">
                <FileSpreadsheet className="w-5 h-5 text-emerald-600"/> 구글 시트 연동
              </h3>
              <button onClick={() => setShowSheetInput(false)} className="text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
            </div>
            <p className="text-xs text-gray-500 mb-4">
              구글 시트의 공유 링크를 입력하세요.<br/>
              (주의: 비공개 시트인 경우 시트 우측 상단 '공유' 버튼을 눌러 <strong>서비스 계정 이메일</strong>을 뷰어로 추가해 주세요.)
            </p>
            <div className="mb-6 relative">
              <Link className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={sheetUrl}
                onChange={e => setSheetUrl(e.target.value)}
                placeholder="https://docs.google.com/spreadsheets/d/..."
                className="w-full bg-gray-50 border border-gray-200 rounded-lg pl-9 pr-3 py-2.5 text-sm text-gray-900 outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400 transition-all"
                autoFocus
              />
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="ghost" className="text-gray-500" onClick={() => setShowSheetInput(false)}>취소</Button>
              <Button onClick={handleSyncFromSheet} disabled={!sheetUrl || isSyncingSheet} className="bg-emerald-600 text-white hover:bg-emerald-700 w-32 font-semibold">
                {isSyncingSheet ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />불러오는 중...</> : "데이터 가져오기"}
              </Button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
