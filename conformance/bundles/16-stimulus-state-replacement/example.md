# Stimulus state replacement

A stimulus returns the complete next state. The return IS the state — fields it
leaves out are dropped, not carried over from before.

## A stimulus return replaces the state rather than merging into it

I set a to 1 and b to 2. I set only b to 3. Then a is 0 and b is 3.
