Feature: ADSR Connections

Scenario: LFO modulates ADSR envelope's attack and amplitude
Given a LFO L with a "sine" shape, and a speed of 5hz
Given an ADSREnvelope E with an attack of 0.1, a decay of 0.2, a sustain of 0.7, and a release of 0.3
Given L is started
Given E is started
Given L's default output connected to E's attack
When around 200ms have passed
Then E's attack is gt 0.1