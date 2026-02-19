import { useState } from "react";

export const Button = ({
	activated = false,
	onClick = undefined,
	text,
	tooltip = undefined,
	variant = "small",
	style = undefined,
	disabled = false,
}: {
	activated?: boolean;
	onClick?: (event) => void;
	text: string;
	tooltip: undefined | string;
	variant?: "big" | "small";
	style?: React.CSSProperties;
	disabled?: boolean;
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
				minWidth: variant === "small" ? "12px" : "23px",
				width: variant === "small" ? "12px" : "23px",
				minHeight: variant === "small" ? "18px" : "23px",
				height: variant === "small" ? "18px" : "23px",
				textAlign: "center",
				cursor: "pointer",
				border: "2px solid gray",
				display: "flex",
				flexDirection: "column",
				justifyContent: "center",
				pointerEvents: "auto",
				...(style ?? {}),
			}}
			onMouseDown={(event) => {
				event.stopPropagation();
				event.preventDefault();
				if (disabled) {
					return;
				}
				setClickColor("orange");
			}}
			onMouseUp={(event) => {
				event.stopPropagation();
				event.preventDefault();
				if (disabled) {
					return;
				}
				setClickColor(undefined);
				onClick?.(event);
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
	style?: React.CSSProperties;
	onClose?: (id: string) => void;
}

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

interface TextInputProps {
	value: string;
	onChange: (value: string, event: React.ChangeEvent<HTMLInputElement>) => void;
	onEnter?: (
		value: string,
		event?: React.KeyboardEvent<HTMLInputElement>,
	) => void;
	placeholder?: string;
	style?: React.CSSProperties;
}

export const TextInput = ({
	value,
	onChange,
	onEnter,
	placeholder = "",
	style = {},
	...props
}: TextInputProps) => {
	return (
		<input
			style={{
				height: "10px",
				color: "gray",
				fontSize: "14px",
				textAlign: "right",
				boxShadow: "unset",
				pointerEvents: "auto",
				...style,
			}}
			placeholder={placeholder}
			onChange={(e) => {
				onChange?.(e.target.value, e);
			}}
			onBlur={(e) => {
				e.stopPropagation();
				e.preventDefault();
				onEnter?.(value);
			}}
			onKeyDown={(e) => {
				if (e.key === "Enter") {
					e.stopPropagation();
					e.preventDefault();
					onEnter?.(value, e);
				}
			}}
			{...props}
		/>
	);
};
