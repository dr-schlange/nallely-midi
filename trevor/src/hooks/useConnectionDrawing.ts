import { useCallback, useEffect, useMemo, useRef } from "react";
import type {
	Connection,
	ConnectionEnd,
	MidiDeviceWithSection,
	VirtualDeviceWithSection,
	VirtualParameter,
} from "../model";
import { useTrevorSelector } from "../store";
import { buildOwners, resolveInlinedAnchor } from "../utils/inlinedAnchors";
import { drawConnection, drawCurvedConnection } from "../utils/svgUtils";
import {
	buildParameterId,
	buildSectionId,
	connectionEndId,
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

	const owners = useMemo(
		() => buildOwners(midi_devices, virtual_devices),
		[midi_devices, virtual_devices],
	);
	const ownersRef = useRef(owners);
	ownersRef.current = owners;
	const oldView = useTrevorSelector((state) => state.runTime.oldView);
	const oldViewRef = useRef(oldView);
	oldViewRef.current = oldView;
	const barSelection = useTrevorSelector((state) => state.runTime.barSelection);
	const highlightedUnit = useTrevorSelector(
		(state) => state.runTime.highlightedUnit,
	);
	const barSelectionRef = useRef(barSelection);
	barSelectionRef.current = barSelection;
	const highlightedUnitRef = useRef(highlightedUnit);
	highlightedUnitRef.current = highlightedUnit;

	const svgRef = useRef<SVGSVGElement>(null);
	const updateConnectionsRef = useRef<number | null>(null);
	const throttleTimeoutRef = useRef<number | null>(null);

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
			const getElement = (id: string, isSelector = false) => {
				if (!elementCache.has(id)) {
					elementCache.set(
						id,
						document.querySelector(isSelector ? id : `[id="${id}"]`),
					);
				}
				return elementCache.get(id) ?? null;
			};

			// (the old view has no inlined devices: everything goes to the old elements)
			const findInlinedAnchor = (end: ConnectionEnd) =>
				oldViewRef.current
					? null
					: resolveInlinedAnchor(
							document,
							ownersRef.current,
							connectionEndId(end),
						);

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

				const fromInlined = findInlinedAnchor(connection.src);
				const toInlined = findInlinedAnchor(connection.dest);
				if (fromInlined && toInlined) continue;
				const fromElement = fromInlined?.element ?? getElement(srcId);
				const toElement = toInlined?.element ?? getElement(destId);

				const highlightConnected = sel.length === 1;
				const firstSelected = sel[0];
				const firstSelectedSection = firstSelected
					? internalSectionName(firstSelected.section)
					: undefined;
				const connectionRepr = connectionId(connection);
				const endIds = [
					connectionEndId(connection.src),
					connectionEndId(connection.dest),
				];
				const focusedParameter = barSelectionRef.current;
				const focusedUnit = highlightedUnitRef.current;
				const highlighted =
					connectionRepr === selected ||
					(focusedParameter !== null && endIds.includes(focusedParameter)) ||
					(focusedUnit !== null &&
						endIds.some((id) => {
							const owner = ownersRef.current.get(id);
							return (
								owner?.device === focusedUnit || owner?.section === focusedUnit
							);
						})) ||
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
		barSelection,
		highlightedUnit,
		oldView,
		updateConnections,
	]);

	useEffect(() => {
		let resizeTimeout: number;
		const handleResize = () => {
			clearTimeout(resizeTimeout);
			resizeTimeout = window.setTimeout(() => updateConnections(), 100);
		};
		const observer = new ResizeObserver(handleResize);
		const parent = svgRef.current?.parentElement;
		if (parent) {
			observer.observe(parent);
		}
		const mutation = new MutationObserver((records) => {
			if (
				records.some(
					(r) =>
						!svgRef.current?.contains(r.target) &&
						(r.type === "childList" ||
							(r.target instanceof Element &&
								r.target.hasAttribute("data-link-frame"))),
				)
			)
				handleResize();
		});
		if (parent) {
			mutation.observe(parent, {
				childList: true,
				subtree: true,
				attributes: true,
				attributeFilter: ["style"],
			});
		}
		return () => {
			observer.disconnect();
			mutation.disconnect();
			clearTimeout(resizeTimeout);
		};
	}, [updateConnections]);

	return { svgRef, updateConnections, updateConnectionsThrottled };
};
