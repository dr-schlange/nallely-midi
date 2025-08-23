import { useState } from "react";

export const Button = ({
	activated = false,
	onClick = undefined,
	text,
	tooltip = undefined,
	variant = "small",
}: {
	activated?: boolean;
	onClick?: () => void;
	text: string;
	tooltip: undefined | string;
	variant: "big" | "small";
}) => {
	const [clickColor, setClickColor] = useState<string | undefined>(undefined);

	return (
		<div
			style={{
				color: "gray",
				zIndex: 1,
				backgroundColor: clickColor || (activated ? "yellow" : "#e0e0e0"),
				width: variant === "small" ? "12px" : "23px",
				height: variant === "small" ? "12px" : "23px",
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

export interface WidgetProps {
	id: string;
	num: number;
	onClose?: (id: string) => void;
}
