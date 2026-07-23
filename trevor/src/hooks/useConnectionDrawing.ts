import { useCallback, useEffect, useRef } from "react";
import type {
	Connection,
	MidiDeviceWithSection,
	VirtualDeviceWithSection,
	VirtualParameter,
} from "../model";
import { useTrevorSelector } from "../store";
import { drawConnection, drawCurvedConnection } from "../utils/svgUtils";
import {
	buildParameterId,
	buildSectionId,
	connectionId,
	internalSectionName,
} from "../utils/utils";

interface UseConnectionDrawingParams {
	allConnections: Connection[];
	selectedConnection: string | undefined;
	selection: (MidiDeviceWithSection | VirtualDeviceWithSection)[];
}

export const useConnectionDrawing = ({
	allConnections,
	selectedConnection,
	selection,
}: UseConnectionDrawingParams) => {
	const midi_devices = useTrevorSelector((state) => state.nallely.midi_devices);
	const virtual_devices = useTrevorSelector(
		(state) => state.nallely.virtual_devices,
	);

	const svgRef = useRef<SVGSVGElement>(null);
	const updateConnectionsRef = useRef<number | null>(null);
	const throttleTimeoutRef = useRef<number | null>(null);

	// Refs so the RAF callback always reads the latest values without being
	// re-created on every state change (which would cancel in-flight frames).
	const allConnectionsRef = useRef(allConnections);
	const selectedConnectionRef = useRef(selectedConnection);
	const selectionRef = useRef(selection);

	useEffect(() => {
		allConnectionsRef.current = allConnections;
	}, [allConnections]);
	useEffect(() => {
		selectedConnectionRef.current = selectedConnection;
	}, [selectedConnection]);
	useEffect(() => {
		selectionRef.current = selection;
	}, [selection]);

	const updateConnections = useCallback(() => {
		if (updateConnectionsRef.current !== null) {
			cancelAnimationFrame(updateConnectionsRef.current);
		}
		updateConnectionsRef.current = requestAnimationFrame(() => {
			const svg = svgRef.current;
			if (!svg) return;
			svg.innerHTML = "";
			updateConnectionsRef.current = null;

			const connections = allConnectionsRef.current;
			const selected = selectedConnectionRef.current;
			const sel = selectionRef.current;

			const sortedConnections = [...connections].sort((a, b) => {
				const isSelected = (x: Connection) => connectionId(x) === selected;
				if (isSelected(a) && !isSelected(b)) return 1;
				if (!isSelected(a) && isSelected(b)) return -1;
				return 0;
			});

			const elementCache = new Map<string, Element | null>();
			const getElement = (id: string) => {
				if (!elementCache.has(id)) {
					elementCache.set(id, document.querySelector(`[id="${id}"]`));
				}
				return elementCache.get(id) ?? null;
			};

			for (const connection of sortedConnections) {
				const srcSection = connection.src.parameter.section_name;
				const srcId =
					srcSection === "__virtual__"
						? buildParameterId(connection.src.device, connection.src.parameter)
						: buildSectionId(connection.src.device, srcSection);
				const dstSection = connection.dest.parameter.section_name;
				const destId =
					dstSection === "__virtual__"
						? buildParameterId(
								connection.dest.device,
								connection.dest.parameter,
							)
						: buildSectionId(connection.dest.device, dstSection);

				const fromElement = getElement(srcId);
				const toElement = getElement(destId);

				const highlightConnected = sel.length === 1;
				const firstSelected = sel[0];
				const firstSelectedSection = firstSelected
					? internalSectionName(firstSelected.section)
					: undefined;
				const connectionRepr = connectionId(connection);
				const highlighted =
					connectionRepr === selected ||
					(highlightConnected &&
						!!firstSelected &&
						(connectionRepr.startsWith(
							`${firstSelected.device.id}::${firstSelectedSection}`,
						) ||
							connectionRepr.includes(
								`-${firstSelected.device.id}::${firstSelectedSection}`,
							)));

				drawCurvedConnection(
					svg,
					fromElement,
					toElement,
					highlighted,
					{ bouncy: connection.bouncy, muted: connection.muted },
					connection.id,
				);

				// Draw an extra line from the widget tile to the port for WebSocketBus connections
				if (connection.src.repr.includes("WebSocketBus")) {
					const port = (connection.src.parameter as VirtualParameter).cv_name;
					const widgetTarget = getElement(port.split(/_/)[0]);
					drawConnection(svg, widgetTarget, fromElement, highlighted, {
						bouncy: false,
						muted: true,
					});
				}
				if (connection.dest.repr.includes("WebSocketBus")) {
					const port = (connection.dest.parameter as VirtualParameter).cv_name;
					const widgetTarget = getElement(port.split(/_/)[0]);
					drawConnection(svg, toElement, widgetTarget, highlighted, {
						bouncy: false,
						muted: true,
					});
				}
			}
		});
	}, []);

	const updateConnectionsThrottled = useCallback(() => {
		if (throttleTimeoutRef.current !== null) return;
		throttleTimeoutRef.current = window.setTimeout(() => {
			updateConnections();
			throttleTimeoutRef.current = null;
		}, 16);
	}, [updateConnections]);

	useEffect(() => {
		updateConnections();
	}, [
		allConnections,
		midi_devices,
		virtual_devices,
		selection,
		updateConnections,
	]);

	useEffect(() => {
		let resizeTimeout: number;
		const handleResize = () => {
			clearTimeout(resizeTimeout);
			resizeTimeout = window.setTimeout(() => updateConnections(), 100);
		};
		const observer = new ResizeObserver(handleResize);
		if (svgRef.current) {
			observer.observe(svgRef.current.parentElement as HTMLElement);
		}
		return () => {
			observer.disconnect();
			clearTimeout(resizeTimeout);
		};
	}, [updateConnections]);

	return { svgRef, updateConnections, updateConnectionsThrottled };
};
