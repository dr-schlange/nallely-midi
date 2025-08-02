
class NallelyService {
    constructor(kind, name, parameters, config, url = undefined, register = undefined) {
        this.kind = kind
        this.name = name
        this.parameters = parameters
        this.config = config
        this.url = url || `ws://${window.location.hostname}:6789/${name}/autoconfig`
        this.register = register
        this.autoRegister()
    }

    autoRegister() {
        const ws = new WebSocket(this.url)
        ws.addEventListener('open', () => {
            ws.send(JSON.stringify({
                kind: this.kind,
                parameters: Object.entries(this.parameters).map(([name, conf]) => { return { name, range: [conf.min, conf.max] } })
            }))
            this.onopen?.()
        })

        ws.addEventListener('close', (e) => {
            console.log('Socket is closed. Reconnect will be attempted in 1 second.', e.reason);
            setTimeout(() => {
                this.autoRegister();
            }, 1000);
            this.onclose?.()
        })

        ws.addEventListener('error', (err) => {
            console.error('Socket encountered error: ', err.message, 'Closing socket');
            this.onerror?.()
            if (ws) {
                ws.close();
            }
            setTimeout(() => {
                this.autoRegister();
            }, 1000);
        })

        ws.addEventListener('message', (event) => {
            const data = JSON.parse(event.data);
            this.config[data.on] = data.value
            this.onmessage?.(data)
        })
        this.ws = ws
    }

    send(parameter, value) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({ on: parameter, value }));
            return
        }
        console.warn('WebSocket not open, cannot send:', parameter, value);
    }
}

class _NallelyWebsocketBus {
    constructor() {
        this.registered = {}
    }

    _buildUUID(kind, name) {
        return `${kind}::${name}`
    }

    register(kind, name, parameters, config, url = undefined) {
        const service = new NallelyService(kind, name, parameters, config, url, this)
        this.registered[this._buildUUID(kind, name)] = service
        return service
    }

    _insert(kind, name, ws) {
        this.registered[this._buildUUID(kind, name)] = ws
    }

    send(kind, name, parameter, value) {
        this.registered[this._buildUUID(kind, name)].send(parameter, value)
    }
}

const NallelyWebsocketBus = new _NallelyWebsocketBus()
window.NallelyWebsocketBus = NallelyWebsocketBus