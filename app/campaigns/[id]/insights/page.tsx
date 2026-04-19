"use client";

import { use, useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { GlassCard } from "@/components/glass-card";
import { Button } from "@/components/ui/button";
import { Plus, Pencil, Trash2, Check, X, ChevronDown, ChevronUp } from "lucide-react";

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

// ── 헬퍼: 성장률 색상 ────────────────────────────────────────────
function growthColor(val: string) {
  if (!val) return "text-white/40";
  const n = parseFloat(val.replace(/[^0-9.-]/g, ""));
  if (val.startsWith("+") || n > 0) return "text-green-400";
  if (val.startsWith("-") || n < 0) return "text-red-400";
  return "text-white/40";
}

// ── 인사이트 카드 ─────────────────────────────────────────────────
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
    <GlassCard className="p-6 group relative overflow-hidden transition-all duration-300 hover:border-white/20">
      {/* 배경 그라디언트 강조 */}
      <div className="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-indigo-500 to-purple-600 rounded-l-xl" />

      <div className="flex items-start justify-between gap-4 pl-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 mb-2">
            <span className="text-xs font-bold text-indigo-400 bg-indigo-500/10 px-2.5 py-1 rounded-full border border-indigo-500/20">
              {insight.weekLabel}
            </span>
          </div>
          <h3 className="text-lg font-bold text-white leading-snug mb-3">
            {insight.headline}
          </h3>
          <p className={`text-sm text-white/60 leading-relaxed ${!expanded ? "line-clamp-3" : ""}`}>
            {insight.body}
          </p>
          {insight.body.length > 120 && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="mt-2 text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1"
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
                <p className="text-[10px] text-white/30 mb-0.5">{insight.kpiLabel || "핵심 지표"}</p>
                <p className={`text-2xl font-bold font-mono ${insight.kpiColor || "text-white"}`}>
                  {insight.kpiValue}
                </p>
              </div>
            )}
            {insight.growthValue && (
              <div>
                <p className="text-[10px] text-white/30 mb-0.5">{insight.growthLabel || "성장률"}</p>
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
            className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white/60 hover:text-white transition-colors"
          >
            <Pencil className="w-3 h-3" />
          </button>
          <button
            onClick={() => onDelete(insight._id)}
            className="p-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 transition-colors"
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
  kpiColor: "text-white",
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="bg-[#111] border border-white/20 rounded-2xl p-6 w-[600px] max-h-[90vh] overflow-y-auto shadow-2xl">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-lg font-bold text-white">인사이트 작성</h3>
          <button onClick={onCancel}>
            <X className="w-5 h-5 text-white/40 hover:text-white" />
          </button>
        </div>

        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-white/40 mb-1 block">주차 라벨 *</label>
              <input
                value={form.weekLabel}
                onChange={(e) => set("weekLabel", e.target.value)}
                placeholder="예: WEEK 1"
                className="w-full bg-white/5 border border-white/15 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-white/40"
              />
            </div>
            <div>
              <label className="text-xs text-white/40 mb-1 block">KPI 색상</label>
              <select
                value={form.kpiColor}
                onChange={(e) => set("kpiColor", e.target.value)}
                className="w-full bg-[#1a1a1a] border border-white/15 rounded-lg px-3 py-2 text-sm text-white outline-none"
              >
                <option value="text-white">흰색</option>
                <option value="text-green-400">초록 (긍정)</option>
                <option value="text-red-400">빨강 (경고)</option>
                <option value="text-indigo-400">인디고 (정보)</option>
                <option value="text-amber-400">노랑 (주의)</option>
              </select>
            </div>
          </div>

          <div>
            <label className="text-xs text-white/40 mb-1 block">헤드라인 *</label>
            <input
              value={form.headline}
              onChange={(e) => set("headline", e.target.value)}
              placeholder="예: 바이럴 확산 속도 예상치 200% 상회"
              className="w-full bg-white/5 border border-white/15 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-white/40"
            />
          </div>

          <div>
            <label className="text-xs text-white/40 mb-1 block">본문 내용 *</label>
            <textarea
              value={form.body}
              onChange={(e) => set("body", e.target.value)}
              rows={4}
              placeholder="이번 주 주요 성과와 시사점을 입력하세요..."
              className="w-full bg-white/5 border border-white/15 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-white/40 resize-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3 border-t border-white/10 pt-4">
            <div>
              <label className="text-xs text-white/40 mb-1 block">핵심 KPI 라벨</label>
              <input
                value={form.kpiLabel}
                onChange={(e) => set("kpiLabel", e.target.value)}
                placeholder="예: 총 조회수"
                className="w-full bg-white/5 border border-white/15 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-white/40"
              />
            </div>
            <div>
              <label className="text-xs text-white/40 mb-1 block">핵심 KPI 값</label>
              <input
                value={form.kpiValue}
                onChange={(e) => set("kpiValue", e.target.value)}
                placeholder="예: 1.2M"
                className="w-full bg-white/5 border border-white/15 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-white/40"
              />
            </div>
            <div>
              <label className="text-xs text-white/40 mb-1 block">성장률 라벨</label>
              <input
                value={form.growthLabel}
                onChange={(e) => set("growthLabel", e.target.value)}
                placeholder="예: 전년 대비"
                className="w-full bg-white/5 border border-white/15 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-white/40"
              />
            </div>
            <div>
              <label className="text-xs text-white/40 mb-1 block">성장률 값</label>
              <input
                value={form.growthValue}
                onChange={(e) => set("growthValue", e.target.value)}
                placeholder="예: +12.5%"
                className="w-full bg-white/5 border border-white/15 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-white/40"
              />
            </div>
          </div>
        </div>

        <div className="flex gap-3 justify-end mt-6 pt-4 border-t border-white/10">
          <Button variant="ghost" className="text-white/50" onClick={onCancel}>취소</Button>
          <Button
            className="bg-white text-black hover:bg-white/80"
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
export default function InsightsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const campaignId = id as Id<"campaigns">;

  const insights = (useQuery(api.insights.getInsights, { campaignId }) ?? []) as Insight[];
  const addInsight = useMutation(api.insights.addInsight);
  const updateInsight = useMutation(api.insights.updateInsight);
  const deleteInsight = useMutation(api.insights.deleteInsight);

  const [editing, setEditing] = useState<Insight | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async (form: FormState) => {
    setIsSaving(true);
    try {
      if (editing) {
        await updateInsight({
          id: editing._id,
          ...form,
          sortOrder: editing.sortOrder,
        });
        setEditing(null);
      } else {
        await addInsight({
          campaignId,
          ...form,
          sortOrder: insights.length,
        });
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

  const sortedInsights = [...insights].sort((a, b) => b.sortOrder - a.sortOrder);

  return (
    <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white">주간 캠페인 인사이트</h2>
          <p className="text-xs text-white/40 mt-1">
            주차별 성과 요약 및 핵심 시사점을 기록합니다
          </p>
        </div>
        <Button
          onClick={() => setIsAdding(true)}
          className="bg-white text-black hover:bg-white/80 gap-2 text-sm"
        >
          <Plus className="w-4 h-4" /> 인사이트 추가
        </Button>
      </div>

      {/* 인사이트 카드 목록 */}
      {sortedInsights.length === 0 ? (
        <GlassCard className="h-64 flex flex-col items-center justify-center gap-3 border-dashed">
          <p className="text-white/30 text-sm">첫 번째 인사이트를 추가해보세요</p>
          <Button
            onClick={() => setIsAdding(true)}
            variant="outline"
            className="border-white/20 text-white/60 gap-2 text-xs"
          >
            <Plus className="w-3.5 h-3.5" /> 새 인사이트 작성
          </Button>
        </GlassCard>
      ) : (
        <div className="flex flex-col gap-4">
          {sortedInsights.map((insight) => (
            <InsightCard
              key={insight._id}
              insight={insight}
              onEdit={setEditing}
              onDelete={handleDelete}
              isAdmin={true}
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
                  weekLabel: editing.weekLabel,
                  headline: editing.headline,
                  body: editing.body,
                  kpiLabel: editing.kpiLabel ?? "",
                  kpiValue: editing.kpiValue ?? "",
                  kpiColor: editing.kpiColor ?? "text-white",
                  growthLabel: editing.growthLabel ?? "전년 대비",
                  growthValue: editing.growthValue ?? "",
                }
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
