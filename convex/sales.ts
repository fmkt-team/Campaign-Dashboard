import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

// ─── 주차별 매출 조회 ───────────────────────────────────────────
export const getSalesWeekly = query({
  args: { campaignId: v.id("campaigns") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("salesWeekly")
      .withIndex("by_campaign", (q) => q.eq("campaignId", args.campaignId))
      .order("asc")
      .collect();
  },
});

// ─── 주차별 매출 동기화 (기존 데이터 교체) ─────────────────────
export const syncSalesWeekly = mutation({
  args: {
    campaignId: v.id("campaigns"),
    rows: v.array(
      v.object({
        productName: v.string(),   // 제품명
        weekLabel: v.string(),     // 주차 라벨 (예: "25W1")
        revenue2025: v.number(),   // 전년도 수주액
        revenue2026: v.number(),   // 금년도 수주액
      })
    ),
  },
  handler: async (ctx, args) => {
    // 기존 해당 캠페인 데이터 전체 삭제
    const existing = await ctx.db
      .query("salesWeekly")
      .withIndex("by_campaign", (q) => q.eq("campaignId", args.campaignId))
      .collect();
    for (const row of existing) await ctx.db.delete(row._id);

    // 새 데이터 삽입
    for (const row of args.rows) {
      await ctx.db.insert("salesWeekly", {
        campaignId: args.campaignId,
        ...row,
      });
    }
  },
});
