import type {
	MidiConnection,
	MidiDeviceSection,
	MidiParameter,
} from "../model";

export const buildParameterId = (device: number, parameter: MidiParameter) => {
	return `${device}-${parameter.module_state_name}-${parameter.name}`;
};

export const buildSectionId = (device: number, section: string) => {
	return `${device}-${section}`;
};

export const connectionsOfInterest = (
	connection: MidiConnection,
	destDeviceId: number | undefined,
	destParameter: string | undefined,
) => {
	return (
		(connection.src.device === destDeviceId &&
			connection.src.parameter.module_state_name === destParameter) ||
		(connection.dest.device === destDeviceId &&
			connection.dest.parameter.module_state_name === destParameter)
	);
};

export const drawConnection = (
	svg: SVGSVGElement,
	fromElement: Element | null,
	toElement: Element | null,
	clickHandler?: (event: MouseEvent) => void,
) => {
	if (fromElement && toElement) {
		const fromRect = fromElement.getBoundingClientRect();
		const toRect = toElement.getBoundingClientRect();

		const svgRect = svg.getBoundingClientRect();
		let fromX: number;
		let fromY: number;
		let toX: number;
		let toY: number;

		if (fromRect.top > toRect.bottom) {
			// fromRect is below toRect
			fromX = fromRect.left + fromRect.width / 2 - svgRect.left;
			fromY = fromRect.top - svgRect.top;
			toX = toRect.left + toRect.width / 2 - svgRect.left;
			toY = toRect.bottom - svgRect.top;
		} else if (toRect.top > fromRect.bottom) {
			// toRect is below fromRect
			fromX = fromRect.left + fromRect.width / 2 - svgRect.left;
			fromY = fromRect.bottom - svgRect.top;
			toX = toRect.left + toRect.width / 2 - svgRect.left;
			toY = toRect.top - svgRect.top;
		} else if (fromRect.right < toRect.left) {
			// fromRect is left of toRect
			fromX = fromRect.right - svgRect.left;
			fromY = fromRect.top + fromRect.height / 2 - svgRect.top;
			toX = toRect.left - svgRect.left;
			toY = toRect.top + toRect.height / 2 - svgRect.top;
		} else if (toRect.right < fromRect.left) {
			// toRect is left of fromRect
			fromX = fromRect.left - svgRect.left;
			fromY = fromRect.top + fromRect.height / 2 - svgRect.top;
			toX = toRect.right - svgRect.left;
			toY = toRect.top + toRect.height / 2 - svgRect.top;
		} else {
			// Default case: draw from center to center
			fromX = fromRect.left + fromRect.width / 2 - svgRect.left;
			fromY = fromRect.top + fromRect.height / 2 - svgRect.top;
			toX = toRect.left + toRect.width / 2 - svgRect.left;
			toY = toRect.top + toRect.height / 2 - svgRect.top;
		}

		const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
		line.setAttribute("x1", fromX.toString());
		line.setAttribute("y1", fromY.toString());
		line.setAttribute("x2", toX.toString());
		line.setAttribute("y2", toY.toString());
		line.setAttribute("stroke", "orange");
		line.setAttribute("stroke-width", "2");
		line.id = `${fromElement.id}-${toElement.id}`;
		line.setAttribute("marker-end", "url(#retro-arrowhead)");
		if (clickHandler) {
			line.addEventListener("click", clickHandler);
		}
		svg.appendChild(line);
	}
};
