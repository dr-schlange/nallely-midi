Feature: ADSR Connections

    Scenario: LFO modulates ADSR envelope's attack and amplitude
        Given an LFO L with a "sine" shape, and a speed of 5hz
        And an ADSREnvelope E with an attack of 0.1, a decay of 0.2, a sustain of 0.7, and a release of 0.3
        Given L is started
        And E is started
        Given L's default output connected to E's attack
        When around 200ms have passed
        Then E's attack is gt 0.1

    Scenario: ADSR envelope basic shape
        Given an ADSREnvelope E with an attack of 0.1, a decay of 0.2, a sustain of 0.7, and a release of 0.3
        And E is started
        And E's gate is set to 1
        When around 50ms have passed
        Then E's output is gt 0
        When around 100ms have passed
        Then E's output is between 0.9 and 1.0
        When around 200ms have passed
        Then E's output is lt 1.0
        When around 400ms have passed
        Then E's output is eq 0.7
        Given E's gate is set to 0
        When around 100ms have passed
        Then E's output is lt 0.7
        When around 400ms have passed
        Then E's output is eq 0.0

    Scenario: ADSR envelope with zero attack
        Given an ADSREnvelope E with an attack of 0.0, a decay of 0.2, a sustain of 0.5, and a release of 0.3
        And E is started
        And E's gate is set to 1
        When around 10ms have passed
        Then E's output is between 0.9 and 1.0

    Scenario: ADSR envelope with zero decay
        Given an ADSREnvelope E with an attack of 0.1, a decay of 0.0, a sustain of 0.4, and a release of 0.2
        And E is started
        And E's gate is set to 1
        When around 150ms have passed
        Then E's output is eq 0.4

    Scenario: ADSR envelope with zero release
        Given an ADSREnvelope E with an attack of 0.1, a decay of 0.2, a sustain of 0.7, and a release of 0.0
        And E is started
        And E's gate is set to 1
        When around 400ms have passed
        Given E's gate is set to 0
        When around 10ms have passed
        Then E's output is eq 0.0

    Scenario: ADSR envelope with zero sustain
        Given an ADSREnvelope E with an attack of 0.1, a decay of 0.2, a sustain of 0.0, and a release of 0.3
        And E is started
        And E's gate is set to 1
        When around 400ms have passed
        Then E's output is eq 0.0

    Scenario: ADSR envelope retriggered quickly
        Given an ADSREnvelope E with an attack of 0.1, a decay of 0.2, a sustain of 0.7, and a release of 0.3
        And E is started
        And E's gate is set to 1
        When around 50ms have passed
        Given E's gate is set to 0
        When around 10ms have passed
        Given E's gate is set to 1
        When around 50ms have passed
        Then E's output is gt 0.0

    Scenario: LFO modulates ADSR sustain
        Given an LFO L with a "triangle" shape, and a speed of 1hz
        And an ADSREnvelope E with an attack of 0.1, a decay of 0.2, a sustain of 0.5, and a release of 0.3
        Given L is started
        And E is started
        Given L's default output connected to E's sustain
        When around 500ms have passed
        Then E's sustain is ne 0.5

    Scenario: LFO modulates ADSR release
        Given an LFO L with a "square" shape, and a speed of 0.5hz
        And an ADSREnvelope E with an attack of 0.1, a decay of 0.2, a sustain of 0.7, and a release of 0.3
        Given L is started
        And E is started
        Given L's default output connected to E's release
        When around 1010ms have passed
        Then E's release is ne 0.3

    Scenario: LFO modulates ADSR, ADSR modulates VCA amplitude
        Given an LFO L with a "sine" shape, and a speed of 2hz
        And an ADSREnvelope E with an attack of 0.1, a decay of 0.2, a sustain of 0.7, and a release of 0.3
        And a VCA V with an amplitude of 0.0
        Given L is started
        And E is started
        And V is started
        Given L's default output connected to E's attack
        And E's default output connected to V's amplitude
        And E's gate is set to 1
        When around 300ms have passed
        Then V's amplitude is gt 0.0