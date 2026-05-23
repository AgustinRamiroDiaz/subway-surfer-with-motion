# UX

## Allow exploring prior to the main game

Allow to move around prior to start playing

## Explain to the user how to configure the backend

[x] Package the Python backend so that it's a binary in releases tha people can download from GitHub

# New levels

## Dance Dance revolution with hands

Using hands in different places in the screen to hit the coming notes

Ideas:

- add hand posture recognition to use hand forms in each position
- use 9 positions (3 by 3 grid)
- get inspired from beat saber https://store.steampowered.com/app/620980/Beat_Saber/

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
