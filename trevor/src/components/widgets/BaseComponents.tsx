/** biome-ignore-all lint/a11y/noStaticElementInteractions: <explanation> */
import { useState } from "react";

export const Button = ({
	activated = false,
	onClick = undefined,
	text,
	tooltip = undefined,
	variant = "small",
	style = undefined,
	disabled = false,
	className = "",
}: {
	activated?: boolean;
	onClick?: (event) => void;
	text: string | React.ReactElement;
	tooltip: undefined | string;
	variant?: "big" | "small";
	style?: React.CSSProperties;
	disabled?: boolean;
	className?: string;
}) => {
	const [clickColor, setClickColor] = useState<string | undefined>(undefined);

	return (
		<div
			className={`Button ${variant} ${activated ? "active" : ""} ${clickColor ? "clicked" : ""} ${className}`}
			style={{
				...(style ?? {}),
				...(className?.length > 0
					? {}
					: {
							color: disabled
								? (style?.color ?? "rgba(127, 127, 127, 0.4)")
								: (style?.color ?? "gray"),
						}),
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
			<span>{text}</span>
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

export const PlaceholderWidget = ({
	id,
	componentKey,
	onClose,
	children,
	onClickLoad,
	removeCloseButton = false,
	visible = true,
}: {
	componentKey: string;
	id: string;
	onClose?: (e: string) => void;
	children: React.ReactNode;
	removeCloseButton?: boolean;
	onClickLoad?: (service: string, componentKey: string) => void;
	visible: boolean;
}) => {
	return (
		<div className="scope" style={{ display: visible ? "block" : "none" }}>
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
					pointerEvents: "none",
					gap: "4px",
				}}
			>
				{!removeCloseButton && (
					<Button
						text="x"
						onClick={() => onClose?.(id)}
						tooltip="Close window"
					/>
				)}
			</div>
			<div
				style={{
					height: "100%",
					display: "flex",
					flexDirection: "column",
					justifyContent: "space-between",
					alignItems: "center",
				}}
			>
				{children}
				<Button
					text="Load"
					onClick={() => onClickLoad?.(componentKey, id)}
					tooltip="Load the widget"
					style={{
						width: "100%",
					}}
				/>
			</div>
		</div>
	);
};
