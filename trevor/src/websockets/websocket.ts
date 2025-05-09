import type {
	MidiDevice,
	MidiParameter,
	PadOrKey,
	PadsOrKeys,
	VirtualDevice,
	VirtualParameter,
} from "../model";
import { store } from "../store";
import { setErrors, setKnownPatches } from "../store/generalSlice";
import { setFullState } from "../store/trevorSlice";
import { isPadOrdKey, isPadsOrdKeys, isVirtualParameter } from "../utils/utils";

const WEBSOCKET_URL = `ws://${window.location.hostname}:6788/trevor`;

class TrevorWebSocket {
	public socket: WebSocket | null = null;
	private reconnectInterval = 1 * 1000;
	private isConnected = false;
	private manualClose = false;
	private pendingRequests = new Map<string, (response: any) => void>();
	private retryTimeoutId: ReturnType<typeof setTimeout> | null = null;

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
			this.sendJsonMessage({
				command,
				requestId,
				...args,
			});
		});
	}

	public requestCompletion(expression: string) {
		return this.requestWithAnswer("completion_request", { expression });
	}

	public executeCode(code: string) {
		return this.sendJsonMessage({
			command: "execute_code",
			code,
		});
	}

	private connect() {
		this.manualClose = false;
		this.socket = new WebSocket(this.url);

		this.socket.onopen = () => {
			console.debug("Connected to Trevor");
			this.isConnected = true;
		};

		this.socket.onmessage = (event) => {
			const message = JSON.parse(event.data);
			if (message.errors) {
				store.dispatch(setErrors(message.errors));
				return;
			}
			if (message.knownPatches) {
				store.dispatch(setKnownPatches(message.knownPatches));
				return;
			}
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
		};

		this.socket.onerror = (error) => {
			console.error("WebSocket error:", error);
			// Just close; onclose will handle reconnection
			if (this.socket) {
				this.socket.close();
			}
		};

		this.socket.onclose = () => {
			console.warn("WebSocket closed");
			this.isConnected = false;
			this.socket = null;

			if (!this.manualClose) {
				this.reconnect();
			}
		};
	}

	public disconnect() {
		this.isConnected = false;
		this.manualClose = true;

		if (this.retryTimeoutId !== null) {
			console.log("Clearing retry timeout...");
			clearTimeout(this.retryTimeoutId);
			this.retryTimeoutId = null;
		}

		if (this.socket) {
			this.socket.close();
			this.socket = null;
		}
	}

	private reconnect() {
		if (this.retryTimeoutId !== null) {
			clearTimeout(this.retryTimeoutId);
		}
		this.retryTimeoutId = setTimeout(() => {
			console.log("Reconnecting...");
			this.connect();
		}, this.reconnectInterval);
	}

	public sendMessage(message: string) {
		if (this.socket && this.isConnected) {
			this.socket.send(message);
		} else {
			console.error("Cannot send message. WebSocket is not connected.");
		}
	}

	public sendJsonMessage(message: object) {
		this.sendMessage(JSON.stringify(message));
	}

	public createDevice(deviceClass: string) {
		this.sendJsonMessage({
			command: "create_device",
			name: deviceClass,
		});
	}

	public associateParameters(
		fromDevice: MidiDevice | VirtualDevice,
		fromParameter: MidiParameter | VirtualParameter | PadsOrKeys | PadOrKey,
		toDevice: MidiDevice | VirtualDevice,
		toParameter: MidiParameter | VirtualParameter | PadsOrKeys | PadOrKey,
		unbind: boolean,
	) {
		let fromP: string | number;
		if (isVirtualParameter(fromParameter)) {
			fromP = fromParameter.cv_name;
		} else if (isPadsOrdKeys(fromParameter)) {
			fromP = "all_keys_or_pads";
		} else if (isPadOrdKey(fromParameter)) {
			fromP = fromParameter.note;
		} else {
			fromP = fromParameter.name;
		}
		let toP: string | number;
		if (isVirtualParameter(toParameter)) {
			toP = toParameter.cv_name;
		} else if (isPadsOrdKeys(toParameter)) {
			toP = "all_keys_or_pads";
		} else if (isPadOrdKey(toParameter)) {
			toP = toParameter.note;
		} else {
			toP = toParameter.name;
		}
		this.sendJsonMessage({
			command: "associate_parameters",
			from_parameter: `${fromDevice.id}::${fromParameter.section_name}::${fromP}`,
			to_parameter: `${toDevice.id}::${toParameter.section_name}::${toP}`,
			unbind,
		});
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
		this.sendJsonMessage({
			command: "create_scaler",
			from_parameter: `${srcId}::${fromParameter.section_name}::${fromP}`,
			to_parameter: `${dstId}::${toParameter.section_name}::${toP}`,
			create,
		});
	}

	public associatePort(device: MidiDevice, port: string, direction: string) {
		this.sendJsonMessage({
			command: "associate_midi_port",
			device: device.id,
			port,
			direction,
		});
	}

	public saveAll(name: string) {
		this.sendJsonMessage({
			command: "save_all",
			name,
		});
	}

	public loadAll(name: string) {
		this.sendJsonMessage({
			command: "load_all",
			name,
		});
	}

	public toggle_device(device: VirtualDevice, start = false) {
		if (!device.running || device.paused) {
			this.sendJsonMessage({
				command: "resume_device",
				device_id: device.id,
				start,
			});
		} else {
			this.sendJsonMessage({
				command: "pause_device",
				device_id: device.id,
				start,
			});
		}
	}

	public setVirtualValue(
		device: VirtualDevice,
		parameter: VirtualParameter,
		value: number | string | boolean,
	) {
		this.sendJsonMessage({
			command: "set_virtual_value",
			device_id: device.id,
			parameter: parameter.name,
			value,
		});
	}

	public setScalerValue(
		scalerId: number,
		parameter: string,
		value: number | string | boolean,
	) {
		this.sendJsonMessage({
			command: "set_scaler_parameter",
			scaler_id: scalerId,
			parameter,
			value,
		});
	}

	public resetAll() {
		this.sendJsonMessage({
			command: "reset_all",
		});
	}

	public pullFullState() {
		this.sendJsonMessage({
			command: "full_state",
		});
	}

	public deleteAllConnections() {
		this.sendJsonMessage({
			command: "delete_all_connections",
		});
	}

	public saveCode(code: string) {
		this.sendJsonMessage({
			command: "save_code",
			code,
		});
	}

	public listPatches() {
		this.sendJsonMessage({
			command: "list_patches",
		});
	}

	public randomPreset(device_id: number) {
		this.sendJsonMessage({
			command: "random_preset",
			device_id,
		});
	}

	public killDevice(device_id: number) {
		this.sendJsonMessage({
			command: "kill_device",
			device_id,
		});
	}
}

let websocket: TrevorWebSocket | null = null;
let unloadHandler: (() => void) | null = null;

export const connectWebSocket = () => {
	if (unloadHandler) {
		window.removeEventListener("beforeunload", unloadHandler);
		unloadHandler = null;
	}

	if (websocket) {
		console.log("Already connected, disconnecting first...");
		websocket.disconnect();
		websocket = null;
	}

	console.log("Create new Trevor websocket");
	websocket = new TrevorWebSocket(WEBSOCKET_URL);

	unloadHandler = () => {
		websocket?.disconnect();
	};
	window.addEventListener("beforeunload", unloadHandler);
};

export const useTrevorWebSocket = () => {
	return websocket;
};
