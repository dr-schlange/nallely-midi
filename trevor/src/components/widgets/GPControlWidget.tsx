import { useRef, useState } from "react";
import {
	Button,
	useNallelyRegistration,
	type WidgetProps,
} from "./BaseComponents";

const parameters = {
	up: { min: 0, max: 1, fun: (device, value) => device?.send("up", value) },
	down: {
		min: 0,
		max: 1,
		fun: (device, value) => device?.send("down", value),
	},
	left: {
		min: 0,
		max: 1,
		fun: (device, value) => device?.send("left", value),
	},
	right: {
		min: 0,
		max: 1,
		fun: (device, value) => device?.send("right", value),
	},
	start: {
		min: 0,
		max: 1,
		fun: (device, value) => device?.send("start", value),
	},
	select: {
		min: 0,
		max: 1,
		fun: (device, value) => device?.send("select", value),
	},
	a: { min: 0, max: 1, fun: (device, value) => device?.send("a", value) },
	b: { min: 0, max: 1, fun: (device, value) => device?.send("b", value) },
};

const DButton = ({ onChange, style, text }: { onChange; style?; text? }) => {
	const [pressed, setPressed] = useState(false);

	return (
		<div
			style={{
				border: "3px solid orange",
				backgroundColor: pressed ? "#ffb732" : "#d0d0d0",
				touchAction: "none",
				userSelect: "none",
				display: "flex",
				justifyContent: "center",
				alignItems: "center",
				...style,
			}}
			onPointerDown={(event) => {
				event.preventDefault();
				event.stopPropagation();
				setPressed(true);
				onChange(1);
			}}
			onPointerUp={(event) => {
				event.preventDefault();
				event.stopPropagation();
				onChange(0);
				setPressed(false);
			}}
		>
			{text}
		</div>
	);
};

const DirectionalCross = ({ device }: { device }) => {
	return (
		<>
			<DButton
				onChange={(value) => parameters.up.fun(device, value)}
				style={{
					minHeight: "25px",
					minWidth: "25px",
					position: "absolute",
					top: "38px",
					left: "30px",
					borderBottom: "none",
				}}
			/>
			<DButton
				onChange={(value) => parameters.down.fun(device, value)}
				style={{
					minHeight: "25px",
					minWidth: "25px",
					position: "absolute",
					top: "63px",
					left: "5px",
					borderRight: "none",
				}}
			/>
			<DButton
				onChange={(value) => parameters.left.fun(device, value)}
				style={{
					minHeight: "25px",
					minWidth: "25px",
					position: "absolute",
					top: "63px",
					left: "58px",
					borderLeft: "none",
				}}
			/>
			<DButton
				onChange={(value) => parameters.right.fun(device, value)}
				style={{
					minHeight: "25px",
					minWidth: "25px",
					position: "absolute",
					top: "91px",
					left: "30px",
					borderTop: "none",
				}}
			/>
		</>
	);
};

const ABButtons = ({ device }: { device }) => {
	return (
		<>
			<DButton
				onChange={(value) => parameters.a.fun(device, value)}
				style={{
					minHeight: "25px",
					minWidth: "25px",
					position: "absolute",
					top: "47px",
					right: "11px",
				}}
				text="a"
			/>
			<DButton
				onChange={(value) => parameters.b.fun(device, value)}
				style={{
					height: "25px",
					width: "25px",
					position: "absolute",
					top: "82px",
					right: "43px",
				}}
				text="b"
			/>
		</>
	);
};

const StartSelect = ({ device }: { device }) => {
	return (
		<>
			<DButton
				onChange={(value) => parameters.start.fun(device, value)}
				style={{
					minHeight: "15px",
					minWidth: "25px",
					position: "absolute",
					top: "5px",
					right: "83px",
				}}
				text="Strt"
			/>
			<DButton
				onChange={(value) => parameters.select.fun(device, value)}
				style={{
					minHeight: "15px",
					minWidth: "25px",
					position: "absolute",
					top: "5px",
					left: "112px",
				}}
				text="Selc"
			/>
		</>
	);
};

export const GPControl = ({ id, onClose, num }: WidgetProps) => {
	const windowRef = useRef<HTMLDivElement>(null);
	const configRef = useRef({});
	const device = useNallelyRegistration(
		id,
		parameters,
		configRef.current,
		"controls",
	);
	// const [hold, setHold] = useState(false);

	// const [minX, setMinX] = useState("0");
	// const [maxX, setMaxX] = useState("127");
	// const [minY, setMinY] = useState("0");
	// const [maxY, setMaxY] = useState("127");

	// const expand = () => {
	// 	setExpanded((prev) => !prev);
	// 	if (expanded) {
	// 		windowRef.current.style.height = "";
	// 		windowRef.current.style.width = "";
	// 	} else {
	// 		windowRef.current.style.height = "100%";
	// 		windowRef.current.style.width = "100%";
	// 	}
	// };

	return (
		<div
			ref={windowRef}
			className="scope"
			style={{
				display: "flex",
				flexDirection: "column",
				gap: "2px",
				padding: "1px",
				alignItems: "stretch",
			}}
		>
			<div
				style={{
					color: "gray",
					zIndex: 1,
					top: "1%",
					right: "1%",
					textAlign: "center",
					cursor: "pointer",
					display: "flex",
					justifyContent: "flex-end",
					flexDirection: "row",
					gap: "4px",
					width: "100%",
					userSelect: "none",
					position: "absolute",
					pointerEvents: "none",
				}}
			>
				{/* <Button
					text={"h"}
					activated={hold}
					onClick={() => setHold((prev) => !prev)}
					tooltip="Expand widget"
				/> */}
				<Button text="x" onClick={() => onClose?.(id)} tooltip="Close widget" />
			</div>

			<DirectionalCross device={device} />
			<StartSelect device={device} />
			<ABButtons device={device} />
		</div>
	);
};
