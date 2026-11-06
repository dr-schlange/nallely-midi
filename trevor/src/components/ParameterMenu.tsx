// LLM generated
import {
	type RefObject,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
} from "react";
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
import { ScalerRangeForm } from "./ScalerForm";
import { Button, Dropdown, menuButtonStyle } from "./widgets/BaseComponents";

const HEIGHT = 28;
const LIMITS_WIDTH = 250;

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
	const [list, setList] = useState<"targets" | "sources" | "limits" | null>(
		null,
	);

	const targets = useMemo(
		() => collectLinked(connections, id, "src"),
		[connections, id],
	);
	const sources = useMemo(
		() => collectLinked(connections, id, "dest"),
		[connections, id],
	);

	const incoming = useMemo(
		() => connections.filter((c) => connectionEndId(c.dest) === id),
		[connections, id],
	);

	// The panel is placed so that its range bar is centered on the parameter, and kept on
	// screen: it is measured once drawn.
	const limitsRef = useRef<HTMLDivElement>(null);
	const [limitsBox, setLimitsBox] = useState({
		width: LIMITS_WIDTH,
		barCenter: LIMITS_WIDTH / 2,
	});
	useLayoutEffect(() => {
		const panel = limitsRef.current;
		if (!panel) return;
		const bar = panel
			.querySelector("[data-range-bar]")
			?.getBoundingClientRect();
		const width = panel.offsetWidth;
		const barCenter = bar
			? bar.left + bar.width / 2 - panel.getBoundingClientRect().left
			: width / 2;
		setLimitsBox((box) =>
			box.width === width && box.barCenter === barCenter
				? box
				: { width, barCenter },
		);
	});

	if (!rect) return null;
	const portElemId = `bar-${id}`;
	const above = rect.top >= HEIGHT + 4;
	const top = above ? rect.top - HEIGHT - 2 : rect.bottom + 2;
	const entries = list === "targets" ? targets : sources;
	const toggleList = (which: "targets" | "sources" | "limits") =>
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
					text="L"
					tooltip="Lower and upper bounds of the scalers of the incoming links"
					disabled={incoming.length === 0}
					activated={list === "limits"}
					style={menuButtonStyle(list === "limits")}
					onClick={() => toggleList("limits")}
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
			{list === "limits" && incoming.length > 0 && (
				<div
					ref={limitsRef}
					data-bar-menu
					style={{
						position: "fixed",
						zIndex: 10000,
						boxSizing: "border-box",
						width: "max-content",
						maxWidth: LIMITS_WIDTH,
						padding: 4,
						overflowY: "auto",
						maxHeight: 240,
						backgroundColor: "#e0e0e0",
						// the frame of the other floating menus with several choices
						border: "3px solid #808080",
						fontSize: "12px",
						color: "var(--black)",
						left: Math.max(
							4,
							Math.min(
								rect.left + rect.width / 2 - limitsBox.barCenter,
								window.innerWidth - limitsBox.width - 4,
							),
						),
						...(above
							? { bottom: window.innerHeight - top + 2 }
							: { top: top + HEIGHT + 2 }),
					}}
				>
					{incoming.map((connection) => (
						<div key={connection.id} style={{ marginBottom: 4 }}>
							<div>{labelOf(connection.src)}</div>
							<ScalerRangeForm connection={connection} />
						</div>
					))}
				</div>
			)}
			{(list === "targets" || list === "sources") && (
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
