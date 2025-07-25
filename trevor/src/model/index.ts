export interface NallelyState {
	input_ports: string[];
	output_ports: string[];
	midi_devices: MidiDevice[];
	virtual_devices: VirtualDevice[];
	connections: MidiConnection[];
	classes: NallelyClasses;
	playground_code: string;
}

export interface VirtualDevice {
	id: number;
	repr: string;
	meta: {
		name: string;
		parameters: VirtualParameter[];
	};
	config: {
		[key: string]: string | number | boolean;
	};
	paused: boolean;
	running: boolean;
}

export interface VirtualParameter {
	consumer: boolean;
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
	repr: string;
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
	bouncy: boolean;
	id: number;
}

export interface MidiConnectionEnd {
	device: number;
	repr: string;
	parameter: MidiParameter | VirtualParameter;
	chain: MidiScaler | null;
	explicit: number;
	type: string;
}

export interface MidiDeviceSection {
	name: string;
	pads_or_keys: PadsOrKeys | null;
	pitchwheel: Pitchwheel | null;
	parameters: MidiParameter[];
	virtual: false;
}

export interface PadsOrKeys {
	channel: number;
	keys: Record<any, any>;
	section_name: string;
	cc_note: -1;
	name: string;
	range: [number, number];
}

export interface PadOrKey {
	section_name: string;
	note: number;
	name: string;
	type: string;
	mode: string;
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

export type Pitchwheel = PadOrKey;

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
	pads_or_keys: null;
	pitchwheel: null;
}

export interface NallelyClasses {
	virtual: string[];
	midi: string[];
}

export interface MidiScaler {
	id: number;
	device: number;
	to_min: number;
	to_max: number;
	auto: boolean;
	method: string;
	as_int: boolean;
}

export interface GeneralState {
	errors: string[];
	knownPatches: string[];
	trevorWebsocketURL: string;
	connected: string;
	firstLaunch: boolean;
}

export type CCValues = Record<
	number,
	Record<string, Record<string, Record<string, number>>>
>;

export interface RunTimeState {
	logMode: boolean;
	loggedComponent: number | string | undefined;
	patchFilename: string;
	saveDefaultValue: boolean;
	classCodeMode: boolean;
	classCode: ClassCode;
	ccValues: CCValues;
}

export interface ClassCode {
	className: string;
	methods: Record<string, string>;
}
