import { createContext, useContext, useState, ReactNode } from "react";

interface RefreshContextType {
  refreshTrigger: number;
  triggerRefresh: () => void;
}

const RefreshContext = createContext<RefreshContextType | undefined>(undefined);

export function RefreshProvider({ children }: { children: ReactNode }) {
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const triggerRefresh = () => {
    setRefreshTrigger(v => v + 1);
  };

  return (
    <RefreshContext.Provider value={{ refreshTrigger, triggerRefresh }}>
      {children}
    </RefreshContext.Provider>
  );
}

export function useRefresh() {
  const context = useContext(RefreshContext);
  if (!context) {
    throw new Error("useRefresh must be used within RefreshProvider");
  }
  return context;
}
