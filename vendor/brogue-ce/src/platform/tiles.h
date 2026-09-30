/* Source provenance: Brogue CE v1.15.1, commit 1ba4240b7a928ddf0ffb772717bf1d433cd63804; upstream path src/platform/tiles.h; vendored and modified for this integration (original copyright/AGPL notice retained). */
#ifndef __TILES_H__
#define __TILES_H__

#include <SDL.h>

void initTiles(void);
void resizeWindow(int width, int height);
void updateTile(int row, int column, short charIndex,
    short foreRed, short foreGreen, short foreBlue,
    short backRed, short backGreen, short backBlue);
void updateScreen(void);
SDL_Surface *captureScreen(void);

#endif
