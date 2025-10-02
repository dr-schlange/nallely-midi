Feature: Crossfade module

    Scenario: crossfade at mid-level (out0)
        Given a Crossfade c with a level of 50
        And c is started
        And c's in0 is set to 100
        And c's in1 is set to 0
        And c's type is set to continuous
        When around 5ms have passed
        Then c's out0 is eq 50

    Scenario: crossfade fully to in0 (out0)
        Given a Crossfade c with a level of 0
        And c is started
        And c's in0 is set to 120
        And c's in1 is set to 30
        And c's type is set to continuous
        When around 5ms have passed
        Then c's out0 is eq 120

    Scenario: crossfade fully to in1 (out0)
        Given a Crossfade c with a level of 100
        And c is started
        And c's in0 is set to 120
        And c's in1 is set to 30
        And c's type is set to continuous
        When around 5ms have passed
        Then c's out0 is eq 30

    Scenario: crossfade mid-level (out1)
        Given a Crossfade c with a level of 50
        And c is started
        And c's in2 is set to 50
        And c's in3 is set to 100
        And c's type is set to continuous
        When around 5ms have passed
        Then c's out1 is eq 75

    Scenario: ondemand mode produces only after input change
        Given a Crossfade c with a level of 50
        And c is started
        And c's in0 is set to 100
        And c's in1 is set to 0
        And c's type is set to ondemand
        When around 5ms have passed
        Then c's out0 is eq 50

        Given c's in0 is set to 127
        Then c's out0 is eq 63.5

    Scenario: full crossfade with out1
        Given a Crossfade c with a level of 100
        And c is started
        And c's in2 is set to 10
        And c's in3 is set to 110
        And c's type is set to continuous
        When around 5ms have passed
        Then c's out1 is eq 110