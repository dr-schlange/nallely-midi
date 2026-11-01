import { useCallback, useEffect, useRef, useState } from "react";

const ROOT_ID = "root";
const PADDING = 0.92;
const MIN_SIZE = 30;

const findZoomTarget = (el: Element): Element => {
	let target: Element = el;
	while (target.parentElement && target.id !== ROOT_ID) {
		const rect = target.getBoundingClientRect();
		if (rect.width >= MIN_SIZE && rect.height >= MIN_SIZE) break;
		target = target.parentElement;
	}
	return target;
};

export const usePageZoom = () => {
	const [zoomMode, setZoomMode] = useState(false);
	const isZoomed = useRef(false);
	const currentScale = useRef(1);
	const currentTx = useRef(0);
	const currentTy = useRef(0);

	const applyTransform = (
		tx: number,
		ty: number,
		scale: number,
		animated = true,
	) => {
		const root = document.getElementById(ROOT_ID);
		if (!root) return;
		root.style.transition = animated ? "transform 0.25s ease" : "none";
		root.style.transformOrigin = "0 0";
		root.style.transform =
			scale === 1 ? "" : `translate(${tx}px, ${ty}px) scale(${scale})`;
		currentScale.current = scale;
		currentTx.current = tx;
		currentTy.current = ty;
		isZoomed.current = scale !== 1;
	};

	const resetZoom = useCallback((animated = true) => {
		applyTransform(0, 0, 1, animated);
	}, []);

	const zoomToElement = useCallback(
		(el: Element) => {
			if (isZoomed.current) {
				resetZoom();
				return;
			}
			const target = findZoomTarget(el);
			const rect = target.getBoundingClientRect();
			if (rect.width === 0 || rect.height === 0) return;

			const vw = window.innerWidth;
			const vh = window.innerHeight;
			const scale = Math.min(vw / rect.width, vh / rect.height) * PADDING;
			// center the element in the viewport after scale
			const cx = rect.left + rect.width / 2;
			const cy = rect.top + rect.height / 2;
			const tx = vw / 2 - cx * scale;
			const ty = vh / 2 - cy * scale;
			applyTransform(tx, ty, scale);
		},
		[resetZoom],
	);

	useEffect(() => {
		if (!zoomMode) {
			resetZoom();
			return;
		}

		const touchStart = { x: 0, y: 0 };
		const TAP_THRESHOLD = 8;

		const onTouchStart = (e: TouchEvent) => {
			touchStart.x = e.touches[0].clientX;
			touchStart.y = e.touches[0].clientY;
		};

		const onTouchEnd = (e: TouchEvent) => {
			const t = e.changedTouches[0];
			const dx = Math.abs(t.clientX - touchStart.x);
			const dy = Math.abs(t.clientY - touchStart.y);
			if (dx > TAP_THRESHOLD || dy > TAP_THRESHOLD) return; // swipe — let scroll happen
			const target = document.elementFromPoint(t.clientX, t.clientY);
			if (!target) return;
			if (target.closest("[data-zoom-toggle]")) return;
			e.preventDefault();
			e.stopPropagation();
			zoomToElement(target);
		};

		const onClick = (e: MouseEvent) => {
			const target = e.target as Element;
			if (!target) return;
			if (target.closest("[data-zoom-toggle]")) return;
			e.preventDefault();
			e.stopPropagation();
			zoomToElement(target);
		};

		document.addEventListener("touchstart", onTouchStart, {
			capture: true,
			passive: true,
		});
		document.addEventListener("touchend", onTouchEnd, {
			capture: true,
			passive: false,
		});
		document.addEventListener("click", onClick, { capture: true });
		return () => {
			document.removeEventListener("touchstart", onTouchStart, {
				capture: true,
			});
			document.removeEventListener("touchend", onTouchEnd, { capture: true });
			document.removeEventListener("click", onClick, { capture: true });
		};
	}, [zoomMode, zoomToElement, resetZoom]);

	const toggleZoomMode = useCallback(() => {
		setZoomMode((prev) => !prev);
	}, []);

	return { zoomMode, toggleZoomMode };
};
