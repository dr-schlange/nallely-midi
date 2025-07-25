import { useState } from "react";
import type {
	MidiDevice,
	MidiDeviceSection,
	PadOrKey,
	PadsOrKeys,
	VirtualDevice,
	VirtualDeviceSection,
} from "../model";

interface MidiGridProps {
	device: MidiDevice | VirtualDevice;
	section: MidiDeviceSection | VirtualDeviceSection;
	onKeysClick?: (device: MidiDevice | VirtualDevice, keys: PadsOrKeys) => void;
	onNoteClick?: (device: MidiDevice | VirtualDevice, key: PadOrKey) => void;
	onGridOpen?: (device: MidiDevice | VirtualDevice, keys: PadsOrKeys) => void;
	highlight?: string | number | undefined;
}

const NOTE_NAMES = [
	"C",
	"C#",
	"D",
	"D#",
	"E",
	"F",
	"F#",
	"G",
	"G#",
	"A",
	"A#",
	"B",
];

const getNoteName = (midiNumber: number) => {
	const note = NOTE_NAMES[midiNumber % 12];
	const octave = Math.floor(midiNumber / 12);
	return `${note}${octave}`;
};

export const MidiGrid = ({
	device,
	onKeysClick,
	onNoteClick,
	onGridOpen,
	section,
	highlight,
}: MidiGridProps) => {
	const [isOpen, setIsOpen] = useState(false);
	const keySection = {
		channel: 0,
		section_name: section.pads_or_keys?.section_name || "unknown",
		keys: {},
	} as PadsOrKeys;

	const midiNotes = Array.from({ length: 128 }, (_, i) => ({
		number: i,
		name: getNoteName(i),
	}));

	const octaves = [];
	for (let i = 0; i < midiNotes.length; i += 12) {
		octaves.push(midiNotes.slice(i, i + 12));
	}

	const handleOpen = () => {
		setIsOpen(!isOpen);
		onGridOpen?.(device, keySection);
	};

	return (
		<div className={`midi-container ${isOpen ? "open" : ""}`}>
			<div
				className="midi-header"
				id={`${device.id}-${section.pads_or_keys?.section_name}-closed`}
			>
				{isOpen ? (
					<>
						{/* biome-ignore lint/a11y/useKeyWithClickEvents: <explanation> */}
						<span
							className="midi-icon"
							role="img"
							aria-label="piano"
							onClick={handleOpen}
						>
							🎹
						</span>
						{/* biome-ignore lint/a11y/useKeyWithClickEvents: <explanation> */}
						<span className="midi-toggle-icon" onClick={handleOpen}>
							▲
						</span>
					</>
				) : (
					<>
						{/* biome-ignore lint/a11y/useKeyWithClickEvents: <explanation> */}
						<span
							className={`midi-icon ${!isOpen && highlight === "__pads_or_keys__" ? "selected" : ""}`}
							role="img"
							aria-label="piano"
							onClick={() =>
								section.pads_or_keys && onKeysClick?.(device, keySection)
							}
						>
							🎹
						</span>
						{/* biome-ignore lint/a11y/useKeyWithClickEvents: <explanation> */}
						<span className="midi-toggle-icon" onClick={handleOpen}>
							▼
						</span>
					</>
				)}
			</div>

			{isOpen && (
				<div className="midi-grid-octaves">
					{octaves.map((octaveNotes, idx) => (
						<div key={getNoteName(idx)} className="octave-column">
							{octaveNotes.map((note) => (
								// biome-ignore lint/a11y/useKeyWithClickEvents: <explanation>
								<div
									id={`${device.id}-${section.pads_or_keys?.section_name}-${note.name}`}
									key={note.name}
									className={`note-box ${highlight === note.number ? "selected" : ""}`}
									title={`${note.name} - MIDI ${note.number}`}
									onClick={() =>
										section.pads_or_keys &&
										onNoteClick?.(device, {
											section_name: section.pads_or_keys.section_name,
											note: note.number,
											name: note.name,
											mode: "note",
											type: "note",
										})
									}
								>
									{note.name}
								</div>
							))}
						</div>
					))}
				</div>
			)}
		</div>
	);
};
