"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from "react";

// ── 마스터 계정 (하드코딩) ──────────────────────────────────────
export const MASTER_EMAIL    = "fursysmarketing@gmail.com";
const MASTER_PASSWORD = "Fursys1983!";

const SESSION_KEY        = "campaign_admin_session";    // {email, role}
const VIEWER_SESSION_KEY = "campaign_viewer_session";   // {campaignId, token}

export type AuthRole = "master" | "admin" | null;

interface AuthContextType {
  // 관리자 상태
  isAdmin:     boolean;        // master 또는 admin으로 로그인 중
  isMaster:    boolean;        // master 계정 여부
  authEmail:   string | null;  // 로그인된 이메일
  authRole:    AuthRole;
  isLoading:   boolean;

  // 로그인/로그아웃
  loginWithCredentials: (email: string, password: string, role: AuthRole) => void;
  logout: () => void;

  // 뷰어 상태 (share link)
  isViewer:         boolean;
  viewerCampaignId: string | null;
  setViewerSession: (campaignId: string, token: string) => void;
  clearViewerSession: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [authRole,   setAuthRole]   = useState<AuthRole>(null);
  const [authEmail,  setAuthEmail]  = useState<string | null>(null);
  const [isLoading,  setIsLoading]  = useState(true);

  const [isViewer,         setIsViewer]         = useState(false);
  const [viewerCampaignId, setViewerCampaignId] = useState<string | null>(null);

  // 페이지 로드 시 세션 복원
  useEffect(() => {
    try {
      // 관리자 세션
      const adminSession = sessionStorage.getItem(SESSION_KEY);
      if (adminSession) {
        const parsed = JSON.parse(adminSession);
        if (parsed.role && parsed.email) {
          setAuthRole(parsed.role as AuthRole);
          setAuthEmail(parsed.email);
        }
      }
      // 뷰어 세션
      const viewerSession = sessionStorage.getItem(VIEWER_SESSION_KEY);
      if (viewerSession) {
        const parsed = JSON.parse(viewerSession);
        if (parsed.campaignId) {
          setIsViewer(true);
          setViewerCampaignId(parsed.campaignId);
        }
      }
    } catch {}
    setIsLoading(false);
  }, []);

  // 로그인 완료 후 호출 (부모에서 credential 검증 후)
  const loginWithCredentials = (email: string, password: string, role: AuthRole) => {
    try {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify({ email, role }));
    } catch {}
    setAuthRole(role);
    setAuthEmail(email);
    // 관리자 로그인 시 뷰어 세션 초기화
    clearViewerSession();
  };

  const logout = () => {
    try {
      sessionStorage.removeItem(SESSION_KEY);
      sessionStorage.removeItem(VIEWER_SESSION_KEY);
    } catch {}
    setAuthRole(null);
    setAuthEmail(null);
    setIsViewer(false);
    setViewerCampaignId(null);
  };

  const setViewerSession = (campaignId: string, token: string) => {
    try {
      sessionStorage.setItem(VIEWER_SESSION_KEY, JSON.stringify({ campaignId, token }));
    } catch {}
    setIsViewer(true);
    setViewerCampaignId(campaignId);
    // 뷰어 세션 시 관리자 세션 초기화
    setAuthRole(null);
    setAuthEmail(null);
    try { sessionStorage.removeItem(SESSION_KEY); } catch {}
  };

  const clearViewerSession = () => {
    try { sessionStorage.removeItem(VIEWER_SESSION_KEY); } catch {}
    setIsViewer(false);
    setViewerCampaignId(null);
  };

  const isAdmin  = authRole === "master" || authRole === "admin";
  const isMaster = authRole === "master";

  return (
    <AuthContext.Provider value={{
      isAdmin, isMaster, authEmail, authRole, isLoading,
      loginWithCredentials, logout,
      isViewer, viewerCampaignId, setViewerSession, clearViewerSession,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

// ── 마스터 계정 로컬 검증 ─────────────────────────────────────────
export function validateMaster(email: string, password: string): boolean {
  return (
    email.trim().toLowerCase() === MASTER_EMAIL.toLowerCase() &&
    password === MASTER_PASSWORD
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
