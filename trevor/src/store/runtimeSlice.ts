import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { RunTimeState, ClassCode, CCValues, PatchDetails } from "../model";
import { setFullState } from "./trevorSlice";

export const initialRunTimeState: RunTimeState = {
	logMode: false,
	loggedComponent: undefined,
	patchFilename: "patch",
	saveDefaultValue: false,
	classCodeMode: false,
	classCode: undefined,
	ccValues: {},
	patchDetails: undefined,
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
	initialState: initialRunTimeState,
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
			if (!state.ccValues[device_id]) {
				state.ccValues[device_id] = {};
			}
			if (!state.ccValues[device_id][device]) {
				state.ccValues[device_id][device] = {};
			}
			if (!state.ccValues[device_id][device][section]) {
				state.ccValues[device_id][device][section] = {};
			}

			state.ccValues[device_id][device][section][parameter] = value;
		},
		updateCCValues: (state, action: PayloadAction<CCValues>) => {
			const { ccValues } = state;

			for (const [deviceId, devices] of Object.entries(action.payload)) {
				if (!ccValues[deviceId]) ccValues[deviceId] = {};
				for (const [device, sections] of Object.entries(devices)) {
					if (!ccValues[deviceId][device]) ccValues[deviceId][device] = {};
					for (const [section, parameters] of Object.entries(sections)) {
						if (!ccValues[deviceId][device][section]) {
							ccValues[deviceId][device][section] = {};
						}
						for (const [parameter, value] of Object.entries(parameters)) {
							ccValues[deviceId][device][section][parameter] = value;
						}
					}
				}
			}
		},
		resetCCState: (state) => {
			state.ccValues = {};
		},
		setPatchDetails: (state, action: PayloadAction<PatchDetails>) => {
			state.patchDetails = action.payload;
		},
		resetPatchDetails: (state) => {
			state.patchDetails = undefined;
		},
	},
	extraReducers: (builder) => {
		builder.addCase(setFullState, (state, action) => {
			const midiDevices = action.payload.midi_devices;
			const validIds = new Set(midiDevices.map((d) => d.id.toString()));

			for (const deviceId in state.ccValues) {
				if (!validIds.has(deviceId)) {
					delete state.ccValues[deviceId];
				}
			}
		});
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
	updateCCValues,
	setPatchDetails,
	resetPatchDetails,
} = runtimeSlice.actions;

export default runtimeSlice.reducer;
