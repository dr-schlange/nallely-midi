Feature: Comparator module

    Scenario: Comparison of all operators on fixed values in continuous mode
        Given a Comparator comparator with a "continuous" type, and an "=" comparator
        And comparator is started
        And comparator's a is set to 50
        And comparator's b is set to 50
        When around 1ms have passed
        Then comparator's output is eq 1

        Given comparator's a is set to 10
        When around 1ms have passed
        Then comparator's output is eq 0

        Given comparator's comparator is set to <>
        When around 1ms have passed
        Then comparator's output is eq 1


        Given comparator's comparator is set to >=
        When around 2ms have passed
        Then comparator's output is eq 0

        Given comparator's comparator is set to >
        When around 1ms have passed
        Then comparator's output is eq 0

        Given comparator's comparator is set to <
        When around 2ms have passed
        Then comparator's output is eq 1

        Given comparator's comparator is set to <=
        When around 1ms have passed
        Then comparator's output is eq 1

    Scenario: Comparion equality on fixed values in ondemand mode
        Given a Comparator comparator with a "ondemand" type, and an "=" comparator
        And comparator is started
        And comparator's a is set to 50
        And comparator's b is set to 50
        When around 10ms have passed
        Then comparator's output is eq 1

        Given comparator's a is set to 10
        When around 10ms have passed
        Then comparator's output is eq 0