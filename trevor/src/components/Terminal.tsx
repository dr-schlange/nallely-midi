import { Fragment, useEffect, useRef, useState } from "react";
import { AnsiParser } from "../utils/utils";

export const Terminal = ({ stdout, stdin }) => {
	const [triggered, setTriggered] = useState([]);
	const inputRef = useRef(undefined);

	const output = AnsiParser.ansi_to_html(stdout);
	const parts = output.split(/&lt;stdin:(\d+)&gt;/g);

	useEffect(() => {
		if (!output.match(/&lt;stdin:(\d+)&gt;/g)) {
			setTriggered([]);
		}
	}, [output]);

	const reactElements = parts.map((part, i) => {
		if (i % 2 === 0) {
			return (
				<span key={`stdout-${i}`} dangerouslySetInnerHTML={{ __html: part }} />
			);
		} else {
			const id = Number.parseInt(part, 10);
			return (
				<Fragment key={`stdin-${id}-${i}`}>
					<input
						ref={inputRef}
						style={{
							border: "unset",
							backgroundColor: "black",
							color: "white",
							boxShadow: "unset",
							fontSize: "inherit",
						}}
						name="thread_id"
						disabled={triggered.includes(`${id}-${i}`)}
						onKeyDown={(event) => {
							if (event.key === "Enter") {
								stdin?.(id, event.currentTarget.value);
								setTriggered((prev) => [...prev, `${id}-${i}`]);
							}
						}}
					/>
					{triggered.includes(`${id}-${i}`) && <br />}
				</Fragment>
			);
		}
	});

	useEffect(() => {
		if (inputRef.current) {
			inputRef.current.focus();
		}
	}, [reactElements, triggered]);

	return (
		<div style={{ color: "white", whiteSpace: "pre-wrap", fontSize: "17px" }}>
			{reactElements}
		</div>
	);
};
