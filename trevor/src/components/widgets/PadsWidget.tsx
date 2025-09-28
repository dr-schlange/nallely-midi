import { useRef, useState } from "react";
import {
	Button,
	useNallelyRegistration,
	type WidgetProps,
} from "./BaseComponents";
import DragNumberInput from "../DragInputs";

const parameters = {
	p0: { min: 0, max: 127, fun: (device, value) => device.send("p0", value) },
	p1: { min: 0, max: 127, fun: (device, value) => device.send("p1", value) },
};

const Pad = ({ title, onChange }: { title; onChange }) => {
	const [indicator, setIndicator] = useState("127");
	const [pressed, setPressed] = useState(false);
	const [hold, setHold] = useState(false);
	return (
		<div
			style={{
				display: "flex",
				flexDirection: "column",
				alignItems: "center",
				gap: "2px",
				width: "75px",
			}}
		>
			<div
				style={{
					display: "flex",
					flexDirection: "row",
					alignItems: "center",
					justifyContent: "flex-start",
					width: "100%",
					gap: "2px",
					margin: 0,
				}}
			>
				<Button
					activated={hold}
					text="H"
					tooltip="Hold"
					onClick={() => {
						if (hold) {
							setPressed(false);
							onChange(0);
						}
						setHold((prev) => !prev);
					}}
				/>

				<p
					style={{
						margin: "0",
						marginLeft: "0px",
						fontSize: "14px",
						color: "gray",
						marginTop: "5px",
					}}
				>
					{title}
				</p>
				<DragNumberInput
					range={[0, 127]}
					width="21px"
					value={indicator.toString()}
					onChange={(value) => {
						onChange(Number(indicator));
						setIndicator(value);
					}}
					style={{
						height: "10px",
						color: "gray",
						fontSize: "14px",
						textAlign: "right",
						boxShadow: "unset",
					}}
				/>
			</div>
			<div
				style={{
					border: "3px solid orange",
					backgroundColor: pressed ? "#ffb732" : "#d0d0d0",
					height: "75px",
					width: "75px",
					touchAction: "none",
					userSelect: "none",
				}}
				onPointerDown={(event) => {
					event.preventDefault();
					event.stopPropagation();
					setPressed(true);
					onChange(Number(indicator));
				}}
				onPointerUp={(event) => {
					event.preventDefault();
					event.stopPropagation();
					if (!hold) {
						setPressed(false);
						onChange(0);
					}
				}}
			/>
		</div>
	);
};

export const Pads = ({ id, onClose, num }: WidgetProps) => {
	const windowRef = useRef<HTMLDivElement>(null);
	const configRef = useRef({});
	const device = useNallelyRegistration(
		id,
		parameters,
		configRef.current,
		"controls",
	);

	return (
		<div ref={windowRef} className="scope">
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
				<Button text="x" onClick={() => onClose?.(id)} tooltip="Close widget" />
			</div>
			<div
				style={{
					marginTop: "7px",
					display: "grid",
					justifyItems: "center",
					flexDirection: "row",
					flexWrap: "wrap",
					gap: "5px",
					gridTemplateColumns: "repeat(2, 1fr)",
					height: "90%",
					alignItems: "end",
				}}
			>
				{Object.entries(parameters).map(([key, param]) => (
					<Pad
						key={key}
						title={key}
						onChange={(value) => param.fun(device, value)}
					/>
				))}
			</div>
		</div>
	);
};
