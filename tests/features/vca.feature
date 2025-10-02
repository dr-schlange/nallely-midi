Feature: VCA module

    Scenario: VCA output is relative to the input and the amplitude
        Given a VCA v with an amplitude of 1.0 and a gain of 1.0
        And v is started
        And v's input is set to 50
        When around 5ms have passed
        Then v's output is eq 50.0

        Given v's amplitude is set to 0.5
        When around 2ms have passed
        Then v's output is eq 25.0

    Scenario: VCA output is relative to the input and the gain
        Given a VCA v with an amplitude of 1.0
        And v is started
        And v's gain is set to 2.0
        And v's input is set to 50
        When around 5ms have passed
        Then v's output is eq 100.0

    Scenario: VCA output is closing
        Given a VCA v with an amplitude of 1.0
        And v is started
        And v's gain is set to 2.0
        And v's input is set to 50
        When around 5ms have passed
        Then v's output is eq 100.0

        Given v's amplitude is set to 0.0
        When around 2ms have passed
        Then v's output is eq 0.0
