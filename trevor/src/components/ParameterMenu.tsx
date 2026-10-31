// LLM generated
import { type RefObject, useLayoutEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useScope } from "../hooks/ScopeContext";
import type { Connection, ConnectionEnd } from "../model";
import { useTrevorDispatch, useTrevorSelector } from "../store";
import { revealParameter, setBarSelection } from "../store/runtimeSlice";
import { connectionEndId } from "../utils/utils";
import { Button, lightButtonStyle } from "./widgets/BaseComponents";

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

// The small menu on top of the selected parameter: T lists its targets, S its sources, D
// adds it to the debug scope. Picking a target or a source brings it in view and makes it blink.
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
					text="T"
					tooltip="Targets of the links of this parameter"
					disabled={targets.length === 0}
					activated={list === "targets"}
					style={menuButtonStyle(list === "targets")}
					onClick={() => toggleList("targets")}
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
					text="S"
					tooltip="Sources of the links of this parameter"
					disabled={sources.length === 0}
					activated={list === "sources"}
					style={menuButtonStyle(list === "sources")}
					onClick={() => toggleList("sources")}
				/>
			</div>
			{list && (
				<div
					data-bar-menu
					style={{
						position: "fixed",
						left: rect.left,
						...(above
							? { bottom: window.innerHeight - top + 2 }
							: { top: top + HEIGHT + 2 }),
						minWidth: rect.width,
						maxHeight: 200,
						overflowY: "auto",
						zIndex: 10000,
						backgroundColor: "#e0e0e0",
						border: "3px solid #808080",
						fontSize: "12px",
					}}
				>
					{entries.map((entry) => (
						// biome-ignore lint/a11y/useKeyWithClickEvents: same as the other floating menus
						<div
							key={entry.id}
							onClick={() => pick(entry.id)}
							style={{
								padding: "3px 6px",
								cursor: "pointer",
								whiteSpace: "nowrap",
								color: "var(--black)",
							}}
						>
							{entry.label}
						</div>
					))}
				</div>
			)}
		</>,
		document.body,
	);
};
