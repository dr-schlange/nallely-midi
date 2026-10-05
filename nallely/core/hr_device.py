import struct
import time
from queue import Empty, Full, Queue

import serial
from serial.tools import list_ports

from ..utils import getlogger
from .midi_device import MidiDevice

logger = getlogger("HR")


HELLO = b"HR01"
READY = b"RDY1"
BAUDRATE = 115200


def find_hr_device(manufacturer, device):
    candidates = []

    for port in list_ports.comports():
        if port.manufacturer == manufacturer and device in port.product:
            candidates.append(port)

    if not candidates:
        return None, None

    devices = [c.device for c in candidates]
    logger.info(f"Candidates found for connection: {devices}")
    for candidate in candidates:
        try:
            logger.info(f"{candidate.device} - initiating handshake")
            ser = serial.Serial(candidate.device, BAUDRATE, timeout=1)

            ser.dtr = False
            logger.info(f"{candidate.device} - set DTR to {ser.dtr}")
            time.sleep(0.15)
            ser.dtr = True

            logger.info(f"{candidate.device} - set DTR to {ser.dtr}")
            ser.reset_input_buffer()
            logger.info(f"{candidate.device} - send {HELLO}")
            ser.write(HELLO)
            ser.flush()

            logger.info(f"{candidate.device} - wait for {READY}")
            reply = ser.read(len(READY))
            if reply != READY:
                logger.info(f"{candidate.device} - no {READY} received")
                continue
            logger.info(f"{candidate.device} - FOUND and connected")
            return ser, candidate
        except Exception:
            logger.error(
                f"{candidate.device} - error while trying to connect or interact with the device"
            )

    logger.info(f"No candidate answered to the handshake {devices}")
    return None, None


class HRDevice(MidiDevice):
    def __post_init__(self, *args, **kwargs):
        self.outport_hr = None
        self.hr_queue = Queue(maxsize=BAUDRATE * 10)
        super().__post_init__(*args, **kwargs)
        self._retry_input = False
        self._retry_output = False

    def control_change_hr(self, control, value=0, channel=None, range=(-1, 1)):
        minrange, maxrange = range
        if value < minrange:
            value = minrange
        elif value > maxrange:
            value = maxrange
        value = self._encode_value(value, minrange, maxrange)
        flags = 0b01 if minrange < 0 else 0b00
        self._enqueue_msg(control, value, flags)

    def pitchwheel_hr(self, value, channel=0):
        if value < -1:
            value = -1
        elif value > 1:
            value = 1
        # pitchwheel equivalent is currently always bipolar
        value = self._encode_value(value, -1, 1)
        flags = 0b11
        self._enqueue_msg(channel, value, flags)

    def _encode_value(self, value, range_min, range_max):
        normalized = (value - range_min) / (range_max - range_min)
        return round(normalized * 65535)

    def _enqueue_msg(self, cc, value, flags):
        try:
            self.hr_queue.put_nowait((cc, value, flags))
        except Full:
            logger.warning(
                f"Warning: input_queue full for {self.uid()} — dropping message {cc}{value}{flags}"
            )

    def connect(self):
        super().connect()
        self.connect_hr()

    def connect_hr(self):
        self.outport_hr, _ = find_hr_device(self.manufacturer, self.orig_name)

    def close_out(self):
        try:
            super().close_out()
        except Exception:
            logger.error(f"Error while closing {self.uid()}")
        if self.outport_hr is not None:
            self.outport_hr.close()
            self.outport_hr = None
        queue = self.hr_queue
        while not queue.empty():
            try:
                queue.get_nowait()
                queue.task_done()
            except Empty:
                break

    def reconnect_output(self, *args, **kwargs):
        res = super().reconnect_output(*args, **kwargs)
        self.connect_hr()
        if self.outport_hr is None:
            logger.error(f"Couldn't reconnect the HR device {self.name}")
            self._retry_output = True
            return False
        self._retry_output = False
        logger.error(f"HR device {self.name} reconnected")
        return res

    def run(self):
        import time

        max_frame_size = 255
        msg_size = 4  # 4bytes per msg
        queue = self.hr_queue
        frame = bytearray(255 * msg_size + 1)
        frame_view = memoryview(frame)
        timing = 1 / 1000
        pack_into = struct.pack_into
        while self._running:
            count = 0
            start = 1
            for _ in range(max_frame_size):
                try:
                    pack_into("<BHB", frame, start, *queue.get_nowait())
                    count += 1
                    start += msg_size
                except Empty:
                    break
            out = self.outport_hr
            if out and count > 0:
                try:
                    frame[0] = count
                    out.write(frame_view[: count * msg_size + 1])
                    out.flush()
                except serial.SerialTimeoutException as e:
                    logger.error(f"Got timeout exception {e}")
                    try:
                        out.close()
                        self.outport_hr = None
                    finally:
                        self._retry_output = True
                except serial.SerialException as e:
                    logger.error(f"Got a serial exception {e}")
                    try:
                        out.close()
                        self.outport_hr = None
                    finally:
                        self._retry_output = True
                        self.connect_hr()

            time.sleep(timing)
