import {
	forwardRef,
	useEffect,
	useImperativeHandle,
	useRef,
	useState,
} from "react";
import { useTrevorDispatch, useTrevorSelector } from "../store";
import { resetCCState } from "../store/runtimeSlice";
import { generateAcronym } from "../utils/utils";
import { useTrevorWebSocket } from "../websockets/websocket";

interface CCsRackProps {
	onRackScroll?: () => void;
	horizontal?: boolean;
}

export interface RackRowCCRef {
	resetAll: () => void;
}

interface RackRowCCs {
	id: string;
}

const CircularSlider = ({ value, param, onManualSliderChange }) => {
	const radius = 20;
	const strokeWidth = 2;
	const size = radius * 2 + strokeWidth;
	const center = radius + strokeWidth / 2;

	const startAngle = (5 * Math.PI) / 4;
	const totalAngle = (3 * Math.PI) / 2;

	const [ghostValue, setGhostValue] = useState(null);
	const ghostValueRef = useRef(null);
	const startY = useRef(null);

	const angle = startAngle - (value / 127) * totalAngle;
	const cx = center + radius * Math.cos(angle);
	const cy = center - radius * Math.sin(angle);

	const ghostAngle =
		ghostValue !== null ? startAngle - (ghostValue / 127) * totalAngle : null;
	const ghostCx =
		ghostAngle !== null ? center + radius * Math.cos(ghostAngle) : null;
	const ghostCy =
		ghostAngle !== null ? center - radius * Math.sin(ghostAngle) : null;

	const startDrag = (y) => {
		startY.current = y;
		window.addEventListener("mousemove", onMouseMove);
		window.addEventListener("mouseup", onMouseUp);
		window.addEventListener("touchmove", onTouchMove);
		window.addEventListener("touchend", onTouchEnd);
	};

	const handlePointerDown = (e) => {
		e.preventDefault();
		const y = e.clientY;
		startDrag(y);
	};

	const handleTouchStart = (e) => {
		const y = e.touches[0].clientY;
		startDrag(y);
	};

	const onMouseMove = (e) => {
		handleDrag(e.clientY);
	};

	const onTouchMove = (e) => {
		if (e.touches.length > 0) {
			handleDrag(e.touches[0].clientY);
		}
	};

	const handleDrag = (currentY) => {
		const delta = startY.current - currentY;
		const deltaValue = Math.round(delta / 2);
		const newValue = Math.min(127, Math.max(0, value + deltaValue));
		ghostValueRef.current = newValue;
		setGhostValue(newValue);
	};

	const endDrag = () => {
		window.removeEventListener("mousemove", onMouseMove);
		window.removeEventListener("mouseup", onMouseUp);
		window.removeEventListener("touchmove", onTouchMove);
		window.removeEventListener("touchend", onTouchEnd);

		if (ghostValueRef.current !== null && ghostValueRef.current !== value) {
			onManualSliderChange?.(ghostValueRef.current);
		}
	};

	const onMouseUp = () => endDrag();
	const onTouchEnd = () => endDrag();

	useEffect(() => {
		setGhostValue(null);
		ghostValueRef.current = null;
	}, [value]);

	return (
		<div
			style={{
				flexDirection: "column",
				display: "flex",
				alignItems: "center",
				userSelect: "none",
				touchAction: "none",
			}}
			onPointerDown={handlePointerDown}
			onTouchStart={handleTouchStart}
		>
			<p style={{ fontSize: "12px", margin: "5px 0 0 5px" }}>
				{generateAcronym(param, 5)}
			</p>
			{/* biome-ignore lint/a11y/noSvgWithoutTitle: <explanation> */}
			<svg width={size} height={size}>
				<circle
					cx={center}
					cy={center}
					r={radius}
					stroke="gray"
					strokeWidth={strokeWidth}
					fill="none"
				/>
				<circle cx={cx} cy={cy} r={4} fill="orange" />

				{ghostValue !== null && (
					<circle cx={ghostCx} cy={ghostCy} r={4} fill="orange" opacity={0.4} />
				)}

				<text
					x="50%"
					y="50%"
					textAnchor="middle"
					dy="4px"
					fontSize="14px"
					fill="#333"
				>
					{value}
				</text>

				{ghostValue !== null && (
					<text
						x="50%"
						y="50%"
						textAnchor="middle"
						dy="18px"
						fontSize="10px"
						fill="#666"
					>
						{ghostValue}
					</text>
				)}
			</svg>
		</div>
	);
};

const collator = new Intl.Collator(undefined, {
	numeric: true,
	sensitivity: "base",
});

const sortObjectByKey = (obj) => {
	return Object.fromEntries(
		Object.entries(obj).sort(([keyA], [keyB]) => collator.compare(keyA, keyB)),
	);
};

const switchOrientation = (horizontal) => {
	if (horizontal) {
		return {
			maxHeight: "125px",
			minHeight: "125px",
			overflowX: "auto",
			overflowY: "auto",
		};
	}
	return {
		maxWidth: "100px",
		minWidth: "100px",
		overflowX: "auto",
		overflowY: "auto",
	};
};

const switchSizeOrientation = (horizontal) => {
	if (horizontal) {
		return {
			// width: "100%",
			height: "100px",
		};
	}
	return {
		width: "90px",
		height: "100%",
	};
};

export const RackRowCCs = forwardRef<RackRowCCRef, CCsRackProps>(
	({ onRackScroll, horizontal }: CCsRackProps, ref) => {
		const ccs = useTrevorSelector((state) => state.runTime.ccValues);
		const dispatch = useTrevorDispatch();
		const trevorSocket = useTrevorWebSocket();

		useImperativeHandle(ref, () => ({
			resetAll() {
				dispatch(resetCCState());
			},
		}));

		const handleParameterChange = (
			deviceId,
			sectionName,
			parameterName,
			value,
		) => {
			trevorSocket.setParameterValue(
				deviceId,
				sectionName,
				parameterName,
				value,
			);
		};

		const updateCCs = () => {
			if (Object.values(ccs).length === 0) {
				return <p style={{ color: "#808080" }}>CCs values</p>;
			}
			return Object.entries(ccs).map(([deviceId, config]) =>
				Object.entries(config).map(([deviceName, section]) => (
					<div
						key={deviceName}
						style={{
							backgroundColor: "#e0e0e0",
							border: "3px solid #808080",
							...switchSizeOrientation(horizontal),
							padding: "1px",
						}}
					>
						<p style={{ fontSize: "16px", margin: "0px" }}>{deviceName}</p>
						<div
							key={`${deviceName}-body`}
							style={{
								display: "flex",
								flexDirection: horizontal ? "row" : "column",
								justifyContent: "center",
							}}
						>
							{Object.entries(sortObjectByKey(section)).map(
								([sectionName, parameter]) => (
									<div
										key={`${deviceName}::${sectionName}`}
										style={{
											border: "2px solid #808080",
											// borderTop: "2px solid #808080",
											// borderRight: "2px solid #808080",
											width: "100%",
											display: "flex",
											flexDirection: horizontal ? "row" : "column",
											borderRadius: "3px",
											margin: "1px",
										}}
									>
										<p style={{ fontSize: "12px" }}>
											{generateAcronym(sectionName, 5)}
										</p>
										{Object.entries(sortObjectByKey(parameter)).map(
											([paramName, value]) => (
												<CircularSlider
													key={`${deviceName}::${sectionName}::${paramName}`}
													value={value}
													param={paramName}
													onManualSliderChange={(value) =>
														handleParameterChange(
															deviceId,
															sectionName,
															paramName,
															value,
														)
													}
												/>
											),
										)}
									</div>
								),
							)}
						</div>
					</div>
				)),
			);
		};

		return (
			<div
				className={`rack-row ${horizontal ? "horizontal" : ""}`}
				onScroll={() => onRackScroll?.()}
				// @ts-expect-error: all good, but should check later
				style={switchOrientation(horizontal)}
			>
				{updateCCs()}
			</div>
		);
	},
);
