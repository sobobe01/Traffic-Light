# Traffic-Light

A YouTube video describing finite state machine for a traffic light ((https://www.youtube.com/watch?time_continue=894&v=kgABPjf9qLI))
This project is the final project from the online course offered by University of Texas at Austin:  Embeded Systems - Shape The World: Multi-Threaded Interfacing

Purpose

This lab has these major objectives:
-   The understanding and implementing of indexed data structures
-   Learning how to create a segmented software system; and
-   the study of real-time synchronization by designing a finite state machine controller Software skills you will learn include advanced indexed addressing, linked data   structures, creating
-   Fixed-time delays using the SysTick timer, and debugging real-time systems.


Equipment
- Tiva C series TM4C123G Lauchpad
- Three switches
- six 470 ohms resistors
- three 10k ohms resistors
- six LEDs

What the project does

Consider a 4-corner intersection. There are two one-way streets are labeled South (cars travel South) and West
(cars travel West). There are three inputs to your LaunchPad, two are car sensors, and one is a pedestrian sensor.
The South car sensor will be true (3.3V) if one or more cars are near the intersection on the South road. Similarly,
the West car sensor will be true (3.3V) if one or more cars are near the intersection on the West road. The Walk sensor
will be true (3.3V) if a pedestrian is present and he or she wishes to cross in any direction. This walk sensor is different
from a walk button on most real intersections. This means when you are testing the system, you must push and hold the walk
sensor until the FSM recognizes the presence of the pedestrian. Similarly, you will have to push and hold the car sensor until
the FSM recognizes the presence of the car. In this simple system, if the walk sensor is +3.3V, there is pedestrian to service,
and if the walk sensor is 0V, there are no people who wish to walk. The walk sensor and walk light will service pedestrians who
wish to cross in any direction. This means the roads must both be red before the walk light is activated. In a similar fashion,
when a car sensor is 0V, it means no cars are waiting to enter the intersection. The don't walk light should be on while cars
have a green or yellow light.

Interface 6 LEDs that represent the two Red-Yellow-Green traffic lights, and you will use the PF3 green LED
for the “walk” light and the PF1 red LED for the “don’t walk” light. When the “walk” condition is signified, pedestrians
are allowed to cross in any direction. When the “don’t walk” light flashes (and the two traffic signals are red), pedestrians
should hurry up and finish crossing. When the “don’t walk” condition is on steady, pedestrians should not enter the intersection.


Overall functiionality of this system is described in the following rules:
At all times, there should be exactly one of the {red, yellow, green} traffic lights active on the south road. At all times, there should be exactly one of the {red, yellow, green} traffic lights active on the west road. To switch a light from green to red it must sequence green, yellow then red . The grader checks for the proper sequence of output patterns but does not measure the time the FSM spends in each state. The “walk” and “don’t walk” lights should never both be on at the same time.
Do not allow cars to crash into each other. This means there can never be a green or yellow on one road at the same time as a green or yellow on the other road. Engineers do not want people to get hurt.
Do not allow pedestrians to walk while any cars are allowed to go. This means there can never be a green or yellow on either road at the same time as a “walk” light. Furthermore, there can never be a green or yellow on either road at the same time as the “don’t walk” light is flashing. If a green light is active on one of the roads, the “don’t walk” should be solid red. Engineers do not want people to get hurt.
If just the south sensor is active (no walk and no west sensor), the lights should adjust so the south has a green light within 5 seconds (I know this value is unrealistically short, but it makes the grading faster). The south light should stay green for as long as just the south sensor is active.
If just the west sensor is active (no walk and no south sensor), the lights should adjust so the west has a green light within 5 seconds. The west light should stay green for as long as just the west sensor is active.
If just the walk sensor is active (no west and no south sensor), the lights should adjust so the “walk” light is green within 5 seconds. The “walk” light should stay green for as long as just the walk sensor is active.
If all three sensors are active, the lights should go into a circular pattern in any order with the west light green, the south light green, and the “walk” light is green. Of course, the road lights must sequence green-yellow-red each time.
Testing
