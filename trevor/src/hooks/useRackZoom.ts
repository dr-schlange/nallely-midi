import { useCallback, useRef, useState } from "react";

export const useRackZoom = () => {
	const scrollRef = useRef<HTMLDivElement>(null);
	const [zoomMode, setZoomMode] = useState(false);
	const [zoom, setZoom] = useState(1);
	const zoomRef = useRef(1);

	const pointers = useRef(new Map<number, { x: number; y: number }>());
	const lastPinchDist = useRef<number | null>(null);

	const scrollTo = useCallback(
		(clientX: number, clientY: number, newZoom: number) => {
			const el = scrollRef.current;
			if (!el) return;
			const rect = el.getBoundingClientRect();
			const contentX = (clientX - rect.left + el.scrollLeft) / zoomRef.current;
			const contentY = (clientY - rect.top + el.scrollTop) / zoomRef.current;
			requestAnimationFrame(() => {
				if (!scrollRef.current) return;
				scrollRef.current.scrollLeft = contentX * newZoom - rect.width / 2;
				scrollRef.current.scrollTop = contentY * newZoom - rect.height / 2;
			});
		},
		[],
	);

	const onPointerDown = useCallback((e: React.PointerEvent) => {
		e.stopPropagation();
		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
		pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
		if (pointers.current.size === 2) {
			const pts = [...pointers.current.values()];
			lastPinchDist.current = Math.hypot(
				pts[1].x - pts[0].x,
				pts[1].y - pts[0].y,
			);
		}
	}, []);

	const onPointerMove = useCallback(
		(e: React.PointerEvent) => {
			e.stopPropagation();
			pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
			if (pointers.current.size !== 2 || lastPinchDist.current === null) return;
			const pts = [...pointers.current.values()];
			const dist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
			const mid = {
				x: (pts[0].x + pts[1].x) / 2,
				y: (pts[0].y + pts[1].y) / 2,
			};
			const newZoom = Math.min(
				4,
				Math.max(1, zoomRef.current * (dist / lastPinchDist.current)),
			);
			scrollTo(mid.x, mid.y, newZoom);
			zoomRef.current = newZoom;
			setZoom(newZoom);
			lastPinchDist.current = dist;
		},
		[scrollTo],
	);

	const onPointerUp = useCallback(
		(e: React.PointerEvent) => {
			e.stopPropagation();
			const start = pointers.current.get(e.pointerId);
			const wasSingle = pointers.current.size === 1;
			pointers.current.delete(e.pointerId);
			lastPinchDist.current = null;

			if (wasSingle && start) {
				const dx = Math.abs(e.clientX - start.x);
				const dy = Math.abs(e.clientY - start.y);
				if (dx < 10 && dy < 10) {
					const newZoom = zoomRef.current > 1 ? 1 : 2.5;
					scrollTo(e.clientX, e.clientY, newZoom);
					zoomRef.current = newZoom;
					setZoom(newZoom);
				}
			}
		},
		[scrollTo],
	);

	const onPointerCancel = useCallback((e: React.PointerEvent) => {
		pointers.current.delete(e.pointerId);
		lastPinchDist.current = null;
	}, []);

	const toggleZoomMode = useCallback(() => {
		setZoomMode((prev) => {
			if (prev) {
				zoomRef.current = 1;
				setZoom(1);
			}
			return !prev;
		});
	}, []);

	return {
		scrollRef,
		zoom,
		zoomMode,
		toggleZoomMode,
		overlayHandlers: {
			onPointerDown,
			onPointerMove,
			onPointerUp,
			onPointerCancel,
		},
	};
};
