import { configureStore } from "@reduxjs/toolkit";
import trevorSlice from "./trevorSlice";

export const store = configureStore({
	reducer: {
		nallely: trevorSlice,
	},
});

// Infer RootState and AppDispatch types
export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

/**
 * Helper hooks for typed usage in components:
 * import { useSelector, useDispatch } from 'react-redux'
 *
 * e.g.:
 *   const dispatch = useAppDispatch();
 *   const devices = useAppSelector((state) => state.midi.devices);
 */
import { useDispatch, useSelector, type TypedUseSelectorHook } from "react-redux";

export const useTrevorDispatch = () => useDispatch<AppDispatch>();
export const useTrevorSelector: TypedUseSelectorHook<RootState> = useSelector;
