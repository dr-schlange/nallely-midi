import { useRef, useState } from "react";
import { Button, TextInput, type WidgetProps } from "./BaseComponents";

type WindowWidgetProps = WidgetProps & {
	url?: string;
	expandable?: boolean;
	urlBar?: boolean;
};

export const WindowWidget = ({
	id,
	onClose,
	num,
	url,
	expandable = false,
	urlBar = false,
	...iframeProps
}: WindowWidgetProps) => {
	const [expanded, setExpanded] = useState(false);
	const windowRef = useRef<HTMLDivElement>(null);
	const iframeRef = useRef<HTMLIFrameElement>(null);
	const [windowUrl, setWindowUrl] = useState(url || "");
	const [tmpUrl, setTmpUrl] = useState(windowUrl || "");

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
				{urlBar && (
					<TextInput
						placeholder="wiget's url"
						value={tmpUrl}
						onChange={(value) => setTmpUrl(value)}
						style={{ width: expanded ? "99%" : "103px" }}
						onEnter={(value) => {
							setWindowUrl(value);
						}}
					/>
				)}
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

			{windowUrl && (
				<iframe
					ref={iframeRef}
					src={`${windowUrl}?nallelyId=${id}&nallelyOrigin=${window.location.hostname}:6789`}
					title="Window"
					style={{
						height: "86%",
						width: "100%",
						border: "unset",
						position: "relative",
						top: urlBar ? "20px" : "0px",
					}}
					{...iframeProps}
				/>
			)}
		</div>
	);
};
