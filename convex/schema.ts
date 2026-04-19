import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  users: defineTable({
    email: v.optional(v.string()), // Added optional to prevent legacy data clash
    passwordHash: v.optional(v.string()),
    role: v.optional(v.string()), // Changed from literal to string
    createdAt: v.optional(v.number()),
    // Legacy fields from old project existing in DB:
    brand: v.optional(v.string()),
    displayName: v.optional(v.string()),
    isActive: v.optional(v.boolean()),
    username: v.optional(v.string()),
  }).index("by_email", ["email"]),

  campaigns: defineTable({
    name: v.string(),
    slug: v.string(),
    brandColor: v.string(),
    startDate: v.string(),
    endDate: v.string(),
    status: v.union(v.literal("active"), v.literal("completed")),
    createdBy: v.string(),
  }),

  milestones: defineTable({
    campaignId: v.id("campaigns"),
    title: v.string(),
    date: v.string(),
    color: v.string(),
    isCompleted: v.boolean(),
  }).index("by_campaign", ["campaignId"]),

  timelineActivities: defineTable({
    campaignId: v.id("campaigns"),
    label: v.string(),
    startDate: v.string(),
    endDate: v.string(),
    color: v.string(),
  }).index("by_campaign", ["campaignId"]),

  digitalKpis: defineTable({
    campaignId: v.id("campaigns"),
    medium: v.string(),
    spend: v.number(),
    impressions: v.number(),
    views: v.number(),
    clicks: v.number(),
    cpv: v.number(),
    ctr: v.number(),
    vtr: v.number(),
    date: v.string(),
    recordedAt: v.number(),
  }).index("by_campaign", ["campaignId"]),

  youtubeVideos: defineTable({
    campaignId: v.id("campaigns"),
    youtubeId: v.string(),
    title: v.string(),
    thumbnailUrl: v.string(),
    views: v.number(),
    likes: v.number(),
    comments: v.number(),
    likeRate: v.number(),
    uploadDate: v.string(),
  }).index("by_campaign", ["campaignId"]),

  trafficWeekly: defineTable({
    campaignId: v.id("campaigns"),
    weekLabel: v.string(),
    weekStart: v.string(),
    sessions: v.number(),
    users: v.number(),
    avgEngagementSec: v.number(),
  }).index("by_campaign", ["campaignId"]),

  salesWeekly: defineTable({
    campaignId: v.id("campaigns"),
    productName: v.string(),
    weekLabel: v.string(),
    revenue2025: v.number(),
    revenue2026: v.number(),
  }).index("by_campaign", ["campaignId"]),

  ganttTasks: defineTable({
    campaignId: v.id("campaigns"),
    category: v.string(),           // 대분류 (A열)
    subTask: v.string(),            // 업무명 (C열)
    assignee: v.string(),           // 담당자 (E열)
    startDate: v.string(),          // 시작일 YYYY-MM-DD
    endDate: v.string(),            // 종료일 YYYY-MM-DD
    progress: v.number(),           // 진척도 0~100
    sortOrder: v.number(),          // 표시 순서
    color: v.string(),              // 막대 색상
    isManuallyEdited: v.boolean(),  // 수기 수정 여부
  }).index("by_campaign", ["campaignId"]),

  campaignPhases: defineTable({
    campaignId: v.id("campaigns"),
    title: v.string(),       // "Phase 1"
    subtitle: v.string(),    // "캠페인 홍미 유도 및 확산"
    sortOrder: v.number(),
    color: v.string(),       // 페이즈 대표 색상
    items: v.array(v.object({
      name: v.string(),
      description: v.string(),
      isHighlighted: v.optional(v.boolean()),
    })),
  }).index("by_campaign", ["campaignId"]),


  viralContents: defineTable({
    campaignId: v.id("campaigns"),
    platform: v.string(), // e.g., "Instagram", "YouTube", "Blog"
    creator: v.string(),  // e.g., 크리에이터 채널명
    title: v.string(),
    date: v.string(),
    views: v.number(),
    likes: v.number(),
    comments: v.number(),
    url: v.string(),
    thumbnailUrl: v.optional(v.string()),
  }).index("by_campaign", ["campaignId"]),

  interestActivities: defineTable({
    campaignId: v.id("campaigns"),
    activityType: v.string(), // e.g., "팝업", "오프라인행사", "온라인이벤트"
    title: v.string(),        // e.g., "성수동 팝업스토어"
    locationOrTarget: v.string(), // "성수동", "2030현대인"
    startDate: v.string(),
    endDate: v.string(),
    visitors: v.number(),     // 방문자수 예상/실제
    participants: v.number(), // 이벤트 참여자수
    budget: v.number(),       // 진행 예산
  }).index("by_campaign", ["campaignId"]),

  campaignInsights: defineTable({
    campaignId: v.id("campaigns"),
    weekLabel: v.string(),       // 예: "WEEK 1"
    headline: v.string(),        // 핵심 헤드라인
    body: v.string(),            // 상세 내용
    kpiLabel: v.optional(v.string()),   // 핵심 KPI 라벨
    kpiValue: v.optional(v.string()),   // 핵심 KPI 값 (문자열)
    kpiColor: v.optional(v.string()),   // Tailwind 색상 클래스
    growthLabel: v.optional(v.string()), // 성장률 라벨
    growthValue: v.optional(v.string()), // 성장률 값 (예: "+12.5%")
    sortOrder: v.number(),
  }).index("by_campaign", ["campaignId"]),

  shareLinks: defineTable({
    campaignId: v.id("campaigns"),
    token: v.string(),
    expiresAt: v.number(),
    createdBy: v.string(),
  }).index("by_token", ["token"]),
});
