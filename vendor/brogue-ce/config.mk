
# Source provenance: Brogue CE v1.15.1, commit 1ba4240b7a928ddf0ffb772717bf1d433cd63804; upstream path config.mk; vendored and modified for this integration.
# Where to look for game data files (found in 'bin'). Must be without trailing slashes!
DATADIR := .

# Host and target platform. Values: LINUXLIKE, WINDOWS, OS2
SYSTEM := LINUXLIKE

# Include terminal support. Requires ncurses
TERMINAL := NO

# Include graphical support. Requires SDL2 and SDL2_image
GRAPHICS := YES
# Path to sdl2-config script
SDL_CONFIG := sdl2-config

# Select web brogue mode. Requires POSIX system.
WEBBROGUE := NO

# Enable debugging mode. See top of Rogue.h for features
DEBUG := NO

# Declare this is a release build
RELEASE := NO

# Configure the executable to run from a macOS .app bundle (only works in graphical mode)
MAC_APP := NO
