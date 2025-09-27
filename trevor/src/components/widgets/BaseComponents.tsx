import { useEffect, useRef, useState } from "react";

export const Button = ({
	activated = false,
	onClick = undefined,
	text,
	tooltip = undefined,
	variant = "small",
	style = undefined,
}: {
	activated?: boolean;
	onClick?: () => void;
	text: string;
	tooltip: undefined | string;
	variant?: "big" | "small";
	style?: React.CSSProperties;
}) => {
	const [clickColor, setClickColor] = useState<string | undefined>(undefined);

	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: <explanation>
		<div
			style={{
				color: "gray",
				zIndex: 1,
				backgroundColor:
					clickColor ||
					(activated ? "yellow" : (style?.backgroundColor ?? "#e0e0e0")),
				width: variant === "small" ? "12px" : "23px",
				height: variant === "small" ? "18px" : "23px",
				textAlign: "center",
				cursor: "pointer",
				border: "2px solid gray",
				display: "flex",
				flexDirection: "column",
				justifyContent: "center",
				...(style ?? {}),
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

export const useNallelyRegistration = (id, parameters, config, category) => {
	const deviceRef = useRef(null);
	useEffect(() => {
		// Register a service
		deviceRef.current = (window as any).NallelyWebsocketBus.register(
			category,
			id,
			parameters,
			config,
		);
	}, [id, parameters, config, category]);
	return deviceRef.current;
};
