import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Connection, ConnectionEnd } from "../model";
import { useTrevorSelector } from "../store";
import { ScalerFormBottom, ScalerFormTop } from "./ScalerForm";

// from the pressed point: less than the label that follows a dragged value; the finger
// covers more below the point than above it
const TOP_OFFSET = 8;
const BOTTOM_OFFSET = 22;
const WIDTH = 250;
const MARGIN = 4;

// The parameter, with its section for a MIDI device: the devices are left out, the colour of
// the link already tells which ones they are
const labelOf = (end: ConnectionEnd) => {
	const { name, section_name: section } = end.parameter;
	return section && section !== "__virtual__" ? `${section} · ${name}` : name;
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
	showList,
	selectedId,
	anchor,
	onSelect,
	onClose,
}: {
	x: number;
	y: number;
	connectionIds: number[];
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

	// the list opens at the pressed point, moved back inside the screen once measured
	const listRef = useRef<HTMLDivElement>(null);
	const [listPosition, setListPosition] = useState({ left: x, top: y });
	// biome-ignore lint/correctness/useExhaustiveDependencies: measured again when the list changes
	useLayoutEffect(() => {
		const rect = listRef.current?.getBoundingClientRect();
		if (!rect) return;
		setListPosition({
			left: Math.max(
				MARGIN,
				Math.min(x, window.innerWidth - rect.width - MARGIN),
			),
			top: Math.max(
				MARGIN,
				Math.min(y, window.innerHeight - rect.height - MARGIN),
			),
		});
	}, [x, y, showList, connections.length]);

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
				<div
					ref={listRef}
					data-link-menu
					data-bar-menu
					style={{
						...boxStyle,
						padding: 0,
						left: listPosition.left,
						top: listPosition.top,
						maxHeight: 240,
						width: "max-content",
						maxWidth: window.innerWidth - 2 * MARGIN,
					}}
				>
					{connections.map((connection) => (
						// biome-ignore lint/a11y/useKeyWithClickEvents: same as the other floating menus
						<div
							key={connection.id}
							onClick={(e) =>
								onSelect(connection.id, { x: e.clientX, y: e.clientY })
							}
							style={{
								padding: "3px 6px",
								cursor: "pointer",
								whiteSpace: "nowrap",
								backgroundColor:
									connection.id === selectedId ? "orange" : "transparent",
								color:
									connection.id === selectedId
										? "var(--browntext)"
										: "var(--black)",
							}}
						>
							{labelOf(connection.src)} → {labelOf(connection.dest)}
						</div>
					))}
				</div>
			)}
		</>,
		document.body,
	);
};
