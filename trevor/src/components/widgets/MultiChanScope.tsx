// 99% LLM generated
import { useMemo, useRef, useState } from "react";
import type uPlot from "uplot";
import UplotReact from "uplot-react";
import "uplot/dist/uPlot.min.css";
import { useScopeWorker } from "../../hooks/wsHooks";
import DragNumberInput from "../DragInputs";
import { Button, type WidgetProps } from "./BaseComponents";

const BUFFER_SIZE = 100;
const BUFFER_UPPER = 2000;
const BUFFER_LOWER = 2;
const MAX_CHANNELS = 4;
const CHANNEL_NAMES = ["ch1", "ch2", "ch3", "ch4"] as const;
const CHANNEL_COLORS = [
	"orange",
	"rgb(128, 128, 128)",
	"rgb(123, 85, 15)",
	"rgb(44, 40, 30)",
] as const;

type DisplayModes = "line" | "points";
type FollowModes = "cyclic" | "linear";

const buildOptions = (
	mode: DisplayModes,
	numChannels: number,
	period?: number,
	followMode?: FollowModes,
): uPlot.Options => {
	const series: uPlot.Series[] = [{ show: true }];
	for (let i = 0; i < numChannels; i++) {
		const color = CHANNEL_COLORS[i];
		series.push({
			label: CHANNEL_NAMES[i],
			stroke: mode === "line" ? color : "transparent",
			width: mode === "line" ? 3 : 0,
			points:
				mode === "points"
					? { show: true, size: 3, stroke: color, fill: color }
					: { show: false },
		});
	}
	return {
		height: 115,
		width: 170,
		cursor: { drag: { setScale: false } },
		axes: [{ show: false }, { show: false }],
		legend: { show: false },
		series,
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
			y: { auto: false },
		},
	};
};

const makeBuffer = (size: number, mode: FollowModes) => ({
	x:
		mode === "cyclic"
			? Array.from({ length: size }, (_, i) => i)
			: ([] as number[]),
	ys: Array.from({ length: MAX_CHANNELS }, () =>
		mode === "cyclic" ? new Array(size).fill(0) : ([] as number[]),
	) as number[][],
});

export const MultiChanScope = ({ id, onClose, num, style }: WidgetProps) => {
	const [bufferSize, setBufferSize] = useState<number>(BUFFER_SIZE);
	const bufferSizeRef = useRef<number>(BUFFER_SIZE);

	const [numChannels, setNumChannels] = useState(1);
	const numChannelsRef = useRef(1);

	const [displayMode, setDisplayMode] = useState<DisplayModes>("line");
	const displayModeRef = useRef<DisplayModes>("line");

	const [followMode, setFollowMode] = useState<FollowModes>("cyclic");
	const followModeRef = useRef<FollowModes>("cyclic");

	const [minMaxDisplay, setMinMaxDisplay] = useState(true);

	// resetCounter is incremented on explicit resets; combined with numChannels and
	// displayMode it forms a stable string key that forces UplotReact to remount only
	// when options actually change — so options, data, and key are always in sync.
	const [resetCounter, setResetCounter] = useState(0);
	const chartKey = `${numChannels}-${displayMode}-${resetCounter}`;

	const options = useMemo(
		() => buildOptions(displayMode, numChannels, bufferSize, followMode),
		[displayMode, numChannels, bufferSize, followMode],
	);

	const bufferRef = useRef(makeBuffer(BUFFER_SIZE, "cyclic"));
	const chartRef = useRef<uPlot | null>(null);
	const updateScheduled = useRef(false);
	const statsRef = useRef<HTMLParagraphElement | null>(null);

	// Per-channel elapsed in cyclic mode (each channel writes at its own pace)
	const elapsedPerCh = useRef(new Array(MAX_CHANNELS).fill(0));
	// Shared elapsed for linear mode (ch1 drives the x-axis)
	const elapsed = useRef(0);

	const upperBound = useRef<number | undefined>(undefined);
	const lowerBound = useRef<number | undefined>(undefined);
	const firstValue = useRef(false);

	const resetBuffer = (mode: FollowModes, size: number) => {
		bufferRef.current = makeBuffer(size, mode);
		elapsed.current = 0;
		elapsedPerCh.current = new Array(MAX_CHANNELS).fill(0);
		upperBound.current = undefined;
		lowerBound.current = undefined;
	};

	const doReset = (mode: FollowModes) => {
		resetBuffer(mode, bufferSizeRef.current);
		chartRef.current = null;
		setResetCounter((c) => c + 1);
	};

	const cycleChannels = () => {
		const next = (numChannels % MAX_CHANNELS) + 1;
		numChannelsRef.current = next;
		// When adding channels in linear mode, pad the new channel buffers so all
		// ys arrays stay the same length as x (uPlot requires aligned data).
		if (followModeRef.current === "linear") {
			const xLen = bufferRef.current.x.length;
			for (let i = numChannels; i < next; i++) {
				bufferRef.current.ys[i] = new Array(xLen).fill(Number.NaN);
			}
		}
		chartRef.current = null;
		setNumChannels(next);
	};

	const togglePointMode = () => {
		const next: DisplayModes = displayMode === "line" ? "points" : "line";
		displayModeRef.current = next;
		setDisplayMode(next);
	};

	const toggleCyclicFollowMode = () => {
		const next: FollowModes = followMode === "cyclic" ? "linear" : "cyclic";
		followModeRef.current = next;
		setFollowMode(next);
		doReset(next);
	};

	const commitBufferSize = (value: string) => {
		const bufSize = Math.round(Number.parseFloat(value));
		const clamped = Math.max(
			BUFFER_LOWER,
			Math.min(BUFFER_UPPER, bufSize || BUFFER_LOWER),
		);
		bufferSizeRef.current = clamped;
		setBufferSize(clamped);
		resetBuffer(followModeRef.current, clamped);
		chartRef.current = null;
		setResetCounter((c) => c + 1);
	};

	const scopeParameters = useRef({
		ch1: { min: null, max: null, stream: true },
		ch2: { min: null, max: null, stream: true },
		ch3: { min: null, max: null, stream: true },
		ch4: { min: null, max: null, stream: true },
	}).current;

	useScopeWorker(
		id,
		scopeParameters,
		"oscilloscope",
		(messages) => {
			const buf = bufferRef.current;
			const mode = followModeRef.current;
			const size = bufferSizeRef.current;
			const nCh = numChannelsRef.current;

			const lastValues: (number | undefined)[] = new Array(MAX_CHANNELS).fill(
				undefined,
			);

			for (const message of messages) {
				const chIdx = CHANNEL_NAMES.indexOf(
					message.on as (typeof CHANNEL_NAMES)[number],
				);
				if (chIdx === -1 || chIdx >= nCh) continue;
				const val = message.value;
				if (Number.isNaN(val)) continue;

				if (mode === "cyclic") {
					const e = (elapsedPerCh.current[chIdx] + 1) % size;
					elapsedPerCh.current[chIdx] = e;
					buf.ys[chIdx][e] = val;
				} else {
					if (chIdx === 0) {
						// ch1 advances the shared timeline; all other channels get NaN for
						// this slot and will overwrite it if a value arrives this batch.
						elapsed.current += 1;
						buf.x.push(elapsed.current);
						for (let i = 0; i < MAX_CHANNELS; i++) buf.ys[i].push(Number.NaN);
						if (buf.x.length > size) {
							buf.x.shift();
							for (const ys of buf.ys) ys.shift();
						}
					}
					// Overwrite the most recent slot for this channel
					if (buf.ys[chIdx].length > 0) {
						buf.ys[chIdx][buf.ys[chIdx].length - 1] = val;
					}
				}
				lastValues[chIdx] = val;
			}

			if (lastValues.every((v) => v === undefined)) return;

			if (!updateScheduled.current) {
				updateScheduled.current = true;
				requestAnimationFrame(() => {
					const nChSnap = numChannelsRef.current;
					let min = Infinity;
					let max = -Infinity;
					for (let i = 0; i < nChSnap; i++) {
						for (const v of buf.ys[i]) {
							if (v < min) min = v;
							if (v > max) max = v;
						}
					}
					upperBound.current = max;
					lowerBound.current = min;

					if (chartRef.current) {
						chartRef.current.batch(() => {
							chartRef.current.setData(
								[buf.x, ...buf.ys.slice(0, nChSnap)],
								false,
							);
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
						if (nChSnap === 1) {
							const v = lastValues[0];
							statsRef.current.textContent = `min: ${min === Infinity ? "?" : min}\nval: ${v ?? "?"}\nmax: ${max === -Infinity ? "?" : max}`;
						} else {
							statsRef.current.textContent = lastValues
								.slice(0, nChSnap)
								.map((v, i) => `${CHANNEL_NAMES[i]}: ${v ?? "?"}`)
								.join("\n");
						}
					}
				});
			}

			if (!firstValue.current) {
				firstValue.current = true;
				resetBuffer(followModeRef.current, bufferSizeRef.current);
				setResetCounter((c) => c + 1);
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
					onClick={() => setMinMaxDisplay((p) => !p)}
					tooltip="Toggle min/max display"
				/>
				<DragNumberInput
					range={[BUFFER_LOWER, BUFFER_UPPER]}
					value={bufferSize.toString()}
					onChange={(value) => setBufferSize(Number.parseFloat(value))}
					onBlur={commitBufferSize}
					style={{
						height: "10px",
						color: "gray",
						fontSize: "14px",
						textAlign: "right",
						paddingRight: "1px",
						paddingLeft: "0px",
						boxShadow: "unset",
						width: "30px",
					}}
				/>
				<Button
					text="c"
					activated={followMode === "cyclic"}
					onClick={toggleCyclicFollowMode}
					tooltip="Toggle cyclic mode"
				/>
				<Button text="r" onClick={() => doReset(followMode)} tooltip="Reset" />
				<Button
					text="p"
					activated={displayMode === "points"}
					onClick={togglePointMode}
					tooltip="Toggle points mode"
				/>
				<Button
					text={`${numChannels}`}
					onClick={cycleChannels}
					tooltip={`Active channels: ${numChannels} — click to cycle 1–4`}
				/>
				<Button text="x" onClick={() => onClose?.(id)} tooltip="Close" />
			</div>
			<UplotReact
				key={chartKey}
				options={options}
				data={[
					bufferRef.current.x,
					...bufferRef.current.ys.slice(0, numChannels),
				]}
				onCreate={(chart) => {
					chartRef.current = chart;
				}}
			/>
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
						{numChannels === 1
							? "min: ?\nval: ?\nmax: ?"
							: CHANNEL_NAMES.slice(0, numChannels)
									.map((n) => `${n}: ?`)
									.join("\n")}
					</p>
				</div>
			)}
		</div>
	);
};
