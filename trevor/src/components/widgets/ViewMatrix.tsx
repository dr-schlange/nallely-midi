import { useCallback, useEffect, useRef, useState } from "react";
import { Button, type WidgetProps } from "./BaseComponents";
import DragNumberInput from "../DragInputs";
import { useNallelyRegistration } from "../../hooks/wsHooks";

const MAX_ROWS = 4;
const MAX_COLS = 24;
const MAX_DISP_ROWS = 10;

const parameters = {
	next: {
		min: 0,
		max: 1,
		send: (device, value) => device?.send("next", value),
	},
	reset: {
		min: 0,
		max: 1,
		send: (device, value) => device?.send("reset", value),
	},
	rows: {
		min: 1,
		max: MAX_ROWS,
		send: (device, value) => device?.send("rows", value),
	},
	cols: {
		min: 1,
		max: MAX_COLS,
		send: (device, value) => device?.send("cols", value),
	},
};

export const ViewMatrix = ({ id, onClose, num }: WidgetProps) => {
	// const [expanded, setExpanded] = useState(false);
	const windowRef = useRef<HTMLDivElement>(null);
	const configRef = useRef({});
	const device = useNallelyRegistration(
		id,
		parameters,
		configRef.current,
		"view",
	);
	const [rows, setRows] = useState(1);
	const [cols, setColumns] = useState(8);
	const cellRefs = useRef([]);

	const rowsRef = useRef(rows);
	const colsRef = useRef(cols);

	useEffect(() => {
		rowsRef.current = rows;
		const row = Math.floor(idx.current / rows);
		const col = idx.current % cols;
		if (row >= rows || col >= cols) {
			idx.current = 0;
		}
	}, [rows, cols]);

	useEffect(() => {
		colsRef.current = cols;
		const row = Math.floor(idx.current / rows);
		const col = idx.current % cols;
		if (row >= rows || col >= cols) {
			idx.current = 0;
		}
	}, [cols, rows]);

	const cells = Array.from({ length: MAX_COLS * MAX_ROWS }, (_, i) => (
		<div
			key={i}
			ref={(el) => {
				cellRefs.current[i] = el;
			}}
			style={{
				height: cols > MAX_DISP_ROWS ? 5 : 10,
				width: cols > MAX_DISP_ROWS ? 5 : 10,
				backgroundColor: "gray",
				border: "2px solid gray",
			}}
		/>
	));
	const idx = useRef(-1);

	const updateMatrix = useCallback(() => {
		const matrix = cellRefs.current;
		const size = rowsRef.current * colsRef.current;

		for (let i = 0; i < size; i++) {
			const active = idx.current === i;
			matrix[i].style.borderColor = active ? "orange" : "gray";
			matrix[i].style.backgroundColor = active ? "orange" : "gray";
		}
	}, []);

	useEffect(() => {
		updateMatrix();
	}, [rows, cols, updateMatrix]);

	useEffect(() => {
		if (!device) return;

		device.onmessage = (data) => {
			switch (data.on) {
				case "rows":
					setRows(data.value);
					if (idx.current >= data.value) {
						idx.current = 0;
					}
					break;

				case "cols":
					setColumns(data.value);
					if (idx.current >= data.value) {
						idx.current = 0;
					}
					break;

				case "reset":
					idx.current = 0;
					updateMatrix();
					parameters.reset.send(device, 1);
					parameters.reset.send(device, 0);
					break;

				case "next":
					if (data.value > 0) {
						const size = rowsRef.current * colsRef.current;
						idx.current = (idx.current + 1) % size;
						updateMatrix();
					}
					break;
			}
		};

		return () => device.dispose();
	}, [device, updateMatrix]);

	const drawMatrix = () => {
		const res = [];
		for (let i = 0; i < rows * cols; i++) {
			res.push(cells[i]);
		}
		return res;
	};

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
				<DragNumberInput
					range={[1, MAX_ROWS]}
					width="30px"
					value={rows?.toString()}
					onChange={(value) => setRows((_) => Number.parseInt(value, 10))}
					onBlur={(value) => parameters.rows.send(device, value)}
					style={{
						height: "10px",
						color: "gray",
						fontSize: "14px",
						textAlign: "right",
						boxShadow: "unset",
					}}
				/>
				<DragNumberInput
					range={[1, MAX_COLS]}
					width="30px"
					value={cols?.toString()}
					onChange={(value) => setColumns((_) => Number.parseInt(value, 10))}
					onBlur={(value) => parameters.cols.send(device, value)}
					style={{
						height: "10px",
						color: "gray",
						fontSize: "14px",
						textAlign: "right",
						boxShadow: "unset",
					}}
				/>
				<Button
					text={"r"}
					onClick={() => {
						parameters.reset.send(device, 1);
						parameters.reset.send(device, 0);
						idx.current = 0;
						updateMatrix();
					}}
					tooltip="Reset to beginning"
				/>
				<Button text="x" onClick={() => onClose?.(id)} tooltip="Close widget" />
			</div>
			<div
				style={{
					position: "relative",
					top: "25px",
					left: cols > MAX_DISP_ROWS ? "1px" : "5px",
					display: "grid",
					gridTemplateRows: `repeat(${rows}, 1fr)`,
					gridTemplateColumns: `repeat(${cols}, 1fr)`,
					rowGap: "2px",
				}}
			>
				{drawMatrix()}
			</div>
		</div>
	);
};
