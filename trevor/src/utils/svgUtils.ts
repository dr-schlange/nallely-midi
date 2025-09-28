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
) => {
	if (!fromElement || !toElement) return;

	const fromRect = fromElement.getBoundingClientRect();
	const toRect = toElement.getBoundingClientRect();
	const svgRect = svg.getBoundingClientRect();

	const fromCenterX = fromRect.left + fromRect.width / 2;
	const fromCenterY = fromRect.top + fromRect.height / 2;
	const toCenterX = toRect.left + toRect.width / 2;
	const toCenterY = toRect.top + toRect.height / 2;

	const deltaX = toCenterX - fromCenterX;
	const deltaY = toCenterY - fromCenterY;

	let fromX: number;
	let fromY: number;
	let toX: number;
	let toY: number;

	if (Math.abs(deltaY) < 100 && Math.abs(deltaX) >= 20) {
		fromX =
			deltaX < 0 ? fromRect.left - svgRect.left : fromRect.right - svgRect.left;
		fromY = fromCenterY - svgRect.top;
		toX = deltaX < 0 ? toRect.right - svgRect.left : toRect.left - svgRect.left;
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

		toX = deltaX < 0 ? toRect.right - svgRect.left : toRect.left - svgRect.left;
		toY = toCenterY - svgRect.top;
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
