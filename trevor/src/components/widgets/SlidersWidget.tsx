import { useEffect, useRef, useState } from "react";
import { Button, type WidgetProps } from "./BaseComponents";

const parameters = {
	s0: { min: 0, max: 127 },
	s1: { min: 0, max: 127 },
	s2: { min: 0, max: 127 },
	s3: { min: 0, max: 127 },
};

const Slider = ({ title, onChange }: { title; onChange }) => {
	const [indicator, setIndicator] = useState("50");
	return (
		<div
			style={{ display: "flex", flexDirection: "row", alignItems: "center" }}
		>
			<p style={{ margin: "0", fontSize: "13px", color: "gray" }}>{title}</p>
			<input
				type="range"
				min="0"
				max="127"
				defaultValue={indicator.padStart(3, "0")}
				style={{
					border: "none",
					boxShadow: "none",
					accentColor: "orange",
					width: "123px",
				}}
				onChange={(event) => {
					const value = event.target.value;
					onChange(Number(value));
					setIndicator(value);
				}}
			/>
			<p style={{ margin: "0", fontSize: "13px", color: "gray" }}>
				{indicator}
			</p>
		</div>
	);
};

export const Sliders = ({ id, onClose, num }: WidgetProps) => {
	const [expanded, setExpanded] = useState(false);
	const windowRef = useRef<HTMLDivElement>(null);
	const deviceRef = useRef(null);

	const expand = () => {
		setExpanded((prev) => !prev);
		if (expanded) {
			windowRef.current.style.height = "";
			windowRef.current.style.width = "";
		} else {
			windowRef.current.style.height = "100%";
			windowRef.current.style.width = "100%";
		}
	};

	useEffect(() => {
		const config = {};

		// Register a service
		deviceRef.current = (window as any).NallelyWebsocketBus.register(
			"controls",
			id,
			parameters,
			config,
		);
	}, [id]);

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
				{/* <Button
					text={"+"}
					activated={expanded}
					onClick={expand}
					tooltip="Expand widget"
				/> */}
				<Button text="x" onClick={() => onClose?.(id)} tooltip="Close widget" />
			</div>
			<div
				style={{
					marginTop: "12px",
					display: "flex",
					justifyItems: "center",
					flexDirection: "column",
				}}
			>
				<Slider
					title="s0"
					onChange={(value) => deviceRef.current.send("s0", value)}
				/>
				<Slider
					title="s1"
					onChange={(value) => deviceRef.current.send("s1", value)}
				/>
				<Slider
					title="s2"
					onChange={(value) => deviceRef.current.send("s2", value)}
				/>
				<Slider
					title="s3"
					onChange={(value) => deviceRef.current.send("s3", value)}
				/>
			</div>
		</div>
	);
};
