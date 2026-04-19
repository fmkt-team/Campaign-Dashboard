import { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface GlassCardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

export function GlassCard({ children, className, ...props }: GlassCardProps) {
  return (
    <div
      className={cn(
        "bg-white/8 backdrop-blur-md border border-white/15 rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.4)] p-6",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}
