import { useEffect, useRef, useState } from "react";
import DragNumberInput from "../DragInputs";
import {
	Button,
	useNallelyRegistration,
	type WidgetProps,
} from "./BaseComponents";

const BUFFER_SIZE_MAX = 5000;
const BUFFER_SIZE_MIN = 2;
const BUFFER_SIZE = 500;
const MARGIN_PX = 5;
const PERSPECTIVE_DISTANCE = 200;

export const XYZScope = ({ id, onClose, num }: WidgetProps) => {
	const containerRef = useRef<HTMLDivElement | null>(null);
	const [expanded, setExpanded] = useState(false);
	const canvasRef = useRef<HTMLCanvasElement | null>(null);
	const autorefreshTimerRef = useRef<ReturnType<typeof setInterval> | null>(
		null,
	);
	const [autorefresh, setAutorefresh] = useState<boolean>(true);
	const [bufferSize, setBufferSize] = useState<number>(BUFFER_SIZE);
	const bufferSizeRef = useRef(bufferSize);

	const latestX = useRef<number | null>(null);
	const latestY = useRef<number | null>(null);
	const latestZ = useRef<number | null>(null);
	const points = useRef<{ x: number; y: number; z: number }[]>([]);

	const updateScheduled = useRef(false);

	// Viewport transform refs
	const scaleX = useRef(1);
	const scaleY = useRef(1);
	const offsetX = useRef(0);
	const offsetY = useRef(0);

	// Rotation angles in radians
	const rotationX = useRef(0);
	const rotationY = useRef(0);

	// Drag rotation state
	const [dragRotateEnabled, setDragRotateEnabled] = useState(false);
	const dragRotateRef = useRef(false);
	const isDragging = useRef(false);
	const lastPointer = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
	const rotationCenter = useRef<{ x: number; y: number; z: number }>({
		x: 0,
		y: 0,
		z: 0,
	});

	const commitBufferSize = (valueStr: string) => {
		let newSize = Number.parseFloat(valueStr);
		if (Number.isNaN(newSize)) newSize = BUFFER_SIZE_MIN;
		newSize = Math.max(BUFFER_SIZE_MIN, Math.min(BUFFER_SIZE_MAX, newSize));
		setBufferSize(newSize);
	};

	// 3D rotation and projection to 2D canvas coords
	const project3Dto2D = (
		x: number,
		y: number,
		z: number,
		canvasWidth: number,
		canvasHeight: number,
	) => {
		const rc = rotationCenter.current;
		const cosY = Math.cos(rotationY.current);
		const sinY = Math.sin(rotationY.current);
		const cosX = Math.cos(rotationX.current);
		const sinX = Math.sin(rotationX.current);

		// Translate to rotation center
		const dx = x - rc.x;
		const dy = y - rc.y;
		const dz = z - rc.z;

		// Rotate around Y axis
		const xr = dx * cosY - dz * sinY;
		const zr = dx * sinY + dz * cosY;

		// Rotate around X axis
		const yr = dy * cosX - zr * sinX;
		const zr2 = dy * sinX + zr * cosX;

		// Translate back
		const fx = xr + rc.x;
		const fy = yr + rc.y;
		const fz = zr2 + rc.z;

		// Perspective projection
		const ps = PERSPECTIVE_DISTANCE / (PERSPECTIVE_DISTANCE + fz);

		// Transform to canvas coords, applying viewport scale and offset
		const cx = (fx - offsetX.current) * scaleX.current * ps + canvasWidth / 2;
		const cy = canvasHeight / 2 - (fy - offsetY.current) * scaleY.current * ps;

		return { x: cx, y: cy, ps };
	};

	const drawPoints = () => {
		const canvas = canvasRef.current;
		if (!canvas) return;
		const ctx = canvas.getContext("2d");
		if (!ctx) return;

		const w = canvas.width;
		const h = canvas.height;

		ctx.clearRect(0, 0, w, h);

		// Draw axes in light gray - project origin axes lines in 3D rotated space
		ctx.strokeStyle = "#ccc";
		ctx.lineWidth = 1;
		ctx.globalAlpha = 1.0;

		const axisLength = 100;
		const origin = project3Dto2D(0, 0, 0, w, h);
		const xPos = project3Dto2D(axisLength, 0, 0, w, h);
		ctx.beginPath();
		ctx.moveTo(origin.x, origin.y);
		ctx.lineTo(xPos.x, xPos.y);
		ctx.stroke();

		const yPos = project3Dto2D(0, axisLength, 0, w, h);
		ctx.beginPath();
		ctx.moveTo(origin.x, origin.y);
		ctx.lineTo(yPos.x, yPos.y);
		ctx.stroke();

		const zPos = project3Dto2D(0, 0, axisLength, w, h);
		ctx.beginPath();
		ctx.moveTo(origin.x, origin.y);
		ctx.lineTo(zPos.x, zPos.y);
		ctx.stroke();

		// Draw points with depth cue (size + opacity modulated by perspective scale)
		for (const p of points.current) {
			const pt = project3Dto2D(p.x, p.y, p.z, w, h);
			const pointSize = Math.max(0.5, Math.min(3, pt.ps * 1.5));
			ctx.globalAlpha = Math.max(0.2, Math.min(1.0, pt.ps * 0.8));
			ctx.fillStyle = "orange";
			ctx.beginPath();
			ctx.arc(pt.x, pt.y, pointSize, 0, Math.PI * 2);
			ctx.fill();
		}

		ctx.globalAlpha = 1.0;
	};

	const reset = () => {
		points.current = [];
		scaleX.current = 1;
		scaleY.current = 1;
		offsetX.current = 0;
		offsetY.current = 0;
		rotationX.current = 0;
		rotationY.current = 0;
		rotationCenter.current = { x: 0, y: 0, z: 0 };
		drawPoints();
	};

	const zoomToFit = () => {
		const canvas = canvasRef.current;
		if (!canvas || points.current.length === 0) return;

		const w = canvas.width;
		const h = canvas.height;

		const cosYr = Math.cos(rotationY.current);
		const sinYr = Math.sin(rotationY.current);
		const cosXr = Math.cos(rotationX.current);
		const sinXr = Math.sin(rotationX.current);

		// Compute rotated coordinates for all points (around rotation center)
		const rc = rotationCenter.current;
		const rotated = points.current.map((p) => {
			const dx = p.x - rc.x;
			const dy = p.y - rc.y;
			const dz = p.z - rc.z;
			const xr = dx * cosYr - dz * sinYr;
			const zr = dx * sinYr + dz * cosYr;
			const yr = dy * cosXr - zr * sinXr;
			const zr2 = dy * sinXr + zr * cosXr;
			return { xr: xr + rc.x, yr: yr + rc.y, zr2: zr2 + rc.z };
		});

		// Center offset on mean of rotated data
		let sumX = 0,
			sumY = 0;
		for (const r of rotated) {
			sumX += r.xr;
			sumY += r.yr;
		}
		offsetX.current = sumX / rotated.length;
		offsetY.current = sumY / rotated.length;

		// Project with scale=1 to find bounding box
		scaleX.current = 1;
		scaleY.current = 1;

		let minPx = Infinity,
			maxPx = -Infinity,
			minPy = Infinity,
			maxPy = -Infinity;
		for (const r of rotated) {
			const ps = PERSPECTIVE_DISTANCE / (PERSPECTIVE_DISTANCE + r.zr2);
			const px = (r.xr - offsetX.current) * ps + w / 2;
			const py = h / 2 - (r.yr - offsetY.current) * ps;
			if (px < minPx) minPx = px;
			if (px > maxPx) maxPx = px;
			if (py < minPy) minPy = py;
			if (py > maxPy) maxPy = py;
		}

		const projWidth = maxPx - minPx || 1;
		const projHeight = maxPy - minPy || 1;

		// Compute uniform scale to fit within canvas with margin
		const fitScale = Math.min(
			(w - 2 * MARGIN_PX) / projWidth,
			(h - 2 * MARGIN_PX) / projHeight,
		);

		scaleX.current = fitScale;
		scaleY.current = fitScale;

		drawPoints();
	};

	const expand = () => {
		setExpanded((prev) => {
			if (prev) {
				containerRef.current.style.height = "";
				containerRef.current.style.width = "";
			} else {
				containerRef.current.style.height = "100%";
				containerRef.current.style.width = "100%";
			}
			return !prev;
		});
	};

	const toggleDragRotate = () => {
		setDragRotateEnabled((prev) => {
			dragRotateRef.current = !prev;
			return !prev;
		});
	};

	// Pointer event handlers for drag rotation
	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;

		const onPointerDown = (e: PointerEvent) => {
			if (!dragRotateRef.current) return;
			isDragging.current = true;
			lastPointer.current = { x: e.clientX, y: e.clientY };
			canvas.setPointerCapture(e.pointerId);

			// Barycenter of points as rotation pivot
			const pts = points.current;
			if (pts.length > 0) {
				let sx = 0,
					sy = 0,
					sz = 0;
				for (const p of pts) {
					sx += p.x;
					sy += p.y;
					sz += p.z;
				}
				const n = pts.length;
				rotationCenter.current = { x: sx / n, y: sy / n, z: sz / n };
			}
		};

		const onPointerMove = (e: PointerEvent) => {
			if (!isDragging.current) return;
			const dx = e.clientX - lastPointer.current.x;
			const dy = e.clientY - lastPointer.current.y;
			rotationY.current += dx * 0.01;
			rotationX.current += dy * 0.01;
			lastPointer.current = { x: e.clientX, y: e.clientY };
			drawPoints();
		};

		const onPointerUp = (e: PointerEvent) => {
			if (!isDragging.current) return;
			isDragging.current = false;
			canvas.releasePointerCapture(e.pointerId);
		};

		canvas.addEventListener("pointerdown", onPointerDown);
		canvas.addEventListener("pointermove", onPointerMove);
		canvas.addEventListener("pointerup", onPointerUp);

		return () => {
			canvas.removeEventListener("pointerdown", onPointerDown);
			canvas.removeEventListener("pointermove", onPointerMove);
			canvas.removeEventListener("pointerup", onPointerUp);
		};
	}, []);

	useEffect(() => {
		const resizeCanvas = () => {
			if (canvasRef.current && containerRef.current) {
				canvasRef.current.width = containerRef.current.clientWidth;
				canvasRef.current.height = containerRef.current.clientHeight;
				drawPoints();
			}
		};

		resizeCanvas();

		const ro = new ResizeObserver(resizeCanvas);
		if (containerRef.current) ro.observe(containerRef.current);

		return () => ro.disconnect();
	}, []);

	useEffect(() => {
		bufferSizeRef.current = bufferSize;
		if (points.current.length > bufferSize) {
			points.current = points.current.slice(-bufferSize);
			drawPoints();
		}
	}, [bufferSize]);

	const scopeParameters = useRef({
		x: { min: null, max: null, stream: true },
		y: { min: null, max: null, stream: true },
		z: { min: null, max: null, stream: true },
	}).current;
	const scopeConfig = useRef({}).current;

	useNallelyRegistration(
		id,
		scopeParameters,
		scopeConfig,
		"oscilloscope",
		(message) => {
			const val = message.value;
			if (Number.isNaN(val)) return;

			if (message.on === "x") {
				latestX.current = val;
			} else if (message.on === "y") {
				latestY.current = val;
			} else if (message.on === "z") {
				latestZ.current = val;
			}

			if (
				latestX.current != null &&
				latestY.current != null &&
				latestZ.current != null
			) {
				points.current.push({
					x: latestX.current,
					y: latestY.current,
					z: latestZ.current,
				});

				if (points.current.length > bufferSizeRef.current) {
					points.current = points.current.slice(-bufferSizeRef.current);
				}

				if (!updateScheduled.current) {
					updateScheduled.current = true;
					requestAnimationFrame(() => {
						drawPoints();
						updateScheduled.current = false;
					});
				}

				latestX.current = null;
				latestY.current = null;
				latestZ.current = null;
			}
		},
		() => {
			latestX.current = null;
			latestY.current = null;
			latestZ.current = null;
			points.current = [];
			scaleX.current = 1;
			scaleY.current = 1;
			offsetX.current = 0;
			offsetY.current = 0;
			rotationX.current = 0;
			rotationY.current = 0;
			rotationCenter.current = { x: 0, y: 0, z: 0 };
		},
	);

	useEffect(() => {
		const timer = autorefreshTimerRef.current;
		if (!autorefresh && timer) {
			clearTimeout(timer);
			autorefreshTimerRef.current = null;
			return;
		}
		if (!autorefresh) {
			return;
		}
		if (!timer) {
			autorefreshTimerRef.current = setInterval(() => zoomToFit(), 1 / 60);
		}
	}, [autorefresh]);

	return (
		<div ref={containerRef} className="scope">
			<div
				style={{
					position: "absolute",
					color: "gray",
					zIndex: 1,
					top: "1%",
					right: "1%",
					width: "90%",
					textAlign: "center",
					cursor: "pointer",
					display: "flex",
					justifyContent: "flex-end",
					flexDirection: "row",
					gap: "4px",
					pointerEvents: "none",
				}}
			>
				<DragNumberInput
					range={[BUFFER_SIZE_MIN, BUFFER_SIZE_MAX]}
					width="30px"
					value={bufferSize.toString()}
					onChange={(value) => setBufferSize(Number.parseFloat(value))}
					onBlur={(value) => commitBufferSize(value)}
					style={{
						height: "10px",
						color: "gray",
						fontSize: "14px",
						textAlign: "right",
						boxShadow: "unset",
					}}
				/>
				<Button
					text={"+"}
					activated={expanded}
					onClick={expand}
					tooltip="Expand widget"
				/>{" "}
				<Button
					text="a"
					activated={autorefresh}
					onClick={() => {
						setAutorefresh((prev) => !prev);
					}}
					tooltip="Autorefresh"
				/>{" "}
				{expanded && (
					<Button
						text="d"
						activated={dragRotateEnabled}
						onClick={toggleDragRotate}
						tooltip="Toggle drag rotation"
					/>
				)}
				<Button text="f" onClick={zoomToFit} tooltip="Zoom to Fit" />
				<Button text="r" onClick={reset} tooltip="Reset" />
				<Button
					text="x"
					onClick={() => onClose?.(id)}
					tooltip="Close oscilloscope"
				/>
			</div>
			<canvas
				ref={canvasRef}
				style={{
					background: "#e0e0e0",
					width: "100%",
					height: "100%",
					display: "block",
					cursor: dragRotateEnabled ? "grab" : "default",
				}}
			/>
		</div>
	);
};
