/** biome-ignore-all lint/a11y/useKeyWithClickEvents: <explanation> */
/** biome-ignore-all lint/a11y/noStaticElementInteractions: <explanation> */
import { useEffect, useRef, useState } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { python } from "@codemirror/lang-python";
import { EditorView, keymap } from "@codemirror/view";

import { indentOnInput, indentUnit } from "@codemirror/language";
import { defaultKeymap } from "@codemirror/commands";
import { useTrevorWebSocket } from "../../websockets/websocket";
import { useTrevorSelector } from "../../store";
import { Prec } from "@codemirror/state";
import { type Diagnostic, linter } from "@codemirror/lint";
import type { MidiDevice, VirtualDevice } from "../../model";
import { Terminal } from "../Terminal";
import { HeaderButton } from "../widgets/BaseComponents";

const ERROR_DELAY = 3000;

interface ClassBrowserProps {
	onExecute?: (code: string, action: string) => void;
	onClose: () => void;
	device: VirtualDevice | MidiDevice;
}

// function extractLastExpression(text: string) {
// 	const match = text.match(/([a-zA-Z0-9_()\[\]\.]+)$/);
// 	return match ? match[1] : "";
// }

// async function askCompletion(context: CompletionContext) {
// 	const websocket = useTrevorWebSocket();
// 	const word = context.matchBefore(/\w+(\.\w+)?/);

// 	if (!word && !context.explicit) return null;

// 	const fullText = context.state.sliceDoc(0, context.pos);
// 	const lastExpression = extractLastExpression(fullText);

// 	if (!websocket) return null;

// 	const options = await websocket.requestCompletion(lastExpression);

// 	return {
// 		from: word ? word.from : context.pos,
// 		options,
// 		validFor: /^\w*$/,
// 	};
// }

export function ClassBrowser({ device, onClose }: ClassBrowserProps) {
	const editorRef = useRef<EditorView | undefined>(undefined);
	const [code, setCode] = useState("");
	const [stdout, setStdout] = useState("");
	const [errors, setErrors] = useState<Diagnostic[]>([]);
	const trevorSocket = useTrevorWebSocket();
	const classCode = useTrevorSelector((state) => state.runTime.classCode);
	// const method = useRef<string>(undefined);

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

	const disableMobileAutocomplete = EditorView.contentAttributes.of({
		autocomplete: "off",
		autocorrect: "off",
		autocapitalize: "off",
		spellcheck: "false",
	});

	return (
		<div className="patching-modal" style={{ zIndex: 21 }}>
			<div className="modal-header playground">
				<HeaderButton
					text="Close"
					onClick={() => {
						onClose();
					}}
				/>
				<HeaderButton
					text="Clear"
					onClick={() => {
						setStdout("");
					}}
				/>
				<HeaderButton
					text="Patch"
					onClick={() => {
						if (code) {
							trevorSocket?.compileInject(device.id, code);
						}
					}}
				/>

				<HeaderButton
					text="Save"
					onClick={() => {
						if (code) {
							trevorSocket?.compileInjectSave(device.id, code);
						}
					}}
				/>
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
				<div
					style={{ flex: 0.6, overflowY: "auto" }}
					onClick={(event) => {
						event.stopPropagation();
						event.preventDefault();
					}}
				>
					<CodeMirror
						ref={(view) => {
							if (view) {
								editorRef.current = view.view;
							}
						}}
						value={code}
						onChange={(value) => {
							setCode(value);
						}}
						maxHeight="100%"
						height="100%"
						extensions={[
							python(),
							indentUnit.of("    "),
							indentOnInput(),
							keymap.of([...defaultKeymap]),
							disableMobileAutocomplete,
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
					<Terminal
						stdout={stdout}
						stdin={(id, text) => {
							trevorSocket.sendStdin(id, text);
						}}
					/>
				</div>
			</div>
			<div className="modal-footer">
				<p>mod-?: displays shortcuts</p>
			</div>
		</div>
	);
}
