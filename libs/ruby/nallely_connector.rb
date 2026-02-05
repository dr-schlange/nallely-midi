#!/usr/bin/env ruby
# frozen_string_literal: true
# *LLM generated*

require 'websocket-client-simple'
require 'json'

module Nallely
  # Binary frame codec for Nallely WebSocket Bus protocol
  module FrameCodec
    # Encode a parameter name and value into a binary frame
    # Format: [1 byte: name_length][N bytes: UTF-8 name][8 bytes: float64 big-endian]
    #
    # @param param_name [String] plain parameter name (e.g. "note")
    # @param value [Float] numeric value
    # @return [String] binary frame (ASCII-8BIT encoding)
    def self.encode(param_name, value)
      name_bytes = param_name.encode('UTF-8')
      name_length = name_bytes.bytesize

      raise ArgumentError, "Parameter name too long (max 255 bytes)" if name_length > 255

      frame = String.new(encoding: 'ASCII-8BIT')
      frame << [name_length].pack('C')  # uint8
      frame << name_bytes.force_encoding('ASCII-8BIT')
      frame << [value].pack('G')  # float64 big-endian (network byte order)
      frame
    end

    # Decode a binary frame into parameter name and value
    #
    # @param frame [String] binary frame
    # @return [Array<String, Float>] [param_name, value]
    def self.decode(frame)
      frame = frame.force_encoding('ASCII-8BIT')

      name_length = frame[0].unpack1('C')
      param_name = frame[1, name_length].force_encoding('UTF-8')
      value = frame[1 + name_length, 8].unpack1('G')

      [param_name, value]
    end
  end

  # External neuron service connected to the WebSocket Bus
  class ExternalNeuron
    attr_reader :name, :parameters, :connected

    # @param host [String] Nallely host (default: localhost)
    # @param port [Integer] WebSocket Bus port (default: 6789)
    # @param name [String] neuron name
    # @param parameters [Hash] parameter definitions
    #   e.g. { "note" => { min: 0, max: 127 }, "velocity" => { min: 0, max: 127 } }
    def initialize(host: 'localhost', port: 6789, name:, parameters:)
      @host = host
      @port = port
      @name = name
      @parameters = parameters
      @ws = nil
      @connected = false
      @reconnect = true
      @on_message_callback = nil
      @on_connect_callback = nil
      @on_disconnect_callback = nil
    end

    # Connect to the WebSocket Bus and register as an external neuron
    def connect
      url = "ws://#{@host}:#{@port}/#{@name}/autoconfig"

      @ws = WebSocket::Client::Simple.connect(url)

      # Capture self for use in callbacks
      neuron = self

      @ws.on :open do
        neuron.instance_variable_set(:@connected, true)
        puts "[#{neuron.name}] Connected to Nallely WebSocket Bus"
        neuron.register  # Call it directly, it's public
        neuron.instance_variable_get(:@on_connect_callback)&.call
      end

      @ws.on :message do |msg|
        neuron.send(:handle_message, msg)
      end

      @ws.on :close do |e|
        neuron.instance_variable_set(:@connected, false)
        puts "[#{neuron.name}] Disconnected: #{e}"
        neuron.instance_variable_get(:@on_disconnect_callback)&.call
        neuron.send(:auto_reconnect) if neuron.instance_variable_get(:@reconnect)
      end

      @ws.on :error do |e|
        puts "[#{neuron.name}] Error: #{e}"
      end

      # Wait for connection to be established
      sleep 0.1 until @connected

      self
    end

    # Send registration JSON to declare parameters
    def register
      registration = {
        kind: 'external',
        parameters: @parameters.map do |name, spec|
          param = { name: name }
          param[:range] = [spec[:min], spec[:max]] if spec[:min] || spec[:max]
          param
        end
      }

      @ws.send(registration.to_json)
      puts "[#{@name}] Registered with parameters: #{parameters}"
    end

    # Send a value to a parameter
    #
    # @param param_name [String] plain parameter name
    # @param value [Float] numeric value
    def send_value(param_name, value)
      unless @connected
        puts "[#{@name}] Warning: Not connected, cannot send #{param_name}=#{value}"
        return
      end

      frame = FrameCodec.encode(param_name, value.to_f)
      @ws.send(frame, type: :binary)
    end

    # Set callback for incoming messages
    #
    # @yield [param_name, value] called when a value is received
    def on_message(&block)
      @on_message_callback = block
    end

    # Set callback for connection established
    #
    # @yield called when connected
    def on_connect(&block)
      @on_connect_callback = block
    end

    # Set callback for disconnection
    #
    # @yield called when disconnected
    def on_disconnect(&block)
      @on_disconnect_callback = block
    end

    # Disconnect cleanly
    def disconnect
      @reconnect = false
      @ws&.close
      @connected = false
    end

    # Unregister from the session (removes parameters and wiring)
    def unregister
      disconnect
      # Connect to unregister endpoint
      url = "ws://#{@host}:#{@port}/#{@name}/unregister"
      unregister_ws = WebSocket::Client::Simple.connect(url)
      sleep 0.5  # Give it time to process
      unregister_ws.close
      puts "[#{@name}] Unregistered"
    end

    private

    # Handle incoming WebSocket message
    def handle_message(msg)
      if msg.type == :binary
        # Binary frame with parameter value
        param_name, value = FrameCodec.decode(msg.data)
        @on_message_callback&.call(param_name, value)
      elsif msg.type == :text
        # JSON message format: {"on": "param_name", "value": float}
        data = JSON.parse(msg.data)
        if data['on'] && data['value']
          @on_message_callback&.call(data['on'], data['value'])
        end
      end
    rescue => e
      puts "[#{@name}] Error handling message: #{e.message}"
    end

    # Auto-reconnect after disconnect
    def auto_reconnect
      return unless @reconnect

      puts "[#{@name}] Reconnecting in 1 second..."
      sleep 1
      connect
    rescue => e
      puts "[#{@name}] Reconnection failed: #{e.message}"
      auto_reconnect
    end
  end

  # Service registry for managing multiple external neurons
  class WebSocketBus
    def initialize(host: 'localhost', port: 6789)
      @host = host
      @port = port
      @services = {}
    end

    # Register a new external neuron
    #
    # @param name [String] neuron name
    # @param parameters [Hash] parameter definitions
    # @return [ExternalNeuron] the registered neuron
    def register(name, parameters)
      service_key = "external::#{name}"

      if @services[service_key]
        puts "Service #{service_key} already registered"
        return @services[service_key]
      end

      neuron = ExternalNeuron.new(
        host: @host,
        port: @port,
        name: name,
        parameters: parameters
      )

      neuron.connect
      @services[service_key] = neuron
      neuron
    end

    # Get a registered service
    #
    # @param name [String] neuron name
    # @return [ExternalNeuron, nil]
    def get(name)
      @services["external::#{name}"]
    end

    # Send a value through a registered service
    #
    # @param name [String] neuron name
    # @param param_name [String] parameter name
    # @param value [Float] value to send
    def send_value(name, param_name, value)
      neuron = get(name)
      if neuron
        neuron.send_value(param_name, value)
      else
        puts "Service #{name} not found"
      end
    end

    # Disconnect all services
    def disconnect_all
      @services.each_value(&:disconnect)
      @services.clear
    end

    # Unregister all services
    def unregister_all
      @services.each_value(&:unregister)
      @services.clear
    end
  end
end

# Example usage
if __FILE__ == $PROGRAM_NAME
  # Create a simple external neuron with input and output parameters
  neuron = Nallely::ExternalNeuron.new(
    host: 'localhost',
    port: 6789,
    name: 'ruby_test',
    parameters: {
      'input' => { min: 0, max: 127 },
      'output' => { min: 0, max: 127 }
    }
  )

  # Set up message handler
  neuron.on_message do |param_name, value|
    puts "Received: #{param_name} = #{value}"

    # Echo back with modification
    if param_name == 'input'
      neuron.send_value('output', value * 0.5)
    end
  end

  # Connect
  neuron.connect

  # Send test values
  neuron.on_connect do
    puts "Sending test values..."
    10.times do |i|
      neuron.send_value('output', i * 12.7)
      sleep 0.5
    end
  end

  # Keep the script running
  puts "External neuron running. Press Ctrl+C to exit."
  begin
    sleep
  rescue Interrupt
    puts "\nShutting down..."
    neuron.disconnect
  end
end
