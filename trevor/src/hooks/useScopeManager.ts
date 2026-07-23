import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

	const websocketRef = useRef(websocket);
	useEffect(() => {
		websocketRef.current = websocket;
	}, [websocket]);

	const [numScopeChannels, setNumScopeChannels] = useState(0);
	const [isScopeOpen, setIsScopeOpen] = useState(false);
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

	const removeChannel = useCallback((idx: number) => {
		const channels = scopeChannelsRef.current;
		const bus = dbgDeviceRef.current;
		const ws = websocketRef.current;
		if (bus) {
			for (let i = idx; i < channels.length; i++) {
				const cvName = SCOPE_CV_NAMES[i];
				if (cvName && channels[i].connected) {
					ws?.associate(
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
					ws?.associate(
						channels[i].srcId,
						`${bus.id}::__virtual__::${cvName}`,
						false,
					);
					channels[i].connected = true;
				}
			}
		}
		setNumScopeChannels(channels.length);
	}, []);

	useEffect(() => {
		const onWindowPointerUp = (e: PointerEvent) => {
			if (scopeChannelsRef.current.length === 0) return;
			const idx = scopeChannelsRef.current.findIndex(
				(ch) => ch.pointerId === e.pointerId,
			);
			if (idx === -1) return;
			removeChannel(idx);
		};
		window.addEventListener("pointerup", onWindowPointerUp);
		return () => window.removeEventListener("pointerup", onWindowPointerUp);
	}, [removeChannel]);

	const closeAllScopeChannels = useCallback(() => {
		const bus = dbgDeviceRef.current;
		const channels = scopeChannelsRef.current;
		const ws = websocketRef.current;
		if (bus) {
			for (let i = 0; i < channels.length; i++) {
				const cvName = SCOPE_CV_NAMES[i];
				if (cvName && channels[i].connected) {
					ws?.associate(
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
		setIsScopeOpen(false);
	}, []);

	const closeAllScopeChannelsRef = useRef(closeAllScopeChannels);
	useEffect(() => {
		closeAllScopeChannelsRef.current = closeAllScopeChannels;
	}, [closeAllScopeChannels]);

	useEffect(() => {
		return () => closeAllScopeChannelsRef.current();
	}, []);

	const handleScopeLongPress = useCallback(
		(srcId: string, portElemId: string, pointerId: number) => {
			const existingIdx = scopeChannelsRef.current.findIndex(
				(ch) => ch.srcId === srcId,
			);
			if (existingIdx !== -1) {
				removeChannel(existingIdx);
				return;
			}
			if (scopeChannelsRef.current.length >= 4) return;
			scopeChannelsRef.current.push({
				srcId,
				portElemId,
				pointerId,
				connected: false,
			});
			setIsScopeOpen(true);
			setNumScopeChannels(scopeChannelsRef.current.length);
		},
		[removeChannel],
	);

	const scopePortElemIds = useMemo(
		() => scopeChannelsRef.current.map((ch) => ch.portElemId),
		[numScopeChannels],
	);

	return {
		numScopeChannels,
		isScopeOpen,
		handleScopeLongPress,
		closeAllScopeChannels,
		scopePortElemIds,
	};
};
