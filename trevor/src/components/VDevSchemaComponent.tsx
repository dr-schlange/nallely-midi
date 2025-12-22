/** biome-ignore-all lint/a11y/useKeyWithClickEvents: <explanation> */
/** biome-ignore-all lint/a11y/noStaticElementInteractions: <explanation> */
import { memo, useMemo } from "react";
import type { VirtualDeviceSchema, VirtualParameter } from "../model";
import { generateAcronym, useLongPress } from "../utils/utils";

interface VDeviceProps {
	schema: VirtualDeviceSchema;
	onClick?: (device: VirtualDeviceSchema) => void;
	onLongPress?: (device: VirtualDeviceSchema) => void;
	onTouchStart?: (device: VirtualDeviceSchema) => void;
	selected?: boolean;
}

const Port = memo(
	({
		parameter,
		reverse = false,
	}: {
		parameter: VirtualParameter;
		reverse?: boolean;
	}) => {
		return (
			<div
				style={{
					display: "flex",
					flexDirection: reverse ? "row-reverse" : "row",
					alignItems: "center",
					justifyContent: "flex-end",
					gap: "2px",
				}}
			>
				<p
					style={{
						fontSize: "8px",
						margin: 0,
						color: "gray",
					}}
					title={parameter.name}
				>
					{generateAcronym(parameter.name, 4)}
				</p>
				<div
					style={{
						width: "6px",
						height: "6px",
						backgroundColor: "orange",
						borderRadius: "50%",
					}}
				/>
			</div>
		);
	},
);

const HIDE = ["set_pause"];
const VDeviceSchema = memo(
	({ schema, onClick, selected, onLongPress, onTouchStart }: VDeviceProps) => {
		const height = "100px";
		const width = "58px";
		const clipping = schema.name.length >= 8;
		const parameters = schema.parameters.filter((e) => !HIDE.includes(e.name));
		const enoughSpace = parameters.length < 10;
		const sufficientSpace = parameters.length < 15;

		const longPressEvents = useLongPress(
			() => {
				onLongPress?.(schema);
			},
			500,
			() => onTouchStart?.(schema),
		);

		return (
			<div
				style={{
					paddingTop: "1px",
					border: `3px solid ${selected ? "orange" : "gray"}`,
					height: height,
					width: width,
					minWidth: width,
					display: "flex",
					flexWrap: "wrap",
					flexDirection: "row",
					gap: "0px",
					justifyContent: "space-evenly",
					backgroundColor: "#d0d0d0",
					userSelect: "none",
				}}
				onClick={(event) => {
					event.preventDefault();
					event.stopPropagation();

					if (!longPressEvents.didlongpress.current) {
						onClick?.(schema);
					}
				}}
				{...longPressEvents}
			>
				<div
					style={{
						display: "inherit",
						flexDirection: "column",
						alignItems: "center",
						justifyContent: "space-between",
						height: "101px",
						width: "25px",
						padding: "1px",
						gap: "2px",
					}}
				>
					<div
						style={{
							maxHeight: enoughSpace
								? "98px"
								: sufficientSpace
									? "90px"
									: "60px",
							display: "flex",
							flexDirection: "column",
							justifyContent: clipping ? "flex-end" : "flex-start",
							overflow: "hidden",
						}}
					>
						<p
							style={{
								margin: 0,
								whiteSpace: "nowrap",
								fontSize: "14px",
								color: "black",
								writingMode: "vertical-rl",
								textOrientation: "sideways",
								transform: "rotate(180deg)",
							}}
						>
							{schema.name}
						</p>
					</div>
					<div
						style={{
							height: enoughSpace
								? 0
								: sufficientSpace
									? "34px"
									: clipping
										? "30px"
										: "59px",
							width: "22px",
							margin: "1px",
							display: "inherit",
							flexDirection: "column-reverse",
							justifyContent: "flex-start",
							gap: "2px",
							overflow: "hidden",
						}}
					>
						{parameters.slice(10).map((p) => (
							<Port key={p.cv_name} parameter={p} reverse />
						))}
					</div>
				</div>
				<div
					style={{
						height: "98px",
						width: "25px",
						padding: "1px",
						gap: "2px",
						display: "inherit",
						flexDirection: "column-reverse",
						justifyContent: "flex-end",
					}}
				>
					{parameters.slice(0, 10).map((p) => (
						<Port key={p.cv_name} parameter={p} />
					))}
				</div>
			</div>
		);
	},
);

export default VDeviceSchema;
