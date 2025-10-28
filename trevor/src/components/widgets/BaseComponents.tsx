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
			onMouseUp={(event) => {
				event.stopPropagation();
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

export const useNallelyRegistration = (
	id: string,
	parameters: any,
	config: any,
	category: string,
) => {
	const deviceRef = useRef<any>(null);
	const [device, setDevice] = useState<any>(null);

	useEffect(() => {
		const registration = (window as any).NallelyWebsocketBus.register(
			category,
			id,
			parameters,
			config,
		);

		deviceRef.current = registration;
		setDevice(registration);

		return () => {
			deviceRef.current?.dispose();
		};
	}, [id, category, parameters, config]);

	return device;
};

export const HeaderButton = ({ onClick, text, ...props }) => {
	return (
		<button
			type="button"
			className="close-button"
			onClick={(event) => {
				event.stopPropagation();
				event.preventDefault();
				onClick?.();
			}}
			{...props}
		>
			{text}
		</button>
	);
};
