import { useEffect, useRef, useState } from "react";
import DragNumberInput from "../DragInputs";
import { Button, WidgetProps } from "./BaseComponents";

const BUFFER_SIZE_MAX = 5000;
const BUFFER_SIZE_MIN = 2;
const BUFFER_SIZE = 500;
const MARGIN_PX = 5;

export const XYZScope = ({ id, onClose, num }: WidgetProps) => {
	const containerRef = useRef<HTMLDivElement | null>(null);
	const [expanded, setExpanded] = useState(false);
	const canvasRef = useRef<HTMLCanvasElement | null>(null);
	const wsRef = useRef<WebSocket | null>(null);
	const retryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const isUnmounted = useRef(false);
	const [bufferSize, setBufferSize] = useState<number>(BUFFER_SIZE);
	const bufferSizeRef = useRef(bufferSize); // for latest buffer size

	const latestX = useRef<number | null>(null);
	const latestY = useRef<number | null>(null);
	const latestZ = useRef<number | null>(null);
	const points = useRef<{ x: number; y: number; z: number }[]>([]);

	// Track extrema for zoom to fit
	const minX = useRef<number | null>(null);
	const maxX = useRef<number | null>(null);
	const minY = useRef<number | null>(null);
	const maxY = useRef<number | null>(null);
	const minZ = useRef<number | null>(null);
	const maxZ = useRef<number | null>(null);

	const [autoPaused, setAutoPaused] = useState(false);
	const inactivityTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

	// Viewport transform refs
	const scaleX = useRef(1);
	const scaleY = useRef(1);
	const offsetX = useRef(0);
	const offsetY = useRef(0);

	// Rotation angles in radians
	const rotationX = useRef(0);
	const rotationY = useRef(0);

	const commitBufferSize = (valueStr: string) => {
		let newSize = Number.parseFloat(valueStr);
		if (Number.isNaN(newSize)) newSize = BUFFER_SIZE_MIN;
		newSize = Math.max(BUFFER_SIZE_MIN, Math.min(BUFFER_SIZE_MAX, newSize));
		setBufferSize(newSize);
	};

	const updateExtrema = (x: number, y: number, z: number) => {
		minX.current = minX.current === null ? x : Math.min(minX.current, x);
		maxX.current = maxX.current === null ? x : Math.max(maxX.current, x);
		minY.current = minY.current === null ? y : Math.min(minY.current, y);
		maxY.current = maxY.current === null ? y : Math.max(maxY.current, y);
		minZ.current = minZ.current === null ? z : Math.min(minZ.current, z);
		maxZ.current = maxZ.current === null ? z : Math.max(maxZ.current, z);
	};

	const resetExtrema = () => {
		minX.current = null;
		maxX.current = null;
		minY.current = null;
		maxY.current = null;
		minZ.current = null;
		maxZ.current = null;
	};

	// 3D rotation and projection to 2D canvas coords
	const project3Dto2D = (
		x: number,
		y: number,
		z: number,
		canvasWidth: number,
		canvasHeight: number,
	) => {
		const cosY = Math.cos(rotationY.current);
		const sinY = Math.sin(rotationY.current);
		const cosX = Math.cos(rotationX.current);
		const sinX = Math.sin(rotationX.current);

		// Rotate around Y axis
		const xr = x * cosY - z * sinY;
		const zr = x * sinY + z * cosY;

		// Rotate around X axis
		const yr = y * cosX - zr * sinX;
		const zr2 = y * sinX + zr * cosX;

		// Perspective projection parameters
		const distance = 200;
		const scale = distance / (distance + zr2);

		// Transform to canvas coords, applying viewport scale and offset
		const cx =
			(xr - offsetX.current) * scaleX.current * scale + canvasWidth / 2;
		const cy =
			canvasHeight / 2 - (yr - offsetY.current) * scaleY.current * scale;

		return { x: cx, y: cy };
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

		// Draw X axis line (from -axisLength to +axisLength along X, Y=Z=0)
		const axisLength = 100;
		const origin = project3Dto2D(0, 0, 0, w, h);
		const xPos = project3Dto2D(axisLength, 0, 0, w, h);
		ctx.beginPath();
		ctx.moveTo(origin.x, origin.y);
		ctx.lineTo(xPos.x, xPos.y);
		ctx.stroke();

		// Draw Y axis line (X=0, along Y axis)
		const yPos = project3Dto2D(0, axisLength, 0, w, h);
		ctx.beginPath();
		ctx.moveTo(origin.x, origin.y);
		ctx.lineTo(yPos.x, yPos.y);
		ctx.stroke();

		// Draw Z axis line (X=Y=0, along Z axis)
		const zPos = project3Dto2D(0, 0, axisLength, w, h);
		ctx.beginPath();
		ctx.moveTo(origin.x, origin.y);
		ctx.lineTo(zPos.x, zPos.y);
		ctx.stroke();

		// Draw points
		ctx.fillStyle = "orange";
		const lineWidth = 1;
		for (const p of points.current) {
			const pt = project3Dto2D(p.x, p.y, p.z, w, h);
			ctx.beginPath();
			ctx.arc(pt.x, pt.y, lineWidth, 0, Math.PI * 2);
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
		rotationX.current = 0;
		rotationY.current = 0;
		drawPoints();
	};

	const zoomToFit = () => {
		const canvas = canvasRef.current;
		if (!canvas) return;

		const w = canvas.width;
		const h = canvas.height;

		if (points.current.length === 0) return;

		// Project all points to 2D (rotated)
		const projectedPoints = points.current.map((p) =>
			project3Dto2D(p.x, p.y, p.z, w, h),
		);

		// Compute 2D bounding box of projected points
		let projMinX = Infinity,
			projMaxX = -Infinity,
			projMinY = Infinity,
			projMaxY = -Infinity;

		for (const p of projectedPoints) {
			if (p.x < projMinX) projMinX = p.x;
			if (p.x > projMaxX) projMaxX = p.x;
			if (p.y < projMinY) projMinY = p.y;
			if (p.y > projMaxY) projMaxY = p.y;
		}

		const projWidth = projMaxX - projMinX || 1;
		const projHeight = projMaxY - projMinY || 1;

		// Calculate scale to fit inside canvas with margin
		const scaleXNew = (w - 2 * MARGIN_PX) / projWidth;
		const scaleYNew = (h - 2 * MARGIN_PX) / projHeight;
		const scale = Math.min(scaleXNew, scaleYNew);

		// Set uniform scale
		scaleX.current = scale;
		scaleY.current = scale;

		// Calculate offsets so bounding box is centered
		// projected center:
		const projCenterX = (projMinX + projMaxX) / 2;
		const projCenterY = (projMinY + projMaxY) / 2;

		// We want the projected center to be at canvas center, so offset data accordingly:
		// To find offsetX and offsetY in data coords, invert projection for center:

		// Because offsetX and offsetY are in data space and used inside project3Dto2D,
		// we can approximate offsetX and offsetY by projecting the data center, then
		// adjusting offsetX and offsetY so projected center moves to canvas center.

		// Compute current data center
		const dataCenterX = (minX.current! + maxX.current!) / 2;
		const dataCenterY = (minY.current! + maxY.current!) / 2;

		// Compute difference in projected space between projected data center and canvas center
		const projectedDataCenter = project3Dto2D(
			dataCenterX,
			dataCenterY,
			(minZ.current! + maxZ.current!) / 2,
			w,
			h,
		);

		const dx = projectedDataCenter.x - w / 2;
		const dy = projectedDataCenter.y - h / 2;

		// Adjust offsets by moving them in data space to counter this delta
		// Approximate by unscaling:
		offsetX.current += dx / (scaleX.current * scale);
		offsetY.current -= dy / (scaleY.current * scale);

		drawPoints();
	};

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
							{ name: "z", stream: true },
						],
					}),
				);
				latestX.current = null;
				latestY.current = null;
				latestZ.current = null;
				points.current = [];
				resetExtrema();
				scaleX.current = 1;
				scaleY.current = 1;
				offsetX.current = 0;
				offsetY.current = 0;
				rotationX.current = 0;
				rotationY.current = 0;
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
					const val = dv.getFloat64(1 + len, false);
					message.on = name;
					message.value = val;
				}
				const on = message.on;
				const val = message.value;
				if (Number.isNaN(val)) return;

				if (on === "x") {
					latestX.current = val;
				} else if (on === "y") {
					latestY.current = val;
				} else if (on === "z") {
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
					updateExtrema(latestX.current, latestY.current, latestZ.current);

					while (points.current.length > bufferSizeRef.current) {
						points.current.shift();
					}

					requestAnimationFrame(drawPoints);
					latestX.current = null;
					latestY.current = null;
					latestZ.current = null;
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

	// Rotation controls
	const tiltUp = () => {
		rotationX.current -= 0.1;
		drawPoints();
	};
	const tiltDown = () => {
		rotationX.current += 0.1;
		drawPoints();
	};
	const rotateLeft = () => {
		rotationY.current -= 0.1;
		drawPoints();
	};
	const rotateRight = () => {
		rotationY.current += 0.1;
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
				/>
				{expanded && (
					<>
						<Button text="↑" onClick={tiltUp} tooltip="Tilt Up" />
						<Button text="↓" onClick={tiltDown} tooltip="Tilt Down" />
						<Button text="←" onClick={rotateLeft} tooltip="Rotate Left" />
						<Button text="→" onClick={rotateRight} tooltip="Rotate Right" />
					</>
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
				}}
			/>
		</div>
	);
};
