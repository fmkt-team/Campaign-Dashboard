import { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface GlassCardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

export function GlassCard({ children, className, ...props }: GlassCardProps) {
  return (
    <div
      className={cn(
        "bg-white border border-gray-100 rounded-2xl shadow-sm p-6",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}
