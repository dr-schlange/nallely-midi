import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { NallelyState } from "../model";

const initialState: NallelyState = {
	input_ports: [],
	output_ports: [],
	midi_devices: [],
	virtual_devices: [],
	connections: [],
	classes: {
		virtual: [],
		midi: [],
	},
	playground_code: "",
};

const trevorSlice = createSlice({
	name: "midi",
	initialState,
	reducers: {
		setFullState: (state, action: PayloadAction<NallelyState>) => {
			state.input_ports = action.payload.input_ports;
			state.output_ports = action.payload.output_ports;
			state.midi_devices = action.payload.midi_devices;
			state.virtual_devices = action.payload.virtual_devices;
			state.connections = action.payload.connections;
			state.classes = {
				virtual: action.payload.classes.virtual,
				midi: action.payload.classes.midi,
			};
			state.playground_code = action.payload.playground_code;
		},
	},
});

export const { setFullState } = trevorSlice.actions;

export default trevorSlice.reducer;
