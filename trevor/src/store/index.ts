import {
	combineReducers,
	configureStore,
	createSelector,
} from "@reduxjs/toolkit";
import {
	type TypedUseSelectorHook,
	useDispatch,
	useSelector,
} from "react-redux";
import { extractCurrentIP } from "../utils/utils";
import generalSlice, {
	initialGeneralState,
	setWebsocketURL,
} from "./generalSlice";
import runTimeSlice, { initialRunTimeState } from "./runtimeSlice";
import trevorSlice from "./trevorSlice";

export const LOCAL_STORAGE_SETTINGS = "settings";
export const LOCAL_STORAGE_RUNTIME = "runtime";

// Loads general settings from the local storage
function loadSettings(newURL = undefined) {
	try {
		const initURL = newURL ?? initialGeneralState.trevorWebsocketURL;
		const currentIp = extractCurrentIP(initURL);
		const settingsKey = `${LOCAL_STORAGE_SETTINGS}@${currentIp}`;
		const runtimeKey = `${LOCAL_STORAGE_RUNTIME}@${currentIp}`;

		const savedSettings = localStorage.getItem(settingsKey);
		const savedRuntime = localStorage.getItem(runtimeKey);
		if (!savedSettings && !savedRuntime) {
			return undefined;
		}
		const parsedSettings = savedSettings ? JSON.parse(savedSettings) : {};
		const parsedRuntime = savedRuntime ? JSON.parse(savedRuntime) : {};
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

const combinedReducer = combineReducers({
	nallely: trevorSlice,
	general: generalSlice,
	runTime: runTimeSlice,
});

const rootReducer = (state, action) => {
	if (action.type === setWebsocketURL.type) {
		const newURL = action.payload;
		const newMachineData = saveLoadSharedSettings(state, newURL);

		return combinedReducer(newMachineData, action);
	}
	return combinedReducer(state, action);
};

export const store = configureStore({
	reducer: rootReducer,
	preloadedState: loadSettings(),
});

const saveLoadSharedSettings = (state, newURL: string) => {
	const friends = state.general.friends;
	const targetSettings =
		loadSettings(newURL) ?? ({} as ReturnType<typeof loadSettings>);
	targetSettings.general = { friends };
	return targetSettings;
};

store.subscribe(() => {
	const state = store.getState();

	const settings = {
		trevorWebsocketURL: state.general.trevorWebsocketURL,
		firstLaunch: state.general.firstLaunch,
		friends: state.general.friends,
	};

	const runtime = {
		currentAddress: state.runTime.currentAddress,
		saveDefaultValue: state.runTime.saveDefaultValue,
		usedAddresses: state.runTime.usedAddresses,
		stdin: state.runTime.stdin,
	};

	const currentIp = extractCurrentIP(
		store.getState().general.trevorWebsocketURL,
	);
	const settingsKey = `${LOCAL_STORAGE_SETTINGS}@${currentIp}`;
	const runtimeKey = `${LOCAL_STORAGE_RUNTIME}@${currentIp}`;

	localStorage.setItem(settingsKey, JSON.stringify(settings));
	localStorage.setItem(runtimeKey, JSON.stringify(runtime));
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
