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
import { Prec, StateEffect, StateField } from "@codemirror/state";

import { type Diagnostic, linter } from "@codemirror/lint";
import type { MidiDevice, VirtualDevice } from "../../model";
import { Terminal } from "../Terminal";
import { HeaderButton } from "../widgets/BaseComponents";
import {
	autocompletion,
	startCompletion,
	acceptCompletion,
	completionStatus,
} from "@codemirror/autocomplete";

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

const completionRegistry = {
	name: ["in_cv", "in0_cv", "out0_cv", "a_cv"],
	range: ["0, 1", "0, 127", "op1, op2"],
	default: ["0", "1", "64"],
	edge: ["any", "rising", "falling", "both", "increase", "decrease", "flat"],
	conv: ["round", ">0", "!=0"],
	doc: ["Parameter description"],
};

function parseTemplateLine(src) {
	const slots = [];
	let index = 1;

	// Convert the mini template system to the snippet system of code mirror
	const snippet = src.replace(
		/%([a-zA-Z_]\w*)(?:<([^>]+)>)?/g,
		(m, ident, group) => {
			const slotIndex = index++;
			slots.push({ name: ident, group: group || null, index: slotIndex });
			return `\${${slotIndex}:${ident}}`;
		},
	);

	return { snippet, slots };
}

// Custom snippet system that works inside docstrings
const activeSnippetEffect = StateEffect.define<{
	slots: Array<{
		name: string;
		group: string | null;
		index: number;
		from: number;
		to: number;
	}>;
	currentIndex: number;
} | null>();

const activeSnippetField = StateField.define<{
	slots: Array<{
		name: string;
		group: string | null;
		index: number;
		from: number;
		to: number;
	}>;
	currentIndex: number;
} | null>({
	create() {
		return null;
	},
	update(value, tr) {
		for (const effect of tr.effects) {
			if (effect.is(activeSnippetEffect)) {
				return effect.value;
			}
		}
		// Update positions if document changed
		if (value && tr.docChanged) {
			const slots = value.slots.map((slot) => {
				const from = tr.changes.mapPos(slot.from);
				const to = tr.changes.mapPos(slot.to);
				return { ...slot, from, to };
			});
			return { ...value, slots };
		}
		return value;
	},
});

function getCurrentSnippetField(state) {
	const snippetData = state.field(activeSnippetField, false);
	if (!snippetData) return null;

	const currentSlot = snippetData.slots[snippetData.currentIndex];
	return currentSlot || null;
}

function hasActiveSnippet(state) {
	const snippetData = state.field(activeSnippetField, false);
	return (
		snippetData !== null && snippetData.currentIndex < snippetData.slots.length
	);
}

function moveToNextSnippetField(view) {
	const snippetData = view.state.field(activeSnippetField, false);
	if (!snippetData) return false;

	const nextIndex = snippetData.currentIndex + 1;
	if (nextIndex >= snippetData.slots.length) {
		// End of snippet, clear it
		view.dispatch({
			effects: activeSnippetEffect.of(null),
		});
		return false;
	}

	const nextSlot = snippetData.slots[nextIndex];

	// Delete the placeholder text and position cursor
	view.dispatch({
		changes: { from: nextSlot.from, to: nextSlot.to, insert: "" },
		selection: { anchor: nextSlot.from },
		effects: activeSnippetEffect.of({
			...snippetData,
			currentIndex: nextIndex,
			slots: snippetData.slots.map((s, i) => {
				if (i === nextIndex) {
					// Update the current slot to have empty range
					return { ...s, from: nextSlot.from, to: nextSlot.from };
				} else if (i > nextIndex) {
					// Shift subsequent slots by the deleted length
					const shift = nextSlot.to - nextSlot.from;
					return { ...s, from: s.from - shift, to: s.to - shift };
				}
				return s;
			}),
		}),
	});

	// Force focus and trigger completion after state update - with extensive logging
	view.focus();

	requestAnimationFrame(() => {
		requestAnimationFrame(() => {
			startCompletion(view);
		});
	});

	return true;
}

function moveToPrevSnippetField(view) {
	const snippetData = view.state.field(activeSnippetField, false);
	if (!snippetData || snippetData.currentIndex === 0) return false;

	const prevIndex = snippetData.currentIndex - 1;
	const prevSlot = snippetData.slots[prevIndex];

	view.dispatch({
		selection: { anchor: prevSlot.from, head: prevSlot.to },
		effects: activeSnippetEffect.of({
			...snippetData,
			currentIndex: prevIndex,
		}),
	});
	return true;
}

function templateCompletions(context) {
	const slot = getCurrentSnippetField(context.state);
	if (!slot) return null;

	const group = slot.group || slot.name;
	if (!group) return null;

	const list = completionRegistry[group];
	if (!list) return null;

	if (context.pos < slot.from || context.pos > slot.to) {
		return null;
	}

	return {
		from: slot.from,
		to: slot.to,
		options: list.map((item) => ({
			label: item,
			type: "constant",
			// Add a command that moves to next field after applying completion
			apply: (view, completion, from, to) => {
				view.dispatch({
					changes: { from, to, insert: item },
					selection: { anchor: from + item.length },
				});
				// Move to next field after a short delay
				setTimeout(() => {
					if (hasActiveSnippet(view.state)) {
						moveToNextSnippetField(view);
					}
				}, 100);
			},
		})),
		// Force completion to show immediately without typing
		filter: false,
	};
}

function findFirstEmptyLineAfter(state, startLineNumber) {
	const totalLines = state.doc.lines;

	for (let i = startLineNumber + 1; i <= totalLines; i++) {
		const line = state.doc.line(i);
		if (!line.text.trim()) {
			return line.from;
		}
	}

	// If none found, return end-of-document
	return state.doc.length;
}

function duplicateAsSnippet(view) {
	if (!view) return;

	const sel = view.state.selection.main;
	const line = view.state.doc.lineAt(sel.from);
	let src = line.text;

	src = `    ${src.replace(/^\s*#\s*/, "").trim()}`;

	const parsed = parseTemplateLine(src);

	// Create plain text version (replace ${n:text} with just text)
	const plainText = parsed.snippet.replace(/\$\{(\d+):([^}]+)\}/g, "$2");
	const insertPos = findFirstEmptyLineAfter(view.state, line.number);

	// First, add a newline if needed
	if (insertPos < view.state.doc.length) {
		view.dispatch({
			changes: { from: insertPos, insert: "\n" },
		});
	}

	// Insert the plain text and calculate slot positions
	let currentPos = insertPos;
	const slots = [];
	let remainingText = plainText;

	for (const slot of parsed.slots) {
		const beforeSlot = remainingText.substring(
			0,
			remainingText.indexOf(slot.name),
		);
		currentPos += beforeSlot.length;

		const slotStart = currentPos;
		const slotEnd = currentPos + slot.name.length;

		slots.push({
			...slot,
			from: slotStart,
			to: slotEnd,
		});

		currentPos = slotEnd;
		remainingText = remainingText.substring(
			beforeSlot.length + slot.name.length,
		);
	}

	// Insert the text and set up snippet state
	view.dispatch({
		changes: { from: insertPos, insert: plainText },
		selection:
			slots.length > 0
				? { anchor: slots[0].from, head: slots[0].to }
				: undefined,
		effects:
			slots.length > 0
				? activeSnippetEffect.of({ slots, currentIndex: 0 })
				: undefined,
	});

	// Delete the first placeholder and show completions
	if (slots.length > 0) {
		setTimeout(() => {
			const firstSlot = slots[0];
			view.dispatch({
				changes: { from: firstSlot.from, to: firstSlot.to, insert: "" },
				selection: { anchor: firstSlot.from },
				effects: activeSnippetEffect.of({
					slots: slots.map((s, i) => {
						if (i === 0) {
							return { ...s, from: firstSlot.from, to: firstSlot.from };
						} else {
							const shift = firstSlot.to - firstSlot.from;
							return { ...s, from: s.from - shift, to: s.to - shift };
						}
					}),
					currentIndex: 0,
				}),
			});

			// Trigger completion after placeholder deletion using requestAnimationFrame for better mobile support
			view.focus();
			requestAnimationFrame(() => {
				requestAnimationFrame(() => {
					startCompletion(view);
				});
			});
		}, 10);
	}
}

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
					text="Dup"
					onClick={() => {
						if (code) {
							duplicateAsSnippet(editorRef.current);
						}
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
							const regex = /class (?<name>[^(]+)/;
							const match = code.match(regex);
							if (match?.groups) {
								const name = match.groups.name;
								trevorSocket?.compileInjectSave(device.id, code, name);
							}
						}
					}}
				/>
			</div>
			<div
				className="modal-body"
				style={{ display: "flex", flexDirection: "column", height: "100%" }}
			>
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
							activeSnippetField,
							Prec.high(
								keymap.of([
									{
										key: "Tab",
										run: (view) => {
											if (hasActiveSnippet(view.state)) {
												moveToNextSnippetField(view);
												return true;
											}
											return false;
										},
									},
									{
										key: "Enter",
										run: (view) => {
											// If completion is active, accept it and move to next field
											if (completionStatus(view.state) === "active") {
												acceptCompletion(view);
												if (hasActiveSnippet(view.state)) {
													// Move to next field after accepting completion
													setTimeout(() => {
														moveToNextSnippetField(view);
													}, 50);
												}
												return true;
											}
											// If we're in a snippet but no completion, just move to next field
											if (hasActiveSnippet(view.state)) {
												moveToNextSnippetField(view);
												return true;
											}
											return false;
										},
									},
									{
										key: "Shift-Tab",
										run: (view) => {
											if (hasActiveSnippet(view.state)) {
												const moved = moveToPrevSnippetField(view);
												if (moved) {
													view.focus();
													// Trigger completion after moving to previous field
													setTimeout(() => startCompletion(view), 50);
												}
												return true;
											}
											return false;
										},
									},
								]),
							),
							autocompletion({
								override: [templateCompletions],
								activateOnTyping: true,
								tooltipClass: () => "snippet-completion-tooltip",
								defaultKeymap: true,
							}),
							EditorView.baseTheme({
								".cm-tooltip.cm-tooltip-autocomplete, &light .cm-tooltip-autocomplete":
									{
										zIndex: "99999 !important",
										position: "fixed !important",
									},
								".cm-tooltip.snippet-completion-tooltip": {
									zIndex: "99999 !important",
									position: "fixed !important",
									transform: "translateY(1.2em) !important",
								},
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
