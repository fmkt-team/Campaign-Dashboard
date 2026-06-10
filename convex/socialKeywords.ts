import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// ── 키워드 조회 ─────────────────────────────────────────────────
export const getSocialKeywords = query({
  args: { campaignId: v.id("campaigns") },
  handler: async (ctx, args) => {
    return ctx.db
      .query("socialKeywords")
      .withIndex("by_campaign", q => q.eq("campaignId", args.campaignId))
      .order("desc")
      .collect();
  },
});

// ── 키워드 추가 ─────────────────────────────────────────────────
export const addSocialKeyword = mutation({
  args: {
    campaignId: v.id("campaigns"),
    keyword: v.string(),
    platforms: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    // 중복 방지
    const existing = await ctx.db
      .query("socialKeywords")
      .withIndex("by_campaign", q => q.eq("campaignId", args.campaignId))
      .collect();
    if (existing.some(k => k.keyword === args.keyword)) return null;
    return ctx.db.insert("socialKeywords", {
      campaignId: args.campaignId,
      keyword: args.keyword,
      platforms: args.platforms,
      createdAt: Date.now(),
    });
  },
});

// ── 키워드 삭제 (연결된 게시물도 함께 삭제) ────────────────────
export const deleteSocialKeyword = mutation({
  args: { keywordId: v.id("socialKeywords") },
  handler: async (ctx, args) => {
    const kw = await ctx.db.get(args.keywordId);
    if (!kw) return;
    // 연결 게시물 삭제
    const posts = await ctx.db
      .query("socialPosts")
      .withIndex("by_campaign_keyword", q =>
        q.eq("campaignId", kw.campaignId).eq("keyword", kw.keyword)
      )
      .collect();
    for (const p of posts) await ctx.db.delete(p._id);
    await ctx.db.delete(args.keywordId);
  },
});

// ── 게시물 저장 (upsert — 동일 URL이면 업데이트) ───────────────
export const upsertSocialPosts = mutation({
  args: {
    campaignId: v.id("campaigns"),
    keyword: v.string(),
    posts: v.array(v.object({
      platform:     v.string(),
      postUrl:      v.string(),
      text:         v.string(),
      author:       v.string(),
      authorHandle: v.optional(v.string()),
      date:         v.string(),
      likes:        v.number(),
      replies:      v.number(),
      reposts:      v.optional(v.number()),
      views:        v.optional(v.number()),
      thumbnailUrl: v.optional(v.string()),
    })),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("socialPosts")
      .withIndex("by_campaign_keyword", q =>
        q.eq("campaignId", args.campaignId).eq("keyword", args.keyword)
      )
      .collect();
    const existingUrlMap = new Map(existing.map(p => [p.postUrl, p._id]));

    for (const post of args.posts) {
      const now = Date.now();
      if (existingUrlMap.has(post.postUrl)) {
        await ctx.db.patch(existingUrlMap.get(post.postUrl)!, { ...post, fetchedAt: now });
      } else {
        await ctx.db.insert("socialPosts", {
          campaignId: args.campaignId,
          keyword: args.keyword,
          ...post,
          fetchedAt: now,
        });
      }
    }
  },
});

// ── 게시물 조회 ─────────────────────────────────────────────────
export const getSocialPosts = query({
  args: {
    campaignId: v.id("campaigns"),
    keyword:    v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (args.keyword) {
      return ctx.db
        .query("socialPosts")
        .withIndex("by_campaign_keyword", q =>
          q.eq("campaignId", args.campaignId).eq("keyword", args.keyword!)
        )
        .order("desc")
        .collect();
    }
    return ctx.db
      .query("socialPosts")
      .withIndex("by_campaign", q => q.eq("campaignId", args.campaignId))
      .order("desc")
      .collect();
  },
});

// ── 게시물 단건 삭제 ────────────────────────────────────────────
export const deleteSocialPost = mutation({
  args: { postId: v.id("socialPosts") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.postId);
  },
});
