import re
import time
from shutil import ExecError

from behave import *  # type: ignore

import nallely

converter = {"LFO": {"frequency": "speed", "shape": "waveform"}}


def lookup(context, label):
    try:
        return context.devices[label]["instance"]
    except KeyError:
        raise ValueError(f"Device {label} is unknown")


def insert(context, label, device, converter=None):
    context.devices[label] = {
        "instance": device,
        "param_converter": converter,
    }


def find_parameter(device: nallely.VirtualDevice, parameter_name):
    try:
        return next((p for p in device.all_parameters() if p.name == parameter_name))
    except StopIteration:
        raise ValueError(f"Couldn't find parameter {parameter_name} for {device.uid()}")


@given("a {device_type} {label} with {param_string}")
@given("an {device_type} {label} with {param_string}")
def step_create_device_with_params(context, device_type, label, param_string):
    if not hasattr(context, "devices"):
        context.devices = {}

    params = parse_param_string(param_string)

    # Parameter renaming
    try:
        device_param_conversion_map = converter[device_type]
        for param in list(params.keys()):
            if param in device_param_conversion_map:
                converted = device_param_conversion_map[param]
                params[converted] = params.pop(param)
    except Exception:
        device_param_conversion_map = None

    try:
        device_cls = getattr(nallely, device_type)
    except Exception:
        raise ValueError(f"Unknown module type: {device_type}")

    try:
        device = device_cls(**params)
    except Exception:
        raise ValueError(f"Error while instanciating the device: {device_type}")

    insert(context, label, device, device_param_conversion_map)


def parse_param_string(param_string):
    """
    Parses a string like:
    'a "triangle" shape, a speed of 10Hz, and a phase of 0.4'
    into:
    {'shape': 'triangle', 'speed': 10.0, 'phase': 0.4}
    """
    # Normalize to simplify parsing
    param_string = param_string.strip()
    param_string = re.sub(r", and ", ", ", param_string)
    param_string = re.sub(r"\band\b", ",", param_string)

    parts = [p.strip() for p in param_string.split(",")]

    result = {}
    for part in parts:
        # Examples: 'a "triangle" shape', 'a speed of 10Hz', 'a phase of 0.4'
        string_match = re.match(r'a[n]?\s+"([^"]+)"\s+(\w+)', part)
        num_match = re.match(r"a[n]?\s+(\w+)\s+of\s+([\d\.]+)", part)

        if string_match:
            value, key = string_match.groups()
            result[key] = value
        elif num_match:
            key, value = num_match.groups()
            try:
                result[key] = float(value)
            except ValueError:
                raise ValueError(f"Could not parse numeric value for {key}: {value}")
        else:
            raise ValueError(f"Unrecognized parameter format: '{part}'")

    return result


@given("{label} is started")
def starts_device(context, label):
    device = lookup(context, label)
    device.start()


@given("{src_device}'s default output connected to {dst_device}'s {dst_parameter}")
def connect_default_output(context, src_device, dst_device, dst_parameter):
    src = lookup(context, src_device)
    dst = lookup(context, dst_device)

    dst_p = find_parameter(dst, dst_parameter)
    setattr(dst, f"{dst_p.cv_name}", src.scale(dst_p.range[0], dst_p.range[1]))


@given("{src_device}'s {src_parameter} connected to {dst_device}'s {dst_parameter}")
def connect_devices(context, src_device, src_parameter, dst_device, dst_parameter):
    src = lookup(context, src_device)
    dst = lookup(context, dst_device)

    dst_p = find_parameter(dst, dst_parameter)
    src_p = find_parameter(src, src_parameter)
    setattr(
        dst,
        f"{dst_p.cv_name}",
        getattr(src, f"{src_p.cv_name}").scale(dst_p.range[0], dst_p.range[1]),
    )


@when("around {ms}ms have passed")
def wait(context, ms):
    time.sleep(float(ms) / 1000)


@then("{device}'s {parameter} is {comparator} {value}")
def compare_value(context, device, parameter, comparator, value):
    dev = lookup(context, device)
    dev_value = getattr(dev, parameter)
    value = float(value)
    if comparator == "eq":
        assert dev_value == value
    elif comparator == "ne":
        assert dev_value != value
    elif comparator == "gt":
        assert dev_value > value
    elif comparator == "ge":
        assert dev_value >= value
    elif comparator == "lt":
        assert dev_value < value
    elif comparator == "le":
        assert dev_value <= value
