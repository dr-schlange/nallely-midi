import { useRef, useState } from "react";
import { Button, type WidgetProps } from "./BaseComponents";

type WindowWidgetProps = WidgetProps & {
	url: string;
	expandable?: boolean;
};

export const WindowWidget = ({
	id,
	onClose,
	num,
	url,
	expandable = false,
	...iframeProps
}: WindowWidgetProps) => {
	const [expanded, setExpanded] = useState(false);
	const windowRef = useRef<HTMLDivElement>(null);
	const iframeRef = useRef<HTMLIFrameElement>(null);

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
					pointerEvents: "none",
					gap: "4px",
				}}
			>
				{expandable && (
					<Button
						text={"+"}
						activated={expanded}
						onClick={expand}
						tooltip="Expand widget"
					/>
				)}
				<Button text="x" onClick={() => onClose?.(id)} tooltip="Close window" />
			</div>
			<iframe
				ref={iframeRef}
				src={`${url}?nallelyId=${id}`}
				title="Window"
				style={{
					height: "100%",
					width: "100%",
					border: "unset",
				}}
				{...iframeProps}
			/>
		</div>
	);
};
