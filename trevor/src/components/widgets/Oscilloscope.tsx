import { useEffect, useRef, useState } from "react";
import "uplot/dist/uPlot.min.css";
import type uPlot from "uplot";
import UplotReact from "uplot-react";
import walkerSprites from "../../assets/walker.png";
import DragNumberInput from "../DragInputs";
import {
	Button,
	useNallelyRegistration,
	type WidgetProps,
} from "./BaseComponents";

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
				stroke: mode === "line" ? "orange" : "transparent",
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
				auto: false,
			},
		},
	};
	return opts;
};

type ScopeProps = WidgetProps & {
	onMessage?: (value: number) => void;
};

export const Scope = ({
	id,
	onClose,
	num,
	style,
	onMessage = undefined,
}: ScopeProps) => {
	const [bufferSize, setBufferSize] = useState<number>(BUFFER_SIZE);
	const bufferSizeRef = useRef<number>(BUFFER_SIZE);
	const bufferRef = useRef<{ x: number[]; y: number[] }>({
		x: Array.from({ length: bufferSize }, (_, i) => i),
		y: new Array(bufferSize).fill(0),
	});
	const chartRef = useRef<uPlot | null>(null);
	const updateScheduled = useRef(false);
	const inactivityTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

	const upperBound = useRef(undefined);
	const lowerBound = useRef(undefined);
	const statsRef = useRef<HTMLParagraphElement | null>(null);
	const [label, setLabel] = useState("");
	const labelRef = useRef("");
	const [walker, setWalker] = useState(false);
	const walkerRef = useRef<HTMLDivElement | null>(null);
	const [displayMode, setDisplayMode] = useState<DisplayModes>("line");
	const [minMaxDisplay, setMinMaxDisplay] = useState(true);
	const [followMode, setFollowMode] = useState<FollowModes>("cyclic");
	const followModeRef = useRef<FollowModes>(followMode);
	const [chartKey, setChartKey] = useState(0);
	const elapsed = useRef(0);
	const firstValue = useRef(false);

	const [options, setOptions] = useState<uPlot.Options>(
		buildOptions(displayMode, label, bufferSize, followModeRef.current),
	);

	useEffect(() => {
		setOptions(
			buildOptions(displayMode, label, bufferSize, followModeRef.current),
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

	const toggleMinMaxDisplay = () => {
		setMinMaxDisplay((prev) => !prev);
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

	const scopeParameters = useRef({
		data: { min: null, max: null, stream: true },
	}).current;
	const scopeConfig = useRef({}).current;

	useNallelyRegistration(
		id,
		scopeParameters,
		scopeConfig,
		"oscilloscope",
		(message) => {
			if (inactivityTimeout.current) {
				clearTimeout(inactivityTimeout.current);
			}

			inactivityTimeout.current = setTimeout(() => {
				walkerRef.current?.classList.add("paused");
			}, 1000);

			walkerRef.current?.classList.remove("paused");

			const newValue = Number.parseFloat(message.value);
			onMessage?.(message.value);
			if (Number.isNaN(newValue)) return;

			if (message.on !== labelRef.current) {
				labelRef.current = message.on;
				setLabel(message.on);
			}

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

			if (!updateScheduled.current) {
				updateScheduled.current = true;
				requestAnimationFrame(() => {
					let min = Infinity,
						max = -Infinity;
					for (const v of buf.y) {
						if (v < min) min = v;
						if (v > max) max = v;
					}
					upperBound.current = max;
					lowerBound.current = min;
					if (chartRef.current) {
						chartRef.current.batch(() => {
							chartRef.current.setData([buf.x, buf.y], false);
							if (buf.x.length > 0) {
								chartRef.current.setScale("x", {
									min: buf.x[0],
									max: buf.x[buf.x.length - 1],
								});
							}
							if (min !== Infinity) {
								const pad = max === min ? 0.1 : 0;
								chartRef.current.setScale("y", {
									min: min - pad,
									max: max + pad,
								});
							}
						});
					}
					updateScheduled.current = false;
					if (statsRef.current) {
						statsRef.current.textContent = `min: ${min === Infinity ? "?" : min}\nval: ${newValue}\nmax: ${max === -Infinity ? "?" : max}`;
					}
				});
			}
			if (firstValue.current === false) {
				firstValue.current = true;
				resetBounds(followMode);
			}
		},
		() => {
			firstValue.current = false;
		},
	);

	return (
		<div className="scope" style={style ?? {}}>
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
					gap: "3.5px",
					pointerEvents: "none",
				}}
			>
				<Button
					text="b"
					activated={minMaxDisplay}
					onClick={toggleMinMaxDisplay}
					tooltip="Toggle min max display"
				/>
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
						paddingRight: "1px",
						paddingLeft: "0px",
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
			{walker && (
				<div
					ref={walkerRef}
					className="walker"
					style={{
						backgroundImage: `url(${walkerSprites})`,
						animationDuration: `${5 / 8}s`,
					}}
				/>
			)}
			{minMaxDisplay && (
				<div
					style={{
						position: "absolute",
						bottom: "0px",
						color: "gray",
						marginBottom: "2px",
					}}
				>
					<p
						ref={statsRef}
						style={{ fontSize: "12px", margin: 0, whiteSpace: "pre-line" }}
					>
						min: ?{"\n"}val: ?{"\n"}max: ?
					</p>
				</div>
			)}
		</div>
	);
};
