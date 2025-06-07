import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { RunTimeState, ClassCode } from "../model";

export const initialGeneralState: RunTimeState = {
	logMode: false,
	loggedComponent: undefined,
	patchFilename: "patch",
	saveDefaultValue: false,
	classCodeMode: false,
	classCode: undefined,
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
		setClassCodeMode: (state, action: PayloadAction<boolean>) => {
			state.classCodeMode = action.payload;
		},
		setClassCode: (state, action: PayloadAction<ClassCode>) => {
			state.classCode = {
				...action.payload,
				methods: { ...action.payload.methods },
			};
		},
		setSaveDefaultValue: (state, action: PayloadAction<boolean>) => {
			state.saveDefaultValue = action.payload;
		},
	},
});

export const {
	setLogMode,
	setLogComponent,
	setPatchFilename,
	setClassCodeMode,
	setClassCode,
	setSaveDefaultValue,
} = runtimeSlice.actions;

export default runtimeSlice.reducer;
