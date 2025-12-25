import { useEffect, useRef, useState } from "react";
import {
	Button,
	useNallelyRegistration,
	type WidgetProps,
} from "./BaseComponents";

const symbols = "abcdefghijklmnopqrstuvwxyz0123456789";
const special = [
	"enter",
	"space",
	"backspace",
	"tab",
	"shift",
	"ctrl",
	"alt",
	"meta",
	"escape",
	"arrowup",
	"arrowdown",
	"arrowleft",
	"arrowright",
];

const parameters = {};
for (const sym of symbols) {
	parameters[sym] = {
		min: 0,
		max: 1,
		fun: (device, value) => device?.send(sym, value),
	};
}
for (const spec of special) {
	parameters[spec] = {
		min: 0,
		max: 1,
		fun: (device, value) => device?.send(spec, value),
	};
}

export const Keyboard = ({ id, onClose, num }: WidgetProps) => {
	const windowRef = useRef<HTMLDivElement>(null);
	const configRef = useRef({});
	const device = useNallelyRegistration(
		id,
		parameters,
		configRef.current,
		"controls",
	);
	const [toggle, setToggle] = useState(false);
	const [pressedKeys, setPressedKeys] = useState<Set<string>>(new Set());

	useEffect(() => {
		const handleKeyUp = (event: KeyboardEvent) => {
			const key = event.key.toLowerCase();
			if (!(key in parameters)) {
				return;
			}
			event.preventDefault();
			if (!toggle) {
				setPressedKeys((prev) => {
					const newSet = new Set(prev);
					newSet.delete(key);
					return newSet;
				});
				parameters[key].fun(device, 0);
			}
		};
		const handleKeyDown = (event: KeyboardEvent) => {
			const key = event.key.toLowerCase();
			if (!(key in parameters)) {
				return;
			}
			if (pressedKeys.has(key) && toggle) {
				setPressedKeys((prev) => {
					prev.delete(key);
					return new Set(prev);
				});
				return;
			}
			setPressedKeys((prev) => new Set(prev).add(key));
			parameters[key].fun(device, 1);
		};
		window.addEventListener("keydown", handleKeyDown);
		window.addEventListener("keyup", handleKeyUp);
		return () => {
			window.removeEventListener("keydown", handleKeyDown);
			window.removeEventListener("keyup", handleKeyUp);
		};
	}, [pressedKeys, toggle, device]);

	useEffect(() => {
		if (pressedKeys.size === 0) {
			return;
		}
		if (!toggle) {
			for (const key of pressedKeys) {
				parameters[key].fun(device, 0);
			}
			setPressedKeys(new Set());
		}
		return () => {
			for (const key of pressedKeys) {
				parameters[key].fun(device, 0);
			}
		};
	}, [pressedKeys, toggle, device]);

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
				<Button
					text={"h"}
					activated={toggle}
					onClick={() => setToggle((prev) => !prev)}
					tooltip="Toggle behavior"
				/>
				<Button text="x" onClick={() => onClose?.(id)} tooltip="Close widget" />
			</div>
			<div
				style={{
					display: "flex",
					flexWrap: "wrap",
					flexFlow: "column wrap",
					gap: "3px",
					flexDirection: "column",
					alignItems: "flex-start",
					position: "relative",
					padding: "5px",
					height: "95px",
					width: "169px",
					top: "25px",
					overflowX: "auto",
				}}
			>
				{Array.from(pressedKeys).map((key) => (
					<span key={key}>{key} </span>
				))}
				{pressedKeys.size === 0 && <span>No key pressed</span>}
			</div>
		</div>
	);
};
