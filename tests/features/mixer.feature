Feature: Mixer module

    Scenario: Mixer output is the sum of all inputs
        Given a Mixer m with a nums of 4
        And m is started
        And m's in0 is set to 100
        And m's in1 is set to 100
        And m's in2 is set to 100
        And m's in3 is set to 100
        And m's level0 is set to 50
        And m's level1 is set to 50
        And m's level2 is set to 50
        And m's level3 is set to 50
        When around 5ms have passed
        Then m's output is eq 50.0

        Given m's nums is set to  2
        And m is started
        And m's in0 is set to 100
        And m's in1 is set to 50
        And m's level0 is set to 50
        And m's level1 is set to 50
        When around 5ms have passed
        Then m's output is eq 37.5

    Scenario: Single input, full gain
        Given a Mixer m with a nums of 1
        And m is started
        And m's in0 is set to 80
        And m's level0 is set to 100
        When around 5ms have passed
        Then m's output is eq 80

    Scenario: single input, zero gain
        Given a Mixer m with a nums of 1
        And m is started
        And m's in0 is set to 80
        And m's level0 is set to 0
        When around 5ms have passed
        Then m's output is eq 0


    Scenario: mixed inputs, half gain
        Given a Mixer m with a nums of 2
        And m is started
        And m's in0 is set to 100
        And m's in1 is set to 50
        And m's level0 is set to 50
        And m's level1 is set to 50
        When around 5ms have passed
        Then m's output is eq 37.5

    Scenario: uneven levels
        Given a Mixer m with a nums of 2
        And m is started
        And m's in0 is set to 100
        And m's in1 is set to 50
        And m's level0 is set to 100
        And m's level1 is set to 0
        When around 5ms have passed
        Then m's output is eq 50

    Scenario: all inputs max, all levels max
        Given a Mixer m with a nums of 3
        And m is started
        And m's in0 is set to 100
        And m's in1 is set to 100
        And m's in2 is set to 100
        And m's level0 is set to 100
        And m's level1 is set to 100
        And m's level2 is set to 100
        When around 5ms have passed
        Then m's output is eq 100