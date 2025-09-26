import { useEffect, useRef, useState } from "react";
import { Button, type WidgetProps } from "./BaseComponents";

type WindowWidgetProps = WidgetProps & {
	url: string;
};

export const WindowWidget = ({ id, onClose, num, url }: WindowWidgetProps) => {
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

	useEffect(() => {
		const iframe = iframeRef.current;
		if (!iframe) return;

		const applySameOriginCSS = () => {
			try {
				const doc = iframe.contentDocument; // will throw if cross-origin

				// ✅ Clone all parent <link rel="stylesheet"> and <style> tags
				document
					.querySelectorAll('link[rel="stylesheet"], style')
					.forEach((el) => {
						doc.head.appendChild(el.cloneNode(true));
					});

				// ✅ Add a theme class so your CSS can scope overrides
				// doc.documentElement.classList.add(`theme-${theme}`);
			} catch {
				// Cross-origin → use postMessage
				// iframe.contentWindow?.postMessage({ type: "setTheme", theme }, "*");
			}
		};

		iframe.addEventListener("load", applySameOriginCSS);
		return () => iframe.removeEventListener("load", applySameOriginCSS);
	}, []);

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
					gap: "4px",
				}}
			>
				<Button
					text={"+"}
					activated={expanded}
					onClick={expand}
					tooltip="Expand widget"
				/>
				<Button text="x" onClick={() => onClose?.(id)} tooltip="Close window" />
			</div>
			<iframe
				ref={iframeRef}
				src={url}
				title="sfsdf"
				width="100%"
				height="100%"
				style={{ borderStyle: "none" }}
			/>
		</div>
	);
};
