Feature: LFOs connections

    Scenario: One LFO modulate another one
        Given an LFO A with a "square" shape, and a speed of 10hz
        And an LFO B with a "square" shape, and a speed of 5hz
        Given A is started
        And B is started
        Given A's default output connected to B's speed
        When around 100ms have passed
        Then B's speed is eq 10


    Scenario: LFO B modulares LFO A's speed
        Given an LFO A with a "sawtooth" shape, and a speed of 1hz
        And an LFO B with a "square" shape, and a speed of 8hz
        Given A is started
        And B is started
        Given B's default output connected to A's speed
        When around 150ms have passed
        Then A's speed is eq 10


    Scenario: LFO A modulates LFO B's phase
        Given an LFO A with a "triangle" shape, and a speed of 2hz
        And an LFO B with a "sine" shape, and a speed of 5hz, and a phase of 0.0
        Given A is started
        And B is started
        Given A's default output connected to B's phase
        When around 200ms have passed
        Then B's phase is ne 0.0


    Scenario: Three LFOs in a modulation chain
        Given an LFO A with a "triangle" shape, and a speed of 2hz
        And an LFO B with a "sine" shape, and a speed of 4hz
        Given an LFO C with a "square" shape, and a speed of 1hz
        Given A is started
        And B is started
        And C is started
        Given A's default output connected to B's speed
        And B's default output connected to C's phase
        When around 300ms have passed
        Then B's speed is gt 2
        Then C's phase is ne 0.0
