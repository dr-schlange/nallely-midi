import asyncio
import json
import sys
import websockets
import plotext as plt
from collections import defaultdict, deque

if len(sys.argv) < 2:
    print("Missing to which device to connect on localhost")
    print("Considering 'scope' as target device")
    target_device = "scope"
else:
    target_device = sys.argv[1]

plt.clf()
plt.xlim(0, 100)
plt.ylim(0, 127)

# Stores the data for the curve (depending on the receiving channel)
data = defaultdict(lambda: deque(maxlen=100))


async def websocket_handler():
    uri = f"ws://localhost:6789/{target_device}/autoconfig"
    async with websockets.connect(uri) as websocket:
        # Auto configure the module as first message after the connection
        await websocket.send(
            json.dumps(
                {
                    "kind": "consummer",  # this entry is purely for decoration atm
                    "parameters": [
                        {"name": "data", "stream": True},
                        {"name": "data2", "stream": True},
                    ],
                }
            )
        )
        while True:
            try:
                message = await websocket.recv()
                msg = json.loads(message)
                on = msg["on"]
                value = float(msg["value"])
                data[on].append(value)

                plt.clf()
                plt.cld()
                plt.theme("dark")
                plt.xticks([])
                plt.yticks([])
                plt.scatter([0, 127], marker=" ")
                # plt.scatter([0, 2], marker=" ")
                plt.title(f"Receiving from {msg['sender']} [{value}]")
                for channel, channel_data in data.items():
                    plt.plot(channel_data, label=channel)
                plt.show()

            except Exception as e:
                print(f"Error: {e}")
                break


async def main():
    await websocket_handler()


if __name__ == "__main__":
    asyncio.run(main())
