import {
	KeyboardEventHandler,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import CodeMirror from "@uiw/react-codemirror";
import { python } from "@codemirror/lang-python";
import {
	autocompletion,
	type CompletionContext,
} from "@codemirror/autocomplete";
import { Decoration, EditorView, keymap, WidgetType } from "@codemirror/view";
import { useTrevorWebSocket } from "../../websocket";
import { useTrevorSelector } from "../../store";
import { Prec } from "@codemirror/state";
import { type Diagnostic, setDiagnostics } from "@codemirror/lint";

const AUTO_SAVE_DELAY = 2000;

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

function displayError(
	view: EditorView | undefined,
	error: { line: number; message: string },
) {
	if (!view) return;

	console.log("Error at line:", error.line);

	const selectionStartLine = view.state.doc.lineAt(
		view.state.selection.main.from,
	).number;
	const realErrorLineNumber = selectionStartLine + (error.line - 1);

	console.log("Real Error at line:", realErrorLineNumber);

	const errorLine = view.state.doc.line(realErrorLineNumber);

	const diagnostics = [
		{
			from: errorLine.from,
			to: errorLine.to,
			severity: "error",
			message: error.message,
		} as Diagnostic,
	];

	view.dispatch(setDiagnostics(view.state, diagnostics));
}

// class ResultWidget extends WidgetType {
// 	constructor(private message: any) {
// 		super();
// 	}

// 	toDOM() {
// 		const widget = document.createElement("div");
// 		widget.style.position = "absolute";
// 		widget.style.backgroundColor = "rgba(255, 0, 0, 0.2)";
// 		widget.style.padding = "5px";
// 		widget.style.border = "1px solid red";
// 		widget.textContent = this.message.toString(); // Message personnalisé
// 		return widget;
// 	}
// }

// function showWidget(view: EditorView | undefined, message: any) {
// 	if (!view) {
// 		return;
// 	}
// 	const { state } = view;
// 	const selection = state.selection.main;
// 	const { from, to } = selection;

// 	// Crée un widget à placer à la droite de la sélection
// 	const widgetElement = new ResultWidget(message); // Par exemple, utilise message.details pour personnaliser le widget

// 	// Place le widget à la bonne position (droit de la sélection)
// 	const widgetPosition = { from: to }; // La position où tu veux afficher le widget

// 	const widgetDecoration = Decoration.widget({
// 		widget: widgetElement,
// 		side: 1,
// 		pos: widgetPosition,
// 	});

// 	// Applique la decoration à la position désirée
// 	const transaction = state.update({
// 		effects: Decoration.set([widgetDecoration.range(from)]), // Ajoute la decoration
// 	});

// 	// Met à jour l'état de l'éditeur avec la decoration
// 	view.dispatch(transaction);
// }

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
	const trevorSocket = useTrevorWebSocket();

	const executeCode = (code: string, action) => {
		trevorSocket?.executeCode(code);
	};

	useEffect(() => {
		const onMessageHandler = (event) => {
			const message = JSON.parse(event.data);

			if (message.command === "error" && message.requestId) {
				const error = message.details;
				displayError(editorRef.current, {
					line: error.line,
					message: error.message,
				});
			}
			if (message.command === "stdout" && message.requestId) {
				setStdout((prev) => prev + message.line);
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

						executeCode(selectedText, { printResult: false });
					} else {
						const selectedText = state.sliceDoc(selection.from, selection.to);
						executeCode(selectedText, { printResult: false });
					}

					return true;
				},
			},
			{
				key: "Mod-s",
				preventDefault: true,
				run: (view) => {
					trevorSocket?.saveCode(code);
					return true;
				},
			},
			{
				key: "Mod-p",
				preventDefault: true,
				run: (view) => {
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

						executeCode(`print(${selectedText})`, { printResult: false });
					} else {
						const selectedText = state.sliceDoc(selection.from, selection.to);
						executeCode(`print(${selectedText})`, { printResult: false });
					}

					return true;
				},
			},
			{
				key: "Mod-l",
				preventDefault: true,
				run: (view) => {
					setStdout("");
					return true;
				},
			},
			{
				key: "Mod-?",
				preventDefault: true,
				run: (view) => {
					setStdout(`${stdout}
Shortcuts:
mod-d: execute the current line or the selection
mod-p: execute the current line or the selection in a print
mod-l: clear the terminal
mod-?: displays this entry
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
		saveCodeDebounced(fullText);
	}

	const saveCodeDebounced = useMemo(() => {
		if (!trevorSocket) return () => {};
		return debounce((newCode: string) => {
			trevorSocket.saveCode(newCode);
		}, AUTO_SAVE_DELAY);
	}, [trevorSocket]);

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
						value={"method"}
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
			</div>
			<div
				className="modal-body"
				style={{ display: "flex", flexDirection: "column", height: "100%" }}
			>
				<div style={{ flex: 0.6, overflowY: "auto" }}>
					<CodeMirror
						ref={(view) => {
							if (view) editorRef.current = view.view;
						}}
						value={code}
						onChange={(value) => {
							setCode(value);
							saveCodeDebounced(value);
						}}
						maxHeight="100%"
						height="100%"
						extensions={[
							python(),
							myCustomKeymap,
							autocompletion({
								override: [askCompletion],
							}),
						]}
					/>
				</div>
				<div
					tabIndex={0}
					style={{
						flex: 0.4,
						overflowY: "auto",
						padding: "10px",
						background: "black",
					}}
					onKeyDown={(e) => {
						if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "l") {
							e.preventDefault();
							setStdout("");
						}
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
