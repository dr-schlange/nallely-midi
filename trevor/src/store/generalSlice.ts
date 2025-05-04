import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { GeneralState } from "../model";

const initialState: GeneralState = {
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
		setWebsocketURL: (state, action: PayloadAction<string>) => {
			state.trevorWebsocketURL = action.payload;
		},
	},
});

export const { setErrors, setWebsocketURL, clearErrors } = generalSlice.actions;

export default generalSlice.reducer;
