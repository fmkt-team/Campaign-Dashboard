import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

// 간트 차트의 개별 행 (태스크) 데이터
export const getGanttTasks = query({
  args: { campaignId: v.id("campaigns") },
  handler: async (ctx, args) => {
    const tasks = await ctx.db
      .query("ganttTasks")
      .withIndex("by_campaign", (q) => q.eq("campaignId", args.campaignId))
      .collect();
    // DB에서 가져온 후 sortOrder를 기준으로 보장된 순서 정렬
    return tasks.sort((a, b) => a.sortOrder - b.sortOrder);
  },
});

// 구글 시트에서 동기화된 태스크 일괄 저장 (오래된 데이터는 삭제 후 재삽입/업데이트)
export const syncGanttFromSheet = mutation({
  args: {
    campaignId: v.id("campaigns"),
    tasks: v.array(
      v.object({
        _id: v.optional(v.id("ganttTasks")), // _id 지원 (UI 상태 유지용)
        category: v.string(),      // 대분류
        subTask: v.string(),       // 업무명 (C열)
        assignee: v.string(),      // 담당자 (E열)
        startDate: v.string(),     // 시작일 (YYYY-MM-DD)
        endDate: v.string(),       // 종료일 (YYYY-MM-DD)
        progress: v.number(),      // 진척도 % (D열)
        sortOrder: v.number(),     // 표시 순서
        color: v.optional(v.string()),
      })
    ),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("ganttTasks")
      .withIndex("by_campaign", (q) => q.eq("campaignId", args.campaignId))
      .collect();

    const incomingIds = new Set(args.tasks.map(t => t._id).filter(Boolean));

    // 기존 데이터 중 새 목록에 없는 아이디는 모두 삭제 (유저가 행 삭제한 경우)
    for (const row of existing) {
      if (!incomingIds.has(row._id)) {
        await ctx.db.delete(row._id);
      }
    }

    // 삽입 또는 업데이트
    for (const task of args.tasks) {
      const { _id, ...rest } = task;
      if (_id && existing.some(e => e._id === _id)) {
        await ctx.db.patch(_id, { ...rest });
      } else {
        await ctx.db.insert("ganttTasks", {
          campaignId: args.campaignId,
          ...rest,
          color: rest.color ?? "#6366f1",
          isManuallyEdited: false,
        });
      }
    }
  },
});

// 개별 태스크 수기 수정
export const updateGanttTask = mutation({
  args: {
    taskId: v.id("ganttTasks"),
    category: v.optional(v.string()),
    subTask: v.optional(v.string()),
    assignee: v.optional(v.string()),
    progress: v.optional(v.number()),
    startDate: v.optional(v.string()),
    endDate: v.optional(v.string()),
    color: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { taskId, ...updates } = args;
    // undefined 필드 제거
    const cleanUpdates = Object.fromEntries(
      Object.entries(updates).filter(([_, v]) => v !== undefined)
    );
    await ctx.db.patch(taskId, { ...cleanUpdates, isManuallyEdited: true });
  },
});
