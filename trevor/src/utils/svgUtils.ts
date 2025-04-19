import type {
	MidiConnection,
	MidiDevice,
	MidiParameter,
	VirtualDevice,
	VirtualParameter,
} from "../model";

export const buildParameterId = (
	device: number,
	parameter: MidiParameter | VirtualParameter,
) => {
	const isVirtual = (parameter as VirtualParameter).consummer !== undefined;
	if (isVirtual) {
		return `${device}-__virtual__-${(parameter as VirtualParameter).cv_name}`;
	}
	return `${device}-${(parameter as MidiParameter).section_name}-${parameter.name}`;
};

export const buildSectionId = (device: number, section: string) => {
	return `${device}-${section}`;
};

export const connectionId = (connection: MidiConnection): string => {
	const srcId = connection.src.device;
	const dstId = connection.dest.device;
	const fromP = isVirtualParameter(connection.src.parameter)
		? connection.src.parameter.cv_name
		: connection.src.parameter.name;
	const toP = isVirtualParameter(connection.dest.parameter)
		? connection.dest.parameter.cv_name
		: connection.dest.parameter.name;
	return `${srcId}::${connection.src.parameter.section_name}::${fromP}-${dstId}::${connection.dest.parameter.section_name}::${toP}`;
};

export const isVirtualDevice = (
	device: VirtualDevice | MidiDevice,
): device is VirtualDevice => {
	return (device as VirtualDevice).paused !== undefined;
};

export const isVirtualParameter = (
	parameter: MidiParameter | VirtualParameter,
): parameter is VirtualParameter => {
	return parameter.section_name === "__virtual__";
};

export const connectionsOfInterest = (
	connection: MidiConnection,
	destDeviceId: number | undefined,
	destParameter: string | undefined,
) => {
	return (
		(connection.src.device === destDeviceId &&
			connection.src.parameter.section_name === destParameter) ||
		(connection.dest.device === destDeviceId &&
			connection.dest.parameter.section_name === destParameter)
	);
};

export const findConnectorElement = (connection: MidiConnection) => {
	const srcId = buildParameterId(
		connection.src.device,
		connection.src.parameter,
	);
	const destId = buildParameterId(
		connection.dest.device,
		connection.dest.parameter,
	);
	const fromElement = document.querySelector(`[id="${srcId}"]`);
	const toElement = document.querySelector(`[id="${destId}"]`);
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
		line.setAttribute("stroke", selected ? "orange" : "orange");
		line.setAttribute("stroke-width", selected ? "6" : "2");
		line.id = `${fromElement.id}-${toElement.id}`;
		line.setAttribute("marker-end", "url(#retro-arrowhead)");
		if (clickHandler) {
			line.addEventListener("click", clickHandler);
		}
		svg.appendChild(line);
	}
};
