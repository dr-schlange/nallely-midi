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
import { store } from "../store";
import { useTrevorWebSocket } from "../websockets/websocket";
import { setLogComponent } from "../store/runtimeSlice";

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

export const isLogMode = () => {
	return document.body.style.cursor === "zoom-in";
};

export const isClassCodeMode = () => {
	return document.body.style.cursor === "crosshair";
};

export const setDebugMode = (
	event: { stopPropagation: () => void },
	componentId: number | string,
	activate: boolean,
) => {
	if (!isLogMode()) {
		return;
	}
	const trevorSocket = useTrevorWebSocket();
	event.stopPropagation();
	if (activate) {
		trevorSocket.startCaptureSTDOUT(componentId);
		store.dispatch(setLogComponent(componentId));
	} else {
		trevorSocket.stopCaptureSTDOUT(componentId);
		store.dispatch(setLogComponent(undefined));
	}
};

export const generateAcronym = (name: string, length = 3): string => {
	return name
		.split(" ")
		.map((word) => {
			if (!word) return "";
			word = word.replace(/Section$/, "");
			if (word.length <= length) {
				return word;
			}
			const firstChar = word[0];
			const rest = word.slice(1).replace(/[aeiou]/gi, "");
			return (firstChar + rest).slice(0, length);
		})
		.join("")
		.toUpperCase();
};

const LOCAL_STORAGE_KEY = "order-in-rack";
const EMPTY_ORDER = {
	midi: [],
	virtuals: [],
	widgets: [],
};

const JSONClone = (d) => {
	return JSON.parse(JSON.stringify(d));
};

export const loadDeviceOrder = (rack: string): string[] | number[] => {
	try {
		const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
		return raw ? JSON.parse(raw)[rack] : [];
	} catch {
		return [];
	}
};

export const saveDeviceOrder = (rack: string, ids: string[] | number[]) => {
	try {
		const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
		const orderMem = raw ? JSON.parse(raw) : JSONClone(EMPTY_ORDER);
		orderMem[rack] = ids;
		localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(orderMem));
	} catch {
		console.debug(
			`Cannot read properly ${LOCAL_STORAGE_KEY}, removing the previously saved order if any`,
		);
	}
};

export type HasId = { id: string | number };

export const mergeDevicesPreservingOrder = <T extends HasId>(
	rack: string,
	incoming: T[],
): T[] => {
	const savedOrder = loadDeviceOrder(rack);
	const incomingById = new Map<string | number, T>(
		incoming.map((d) => [d.id, d]),
	);

	const ordered: T[] = [];
	for (const id of savedOrder) {
		const device = incomingById.get(id);
		if (device) {
			ordered.push(device);
			incomingById.delete(id); // remove from remaining
		}
	}

	const remaining = Array.from(incomingById.values());

	return [...ordered, ...remaining];
};
