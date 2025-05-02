import { useEffect } from "react";
import type {
	MidiConnection,
	MidiDevice,
	MidiParameter,
	PadOrKey,
	PadsOrKeys,
	VirtualDevice,
	VirtualParameter,
} from "../model";

export const useGlobalShortcut = (
	callback: () => void,
	keys: { ctrl?: boolean; shift?: boolean; alt?: boolean; key: string },
) => {
	useEffect(() => {
		const handler = (event: KeyboardEvent) => {
			const { ctrl = false, shift = false, alt = false, key } = keys;

			if (
				event.key.toLowerCase() === key.toLowerCase() &&
				event.ctrlKey === ctrl &&
				event.shiftKey === shift &&
				event.altKey === alt
			) {
				event.preventDefault();
				callback();
			}
		};

		window.addEventListener("keydown", handler);
		return () => {
			window.removeEventListener("keydown", handler);
		};
	}, [callback, keys]);
};

export const buildParameterId = (
	device: number,
	parameter: MidiParameter | VirtualParameter | PadOrKey,
	forceParameterName: string | undefined = undefined,
) => {
	const isVirtual = (parameter as VirtualParameter).consumer !== undefined;
	if (isVirtual) {
		return `${device}-__virtual__-${(parameter as VirtualParameter).cv_name}`;
	}
	const paramName = forceParameterName || parameter.name;
	return `${device}-${(parameter as MidiParameter).section_name}-${paramName}`;
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
	parameter: MidiParameter | VirtualParameter | PadOrKey | PadsOrKeys,
): parameter is VirtualParameter => {
	return parameter.section_name === "__virtual__";
};

export const isPadOrdKey = (
	parameter: MidiParameter | VirtualParameter | PadOrKey | PadsOrKeys,
): parameter is PadOrKey => {
	return (parameter as PadOrKey).note !== undefined;
};

export const isPadsOrdKeys = (
	parameter: MidiParameter | VirtualParameter | PadOrKey | PadsOrKeys,
): parameter is PadsOrKeys => {
	return (parameter as PadsOrKeys).keys !== undefined;
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

export const buildConnectionName = (connection: MidiConnection) => {
	const srcParam = connection.src.parameter;
	let srcSection = "";
	if (!isVirtualParameter(srcParam)) {
		srcSection = `.${srcParam.section_name}`;
	}
	let srcParamName = srcParam.name;
	if (isPadOrdKey(srcParam)) {
		srcParamName = srcParam.name;
	}
	const dstParam = connection.dest.parameter;
	let dstSection = "";
	if (!isVirtualParameter(dstParam)) {
		dstSection = `.${dstParam.section_name}`;
	}
	let dstParamName = dstParam.name;
	if (isPadOrdKey(dstParam)) {
		dstParamName = dstParam.name;
	}

	return `${connection.src.repr}${srcSection}[${srcParamName}] → ${connection.dest.repr}${dstSection}[${dstParamName}]`;
};
