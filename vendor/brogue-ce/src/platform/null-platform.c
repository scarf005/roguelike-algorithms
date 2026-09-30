/* Source provenance: Brogue CE v1.15.1, commit 1ba4240b7a928ddf0ffb772717bf1d433cd63804; upstream path src/platform/null-platform.c; vendored and modified for this integration (original copyright/AGPL notice retained). */
#include "platform.h"

static void null_gameLoop() {
    exit(rogueMain());
}

static boolean null_pauseForMilliseconds(short milliseconds, PauseBehavior behavior) {
    return false;
}

static void null_nextKeyOrMouseEvent(rogueEvent *returnEvent, boolean textInput, boolean colorsDance) {
    return;
}

static void null_plotChar(enum displayGlyph ch,
              short xLoc, short yLoc,
              short foreRed, short foreGreen, short foreBlue,
              short backRed, short backGreen, short backBlue) {
    return;
}

static boolean null_modifier_held(int modifier) {
    return false;
}

struct brogueConsole nullConsole = {
    null_gameLoop,
    null_pauseForMilliseconds,
    null_nextKeyOrMouseEvent,
    null_plotChar,
    NULL,
    null_modifier_held,
    NULL,
    NULL,
    NULL
};
