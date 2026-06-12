import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const createShareLink = mutation({
  args: {
    campaignId: v.id("campaigns"),
    expiresInDays: v.number(), // 0 = 영구 (만료 없음)
    createdBy: v.string(),
  },
  handler: async (ctx, args) => {
    const token = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    // expiresInDays=0이면 expiresAt=0으로 저장 → 만료 체크 스킵
    const expiresAt = args.expiresInDays > 0
      ? Date.now() + args.expiresInDays * 24 * 60 * 60 * 1000
      : 0;

    await ctx.db.insert("shareLinks", {
      campaignId: args.campaignId,
      token,
      expiresAt,
      createdBy: args.createdBy,
    });

    return token;
  },
});

export const validateToken = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const shareLink = await ctx.db
      .query("shareLinks")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .first();

    if (!shareLink) {
      return { status: "not_found" };
    }

    // expiresAt=0이면 영구 링크 (만료 체크 스킵)
    if (shareLink.expiresAt > 0 && Date.now() > shareLink.expiresAt) {
      return { status: "expired" };
    }

    const campaign = await ctx.db.get(shareLink.campaignId);
    if (!campaign) {
      return { status: "not_found" };
    }

    return { status: "valid", campaign };
  },
});
