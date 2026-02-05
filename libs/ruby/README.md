# Nallely Ruby Connector

*LLM generated*

Ruby implementation of the Nallely external neuron connector and Trevor protocol client. Allows Ruby programs to register as neurons in a Nallely session, send and receive signal values, and control the session programmatically.

## Requirements

- Ruby 2.7 or higher
- WebSocket client library

## Installation

```bash
gem install websocket-client-simple
```

## Files

- `nallely_connector.rb` - External neuron connector (WebSocket Bus protocol)
- `trevor_client.rb` - Session control client (Trevor protocol)
- `example_full.rb` - Comprehensive integration example

## Quick Start

### 1. External Neuron (WebSocket Bus)

Register as an external neuron and participate in the reactive graph:

```ruby
require_relative 'nallely_connector'

# Create an external neuron with parameters
neuron = Nallely::ExternalNeuron.new(
  host: 'localhost',
  port: 6789,
  name: 'my_neuron',
  parameters: {
    'input' => { min: 0, max: 127 },
    'output' => { min: 0, max: 127 }
  }
)

# Handle incoming values
neuron.on_message do |param_name, value|
  puts "Received: #{param_name} = #{value}"

  # Process and send output
  if param_name == 'input'
    neuron.send_value('output', value * 0.5)
  end
end

# Connect and register
neuron.connect

# Send values
neuron.send_value('output', 42.0)

# Keep running
sleep
```

### 2. Session Control (Trevor Protocol)

Create devices, wire connections, set parameters:

```ruby
require_relative 'trevor_client'

# Connect to Trevor
trevor = Nallely::TrevorClient.new(host: 'localhost', port: 6788)
trevor.connect

# Create an LFO
state = trevor.create_device('LFO')
lfo = state['virtual_devices'].last
lfo_id = lfo['id']

# Configure it
trevor.set_virtual_value(lfo_id, 'waveform', 'sine')
trevor.set_virtual_value(lfo_id, 'speed', 2.0)
trevor.set_virtual_value(lfo_id, 'min_value', 0)
trevor.set_virtual_value(lfo_id, 'max_value', 127)

# Create a sequencer
state = trevor.create_device('Sequencer')
seq = state['virtual_devices'].last
seq_id = seq['id']

# Wire LFO output to Sequencer speed
from_param = trevor.virtual_param_path(lfo_id, 'output_cv')
to_param = trevor.virtual_param_path(seq_id, 'speed_cv')
trevor.associate_parameters(from_param, to_param, with_scaler: true)
```

### 3. Multi-Neuron Registry

Manage multiple external neurons from one program:

```ruby
require_relative 'nallely_connector'

# Create a bus with registry
bus = Nallely::WebSocketBus.new(host: 'localhost', port: 6789)

# Register multiple neurons
sensor = bus.register('sensor', {
  'temperature' => { min: -40, max: 60 },
  'humidity' => { min: 0, max: 100 }
})

controller = bus.register('controller', {
  'setpoint' => { min: 0, max: 100 },
  'output' => { min: 0, max: 127 }
})

# Send values through specific neurons
bus.send_value('sensor', 'temperature', 22.5)
bus.send_value('controller', 'output', 64)

# Access neurons directly
sensor.on_message { |param, value| puts "Sensor: #{param}=#{value}" }
controller.on_message { |param, value| puts "Controller: #{param}=#{value}" }
```

## API Reference

### ExternalNeuron

#### Constructor

```ruby
neuron = Nallely::ExternalNeuron.new(
  host: 'localhost',      # Nallely host
  port: 6789,             # WebSocket Bus port
  name: 'my_neuron',      # Neuron name (unique)
  parameters: {           # Parameter definitions
    'param1' => { min: 0, max: 127 },
    'param2' => { min: -1.0, max: 1.0 }
  }
)
```

#### Methods

- **`connect`** - Connect and register with the bus
- **`send_value(param_name, value)`** - Send a value to a parameter
- **`on_message { |param_name, value| ... }`** - Set callback for incoming values
- **`on_connect { ... }`** - Set callback for connection established
- **`on_disconnect { ... }`** - Set callback for disconnection
- **`disconnect`** - Disconnect cleanly
- **`unregister`** - Disconnect and remove from session

#### Attributes

- **`name`** - Neuron name
- **`parameters`** - Parameter definitions
- **`connected`** - Boolean connection status

### TrevorClient

#### Constructor

```ruby
trevor = Nallely::TrevorClient.new(
  host: 'localhost',  # Nallely host
  port: 6788          # Trevor protocol port
)
```

#### Device Management

- **`create_device(name)`** - Create a new device (returns updated state)
- **`kill_device(device_id)`** - Remove a device
- **`pause_device(device_id)`** - Pause a device
- **`resume_device(device_id)`** - Resume a paused device
- **`random_preset(device_id)`** - Randomize device parameters

#### Connection Management

```ruby
# Wire two parameters
associate_parameters(from_parameter, to_parameter, with_scaler: true)

# Unwire
disassociate_parameters(from_parameter, to_parameter)

# Scaler options:
# - true: auto-scale using declared ranges
# - false: pass raw values
# - { to_min: 0, to_max: 127, as_int: true }: custom range
```

#### Parameter Setting

```ruby
# Virtual device parameters
set_virtual_value(device_id, parameter, value)
# Use plain parameter name (e.g. "speed", not "speed_cv")

# MIDI device parameters
set_parameter_value(device_id, section_name, parameter_name, value)
# e.g. set_parameter_value(synth_id, "filter", "cutoff", 80)

# Scaler parameters
set_scaler_parameter(scaler_id, parameter, value)
```

#### Session Control

- **`full_state`** - Get complete session state
- **`reset_all`** - Clear all devices and connections
- **`unregister_service(service_name)`** - Unregister an external neuron
- **`force_note_off(device_id)`** - Kill stuck notes on MIDI device

#### Debug & Introspection

- **`get_class_code(device_id)`** - Fetch neuron source code
- **`start_capture_io(device_or_link: nil)`** - Enable debug mode
- **`stop_capture_io(device_or_link: nil)`** - Disable debug mode
- **`send_stdin(thread_id, text)`** - Send text to waiting thread

#### Helper Methods

```ruby
# Build parameter paths
virtual_param_path(device_id, cv_name)
# Returns: "123::__virtual__::output_cv"

midi_param_path(device_id, section, param)
# Returns: "456::filter::cutoff"

# Find devices
find_device_by_repr(repr)      # By display name (e.g. "LFO1")
find_device_by_id(device_id)   # By numeric ID
```

#### Attributes

- **`state`** - Current session state (updated after each command)
- **`connected`** - Boolean connection status

### WebSocketBus

Registry for managing multiple external neurons.

```ruby
bus = Nallely::WebSocketBus.new(host: 'localhost', port: 6789)

# Register a neuron
neuron = bus.register(name, parameters)

# Get a registered neuron
neuron = bus.get(name)

# Send through a registered neuron
bus.send_value(name, param_name, value)

# Cleanup
bus.disconnect_all   # Disconnect all neurons
bus.unregister_all   # Unregister all neurons
```

## Binary Frame Format

The WebSocket Bus uses a binary protocol for sending parameter values:

```
[1 byte: name_length (uint8)]
[N bytes: parameter_name (UTF-8)]
[8 bytes: value (float64, big-endian)]
```

This is handled automatically by `FrameCodec.encode/decode`.

## Parameter Naming

**Critical distinction:**

- **Plain name** (e.g. `"speed"`) - Used in:
  - Parameter definitions
  - `send_value()` calls
  - `set_virtual_value()` calls
  - Binary frames

- **CV name** (e.g. `"speed_cv"`) - Used in:
  - `associate_parameters()` calls
  - Parameter path construction
  - Internal wiring

Example:

```ruby
# Define with plain name
parameters: { 'speed' => { min: 0, max: 10 } }

# Send with plain name
neuron.send_value('speed', 5.0)

# Set with plain name
trevor.set_virtual_value(device_id, 'speed', 5.0)

# Wire with cv_name
trevor.virtual_param_path(device_id, 'speed_cv')
```

## Auto-Reconnect

External neurons automatically reconnect after disconnection. Registration is preserved across reconnects - the connector sends the registration JSON again but the session reuses existing parameters and connections.

To disable auto-reconnect:

```ruby
neuron = ExternalNeuron.new(...)
neuron.instance_variable_set(:@reconnect, false)
```

## Available Neuron Classes

When creating devices via `create_device(name)`, these classes are available:

### Generators
- **LFO** - Oscillator with multiple waveforms
- **Clock** - BPM-based clock with multiple divisions

### Sequencers
- **Sequencer** - 16-step sequencer
- **Sequencer8** - 8-step sequencer with edit capability
- **EuclidianSequencer** - Euclidean rhythm generator
- **TuringMachine** - Probabilistic shift register

### Math/Logic
- **Operator** - Math operations (+, -, *, /, mod, min, max, pow, clamp)
- **Comparator** - Comparison operations (=, >, <, etc.)
- **Logical** - Boolean logic (and, or, xor, not, etc.)
- **Bitwise** - Bitwise operations (and, or, xor, shift)

### Signal Processing
- **VCA** - Voltage controlled amplifier
- **Gate** - Signal gate
- **SampleHold** - Sample and hold
- **Mixer** - 4-channel mixer
- **Crossfade** - Dual crossfader
- **MultiPoleFilter** - Lowpass/highpass/bandpass filter
- **Waveshaper** - Various waveshaping modes
- **ADSREnvelope** - ADSR envelope generator
- **EnvelopeSlew** - Envelope follower / slew limiter

### Routing/Switching
- **Switch** - Route input to one of N outputs
- **SeqSwitch** - Sequential switch
- **Multiplexer** - 8-to-1 selector
- **Demultiplexer** - 1-to-8 selector
- **ShiftRegister** - 8-stage shift register
- And many more...

### Pitch/Harmony
- **PitchShifter** - Transpose notes
- **Quantizer** - Snap to scale
- **ChordGenerator** - Generate chords from root note
- **Harmonizer** - Harmonize in scale
- **Arpegiator** - Arpeggiate held notes
- **Looper** - Record and playback sequences
- **VoiceAllocator** - Distribute notes across voices

See the system prompt document for complete list and parameter details.

## Common Patterns

### 1. Monitor with Probes

Create an external neuron with multiple probe inputs to observe values in the graph:

```ruby
monitor = ExternalNeuron.new(
  name: 'monitor',
  parameters: (1..8).to_h { |i| ["mon#{i}", { min: 0, max: 127 }] }
)

monitor.on_message do |param, value|
  puts "[#{param}] #{value.round(2)}"
end

monitor.connect

# Wire neurons to probes via Trevor
trevor.associate_parameters(
  lfo_output_path,
  trevor.virtual_param_path(monitor_id, 'mon1_cv'),
  with_scaler: false
)
```

### 2. Bidirectional Control

External neuron that both receives values and sends control signals:

```ruby
controller = ExternalNeuron.new(
  name: 'controller',
  parameters: {
    'feedback' => { min: 0, max: 127 },
    'control_out' => { min: 0, max: 127 }
  }
)

controller.on_message do |param, value|
  if param == 'feedback'
    # Compute response based on feedback
    response = compute_control_value(value)
    controller.send_value('control_out', response)
  end
end
```

### 3. Custom Scaler Ranges

For neurons with `range=(None, None)` outputs (Operator, Bitwise, Comparator):

```ruby
# These neurons bypass auto-scaling, so use custom scaler ranges
trevor.associate_parameters(
  operator_output_path,
  destination_path,
  with_scaler: { to_min: 0, to_max: 127, as_int: false }
)
```

### 4. Note Handling

Notes sustain until you send 0. For same-note retriggering, insert a brief gap:

```ruby
# Send note on
neuron.send_value('note', 60)
sleep 0.5

# Retrigger same note - needs 0 gap
neuron.send_value('note', 0)
sleep 0.05
neuron.send_value('note', 60)
```

## Testing

Run the examples:

```bash
# Test basic external neuron
ruby nallely_connector.rb

# Test Trevor protocol
ruby trevor_client.rb

# Run comprehensive integration example
ruby example_full.rb
```

## Troubleshooting

**Connection refused**: Ensure Nallely is running on the specified host/port.

**External neuron not appearing**: Check that registration JSON is sent immediately after WebSocket connection opens.

**Values not propagating**: Verify wiring with `trevor.full_state` - check the `connections` array.

**Auto-scaling issues**: Use custom scaler ranges for parameters with `range=(None, None)`.

**Same note won't retrigger**: Insert a 0 value with ~50ms gap between note-on events.

## License

This implementation follows the Nallely project structure and protocols. Refer to the main Nallely project for licensing information.

## References

- Nallely documentation: See system prompt and porting guide
- Reference implementations: JavaScript (`libs/js/nallely-websocket.js`), Python (`libs/python/`)
- Trevor UI source: `trevor/src/websockets/`
