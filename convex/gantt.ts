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

// 개별 태스크 삽입 (경합 방지용)
export const insertGanttTask = mutation({
  args: {
    campaignId: v.id("campaigns"),
    category: v.string(),
    subTask: v.string(),
    assignee: v.string(),
    progress: v.number(),
    startDate: v.string(),
    endDate: v.string(),
    sortOrder: v.number(),
    color: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("ganttTasks", {
      ...args,
      isManuallyEdited: true,
    });
  },
});

// 대분류 통째로 삭제
export const deleteGanttCategory = mutation({
  args: {
    campaignId: v.id("campaigns"),
    category: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("ganttTasks")
      .withIndex("by_campaign", (q) => q.eq("campaignId", args.campaignId))
      .collect();
    
    for (const row of existing) {
      if (row.category === args.category) {
        await ctx.db.delete(row._id);
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
    note: v.optional(v.string()),
    barLabel: v.optional(v.string()),
    activities: v.optional(v.array(v.object({
      id: v.string(),
      name: v.string(),
      startDate: v.string(),
      endDate: v.string(),
      progress: v.number(),
      color: v.optional(v.string()),
    }))),
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

// 그래프/차트 추가
export const addGraphToTask = mutation({
  args: {
    taskId: v.id("ganttTasks"),
    title: v.string(),
    type: v.string(), // 'line' | 'bar' | 'area' | 'pie'
    description: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
    data: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.taskId);
    if (!task) throw new Error("Task not found");

    const graphId = `graph-${Date.now()}`;
    const newGraph = {
      id: graphId,
      title: args.title,
      type: args.type,
      description: args.description,
      imageUrl: args.imageUrl,
      data: args.data,
      createdAt: Date.now(),
    };

    const graphs = task.graphs || [];
    graphs.push(newGraph);

    await ctx.db.patch(args.taskId, { graphs });
  },
});

// 그래프 제거
export const removeGraphFromTask = mutation({
  args: {
    taskId: v.id("ganttTasks"),
    graphId: v.string(),
  },
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.taskId);
    if (!task) throw new Error("Task not found");

    const graphs = (task.graphs || []).filter((g: any) => g.id !== args.graphId);
    await ctx.db.patch(args.taskId, { graphs });
  },
});

// 그래프 업데이트
export const updateGraph = mutation({
  args: {
    taskId: v.id("ganttTasks"),
    graphId: v.string(),
    title: v.optional(v.string()),
    type: v.optional(v.string()),
    description: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
    data: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { taskId, graphId, ...updates } = args;
    const task = await ctx.db.get(taskId);
    if (!task) throw new Error("Task not found");

    const graphs = (task.graphs || []).map((g: any) => {
      if (g.id === graphId) {
        return {
          ...g,
          ...Object.fromEntries(
            Object.entries(updates).filter(([_, v]) => v !== undefined)
          ),
        };
      }
      return g;
    });

    await ctx.db.patch(taskId, { graphs });
  },
});
