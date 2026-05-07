"use client";

import { ConvexProvider, ConvexReactClient } from "convex/react";
import { ReactNode, useState } from "react";
import { RefreshProvider } from "@/lib/refresh-context";

export function Providers({ children }: { children: ReactNode }) {
  const [convex] = useState(() => new ConvexReactClient(process.env.NEXT_PUBLIC_CONVEX_URL!));

  return (
    <ConvexProvider client={convex}>
      <RefreshProvider>
        {children}
      </RefreshProvider>
    </ConvexProvider>
  );
}
