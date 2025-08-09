import { useEffect, useRef, useState } from "react";
import "uplot/dist/uPlot.min.css";
import type uPlot from "uplot";
import UplotReact from "uplot-react";
import walkerSprites from "../assets/walker.png";
import DragNumberInput from "./DragInputs";

const RECO_DELAY = 5000;
const BUFFER_SIZE = 200;
const BUFFER_UPPER = 2000;
const BUFFER_LOWER = 10;

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

const Button = ({
	activated = false,
	onClick = undefined,
	text,
	tooltip = undefined,
}: {
	activated?: boolean;
	onClick?: () => void;
	text: string;
	tooltip: undefined | string;
}) => {
	const [clickColor, setClickColor] = useState<string | undefined>(undefined);

	return (
		<div
			style={{
				color: "gray",
				zIndex: 1,
				backgroundColor: clickColor || (activated ? "yellow" : "#e0e0e0"),
				width: "12px",
				textAlign: "center",
				cursor: "pointer",
				border: "2px solid gray",
			}}
			onMouseDown={() => setClickColor("orange")}
			onMouseUp={() => {
				setClickColor(undefined);
				onClick?.();
			}}
			title={tooltip}
		>
			{text}
		</div>
	);
};

interface ScopeProps {
	id: number;
	onClose?: (id: number) => void;
}

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
	console.debug("buildOptions:", followMode, opts.scales.x.range);

	return opts;
};

export const Scope = ({ id, onClose }: ScopeProps) => {
	const [bufferSize, setBufferSize] = useState<number>(BUFFER_SIZE);
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
	const [chartKey, setChartKey] = useState(0);
	const elapsed = useRef(0);

	const [options, setOptions] = useState<uPlot.Options>(
		buildOptions(
			displayMode,
			label,
			upperBound.current,
			lowerBound.current,
			bufferSize,
			followMode,
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
				followMode,
			),
		);
	}, [displayMode, label, bufferSize, followMode]);

	const togglePointMode = () => {
		setDisplayMode((prev) => (prev === "line" ? "points" : "line"));
	};

	const toggleCyclicFollowMode = () => {
		resetBounds(bufferSize, followMode === "cyclic" ? "linear" : "cyclic");
		elapsed.current = 0;
		setFollowMode((prev) => (prev === "cyclic" ? "linear" : "cyclic"));
	};

	const toggleWalker = () => {
		setWalker((prev) => !prev);
	};

	const closeScope = () => {
		onClose?.(id);
	};

	const resetBounds = (buffSize, mode) => {
		upperBound.current = undefined;
		lowerBound.current = undefined;
		bufferRef.current.x =
			mode === "cyclic" ? Array.from({ length: buffSize }, (_, i) => i) : [];
		bufferRef.current.y = mode === "cyclic" ? new Array(buffSize).fill(0) : [];
		elapsed.current = 0;
		setOptions(
			buildOptions(
				displayMode,
				label,
				upperBound.current,
				lowerBound.current,
				buffSize,
				mode,
			),
		);
		setChartKey((k) => k + 1);
	};

	useEffect(() => {
		bufferRef.current = {
			x:
				followMode === "cyclic"
					? Array.from({ length: bufferSize }, (_, i) => i)
					: [],
			y: followMode === "cyclic" ? new Array(bufferSize).fill(0) : [],
		};
		elapsed.current = 0;
		upperBound.current = undefined;
		lowerBound.current = undefined;
		setChartKey((k) => k + 1);
	}, [bufferSize]);

	const commitBufferSize = (value) => {
		const bufSize = Math.round(Number.parseFloat(value));
		console.log("Setting buffer size to", bufSize);
		if (bufSize <= 0) {
			setBufferSize((_) => BUFFER_LOWER);
			return;
		}
		if (bufSize > BUFFER_UPPER) {
			setBufferSize((_) => BUFFER_UPPER);
			return;
		}
		setBufferSize((_) => bufSize);
		elapsed.current = 0;
	};

	useEffect(() => {
		setChartKey((k) => k + 1);
	}, [displayMode, followMode, bufferSize]);

	useEffect(() => {
		if (followMode === "linear") {
			// Pour éviter x qui croît trop
			if (elapsed.current > bufferSize) {
				elapsed.current = bufferSize; // limite max
			}
		}
	}, [followMode, bufferSize]);

	useEffect(() => {
		function connect() {
			if (isUnmounted.current) return;

			const ws = new WebSocket(
				`ws://${window.location.hostname}:6789/scope${id}/autoconfig`,
			);
			wsRef.current = ws;

			ws.onopen = () => {
				ws.send(
					JSON.stringify({
						kind: "oscilloscope",
						parameters: [{ name: "data", stream: true }],
					}),
				);
			};

			ws.onmessage = (event) => {
				if (inactivityTimeout.current) {
					clearTimeout(inactivityTimeout.current);
				}

				inactivityTimeout.current = setTimeout(() => {
					setAutoPaused(true);
				}, 1000);

				setAutoPaused(false);

				const data = JSON.parse(event.data);
				const newValue = Number.parseFloat(data.value);
				if (Number.isNaN(newValue)) return;

				setLabel(data.on);

				const buf = bufferRef.current;
				elapsed.current = elapsed.current + 1;
				if (followMode === "cyclic") {
					if (elapsed.current > bufferSize) {
						elapsed.current = 0;
					}
					// buf.x[elapsed.current] = elapsed.current;
					buf.y[elapsed.current] = newValue;
				} else {
					buf.x.push(elapsed.current);
					buf.y.push(newValue);
					if (buf.x.length > bufferSize) {
						buf.x.shift();
						buf.y.shift();
					}
				}

				if (upperBound.current === undefined || newValue > upperBound.current) {
					upperBound.current = newValue;
				}
				if (lowerBound.current === undefined || newValue < lowerBound.current) {
					lowerBound.current = newValue;
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
			};

			ws.onclose = () => {
				if (!isUnmounted.current) {
					console.warn("WebSocket closed, scheduling reconnect...");
					retryTimeoutRef.current = setTimeout(connect, RECO_DELAY);
				}
			};

			ws.onerror = (err) => {
				console.error("WebSocket error: ", err);
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
				<Button
					text="r"
					onClick={() => resetBounds(bufferSize, followMode)}
					tooltip="Reset"
				/>
				<Button
					text="p"
					activated={displayMode === "points"}
					onClick={togglePointMode}
					tooltip="Toggle points mode"
				/>
				<Button
					text="f"
					activated={followMode === "cyclic"}
					onClick={toggleCyclicFollowMode}
					tooltip="Toggle cyclic follow mode"
				/>
				<Button
					text="w"
					activated={walker}
					onClick={toggleWalker}
					tooltip="Invoke the walker"
				/>
				<Button text="x" onClick={closeScope} tooltip="Close oscilloscope" />
				<DragNumberInput
					range={[10, 200]}
					width="20px"
					value={bufferSize.toString()}
					onChange={(value) => setBufferSize((_) => Number.parseFloat(value))}
					onBlur={commitBufferSize}
				/>
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
