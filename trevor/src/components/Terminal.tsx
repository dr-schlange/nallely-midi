import { memo } from "react";
import { Fragment, useEffect, useRef, useState } from "react";
import { AnsiParser } from "../utils/utils";
import { useTrevorDispatch, useTrevorSelector } from "../store";
import { addStdinWait, removeStdinWait } from "../store/runtimeSlice";

interface TerminalProps {
	stdout: string;
	stdin: (id: any, text: any) => void;
}

export const Terminal = memo(({ stdout, stdin }: TerminalProps) => {
	const [triggered, setTriggered] = useState([]);
	const pending = useTrevorSelector((state) => state.runTime.stdin.queue);
	const dispatch = useTrevorDispatch();
	const [displayPending, setDisplayPending] = useState(
		!stdout.match(/<stdin:(\d+)>/g),
	);
	const inputRef = useRef(null);

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

	const handleSubmit = (id, value, i = undefined) => {
		const key = i !== undefined ? `${id}-${i}` : `${id}`;
		stdin?.(id, value);
		setTriggered((prev) => [...prev, key]);
		dispatch(removeStdinWait(id));
	};

	const reactElements = parts.map((part, i) => {
		if (i % 2 === 0) {
			return (
				<span key={`stdout-${i}`} dangerouslySetInnerHTML={{ __html: part }} />
			);
		} else {
			const id = Number.parseInt(part, 10);
			const key = `${id}-${i}`;
			return (
				<Fragment key={`stdin-${key}`}>
					<form
						style={{ display: "inline" }}
						onSubmit={(e) => {
							e.preventDefault();
							const form = e.currentTarget as HTMLFormElement;
							const input = form.elements.namedItem(
								`stdin-${key}`,
							) as HTMLInputElement;
							const value = input?.value ?? "";
							handleSubmit(id, value, i);
						}}
					>
						<input
							id={`stdin-${key}`}
							ref={inputRef}
							type="text"
							enterKeyHint="send"
							style={{
								border: "unset",
								backgroundColor: "black",
								color: "white",
								boxShadow: "unset",
								fontSize: "inherit",
							}}
							name={`stdin-${key}`}
							disabled={triggered.includes(key)}
							onKeyDown={(event) => {
								if (event.key === "Enter") {
									event.preventDefault();
									handleSubmit(id, event.currentTarget.value, i);
								}
							}}
						/>
					</form>
					{triggered.includes(key) && <br />}
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
					const key = `${n}`;
					return (
						<Fragment key={`stdin-${key}`}>
							<span>[{n}] Pending stdin:</span>
							<form
								style={{ display: "inline" }}
								onSubmit={(e) => {
									e.preventDefault();
									const form = e.currentTarget as HTMLFormElement;
									const input = form.elements.namedItem(
										`stdin-${key}`,
									) as HTMLInputElement;
									const value = input?.value ?? "";
									handleSubmit(n, value);
								}}
							>
								<input
									id={`stdin-${key}`}
									type="text"
									enterKeyHint="send"
									style={{
										border: "unset",
										backgroundColor: "black",
										color: "white",
										boxShadow: "unset",
										fontSize: "inherit",
									}}
									name={`stdin-${key}`}
									disabled={triggered.includes(key)}
									onKeyDown={(event) => {
										if (event.key === "Enter") {
											event.preventDefault();
											handleSubmit(n, event.currentTarget.value);
										}
									}}
								/>
							</form>
						</Fragment>
					);
				})}
		</div>
	);
});
