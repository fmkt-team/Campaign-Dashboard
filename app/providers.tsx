"use client";

import { ConvexProvider, ConvexReactClient } from "convex/react";
import { ReactNode, useState } from "react";
import { RefreshProvider } from "@/lib/refresh-context";
import { AuthProvider } from "@/lib/auth-context";

export function Providers({ children }: { children: ReactNode }) {
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  const [convex] = useState(() => convexUrl ? new ConvexReactClient(convexUrl) : null);

  const inner = (
    <AuthProvider>
      <RefreshProvider>
        {children}
      </RefreshProvider>
    </AuthProvider>
  );

  if (!convex) return inner;

  return (
    <ConvexProvider client={convex}>
      {inner}
    </ConvexProvider>
  );
}
