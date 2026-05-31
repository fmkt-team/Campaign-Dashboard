"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useAuth, MASTER_EMAIL } from "@/lib/auth-context";
import { GlassCard } from "@/components/glass-card";
import { Plus, Trash2, Check, X, KeyRound, ChevronLeft, Shield, User } from "lucide-react";
import Link from "next/link";

// ── 비밀번호 변경 모달 ────────────────────────────────────────────
function ChangePasswordModal({
  email,
  isMasterChange,
  onClose,
}: {
  email: string;
  isMasterChange: boolean;
  onClose: () => void;
}) {
  const updatePw = useMutation(api.adminUsers.updateAdminPassword);
  const { loginWithCredentials, authRole } = useAuth();

  const [oldPw,  setOldPw]  = useState("");
  const [newPw,  setNewPw]  = useState("");
  const [confPw, setConfPw] = useState("");
  const [error,  setError]  = useState("");
  const [saving, setSaving] = useState(false);
  const [done,   setDone]   = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (newPw !== confPw) { setError("새 비밀번호가 일치하지 않습니다."); return; }
    if (newPw.length < 6) { setError("비밀번호는 6자 이상이어야 합니다."); return; }

    // 마스터 계정은 Convex에 저장되지 않으므로 로컬 검증
    if (isMasterChange) {
      const MASTER_PW = "Fursys1983!";
      if (oldPw !== MASTER_PW) { setError("현재 비밀번호가 올바르지 않습니다."); return; }
      setError("마스터 계정 비밀번호는 서버 환경변수(MASTER_PASSWORD)에서만 변경 가능합니다.");
      return;
    }

    setSaving(true);
    try {
      await updatePw({ email, oldPassword: oldPw, newPassword: newPw });
      setDone(true);
      // 세션 갱신
      loginWithCredentials(email, newPw, authRole as "admin");
      setTimeout(() => onClose(), 1500);
    } catch (e: any) {
      setError(e.message || "변경 실패");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl p-6 w-[400px] shadow-xl border border-gray-100">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-gray-500" /> 비밀번호 변경
          </h3>
          <button onClick={onClose}><X className="w-4 h-4 text-gray-400 hover:text-gray-600" /></button>
        </div>
        <p className="text-xs text-gray-400 mb-4">{email}</p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <input
            type="password" value={oldPw} onChange={e => setOldPw(e.target.value)}
            placeholder="현재 비밀번호" required
            className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-gray-400"
          />
          <input
            type="password" value={newPw} onChange={e => setNewPw(e.target.value)}
            placeholder="새 비밀번호 (6자 이상)" required
            className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-gray-400"
          />
          <input
            type="password" value={confPw} onChange={e => setConfPw(e.target.value)}
            placeholder="새 비밀번호 확인" required
            className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-gray-400"
          />
          {error && <p className="text-xs text-red-500 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>}
          {done  && <p className="text-xs text-green-500 bg-green-50 border border-green-100 rounded-lg px-3 py-2">✓ 변경 완료</p>}
          <button type="submit" disabled={saving || done}
            className="mt-1 w-full bg-gray-900 text-white font-medium py-2 rounded-lg text-sm hover:bg-gray-800 disabled:opacity-40">
            {saving ? "변경 중..." : "변경하기"}
          </button>
        </form>
      </div>
    </div>
  );
}

// ── 메인 페이지 ───────────────────────────────────────────────────
export default function MasterPage() {
  const { isAdmin, isMaster, isLoading, authEmail, logout } = useAuth();
  const router = useRouter();

  const adminUsers     = useQuery(api.adminUsers.getAdminUsers);
  const createAdmin    = useMutation(api.adminUsers.createAdminUser);
  const deleteAdmin    = useMutation(api.adminUsers.deleteAdminUser);

  const [newEmail, setNewEmail] = useState("");
  const [newPw,    setNewPw]    = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");
  const [createDone,  setCreateDone]  = useState(false);

  const [changePwTarget, setChangePwTarget] = useState<{ email: string; isMaster: boolean } | null>(null);

  // 인증 가드: 마스터만 접근 가능
  useEffect(() => {
    if (!isLoading && !isMaster) {
      router.replace(isAdmin ? "/" : "/login");
    }
  }, [isLoading, isMaster, isAdmin, router]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError("");
    setCreating(true);
    try {
      await createAdmin({ email: newEmail.trim(), password: newPw });
      setCreateDone(true);
      setNewEmail("");
      setNewPw("");
      setTimeout(() => setCreateDone(false), 3000);
    } catch (e: any) {
      setCreateError(e.message || "생성 실패");
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (userId: any) => {
    if (!confirm("이 관리자 계정을 삭제할까요?")) return;
    await deleteAdmin({ userId });
  };

  if (isLoading || !isMaster) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F8F9FA]">
        <div className="w-5 h-5 rounded-full border-2 border-gray-200 border-t-gray-900 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8F9FA] p-8 lg:p-12 max-w-3xl mx-auto">
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Shield className="w-5 h-5 text-indigo-500" />
            <h1 className="text-2xl font-bold text-gray-900">마스터 관리</h1>
          </div>
          <p className="text-xs text-gray-400">관리자 계정 생성 및 비밀번호 관리</p>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/" className="text-xs text-gray-400 hover:text-gray-700 flex items-center gap-1">
            <ChevronLeft className="w-3.5 h-3.5" /> 대시보드
          </Link>
          <button
            onClick={() => { logout(); router.push("/login"); }}
            className="text-xs text-gray-400 hover:text-red-500 transition-colors">
            로그아웃
          </button>
        </div>
      </div>

      {/* 마스터 계정 정보 */}
      <GlassCard className="p-5 mb-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center">
              <Shield className="w-4 h-4 text-indigo-600" />
            </div>
            <div>
              <p className="text-sm font-bold text-gray-900">{MASTER_EMAIL}</p>
              <p className="text-[10px] text-indigo-500 font-medium bg-indigo-50 px-1.5 py-0.5 rounded inline-block mt-0.5">MASTER</p>
            </div>
          </div>
          <button
            onClick={() => setChangePwTarget({ email: MASTER_EMAIL, isMaster: true })}
            className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-900 border border-gray-200 px-2.5 py-1 rounded-lg hover:border-gray-400 transition-all">
            <KeyRound className="w-3 h-3" /> 비밀번호 변경
          </button>
        </div>
      </GlassCard>

      {/* 관리자 계정 생성 */}
      <GlassCard className="p-5 mb-6">
        <h2 className="text-sm font-bold text-gray-900 mb-4 flex items-center gap-2">
          <Plus className="w-4 h-4 text-gray-500" /> 관리자 계정 생성
        </h2>
        <form onSubmit={handleCreate} className="flex flex-col gap-3">
          <input
            type="email" value={newEmail} onChange={e => { setNewEmail(e.target.value); setCreateError(""); }}
            placeholder="관리자 이메일" required
            className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-gray-400 placeholder:text-gray-400"
          />
          <input
            type="password" value={newPw} onChange={e => { setNewPw(e.target.value); setCreateError(""); }}
            placeholder="초기 비밀번호 (6자 이상)" required minLength={6}
            className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-gray-400 placeholder:text-gray-400"
          />
          {createError && <p className="text-xs text-red-500 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{createError}</p>}
          {createDone  && <p className="text-xs text-green-500 bg-green-50 border border-green-100 rounded-lg px-3 py-2">✓ 관리자 계정이 생성되었습니다.</p>}
          <button type="submit" disabled={creating}
            className="w-full bg-gray-900 text-white font-medium py-2 rounded-lg text-sm hover:bg-gray-800 disabled:opacity-40 flex items-center justify-center gap-2">
            <Plus className="w-3.5 h-3.5" />
            {creating ? "생성 중..." : "관리자 계정 생성"}
          </button>
        </form>
      </GlassCard>

      {/* 관리자 계정 목록 */}
      <GlassCard className="p-5">
        <h2 className="text-sm font-bold text-gray-900 mb-4 flex items-center gap-2">
          <User className="w-4 h-4 text-gray-500" /> 관리자 계정 목록
        </h2>
        {adminUsers === undefined ? (
          <p className="text-xs text-gray-400">불러오는 중...</p>
        ) : adminUsers.length === 0 ? (
          <p className="text-xs text-gray-400">등록된 관리자 계정이 없습니다.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {adminUsers.map((user: any) => (
              <div key={user._id}
                className="flex items-center justify-between px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl">
                <div>
                  <p className="text-sm font-medium text-gray-900">{user.email}</p>
                  <p className="text-[10px] text-gray-400 mt-0.5">
                    {user.createdAt ? new Date(user.createdAt).toLocaleDateString("ko-KR") : ""}
                    {user.isActive === false && <span className="ml-2 text-red-400">비활성</span>}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setChangePwTarget({ email: user.email, isMaster: false })}
                    className="p-1.5 rounded-lg bg-white border border-gray-200 hover:border-gray-400 text-gray-400 hover:text-gray-700 transition-colors">
                    <KeyRound className="w-3 h-3" />
                  </button>
                  <button
                    onClick={() => handleDelete(user._id)}
                    className="p-1.5 rounded-lg bg-red-50 border border-red-100 hover:bg-red-100 text-red-400 transition-colors">
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </GlassCard>

      {/* 비밀번호 변경 모달 */}
      {changePwTarget && (
        <ChangePasswordModal
          email={changePwTarget.email}
          isMasterChange={changePwTarget.isMaster}
          onClose={() => setChangePwTarget(null)}
        />
      )}
    </div>
  );
}
