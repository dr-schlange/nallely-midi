class NallelyService {
	constructor(
		kind,
		name,
		parameters,
		config,
		address = undefined,
		register = undefined,
	) {
		this.kind = kind;
		this.name = name;
		this.parameters = parameters;
		this.config = config;
		const params = new URLSearchParams(window.location.search);
		const nallelyId = params.get("nallelyId") || name;
		const nallelyOrigin = params.get("nallelyOrigin") || address;
		this.url = nallelyOrigin
			? `${nallelyOrigin}/${nallelyId}/autoconfig`
			: `ws://${window.location.hostname}:6789/${nallelyId}/autoconfig`;
		this.register = register;
		this._disposed = false;
		this.autoRegister();
	}

	autoRegister() {
		if (this._disposed) return;
		if (this.ws) {
			this.ws.removeEventListener("open", this._onOpen);
			this.ws.removeEventListener("close", this._onClose);
			this.ws.removeEventListener("error", this._onError);
			this.ws.removeEventListener("message", this._onMessage);
			if (
				this.ws.readyState === WebSocket.OPEN ||
				this.ws.readyState === WebSocket.CONNECTING
			) {
				this.ws.close();
			}
			this.ws = null;
		}

		// Clear any reconnection timeout
		if (this._reconnectTimeout) {
			clearTimeout(this._reconnectTimeout);
			this._reconnectTimeout = null;
		}

		const ws = new WebSocket(this.url);
		ws.binaryType = "arraybuffer";

		this._onOpen = () => {
			const data = Object.entries(this.parameters).map(([name, conf]) => {
				const entry = { name, range: [conf.min, conf.max] };
				if (conf.stream) entry.stream = true;
				return entry;
			});
			ws.send(
				JSON.stringify({
					kind: this.kind,
					parameters: data,
				}),
			);
			this.onopen?.(data);
		};

		this._onClose = (e) => {
			if (this._disposed) return;
			console.log(
				"Socket is closed. Reconnect will be attempted in few seconds.",
				e.reason,
			);
			this._reconnectTimeout = setTimeout(() => {
				this.autoRegister();
			}, 1000);
			this.onclose?.(e);
		};

		this._onError = (err) => {
			if (this._disposed) return;
			console.error(
				"Socket encountered error: ",
				err.message,
				"Closing socket",
			);
			this.onerror?.(err);
			if (
				ws &&
				(ws.readyState === WebSocket.OPEN ||
					ws.readyState === WebSocket.CONNECTING)
			) {
				ws.close();
			}
		};

		this._onMessage = (event) => {
			let message = {
				on: undefined,
				value: undefined,
			};
			const data = event.data;
			if (typeof event.data === "string") {
				message = JSON.parse(data);
			} else {
				const dv = new DataView(data);
				const len = dv.getUint8(0);
				const name = new TextDecoder().decode(new Uint8Array(data, 1, len));
				const val = dv.getFloat64(1 + len, false);
				message.on = name;
				message.value = val;
			}

			this.config[message.on] = message.value;
			this.onmessage?.(message);
		};

		ws.addEventListener("open", this._onOpen);
		ws.addEventListener("close", this._onClose);
		ws.addEventListener("error", this._onError);
		ws.addEventListener("message", this._onMessage);

		this.ws = ws;
	}

	send(parameter, value) {
		if (this.ws && this.ws.readyState === WebSocket.OPEN) {
			const data = this.buildFrame(parameter, value);
			this.onsend?.({ on: parameter, value });
			this.ws.send(data);
			return;
		}
		console.warn("WebSocket not open, cannot send:", parameter, value);
	}

	buildFrame(name, value) {
		const nameBytes = new TextEncoder().encode(name);
		const len = nameBytes.length;

		const buffer = new ArrayBuffer(1 + len + 8);
		const dv = new DataView(buffer);

		dv.setUint8(0, len);
		new Uint8Array(buffer, 1, len).set(nameBytes);
		dv.setFloat64(1 + len, value, false);

		return buffer;
	}

	dispose() {
		this._disposed = true;
		if (this._reconnectTimeout) {
			clearTimeout(this._reconnectTimeout);
			this._reconnectTimeout = null;
		}

		if (this.ws) {
			this.ws.removeEventListener("open", this._onOpen);
			this.ws.removeEventListener("close", this._onClose);
			this.ws.removeEventListener("error", this._onError);
			this.ws.removeEventListener("message", this._onMessage);
			if (
				this.ws.readyState === WebSocket.OPEN ||
				this.ws.readyState === WebSocket.CONNECTING
			) {
				this.ws.close();
			}
			this.ws = null;
		}
	}
}

class _NallelyWebsocketBus {
	constructor() {
		this.registered = {};
	}

	_buildUUID(kind, name) {
		return `${kind}::${name}`;
	}

	register(kind, name, parameters, config, address = undefined) {
		const service = new NallelyService(
			kind,
			name,
			parameters,
			config,
			address,
			this,
		);
		this.registered[this._buildUUID(kind, name)] = service;
		return service;
	}

	_insert(kind, name, ws) {
		this.registered[this._buildUUID(kind, name)] = ws;
	}

	send(kind, name, parameter, value) {
		this.registered[this._buildUUID(kind, name)].send(parameter, value);
	}
}

const NallelyWebsocketBus = new _NallelyWebsocketBus();
window.NallelyWebsocketBus = NallelyWebsocketBus;
