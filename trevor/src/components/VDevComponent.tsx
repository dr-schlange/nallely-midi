/** biome-ignore-all lint/a11y/useKeyWithClickEvents: <explanation> */
/** biome-ignore-all lint/a11y/noStaticElementInteractions: <explanation> */
import type {
	VirtualDevice,
	VirtualDeviceSchema,
	VirtualParameter,
} from "../model";
import { buildSectionId, devUID, generateAcronym, parameterUUID, useLongPress } from "../utils/utils";
import { Button } from "./widgets/BaseComponents";

interface MiniRackProps {
	devices: VirtualDevice[];
}

export const MiniRack = ({ devices }: MiniRackProps) => {
	const rackSize = 3;
	const nbPlaceHolders = rackSize - devices.length;
	const slots = Array.from([
		...devices.map((device) => (
			<VDevice device={device} key={devUID(device)} />
		)),
		...Array(nbPlaceHolders).fill(<VDevicePlaceholder />),
	]);
	return (
		<div
			style={{
				display: "flex",
				flexDirection: "column",
				justifyContent: "flex-end",
				gap: "1px",
				borderTop: "5px solid grey",
				borderBottom: "5px solid grey",
				borderLeft: "2px solid grey",
				borderRight: "2px solid grey",
				padding: "2px",
				backgroundColor: "#d0d0d0",
				// height: "135px",
			}}
		>
			{/* <div
				style={{
					display: "flex",
					width: "auto",
					flexDirection: "row-reverse",
					backgroundColor: "#e0e0e0",
					borderTop: "1px solid grey",
					borderBottom: "1px solid grey",
				}}
			>
				<Button text="c" tooltip="fff" />
			</div> */}
			<div style={{ display: "flex", gap: "1px" }}>{slots}</div>
		</div>
	);
};

interface VDeviceProps {
	device: VirtualDevice;
	onClick?: (device: VirtualDevice) => void;
	onLongPress?: (device: VirtualDevice) => void;
	onTouchStart?: (device: VirtualDevice) => void;
	selected?: boolean;
}

const Port = ({
	device,
	parameter,
	reverse = false,
}: {
	device,
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
				id={buildSectionId(device.id, parameter.cv_name)}
			/>
		</div>
	);
};

const HIDE = ["set_pause"];
export const VDevice = ({
	device,
	onClick,
	selected,
	onLongPress,
	onTouchStart,
}: VDeviceProps) => {
	const height = "120px";
	const width = "58px";
	const rightPortLimit = 12;
	const leftLabelLimit = 10;
	const clipping = device.repr.length >= leftLabelLimit;
	const parameters = device.meta.parameters.filter(
		(e) => !HIDE.includes(e.name),
	);
	const enoughSpace = parameters.length < rightPortLimit;
	const sufficientSpace = parameters.length < 19;

	const longPressEvents = useLongPress(
		() => {
			onLongPress?.(device);
		},
		500,
		() => onTouchStart?.(device),
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
				backgroundColor: "#e0e0e0",
				userSelect: "none",
			}}
			onClick={(event) => {
				event.preventDefault();
				event.stopPropagation();

				if (!longPressEvents.didLongPress.current) {
					onClick?.(device);
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
					height: "117px",
					width: "25px",
					padding: "1px",
					gap: "2px",
				}}
			>
				<div
					style={{
						maxHeight: enoughSpace
							? "100px"
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
						{generateAcronym(device.repr, leftLabelLimit, true)}
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
					{parameters.slice(rightPortLimit).map((p) => (
						<Port device={device} key={p.cv_name} parameter={p} reverse />
					))}
				</div>
			</div>
			<div
				style={{
					height: "117px",
					width: "25px",
					padding: "1px",
					gap: "2px",
					display: "inherit",
					flexDirection: "column-reverse",
					justifyContent: "flex-start",
				}}
			>
				{parameters.slice(0, rightPortLimit).map((p) => (
					<Port device={device} key={p.cv_name} parameter={p} />
				))}
			</div>
		</div>
	);
};

interface VDevicePlaceholderProps {
	selected?: boolean;
	onClick?: () => void;
	onLongPress?: () => void;
	onTouchStart?: () => void;
}

export const VDevicePlaceholder = ({
	selected,
	onClick,
	onLongPress,
	onTouchStart,
}: VDevicePlaceholderProps) => {
	const height = "120px";
	const width = "58px";

	const longPressEvents = useLongPress(
		() => {
			onLongPress?.();
		},
		500,
		() => onTouchStart?.(),
	);

	return (
		<div
			style={{
				paddingTop: "1px",
				border: `3px dashed ${selected ? "orange" : "#aaaaaa"}`,
				height: height,
				width: width,
				minWidth: width,
				display: "flex",
				flexWrap: "wrap",
				flexDirection: "row",
				gap: "0px",
				justifyContent: "space-evenly",
				// backgroundColor: "#e0e0e0",
				userSelect: "none",
				alignItems: "center",
			}}
			onClick={(event) => {
				event.preventDefault();
				event.stopPropagation();

				if (!longPressEvents.didLongPress.current) {
					onClick?.();
				}
			}}
			{...longPressEvents}
		>
			<p
				style={{
					color: "#aaaaaa",
					fontSize: "27px",
				}}
			>
				+
			</p>
		</div>
	);
};
