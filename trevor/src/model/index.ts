export interface NallelyState {
	input_ports: string[];
	output_ports: string[];
	midi_devices: MidiDevice[];
}

export interface MidiDevice {
	id: number;
	meta: {
		name: string;
		sections: MidiDeviceSection[];
	};
	config: {
		[key: string]: Record<string, number>;
	};
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
