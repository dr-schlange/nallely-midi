import {
	useDispatch,
	useSelector,
	type TypedUseSelectorHook,
} from "react-redux";
import { configureStore, createSelector } from "@reduxjs/toolkit";
import trevorSlice from "./trevorSlice";
import runTimeSlice, { initialRunTimeState } from "./runtimeSlice";
import generalSlice, { initialGeneralState } from "./generalSlice";

export const LOCAL_STORAGE_SETTINGS = "settings";
export const LOCAL_STORAGE_RUNTIME = "runtime";

// Copy the function here, otherwise, from utils it's not loaded properly
const incrDecrFilename = (filename: string, increment: boolean = false) => {
	const match = filename.match(/^(.*?)-(\d+)$/);
	if (!match) {
		return `${filename}-001`;
	}

	const base = match[1];
	const numStr = match[2];
	const width = numStr.length;
	let num = parseInt(numStr, 10);

	num = increment ? num + 1 : num - 1;
	if (num < 0) num = 0;

	const newNumStr = num.toString().padStart(width, "0");
	return `${base}-${newNumStr}`;
};

// Loads general settings from the local storage
function loadSettings() {
	try {
		const savedSettings = localStorage.getItem(LOCAL_STORAGE_SETTINGS);
		const savedRuntime = localStorage.getItem(LOCAL_STORAGE_RUNTIME);
		if (!savedSettings && !savedRuntime) {
			return undefined;
		}
		const parsedSettings = savedSettings ? JSON.parse(savedSettings) : {};
		const parsedRuntime = savedRuntime ? JSON.parse(savedRuntime) : {};
		if (parsedRuntime.patchFilename) {
			parsedRuntime.patchFilename = incrDecrFilename(
				parsedRuntime.patchFilename,
				true,
			);
		}
		return {
			general: {
				...initialGeneralState,
				...parsedSettings,
			},
			runTime: {
				...initialRunTimeState,
				...parsedRuntime,
			},
		};
	} catch (e) {
		console.warn("Failed to parse localStorage state", e);
	}
	return undefined;
}

export const store = configureStore({
	reducer: {
		nallely: trevorSlice,
		general: generalSlice,
		runTime: runTimeSlice,
	},
	preloadedState: loadSettings(),
});

store.subscribe(() => {
	const state = store.getState();

	const settings = {
		trevorWebsocketURL: state.general.trevorWebsocketURL,
		firstLaunch: state.general.firstLaunch,
	};

	const runtime = {
		patchFilename: state.runTime.patchFilename,
		saveDefaultValue: state.runTime.saveDefaultValue,
	};

	localStorage.setItem(LOCAL_STORAGE_SETTINGS, JSON.stringify(settings));
	localStorage.setItem(LOCAL_STORAGE_RUNTIME, JSON.stringify(runtime));
});

// Infer RootState and AppDispatch types
export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

/**
 * Helper hooks for typed usage in components:
 * import { useSelector, useDispatch } from 'react-redux'
 *
 * e.g.:
 *   const dispatch = useTrevorDispatch();
 *   const devices = useTrevorSelector((state) => state.midi.devices);
 */
export const useTrevorDispatch = () => useDispatch<AppDispatch>();
export const useTrevorSelector: TypedUseSelectorHook<RootState> = useSelector;

export const selectChannels = createSelector(
	(state) => state.nallely.midi_devices,
	(devices) => {
		const newvalue = devices.reduce(
			(acc, device) => {
				acc[device.id] = device.channel || 0;
				return acc;
			},
			{} as Record<number, number>,
		);
		return newvalue;
	},
);
