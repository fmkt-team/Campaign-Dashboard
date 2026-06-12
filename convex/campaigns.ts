import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const getCampaigns = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("campaigns").order("desc").collect();
  },
});

export const getCampaignById = query({
  args: { id: v.id("campaigns") },
  handler: async (ctx, args) => {
    const campaign = await ctx.db.get(args.id);
    return campaign;
  },
});

export const createCampaign = mutation({
  args: {
    name: v.string(),
    brandColor: v.string(),
    startDate: v.string(),
    endDate: v.string(),
    createdBy: v.string(), // Changed to string for MVP
  },
  handler: async (ctx, args) => {
    // Generate simple slug
    const slug = args.name.toLowerCase().replace(/\s+/g, '-');
    const newId = await ctx.db.insert("campaigns", {
      name: args.name,
      slug,
      brandColor: args.brandColor,
      startDate: args.startDate,
      endDate: args.endDate,
      status: "active",
      createdBy: args.createdBy,
    });
    return newId;
  },
});

// 캠페인 기간 수정
export const updateCampaignDates = mutation({
  args: {
    id: v.id("campaigns"),
    startDate: v.string(),
    endDate: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      startDate: args.startDate,
      endDate: args.endDate,
    });
  },
});

// GA4 Property ID 저장
export const updateCampaignGa4Ids = mutation({
  args: {
    id: v.id("campaigns"),
    officialGa4Id: v.optional(v.string()),
    microGa4Id: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const updates: Record<string, any> = {};
    if (args.officialGa4Id !== undefined) updates.officialGa4Id = args.officialGa4Id;
    if (args.microGa4Id !== undefined) updates.microGa4Id = args.microGa4Id;
    await ctx.db.patch(args.id, updates);
  },
});

// KPI 목표 + 탭 설정 업데이트
export const updateCampaignSettings = mutation({
  args: {
    id: v.id("campaigns"),
    kpiTargets: v.optional(v.array(v.object({
      label: v.string(),
      target: v.number(),
      current: v.number(),
      category: v.string(),
      description: v.optional(v.string()),
    }))),
    visibleTabs: v.optional(v.array(v.string())),
    digitalSheetUrl: v.optional(v.string()),
    weeklyMemos: v.optional(v.string()),
    popupDefaultDateFrom: v.optional(v.string()),
    popupDefaultDateTo: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const updates: Record<string, any> = {};
    if (args.kpiTargets !== undefined) updates.kpiTargets = args.kpiTargets;
    if (args.visibleTabs !== undefined) updates.visibleTabs = args.visibleTabs;
    if (args.digitalSheetUrl !== undefined) updates.digitalSheetUrl = args.digitalSheetUrl;
    if (args.weeklyMemos !== undefined) updates.weeklyMemos = args.weeklyMemos;
    if (args.popupDefaultDateFrom !== undefined) updates.popupDefaultDateFrom = args.popupDefaultDateFrom;
    if (args.popupDefaultDateTo !== undefined) updates.popupDefaultDateTo = args.popupDefaultDateTo;
    await ctx.db.patch(args.id, updates);
  },
});

// 네이버 플레이스 URL + 키워드 그룹 저장
export const updateCampaignLinks = mutation({
  args: {
    id: v.id("campaigns"),
    naverPlaceUrl: v.optional(v.string()),
    naverKeywordGroups: v.optional(v.string()), // JSON 문자열
  },
  handler: async (ctx, args) => {
    const updates: Record<string, any> = {};
    if (args.naverPlaceUrl !== undefined) updates.naverPlaceUrl = args.naverPlaceUrl;
    if (args.naverKeywordGroups !== undefined) updates.naverKeywordGroups = args.naverKeywordGroups;
    await ctx.db.patch(args.id, updates);
  },
});

// 이벤트 응답 분석 데이터 저장 (뷰어 공유용)
export const updateInterestResponseData = mutation({
  args: {
    id: v.id("campaigns"),
    interestResponseData: v.optional(v.string()),
    interestResponseSheetUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const updates: Record<string, any> = {};
    if (args.interestResponseData !== undefined) updates.interestResponseData = args.interestResponseData;
    if (args.interestResponseSheetUrl !== undefined) updates.interestResponseSheetUrl = args.interestResponseSheetUrl;
    await ctx.db.patch(args.id, updates);
  },
});
