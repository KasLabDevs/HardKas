import React, { createContext, useContext, useMemo } from "react";
import { HardKASClient, createClient, HardKASClientConfig } from "@hardkas/client";

const HardKASContext = createContext<HardKASClient | null>(null);

export interface HardKASProviderProps extends HardKASClientConfig {
  children: React.ReactNode;
}

export const HardKASProvider: React.FC<HardKASProviderProps> = ({
  children,
  baseUrl,
  timeout
}) => {
  const client = useMemo(() => {
    const config: HardKASClientConfig = {};
    if (baseUrl !== undefined) config.baseUrl = baseUrl;
    if (timeout !== undefined) config.timeout = timeout;
    return createClient(config);
  }, [baseUrl, timeout]);

  return <HardKASContext.Provider value={client}>{children}</HardKASContext.Provider>;
};

export const useHardKAS = () => {
  const context = useContext(HardKASContext);
  if (!context) {
    throw new Error("useHardKAS must be used within a HardKASProvider");
  }
  return context;
};
