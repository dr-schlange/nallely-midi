#!/usr/bin/env ruby
# frozen_string_literal: true
# *LLM generated*

require 'websocket-client-simple'
require 'json'

module Nallely
  # Trevor protocol client for Nallely session control
  class TrevorClient
    attr_reader :state, :connected

    def initialize(host: 'localhost', port: 6788)
      @host = host
      @port = port
      @ws = nil
      @connected = false
      @state = nil
      @response_queue = []
      @mutex = Mutex.new
      @cv = ConditionVariable.new
    end

    # Connect to the Trevor protocol endpoint
    def connect
      url = "ws://#{@host}:#{@port}/trevor"

      @ws = WebSocket::Client::Simple.connect(url)

      # Store reference to self
      trevor_self = self

      @ws.on :open do
        trevor_self.instance_variable_set(:@connected, true)
        puts "Connected to Trevor protocol"
      end

      @ws.on :message do |msg|
        trevor_self.send(:handle_message, msg)
      end

      @ws.on :close do |e|
        trevor_self.instance_variable_set(:@connected, false)
        puts "Trevor disconnected: #{e}"
      end

      @ws.on :error do |e|
        puts "Trevor error: #{e}"
      end

      # Wait for initial state
      wait_for_message
      self
    end


    # Send a command and wait for response
    #
    # @param command [Hash] flat JSON command
    # @return [Hash] updated session state (or special response for some commands)
    def send_command(command)
      raise "Not connected" unless @connected

      @ws.send(command.to_json)
      wait_for_message
    end

    # Get full session state
    #
    # @return [Hash] current state
    def full_state
      send_command({ command: 'full_state' })
    end

    # Create a new device
    #
    # @param name [String] device class name (e.g. "LFO", "Sequencer", "Amsynth")
    # @return [Hash] updated state
    def create_device(name)
      send_command({ command: 'create_device', name: name })
    end

    # Kill a device by ID
    #
    # @param device_id [Integer] device ID
    # @return [Hash] updated state
    def kill_device(device_id)
      send_command({ command: 'kill_device', device_id: device_id })
    end

    # Wire two parameters together (create a connection)
    #
    # @param from_parameter [String] source parameter path (e.g. "123::__virtual__::output_cv")
    # @param to_parameter [String] destination parameter path
    # @param with_scaler [Boolean, Hash] scaler config (true=auto, false=none, Hash=custom)
    # @return [Hash] updated state
    def associate_parameters(from_parameter, to_parameter, with_scaler: true)
      send_command({
        command: 'associate_parameters',
        from_parameter: from_parameter,
        to_parameter: to_parameter,
        unbind: false,
        with_scaler: with_scaler
      })
    end

    # Unwire parameters (remove a connection)
    #
    # @param from_parameter [String] source parameter path
    # @param to_parameter [String] destination parameter path
    # @return [Hash] updated state
    def disassociate_parameters(from_parameter, to_parameter)
      send_command({
        command: 'associate_parameters',
        from_parameter: from_parameter,
        to_parameter: to_parameter,
        unbind: true
      })
    end

    # Set a virtual device parameter value
    #
    # @param device_id [Integer] device ID
    # @param parameter [String] plain parameter name (e.g. "speed", not "speed_cv")
    # @param value [Numeric, String] value to set
    # @return [Hash] updated state
    def set_virtual_value(device_id, parameter, value)
      send_command({
        command: 'set_virtual_value',
        device_id: device_id,
        parameter: parameter,
        value: value
      })
    end

    # Set a MIDI device parameter value
    #
    # @param device_id [Integer] device ID
    # @param section_name [String] section name (e.g. "filter", "amp", "oscillators")
    # @param parameter_name [String] parameter name
    # @param value [Numeric] value to set
    # @return [Hash] updated state
    def set_parameter_value(device_id, section_name, parameter_name, value)
      send_command({
        command: 'set_parameter_value',
        device_id: device_id,
        section_name: section_name,
        parameter_name: parameter_name,
        value: value
      })
    end

    # Modify an existing scaler's parameters
    #
    # @param scaler_id [Integer] scaler ID from connections list
    # @param parameter [String] scaler parameter to change
    # @param value [Numeric] new value
    # @return [Hash] updated state
    def set_scaler_parameter(scaler_id, parameter, value)
      send_command({
        command: 'set_scaler_parameter',
        scaler_id: scaler_id,
        parameter: parameter,
        value: value
      })
    end

    # Reset the entire session (clear all devices and connections)
    #
    # @return [Hash] updated state
    def reset_all
      send_command({ command: 'reset_all' })
    end

    # Randomize device parameters
    #
    # @param device_id [Integer] device ID
    # @return [Hash] updated state
    def random_preset(device_id)
      send_command({ command: 'random_preset', device_id: device_id })
    end

    # Pause a device
    #
    # @param device_id [Integer] device ID
    # @return [Hash] updated state
    def pause_device(device_id)
      send_command({ command: 'pause_device', device_id: device_id })
    end

    # Resume a paused device
    #
    # @param device_id [Integer] device ID
    # @return [Hash] updated state
    def resume_device(device_id)
      send_command({ command: 'resume_device', device_id: device_id })
    end

    # Force all stuck notes off on a MIDI device
    #
    # @param device_id [Integer] device ID
    # @return [Hash] updated state
    def force_note_off(device_id)
      send_command({ command: 'force_note_off', device_id: device_id })
    end

    # Unregister an external neuron service
    #
    # @param service_name [String] service name (e.g. "ruby_test")
    # @return [Hash] updated state
    def unregister_service(service_name)
      send_command({ command: 'unregister_service', service_name: service_name })
    end

    # Get source code for a neuron class
    #
    # @param device_id [Integer] device ID
    # @return [Hash] response with className, classCode, methods
    def get_class_code(device_id)
      send_command({ command: 'get_class_code', device_id: device_id })
    end

    # Start capturing I/O (stdout/stderr/stdin) to WebSocket
    #
    # @param device_or_link [Integer, nil] optional device/link ID for debug mode
    # @return [Hash] updated state
    def start_capture_io(device_or_link: nil)
      cmd = { command: 'start_capture_io' }
      cmd[:device_or_link] = device_or_link if device_or_link
      send_command(cmd)
    end

    # Stop capturing I/O
    #
    # @param device_or_link [Integer, nil] optional device/link ID for debug mode
    # @return [Hash] updated state
    def stop_capture_io(device_or_link: nil)
      cmd = { command: 'stop_capture_io' }
      cmd[:device_or_link] = device_or_link if device_or_link
      send_command(cmd)
    end

    # Send text to stdin for a thread waiting on input()
    #
    # @param thread_id [Integer] thread ID
    # @param text [String] text to send
    # @return [Hash] updated state
    def send_stdin(thread_id, text)
      send_command({
        command: 'send_stdin',
        thread_id: thread_id,
        text: text
      })
    end

    # Disconnect from Trevor
    def disconnect
      @ws&.close
      @connected = false
    end

    # Helper: Find device by repr (display name)
    #
    # @param repr [String] device repr (e.g. "LFO1", "Amsynth2")
    # @return [Hash, nil] device object or nil
    def find_device_by_repr(repr)
      return nil unless @state

      @state['virtual_devices']&.find { |d| d['repr'] == repr } ||
        @state['midi_devices']&.find { |d| d['repr'] == repr }
    end

    # Helper: Find device by ID
    #
    # @param device_id [Integer] device ID
    # @return [Hash, nil] device object or nil
    def find_device_by_id(device_id)
      return nil unless @state

      @state['virtual_devices']&.find { |d| d['id'] == device_id } ||
        @state['midi_devices']&.find { |d| d['id'] == device_id }
    end

    # Helper: Build parameter path for virtual device
    #
    # @param device_id [Integer] device ID
    # @param cv_name [String] cv_name for wiring (e.g. "output_cv")
    # @return [String] parameter path
    def virtual_param_path(device_id, cv_name)
      "#{device_id}::__virtual__::#{cv_name}"
    end

    # Helper: Build parameter path for MIDI device
    #
    # @param device_id [Integer] device ID
    # @param section [String] section name
    # @param param [String] parameter name
    # @return [String] parameter path
    def midi_param_path(device_id, section, param)
      "#{device_id}::#{section}::#{param}"
    end

    private

    # Handle incoming WebSocket message
    def handle_message(msg)
      return unless msg.type == :text

      data = JSON.parse(msg.data)

      # Update state if it's session state
      @state = data if data.is_a?(Hash) && (data['virtual_devices'] || data['midi_devices'])

      # Signal waiting thread
      @mutex.synchronize do
        @response_queue << data
        @cv.signal
      end
    rescue => e
      puts "Error handling Trevor message: #{e.message}"
    end

    # Wait for a message response
    #
    # @return [Hash] response data
    def wait_for_message
      @mutex.synchronize do
        @cv.wait(@mutex) if @response_queue.empty?
        @response_queue.shift
      end
    end
  end
end

# Example usage
if __FILE__ == $PROGRAM_NAME
  trevor = Nallely::TrevorClient.new(host: 'localhost', port: 6788)
  trevor.connect

  puts "\n=== Current State ==="
  state = trevor.full_state
  puts "Virtual devices: #{state['virtual_devices']&.length || 0}"
  puts "MIDI devices: #{state['midi_devices']&.length || 0}"
  puts "Connections: #{state['connections']&.length || 0}"

  # Create an LFO
  puts "\n=== Creating LFO ==="
  state = trevor.create_device('LFO')
  lfo = state['virtual_devices'].last
  puts "Created: #{lfo['repr']} (ID: #{lfo['id']})"

  # Set LFO parameters
  puts "\n=== Configuring LFO ==="
  trevor.set_virtual_value(lfo['id'], 'speed', 2.0)
  trevor.set_virtual_value(lfo['id'], 'waveform', 'sine')
  trevor.set_virtual_value(lfo['id'], 'min_value', 20)
  trevor.set_virtual_value(lfo['id'], 'max_value', 100)
  puts "LFO configured: speed=2.0, waveform=sine, range=[20,100]"

  # Create a Sequencer
  puts "\n=== Creating Sequencer ==="
  state = trevor.create_device('Sequencer')
  seq = state['virtual_devices'].last
  puts "Created: #{seq['repr']} (ID: #{seq['id']})"

  # Configure LFO as a clock
  puts "\n=== Configuring LFO as Clock ==="
  trevor.set_virtual_value(lfo['id'], 'waveform', 'square')
  trevor.set_virtual_value(lfo['id'], 'speed', 2.0)  # 2 Hz
  trevor.set_virtual_value(lfo['id'], 'min_value', 0)
  trevor.set_virtual_value(lfo['id'], 'max_value', 1)
  puts "LFO configured: square wave, 2 Hz, 0-1 (trigger range)"

  # Wire LFO output directly to Sequencer trigger
  puts "\n=== Wiring LFO to Sequencer ==="
  from_param = trevor.virtual_param_path(lfo['id'], 'output_cv')
  to_param = trevor.virtual_param_path(seq['id'], 'trigger_cv')
  state = trevor.associate_parameters(from_param, to_param, with_scaler: false)
  puts "Connected: #{lfo['repr']}.output -> #{seq['repr']}.trigger"

  puts "\nExample complete. Press Ctrl+C to exit."
  begin
    sleep
  rescue Interrupt
    puts "\nShutting down..."
    trevor.disconnect
  end
end
