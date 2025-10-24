import { useEffect, useRef, useState } from "react";
import "uplot/dist/uPlot.min.css";
import type uPlot from "uplot";
import UplotReact from "uplot-react";
import walkerSprites from "../../assets/walker.png";
import DragNumberInput from "../DragInputs";
import { Button, type WidgetProps } from "./BaseComponents";

const RECO_DELAY = 5000;
const BUFFER_SIZE = 100;
const BUFFER_UPPER = 2000;
const BUFFER_LOWER = 2;

const Walker = ({ fps = 8, paused = false }) => {
	const duration = 5 / fps;

	return (
		<div
			className={`walker ${paused ? "paused" : ""}`}
			style={{
				backgroundImage: `url(${walkerSprites})`,
				animationDuration: `${duration}s`,
			}}
		/>
	);
};

type DisplayModes = "line" | "points";
type FollowModes = "cyclic" | "linear";

const buildOptions = (
	mode: DisplayModes,
	label: string,
	upper?: number,
	lower?: number,
	period?: number,
	followMode?: FollowModes,
): uPlot.Options => {
	const opts: uPlot.Options = {
		height: 115,
		width: 170,
		cursor: { drag: { setScale: false } },
		axes: [{ show: false }, { show: false }],
		legend: { show: false },
		series: [
			{ show: true },
			{
				label,
				stroke: mode === "line" ? "orange" : null,
				width: mode === "line" ? 3 : 0,
				points:
					mode === "points"
						? { show: true, size: 3, stroke: "orange", fill: "orange" }
						: { show: false },
			},
		],
		scales: {
			x: {
				time: false,
				range:
					followMode === "cyclic"
						? period
							? [0, period - 1]
							: undefined
						: undefined,
			},
			y: {
				auto: upper === undefined || lower === undefined,
				range:
					upper !== undefined && lower !== undefined
						? [lower, upper]
						: undefined,
			},
		},
	};
	return opts;
};

export const Scope = ({ id, onClose, num }: WidgetProps) => {
	const [bufferSize, setBufferSize] = useState<number>(BUFFER_SIZE);
	const bufferSizeRef = useRef<number>(BUFFER_SIZE);
	const bufferRef = useRef<{ x: number[]; y: number[] }>({
		x: Array.from({ length: bufferSize }, (_, i) => i),
		y: new Array(bufferSize).fill(0),
	});
	const startTimeRef = useRef<number>(Date.now());
	const wsRef = useRef<WebSocket | null>(null);
	const retryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const isUnmounted = useRef(false);
	const chartRef = useRef<uPlot | null>(null);
	const updateScheduled = useRef(false);
	const inactivityTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

	const upperBound = useRef(undefined);
	const lowerBound = useRef(undefined);
	const [label, setLabel] = useState("");
	const [walker, setWalker] = useState(false);
	const [autoPaused, setAutoPaused] = useState(false);
	const [displayMode, setDisplayMode] = useState<DisplayModes>("line");
	const [followMode, setFollowMode] = useState<FollowModes>("linear");
	const followModeRef = useRef<FollowModes>(followMode);
	const [chartKey, setChartKey] = useState(0);
	const elapsed = useRef(0);
	const firstValue = useRef(false);

	const [options, setOptions] = useState<uPlot.Options>(
		buildOptions(
			displayMode,
			label,
			upperBound.current,
			lowerBound.current,
			bufferSize,
			followModeRef.current,
		),
	);

	useEffect(() => {
		setOptions(
			buildOptions(
				displayMode,
				label,
				upperBound.current,
				lowerBound.current,
				bufferSize,
				followModeRef.current,
			),
		);
	}, [displayMode, label]);

	const togglePointMode = () => {
		setDisplayMode((prev) => (prev === "line" ? "points" : "line"));
	};

	const toggleCyclicFollowMode = () => {
		const newMode = followMode === "cyclic" ? "linear" : "cyclic";
		setFollowMode(newMode);
		followModeRef.current = newMode;
		chartRef.current = null;
		resetBounds(newMode);
		elapsed.current = 0;
		setChartKey((k) => k + 2);
	};

	const toggleWalker = () => {
		setWalker((prev) => !prev);
	};

	const closeScope = () => {
		onClose?.(id);
	};

	const resetBounds = (mode) => {
		upperBound.current = undefined;
		lowerBound.current = undefined;
		if (mode === "cyclic") {
			bufferRef.current.x = Array.from(
				{ length: bufferSizeRef.current },
				(_, i) => i,
			);
			bufferRef.current.y = new Array(bufferSizeRef.current).fill(0);
		} else {
			bufferRef.current.x = [];
			bufferRef.current.y = [];
		}
		elapsed.current = 0;
		setOptions(
			buildOptions(
				displayMode,
				label,
				upperBound.current,
				lowerBound.current,
				bufferSizeRef.current,
				followModeRef.current,
			),
		);
		setChartKey((k) => k + 1);
	};

	useEffect(() => {
		bufferSizeRef.current = bufferSize;
		resetBounds(followMode);
	}, [bufferSize]);

	const commitBufferSize = (value) => {
		const bufSize = Math.round(Number.parseFloat(value));
		if (bufSize <= 0) {
			setBufferSize((_) => BUFFER_LOWER);
			return;
		}
		setBufferSize((_) => bufSize);
		elapsed.current = 0;
	};

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
						parameters: [{ name: "data", stream: true }],
					}),
				);
				firstValue.current = false;
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

				const newValue = Number.parseFloat(message.value);
				if (Number.isNaN(newValue)) return;

				setLabel(message.on);

				const buf = bufferRef.current;
				const mode = followModeRef.current;
				const size = bufferSizeRef.current;
				if (mode === "cyclic") {
					elapsed.current = (elapsed.current + 1) % size;
					buf.y[elapsed.current] = newValue;
				} else {
					elapsed.current = elapsed.current + 1;
					buf.x.push(elapsed.current);
					buf.y.push(newValue);
					if (buf.x.length > size) {
						buf.x.shift();
						buf.y.shift();
					}
				}

				let update = false;
				if (upperBound.current === undefined || newValue > upperBound.current) {
					upperBound.current = newValue;
					update = true;
				}
				if (lowerBound.current === undefined || newValue < lowerBound.current) {
					lowerBound.current = newValue;
					update = true;
				}
				if (update) {
					setChartKey((k) => k + 1);
				}

				if (!updateScheduled.current) {
					updateScheduled.current = true;
					requestAnimationFrame(() => {
						if (chartRef.current) {
							chartRef.current.setData([buf.x, buf.y]);
						}
						updateScheduled.current = false;
					});
				}
				if (firstValue.current === false) {
					firstValue.current = true;
					resetBounds(followMode);
				}
			};

			ws.onclose = () => {
				if (!isUnmounted.current) {
					console.warn("WebSocket closed, scheduling reconnect...");
					firstValue.current = false;
					retryTimeoutRef.current = setTimeout(connect, RECO_DELAY);
				}
			};

			ws.onerror = (err) => {
				console.error("WebSocket error: ", err);
				firstValue.current = false;
				ws.close();
			};
		}

		connect();

		return () => {
			if (inactivityTimeout.current) {
				clearTimeout(inactivityTimeout.current);
			}
			setTimeout(() => {
				isUnmounted.current = true;

				if (retryTimeoutRef.current !== null) {
					clearTimeout(retryTimeoutRef.current);
				}

				if (wsRef.current) {
					wsRef.current.close();
					wsRef.current = null;
				}
			}, 1000);
		};
	}, [id]);

	return (
		<div className="scope">
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
					range={[BUFFER_LOWER, BUFFER_UPPER]}
					width="30px"
					value={bufferSize.toString()}
					onChange={(value) => setBufferSize((_) => Number.parseFloat(value))}
					onBlur={commitBufferSize}
					style={{
						height: "10px",
						color: "gray",
						fontSize: "14px",
						textAlign: "right",
						boxShadow: "unset",
					}}
				/>
				<Button
					text="c"
					activated={followMode === "cyclic"}
					onClick={toggleCyclicFollowMode}
					tooltip="Toggle cyclic mode"
				/>
				<Button
					text="r"
					onClick={() => resetBounds(followMode)}
					tooltip="Reset"
				/>
				<Button
					text="p"
					activated={displayMode === "points"}
					onClick={togglePointMode}
					tooltip="Toggle points mode"
				/>
				<Button
					text="w"
					activated={walker}
					onClick={toggleWalker}
					tooltip="Invoke the walker"
				/>
				<Button text="x" onClick={closeScope} tooltip="Close oscilloscope" />
			</div>
			<UplotReact
				key={chartKey}
				options={options}
				data={[bufferRef.current.x, bufferRef.current.y]}
				onCreate={(chart) => {
					chartRef.current = chart;
				}}
			/>
			{walker && <Walker paused={autoPaused} />}
		</div>
	);
};
