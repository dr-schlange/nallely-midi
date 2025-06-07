import { forwardRef, useImperativeHandle, useMemo } from "react";
import { useTrevorDispatch, useTrevorSelector } from "../store";
import { resetCCState } from "../store/runtimeSlice";
import { generateAcronym } from "../utils/utils";

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

const CircularSlider = ({ value, section, param }) => {
	const radius = 20;
	const strokeWidth = 2;
	const size = radius * 2 + strokeWidth;
	const center = radius + strokeWidth / 2;

	const startAngle = (5 * Math.PI) / 4;
	const totalAngle = (3 * Math.PI) / 2;

	const angle = startAngle - (value / 127) * totalAngle;

	const cx = center + radius * Math.cos(angle);
	const cy = center - radius * Math.sin(angle);

	return (
		<div
			style={{ flexDirection: "column", display: "flex", alignItems: "center" }}
		>
			<p
				style={{
					fontSize: "8px",
					margin: "0px",
					marginTop: "5px",
					marginLeft: "5px",
				}}
			>{`${generateAcronym(param, 5)}`}</p>
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
				<text
					x="50%"
					y="50%"
					textAnchor="middle"
					dy=".3em"
					fontSize="10"
					fill="#333"
				>
					{value}
				</text>
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

		useImperativeHandle(ref, () => ({
			resetAll() {
				dispatch(resetCCState());
			},
		}));

		const updateCCs = () => {
			if (Object.values(ccs).length === 0) {
				return <p style={{ color: "#808080" }}>CCs values</p>;
			}
			return Object.entries(ccs).map(([deviceName, section]) => (
				<div
					key={deviceName}
					style={{
						backgroundColor: "#e0e0e0",
						border: "5px solid #808080",
						...switchSizeOrientation(horizontal),
					}}
				>
					<p style={{ fontSize: "10px" }}>{deviceName}</p>
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
										width: "100%",
										display: "flex",
										flexDirection: horizontal ? "row" : "column",
									}}
								>
									<p style={{ fontSize: "8px" }}>
										{generateAcronym(sectionName, 5)}
									</p>
									{Object.entries(sortObjectByKey(parameter)).map(
										([paramName, value]) => (
											<CircularSlider
												key={`${deviceName}::${sectionName}::${paramName}`}
												value={value}
												section={sectionName}
												param={paramName}
											/>
										),
									)}
								</div>
							),
						)}
					</div>
				</div>
			));
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
