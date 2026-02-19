// Web Worker that manages WebSocket connections for all scope widgets.
// Batches incoming binary messages and flushes at ~60fps to reduce main-thread pressure.

interface ScopeEntry {
	ws: WebSocket | null;
	buffer: { on: string; value: number }[];
	url: string;
	kind: string;
	parameters: {
		name: string;
		range: [number | null, number | null];
		stream?: boolean;
	}[];
	disposed: boolean;
	reconnectTimeout: ReturnType<typeof setTimeout> | null;
}

const scopes = new Map<string, ScopeEntry>();

function decodeBinaryFrame(data: ArrayBuffer): { on: string; value: number } {
	const dv = new DataView(data);
	const len = dv.getUint8(0);
	const name = new TextDecoder().decode(new Uint8Array(data, 1, len));
	const val = dv.getFloat64(1 + len, false);
	return { on: name, value: val };
}

function connectScope(entry: ScopeEntry, scopeId: string) {
	if (entry.disposed) return;

	if (entry.ws) {
		entry.ws.close();
		entry.ws = null;
	}

	const ws = new WebSocket(entry.url);
	ws.binaryType = "arraybuffer";

	ws.addEventListener("open", () => {
		const paramData = entry.parameters.map((p) => {
			const e: any = { name: p.name, range: p.range };
			if (p.stream) e.stream = true;
			return e;
		});
		ws.send(JSON.stringify({ kind: entry.kind, parameters: paramData }));
		self.postMessage({ type: "open", scopeId });
	});

	ws.addEventListener("message", (event) => {
		if (typeof event.data === "string") {
			const msg = JSON.parse(event.data);
			entry.buffer.push({ on: msg.on, value: msg.value });
		} else {
			entry.buffer.push(decodeBinaryFrame(event.data));
		}
	});

	ws.addEventListener("close", () => {
		if (entry.disposed) return;
		entry.reconnectTimeout = setTimeout(() => {
			connectScope(entry, scopeId);
		}, 1000);
	});

	ws.addEventListener("error", () => {
		if (entry.disposed) return;
		self.postMessage({ type: "error", scopeId });
		if (
			ws.readyState === WebSocket.OPEN ||
			ws.readyState === WebSocket.CONNECTING
		) {
			ws.close();
		}
	});

	entry.ws = ws;
}

function disconnectScope(scopeId: string) {
	const entry = scopes.get(scopeId);
	if (!entry) return;

	entry.disposed = true;
	if (entry.reconnectTimeout) {
		clearTimeout(entry.reconnectTimeout);
		entry.reconnectTimeout = null;
	}
	if (entry.ws) {
		entry.ws.close();
		entry.ws = null;
	}
	scopes.delete(scopeId);
}

// Flush buffers at ~60fps
setInterval(() => {
	for (const [scopeId, entry] of scopes) {
		if (entry.buffer.length > 0) {
			self.postMessage({ type: "data", scopeId, messages: entry.buffer });
			entry.buffer = [];
		}
	}
}, 16);

self.onmessage = (event: MessageEvent) => {
	const msg = event.data;

	if (msg.type === "connect") {
		// Disconnect any existing scope with same id first
		if (scopes.has(msg.scopeId)) {
			disconnectScope(msg.scopeId);
		}

		const entry: ScopeEntry = {
			ws: null,
			buffer: [],
			url: msg.url,
			kind: msg.kind,
			parameters: msg.parameters,
			disposed: false,
			reconnectTimeout: null,
		};
		scopes.set(msg.scopeId, entry);
		connectScope(entry, msg.scopeId);
	} else if (msg.type === "disconnect") {
		disconnectScope(msg.scopeId);
	}
};
