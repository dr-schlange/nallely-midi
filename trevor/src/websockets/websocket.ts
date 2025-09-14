import type {
	MidiDevice,
	MidiParameter,
	PadOrKey,
	PadsOrKeys,
	VirtualDevice,
	VirtualParameter,
} from "../model";
import { store } from "../store";
import {
	setErrors,
	setKnownPatches,
	setConnected,
} from "../store/generalSlice";
import { setFullState } from "../store/trevorSlice";
import { isPadOrdKey, isPadsOrdKeys, isVirtualParameter } from "../utils/utils";
import * as RuntimeAPI from "../store/runtimeSlice";

// const WEBSOCKET_URL = `ws://${window.location.hostname}:6788/trevor`;

export const WsStatus = {
	CONNECTED: "connected",
	DISCONNECTED: "disconnected",
	CONNECTING: "connecting",
};

export class TrevorWebSocket {
	socket: WebSocket | null = null;
	private reconnectInterval = 1 * 1000;
	isConnected = false;
	private manualClose = false;
	private pendingRequests = new Map<string, (response: any) => void>();
	private retryTimeoutId: ReturnType<typeof setTimeout> | null = null;
	private unsubscribe;

	constructor(public url: string) {
		this.connect(this.url);
		this.unsubscribe = store.subscribe(this.handleStoreChange.bind(this));
	}

	handleStoreChange() {
		const url = store.getState().general.trevorWebsocketURL;

		if (`${url}/trevor` !== this.url) {
			this.url = `${url}/trevor`;
			this.handleURLChange(this.url);
		}
	}

	handleURLChange(url) {
		this.disconnect();
		this.connect(url);
	}

	destroy() {
		this.unsubscribe();
		this.disconnect();
	}
	private generateRequestId(): string {
		return Math.random().toString(36).substr(2, 9);
	}

	requestWithAnswer(command: string, args: Record<string, any>): Promise<any> {
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

	requestCompletion(expression: string) {
		return this.requestWithAnswer("completion_request", { expression });
	}

	executeCode(code: string) {
		return this.sendJsonMessage({
			command: "execute_code",
			code,
		});
	}

	private connect(url: string) {
		store.dispatch(setConnected(WsStatus.CONNECTING));
		if (this.retryTimeoutId !== null) {
			clearTimeout(this.retryTimeoutId);
			this.retryTimeoutId = null;
		}
		this.manualClose = false;
		if (this.socket) {
			this.socket.close();
			this.socket = null;
		}
		try {
			this.socket = new WebSocket(url);
		} catch (error) {
			console.debug(`Error while connecting to ${url}`, error);
			store.dispatch(setConnected(WsStatus.DISCONNECTED));
			return;
		}

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
				store.dispatch(setConnected(WsStatus.CONNECTED));
				store.dispatch(setFullState(message));
				return;
			}
			if (message.command.startsWith("RuntimeAPI::")) {
				const apiCommand =
					RuntimeAPI[message.command.replace("RuntimeAPI::", "")];
				store.dispatch(apiCommand(message.arg));
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
			if (this.socket) {
				if (this.isConnected) {
					this.socket.close();
				} else {
					this.reconnect();
				}
			}
		};

		this.socket.onclose = () => {
			console.warn("WebSocket closed");
			store.dispatch(setConnected(WsStatus.DISCONNECTED));
			this.isConnected = false;
			this.socket = null;

			if (!this.manualClose) {
				this.reconnect();
			}
		};
	}

	disconnect() {
		this.isConnected = false;
		this.manualClose = true;

		if (this.retryTimeoutId !== null) {
			console.debug("Clearing retry timeout...");
			clearTimeout(this.retryTimeoutId);
			this.retryTimeoutId = null;
		}

		if (this.socket) {
			this.socket.close();
			this.socket = null;
		}
	}

	private reconnect() {
		if (this.retryTimeoutId !== null) return;

		// if (this.retryTimeoutId !== null) {
		// 	clearTimeout(this.retryTimeoutId);
		// }
		this.retryTimeoutId = setTimeout(() => {
			console.debug("Reconnecting...");
			this.connect(this.url);
		}, this.reconnectInterval);
	}

	sendMessage(message: string) {
		if (this.socket && this.isConnected) {
			this.socket.send(message);
		} else {
			console.error("Cannot send message. WebSocket is not connected.");
		}
	}

	sendJsonMessage(message: object) {
		this.sendMessage(JSON.stringify(message));
	}

	createDevice(deviceClass: string) {
		this.sendJsonMessage({
			command: "create_device",
			name: deviceClass,
		});
	}

	associateParameters(
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
			with_scaler: true,
		});
	}

	associate(srcParameterId: string, dstParameterId: string, unbind: boolean) {
		this.sendJsonMessage({
			command: "associate_parameters",
			from_parameter: srcParameterId,
			to_parameter: dstParameterId,
			unbind,
			with_scaler: true,
		});
	}

	createScaler(
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

	makeLinkBouncy(
		fromDevice: MidiDevice | VirtualDevice | number,
		fromParameter: MidiParameter | VirtualParameter,
		toDevice: MidiDevice | VirtualDevice | number,
		toParameter: MidiParameter | VirtualParameter,
		bouncy: boolean,
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
			command: "make_link_bouncy",
			from_parameter: `${srcId}::${fromParameter.section_name}::${fromP}`,
			to_parameter: `${dstId}::${toParameter.section_name}::${toP}`,
			bouncy,
		});
	}

	muteLink(
		fromDevice: MidiDevice | VirtualDevice | number,
		fromParameter: MidiParameter | VirtualParameter,
		toDevice: MidiDevice | VirtualDevice | number,
		toParameter: MidiParameter | VirtualParameter,
		muted: boolean,
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
			command: "mute_link",
			from_parameter: `${srcId}::${fromParameter.section_name}::${fromP}`,
			to_parameter: `${dstId}::${toParameter.section_name}::${toP}`,
			muted,
		});
	}

	associatePort(device: MidiDevice, port: string, direction: string) {
		this.sendJsonMessage({
			command: "associate_midi_port",
			device: device.id,
			port,
			direction,
		});
	}

	saveAll(name: string, saveDefaultValue = false) {
		this.sendJsonMessage({
			command: "save_all",
			name,
			save_defaultvalues: saveDefaultValue,
		});
	}

	saveAdress(address: string, saveDefaultValue = false) {
		this.sendJsonMessage({
			command: "save_address",
			address,
			save_defaultvalues: saveDefaultValue,
		});
	}

	loadAll(name: string) {
		this.sendJsonMessage({
			command: "load_all",
			name,
		});
	}

	loadAddress(address: string) {
		this.sendJsonMessage({
			command: "load_address",
			address,
		});
	}

	clearAddress(address: string) {
		this.sendJsonMessage({
			command: "clear_address",
			address,
		});
	}

	toggle_device(device: VirtualDevice, start = false) {
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

	setVirtualValue(
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

	setDeviceChannel(device: MidiDevice, channel: number) {
		this.sendJsonMessage({
			command: "set_device_channel",
			device_id: device.id,
			channel,
		});
	}

	setScalerValue(
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

	resetAll() {
		this.sendJsonMessage({
			command: "reset_all",
		});
	}

	pullFullState() {
		this.sendJsonMessage({
			command: "full_state",
		});
	}

	deleteAllConnections() {
		this.sendJsonMessage({
			command: "delete_all_connections",
		});
	}

	saveCode(code: string) {
		this.sendJsonMessage({
			command: "save_code",
			code,
		});
	}

	listPatches() {
		this.sendJsonMessage({
			command: "list_patches",
		});
	}

	randomPreset(device_id: number) {
		this.sendJsonMessage({
			command: "random_preset",
			device_id,
		});
	}

	killDevice(device_id: number) {
		this.sendJsonMessage({
			command: "kill_device",
			device_id,
		});
	}

	startCaptureSTDOUT(deviceOrLink: number | string | undefined = undefined) {
		this.sendJsonMessage({
			command: "start_capture_stdout",
			device_or_link: deviceOrLink,
		});
	}

	stopCaptureSTDOUT(deviceOrLink: number | string | undefined = undefined) {
		this.sendJsonMessage({
			command: "stop_capture_stdout",
			device_or_link: deviceOrLink,
		});
	}

	fetchClassCode(device_id: number) {
		this.sendJsonMessage({
			command: "fetch_class_code",
			device_id,
		});
	}

	compileInject(device_id: number, method_name, method_code) {
		this.sendJsonMessage({
			command: "compile_inject",
			device_id,
			method_name,
			method_code,
		});
	}

	setParameterValue(
		device_id: number,
		section_name: string,
		parameter_name: string,
		value: number,
	) {
		this.sendJsonMessage({
			command: "set_parameter_value",
			device_id,
			section_name,
			parameter_name,
			value,
		});
	}

	fetchPathInfos(filename: string) {
		this.sendJsonMessage({
			command: "fetch_path_infos",
			filename,
		});
	}

	getUsedAddresses() {
		this.sendJsonMessage({
			command: "get_used_addresses",
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
		console.debug("Already connected, disconnecting first...");
		websocket.disconnect();
		websocket = null;
	}

	console.debug("Create new Trevor websocket");
	websocket = new TrevorWebSocket(
		`${store.getState().general.trevorWebsocketURL}/trevor`,
	);

	unloadHandler = () => {
		websocket?.disconnect();
	};
	window.addEventListener("beforeunload", unloadHandler);
};

export const useTrevorWebSocket = () => {
	return websocket;
};
