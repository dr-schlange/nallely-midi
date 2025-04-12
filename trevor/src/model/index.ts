export interface NallelyState {
	input_ports: string[];
	output_ports: string[];
	midi_devices: MidiDevice[];
	connections: MidiConnection[];
}

export interface MidiDevice {
	id: number;
	meta: {
		name: string;
		sections: MidiDeviceSection[];
	};
	config: {
		// [key: string]: Record<string, MidiConfigValue>;
		[key: string]: Record<string, number>;
	};
}

// export interface MidiConfigValue {
// 	module_state_name: string;
// 	value: number;
// 	connections: MidiConnectionEnd[];
// }

export interface MidiConnection {
	src: MidiConnectionEnd;
	dest: MidiConnectionEnd;
}

export interface MidiConnectionEnd {
	device: number;
	parameter: MidiParameter;
}

export interface MidiDeviceSection {
	name: string;
	pads_or_keys: string | null;
	parameters: MidiParameter[];
}

export interface MidiParameter {
	cc_note: number;
	channel: number;
	description: string | null;
	init_value: number;
	module_state_name: string;
	name: string;
	range: [number, number];
	stream: boolean;
}

export type MidiDeviceWithSection = {
	device: MidiDevice;
	section: MidiDeviceSection;
};
