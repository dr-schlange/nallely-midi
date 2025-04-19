import type {
	MidiDevice,
	MidiParameter,
	VirtualDevice,
	VirtualParameter,
} from "./model";
import { store } from "./store";
import { setFullState } from "./store/trevorSlice";
import { isVirtualParameter } from "./utils/svgUtils";

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

	public toggle_device(device: VirtualDevice) {
		if (device.paused) {
			this.sendMessage(
				JSON.stringify({
					command: "resume_device",
					device_id: device.id,
				}),
			);
		} else {
			this.sendMessage(
				JSON.stringify({
					command: "pause_device",
					device_id: device.id,
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
