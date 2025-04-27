import type {
	MidiDevice,
	MidiParameter,
	VirtualDevice,
	VirtualParameter,
} from "../model";
import { store } from "../store";
import { setFullState } from "../store/trevorSlice";
import { isVirtualParameter } from "../utils/utils";

const WEBSOCKET_URL = `ws://${window.location.hostname}:6788/trevor`;

class TrevorWebSocket {
	public socket: WebSocket | null = null;
	private reconnectInterval = 1 * 1000;
	private isConnected = false;
	private pendingRequests = new Map<string, (response: any) => void>();

	constructor(private url: string) {
		this.connect();
	}

	private generateRequestId(): string {
		return Math.random().toString(36).substr(2, 9);
	}

	public requestWithAnswer(
		command: string,
		args: Record<string, any>,
	): Promise<any> {
		if (!this.socket || !this.isConnected) {
			return Promise.reject(new Error("WebSocket is not connected"));
		}

		const requestId = this.generateRequestId();

		return new Promise((resolve) => {
			this.pendingRequests.set(requestId, resolve);

			this.sendMessage(
				JSON.stringify({
					command,
					requestId,
					...args,
				}),
			);
		});
	}

	public requestCompletion(expression: string) {
		return this.requestWithAnswer("completion_request", { expression });
	}

	public executeCode(code: string) {
		return this.sendMessage(
			JSON.stringify({
				command: "execute_code",
				code,
			}),
		);
	}

	private connect() {
		this.socket = new WebSocket(this.url);

		this.socket.onopen = () => {
			console.debug("Connected to Trevor");
			this.isConnected = true;
		};

		this.socket.onmessage = (event) => {
			const message = JSON.parse(event.data);
			if (message.command === undefined) {
				store.dispatch(setFullState(message));
				return;
			}
			if (message.command === "completion" && message.requestId) {
				const resolve = this.pendingRequests.get(message.requestId);
				if (resolve) {
					this.pendingRequests.delete(message.requestId);
					resolve(message.options);
				}
				return;
			}
			console.debug("Message received:", event.data);
		};

		this.socket.onclose = () => {
			console.error("WebSocket disconnected. Attempting to reconnect...");
			this.disconnect()
			this.reconnect();
		};

		this.socket.onerror = (error) => {
			console.error("WebSocket error:", error);
			this.disconnect();
		};
	}

	public disconnect() {
		this.isConnected = false;
		this.socket?.close();
	}

	private reconnect() {
		setTimeout(() => {
			if (!this.isConnected) {
				this.disconnect();
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
		fromDevice: MidiDevice | VirtualDevice,
		fromParameter: MidiParameter | VirtualParameter,
		toDevice: MidiDevice | VirtualDevice,
		toParameter: MidiParameter | VirtualParameter,
		unbind: boolean,
	) {
		const fromP = isVirtualParameter(fromParameter)
			? fromParameter.cv_name
			: fromParameter.name;
		const toP = isVirtualParameter(toParameter)
			? toParameter.cv_name
			: toParameter.name;
		this.sendMessage(
			JSON.stringify({
				command: "associate_parameters",
				from_parameter: `${fromDevice.id}::${fromParameter.section_name}::${fromP}`,
				to_parameter: `${toDevice.id}::${toParameter.section_name}::${toP}`,
				unbind,
			}),
		);
	}

	public createScaler(
		fromDevice: MidiDevice | VirtualDevice | number,
		fromParameter: MidiParameter | VirtualParameter,
		toDevice: MidiDevice | VirtualDevice | number,
		toParameter: MidiParameter | VirtualParameter,
		create: boolean,
	) {
		const srcId = typeof fromDevice === "number" ? fromDevice : fromDevice.id;
		const dstId = typeof toDevice === "number" ? toDevice : toDevice.id;
		const fromP = isVirtualParameter(fromParameter)
			? fromParameter.cv_name
			: fromParameter.name;
		const toP = isVirtualParameter(toParameter)
			? toParameter.cv_name
			: toParameter.name;
		this.sendMessage(
			JSON.stringify({
				command: "create_scaler",
				from_parameter: `${srcId}::${fromParameter.section_name}::${fromP}`,
				to_parameter: `${dstId}::${toParameter.section_name}::${toP}`,
				create,
			}),
		);
	}

	public associatePort(device: MidiDevice, port: string, direction: string) {
		this.sendMessage(
			JSON.stringify({
				command: "associate_midi_port",
				device: device.id,
				port,
				direction,
			}),
		);
	}

	public saveAll(name: string) {
		this.sendMessage(
			JSON.stringify({
				command: "save_all",
				name,
			}),
		);
	}

	public toggle_device(device: VirtualDevice, start = false) {
		if (!device.running || device.paused) {
			this.sendMessage(
				JSON.stringify({
					command: "resume_device",
					device_id: device.id,
					start,
				}),
			);
		} else {
			this.sendMessage(
				JSON.stringify({
					command: "pause_device",
					device_id: device.id,
					start,
				}),
			);
		}
	}

	public setVirtualValue(
		device: VirtualDevice,
		parameter: VirtualParameter,
		value: number | string | boolean,
	) {
		this.sendMessage(
			JSON.stringify({
				command: "set_virtual_value",
				device_id: device.id,
				parameter: parameter.name,
				value,
			}),
		);
	}

	public setScalerValue(
		scalerId: number,
		parameter: string,
		value: number | string | boolean,
	) {
		this.sendMessage(
			JSON.stringify({
				command: "set_scaler_parameter",
				scaler_id: scalerId,
				parameter,
				value,
			}),
		);
	}

	public resetAll() {
		this.sendMessage(
			JSON.stringify({
				command: "reset_all",
			}),
		);
	}

	public pullFullState() {
		this.sendMessage(
			JSON.stringify({
				command: "full_state",
			}),
		);
	}

	public deleteAllConnections() {
		this.sendMessage(
			JSON.stringify({
				command: "delete_all_connections",
			}),
		);
	}

	public saveCode(code: string) {
		this.sendMessage(
			JSON.stringify({
				command: "save_code",
				code,
			}),
		);
	}
}

let websocket: TrevorWebSocket | null = null;

export const connectWebSocket = () => {
	if (websocket) {
		return;
	}
	console.log("Create new trevor");
	websocket = new TrevorWebSocket(WEBSOCKET_URL);
};

export const useTrevorWebSocket = () => {
	return websocket;
};
