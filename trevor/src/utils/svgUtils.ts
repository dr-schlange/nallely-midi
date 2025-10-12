import type { MidiConnection } from "../model";
import { buildParameterId, setDebugMode } from "./utils";

export const findConnectorElement = (connection: MidiConnection) => {
	let srcId = buildParameterId(connection.src.device, connection.src.parameter);
	let destId = buildParameterId(
		connection.dest.device,
		connection.dest.parameter,
	);
	let fromElement = document.querySelector(`[id="${srcId}"]`);
	const all = document.querySelectorAll(`[id="${destId}"]`);
	let toElement = all.length > 0 ? all[all.length - 1] : null;
	if (!fromElement) {
		srcId = buildParameterId(
			connection.src.device,
			connection.src.parameter,
			"closed",
		);
		fromElement = document.querySelector(`[id="${srcId}"]`);
	}
	if (!toElement) {
		destId = buildParameterId(
			connection.dest.device,
			connection.dest.parameter,
			"closed",
		);
		toElement = document.querySelector(`[id="${destId}"]`);
	}
	return [fromElement, toElement];
};

export const findSvgConnection = (
	connection: MidiConnection,
): SVGElement | null => {
	const [fromElement, toElement] = findConnectorElement(connection);
	if (!fromElement || !toElement) {
		return null;
	}
	return document.querySelector(
		`[id="${fromElement.id}::${toElement.id}"]`,
	) as SVGElement;
};

export const drawConnection = (
	svg: SVGSVGElement,
	fromElement: Element | null,
	toElement: Element | null,
	selected = false,
	opts = { bouncy: false, muted: false },
	linkId?: number | undefined,
	clickHandler?: (event: MouseEvent) => void,
	setMouseInteracting?: (value: boolean) => void,
	orientation?: "horizontal" | "vertical" | undefined,
) => {
	if (!fromElement || !toElement) return;

	const fromRect = fromElement.getBoundingClientRect();
	const toRect = toElement.getBoundingClientRect();
	const svgRect = svg.getBoundingClientRect();

	const fromCenterX = fromRect.left + fromRect.width / 2;
	const fromCenterY = fromRect.top + fromRect.height / 2;
	const toCenterX = toRect.left + toRect.width / 2;
	const toCenterY = toRect.top + toRect.height / 2;

	let fromX: number;
	let fromY: number;
	let toX: number;
	let toY: number;

	if (orientation === "horizontal") {
		// If elements are vertically aligned (X overlap), connect top/bottom faces; else, connect left/right faces
		const xThreshold = Math.min(fromRect.width, toRect.width) / 2;
		const xOverlap =
			fromRect.left <= toRect.right - xThreshold &&
			fromRect.right >= toRect.left + xThreshold;
		if (xOverlap && fromRect.top !== toRect.top) {
			// Connect top/bottom faces
			if (fromCenterY < toCenterY) {
				fromX = (fromRect.left + fromRect.right) / 2 - svgRect.left;
				fromY = fromRect.bottom - svgRect.top;
				toX = (toRect.left + toRect.right) / 2 - svgRect.left;
				toY = toRect.top - svgRect.top;
			} else {
				fromX = (fromRect.left + fromRect.right) / 2 - svgRect.left;
				fromY = fromRect.top - svgRect.top;
				toX = (toRect.left + toRect.right) / 2 - svgRect.left;
				toY = toRect.bottom - svgRect.top;
			}
		} else {
			// Default: connect left/right faces
			if (fromCenterX < toCenterX) {
				fromX = fromRect.right - svgRect.left;
				fromY = (fromRect.top + fromRect.bottom) / 2 - svgRect.top;
				toX = toRect.left - svgRect.left;
				toY = (toRect.top + toRect.bottom) / 2 - svgRect.top;
			} else {
				fromX = fromRect.left - svgRect.left;
				fromY = (fromRect.top + fromRect.bottom) / 2 - svgRect.top;
				toX = toRect.right - svgRect.left;
				toY = (toRect.top + toRect.bottom) / 2 - svgRect.top;
			}
		}
	} else if (orientation === "vertical") {
		// If elements are horizontally aligned (Y overlap), connect left/right faces; else, connect top/bottom faces
		const yThreshold = Math.min(fromRect.height, toRect.height) / 2;
		const yOverlap =
			fromRect.top <= toRect.bottom - yThreshold &&
			fromRect.bottom >= toRect.top + yThreshold;
		if (yOverlap && fromRect.left !== toRect.left) {
			// Connect left/right faces
			if (fromCenterX < toCenterX) {
				fromX = fromRect.right - svgRect.left;
				fromY = (fromRect.top + fromRect.bottom) / 2 - svgRect.top;
				toX = toRect.left - svgRect.left;
				toY = (toRect.top + toRect.bottom) / 2 - svgRect.top;
			} else {
				fromX = fromRect.left - svgRect.left;
				fromY = (fromRect.top + fromRect.bottom) / 2 - svgRect.top;
				toX = toRect.right - svgRect.left;
				toY = (toRect.top + toRect.bottom) / 2 - svgRect.top;
			}
		} else {
			// Default: connect top/bottom faces
			if (fromCenterY < toCenterY) {
				fromX = fromCenterX - svgRect.left;
				fromY = fromRect.bottom - svgRect.top;
				toX = toCenterX - svgRect.left;
				toY = toRect.top - svgRect.top;
			} else {
				fromX = fromCenterX - svgRect.left;
				fromY = fromRect.top - svgRect.top;
				toX = toCenterX - svgRect.left;
				toY = toRect.bottom - svgRect.top;
			}
		}
	} else {
		const deltaX = toCenterX - fromCenterX;
		const deltaY = toCenterY - fromCenterY;
		if (Math.abs(deltaY) < 100 && Math.abs(deltaX) >= 20) {
			fromX =
				deltaX < 0
					? fromRect.left - svgRect.left
					: fromRect.right - svgRect.left;
			fromY = fromCenterY - svgRect.top;
			toX =
				deltaX < 0 ? toRect.right - svgRect.left : toRect.left - svgRect.left;
			toY = toCenterY - svgRect.top;
		} else if (Math.abs(deltaX) < 20) {
			fromX = fromCenterX - svgRect.left;
			fromY =
				deltaY < 0 ? fromRect.top - svgRect.top : fromRect.bottom - svgRect.top;
			toX = toCenterX - svgRect.left;
			toY = deltaY < 0 ? toRect.bottom - svgRect.top : toRect.top - svgRect.top;
		} else {
			fromX = fromCenterX - svgRect.left;
			fromY =
				deltaY < 0 ? fromRect.top - svgRect.top : fromRect.bottom - svgRect.top;
			toX =
				deltaX < 0 ? toRect.right - svgRect.left : toRect.left - svgRect.left;
			toY = toCenterY - svgRect.top;
		}
	}

	const drawLine = (
		id: string,
		options: {
			stroke: string;
			strokeWidth: number;
			strokeOpacity: string;
			pointerEvents?: string;
			markerEnd?: string;
			dashed?: boolean;
		},
	) => {
		const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
		line.setAttribute("x1", fromX.toString());
		line.setAttribute("y1", fromY.toString());
		line.setAttribute("x2", toX.toString());
		line.setAttribute("y2", toY.toString());
		line.setAttribute("stroke", options.stroke);
		line.setAttribute("stroke-width", options.strokeWidth.toString());
		line.setAttribute("stroke-opacity", options.strokeOpacity);
		if (options.dashed) {
			line.setAttribute("stroke-dasharray", "5, 5");
		}
		if (options.pointerEvents) {
			line.setAttribute("pointer-events", options.pointerEvents);
		}
		if (options.markerEnd) {
			line.setAttribute("marker-end", options.markerEnd);
		}
		line.id = id;
		return line;
	};

	// Draw actual visible line
	const color = selected ? "blue" : opts.bouncy ? "green" : "gray";
	const marker = selected
		? "url(#selected-retro-arrowhead)"
		: opts.bouncy
			? "url(#bouncy-retro-arrowhead)"
			: "url(#retro-arrowhead)";

	const visibleLine = drawLine(`${fromElement.id}::${toElement.id}`, {
		stroke: color,
		strokeWidth: selected ? 2.5 : 2,
		strokeOpacity: "1",
		markerEnd: marker,
		dashed: opts.muted,
	});

	// Append visible line first, then hit line on top for click handling
	svg.appendChild(visibleLine);

	if (linkId) {
		const hitLine = drawLine(`${fromElement.id}::${toElement.id}-hit`, {
			stroke: "transparent",
			strokeWidth: 18,
			strokeOpacity: "0",
			pointerEvents: clickHandler ? "stroke" : "none",
		});

		if (clickHandler) {
			hitLine.addEventListener("mousedown", () => {
				setMouseInteracting?.(true);
			});

			hitLine.addEventListener("mouseup", () => {
				setTimeout(() => setMouseInteracting?.(false), 100);
			});

			hitLine.addEventListener("click", clickHandler);
		}

		hitLine.addEventListener("touchstart", (e) =>
			setDebugMode(e, linkId, true),
		);
		hitLine.addEventListener("touchend", (e) => setDebugMode(e, linkId, false));
		hitLine.addEventListener("mouseenter", (e) =>
			setDebugMode(e, linkId, true),
		);
		hitLine.addEventListener("mouseleave", (e) =>
			setDebugMode(e, linkId, false),
		);

		svg.appendChild(hitLine);
	}
};

export const drawCurvedConnection = (
	svg: SVGSVGElement,
	fromElement: Element | null,
	toElement: Element | null,
	selected = false,
	opts = { bouncy: false, muted: false },
	linkId?: number | undefined,
	clickHandler?: (event: MouseEvent) => void,
	setMouseInteracting?: (value: boolean) => void,
) => {
	if (!fromElement || !toElement) return;

	const fromRect = fromElement.getBoundingClientRect();
	const toRect = toElement.getBoundingClientRect();
	const svgRect = svg.getBoundingClientRect();

	const fromCenterX = fromRect.left + fromRect.width / 2;
	const fromCenterY = fromRect.top + fromRect.height / 2;
	const toCenterX = toRect.left + toRect.width / 2;
	const toCenterY = toRect.top + toRect.height / 2;

	const fromX = fromCenterX - svgRect.left;
	const fromY = fromCenterY - svgRect.top;
	const toX = toCenterX - svgRect.left;
	const toY = toCenterY - svgRect.top;

	const drawCurve = (
		id: string,
		options: {
			stroke: string;
			strokeWidth: number;
			strokeOpacity: string;
			pointerEvents?: string;
			markerEnd?: string;
			dashed?: boolean;
		},
		drop = 80, // how much it "sags" in pixels
	) => {
		const path = document.createElementNS("http://www.w3.org/2000/svg", "path");

		const midX = (fromX + toX) / 2;
		const midY = (fromY + toY) / 2;

		let cx = midX;
		let cy = midY + drop; // pull downward for sag effect

		// If mostly vertical, sag sideways
		if (Math.abs(toY - fromY) > Math.abs(toX - fromX)) {
			cx = midX + drop; // pull sideways instead
			cy = midY;
		}

		const d = `M ${fromX},${fromY} Q ${cx},${cy} ${toX},${toY}`;

		path.setAttribute("d", d);
		path.setAttribute("fill", "none");
		path.setAttribute("stroke", options.stroke);
		path.setAttribute("stroke-width", options.strokeWidth.toString());
		path.setAttribute("stroke-opacity", options.strokeOpacity);
		if (options.dashed) path.setAttribute("stroke-dasharray", "5,5");
		if (options.pointerEvents)
			path.setAttribute("pointer-events", options.pointerEvents);
		if (options.markerEnd) path.setAttribute("marker-end", options.markerEnd);
		path.id = id;

		return path;
	};

	// Draw actual visible line
	const color = selected ? "blue" : opts.bouncy ? "green" : "#5a87bbff";
	const marker = selected
		? "url(#selected-retro-arrowhead)"
		: opts.bouncy
			? "url(#bouncy-retro-arrowhead)"
			: "url(#retro-arrowhead)";

	const visibleLine = drawCurve(`${fromElement.id}::${toElement.id}`, {
		stroke: color,
		strokeWidth: selected ? 2.5 : 2,
		strokeOpacity: "1",
		markerEnd: marker,
		dashed: opts.muted,
	});

	// Append visible line first, then hit line on top for click handling
	svg.appendChild(visibleLine);

	if (linkId) {
		const hitLine = drawCurve(`${fromElement.id}::${toElement.id}-hit`, {
			stroke: "transparent",
			strokeWidth: 18,
			strokeOpacity: "0",
			pointerEvents: clickHandler ? "stroke" : "none",
		});

		if (clickHandler) {
			hitLine.addEventListener("mousedown", () => {
				setMouseInteracting?.(true);
			});

			hitLine.addEventListener("mouseup", () => {
				setTimeout(() => setMouseInteracting?.(false), 100);
			});

			hitLine.addEventListener("click", clickHandler);
		}

		hitLine.addEventListener("touchstart", (e) =>
			setDebugMode(e, linkId, true),
		);
		hitLine.addEventListener("touchend", (e) => setDebugMode(e, linkId, false));
		hitLine.addEventListener("mouseenter", (e) =>
			setDebugMode(e, linkId, true),
		);
		hitLine.addEventListener("mouseleave", (e) =>
			setDebugMode(e, linkId, false),
		);

		svg.appendChild(hitLine);
	}
};
