"use client";

import React, { use, useState, useRef, useCallback, useEffect } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { GlassCard } from "@/components/glass-card";
import { Button } from "@/components/ui/button";
import { Plus, X, Check, ArrowRight, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

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
function DatePopup({ task, onSave, onClose }: {
  task: any; onSave: (id: string, s: string, e: string) => void; onClose: () => void;
}) {
  const [s, setS] = useState(task.startDate || "");
  const [e, setE] = useState(task.endDate   || "");
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}>
      <div className="bg-[#111] border border-white/20 rounded-2xl p-6 w-72 shadow-2xl"
        onClick={ev => ev.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-white text-sm font-semibold truncate">{task.subTask || "기간 편집"}</h3>
          <button onClick={onClose} className="text-white/40 hover:text-white ml-2 shrink-0"><X className="w-4 h-4" /></button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-white/50 block mb-1">시작일</label>
            <input type="date" value={s} onChange={v => setS(v.target.value)}
              className="w-full bg-white/5 border border-white/15 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-white/30" />
          </div>
          <div>
            <label className="text-xs text-white/50 block mb-1">종료일</label>
            <input type="date" value={e} onChange={v => setE(v.target.value)}
              className="w-full bg-white/5 border border-white/15 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-white/30" />
          </div>
        </div>
        <div className="flex gap-2 mt-4">
          <Button variant="ghost" size="sm" className="flex-1 text-white/50 hover:bg-white/5" onClick={onClose}>취소</Button>
          <Button size="sm" className="flex-1 bg-white text-black hover:bg-white/80"
            onClick={() => { onSave(task._id, s, e); onClose(); }}>
            <Check className="w-3.5 h-3.5 mr-1" />저장
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── 드래그 간트 바 ──────────────────────────────────────────────────────────
function GanttBar({ task, chartStartTs, totalDays, containerW, rowH, barColor, onSave, onClickEdit, onClear }: {
  task: any; chartStartTs: number; totalDays: number; containerW: number;
  rowH: number; barColor: string;
  onSave: (id: string, s: string, e: string) => void;
  onClickEdit: (task: any) => void;
  onClear: (id: string) => void;
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
      else if (mode === "move") onClickEdit(task);
      window.removeEventListener("mousemove", mv);
      window.removeEventListener("mouseup", up);
    };
    window.addEventListener("mousemove", mv);
    window.addEventListener("mouseup", up);
  }, [pxDay, task, onSave, onClickEdit]);

  return (
    <div className="absolute top-1/2 -translate-y-1/2 rounded-lg cursor-grab select-none group/b"
      style={{ left: leftPx, width: widthPx, height: rowH - 10, backgroundColor: barColor }}
      onMouseDown={e => drag(e, "move")}
    >
      <div className="absolute left-0 top-0 h-full w-2.5 cursor-ew-resize rounded-l-lg flex items-center justify-center opacity-0 group-hover/b:opacity-100 transition-opacity bg-black/20"
        onMouseDown={e => drag(e, "left")}><div className="w-0.5 h-4 bg-white/70 rounded-full" /></div>

      {/* 날짜 텍스트 - 바 너비가 충분하면 내부, 좁으면 외부(오른쪽)에 표시 */}
      {widthPx >= 64 ? (
        <div className="absolute inset-0 flex items-center justify-center px-3 pointer-events-none">
          <span className="text-xs text-white font-medium truncate">{fmtMD(ls)} ~ {fmtMD(le)}</span>
        </div>
      ) : (
        <div className="absolute top-1/2 -translate-y-1/2 pointer-events-none whitespace-nowrap"
          style={{ left: widthPx + 6 }}>
          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded"
            style={{ backgroundColor: barColor + "dd", color: "white" }}>
            {fmtMD(ls)}{ls !== le ? ` ~ ${fmtMD(le)}` : ""}
          </span>
        </div>
      )}

      {/* 진척도 바 */}
      {task.progress > 0 && (
        <div className="absolute left-0 top-0 h-full rounded-lg bg-black/20 pointer-events-none"
          style={{ width: `${task.progress}%` }} />
      )}
      <div className="absolute right-0 top-0 h-full w-2.5 cursor-ew-resize rounded-r-lg flex items-center justify-center opacity-0 group-hover/b:opacity-100 transition-opacity bg-black/20"
        onMouseDown={e => drag(e, "right")}><div className="w-0.5 h-4 bg-white/70 rounded-full" /></div>
      {/* X 삭제 버튼 - 막대 위에 호버 시 표시 */}
      <button
        onMouseDown={e => e.stopPropagation()}
        onClick={(e) => { e.stopPropagation(); onClear(task._id); }}
        className="absolute -top-2 -right-2 z-30 opacity-0 group-hover/b:opacity-100 transition-opacity w-4 h-4 rounded-full bg-black/80 border border-white/20 flex items-center justify-center text-white/60 hover:text-red-400 hover:border-red-400/60"
        title="날짜 초기화">
        <X className="w-2.5 h-2.5" />
      </button>
    </div>
  );
}

// ─── 인라인 편집 ─────────────────────────────────────────────────────────────
function InlineEdit({ value, onSave, onEnter, placeholder, className }: {
  value: string; onSave: (v: string) => void; onEnter?: () => void;
  placeholder?: string; className?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const spanRef = useRef<HTMLSpanElement>(null);

  const commit = () => { onSave(draft); setEditing(false); };
  
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") { commit(); onEnter?.(); }
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

  if (editing) return (
    <div className="w-full relative flex-1">
      <span ref={spanRef} className="inline-edit-trigger hidden" />
      <input autoFocus value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={handleKeyDown}
        className={cn("w-full bg-white/10 border border-white/25 rounded px-2 py-0.5 text-xs outline-none text-white", className)}
      />
    </div>
  );
  return (
    <span ref={spanRef} onClick={() => { setDraft(value); setEditing(true); }}
      className={cn("inline-edit-trigger cursor-text block flex-1 rounded px-2 py-0.5 hover:bg-white/10 text-xs truncate min-h-[22px]", !value && "text-white/25 italic", className)}>
      {value || placeholder}
    </span>
  );
}

// ─── 붙여넣기 프리뷰 모달 ───────────────────────────────────────────────────
function PasteModal({ rows, onApply, onClose }: {
  rows: PastedRow[]; onApply: () => void; onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={onClose}>
      <div className="bg-[#111] border border-white/20 rounded-2xl p-6 w-[520px] max-h-[70vh] flex flex-col shadow-2xl"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-white font-semibold">{rows.length}개 항목 감지됨</h3>
          <button onClick={onClose} className="text-white/40 hover:text-white"><X className="w-4 h-4" /></button>
        </div>
        <div className="overflow-y-auto flex-1 space-y-1 mb-4">
          {rows.map((r, i) => (
            <div key={i} className="flex gap-2 items-center bg-white/5 rounded-lg px-3 py-2 text-xs">
              <span className="text-white/40 w-20 shrink-0 truncate">{r.category}</span>
              <span className="text-white flex-1 truncate">{r.subTask}</span>
              <span className="text-white/50 font-mono w-10 text-right">{r.progress}%</span>
              <span className="text-white/40 font-mono whitespace-nowrap">
                {r.startDate ? fmtMD(r.startDate) : "—"} ~ {r.endDate ? fmtMD(r.endDate) : "—"}
              </span>
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" className="flex-1 text-white/50" onClick={onClose}>취소</Button>
          <Button size="sm" className="flex-1 bg-white text-black hover:bg-white/80" onClick={onApply}>
            <Check className="w-3.5 h-3.5 mr-1.5" />타임라인에 추가
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── 메인 ────────────────────────────────────────────────────────────────────
const ROW_H   = 44;
const CAT_H   = 34;
const LABEL_W = 340;

export default function TimelinePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const campaignId = id as Id<"campaigns">;

  const campaign   = useQuery(api.campaigns.getCampaignById, { id: campaignId });
  const ganttTasks = useQuery(api.gantt.getGanttTasks, { campaignId });
  const syncGantt  = useMutation(api.gantt.syncGanttFromSheet);
  const updateTask = useMutation(api.gantt.updateGanttTask);

  const chartRef = useRef<HTMLDivElement>(null);
  const [chartW, setChartW] = useState(1200);
  const [editBar, setEditBar] = useState<any | null>(null);
  const [pasteRows, setPasteRows] = useState<PastedRow[] | null>(null);

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

  // 캠페인 단계 (Phases)
  const phases = useQuery(api.phases.getPhases, { campaignId });
  const upsertPhase = useMutation(api.phases.upsertPhase);
  const deletePhase = useMutation(api.phases.deletePhase);

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
  const dynamicChartMin = Math.max(900, totalDays * 12); // 일당 12px 수준으로 촘촘하게 줄여 한 화면에 약 3개월(90일*12px=1080px) 이상 눈에 들어오도록 조정

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
  const avgProgress = totalTasks ? Math.round(allTasks.reduce((s, t) => s + t.progress, 0) / totalTasks) : 0;

  // 카테고리별 그룹핑 + 순서 보존
  const grouped: { category: string; color: string; tasks: typeof allTasks }[] = [];
  const seen = new Map<string, typeof allTasks>();
  for (const t of allTasks) {
    const key = t.category || "미분류";
    if (!seen.has(key)) { seen.set(key, []); grouped.push({ category: key, color: pickColor(key), tasks: seen.get(key)! }); }
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
    const newTask = { category, subTask: "", assignee: "", progress: 0, startDate: chartStart, endDate: chartStart, sortOrder: totalTasks, color: pickColor(category) };
    await syncGantt({ campaignId, tasks: [...serialize(allTasks), newTask] });
  };

  // 새 대분류 추가
  const addCategory = async () => {
    const category = "새 대분류";
    const newTask = { category, subTask: "새 업무", assignee: "", progress: 0, startDate: chartStart, endDate: chartStart, sortOrder: totalTasks, color: pickColor(category) };
    await syncGantt({ campaignId, tasks: [...serialize(allTasks), newTask] });
  };

  // 막대 저장
  const handleBarSave = useCallback(async (taskId: string, s: string, e: string) => {
    await updateTask({ taskId: taskId as Id<"ganttTasks">, startDate: s, endDate: e });
  }, [updateTask]);

  // 막대 날짜 삭제 (날짜 비우기)
  const handleBarClear = async (taskId: Id<"ganttTasks">) => {
    await updateTask({ taskId, startDate: "", endDate: "" });
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
    const remaining = serialize(allTasks.filter(t => t.category !== cat));
    await syncGantt({ campaignId, tasks: remaining });
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
    const newTask = { category: newCat, subTask: "새 업무", assignee: "", progress: 0, startDate: chartStart, endDate: chartStart, sortOrder: 0, color: pickColor(newCat), _id: "temp" as any };
    
    newGrouped.splice(insertIdx, 0, { category: newCat, color: pickColor(newCat), tasks: [newTask] });
    
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

  // 전역 Ctrl+V 감지 (입력창 제외)
  useEffect(() => {
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
  }, [year]);

  return (
    <div className="flex flex-col gap-8 animate-in fade-in slide-in-from-bottom-4 duration-500">

      {/* D-DAY 배너 */}
      <div className="flex gap-4">
        <GlassCard className="flex-1 flex items-center justify-between p-6">
          <div>
            <p className="text-xs text-white/50 mb-1 font-mono uppercase tracking-widest">Campaign Status</p>
            {campaign ? (
              <div className="flex items-baseline gap-3">
                <span className="text-5xl font-bold font-mono text-white">{formatDDay(campaign.startDate)}</span>
                {campaign.endDate && diffDays(todayStr, campaign.endDate) >= 0 && (
                  <span className="text-sm border border-white/20 bg-white/10 text-white/70 rounded-full px-3 py-1 font-mono">
                    종료까지 {diffDays(todayStr, campaign.endDate)}일
                  </span>
                )}
              </div>
            ) : <span className="text-white/30">로딩 중...</span>}
            <p className="text-xs text-white/30 mt-2 font-mono">{campaign?.startDate} ~ {campaign?.endDate || "미정"}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-white/40 mb-1">Today</p>
            <p className="text-xl font-mono text-white/70">{todayStr.replace(/-/g, ".")}</p>
          </div>
        </GlassCard>
        {totalTasks > 0 && (
          <GlassCard className="min-w-[180px] flex flex-col justify-center p-6">
            <p className="text-xs text-white/50 mb-3">전체 진행률</p>
            <p className="text-4xl font-bold font-mono text-white mb-2">{avgProgress}%</p>
            <div className="w-full h-1.5 rounded-full bg-white/10">
              <div className="h-full rounded-full bg-white transition-all" style={{ width: `${avgProgress}%` }} />
            </div>
          </GlassCard>
        )}
      </div>

      {/* ── 캠페인 단계 (Phases) ── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-bold text-white">캠페인 단계 (Phases)</h2>
          <div className="flex items-center gap-2">
            <input type="file" accept="image/*" className="hidden" ref={fileInputRef} onChange={handleExtractPhases} />
            <Button 
              onClick={() => fileInputRef.current?.click()} 
              size="sm" 
              disabled={isExtracting}
              className="bg-indigo-600 hover:bg-indigo-700 text-white gap-2 border-0"
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
              className="bg-white/10 text-white hover:bg-white/20 gap-2 border border-white/20"
            >
              <Plus className="w-4 h-4" /> 단계 추가
            </Button>
          </div>
        </div>

        <div className="flex gap-4 overflow-x-auto pb-4">
          {(phases ?? []).map((phase, idx) => (
            <React.Fragment key={phase._id}>
              {/* 단계 카드 */}
              <GlassCard className="min-w-[280px] p-6 relative group border border-white/10">
                <button
                  onClick={() => deletePhase({ id: phase._id })}
                  className="absolute top-3 right-3 text-white/30 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
                <div className="text-center mb-6">
                  <InlineEdit
                    value={phase.title}
                    placeholder="Phase 1"
                    onSave={v => upsertPhase({ 
                      id: phase._id, campaignId: phase.campaignId, title: v, 
                      subtitle: phase.subtitle, sortOrder: phase.sortOrder, 
                      color: phase.color, items: phase.items 
                    })}
                    className="text-sm tracking-widest text-white/60 uppercase font-mono mb-1 text-center"
                  />
                  <InlineEdit
                    value={phase.subtitle}
                    placeholder="목표 입력"
                    onSave={v => upsertPhase({ 
                      id: phase._id, campaignId: phase.campaignId, title: phase.title, 
                      subtitle: v, sortOrder: phase.sortOrder, 
                      color: phase.color, items: phase.items 
                    })}
                    className="text-lg font-bold text-white text-center"
                  />
                </div>

                <div className="space-y-3">
                  {phase.items.map((item, iOffset) => (
                    <div
                      key={iOffset}
                      className={cn(
                        "p-4 rounded-xl border relative group/item transition-colors",
                        item.isHighlighted
                          ? "bg-indigo-500/10 border-indigo-500/30"
                          : "bg-white/5 border-white/10"
                      )}
                    >
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
                        className="absolute top-2 right-2 text-white/20 hover:text-red-400 opacity-0 group-hover/item:opacity-100"
                      >
                        <X className="w-3 h-3" />
                      </button>
                      <div
                        className="cursor-pointer mb-1 w-full"
                        onDoubleClick={() => {
                          const newItems = [...phase.items];
                          newItems[iOffset].isHighlighted = !newItems[iOffset].isHighlighted;
                          upsertPhase({
                            id: phase._id, campaignId: phase.campaignId, title: phase.title,
                            subtitle: phase.subtitle, sortOrder: phase.sortOrder,
                            color: phase.color, items: newItems
                          });
                        }}
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
                          className={cn(
                            "font-bold text-base",
                            item.isHighlighted ? "text-indigo-400" : "text-white/90"
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
                        className="text-sm text-white/50"
                      />
                    </div>
                  ))}
                  
                  <button
                    onClick={() => {
                      const newItems = [...phase.items, { name: "추가 항목", description: "세부 내용" }];
                      upsertPhase({
                        id: phase._id, campaignId: phase.campaignId, title: phase.title,
                        subtitle: phase.subtitle, sortOrder: phase.sortOrder,
                        color: phase.color, items: newItems
                      });
                    }}
                    className="w-full py-2 flex items-center justify-center border border-dashed border-white/20 rounded-xl text-white/30 hover:text-white/60 hover:bg-white/5 transition-colors text-sm"
                  >
                    <Plus className="w-3.5 h-3.5 mr-1" /> 항목 추가
                  </button>
                </div>
              </GlassCard>

              {/* 화살표 */}
              {idx < phases!.length - 1 && (
                <div className="flex items-center justify-center shrink-0 w-8">
                  <ArrowRight className="w-6 h-6 text-white/20" />
                </div>
              )}
            </React.Fragment>
          ))}
          {phases?.length === 0 && (
            <div className="text-white/30 text-sm py-12 text-center w-full border border-dashed border-white/20 rounded-2xl">
              [+ 단계 추가] 버튼을 눌러 캠페인 구조도를 작성해보세요.
            </div>
          )}
        </div>
      </div>

      {/* 간트 차트 */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-lg font-bold text-white">채널별 업무 타임라인</h2>
            <p className="text-xs text-white/40 mt-0.5">
              셀 클릭으로 편집 · Enter로 다음 행 추가 · 막대 드래그로 기간 조절 · 
              <kbd className="ml-1 bg-white/10 px-1.5 py-0.5 rounded text-white/60 font-mono">Ctrl+V</kbd>로 스프레드시트 붙여넣기
            </p>
          </div>
          <div className="flex items-center gap-4">
            <Button onClick={addCategory} size="sm"
              className="bg-white text-black hover:bg-white/80 gap-2 font-semibold ml-2">
              <Plus className="w-4 h-4" /> 대분류 추가
            </Button>
          </div>
        </div>

        <GlassCard className="p-0 overflow-hidden">
          <div className="overflow-auto" style={{ maxHeight: "72vh", scrollbarWidth: "thin", scrollbarColor: "rgba(255,255,255,0.15) transparent" }}>
            <div style={{ minWidth: LABEL_W + dynamicChartMin }}>

              {/* 날짜 헤더 */}
              <div className="flex border-b border-white/10 bg-[#0d0d0d] sticky top-0 z-20">
                <div style={{ minWidth: LABEL_W, width: LABEL_W }}
                  className="px-4 py-2 flex items-end border-r border-white/10">
                  <span className="text-xs text-white/40 uppercase tracking-wider">업무</span>
                </div>
                <div ref={chartRef} className="relative flex-1 h-10" style={{ minWidth: dynamicChartMin }}>
                  {/* 왼쪽 끝 + 버튼 (이전 월 추가) */}
                  <button
                    onClick={() => setExtraStartMonths(p => p + 1)}
                    className="absolute left-0 top-0 h-full w-8 flex items-center justify-center z-20 text-white/30 hover:text-white hover:bg-white/10 transition-all"
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
                            className="text-xs text-white/25 pl-2 hover:text-red-400 transition-colors flex items-center gap-1"
                            title="이 달 제거">
                            {label}
                            <X className="w-2.5 h-2.5 opacity-0 group-hover/tick:opacity-100" />
                          </button>
                        ) : (
                          <span className="text-xs text-white/40 pl-2">{label}</span>
                        )}
                      </div>
                    );
                  })}
                  {/* 오른쪽 끝 + 버튼 (이후 월 추가) */}
                  <button
                    onClick={() => setExtraEndMonths(p => p + 1)}
                    className="absolute right-0 top-0 h-full w-8 flex items-center justify-center z-20 text-white/30 hover:text-white hover:bg-white/10 transition-all"
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
                  <p className="text-white/30 text-sm">업무가 없습니다. 대분류를 추가하거나 스프레드시트를 붙여넣기하세요.</p>
                  <p className="text-white/20 text-xs">
                    <kbd className="bg-white/10 px-1.5 py-0.5 rounded font-mono">Ctrl+V</kbd> 로 스프레드시트 내용 붙여넣기 가능
                  </p>
                </div>
              )}

              {/* 카테고리 그룹 */}
              {grouped.map(({ category, color, tasks }, catIdx) => {
                const isDragOverCategory = dragOverItem?.type === "category" && dragOverItem.id === category;
                return (
                <React.Fragment key={category}>

                  {/* 대분류 헤더 행 */}
                  <div className={cn("flex items-center border-b border-white/5 sticky group/cat transition-all select-none", isDragOverCategory && "border-t-2 border-t-white")}
                    style={{ top: 40, height: CAT_H, zIndex: 15, backgroundColor: color + "22" }}
                    draggable
                    onDragStart={(e) => { e.dataTransfer.effectAllowed = "move"; setDragItem({ type: "category", id: category }); }}
                    onDragOver={(e) => { e.preventDefault(); setDragOverItem({ type: "category", id: category }); }}
                    onDragEnd={handleDragEnd}
                    onDrop={(e) => { e.preventDefault(); handleDragEnd(); }}
                  >
                    <div style={{ minWidth: LABEL_W, width: LABEL_W }}
                      className="flex items-center gap-2 px-4 border-r border-white/10 h-full cursor-grab active:cursor-grabbing">
                      <div className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: color }} />
                      <InlineEdit
                        value={category}
                        placeholder="대분류명"
                        onSave={async v => {
                          const updated = serialize(allTasks).map(t =>
                            t.category === category ? { ...t, category: v, color: pickColor(v) } : t
                          );
                          await syncGantt({ campaignId, tasks: updated });
                        }}
                        onEnter={() => addSubTask(category)}
                        className="text-white font-semibold text-xs flex-1"
                      />
                      <button onClick={() => handleAddCategoryRelative(catIdx, 0)} className="opacity-0 group-hover/cat:opacity-100 transition-opacity shrink-0 p-1 rounded text-white/30 hover:text-indigo-400" title="위에 대분류 추가">
                        <Plus className="w-3 h-3" />
                      </button>
                      <button onClick={() => handleAddCategoryRelative(catIdx, 1)} className="opacity-0 group-hover/cat:opacity-100 transition-opacity shrink-0 p-1 rounded text-white/30 hover:text-indigo-400" title="아래에 대분류 추가">
                        <Plus className="w-3 h-3" />
                      </button>
                      <button onClick={() => handleDeleteCategory(category)} className="opacity-0 group-hover/cat:opacity-100 transition-opacity shrink-0 p-1 rounded text-white/30 hover:text-red-400" title="대분류 삭제">
                        <Trash2 className="w-3 h-3" />
                      </button>
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
                  {tasks.map((task) => {
                    const isDragOverTask = dragOverItem?.type === "task" && dragOverItem.id === task._id;
                    return (
                    <div key={task._id} className={cn("flex border-b border-white/5 hover:bg-white/3 group/row transition-all select-none", isDragOverTask && "border-t-2 border-t-white")}
                      style={{ height: ROW_H }}
                      draggable
                      onDragStart={(e) => { e.dataTransfer.effectAllowed = "move"; setDragItem({ type: "task", id: task._id }); e.stopPropagation(); }}
                      onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setDragOverItem({ type: "task", id: task._id }); }}
                      onDragEnd={(e) => { e.stopPropagation(); handleDragEnd(); }}
                      onDrop={(e) => { e.preventDefault(); e.stopPropagation(); handleDragEnd(); }}
                    >

                      {/* 소분류 라벨 */}
                      <div style={{ minWidth: LABEL_W, width: LABEL_W }}
                        className="flex items-center pl-8 pr-2 border-r border-white/5 h-full gap-1 overflow-hidden cursor-grab active:cursor-grabbing">
                        <div className="w-0.5 h-4 rounded-full shrink-0 opacity-30" style={{ backgroundColor: color }} />
                        <InlineEdit
                          value={task.subTask}
                          placeholder="소분류 / 업무명"
                          onSave={v => updateTask({ taskId: task._id, subTask: v })}
                          onEnter={() => addSubTask(category)}
                          className="text-white/80 flex-1"
                        />
                        {/* 삭제 버튼 */}
                        <button
                          onClick={() => handleDelete(task._id)}
                          className="opacity-0 group-hover/row:opacity-100 transition-opacity shrink-0 p-1 rounded text-white/30 hover:text-red-400"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>

                      {/* 간트 바 영역 */}
                      <div className="relative flex-1" style={{ height: ROW_H, minWidth: dynamicChartMin }}>
                        {monthTicks.map(({ label, pct }) => (
                          <div key={label} className="absolute top-0 bottom-0 w-px bg-white/5" style={{ left: `${pct}%` }} />
                        ))}
                        <div className="absolute top-0 bottom-0 w-px bg-red-400/25 pointer-events-none" style={{ left: `${todayPct}%` }} />
                        {task.startDate && task.endDate ? (
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
                          />
                        ) : (
                          // 빈 행: 클릭하면 그 날짜에 7일 막대 생성
                          <div
                            onClick={(e) => handleEmptyRowClick(task, e)}
                            className="absolute inset-0 flex items-center pl-4 text-xs text-white/0 hover:text-white/30 hover:bg-white/3 transition-colors cursor-crosshair group/empty"
                          >
                            <span className="opacity-0 group-hover/empty:opacity-100 transition-opacity select-none">클릭하여 일정 추가</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )})}

                  {/* 소분류 추가 버튼 */}
                  <div className="flex border-b border-white/5">
                    <div style={{ minWidth: LABEL_W, width: LABEL_W }}
                      className="border-r border-white/5">
                      <button onClick={() => addSubTask(category)}
                        className="w-full pl-8 py-2 text-xs text-white/25 hover:text-white/50 hover:bg-white/5 transition-colors text-left flex items-center gap-1">
                        <Plus className="w-3 h-3" /> 소분류 추가
                      </button>
                    </div>
                    <div className="flex-1" />
                  </div>
                </React.Fragment>
              )})}

              {/* 대분류 추가 */}
              {totalTasks > 0 && (
                <button onClick={addCategory}
                  className="w-full py-3 text-sm text-white/25 hover:text-white/50 hover:bg-white/5 transition-colors flex items-center justify-center gap-2">
                  <Plus className="w-4 h-4" /> 대분류 추가
                </button>
              )}
            </div>
          </div>
        </GlassCard>
      </div>

      {/* 날짜 편집 팝업 */}
      {editBar && <DatePopup task={editBar} onSave={handleBarSave} onClose={() => setEditBar(null)} />}

      {/* 붙여넣기 확인 모달 */}
      {pasteRows && <PasteModal rows={pasteRows} onApply={applyPaste} onClose={() => setPasteRows(null)} />}
    </div>
  );
}
