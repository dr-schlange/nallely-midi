// LLM generated
import { useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import type { Connection, ConnectionEnd } from "../model";
import { useTrevorSelector } from "../store";
import { ScalerFormBottom, ScalerFormTop } from "./ScalerForm";
import { Dropdown } from "./widgets/BaseComponents";

// from the pressed point: less than the label that follows a dragged value; the finger
// covers more below the point than above it
const TOP_OFFSET = 8;
const BOTTOM_OFFSET = 22;
const WIDTH = 250;
const MARGIN = 4;

// The parameter, with its section for a MIDI device. The device is left out when all the
// links join the same two devices: the link itself tells which ones they are.
const labelOf = (end: ConnectionEnd, withDevice: boolean) => {
	const { name, section_name: section } = end.parameter;
	const parameter =
		section && section !== "__virtual__" ? `${section} · ${name}` : name;
	return withDevice ? `${end.repr} · ${parameter}` : parameter;
};

const boxStyle: React.CSSProperties = {
	position: "fixed",
	zIndex: 10000,
	boxSizing: "border-box",
	padding: 4,
	overflowY: "auto",
	backgroundColor: "#e0e0e0",
	fontSize: "12px",
	color: "var(--black)",
};

// The floating menus of a link, around the point that was pressed:
// - the settings of the selected link in two parts, the switches and the range of the
//   scaler above the point and the other fields below it;
// - when several links are involved, the list of them, at the point, long enough for the
//   names of the two parameters; picking one opens its settings around the entry that
//   was clicked, and the list stays.
export const LinkMenu = ({
	x,
	y,
	connectionIds,
	withDevices = false,
	showList,
	selectedId,
	anchor,
	onSelect,
	onClose,
}: {
	x: number;
	y: number;
	connectionIds: number[];
	withDevices?: boolean;
	showList: boolean;
	selectedId: number | null;
	// where the settings open: the pressed point, or the entry clicked in the list
	anchor: { x: number; y: number } | null;
	onSelect: (id: number | null, point?: { x: number; y: number }) => void;
	onClose: () => void;
}) => {
	const allConnections = useTrevorSelector(
		(state) => state.nallely.connections,
	);
	const connections = useMemo(
		() =>
			connectionIds
				.map((id) => allConnections.find((c) => c.id === id))
				.filter((c): c is Connection => c !== undefined),
		[connectionIds, allConnections],
	);
	const selected = connections.find((c) => c.id === selectedId);

	// links deleted from under the menu
	useEffect(() => {
		if (connections.length === 0) onClose();
		else if (selectedId !== null && !selected) onSelect(null);
	}, [connections, selectedId, selected, onClose, onSelect]);

	useEffect(() => {
		const onDown = (e: PointerEvent) => {
			if (!(e.target as Element).closest("[data-link-menu]")) onClose();
		};
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") onClose();
		};
		document.addEventListener("pointerdown", onDown);
		document.addEventListener("keydown", onKey);
		return () => {
			document.removeEventListener("pointerdown", onDown);
			document.removeEventListener("keydown", onKey);
		};
	}, [onClose]);

	const ax = anchor?.x ?? x;
	const ay = anchor?.y ?? y;
	const left = Math.max(
		MARGIN,
		Math.min(ax - WIDTH / 2, window.innerWidth - WIDTH - MARGIN),
	);

	return createPortal(
		<>
			{selected && (
				<>
					<div
						data-link-menu
						data-bar-menu
						className="link-menu"
						style={{
							...boxStyle,
							left,
							width: WIDTH,
							bottom: window.innerHeight - (ay - TOP_OFFSET),
							maxHeight: Math.max(60, ay - TOP_OFFSET - MARGIN),
						}}
					>
						<ScalerFormTop connection={selected} />
					</div>
					<div
						data-link-menu
						data-bar-menu
						className="link-menu"
						style={{
							...boxStyle,
							left,
							width: WIDTH,
							top: ay + BOTTOM_OFFSET,
							maxHeight: Math.max(
								60,
								window.innerHeight - (ay + BOTTOM_OFFSET) - MARGIN,
							),
						}}
					>
						<ScalerFormBottom connection={selected} />
					</div>
				</>
			)}
			{showList && (
				<Dropdown
					// at the pressed point, moved back inside the screen once measured
					position={{ left: x, top: y }}
					keepOnScreen
					width="max-content"
					maxHeight={240}
					attributes={{ "data-link-menu": true }}
					options={connections.map((connection) => ({
						key: connection.id,
						label: `${labelOf(connection.src, withDevices)} → ${labelOf(connection.dest, withDevices)}`,
						active: connection.id === selectedId,
					}))}
					onSelect={(id, e) => onSelect(id, { x: e.clientX, y: e.clientY })}
				/>
			)}
		</>,
		document.body,
	);
};
