// LLM generated
import { createContext, useContext } from "react";
import type { useScopeManager } from "./useScopeManager";

// The debug scope of the patching modal, shared with the parameters of the racks
export interface ScopeContextValue {
	// adds the parameter to the scope, or removes it when it is already there
	toggle: (parameterId: string, portElemId: string) => void;
	// element ids of the parameters currently shown in the scope
	activePortIds: string[];
	// the one scope manager: the patching modal uses it too, two would fight over the debug channels
	manager: ReturnType<typeof useScopeManager>;
}

export const ScopeContext = createContext<ScopeContextValue | null>(null);

export const useScope = () => useContext(ScopeContext);
