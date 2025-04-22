import { useEffect } from "react";
import type {
	MidiConnection,
	MidiDevice,
	MidiParameter,
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
