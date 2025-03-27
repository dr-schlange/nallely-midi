from collections import defaultdict
from pyparsing import deque
from .core import Parameter, VirtualDevice, ThreadContext
import plotext as plt

# from PyQt6.QtWidgets import QApplication, QMainWindow, QVBoxLayout, QWidget
# from PyQt6.QtCore import QTimer
# import pyqtgraph as pg


class TerminalOscilloscope(VirtualDevice):
    data = Parameter("data", stream=True, consummer=True)

    def __init__(self, buffer_size=100, refresh_rate: float = 60):
        self.buffer_size = buffer_size
        # self.visu_data = deque([], maxlen=self.buffer_size)
        self.all = defaultdict(lambda: deque([], maxlen=self.buffer_size))
        # super().__init__(target_cycle_time=1 / refresh_rate)
        super().__init__()
        self.start()

    def consume_output(self, value, ctx: ThreadContext):
        if not self.running:
            return
        colors = ["red", "blue", "green", "orange"]
        t = ctx.get("t", 0)
        datakind = ctx.get("kind", "main")
        self.all[datakind].append(value)
        # self.visu_data.append(value)

        plt.clt()
        plt.cld()
        plt.theme("clear")
        plt.xticks([])
        plt.yticks([])
        # plt.title(f"value={value}")
        # plt.title(
        #     f"LFO {ctx.parent.waveform} speed={ctx.parent.speed} [{ctx.parent.min_value} - {ctx.parent.max_value}]"
        # )
        plt.scatter([0, 127], marker=" ")
        # plt.plot(self.visu_data, color="green")

        # threashold = 15
        # plt.plot([i for i, v in enumerate(self.visu_data) if v <= threashold], [v for v in self.visu_data if v <= threashold], color="green")
        # plt.plot([i for i, v in enumerate(self.visu_data) if v > threashold], [v for v in self.visu_data if v > threashold], color="red")

        # plt.plot(self.visu_data, color="red" if t < 0.25 else "blue")
        # plt.plot(self.visu_data, color="green")

        for kind, data in self.all.items():
            plt.plot(data, label=kind)
        # if t == 0:
        #     t = previous
        # previous = t
        plt.show()

    def reset(self):
        self.visu_data = deque([], maxlen=self.buffer_size)


# class Oscilloscope(VirtualDevice):
#     def __init__(self, buffer_size=100, refresh_rate: float = 60):
#         self.buffer_size = buffer_size
#         self.visu_data = deque([], maxlen=self.buffer_size)
#         self.app = QApplication.instance() or QApplication([])
#         self.win = QMainWindow()
#         self.plot_widget = pg.PlotWidget()
#         self.plot_widget.setYRange(0, 127)  # Match LFO range
#         self.plot_widget.setXRange(0, buffer_size)
#         self.plot_curve = self.plot_widget.plot(pen="g")  # Green line
#         layout = QVBoxLayout()
#         layout.addWidget(self.plot_widget)
#         central_widget = QWidget()
#         central_widget.setLayout(layout)
#         self.win.setCentralWidget(central_widget)
#         self.win.show()
#         super().__init__(target_cycle_time=1 / refresh_rate)

#     def consume_output(self, value, ctx: ThreadContext):
#         if not self.running:
#             return
#         self.visu_data.append(value)
#         self.plot_curve.setData(self.visu_data)

#     def stop(self, clear_queues: bool = True):
#         super().stop(clear_queues)
#         self.win.close()
