import type { MidiConnection } from "../model";
import { buildParameterId } from "./utils";

export const findConnectorElement = (connection: MidiConnection) => {
	let srcId = buildParameterId(connection.src.device, connection.src.parameter);
	let destId = buildParameterId(
		connection.dest.device,
		connection.dest.parameter,
	);
	let fromElement = document.querySelector(`[id="${srcId}"]`);
	let toElement = document.querySelector(`[id="${destId}"]`);
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
		`[id="${fromElement.id}-${toElement.id}"]`,
	) as SVGElement;
};

export const drawConnection = (
	svg: SVGSVGElement,
	fromElement: Element | null,
	toElement: Element | null,
	selected = false,
	clickHandler?: (event: MouseEvent) => void,
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

	const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
	line.setAttribute("x1", fromX.toString());
	line.setAttribute("y1", fromY.toString());
	line.setAttribute("x2", toX.toString());
	line.setAttribute("y2", toY.toString());
	if (selected) {
		line.setAttribute("stroke-opacity", "1")
		line.setAttribute("stroke", "blue");
		line.setAttribute("stroke-width", "2.5");
		line.setAttribute("marker-end", "url(#selected-retro-arrowhead)");
	} else {
		line.setAttribute("stroke-opacity", "1")
		line.setAttribute("stroke", "gray");
		line.setAttribute("stroke-width", "2");
		line.setAttribute("marker-end", "url(#retro-arrowhead)");
	}
	line.id = `${fromElement.id}-${toElement.id}`;
	if (clickHandler) {
		line.addEventListener("click", clickHandler);
	}
	svg.appendChild(line);
};
