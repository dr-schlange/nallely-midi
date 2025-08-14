import {
	useDispatch,
	useSelector,
	type TypedUseSelectorHook,
} from "react-redux";
import { configureStore, createSelector } from "@reduxjs/toolkit";
import trevorSlice from "./trevorSlice";
import runTimeSlice from "./runtimeSlice";
import generalSlice, { initialGeneralState } from "./generalSlice";

const LOCAL_STORAGE_SETTINGS = "settings";

// Loads general settings from the local storage
function loadSettings() {
	try {
		const saved = localStorage.getItem(LOCAL_STORAGE_SETTINGS);
		if (saved) {
			const parsed = JSON.parse(saved);
			return {
				general: {
					...initialGeneralState,
					...parsed,
				},
			};
		}
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

	localStorage.setItem(LOCAL_STORAGE_SETTINGS, JSON.stringify(settings));
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
		console.debug("selectChannels", newvalue);
		return newvalue;
	},
);
