/** biome-ignore-all lint/a11y/useKeyWithClickEvents: <explanation> */
/** biome-ignore-all lint/a11y/noStaticElementInteractions: <explanation> */
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
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
import { Button, HeaderButton } from "../widgets/BaseComponents";
import {
	autocompletion,
	startCompletion,
	acceptCompletion,
	completionStatus,
} from "@codemirror/autocomplete";
import { Scope } from "../widgets/Oscilloscope";

const ERROR_DELAY = 3000;

interface ClassBrowserProps {
	onExecute?: (code: string, action: string) => void;
	onClose: () => void;
	device: VirtualDevice | MidiDevice;
}

const completionRegistry = {
	name: ["in_cv", "in0_cv", "out0_cv", "a_cv"],
	range: ["0, 1", "0, 127", "op1, op2", "%min, %max"],
	default: ["0", "1", "64"],
	edge: ["any", "rising", "falling", "both", "increase", "decrease", "flat"],
	conv: ["round", ">0", "!=0"],
	doc: ["Parameter description"],
	min: ["0", "1"],
	max: ["127", "255"],
	line: ["%stmts"],
	stmt: ["%ifblock", "%expr"],
	ifblock: ["if %cond:\n    %stmts\nelse:\n    %stmts\n"],
	stmts: ["%stmt", "%stmt\n%stmts", "λ"],
	inlineif: ["%then_ if %cond else %else_"],
	cond: ["true", "false", "in_cv > %number", "in_cv == %number"],
	then_: ["%set"],
	else_: ["%set"],
	set: ["!"],
	expr: ["%operand %op %operand", "%inlineif"],
	op: ["%arit_op", "%bool_op"],
	arit_op: ["+", "-", "*", "/"],
	bool_op: ["==", "!=", "<", ">", "<=", ">="],
	operand: ["%attr_access", "%number"],
	attr_access: ["%receiver.%parameter"],
	parameter: ["in", "in0", "out0", "a"],
	receiver: ["self", "%par"],
	par: ["(%expr)"],
	number: ["0", "1", "127", "3.14"],
};

// Parse grammar rules from editor content between $$ markers
// Format: rule_name: str1 | str2 | ... | strn ;
// Adds each rule_name and its alternatives to completionRegistry
// Processes all $$ sections in the document
function parseGrammarRules(editorText) {
	const lines = editorText.split('\n');
	let inGrammarSection = false;
	let currentRule = '';

	for (const line of lines) {
		// Check for $$ marker
		if (line.trim().startsWith('$$')) {
			if (inGrammarSection) {
				// End of grammar section - continue looking for more sections
				inGrammarSection = false;
				currentRule = '';
			} else {
				// Start of grammar section
				inGrammarSection = true;
			}
			continue;
		}

		if (!inGrammarSection) {
			continue;
		}

		// Accumulate multi-line rules
		currentRule += line + '\n';

		// Check if we have a complete rule (ends with semicolon)
		if (currentRule.trim().endsWith(';')) {
			// Remove the trailing semicolon
			const ruleContent = currentRule.slice(0, currentRule.lastIndexOf(';'));

			// Parse the rule
			const colonIndex = ruleContent.indexOf(':');
			if (colonIndex === -1) {
				// No colon found, skip this rule
				currentRule = '';
				continue;
			}

			const ruleName = ruleContent.substring(0, colonIndex).trim();

			// Detect base indentation from the first line (rule name line)
			const lines = currentRule.split('\n');
			const firstLine = lines[0];
			const baseIndent = firstLine.match(/^(\s*)/)?.[1] || '';

			// Remove base indentation from all lines
			const dedentedText = lines
				.map(line => {
					if (line.startsWith(baseIndent)) {
						return line.substring(baseIndent.length);
					}
					return line;
				})
				.join('\n');

			// Re-extract alternatives from dedented text
			const dedentedColonIndex = dedentedText.indexOf(':');
			const dedentedAlternatives = dedentedText.substring(dedentedColonIndex + 1);

			// Remove trailing semicolon from dedented text
			const finalAlternatives = dedentedAlternatives.substring(0, dedentedAlternatives.lastIndexOf(';'));

			// Split by | and clean up each alternative
			const options = finalAlternatives
				.split('|')
				.map(alt => alt.trim())
				.filter(alt => alt.length > 0);

			if (ruleName && options.length > 0) {
				// Add to completion registry
				completionRegistry[ruleName] = options;
			}

			// Reset for next rule
			currentRule = '';
		}
	}
}

// Check if a completion string is a single placeholder (e.g., "%expr", "<expr>", or "%stmts<group>")
function isSinglePlaceholder(str) {
	const trimmed = str.trim();
	// Match exactly one placeholder with nothing else
	// Supports: %name, %name<group>, <name>, <name<group>>
	const match = trimmed.match(/^(?:%|<)([a-zA-Z_]\w*)(?:<([^>]+)>)?>?$/);
	return match !== null;
}

// Recursively expand single-placeholder completions
// Returns expanded completions that are either:
// - Non-placeholder text
// - Multi-placeholder templates
// - Single placeholders that can't be expanded further
function expandCompletion(completion, visited = new Set()) {
	// Base case: not a single placeholder, return as-is
	if (!isSinglePlaceholder(completion)) {
		return [completion];
	}

	// Extract the group name from the placeholder
	// Supports: %name, %name<group>, <name>, <name<group>>
	const match = completion.match(/^(?:%|<)([a-zA-Z_]\w*)(?:<([^>]+)>)?>?$/);
	if (!match) return [completion];

	const placeholderName = match[1];
	const explicitGroup = match[2];
	const groupName = explicitGroup || placeholderName;

	// Prevent infinite recursion
	if (visited.has(groupName)) {
		return [completion];
	}

	// Get completions for this group
	const groupCompletions = completionRegistry[groupName];
	if (!groupCompletions) {
		return [completion];
	}

	// Mark as visited
	visited.add(groupName);

	// Recursively expand each completion
	const expanded = [];
	for (const subCompletion of groupCompletions) {
		if (isSinglePlaceholder(subCompletion)) {
			// Recursively expand single placeholders
			const subExpanded = expandCompletion(subCompletion, new Set(visited));
			expanded.push(...subExpanded);
		} else {
			// Keep non-single-placeholder completions as-is
			expanded.push(subCompletion);
		}
	}

	return expanded;
}

// Unescape special characters (\%, \<, \>) to their literal forms
function unescapeTemplate(str) {
	return str.replace(/\\([%<>])/g, '$1');
}

// Parse a template string that may contain nested placeholders
// %name<group> or <name> or <name<group>> creates a placeholder
// Use \%, \<, \> for literal characters
// Returns both the plain text and slot information
// indent: string to prepend to each line (except the first)
function parseNestedTemplate(src, parentId = "", indent = "") {
	const slots = [];
	let plainText = "";
	let currentPos = 0;

	// Matches: %name, %name<group>, <name>, <name<group>>
	// But not escaped sequences like \% or \<
	const regex = /(?<!\\)(?:%|<)([a-zA-Z_]\w*)(?:<([^>]+)>)?>?/g;
	let match;
	let slotIndex = 1;

	while ((match = regex.exec(src)) !== null) {
		// Add text before the placeholder and unescape it
		const textBefore = src.substring(currentPos, match.index);
		// Apply indentation to newlines in the text and unescape
		plainText += unescapeTemplate(textBefore).replace(/\n/g, `\n${indent}`);

		const name = match[1];
		const group = match[2] || null;
		const id = parentId ? `${parentId}-${slotIndex}` : `${slotIndex}`;

		const slotFrom = plainText.length;
		plainText += name; // Use the placeholder name as initial text
		const slotTo = plainText.length;

		slots.push({
			name,
			group,
			id,
			from: slotFrom,
			to: slotTo,
		});

	currentPos = regex.lastIndex;
	slotIndex++;
	}

	// Add remaining text
	const remainingText = src.substring(currentPos);
	// Apply indentation to newlines in remaining text and unescape
	plainText += unescapeTemplate(remainingText).replace(/\n/g, `\n${indent}`);

	return { plainText, slots };
}function parseTemplateLine(src) {
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
		id: string; // hierarchical ID like "1", "1-1", "1-2-1"
		from: number;
		to: number;
	}>;
	currentIndex: number;
} | null>();

const activeSnippetField = StateField.define<{
	slots: Array<{
		name: string;
		group: string | null;
		id: string;
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

	// Expand single-placeholder completions recursively
	const expandedList = [];
	for (const item of list) {
		const expanded = expandCompletion(item);
		expandedList.push(...expanded);
	}

	return {
		from: slot.from,
		to: slot.to,
		options: expandedList.map((item) => ({
			label: unescapeTemplate(item), // Show unescaped version in completion menu
			type: "constant",
			apply: (view, completion, from, to) => {
				const snippetData = view.state.field(activeSnippetField, false);
				if (!snippetData) return;

				const currentSlot = snippetData.slots[snippetData.currentIndex];

				// Special case: "λ" means end recursion, just remove the placeholder
				if (item === "λ") {
					view.dispatch({
						changes: { from, to, insert: "" },
						selection: { anchor: from },
						effects: activeSnippetEffect.of({
							...snippetData,
							slots: snippetData.slots.map((s, i) => {
								if (i === snippetData.currentIndex) {
									return { ...s, from, to: from };
								} else if (i > snippetData.currentIndex) {
									const shift = to - from;
									return { ...s, from: s.from - shift, to: s.to - shift };
								}
								return s;
							}),
						}),
					});

					setTimeout(() => {
						if (hasActiveSnippet(view.state)) {
							moveToNextSnippetField(view);
						}
					}, 100);
					return;
				}

				// Check if item contains nested placeholders
				// Supports: %name, %name<group>, <name>, <name<group>>
				// But not escaped sequences like \% or \<
				const hasPlaceholders = /(?<!\\)(?:%|<)([a-zA-Z_]\w*)(?:<([^>]+)>)?>?/.test(item);

				if (hasPlaceholders) {
					// Get the indentation of the current line
					const currentLine = view.state.doc.lineAt(from);
					const lineText = currentLine.text;
					const indent = lineText.match(/^\s*/)?.[0] || "";

					// Parse nested template with indentation
					const parsed = parseNestedTemplate(item, currentSlot.id, indent);
					const insertText = parsed.plainText;

					// Calculate absolute positions for new slots
					const newSlots = parsed.slots.map((s) => ({
						...s,
						from: from + s.from,
						to: from + s.to,
					}));

					// Insert the text
					view.dispatch({
						changes: { from, to, insert: insertText },
						selection: { anchor: from + insertText.length },
					});

					// Calculate length difference
					const lengthDiff = insertText.length - (to - from);

					// Build new slots array: keep slots before current, insert new nested slots, shift slots after
					const allSlots = [
						...snippetData.slots.slice(0, snippetData.currentIndex),
						...newSlots,
						...snippetData.slots
							.slice(snippetData.currentIndex + 1)
							.map((s) => ({
								...s,
								from: s.from + lengthDiff,
								to: s.to + lengthDiff,
							})),
					];

					// Update state with new slots
					view.dispatch({
						effects: activeSnippetEffect.of({
							slots: allSlots,
							currentIndex: snippetData.currentIndex, // Stay at same index (first new slot)
						}),
					});

					// Delete first nested placeholder and trigger completion
					setTimeout(() => {
						const firstNestedSlot = allSlots[snippetData.currentIndex];
						view.dispatch({
							changes: {
								from: firstNestedSlot.from,
								to: firstNestedSlot.to,
								insert: "",
							},
							selection: { anchor: firstNestedSlot.from },
							effects: activeSnippetEffect.of({
								slots: allSlots.map((s, i) => {
									if (i === snippetData.currentIndex) {
										return {
											...s,
											from: firstNestedSlot.from,
											to: firstNestedSlot.from,
										};
									} else if (i > snippetData.currentIndex) {
										const shift = firstNestedSlot.to - firstNestedSlot.from;
										return { ...s, from: s.from - shift, to: s.to - shift };
									}
									return s;
								}),
								currentIndex: snippetData.currentIndex,
							}),
						});

						view.focus();
						requestAnimationFrame(() => {
							requestAnimationFrame(() => {
								startCompletion(view);
							});
						});
					}, 50);
				} else {
					// Simple text replacement with indentation applied
					const currentLine = view.state.doc.lineAt(from);
					const lineText = currentLine.text;
					const indent = lineText.match(/^\s*/)?.[0] || "";

					// Unescape special characters and apply indentation to all newlines
					const unescapedItem = unescapeTemplate(item);
					const indentedItem = unescapedItem.replace(/\n/g, `\n${indent}`);

					const lengthDiff = indentedItem.length - (to - from);

					view.dispatch({
						changes: { from, to, insert: indentedItem },
						selection: { anchor: from + indentedItem.length },
						effects: activeSnippetEffect.of({
							...snippetData,
							slots: snippetData.slots.map((s, i) => {
								if (i === snippetData.currentIndex) {
									return { ...s, from: from, to: from + indentedItem.length };
								} else if (i > snippetData.currentIndex) {
									return {
										...s,
										from: s.from + lengthDiff,
										to: s.to + lengthDiff,
									};
								}
								return s;
							}),
						}),
					});

					setTimeout(() => {
						if (hasActiveSnippet(view.state)) {
							moveToNextSnippetField(view);
						}
					}, 100);
				}
			},
		})),
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

	// Parse grammar rules from the entire editor content
	const editorText = view.state.doc.toString();
	parseGrammarRules(editorText);

	const sel = view.state.selection.main;
	const line = view.state.doc.lineAt(sel.from);
	let src = line.text;

	src = `    ${src.replace(/^\s*#\s*/, "").trim()}`;

	// Extract indentation (4 spaces as set above)
	const indent = "    ";

	// Parse using the new nested template parser with indentation
	const parsed = parseNestedTemplate(src, "", indent);
	const plainText = parsed.plainText;
	const insertPos = findFirstEmptyLineAfter(view.state, line.number);

	// First, add a newline if needed
	if (insertPos < view.state.doc.length) {
		view.dispatch({
			changes: { from: insertPos, insert: "\n" },
		});
	}

	// Calculate absolute positions for slots
	const slots = parsed.slots.map((slot) => ({
		...slot,
		from: insertPos + slot.from,
		to: insertPos + slot.to,
	}));

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
	const [mode, setMode] = useState<"scope" | "terminal">("terminal");
	const [value, setValue] = useState(undefined);
	const devices = useTrevorSelector((state) => state.nallely.virtual_devices);
	const connections = useTrevorSelector((state) => state.nallely.connections);
	const debuggedPorts = useMemo(() => {
		return connections.filter(
			(c) => c.src.device === device.id || c.dest.repr === "dbg",
		);
	}, [connections, device.id]);
	const debuggedPortNames = useMemo(() => {
		return debuggedPorts.map((c) => c.src.parameter.name);
	}, [debuggedPorts]);

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

	const modalContent = (
		<div className="patching-modal">
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
					style={{ height: "100%", overflowY: "auto" }}
					onClick={(event) => {
						event.stopPropagation();
						event.preventDefault();
					}}
					onTouchStart={(e) => e.stopPropagation()}
					onTouchMove={(e) => e.stopPropagation()}
					onTouchEnd={(e) => e.stopPropagation()}
					onContextMenu={(e) => e.preventDefault()}
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
				{
					<div
						style={{
							height: "25%",
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
				}
			</div>
			<div className="modal-footer" style={{ gap: "5px" }}>
				{mode === "terminal" ? (
					<p>mod-?: displays shortcuts</p>
				) : (
					<p style={{ width: "100%" }}>{value}</p>
				)}
				{mode === "scope" && (
					<div
						style={{ position: "relative", bottom: "60px", zIndex: "99999" }}
					>
						<Scope
							id="dbg"
							num={419}
							onClose={() => setMode("terminal")}
							onMessage={(val) => setValue(val)}
						/>
					</div>
				)}
				<div style={{ display: "flex", gap: "4px", alignItems: "center" }}>
					<select
						style={{
							border: "unset",
							boxShadow: "none",
							height: "18px",
							width: "18px",
						}}
						value={""}
						title="Select port to debug"
						onChange={(e) => {
							const val = e.target.value;
							const fromParameter = (
								device as VirtualDevice
							).meta.parameters.find((p) => {
								const prefix = debuggedPortNames.includes(p.name) ? "*" : "";
								return `${prefix}${p.cv_name}` === val;
							});
							const unbind = val.startsWith("*");
							const toDevice = devices.find((d) => d.repr === "dbg");
							const toParameter = toDevice.meta.parameters[0];
							trevorSocket?.associateParameters(
								device,
								fromParameter,
								toDevice,
								toParameter,
								unbind,
							);
						}}
					>
						<option value={""}>-</option>
						{(device as VirtualDevice).meta.parameters.map((p) => (
							<option
								key={`${p.cv_name}`}
								value={`${debuggedPortNames.includes(p.name) ? "*" : ""}${p.cv_name}`}
							>
								{`${debuggedPortNames.includes(p.name) ? "*" : " "} ${p.cv_name}`}
							</option>
						))}
					</select>
					<Button
						text={"S"}
						tooltip={mode === "terminal" ? "Show scope" : "Hide scope"}
						activated={mode === "scope"}
						onClick={() => {
							if (mode === "terminal") {
								setMode("scope");
							} else {
								setMode("terminal");
							}
						}}
					/>
				</div>
			</div>
		</div>
	);

	return createPortal(modalContent, document.body);
}
