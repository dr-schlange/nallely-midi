import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { NallelyState } from "../model";

const initialState: NallelyState = {
	input_ports: [],
	output_ports: [],
	midi_devices: [],
	connections: [],
};

const trevorSlice = createSlice({
	name: "midi",
	initialState,
	reducers: {
		setFullState: (state, action: PayloadAction<NallelyState>) => {
			state.input_ports = action.payload.input_ports;
			state.output_ports = action.payload.output_ports;
			state.midi_devices = action.payload.midi_devices;
			state.connections = action.payload.connections;
		},
	},
});

export const { setFullState } = trevorSlice.actions;

export default trevorSlice.reducer;
