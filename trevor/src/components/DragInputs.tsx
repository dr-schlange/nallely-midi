import { useState, useRef, useEffect } from "react";

interface DragNumberInputProps {
	onChange?: (newValue: string) => void;
	onBlur?: (value: string) => void;
	range: [number | null, number | null];
	value: string;
	disabled?: boolean;
}

export default function DragNumberInput({
	onChange,
	onBlur,
	range,
	value,
	disabled,
}: DragNumberInputProps) {
	const [isDragging, setIsDragging] = useState(false);
	const inputElement = useRef<HTMLInputElement>(null);
	const startY = useRef(0);
	const startValue = useRef(0);
	const direction = useRef<string | null>(null); // 'up' or 'down'
	const [precision, setPrecision] = useState(0);

	const computeDecimalPrecisionStep = (inputValue: string) => {
		const normalized = inputValue.replace(",", ".").trim();

		const parts = normalized.split(".");
		if (parts.length === 2) {
			const decimals = parts[1];
			const precision = decimals.length;
			setPrecision(precision);
			return 10 ** -precision;
		}
		return 1;
	};

	useEffect(() => {
		computeDecimalPrecisionStep(value);
	}, []);

	const parseInput = (val: string) => {
		return Number.parseFloat(val.replace(",", "."));
	};

	const formatDisplay = (val: number) => {
		return val.toFixed(precision).replace(".", ",");
	};

	const beginDrag = (y, rawValue: string) => {
		const floatVal = parseInput(rawValue);
		if (Number.isNaN(floatVal)) return;

		startY.current = y;
		startValue.current = floatVal;
		direction.current = null;
		setIsDragging(true);
	};

	const updateDrag = (y) => {
		if (!isDragging) return;

		const deltaY = startY.current - y;

		if (!direction.current) {
			direction.current = deltaY > 0 ? "up" : "down";
		}

		const [lower, upper] = range;
		const sensitivity = computeDecimalPrecisionStep(value);
		const deltaValue = deltaY * sensitivity;

		let newValue = startValue.current + deltaValue;

		if (lower != null) newValue = Math.max(newValue, lower);
		if (upper != null) newValue = Math.min(newValue, upper);

		const display = formatDisplay(newValue);
		onChange?.(display);
	};

	const endDrag = () => {
		setIsDragging(false);
		direction.current = null;
	};

	// Mouse handlers
	const handleMouseDown = (e) => {
		beginDrag(e.clientY, value);
		window.addEventListener("mousemove", handleMouseMove);
		window.addEventListener("mouseup", handleMouseUp);
	};

	const handleMouseMove = (e) => {
		updateDrag(e.clientY);
	};

	const handleMouseUp = () => {
		endDrag();
		window.removeEventListener("mousemove", handleMouseMove);
		window.removeEventListener("mouseup", handleMouseUp);
	};

	// Touch handlers
	const handleTouchStart = (e) => {
		beginDrag(e.touches[0].clientY, value);
	};

	const handleTouchMove = (e) => {
		updateDrag(e.touches[0].clientY);
	};

	const handleTouchEnd = () => {
		endDrag();
		onBlur?.(value.replace(",", "."));
	};

	const handleInputChange = (e) => {
		const val = e.target.value;
		const parsed = parseInput(val);
		if (!Number.isNaN(parsed)) {
			onChange?.(val);
		}
	};

	// useEffect(() => {
	// 	// Ensure to rebind the touch events correctly after input value change
	// 	computeDecimalPrecisionStep(value);
	// 	const inputElt = inputElement.current;
	// 	if (inputElt) {
	// 		inputElt.addEventListener("touchstart", handleTouchStart);
	// 		inputElt.addEventListener("touchmove", handleTouchMove);
	// 		inputElt.addEventListener("touchend", handleTouchEnd);

	// 		return () => {
	// 			inputElt.removeEventListener("touchstart", handleTouchStart);
	// 			inputElt.removeEventListener("touchmove", handleTouchMove);
	// 			inputElt.removeEventListener("touchend", handleTouchEnd);
	// 		};
	// 	}
	// }, [value]);

	return (
		<input
			ref={inputElement}
			type="text"
			value={value}
			onChange={handleInputChange}
			onMouseDown={handleMouseDown}
			onTouchStart={handleTouchStart}
			onTouchMove={handleTouchMove}
			onTouchEnd={handleTouchEnd}
			onBlur={() => onBlur?.(value.replace(",", "."))}
			disabled={disabled}
			style={{
				touchAction: "none",
				userSelect: "none",
			}}
		/>
	);
}
