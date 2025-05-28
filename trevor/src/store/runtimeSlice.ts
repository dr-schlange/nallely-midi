import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { RunTimeState } from "../model";

export const initialGeneralState: RunTimeState = {
	logMode: false,
	loggedComponent: undefined,
	patchFilename: "patch",
};

const runtimeSlice = createSlice({
	name: "runTime",
	initialState: initialGeneralState,
	reducers: {
		setLogMode: (state, action: PayloadAction<boolean>) => {
			state.logMode = action.payload;
		},
		setLogComponent: (
			state,
			action: PayloadAction<number | string | undefined>,
		) => {
			state.loggedComponent = action.payload;
		},
		setPatchFilename: (state, action: PayloadAction<string>) => {
			state.patchFilename = action.payload;
		},
	},
});

export const { setLogMode, setLogComponent, setPatchFilename } =
	runtimeSlice.actions;

export default runtimeSlice.reducer;
