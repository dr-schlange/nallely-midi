// LLM generated
import { useCallback } from "react";
import { useTrevorDispatch, useTrevorSelector } from "../store";
import { setBarSelection } from "../store/runtimeSlice";
import { parameterUUID } from "../utils/utils";
import { useTrevorWebSocket } from "../websockets/websocket";

export const useBarLinking = () => {
	const selected = useTrevorSelector((state) => state.runTime.barSelection);
	const connections = useTrevorSelector((state) => state.nallely.connections);
	const associateMode = useTrevorSelector(
		(state) => state.runTime.associateMode,
	);
	const dispatch = useTrevorDispatch();
	const trevorSocket = useTrevorWebSocket();

	const onTap = useCallback(
		(uuid: string) => {
			if (!associateMode) {
				dispatch(setBarSelection(selected === uuid ? null : uuid));
				return;
			}
			if (selected === null) {
				dispatch(setBarSelection(uuid));
				return;
			}
			if (selected !== uuid) {
				const alreadyLinked = connections.some(
					(c) =>
						parameterUUID(c.src.device, c.src.parameter) === selected &&
						parameterUUID(c.dest.device, c.dest.parameter) === uuid,
				);
				trevorSocket?.associate(selected, uuid, alreadyLinked);
			}
			dispatch(setBarSelection(null));
		},
		[selected, connections, associateMode, dispatch, trevorSocket],
	);

	return { selected, onTap };
};
