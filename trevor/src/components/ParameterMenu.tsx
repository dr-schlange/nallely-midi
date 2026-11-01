// LLM generated
import { type RefObject, useLayoutEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useScope } from "../hooks/ScopeContext";
import type { Connection, ConnectionEnd } from "../model";
import { useTrevorDispatch, useTrevorSelector } from "../store";
import {
  revealParameter,
  setBarSelection,
  setHighlightedUnit,
} from "../store/runtimeSlice";
import { CLONE_ACTIONS } from "../utils/cloneOptions";
import { connectionEndId } from "../utils/utils";
import { useTrevorWebSocket } from "../websockets/websocket";
import { Button, Dropdown, lightButtonStyle } from "./widgets/BaseComponents";

const HEIGHT = 28;

// a little bigger than the small buttons of the title bars
const menuButtonStyle = (activated = false): React.CSSProperties => ({
	...lightButtonStyle(activated),
	width: 20,
	minWidth: 20,
	height: 20,
	minHeight: 20,
	fontSize: "14px",
});

const labelOf = (end: ConnectionEnd) => `${end.repr} · ${end.parameter.name}`;

// The parameters at the other end of the links of a parameter
const collectLinked = (
	connections: Connection[],
	parameterId: string,
	side: "src" | "dest",
) => {
	const other = side === "src" ? "dest" : "src";
	const linked = new Map<string, string>();
	for (const c of connections) {
		if (connectionEndId(c[side]) === parameterId) {
			linked.set(connectionEndId(c[other]), labelOf(c[other]));
		}
	}
	return [...linked].map(([id, label]) => ({ id, label }));
};

// Where the anchor is on screen, kept up to date while it moves or resizes
const useAnchorRect = (anchorRef: RefObject<HTMLElement | null>) => {
	const [rect, setRect] = useState<DOMRect | null>(null);
	useLayoutEffect(() => {
		const el = anchorRef.current;
		if (!el) return undefined;
		const update = () => {
			const r = el.getBoundingClientRect();
			setRect(r.width > 0 ? r : null); // collapsed
		};
		update();
		const resize = new ResizeObserver(update);
		resize.observe(el);
		window.addEventListener("resize", update);
		window.addEventListener("scroll", update, true);
		return () => {
			resize.disconnect();
			window.removeEventListener("resize", update);
			window.removeEventListener("scroll", update, true);
		};
	}, [anchorRef]);
	return rect;
};

// The small menu on top of the selected parameter: S lists its sources, D adds it to the debug
// scope, T lists its targets. Picking a target or a source brings it in view and makes it blink.
export const ParameterMenu = ({
	id,
	anchorRef,
}: {
	id: string;
	anchorRef: RefObject<HTMLElement | null>;
}) => {
	const connections = useTrevorSelector((state) => state.nallely.connections);
	const dispatch = useTrevorDispatch();
	const scope = useScope();
	const rect = useAnchorRect(anchorRef);
	const [list, setList] = useState<"targets" | "sources" | null>(null);

	const targets = useMemo(
		() => collectLinked(connections, id, "src"),
		[connections, id],
	);
	const sources = useMemo(
		() => collectLinked(connections, id, "dest"),
		[connections, id],
	);

	if (!rect) return null;
	const portElemId = `bar-${id}`;
	const above = rect.top >= HEIGHT + 4;
	const top = above ? rect.top - HEIGHT - 2 : rect.bottom + 2;
	const entries = list === "targets" ? targets : sources;
	const toggleList = (which: "targets" | "sources") =>
		setList((current) => (current === which ? null : which));

	const pick = (target: string) => {
		setList(null);
		// the parameter scrolls into view and blinks, and nothing stays selected: this menu goes
		dispatch(setBarSelection(null));
		dispatch(revealParameter(target));
	};

	return createPortal(
		<>
			<div
				data-bar-menu
				style={{
					position: "fixed",
					left: rect.left,
					top,
					width: rect.width,
					height: HEIGHT,
					boxSizing: "border-box",
					display: "flex",
					alignItems: "center",
					justifyContent: "center",
					gap: 6,
					zIndex: 10000,
					fontSize: "12px",
				}}
			>
				<Button
					text="S"
					tooltip="Sources of the links of this parameter"
					disabled={sources.length === 0}
					activated={list === "sources"}
					style={menuButtonStyle(list === "sources")}
					onClick={() => toggleList("sources")}
				/>
				<Button
					text="D"
					tooltip="Show this parameter in the debug scope"
					disabled={!scope}
					activated={scope?.activePortIds.includes(portElemId)}
					style={menuButtonStyle(scope?.activePortIds.includes(portElemId))}
					onClick={() => scope?.toggle(id, portElemId)}
				/>
				<Button
					text="T"
					tooltip="Targets of the links of this parameter"
					disabled={targets.length === 0}
					activated={list === "targets"}
					style={menuButtonStyle(list === "targets")}
					onClick={() => toggleList("targets")}
				/>
			</div>
			{list && (
				<Dropdown
					position={{
						left: rect.left,
						...(above
							? { bottom: window.innerHeight - top + 2 }
							: { top: top + HEIGHT + 2 }),
					}}
					minWidth={rect.width}
					options={entries.map((entry) => ({
						key: entry.id,
						label: entry.label,
					}))}
					onSelect={pick}
				/>
			)}
		</>,
		document.body,
	);
};

// The small menu on top of the title bar of a device whose links are highlighted (long press on
// it): K kills the device.
export const DeviceMenu = ({
	id,
	repr,
	anchorRef,
	proxy = false,
	cloneable = false,
}: {
	id: number;
	repr: string;
	anchorRef: RefObject<HTMLElement | null>;
	proxy?: boolean;
	cloneable?: boolean;
}) => {
	const [cloneOpen, setCloneOpen] = useState(false);
	const dispatch = useTrevorDispatch();
	const trevorSocket = useTrevorWebSocket();
	// the whole device, not only its title bar (a thin strip when the racks are horizontal)
	const deviceRef = useMemo(
		() => ({
			get current() {
				return (
					anchorRef.current?.closest<HTMLElement>("[data-link-device]") ?? null
				);
			},
		}),
		[anchorRef],
	);
	const rect = useAnchorRect(deviceRef);
	if (!rect) return null;
	const above = rect.top >= HEIGHT + 4;
	const top = above ? rect.top - HEIGHT - 2 : rect.bottom + 2;
	return createPortal(
		<>
			<div
				data-bar-menu
				style={{
					position: "fixed",
					left: rect.left,
					top,
					width: rect.width,
					height: HEIGHT,
					boxSizing: "border-box",
					display: "flex",
					alignItems: "center",
					// on the right of the device, the next buttons come on its left
					flexDirection: "row-reverse",
					justifyContent: "flex-start",
					gap: 6,
					zIndex: 10000,
					fontSize: "12px",
				}}
			>
				<Button
					text={proxy ? "U" : "K"}
					tooltip={
						proxy
							? "Unregister the service from the network bus"
							: "Kill this device"
					}
					style={menuButtonStyle()}
					onClick={() => {
						// the device is gone: nothing left to highlight
						dispatch(setHighlightedUnit(null));
						if (proxy) trevorSocket?.unregisterService(id, repr);
						else trevorSocket?.killDevice(id);
					}}
				/>
				{cloneable && (
					<Button
						text="C"
						tooltip="Clone this device"
						activated={cloneOpen}
						style={menuButtonStyle(cloneOpen)}
						onClick={() => setCloneOpen((open) => !open)}
					/>
				)}
			</div>
			{cloneOpen && (
				<Dropdown
					position={{
						right: window.innerWidth - rect.right,
						...(above
							? { bottom: window.innerHeight - top + 2 }
							: { top: top + HEIGHT + 2 }),
					}}
					options={CLONE_ACTIONS.map(({ text, tooltip }) => ({
						key: text,
						label: text,
						title: tooltip,
					}))}
					onSelect={(text) => {
						const action = CLONE_ACTIONS.find((a) => a.text === text);
						setCloneOpen(false);
						dispatch(setHighlightedUnit(null));
						if (action) trevorSocket?.clone_device(id, action.options);
					}}
				/>
			)}
		</>,
		document.body,
	);
};
