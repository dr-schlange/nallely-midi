// LLM generated
const DOT = 8;

// The single port of a collapsed section or device: all the links of what is hidden go to it.
// It takes the room left after the name, on the end of the title bar (the start when
// mirrored). It has to be a child of a flex title bar.
export const PortDot = ({
	unit,
	show,
	name,
	mirrored = false,
}: {
	unit: string;
	show: boolean;
	name: string;
	// the name is on the right of the bar: the port is on the left end
	mirrored?: boolean;
}) => {
	if (!show) return null;
	return (
		<span
			style={{
				flex: "1 1 0",
				minWidth: 0,
				marginInlineStart: mirrored ? 0 : 6,
				marginInlineEnd: mirrored ? 6 : 0,
				display: "flex",
				alignItems: "center",
				justifyContent: mirrored ? "flex-start" : "flex-end",
				pointerEvents: "none",
			}}
		>
			<span
				data-port-unit={unit}
				title={name}
				style={{
					width: DOT,
					height: DOT,
					borderRadius: "50%",
					background: "gold",
				}}
			/>
		</span>
	);
};
