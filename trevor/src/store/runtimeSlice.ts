import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { RunTimeState } from "../model";

export const initialGeneralState: RunTimeState = {
	logMode: false,
	loggedComponent: undefined,
};

const runtimeSlice = createSlice({
	name: "runTime",
	initialState: initialGeneralState,
	reducers: {
		setLogMode: (state, action: PayloadAction<boolean>) => {
			state.logMode = action.payload;
		},
		setLogComponent: (state, action: PayloadAction<number | string | undefined>) => {
			state.loggedComponent = action.payload;
		},
	},
});

export const { setLogMode, setLogComponent } = runtimeSlice.actions;

export default runtimeSlice.reducer;
