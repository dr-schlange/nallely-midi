import type { useTrevorWebSocket } from "../websockets/websocket";

type CloneOptions = Parameters<
	NonNullable<ReturnType<typeof useTrevorWebSocket>>["clone_device"]
>[1];

// The ways to clone a virtual device: the right bar and the menu of its title bar offer these
export const CLONE_ACTIONS: {
	text: string;
	tooltip: string;
	options: CloneOptions;
}[] = [
	{
		text: "Clone and replace",
		tooltip: "Clone the device and kills the original device",
		options: { startClone: true, suicide: true },
	},
	{
		text: "Clone and pause",
		tooltip: "Clone the device and pause it",
		options: { startClone: false, suicide: false },
	},
	{
		text: "Clone and pause original",
		tooltip: "Clone the device and pause original device",
		options: { startClone: true, pauseDevice: true },
	},
	{
		text: "Clone without patch",
		tooltip: "Clone the device without existing patches",
		options: { withLinks: false },
	},
];
