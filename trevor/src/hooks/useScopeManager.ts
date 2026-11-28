import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MidiParameter, VirtualDevice, VirtualParameter } from "../model";
import { useTrevorSelector } from "../store";
import { parameterUUID } from "../utils/utils";
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

	const [spawn, setSpawn] = useState<{
		token: number;
		channels: number;
	} | null>(null);
	const [spawnTick, setSpawnTick] = useState(0);
	const spawnCounter = useRef(0);
	const pendingSpawn = useRef<{
		repr: string | null;
		links: {
			index: number;
			srcId: string;
			scaler: {
				to_min: number;
				to_max: number;
				method: string;
				as_int: boolean;
			} | null;
			linked: boolean;
			scaled: boolean;
		}[];
	} | null>(null);
	const allConnectionsRef = useRef(allConnections);
	allConnectionsRef.current = allConnections;

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
		const pending = pendingSpawn.current;
		if (!pending?.repr) return;
		const device = virtualDevices.find((d) => d.repr === pending.repr);
		if (!device) return;
		for (const link of pending.links) {
			const cvName = `${pending.repr}_ch${link.index + 1}_cv`;
			if (!link.linked) {
				if (!device.meta.parameters.some((p) => p.cv_name === cvName)) continue;
				websocket?.associate(
					link.srcId,
					`${device.id}::__virtual__::${cvName}`,
					false,
				);
				link.linked = true;
				continue;
			}
			if (link.scaled) continue;
			const chain = allConnections.find(
				(c) =>
					c.dest.device === device.id &&
					(c.dest.parameter as VirtualParameter).cv_name === cvName,
			)?.src.chain;
			if (!chain || !link.scaler) continue;
			for (const [name, value] of Object.entries(link.scaler)) {
				websocket?.setScalerValue(chain.id, name, value);
			}
			link.scaled = true;
		}
		if (pending.links.every((l) => l.linked && l.scaled))
			pendingSpawn.current = null;
	}, [virtualDevices, allConnections, websocket, spawnTick]);

	const spawnScope = useCallback(() => {
		const bus = dbgDeviceRef.current;
		if (!bus) return;
		const links: NonNullable<typeof pendingSpawn.current>["links"] = [];
		SCOPE_CV_NAMES.forEach((cvName, index) => {
			const connection = allConnectionsRef.current.find(
				(c) =>
					c.dest.device === bus.id &&
					(c.dest.parameter as VirtualParameter).cv_name === cvName,
			);
			if (!connection) return;
			const chain = connection.src.chain;
			links.push({
				index,
				srcId: parameterUUID(connection.src.device, connection.src.parameter),
				scaler: chain && {
					to_min: chain.to_min,
					to_max: chain.to_max,
					method: chain.method,
					as_int: chain.as_int,
				},
				linked: false,
				scaled: !chain,
			});
		});
		if (links.length === 0) return;
		pendingSpawn.current = { repr: null, links };
		spawnCounter.current += 1;
		setSpawn({
			token: spawnCounter.current,
			channels: Math.max(...links.map((l) => l.index)) + 1,
		});
	}, []);

	const registerSpawned = useCallback((repr: string) => {
		if (!pendingSpawn.current) return;
		pendingSpawn.current.repr = repr;
		setSpawnTick((tick) => tick + 1);
	}, []);

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
		spawn,
		spawnScope,
		registerSpawned,
	};
};
