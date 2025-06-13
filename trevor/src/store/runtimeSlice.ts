import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { RunTimeState, ClassCode } from "../model";

export const initialGeneralState: RunTimeState = {
	logMode: false,
	loggedComponent: undefined,
	patchFilename: "patch",
	saveDefaultValue: false,
	classCodeMode: false,
	classCode: undefined,
	ccValues: {},
};

interface CCState {
	device_id: number;
	device: string;
	section: string;
	parameter: string;
	value: number;
}

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
		updateCCState: (state, action: PayloadAction<CCState>) => {
			const { device_id, device, section, parameter, value } = action.payload;
			state.ccValues = {
				...state.ccValues,
				[device_id]: {
					...state.ccValues[device_id],
					[device]: {
						...(state.ccValues[device_id]?.[device] || {}),
						[section]: {
							...(state.ccValues[device_id]?.[device]?.[section] || {}),
							[parameter]: value,
						},
					},
				},
			};
		},
		resetCCState: (state) => {
			state.ccValues = {};
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
	updateCCState,
	resetCCState,
} = runtimeSlice.actions;

export default runtimeSlice.reducer;
