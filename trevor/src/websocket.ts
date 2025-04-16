import type { MidiDevice, MidiParameter } from "./model";
import { store } from "./store";
import { setFullState } from "./store/trevorSlice";

const WEBSOCKET_URL = `ws://${window.location.hostname}:6788/trevor`;

class TrevorWebSocket {
	private socket: WebSocket | null = null;
	private reconnectInterval = 1 * 1000;
	private isConnected = false;

	constructor(private url: string) {
		this.connect();
	}

	private connect() {
		this.socket = new WebSocket(this.url);

		this.socket.onopen = () => {
			console.debug("WebSocket connected");
			this.isConnected = true;
		};

		this.socket.onmessage = (event) => {
			console.debug("Message received:", event.data);
			store.dispatch(setFullState(JSON.parse(event.data)));
		};

		this.socket.onclose = () => {
			console.error("WebSocket disconnected. Attempting to reconnect...");
			this.isConnected = false;
			this.reconnect();
		};

		this.socket.onerror = (error) => {
			console.error("WebSocket error:", error);
			this.isConnected = false;
			this.socket?.close();
		};
	}

	private reconnect() {
		setTimeout(() => {
			if (!this.isConnected) {
				console.log("Reconnecting...");
				this.connect();
			}
		}, this.reconnectInterval);
	}

	public sendMessage(message: string) {
		if (this.socket && this.isConnected) {
			this.socket.send(message);
		} else {
			console.error("Cannot send message. WebSocket is not connected.");
		}
	}

	public createDevice(deviceClass: string) {
		this.sendMessage(
			JSON.stringify({
				command: "create_device",
				name: deviceClass,
			}),
		);
	}

	public associateParameters(
		fromDevice: MidiDevice,
		fromParameter: MidiParameter,
		toDevice: MidiDevice,
		toParameter: MidiParameter,
	) {
		this.sendMessage(
			JSON.stringify({
				command: "associate_parameters",
				from_parameter: `${fromDevice.id}::${fromParameter.module_state_name}::${fromParameter.name}`,
				to_parameter: `${toDevice.id}::${toParameter.module_state_name}::${toParameter.name}`,
			}),
		);
	}
}

let websocket: TrevorWebSocket | null = null;

export const connectWebSocket = () => {
	if (websocket) {
		return;
	}
	websocket = new TrevorWebSocket(WEBSOCKET_URL);

	// setTimeout(() => {
	// 	websocket?.sendMessage("Hello, server!");
	// }, 10000);
};

export const useTrevorWebSocket = () => {
	return websocket;
};
