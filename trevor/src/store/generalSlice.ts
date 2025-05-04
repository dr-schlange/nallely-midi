import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { GeneralState } from "../model";

const initialState: GeneralState = {
	knownPatches: [],
	errors: [],
	trevorWebsocketURL: "localhost:6788",
};

const generalSlice = createSlice({
	name: "general",
	initialState,
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
	},
});

export const {
	setErrors,
	setWebsocketURL,
	clearErrors,
	setKnownPatches,
	clearKnownPatches,
} = generalSlice.actions;

export default generalSlice.reducer;
