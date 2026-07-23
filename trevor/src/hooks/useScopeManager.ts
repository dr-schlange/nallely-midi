import { useCallback, useEffect, useRef, useState } from "react";
import type { MidiParameter, VirtualDevice, VirtualParameter } from "../model";
import { useTrevorSelector } from "../store";
import { useTrevorWebSocket } from "../websockets/websocket";

export const TMP_SCOPE_ID = "dbg";
const SCOPE_CV_NAMES = ["dbg_ch1_cv", "dbg_ch2_cv", "dbg_ch3_cv", "dbg_ch4_cv"];

export const useScopeManager = () => {
	const websocket = useTrevorWebSocket();
	const virtualDevices = useTrevorSelector(
		(state) => state.nallely.virtual_devices,
	);
	const allConnections = useTrevorSelector(
		(state) => state.nallely.connections,
	);

	const [numScopeChannels, setNumScopeChannels] = useState(0);
	const scopeChannelsRef = useRef<
		{
			srcId: string;
			portElemId: string;
			pointerId: number;
			connected: boolean;
		}[]
	>([]);
	const dbgDeviceRef = useRef<VirtualDevice | null>(null);

	useEffect(() => {
		if (numScopeChannels === 0) return;
		const bus = virtualDevices.find((d) => d.repr === TMP_SCOPE_ID);
		if (!bus) return;
		dbgDeviceRef.current = bus;
		for (let i = 0; i < scopeChannelsRef.current.length; i++) {
			const ch = scopeChannelsRef.current[i];
			if (ch.connected) continue;
			const cvName = SCOPE_CV_NAMES[i];
			if (!cvName) continue;
			const dst = `${bus.id}::__virtual__::${cvName}`;
			const existing = allConnections.find(
				(c) =>
					c.dest.device === bus.id &&
					(c.dest.parameter as VirtualParameter).cv_name === cvName,
			);
			if (existing) {
				const exSrc = existing.src;
				websocket?.associate(
					`${exSrc.device}::${exSrc.parameter.section_name}::${(exSrc.parameter as VirtualParameter).cv_name ?? (exSrc.parameter as MidiParameter).name}`,
					dst,
					true,
				);
			}
			websocket?.associate(ch.srcId, dst, false);
			ch.connected = true;
		}
	}, [virtualDevices, allConnections, websocket, numScopeChannels]);

	useEffect(() => {
		if (numScopeChannels === 0) return;
		const onWindowPointerUp = (e: PointerEvent) => {
			const channels = scopeChannelsRef.current;
			const idx = channels.findIndex((ch) => ch.pointerId === e.pointerId);
			if (idx === -1) return;
			const bus = dbgDeviceRef.current;
			if (bus) {
				for (let i = idx; i < channels.length; i++) {
					const cvName = SCOPE_CV_NAMES[i];
					if (cvName && channels[i].connected) {
						websocket?.associate(
							channels[i].srcId,
							`${bus.id}::__virtual__::${cvName}`,
							true,
						);
					}
				}
			}
			channels.splice(idx, 1);
			if (bus && channels.length > idx) {
				for (let i = idx; i < channels.length; i++) {
					const cvName = SCOPE_CV_NAMES[i];
					if (cvName) {
						websocket?.associate(
							channels[i].srcId,
							`${bus.id}::__virtual__::${cvName}`,
							false,
						);
						channels[i].connected = true;
					}
				}
			}
			setNumScopeChannels(channels.length);
		};
		window.addEventListener("pointerup", onWindowPointerUp);
		return () => window.removeEventListener("pointerup", onWindowPointerUp);
	}, [numScopeChannels, websocket]);

	const closeAllScopeChannels = useCallback(() => {
		const bus = dbgDeviceRef.current;
		const channels = scopeChannelsRef.current;
		if (bus) {
			for (let i = 0; i < channels.length; i++) {
				const cvName = SCOPE_CV_NAMES[i];
				if (cvName && channels[i].connected) {
					websocket?.associate(
						channels[i].srcId,
						`${bus.id}::__virtual__::${cvName}`,
						true,
					);
				}
			}
		}
		scopeChannelsRef.current = [];
		dbgDeviceRef.current = null;
		setNumScopeChannels(0);
	}, [websocket]);

	useEffect(() => {
		return () => closeAllScopeChannels();
	}, [closeAllScopeChannels]);

	const handleScopeLongPress = useCallback(
		(srcId: string, portElemId: string, pointerId: number) => {
			if (scopeChannelsRef.current.length >= 4) return;
			if (scopeChannelsRef.current.some((ch) => ch.srcId === srcId)) return;
			scopeChannelsRef.current.push({
				srcId,
				portElemId,
				pointerId,
				connected: false,
			});
			setNumScopeChannels(scopeChannelsRef.current.length);
		},
		[],
	);

	const scopePortElemIds = scopeChannelsRef.current.map((ch) => ch.portElemId);

	return {
		numScopeChannels,
		handleScopeLongPress,
		closeAllScopeChannels,
		scopePortElemIds,
	};
};
