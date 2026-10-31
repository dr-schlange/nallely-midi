// LLM generated
import { useMemo } from "react";
import { useTrevorSelector } from "../store";
import { connectionEndId } from "../utils/utils";

export const useLinkedIds = () => {
	const connections = useTrevorSelector((state) => state.nallely.connections);
	return useMemo(() => {
		const ids = new Set<string>();
		for (const c of connections) {
			ids.add(connectionEndId(c.src));
			ids.add(connectionEndId(c.dest));
		}
		return ids;
	}, [connections]);
};
