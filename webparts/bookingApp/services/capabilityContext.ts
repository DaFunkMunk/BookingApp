import { createContext, useContext } from 'react';

export type CapabilityContextValue = {
  capabilities: string[];
  hasCapability: (key: string) => boolean;
};

const defaultValue: CapabilityContextValue = {
  capabilities: [],
  hasCapability: () => false,
};

const CapabilityContext = createContext<CapabilityContextValue>(defaultValue);

export const CapabilityProvider = CapabilityContext.Provider;

export const useCapabilities = (): CapabilityContextValue => useContext(CapabilityContext);

export default CapabilityContext;
