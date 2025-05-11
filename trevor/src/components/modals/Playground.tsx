import { useEffect, useRef, useState } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { python } from "@codemirror/lang-python";
import {
	autocompletion,
	type CompletionContext,
} from "@codemirror/autocomplete";
import { type EditorView, keymap } from "@codemirror/view";
import { useTrevorWebSocket } from "../../websockets/websocket";
import { useTrevorSelector } from "../../store";
import { Prec } from "@codemirror/state";
import { type Diagnostic, linter } from "@codemirror/lint";

const AUTO_SAVE_DELAY = 2000;
const ERROR_DELAY = 3000;

interface PlaygroundProps {
	onExecute?: (code: string, action: string) => void;
	onClose: () => void;
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

export function Playground({ onClose }: PlaygroundProps) {
	const editorRef = useRef<EditorView | undefined>(undefined);
	const virtualDevices = useTrevorSelector(
		(root) => root.nallely.virtual_devices,
	);
	const midiDevices = useTrevorSelector((root) => root.nallely.midi_devices);
	const playgroundCode = useTrevorSelector(
		(root) => root.nallely.playground_code,
	);
	const [code, setCode] = useState(playgroundCode);
	const [stdout, setStdout] = useState("");
	const [errors, setErrors] = useState<Diagnostic[]>([]);
	const trevorSocket = useTrevorWebSocket();

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
	}, [trevorSocket]);

	const myCustomKeymap = Prec.highest(
		keymap.of([
			{
				key: "Mod-d",
				preventDefault: true,
				run: (view) => {
					execute(view, executeCode);
					return true;
				},
			},
			{
				key: "Mod-s",
				preventDefault: true,
				run: () => {
					trevorSocket?.saveCode(code);
					return true;
				},
			},
			{
				key: "Mod-p",
				preventDefault: true,
				run: (view) => {
					execute(view, executeCode, true);
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
mod-d:     execute the current line or the selection
mod-p:     execute the current line or the selection in a print
mod-l:     clear the terminal
alt-space: close/open the playground
mod-?:     displays this entry
						`);
					return true;
				},
			},
		]),
	);

	function insertAssignmentAtCursor(text: string) {
		if (!editorRef.current) return;

		const view = editorRef.current;
		const { state } = view;
		const pos = state.selection.main.from;

		const line = state.doc.lineAt(pos);
		const lineText = line.text.trim();

		let insertPos = pos;
		let insertText = text;

		if (lineText.length > 0) {
			insertPos = line.to;
			insertText = `\n${text}`;
		}

		const transaction = state.update({
			changes: { from: insertPos, insert: insertText },
			selection: { anchor: insertPos + insertText.length },
		});
		view.dispatch(transaction);

		const fullText =
			state.sliceDoc(0, insertPos) + insertText + state.sliceDoc(insertPos);
		setCode(fullText);
		saveCodeDebounced();
	}

	const saveCodeDebounced = () => {
		return debounce((newCode: string) => {
			trevorSocket?.saveCode(newCode);
		}, AUTO_SAVE_DELAY);
	};

	return (
		<div className="patching-modal">
			<div className="modal-header">
				<button
					type="button"
					className="close-button"
					onClick={() => {
						trevorSocket?.saveCode(code);
						onClose();
					}}
				>
					Close
				</button>

				<label>
					MIDI:
					<select
						value={""}
						title="Select midi device"
						onChange={(e) => {
							const index = e.target.selectedIndex - 1;
							const val = e.target.value;
							insertAssignmentAtCursor(`${val} = connected_devices[${index}]`);
						}}
					>
						<option value={""}>--</option>
						{midiDevices.map((device) => (
							<option value={device.repr.toLowerCase()} key={device.id}>
								{device.repr}
							</option>
						))}
					</select>
				</label>
				<label>
					Virtual:
					<select
						value={""}
						title="Select virtual device"
						onChange={(e) => {
							const index = e.target.selectedIndex - 1;
							const val = e.target.value;
							insertAssignmentAtCursor(`${val} = virtual_devices[${index}]`);
						}}
					>
						<option value="">--</option>
						{virtualDevices.map((device) => (
							<option value={device.repr.toLowerCase()} key={device.id}>
								{device.repr}
							</option>
						))}
					</select>
				</label>
				<button
					type="button"
					title="Execute line or selection (ctrl/cmd-d)"
					className="close-button"
					onClick={() => {
						trevorSocket?.saveCode(code);
						if (editorRef.current) {
							execute(editorRef.current, executeCode, false);
						}
					}}
				>
					run
				</button>
				<button
					type="button"
					title="Execute and print line or selection (ctrl/cmd-p)"
					className="close-button"
					onClick={() => {
						trevorSocket?.saveCode(code);
						if (editorRef.current) {
							execute(editorRef.current, executeCode, true);
						}
					}}
				>
					print
				</button>
			</div>
			<div
				className="modal-body"
				style={{ display: "flex", flexDirection: "column", height: "100%" }}
			>
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
							saveCodeDebounced();
						}}
						maxHeight="100%"
						height="100%"
						extensions={[
							python(),
							linter(customLinter),
							myCustomKeymap,
							autocompletion({
								override: [askCompletion],
							}),
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
				</div>
			</div>
			<div className="modal-header">
				<p>mod-?: displays shortcuts</p>
			</div>
		</div>
	);
}
