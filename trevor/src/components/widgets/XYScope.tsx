import { useEffect, useRef, useState } from "react";
import DragNumberInput from "../DragInputs";
import { Button, WidgetProps } from "./BaseComponents";

const BUFFER_SIZE_MAX = 5000;
const BUFFER_SIZE_MIN = 2;
const BUFFER_SIZE = 500;
const MARGIN_PX = 5;

export const XYScope = ({ id, onClose, num }: WidgetProps) => {
	const containerRef = useRef<HTMLDivElement | null>(null);
	const [expanded, setExpanded] = useState(false);
	const canvasRef = useRef<HTMLCanvasElement | null>(null);
	const wsRef = useRef<WebSocket | null>(null);
	const retryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const isUnmounted = useRef(false);
	const [bufferSize, setBufferSize] = useState<number>(BUFFER_SIZE);
	const bufferSizeRef = useRef(bufferSize); // <-- REF for latest buffer size

	const latestX = useRef<number | null>(null);
	const latestY = useRef<number | null>(null);
	const points = useRef<{ x: number; y: number }[]>([]);

	// Track extrema for zoom to fit
	const minX = useRef<number | null>(null);
	const maxX = useRef<number | null>(null);
	const minY = useRef<number | null>(null);
	const maxY = useRef<number | null>(null);

	const [autoPaused, setAutoPaused] = useState(false);
	const inactivityTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

	// Viewport transform refs
	const scaleX = useRef(1);
	const scaleY = useRef(1);
	const offsetX = useRef(0);
	const offsetY = useRef(0);

	// Commit and clamp new buffer size from input
	const commitBufferSize = (valueStr: string) => {
		let newSize = Number.parseFloat(valueStr);
		if (Number.isNaN(newSize)) newSize = BUFFER_SIZE_MIN;
		newSize = Math.max(BUFFER_SIZE_MIN, Math.min(BUFFER_SIZE_MAX, newSize));
		setBufferSize(newSize);
	};

	// Update extrema with new point
	const updateExtrema = (x: number, y: number) => {
		minX.current = minX.current === null ? x : Math.min(minX.current, x);
		maxX.current = maxX.current === null ? x : Math.max(maxX.current, x);
		minY.current = minY.current === null ? y : Math.min(minY.current, y);
		maxY.current = maxY.current === null ? y : Math.max(maxY.current, y);
	};

	// Reset extrema
	const resetExtrema = () => {
		minX.current = null;
		maxX.current = null;
		minY.current = null;
		maxY.current = null;
	};

	// Transform data coords to canvas pixel coords
	const dataToCanvasX = (x: number, canvasWidth: number) =>
		(x - offsetX.current) * scaleX.current + canvasWidth / 2;
	const dataToCanvasY = (y: number, canvasHeight: number) =>
		canvasHeight / 2 - (y - offsetY.current) * scaleY.current;

	// Draw axes and points
	const drawPoints = () => {
		const canvas = canvasRef.current;
		if (!canvas) return;
		const ctx = canvas.getContext("2d");
		if (!ctx) return;

		const w = canvas.width;
		const h = canvas.height;

		ctx.clearRect(0, 0, w, h);

		// Draw axes in light gray
		ctx.strokeStyle = "#ccc";
		ctx.lineWidth = 1;

		// X axis: y = center line
		ctx.beginPath();
		ctx.moveTo(0, h / 2);
		ctx.lineTo(w, h / 2);
		ctx.stroke();

		// Y axis: x = center line
		ctx.beginPath();
		ctx.moveTo(w / 2, 0);
		ctx.lineTo(w / 2, h);
		ctx.stroke();

		// Draw points
		ctx.fillStyle = "orange";
		const lineWidth = 1;
		for (const p of points.current) {
			const px = dataToCanvasX(p.x, w);
			const py = dataToCanvasY(p.y, h);
			ctx.beginPath();
			ctx.arc(px, py, lineWidth, 0, Math.PI * 2);
			ctx.fill();
		}
	};

	const reset = () => {
		resetExtrema();
		points.current = [];
		scaleX.current = 1;
		scaleY.current = 1;
		offsetX.current = 0;
		offsetY.current = 0;
		drawPoints();
	};

	// Zoom to fit all points with margin
	const zoomToFit = () => {
		const canvas = canvasRef.current;
		if (!canvas) return;

		const w = canvas.width;
		const h = canvas.height;

		if (
			minX.current === null ||
			maxX.current === null ||
			minY.current === null ||
			maxY.current === null
		)
			return;

		const dataWidth = maxX.current - minX.current || 1;
		const dataHeight = maxY.current - minY.current || 1;

		// Calculate scale to fit with margin on each side
		const scaleXNew = (w - 2 * MARGIN_PX) / dataWidth;
		const scaleYNew = (h - 2 * MARGIN_PX) / dataHeight;

		// Use uniform scale (optional, or use separate)
		const scale = Math.min(scaleXNew, scaleYNew);

		scaleX.current = scale;
		scaleY.current = scale;

		// Center offset to middle of data bounding box
		offsetX.current = (minX.current + maxX.current) / 2;
		offsetY.current = (minY.current + maxY.current) / 2;

		drawPoints();
	};

	const expand = () => {
		setExpanded((prev) => !prev);
		if (expanded) {
			containerRef.current.style.height = "";
			containerRef.current.style.width = "";
		} else {
			containerRef.current.style.height = "100%";
			containerRef.current.style.width = "100%";
		}
	};

	// Resize canvas to match container size
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

	// Keep bufferSizeRef updated and trim points immediately on bufferSize change
	useEffect(() => {
		bufferSizeRef.current = bufferSize;
		if (points.current.length > bufferSize) {
			points.current = points.current.slice(points.current.length - bufferSize);
			drawPoints();
		}
	}, [bufferSize]);

	useEffect(() => {
		function connect() {
			if (isUnmounted.current) return;

			const ws = new WebSocket(
				`ws://${window.location.hostname}:6789/${id}/autoconfig`,
			);
			ws.binaryType = "arraybuffer";
			wsRef.current = ws;

			ws.onopen = () => {
				ws.send(
					JSON.stringify({
						kind: "oscilloscope",
						parameters: [
							{ name: "x", stream: true },
							{ name: "y", stream: true },
						],
					}),
				);
				latestX.current = null;
				latestY.current = null;
				points.current = [];
				resetExtrema();
				scaleX.current = 1;
				scaleY.current = 1;
				offsetX.current = 0;
				offsetY.current = 0;
			};

			ws.onmessage = (event) => {
				if (inactivityTimeout.current) {
					clearTimeout(inactivityTimeout.current);
				}
				inactivityTimeout.current = setTimeout(() => {
					setAutoPaused(true);
				}, 1000);
				setAutoPaused(false);

				let message = {
					on: undefined,
					value: undefined,
				};
				const data = event.data;
				if (typeof event.data === "string") {
					message = JSON.parse(data);
				} else {
					const dv = new DataView(data);
					const len = dv.getUint8(0);
					const name = new TextDecoder().decode(new Uint8Array(data, 1, len));
					const val = dv.getFloat32(1 + len, false);
					message.on = name;
					message.value = val;
				}

				const val = Number.parseFloat(message.value);
				if (Number.isNaN(val)) return;

				if (message.on === "x") {
					latestX.current = val;
				} else if (message.on === "y") {
					latestY.current = val;
				}

				if (latestX.current != null && latestY.current != null) {
					points.current.push({ x: latestX.current, y: latestY.current });
					updateExtrema(latestX.current, latestY.current);

					// Trim using ref to latest buffer size
					while (points.current.length > bufferSizeRef.current) {
						points.current.shift();
					}

					requestAnimationFrame(drawPoints);
					latestX.current = null;
					latestY.current = null;
				}
			};

			ws.onclose = () => {
				if (!isUnmounted.current) {
					retryTimeoutRef.current = setTimeout(connect, 5000);
				}
			};

			ws.onerror = (err) => {
				console.error("WebSocket error:", err);
				ws.close();
			};
		}

		connect();

		return () => {
			isUnmounted.current = true;
			if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current);
			if (inactivityTimeout.current) clearTimeout(inactivityTimeout.current);
			if (wsRef.current) wsRef.current.close();
		};
	}, [id]);

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
				/>
				<Button text="r" onClick={reset} tooltip="Reset" />
				<Button text="f" onClick={zoomToFit} tooltip="Zoom to Fit" />
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
				}}
			/>
		</div>
	);
};
