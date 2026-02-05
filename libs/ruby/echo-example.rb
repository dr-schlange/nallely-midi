#!/usr/bin/env ruby
# frozen_string_literal: true

# Simple example: Create an external neuron that echoes values

require_relative 'nallely_connector'

puts "=== Simple Nallely External Neuron Example ===\n\n"

# Create a simple echo neuron
echo = Nallely::ExternalNeuron.new(
  name: 'echo',
  parameters: {
    'input' => { min: 0, max: 127 },
    'output' => { min: 0, max: 127 }
  }
)

# Echo received values to output (with 0.5x scaling)
echo.on_message do |param_name, value|
  puts "Received: #{param_name} = #{value.round(2)}"

  if param_name == 'input'
    output_value = value * 0.5
    echo.send_value('output', output_value)
    puts "Sent: output = #{output_value.round(2)}"
  end
end

echo.on_disconnect do
  puts "Disconnected. Attempting to reconnect..."
end

# Connect and run
echo.connect

puts "Echo neuron is running."
puts "Press Ctrl+C to exit.\n\n"

begin
  sleep
rescue Interrupt
  puts "\n\nShutting down..."
  echo.disconnect
  puts "Goodbye!"
end