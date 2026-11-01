// LLM generated
import type { MidiDevice, VirtualDevice } from "../model";
import { devUID, internalSectionName, parameterUUID } from "./utils";

export interface Owner {
	section: string;
	device: string;
}

export const buildOwners = (
	midiDevices: MidiDevice[],
	virtualDevices: VirtualDevice[],
) => {
	const owners = new Map<string, Owner>();
	for (const device of midiDevices) {
		for (const section of device.meta.sections) {
			const owner = {
				section: `${device.id}::${internalSectionName(section)}`,
				device: `${device.id}`,
			};
			if (section.pads_or_keys) {
				owners.set(parameterUUID(device.id, section.pads_or_keys), owner);
			}
			for (const p of [...section.parameters, ...(section.pitchwheels ?? [])]) {
				owners.set(parameterUUID(device.id, p), owner);
			}
		}
	}
	for (const device of virtualDevices) {
		const owner = {
			section: `${devUID(device)}::__virtual__`,
			device: devUID(device),
		};
		for (const p of device.meta.parameters) {
			owners.set(parameterUUID(device.id, p), owner);
		}
	}
	return owners;
};

export interface InlinedAnchor {
	element: Element;
	key: string;
	port: boolean;
}

const isVisible = (element: Element | null): element is Element =>
	element !== null && element.getBoundingClientRect().width > 0;

export const resolveInlinedAnchor = (
	root: ParentNode,
	owners: Map<string, Owner>,
	parameterId: string,
): InlinedAnchor | null => {
	const bar = root.querySelector(`[data-bar-id="${parameterId}"]`);
	if (isVisible(bar)) return { element: bar, key: parameterId, port: false };
	const owner = owners.get(parameterId);
	if (!owner) return null;
	for (const unit of [owner.section, owner.device]) {
		const port = root.querySelector(`[data-port-unit="${unit}"]`);
		if (isVisible(port))
			return { element: port, key: `port:${unit}`, port: true };
	}
	return null;
};
