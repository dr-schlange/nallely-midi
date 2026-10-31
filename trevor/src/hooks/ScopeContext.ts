// LLM generated
import { createContext, useContext } from "react";

// The debug scope of the patching modal, shared with the parameters of the racks
export interface ScopeContextValue {
	// adds the parameter to the scope, or removes it when it is already there
	toggle: (parameterId: string, portElemId: string) => void;
	// element ids of the parameters currently shown in the scope
	activePortIds: string[];
}

export const ScopeContext = createContext<ScopeContextValue | null>(null);

export const useScope = () => useContext(ScopeContext);
