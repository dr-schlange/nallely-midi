import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useTrevorDispatch, useTrevorSelector } from "../store";
import { addStdinWait, removeStdinWait } from "../store/runtimeSlice";
import { AnsiParser } from "../utils/utils";

export const Terminal = ({
	stdout,
	stdin,
	onStdinRequest = undefined,
	canFocus = undefined,
	onEnter = undefined,
	disableAfterTrigger = false,
}) => {
	const [triggered, setTriggered] = useState([]);
	const pending = useTrevorSelector((state) => state.runTime.stdin.queue);
	const dispatch = useTrevorDispatch();
	const [displayPending, setDisplayPending] = useState(
		!stdout.match(/<stdin:(\d+)>/g),
	);
	const inputRef = useRef(null);

	const parts = useMemo(
		() => AnsiParser.ansi_to_html(stdout).split(/&lt;stdin:(\d+)&gt;/g),
		[stdout],
	);

	useEffect(() => {
		const matches = Array.from(stdout.matchAll(/<stdin:(\d+)>/g), (m) =>
			Number(m[1]),
		);

		if (matches.length === 0) {
			if (triggered.length > 0) {
				setTriggered([]);
				return;
			}
			setDisplayPending(true);
			return;
		}

		setDisplayPending(false);
		for (const id of matches) {
			if (triggered.includes(id)) {
				continue;
			}
			dispatch(addStdinWait(id));
		}
	}, [stdout, dispatch, triggered]);

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
							disabled={disableAfterTrigger && triggered.includes(key)}
							onKeyDown={(event) => {
								if (event.key === "Enter") {
									event.preventDefault();
									onEnter?.();
									handleSubmit(id, event.currentTarget.value, i);
								}
							}}
              onClick={(event) => {
                event.preventDefault()
								onStdinRequest?.(inputRef.current);
							}}
						/>
					</form>
					{triggered.includes(key) && <br />}
				</Fragment>
			);
		}
	});

	useEffect(() => {
		if (
			inputRef.current &&
			!inputRef.current.disabled &&
			canFocus?.(inputRef.current)
		) {
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
											onEnter?.();
											handleSubmit(n, event.currentTarget.value);
										}
									}}
                  onClick={(event) => {
                    event.preventDefault()
										onStdinRequest?.(inputRef.current);
									}}
								/>
							</form>
						</Fragment>
					);
				})}
		</div>
	);
};
