import { Fragment, useEffect, useRef, useState } from "react";
import { AnsiParser } from "../utils/utils";
import { useTrevorDispatch, useTrevorSelector } from "../store";
import { addStdinWait, removeStdinWait } from "../store/runtimeSlice";

export const Terminal = ({ stdout, stdin }) => {
	const [triggered, setTriggered] = useState([]);
	const pending = useTrevorSelector((state) => state.runTime.stdin.queue);
	const dispatch = useTrevorDispatch();
	const [displayPending, setDisplayPending] = useState(
		!stdout.match(/<stdin:(\d+)>/g),
	);
	const inputRef = useRef(undefined);

	const output = AnsiParser.ansi_to_html(stdout);
	const parts = output.split(/&lt;stdin:(\d+)&gt;/g);

	useEffect(() => {
		const matches = Array.from(stdout.matchAll(/<stdin:(\d+)>/g), (m) =>
			Number(m[1]),
		);

		if (matches.length === 0) {
			setTriggered([]);
			setDisplayPending(true);
			return;
		}

		setDisplayPending(false);
		for (const id of matches) {
			dispatch(addStdinWait(id));
		}
	}, [stdout, dispatch]);

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
								dispatch(removeStdinWait(id));
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
		<div className="terminal">
			{reactElements}
			{displayPending &&
				pending.map((n) => {
					return (
						<Fragment key={`stdin-${n}`}>
							<span>[{n}] Pending stdin:</span>
							<input
								style={{
									border: "unset",
									backgroundColor: "black",
									color: "white",
									boxShadow: "unset",
									fontSize: "inherit",
								}}
								name="thread_id"
								disabled={triggered.includes(`${n}`)}
								onKeyDown={(event) => {
									if (event.key === "Enter") {
										stdin?.(n, event.currentTarget.value);
										setTriggered((prev) => [...prev, `${n}`]);
										dispatch(removeStdinWait(n));
									}
								}}
							/>
						</Fragment>
					);
				})}
		</div>
	);
};
