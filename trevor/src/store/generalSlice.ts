import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { GeneralState } from "../model";

export const initialGeneralState: GeneralState = {
	knownPatches: [],
	errors: [],
	trevorWebsocketURL: "ws://localhost:6788",
	connected: "disconnected",
	firstLaunch: true,
};

const generalSlice = createSlice({
	name: "general",
	initialState: initialGeneralState,
	reducers: {
		setErrors: (state, action: PayloadAction<string[]>) => {
			state.errors = action.payload;
		},
		clearErrors: (state) => {
			state.errors = [];
		},
		setKnownPatches: (state, action: PayloadAction<string[]>) => {
			state.knownPatches = action.payload;
		},
		clearKnownPatches: (state) => {
			state.knownPatches = [];
		},
		setWebsocketURL: (state, action: PayloadAction<string>) => {
			state.trevorWebsocketURL = action.payload;
		},
		setConnected: (state, action: PayloadAction<string>) => {
			state.connected = action.payload;
		},
		disableFirstLaunch: (state) => {
			state.firstLaunch = false;
		},
	},
});

export const {
	setErrors,
	setWebsocketURL,
	clearErrors,
	setKnownPatches,
	clearKnownPatches,
	setConnected,
	disableFirstLaunch,
} = generalSlice.actions;

export default generalSlice.reducer;
