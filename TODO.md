# Remove all backwards compatible code

# Rename the game and repo to webcam-motion-games

# Dance Dance revolution with hands

Inspirations:

- guitar hero
- dance dance revolution
- beat saber
- just dance

## Add long hands (staying with the hand in the same place for a while)

## Improve glow where hands are placed

# Accessibility

Allow configuring games so that they can be limited for certain people

Examples:

- allow removing the jump behavior on a game

# UX

## Allow exploring prior to the main game

Allow to move around prior to start playing

## Add low alpha body into the game scene for better estimation

# New levels

## Top down games

In top down games, human hands or even poses can be used as their controllers, thus making any kind of 2d game with simple inputs.

This can be a bit more abstract for kids though, since it might not be a simple mapping

# Review jumpDuckLevel

It currently uses a 2x3 position grid

I think it would be more intuitive for it to just be a 2x2 grid

# Improve camera handling

Currently it's cropping it, which is not taking advantage of the wider camera of my laptop

# Misc

## Add full e2e test

Inputs:

- generated video
- RNG seed for the balls or a static level

Using all different pipelines

We should see the player win the game

# Tech debt

## Decouple hand gesture and pose detection

They are entirely different modules, it does not make sense to have things like

```
detection: PersonDetection | HandGestureDetection
```

We should probably make the differt modules boundaries clearer, and then use them as building blocks
Then, in the building blocks we could impose dynamic restrictions about which module goes with what

Example:

- hand gesture recognizer gives gestures and positions
- another module can be the mapper from gesture to game actions
- game only knows about the game actions

By doing this, we'll know which modules adhere to the interfaces of the others, so that mappings make sense
