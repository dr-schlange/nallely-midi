export interface NallelyState {
	input_ports: string[];
	output_ports: string[];
	midi_devices: MidiDevice[];
	virtual_devices: VirtualDevice[];
	connections: MidiConnection[];
	classes: NallelyClasses;
}

export interface VirtualDevice {
	id: number;
	meta: {
		name: string;
		parameters: VirtualParameter[];
	};
	config: {
		[key: string]: string | number | boolean;
	};
	paused: boolean;
}

export interface VirtualParameter {
	consummer: boolean;
	description: string | null;
	name: string;
	cv_name: string;
	range: [number, number];
	stream: boolean;
	// biome-ignore lint/suspicious/noExplicitAny: this might be any value really
	accepted_values: any[];
	section_name: string;
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
	ports: {
		input: string | null;
		output: string | null;
	};
}

// export interface MidiConfigValue {
// 	section_name: string;
// 	value: number;
// 	connections: MidiConnectionEnd[];
// }

export interface MidiConnection {
	src: MidiConnectionEnd;
	dest: MidiConnectionEnd;
}

export interface MidiConnectionEnd {
	device: number;
	parameter: MidiParameter | VirtualParameter;
	chain: MidiScaler | null;
}

export interface MidiDeviceSection {
	name: string;
	pads_or_keys: string | null;
	parameters: MidiParameter[];
	virtual: false;
}

export interface MidiParameter {
	cc_note: number;
	channel: number;
	description: string | null;
	init_value: number;
	section_name: string;
	name: string;
	range: [number, number];
	stream: boolean;
}

export type MidiDeviceWithSection = {
	device: MidiDevice;
	section: MidiDeviceSection;
};

export type VirtualDeviceWithSection = {
	device: VirtualDevice;
	section: VirtualDeviceSection;
};

export interface VirtualDeviceSection {
	parameters: VirtualParameter[];
	virtual: true;
	name: "__virtual__";
}

export interface NallelyClasses {
	virtual: string[];
	midi: string[];
}

export interface MidiScaler {
	device: number;
	min: number;
	max: number;
	auto: boolean;
	method: string;
}
