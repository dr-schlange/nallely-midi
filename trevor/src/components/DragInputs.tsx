import { useState, useRef, useEffect } from "react";

interface DragNumberInputProps {
	onChange?: (newValue: string) => void;
	onBlur?: (value: string) => void;
	range: [number | null, number | null];
	value: string;
	disabled?: boolean;
	width?: string;
}

export default function DragNumberInput({
	onChange,
	onBlur,
	range,
	value,
	disabled,
	width = "50%",
}: DragNumberInputProps) {
	const [isDragging, setIsDragging] = useState(false);
	const inputRef = useRef<HTMLInputElement>(null);
	const startY = useRef(0);
	const startValue = useRef(0);
	const [precision, setPrecision] = useState(0);

	// Update precision dynamically based on input
	useEffect(() => {
		computeDecimalPrecision(value);
	}, [value]);

	const computeDecimalPrecision = (inputValue: string) => {
		const normalized = inputValue.replace(",", ".").trim();
		const parts = normalized.split(".");
		if (parts.length === 2) {
			setPrecision(parts[1].length);
		} else {
			setPrecision(0);
		}
	};

	const parseInput = (val: string) => {
		const parsed = Number.parseFloat(val.replace(",", "."));
		return Number.isNaN(parsed) ? null : parsed;
	};

	const formatDisplay = (val: number) => {
		return val.toFixed(precision).replace(".", ",");
	};

	const beginDrag = (y: number) => {
		const parsed = parseInput(value);
		if (parsed === null) return;

		startY.current = y;
		startValue.current = parsed;
		setIsDragging(true);
	};

	const updateDrag = (y: number) => {
		if (!isDragging) return;

		const deltaY = startY.current - y;
		const sensitivity = 10 ** -precision;
		let newValue = startValue.current + deltaY * sensitivity;

		const [lower, upper] = range;
		if (lower != null) newValue = Math.max(newValue, lower);
		if (upper != null) newValue = Math.min(newValue, upper);

		onChange?.(formatDisplay(newValue));
	};

	const endDrag = () => {
		setIsDragging(false);
	};

	const handleMouseDown = (e: React.MouseEvent) => {
		if (disabled) return;
		beginDrag(e.clientY);
		window.addEventListener("mousemove", handleMouseMove);
		window.addEventListener("mouseup", handleMouseUp);
	};

	const handleMouseMove = (e: MouseEvent) => {
		updateDrag(e.clientY);
	};

	const handleMouseUp = () => {
		endDrag();
		window.removeEventListener("mousemove", handleMouseMove);
		window.removeEventListener("mouseup", handleMouseUp);
	};

	const handleTouchStart = (e: React.TouchEvent) => {
		if (disabled) return;
		beginDrag(e.touches[0].clientY);
	};

	const handleTouchMove = (e: React.TouchEvent) => {
		updateDrag(e.touches[0].clientY);
	};

	const handleTouchEnd = () => {
		endDrag();
		handleBlur();
	};

	const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const val = e.target.value;
		onChange?.(val);
	};

	const handleBlur = () => {
		const val = value.trim().replace(",", ".");
		const parsed = parseInput(val);
		let finalValue = val;

		if (val === "" || parsed === null) {
			finalValue = "0";
		} else {
			finalValue = parsed.toFixed(precision).replace(",", ".");
		}

		onBlur?.(finalValue);
	};

	return (
		<input
			ref={inputRef}
			type="text"
			value={value}
			onChange={handleInputChange}
			onBlur={handleBlur}
			onMouseDown={handleMouseDown}
			onTouchStart={handleTouchStart}
			onTouchMove={handleTouchMove}
			onTouchEnd={handleTouchEnd}
			disabled={disabled}
			style={{
				touchAction: "none",
				userSelect: "none",
				maxWidth: width,
				width: width,
			}}
		/>
	);
}
