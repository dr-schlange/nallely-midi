import { useEffect, useRef, useState } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { python } from "@codemirror/lang-python";
import {
	autocompletion,
	type CompletionContext,
} from "@codemirror/autocomplete";
import { type EditorView, keymap } from "@codemirror/view";
import { useTrevorWebSocket } from "../../websockets/websocket";
import { useTrevorDispatch, useTrevorSelector } from "../../store";
import { Prec } from "@codemirror/state";
import { type Diagnostic, linter } from "@codemirror/lint";
import type { MidiDevice, VirtualDevice } from "../../model";
import { Button } from "../widgets/BaseComponents";
import { removeStdinWait } from "../../store/runtimeSlice";

const AUTO_SAVE_DELAY = 2000;
const ERROR_DELAY = 3000;

interface ClassBrowserProps {
	onExecute?: (code: string, action: string) => void;
	onClose: () => void;
	device: VirtualDevice | MidiDevice;
}

function debounce(func, delay) {
	let timer;
	return (...args) => {
		clearTimeout(timer);
		timer = setTimeout(() => {
			func(...args);
		}, delay);
	};
}

function extractLastExpression(text: string) {
	const match = text.match(/([a-zA-Z0-9_()\[\]\.]+)$/);
	return match ? match[1] : "";
}

async function askCompletion(context: CompletionContext) {
	const word = context.matchBefore(/\w+(\.\w+)?/);

	if (!word && !context.explicit) return null;

	const fullText = context.state.sliceDoc(0, context.pos);
	const lastExpression = extractLastExpression(fullText);

	const websocket = useTrevorWebSocket();
	if (!websocket) return null;

	const options = await websocket.requestCompletion(lastExpression);

	return {
		from: word ? word.from : context.pos,
		options,
		validFor: /^\w*$/,
	};
}

const execute = (
	view: EditorView,
	executeFun: (code: string) => void,
	print = false,
) => {
	const { state } = view;
	const selection = state.selection.main;

	if (selection.empty) {
		const line = state.doc.lineAt(selection.from);

		const transaction = state.update({
			selection: { anchor: line.from, head: line.to },
			scrollIntoView: true,
		});

		view.dispatch(transaction);

		const selectedText = state.sliceDoc(line.from, line.to);
		const code = print ? `print(${selectedText})` : selectedText;

		executeFun(code);
	} else {
		const selectedText = state.sliceDoc(selection.from, selection.to);
		const code = print ? `print(${selectedText})` : selectedText;
		executeFun(code);
	}

	return true;
};

export function ClassBrowser({ device, onClose }: ClassBrowserProps) {
	const editorRef = useRef<EditorView | undefined>(undefined);
	const [code, setCode] = useState("");
	const [stdout, setStdout] = useState("");
	const [errors, setErrors] = useState<Diagnostic[]>([]);
	const trevorSocket = useTrevorWebSocket();
	const classCode = useTrevorSelector((state) => state.runTime.classCode);
	// const method = useRef<string>(undefined);
	const stdinQueue = useTrevorSelector((state) => state.runTime.stdin.queue);
	const dispatch = useTrevorDispatch();

	useEffect(() => {
		if (!classCode?.classCode) {
			setCode(`# Fetching code for ${device.meta.name}`);
			return;
		}
		setCode(classCode.classCode);
	}, [classCode?.classCode]);

	const executeCode = (code: string) => {
		trevorSocket?.executeCode(code);
	};

	const customLinter = () => {
		return errors;
	};

	function displayError(
		view: EditorView | undefined,
		error: { line: number; message: string; start_col: number },
	) {
		if (!view) return;

		const selectionStartLine = view.state.doc.lineAt(
			view.state.selection.main.from,
		).number;
		const realErrorLineNumber = selectionStartLine + (error.line - 1);
		const errorLine = view.state.doc.line(realErrorLineNumber);

		const diagnostics = [
			{
				from: errorLine.from + error.start_col,
				to: errorLine.to,
				severity: "error",
				message: error.message,
			} as Diagnostic,
		];

		// view.dispatch(setDiagnostics(view.state, diagnostics));
		setErrors(diagnostics);
		setTimeout(() => {
			setErrors([]);
		}, ERROR_DELAY);
	}

	useEffect(() => {
		trevorSocket.getClassCode(device.id);
		trevorSocket.startCaptureIO();
		return () => {
			trevorSocket.stopCaptureIO();
		};
	}, []);

	useEffect(() => {
		const onMessageHandler = (event) => {
			const message = JSON.parse(event.data);

			if (message.command === "error") {
				displayError(editorRef.current, message.details);
			}
			if (message.command === "stdout") {
				setStdout((prev) => `${prev}${message.line}`);
			}
		};

		if (trevorSocket) {
			trevorSocket?.socket?.addEventListener("message", onMessageHandler);
		}

		return () => {
			if (trevorSocket) {
				trevorSocket?.socket?.removeEventListener("message", onMessageHandler);
			}
		};
	}, [trevorSocket?.socket]);

	const myCustomKeymap = Prec.highest(
		keymap.of([
			{
				key: "Mod-s",
				preventDefault: true,
				run: () => {
					if (code) {
						trevorSocket?.compileInject(device.id, code);
					}
					return true;
				},
			},
			{
				key: "Mod-l",
				preventDefault: true,
				run: () => {
					setStdout("");
					return true;
				},
			},
			{
				key: "Mod-?",
				preventDefault: true,
				run: () => {
					setStdout(`${stdout}
Shortcuts:
mod-l:     clear the terminal
alt-space: close/open the code browser
mod-?:     displays this entry
						`);
					return true;
				},
			},
		]),
	);

	// function insertAssignmentAtCursor(text: string) {
	// 	if (!editorRef.current) return;

	// 	const view = editorRef.current;
	// 	const { state } = view;
	// 	const pos = state.selection.main.from;

	// 	const line = state.doc.lineAt(pos);
	// 	const lineText = line.text.trim();

	// 	let insertPos = pos;
	// 	let insertText = text;

	// 	if (lineText.length > 0) {
	// 		insertPos = line.to;
	// 		insertText = `\n${text}`;
	// 	}

	// 	const transaction = state.update({
	// 		changes: { from: insertPos, insert: insertText },
	// 		selection: { anchor: insertPos + insertText.length },
	// 	});
	// 	view.dispatch(transaction);

	// 	const fullText =
	// 		state.sliceDoc(0, insertPos) + insertText + state.sliceDoc(insertPos);
	// 	setCode(fullText);
	// 	saveCodeDebounced();
	// }

	// const saveCodeDebounced = () => {
	// 	return debounce((newCode: string) => {
	// 		trevorSocket?.saveCode(newCode);
	// 	}, AUTO_SAVE_DELAY);
	// };

	return (
		<div className="patching-modal" style={{ zIndex: 1 }}>
			<div className="modal-header playground">
				<button
					type="button"
					className="close-button"
					onClick={() => {
						onClose();
					}}
				>
					Close
				</button>
			</div>
			<div
				className="modal-body"
				style={{ display: "flex", flexDirection: "column", height: "100%" }}
			>
				{/* <div>
					<select
						style={{ width: "100%" }}
						multiple
						onChange={(e) => {
							const selectedIndex = e.target.selectedIndex;
							const selectedOption = e.target.options[selectedIndex];
							method.current = selectedOption.text;

							const code = e.target.value;
							setCode(code);
						}}
					>
						{classCode &&
							Object.entries(classCode.methods).map(([name, code]) => {
								return (
									<option key={name} value={code}>
										{name}
									</option>
								);
							})}
					</select>
				</div> */}
				<div style={{ flex: 0.6, overflowY: "auto" }}>
					<CodeMirror
						ref={(view) => {
							if (view) {
								editorRef.current = view.view;
							}
						}}
						value={code}
						onChange={(value) => {
							setCode(value);
							// saveCodeDebounced();
						}}
						maxHeight="100%"
						height="100%"
						extensions={[
							python(),
							linter(customLinter),
							myCustomKeymap,
							// autocompletion({
							// 	override: [askCompletion],
							// }),
						]}
					/>
				</div>
				<div
					style={{
						flex: 0.4,
						overflowY: "auto",
						padding: "10px",
						background: "black",
					}}
				>
					<pre style={{ color: "white", whiteSpace: "pre-wrap" }}>{stdout}</pre>
					{stdinQueue.map((n) => {
						return (
							<>
								<pre>stdin {n}: </pre>
								<input
									key={`stdin-${n}`}
									type="text"
									onKeyDown={(event) => {
										if (event.key === "Enter") {
											trevorSocket.sendStdin(n, event.currentTarget.value);
											dispatch(removeStdinWait(n));
										}
									}}
								/>
							</>
						);
					})}
				</div>
			</div>
			<div className="modal-header">
				<p>mod-?: displays shortcuts</p>
			</div>
		</div>
	);
}
