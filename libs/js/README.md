# Javascript/Typescript library for external devices

This folder contains a small library to help interface Javascript/Typescript external devices with Nallely's Websocket bus. To illustrate the use of the library, `example.hml` is a small demo page that includes the library, register the page as an external device (can be multiple by page) that can receive and send information.

## Run the demo external device

To see the demo external device, you need to have first a Nallely session running with a `WebsocketBus` instance. The simplest way to do this is to create the session and to serve TrevorUI to create the websocket bus:

1. Start Nallely session with the UI and the builtins: `nallely run --with-trevor --serve-ui -b` ;
2. Navigate to `http://localhost:3000` to open the UI;
3. Create an instance of the `WebsocketBus` virtual device;
4. Open the demo external device in another tab/browser.

At this point, the external device defined in the demo should be registered to the `WebsocketBus` instance. You can then patch it as you want, using an LFO to send information to the device, or send information from the external device to other virtual device or MIDI devices inside your Nallely session.


## How to use the library

The library is pure vanilla JS to connect and pre-configure few points that are related to the protocol of the WebsocketBus. To include it in your page, you just have to include it as script. For example, here in an HTML page:

```html
<script src="https://cdn.jsdelivr.net/gh/dr-schlange/nallely-midi@main/libs/js/nallely-websocket.js"></script>
```

The library is not deployed on npm, so you can use `jsdelivr` to have a version served from this repository (here pointing on `main`).

Once the library is included, you can register external devices using:

```js
const device = NallelyWebsocketBus.register(kind: string, name: string, parameters: Record<string, {min: number, max: number}>, Record<string, number>);
```

Where:

* `kind` is a name of "category" for the device. This field is not yet used, but it's recommended to sort well your devices (e.g: `visual`, or `effect` or `sensor`, ...)
* `name` is the name of the device. Due to the way the information is then presented in the interface, it's better to take a short name.
* `parameters` is the meta-description of the paramters that will be exposed on the Websocket bus. It's a JS object where the key is the name of the parameter, and the value is the accepted range for the paramter, e.g:
```js
{
    param1: {min: 0, max: 50},
    param2: {min: -10, max: 30}
}
```
* `config` is an object where all the received values for paramters will be updated. This object has to be mutable (obviously) and shared by all the parts of the code that requires to have the values updated. This object needs to have, at least, the keys of the `parameters` object (it can have more, but at least those ones).


That's pretty much it for a basic usage. The `config` object will be updated automatically when messages will handled by the registerd device.

If you want to have a little bit more control, e.g: to be notified when a message arrives, you can add functions to the `onopen`, `onerror`, `onclose`, `onsend`, and `onmessage` registered service. For example, to be notified when messages arrived:

```js
service.onmessage = (data) => {
    console.log("Message received", data)
}
```

Among the different functions:

* `onopen(data)` is called when the websocket connection opens and after the registration message is sent to the Websocket bus (`data` is the parameter data transmitted for registration);
* `onerror(e)` is called when the websocket connection has an error (`e` is an `Event` which gives information about the error);
* `onclose(e)` is called when the websocket connection is closed (`e` is a `CloseEvent` which gives information about why the websocket closed);
* `onmessage(data)` is called when a message is received from the websocket server (`data` is the data received: property name, and value);
* `onsend(data)` is called when a message is about to be sent (`data` is the data that will be transmitted).