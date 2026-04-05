import json
import math
from collections import defaultdict

from pythonosc.dispatcher import Dispatcher
from pythonosc.osc_server import ThreadingOSCUDPServer
from pythonosc.udp_client import SimpleUDPClient

from .core.virtual_device import VirtualDevice, VirtualParameter
from .core.world import ThreadContext, no_registration
from .websocket_bus import WebSocketBus

# We monkey patch to make it polymorphic at the moment
# that's not the best, but that's ok right now.
SimpleUDPClient.close = lambda self: ...  # type: ignore


@no_registration
class OSCBus(WebSocketBus):
    NAME = "OSC"

    def __init__(
        self, host="0.0.0.0", port=6787, server_type=ThreadingOSCUDPServer, **kwargs
    ):
        self.forever = False  # Required to be explicit as we override __setattr__ to create waiting rooms on missing attributes
        self.dispatcher = SelfRegisterDispatcher(self)
        self.server = server_type(
            server_address=(host, port), dispatcher=self.dispatcher
        )
        self.known_services = {}
        self.connected = defaultdict(list)
        self.to_update = None
        VirtualDevice.__init__(
            self, target_cycle_time=10, disable_output=True, **kwargs
        )

    def stop(self, clear_queues=False):
        self.connected.clear()
        if self.running and self.server:
            print(f"[{self.NAME}] Shutting down osc bus...", end="\t")
            self.server.server_close()
            self.server = None
            print("Done")
        for key, value in list(self.__class__.__dict__.items()):
            if isinstance(value, VirtualParameter):
                delattr(self.__class__, key)
        VirtualDevice.stop(self, clear_queues)

    def receiving(self, value, on, ctx: ThreadContext):
        if math.isnan(value):
            import sys

            value = sys.float_info.min
        device, *parameter = on.split("_")
        parameter = "_".join(parameter)

        setattr(self, parameter, value)

        for client in self.connected[device]:
            address = f"/{device}/{parameter}"
            client.send_message(address, value)

    def unregister_service(self, service_name, _from_dispatcher=False):
        if service_name not in self.known_services:
            return
        self.dispatcher.unregister_service(service_name)
        self.dispatcher.clean_dynamic_routes(
            service_name, from_dispatcher=_from_dispatcher
        )
        clients = self.connected[service_name]
        super().unregister_service(service_name)
        for client in clients:
            address = f"/{service_name}/unregister"
            client.send_message(address, 0)


class SelfRegisterDispatcher(Dispatcher):
    def __init__(self, server: OSCBus):
        super().__init__()
        self.server = server
        self.set_default_handler(self.does_not_understand, needs_reply_address=True)

    def register_service(self, client_address, address, str_config: str):
        if not isinstance(str_config, str):
            print(
                f"[{self.server.NAME}] Autoconfig parameter should be a JSON string, but is {str_config}, type={type(str_config)}"
            )
            return
        service_name, *_ = address[1:].split("/")
        print(f"[{self.server.NAME}] Autoconfig for {service_name}")

        config = json.loads(str_config)
        parameters = config.get("parameters")
        if not parameters:
            print(
                f"[{self.server.NAME}] Cannot register {service_name} no parameter passed"
            )
            return

        if service_name not in self.server.known_services:
            self.map(f"/{service_name}/*", self.receive_value, needs_reply_address=True)
            self.server.configure_remote_device(service_name, parameters=parameters)
        else:
            self.server.add_ports_to_remote_device(service_name, parameters=parameters)

        sender_server_port = config.get("callback_port")
        if sender_server_port is None:
            return

        sender_server_host, _ = client_address
        self.server.connected[service_name].append(
            SimpleUDPClient(sender_server_host, sender_server_port)
        )

    def add_parameters(self, client_address, address, str_config: str):
        if not isinstance(str_config, str):
            print(
                f"[{self.server.NAME}] Autoconfig parameter should be a JSON string, but is {str_config}, type={type(str_config)}"
            )
            return

        service_name, *_ = address[1:].split("/")
        print(f"[{self.server.NAME}] Autoconfig add parameters for {service_name}")

        config = json.loads(str_config)
        parameters = config.get("parameters")
        if not parameters:
            print(
                f"[{self.server.NAME}] Cannot register new parameters {service_name} no parameter passed"
            )
            return
        self.server.add_ports_to_remote_device(service_name, parameters=parameters)

    def remove_parameters(self, client_address, address, str_config: str):
        if not isinstance(str_config, str):
            print(f"[{self.server.NAME}] Autoconfig parameter should be a JSON string")
            return

        service_name, *_ = address[1:].split("/")
        print(f"[{self.server.NAME}] Autoconfig add parameters for {service_name}")

        config = json.loads(str_config)
        parameters = config.get("parameters")
        if not parameters:
            print(
                f"[{self.server.NAME}] Cannot remove parameters {service_name} no parameter passed"
            )
            return
        self.server.remove_ports_to_remote_device(service_name, parameters=parameters)

    def unregister(self, client_address, address, _):
        service_name, *_ = address[1:].split("/")
        self.server.unregister_service(service_name, _from_dispatcher=True)

    def unregister_service(self, service_name):
        # We do it manually, unmap is not practical to use unmap in our case, we want to unmap all handlers
        self._map[f"/{service_name}/autoconfig"].clear()
        self._map[f"/{service_name}/unregister"].clear()
        self._map[f"/{service_name}/autoconfig/add_parameters"].clear()
        self._map[f"/{service_name}/autoconfig/remove_parameters"].clear()
        self._map[f"/{service_name}/*"].clear()

    def receive_value(self, client_address, address, value: float | str):
        if (
            address.endswith("/unregister")
            or address.endswith("/autoconfig")
            or address.endswith("/autoconfig/add_parameters")
            or address.endswith("/autoconfig/remove_parameters")
        ):
            return
        service_name, *parameter = address[1:].split("/")
        if len(parameter) != 1:
            print(
                f"[{self.server.NAME}] {service_name} received information on an unsupported channel format {parameter}"
            )
            return
        parameter = parameter[0]
        parameter_name = f"{service_name}_{parameter}"
        cv_name = f"{parameter_name}_cv"

        output = getattr(self.server, cv_name, None)
        if output is None:
            print(
                f"[{self.server.NAME}] {service_name} does not understand {parameter}"
            )
            return
        setattr(self, parameter_name, value)
        self.server.send_out(
            value,
            ThreadContext({"last_values": {}}),
            selected_outputs=[output],
        )

    def does_not_understand(self, client_address, address, *args):
        # Interesting enough, we cannot register new routes in a callback
        # the only possibility to add dynamically routes is to add them
        # in the default route, as this is the only one that is not part of
        # "_map" in python-osc.
        if address.endswith("/autoconfig") and args:
            service_name, *_ = address[1:].split("/")
            self.map(
                f"/{service_name}/autoconfig",
                self.register_service,
                needs_reply_address=True,
            )
            self.map(
                f"/{service_name}/unregister",
                self.unregister,
                needs_reply_address=True,
            )
            self.map(
                f"/{service_name}/autoconfig/add_parameters",
                self.add_parameters,
                needs_reply_address=True,
            )
            self.map(
                f"/{service_name}/autoconfig/remove_parameters",
                self.remove_parameters,
                needs_reply_address=True,
            )
            self.register_service(client_address, address, args[0])
            return
        print(f"[{self.server.NAME}] Does not understand {address}: {args}")

    def handlers_for_address(self, address_pattern: str):
        yield from super().handlers_for_address(address_pattern)
        if address_pattern.endswith("/unregister"):
            service_name, *_ = address_pattern[1:].split("/")
            self.clean_dynamic_routes(service_name, False)

    def clean_dynamic_routes(self, service_name, from_dispatcher=True):
        if from_dispatcher is True:
            return
        try:
            del self._map[f"/{service_name}/autoconfig"]
            del self._map[f"/{service_name}/unregister"]
            del self._map[f"/{service_name}/autoconfig/add_parameters"]
            del self._map[f"/{service_name}/autoconfig/remove_parameters"]
            del self._map[f"/{service_name}/*"]
        except Exception:
            pass
