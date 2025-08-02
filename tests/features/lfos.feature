Feature: Two LFOs are connected

Scenario: One LFO modulate another one
Given a LFO A with a "square" shape, and a speed of 10hz
Given a LFO B with a "square" shape, and a speed of 5hz
Given A is started
Given B is started
Given A's default output connected to B's speed
When around 100ms have passed
Then B's speed is eq 10
