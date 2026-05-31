import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

// 마스터 이메일 (서버 측에서도 동일하게 체크)
const MASTER_EMAIL = "fursysmarketing@gmail.com";

// ── 관리자 계정 목록 조회 (마스터 전용) ──────────────────────────
export const getAdminUsers = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("users")
      .filter((q) => q.eq(q.field("role"), "admin"))
      .collect();
  },
});

// ── 관리자 계정 생성 ───────────────────────────────────────────────
export const createAdminUser = mutation({
  args: {
    email:    v.string(),
    password: v.string(), // 내부 도구이므로 평문 저장 (운영 환경에서는 해싱 권장)
  },
  handler: async (ctx, args) => {
    // 중복 체크
    const existing = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", args.email))
      .first();
    if (existing) throw new Error("이미 존재하는 이메일입니다.");
    if (args.email === MASTER_EMAIL) throw new Error("마스터 계정 이메일은 사용 불가합니다.");

    return await ctx.db.insert("users", {
      email:        args.email,
      passwordHash: args.password, // 내부 도구 단순 저장
      role:         "admin",
      createdAt:    Date.now(),
      isActive:     true,
    });
  },
});

// ── 비밀번호 검증 (로그인 시) ─────────────────────────────────────
export const validateAdminUser = query({
  args: {
    email:    v.string(),
    password: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", args.email))
      .first();

    if (!user) return { ok: false, reason: "not_found" };
    if (!user.isActive) return { ok: false, reason: "inactive" };
    if (user.passwordHash !== args.password) return { ok: false, reason: "wrong_password" };

    return { ok: true, role: user.role ?? "admin" };
  },
});

// ── 비밀번호 변경 ─────────────────────────────────────────────────
export const updateAdminPassword = mutation({
  args: {
    email:       v.string(),
    oldPassword: v.string(),
    newPassword: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", args.email))
      .first();

    if (!user) throw new Error("계정을 찾을 수 없습니다.");
    if (user.passwordHash !== args.oldPassword) throw new Error("현재 비밀번호가 올바르지 않습니다.");
    if (args.newPassword.length < 6) throw new Error("비밀번호는 6자 이상이어야 합니다.");

    await ctx.db.patch(user._id, { passwordHash: args.newPassword });
  },
});

// ── 관리자 계정 비활성화 (삭제 대신 isActive=false) ─────────────
export const deactivateAdminUser = mutation({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.userId, { isActive: false });
  },
});

// ── 관리자 계정 삭제 ──────────────────────────────────────────────
export const deleteAdminUser = mutation({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.userId);
  },
});
