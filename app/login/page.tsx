"use client";

import { Suspense, useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useAuth, validateMaster } from "@/lib/auth-context";

// ── 로그인 폼 (useSearchParams 사용 → Suspense 필요) ─────────────
function LoginForm() {
  const { isAdmin, isLoading, loginWithCredentials } = useAuth();
  const router       = useRouter();
  const searchParams = useSearchParams();

  const [email,        setEmail]        = useState("");
  const [password,     setPassword]     = useState("");
  const [error,        setError]        = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Convex에서 admin 계정 검증용 (비밀번호 파라미터는 실제 제출 시에만 사용)
  const [queryEmail, setQueryEmail] = useState<string | null>(null);
  const [queryPw,    setQueryPw]    = useState<string | null>(null);
  const adminValidation = useQuery(
    api.adminUsers.validateAdminUser,
    queryEmail && queryPw ? { email: queryEmail, password: queryPw } : "skip"
  );

  // 이미 로그인된 경우 리디렉션
  useEffect(() => {
    if (!isLoading && isAdmin) {
      const redirect = searchParams.get("redirect") || "/";
      router.replace(redirect);
    }
  }, [isAdmin, isLoading, router, searchParams]);

  // Convex 검증 결과 처리
  useEffect(() => {
    if (!adminValidation || !queryEmail || !queryPw) return;

    if (adminValidation.ok) {
      loginWithCredentials(queryEmail, queryPw, adminValidation.role as "master" | "admin");
      const redirect = searchParams.get("redirect") || "/";
      router.replace(redirect);
    } else {
      setError("이메일 또는 비밀번호가 올바르지 않습니다.");
      setIsSubmitting(false);
    }
    setQueryEmail(null);
    setQueryPw(null);
  }, [adminValidation, queryEmail, queryPw, loginWithCredentials, router, searchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsSubmitting(true);

    const emailTrimmed = email.trim();

    // 1) 마스터 계정 로컬 검증
    if (validateMaster(emailTrimmed, password)) {
      loginWithCredentials(emailTrimmed, password, "master");
      const redirect = searchParams.get("redirect") || "/";
      router.replace(redirect);
      return;
    }

    // 2) Convex admin 계정 검증 (query 트리거)
    setQueryEmail(emailTrimmed);
    setQueryPw(password);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0A0A0A]">
        <div className="w-6 h-6 rounded-full border-2 border-white/20 border-t-white animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0A0A0A]">
      <div className="w-full max-w-md">
        {/* 로고 */}
        <div className="flex justify-center mb-8">
          <img src="/logo/Fursys_Wordmark_RGB_White.svg" alt="FURSYS" className="h-32 w-auto" />
        </div>

        <div className="bg-white/[0.06] backdrop-blur-md border border-white/10 rounded-2xl p-8 shadow-[0_8px_40px_rgba(0,0,0,0.6)]">
          <h1 className="text-xl font-bold text-white mb-1">관리자 로그인</h1>
          <p className="text-sm text-white/40 mb-7">캠페인 대시보드 관리자 전용</p>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div>
              <label className="block text-xs text-white/50 mb-1.5 font-medium">이메일</label>
              <input
                type="email"
                value={email}
                onChange={e => { setEmail(e.target.value); setError(""); }}
                placeholder="이메일 입력"
                required
                autoComplete="email"
                className="w-full bg-white/[0.07] border border-white/10 text-white rounded-xl px-4 py-2.5 text-sm outline-none focus:border-white/30 placeholder:text-white/20 transition-colors"
              />
            </div>

            <div>
              <label className="block text-xs text-white/50 mb-1.5 font-medium">비밀번호</label>
              <input
                type="password"
                value={password}
                onChange={e => { setPassword(e.target.value); setError(""); }}
                placeholder="••••••••"
                required
                autoComplete="current-password"
                className="w-full bg-white/[0.07] border border-white/10 text-white rounded-xl px-4 py-2.5 text-sm outline-none focus:border-white/30 placeholder:text-white/20 transition-colors"
              />
            </div>

            {error && (
              <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={isSubmitting || !email || !password}
              className="mt-1 w-full bg-white text-gray-900 font-bold py-2.5 px-4 rounded-xl text-sm hover:bg-gray-100 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isSubmitting ? "확인 중..." : "로그인"}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-white/20 mt-6">
          FURSYS Campaign Dashboard
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-[#0A0A0A]">
        <div className="w-6 h-6 rounded-full border-2 border-white/20 border-t-white animate-spin" />
      </div>
    }>
      <LoginForm />
    </Suspense>
  );
}
