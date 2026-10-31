// LLM generated
import { useRef } from "react";
import { useTrevorDispatch, useTrevorSelector } from "../store";
import { setHighlightedUnit } from "../store/runtimeSlice";

const LONG_PRESS_MS = 500;
const MOVE_TOLERANCE = 8;

// A long press on a title bar highlights (or stops highlighting) the links of its device or
// section, expanded or not. Spread `handlers` on the title bar and call `consumeClick` first
// in its onClick: the click ending a long press, or pressing one of its buttons, must not
// toggle the bar.
export const useHighlightUnit = (unit: string) => {
	const dispatch = useTrevorDispatch();
	const current = useTrevorSelector((state) => state.runTime.highlightedUnit);
	const currentRef = useRef(current);
	currentRef.current = current;
	const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
	const origin = useRef<{ x: number; y: number } | null>(null);
	const fired = useRef(false);

	const cancel = () => {
		if (timer.current) clearTimeout(timer.current);
		timer.current = null;
		origin.current = null;
	};

	const handlers = {
		onPointerDown: (e: React.PointerEvent) => {
			// dragging by the handle, or pressing a button, is not a long press
			if ((e.target as Element).closest("[data-drag-handle], .Button")) return;
			cancel();
			fired.current = false;
			origin.current = { x: e.clientX, y: e.clientY };
			timer.current = setTimeout(() => {
				timer.current = null;
				fired.current = true;
				dispatch(
					setHighlightedUnit(currentRef.current === unit ? null : unit),
				);
			}, LONG_PRESS_MS);
		},
		onPointerMove: (e: React.PointerEvent) => {
			if (
				origin.current &&
				Math.hypot(e.clientX - origin.current.x, e.clientY - origin.current.y) >
					MOVE_TOLERANCE
			)
				cancel();
		},
		onPointerUp: cancel,
		onPointerCancel: cancel,
		onPointerLeave: cancel,
		onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
	};

	const consumeClick = (e: React.MouseEvent) => {
		if ((e.target as Element).closest(".Button")) return true;
		const wasLongPress = fired.current;
		fired.current = false;
		return wasLongPress;
	};

	return { handlers, consumeClick };
};
