/*
 * Phase 2 C observer and ABI wrapper.
 * Origin: Brogue CE src/platform/main.c, src/brogue/RogueMain.c and src/brogue/Math.c,
 * commit 1ba4240b7a928ddf0ffb772717bf1d433cd63804.
 * Modified for neutral instrumentation; Copyright 2012 Brian Walker;
 * AGPL-3.0-or-later.
 */
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdarg.h>
#ifdef __EMSCRIPTEN__
#include <emscripten/emscripten.h>
#undef true
#undef false
#else
#define EMSCRIPTEN_KEEPALIVE
#endif
#include "platform.h"
#include "GlobalsBase.h"
#include "Globals.h"

#define CELL_COUNT (DCOLS * DROWS)
#define MAX_JSON (128 * 1024 * 1024)

typedef struct observerBuffer {
    char *data;
    size_t length;
    size_t capacity;
} observerBuffer;

static observerBuffer json;
static int targetDepth;
static int observerActive;
static int observerMode = 2;
static int requestedMode = 2;
static int eventSequence;
static int checkpointId;
static int generationAttempt = 1;
static const char *currentPhase = "clearLevel";
static uint16_t oldTerrain[NUMBER_TERRAIN_LAYERS][CELL_COUNT];
static uint16_t oldVolume[CELL_COUNT];
static uint32_t oldFlags[CELL_COUNT];
static int16_t oldMachine[CELL_COUNT];
static int16_t oldRoom[CELL_COUNT];
static int oldUp = -1;
static int oldDown = -1;
static int oldPlayer = -1;
static int oldRoomValid;

static void reserve(size_t extra) {
    size_t wanted = json.length + extra + 1;
    size_t capacity = json.capacity ? json.capacity : 65536;
    while (capacity < wanted) capacity *= 2;
    if (capacity > MAX_JSON) abort();
    if (capacity != json.capacity) {
        json.data = realloc(json.data, capacity);
        json.capacity = capacity;
    }
}

static void appendText(const char *text) {
    size_t length = strlen(text);
    reserve(length);
    memcpy(json.data + json.length, text, length);
    json.length += length;
    json.data[json.length] = '\0';
}

static void appendFormat(const char *format, ...) {
    va_list args;
    va_start(args, format);
    char stack[512];
    int length = vsnprintf(stack, sizeof(stack), format, args);
    va_end(args);
    if (length < 0) abort();
    if ((size_t)length < sizeof(stack)) {
        appendText(stack);
        return;
    }
    char *heap = malloc((size_t)length + 1);
    va_start(args, format);
    vsnprintf(heap, (size_t)length + 1, format, args);
    va_end(args);
    appendText(heap);
    free(heap);
}

static int cellIndex(int x, int y) {
    return y * DCOLS + x;
}

static int markerIndex(pos location, int role) {
    if (location.x < 0 || location.y < 0 || location.x >= DCOLS || location.y >= DROWS) return -1;
    if (role == 0 && pmap[location.x][location.y].layers[DUNGEON] != UP_STAIRS
        && pmap[location.x][location.y].layers[DUNGEON] != DUNGEON_EXIT) return -1;
    if (role == 1 && pmap[location.x][location.y].layers[DUNGEON] != DOWN_STAIRS) return -1;
    if (role == 2 && !(pmap[location.x][location.y].flags & HAS_PLAYER)) return -1;
    return cellIndex(location.x, location.y);
}

static void resetPreviousState(void) {
    memset(oldTerrain, 0, sizeof(oldTerrain));
    memset(oldVolume, 0, sizeof(oldVolume));
    memset(oldFlags, 0, sizeof(oldFlags));
    memset(oldMachine, 0, sizeof(oldMachine));
    memset(oldRoom, 0, sizeof(oldRoom));
    oldUp = oldDown = oldPlayer = -1;
    oldRoomValid = 0;
}

static void copyMapState(void) {
    for (int y = 0; y < DROWS; y++) {
        for (int x = 0; x < DCOLS; x++) {
            int index = cellIndex(x, y);
            for (int layer = 0; layer < NUMBER_TERRAIN_LAYERS; layer++) {
                oldTerrain[layer][index] = pmap[x][y].layers[layer];
            }
            oldVolume[index] = pmap[x][y].volume;
            oldFlags[index] = pmap[x][y].flags;
            oldMachine[index] = pmap[x][y].machineNumber;
        }
    }
    oldUp = markerIndex(rogue.upLoc, 0);
    oldDown = markerIndex(rogue.downLoc, 1);
    oldPlayer = markerIndex(player.loc, 2);
}

static void copyRoomState(short **grid) {
    if (!grid) return;
    for (int y = 0; y < DROWS; y++) {
        for (int x = 0; x < DCOLS; x++) {
            oldRoom[cellIndex(x, y)] = grid[x][y];
        }
    }
    oldRoomValid = 1;
}

static void appendWrite(int plane, int layer, int index, int before, int after, int *first) {
    if (!*first) appendText(",");
    *first = 0;
    appendFormat("[%d,%d,%d,%d,%d]", plane, layer, index, before, after);
}

static void appendMapWrites(int *first) {
    for (int y = 0; y < DROWS; y++) {
        for (int x = 0; x < DCOLS; x++) {
            int index = cellIndex(x, y);
            for (int layer = 0; layer < NUMBER_TERRAIN_LAYERS; layer++) {
                int after = pmap[x][y].layers[layer];
                if (oldTerrain[layer][index] != after) {
                    appendWrite(0, layer, index, oldTerrain[layer][index], after, first);
                }
            }
            if (oldVolume[index] != pmap[x][y].volume) {
                appendWrite(1, 0, index, oldVolume[index], pmap[x][y].volume, first);
            }
            if (oldFlags[index] != pmap[x][y].flags) {
                appendWrite(2, 0, index, oldFlags[index], pmap[x][y].flags, first);
            }
            if (oldMachine[index] != pmap[x][y].machineNumber) {
                appendWrite(3, 0, index, oldMachine[index], pmap[x][y].machineNumber, first);
            }
        }
    }
    int up = markerIndex(rogue.upLoc, 0);
    int down = markerIndex(rogue.downLoc, 1);
    int playerLocation = markerIndex(player.loc, 2);
    if (oldUp != up) appendWrite(5, 0, 0, oldUp, up, first);
    if (oldDown != down) appendWrite(5, 0, 1, oldDown, down, first);
    if (oldPlayer != playerLocation) appendWrite(5, 0, 2, oldPlayer, playerLocation, first);
}

static void appendRoomWrites(short **grid, int *first) {
    if (!grid) return;
    for (int y = 0; y < DROWS; y++) {
        for (int x = 0; x < DCOLS; x++) {
            int index = cellIndex(x, y);
            int before = oldRoomValid ? oldRoom[index] : 0;
            int after = grid[x][y];
            if (before != after) appendWrite(4, 0, index, before, after, first);
        }
    }
}

static void appendFlatOverlay(const char *overlayKind, const short *values) {
    appendFormat(",\"overlay\":{\"kind\":\"%s\",\"sourceKind\":\"%s\",\"indices\":[", overlayKind, overlayKind);
    int first = 1;
    for (int index = 0; index < CELL_COUNT; index++) {
        if (values[index] < 0) continue;
        if (!first) appendText(",");
        first = 0;
        appendFormat("%d", index);
    }
    appendText("],\"values\":[");
    first = 1;
    for (int index = 0; index < CELL_COUNT; index++) {
        if (values[index] < 0) continue;
        if (!first) appendText(",");
        first = 0;
        appendFormat("%d", values[index]);
    }
    appendText("]}");
}

static void appendRoomOverlay(short **grid) {
    appendText(",\"overlay\":{\"kind\":\"scratchroomgrid\",\"sourceKind\":\"scratchroomgrid\",\"indices\":[");
    int first = 1;
    for (int y = 0; y < DROWS; y++) {
        for (int x = 0; x < DCOLS; x++) {
            if (grid[x][y] == 0) continue;
            if (!first) appendText(",");
            first = 0;
            appendFormat("%d", cellIndex(x, y));
        }
    }
    appendText("],\"values\":[");
    first = 1;
    for (int y = 0; y < DROWS; y++) {
        for (int x = 0; x < DCOLS; x++) {
            if (grid[x][y] == 0) continue;
            if (!first) appendText(",");
            first = 0;
            appendFormat("%d", grid[x][y]);
        }
    }
    appendText("]}");
}

static void appendMarkers(void) {
    appendFormat(",\"markers\":{\"up\":%d,\"down\":%d,\"player\":%d}",
                 markerIndex(rogue.upLoc, 0), markerIndex(rogue.downLoc, 1), markerIndex(player.loc, 2));
}

static void emitEvent(const char *phase, const char *source, const char *kind,
                      const char *outcome, const char *reason, const char *details,
                      short **roomGrid, const char *overlayKind, const short *overlayValues) {
#ifdef ENGINE_DUMP_ONLY
    (void)phase; (void)source; (void)kind; (void)outcome; (void)reason;
    (void)details; (void)roomGrid; (void)overlayKind; (void)overlayValues;
    return;
#else
    if (!observerActive || rogue.depthLevel != targetDepth || observerMode == 0) return;
    if (observerMode == 1 && strcmp(kind, "phase") != 0) return;
    currentPhase = phase;
    if (eventSequence) appendText(",");
    appendFormat("{\"sequence\":%d,\"generationAttempt\":%d,\"phase\":\"%s\",\"sourceFunction\":\"%s\",\"kind\":\"%s\",\"outcome\":\"%s\",\"reason\":\"%s\",\"details\":%s,\"writes\":[",
                 eventSequence, generationAttempt, phase, source, kind, outcome,
                 reason ? reason : "", details ? details : "{}");
    int first = 1;
    appendMapWrites(&first);
    appendRoomWrites(roomGrid, &first);
    appendText("]");
    if (overlayKind && overlayValues) appendFlatOverlay(overlayKind, overlayValues);
    if (roomGrid && !overlayKind) appendRoomOverlay(roomGrid);
    appendMarkers();
    uint32_t eventRngState[8];
    engine_rng_state(eventRngState);
    appendText(",\"rngState\":[");
    for (int rngIndex = 0; rngIndex < 8; rngIndex++) {
        if (rngIndex) appendText(",");
        appendFormat("%u", eventRngState[rngIndex]);
    }
    appendFormat("],\"checkpointId\":%d}", checkpointId++);
    eventSequence++;
    copyMapState();
    if (roomGrid) copyRoomState(roomGrid);
#endif
}

void engine_observe(const char *phase, const char *source, const char *kind, const char *outcome) {
    emitEvent(phase, source, kind, outcome, "", "{}", NULL, NULL, NULL);
}

void engine_observe_detail(const char *phase, const char *source, const char *kind,
                           const char *outcome, const char *reason, const char *details) {
    emitEvent(phase, source, kind, outcome, reason, details, NULL, NULL, NULL);
}

void engine_observe_grid(const char *phase, const char *source, const char *kind,
                         const char *outcome, const char *reason, const char *details,
                         short **grid) {
    emitEvent(phase, source, kind, outcome, reason, details, grid, NULL, NULL);
}

void engine_observe_grid_overlay(const char *phase, const char *source, const char *kind,
                                 const char *outcome, const char *reason, const char *details,
                                 short **grid, const char *overlayKind, const short *values) {
    emitEvent(phase, source, kind, outcome, reason, details, grid, overlayKind, values);
}

void engine_observe_overlay(const char *phase, const char *source, const char *kind,
                            const char *outcome, const char *reason, const char *details,
                            const char *overlayKind, const short *values) {
    emitEvent(phase, source, kind, outcome, reason, details, NULL, overlayKind, values);
}

void engine_set_generation_attempt(int attempt) {
    generationAttempt = attempt < 1 ? 1 : attempt;
}

void engine_observer_sync(void) {
    engine_observe_detail("machines", "buildAMachine", "machine-before-attempt",
                          "accepted", "before-attempt", "{}");
}

void engine_observe_room_clear(const char *phase, const char *source, const char *reason) {
    short rows[DCOLS][DROWS];
    short *grid[DCOLS];
    for (int x = 0; x < DCOLS; x++) {
        grid[x] = rows[x];
        for (int y = 0; y < DROWS; y++) rows[x][y] = 0;
    }
    emitEvent(phase, source, "phase", "accepted", reason, "{}", grid, NULL, NULL);
}

void engine_snapshot(const char *phase) {
    if (rogue.depthLevel == targetDepth) {
        engine_observe(phase, "startLevel", "phase", "accepted");
    }
}

static void appendState(const char *phase, int sequence) {
    appendText("{\"terrain\":[");
    for (int layer = 0; layer < NUMBER_TERRAIN_LAYERS; layer++) {
        if (layer) appendText(",");
        appendText("[");
        for (int y = 0; y < DROWS; y++) {
            for (int x = 0; x < DCOLS; x++) {
                if (x || y) appendText(",");
                appendFormat("%u", (unsigned)pmap[x][y].layers[layer]);
            }
        }
        appendText("]");
    }
    appendText("],\"volume\":[");
    for (int y = 0; y < DROWS; y++) for (int x = 0; x < DCOLS; x++) {
        if (x || y) appendText(",");
        appendFormat("%u", (unsigned)pmap[x][y].volume);
    }
    appendText("],\"flags\":[");
    for (int y = 0; y < DROWS; y++) for (int x = 0; x < DCOLS; x++) {
        if (x || y) appendText(",");
        appendFormat("%u", (unsigned)pmap[x][y].flags);
    }
    appendText("],\"machine\":[");
    for (int y = 0; y < DROWS; y++) for (int x = 0; x < DCOLS; x++) {
        if (x || y) appendText(",");
        appendFormat("%d", (int)pmap[x][y].machineNumber);
    }
    appendText("],\"roomGrid\":[");
    for (int i = 0; i < CELL_COUNT; i++) { if (i) appendText(","); appendText("0"); }
    appendFormat("],\"markers\":{\"up\":%d,\"down\":%d,\"player\":%d},\"phase\":\"%s\",\"sequence\":%d}",
                 markerIndex(rogue.upLoc, 0), markerIndex(rogue.downLoc, 1), markerIndex(player.loc, 2), phase, sequence);
}

static void appendInitialState(void) {
    appendText("{\"terrain\":[");
    for (int layer = 0; layer < NUMBER_TERRAIN_LAYERS; layer++) {
        if (layer) appendText(",");
        appendText("[");
        for (int i = 0; i < CELL_COUNT; i++) { if (i) appendText(","); appendText("0"); }
        appendText("]");
    }
    appendText("],\"volume\":[");
    for (int i = 0; i < CELL_COUNT; i++) { if (i) appendText(","); appendText("0"); }
    appendText("],\"flags\":[");
    for (int i = 0; i < CELL_COUNT; i++) { if (i) appendText(","); appendText("0"); }
    appendText("],\"machine\":[");
    for (int i = 0; i < CELL_COUNT; i++) { if (i) appendText(","); appendText("0"); }
    appendText("],\"roomGrid\":[");
    for (int i = 0; i < CELL_COUNT; i++) { if (i) appendText(","); appendText("0"); }
    appendText("],\"markers\":{\"up\":-1,\"down\":-1,\"player\":-1},\"phase\":\"clearLevel\",\"sequence\":-1}");
}

static int colorComponent(short value) {
    if (value <= 0) return 0;
    if (value >= 100) return 255;
    return (value * 255 + 50) / 100;
}

static void appendCatalog(void) {
    appendText(",\"tileCatalog\":[");
    for (int id = 0; id < NUMBER_TILETYPES; id++) {
        if (id) appendText(",");
        const floorTileType *tile = &tileCatalog[id];
        const color *fore = tile->foreColor;
        const color *back = tile->backColor;
        appendFormat("{\"id\":%d,\"codePoint\":%u,\"foreground\":[%d,%d,%d],\"background\":[%d,%d,%d],\"priority\":%d}",
                     id, glyphToUnicode(tile->displayChar),
                     colorComponent(fore ? fore->red : 0), colorComponent(fore ? fore->green : 0), colorComponent(fore ? fore->blue : 0),
                     colorComponent(back ? back->red : 0), colorComponent(back ? back->green : 0), colorComponent(back ? back->blue : 0),
                     tile->drawPriority);
    }
    appendText("]");
}

static void appendRngState(void) {
    uint32_t state[8];
    engine_rng_state(state);
    appendText(",\"rngState\":[");
    for (int i = 0; i < 8; i++) { if (i) appendText(","); appendFormat("%u", state[i]); }
    appendText("]");
}

EMSCRIPTEN_KEEPALIVE const char *engine_result_ptr(void) { return json.data ? json.data : ""; }
EMSCRIPTEN_KEEPALIVE uint32_t engine_result_len(void) { return (uint32_t)json.length; }
EMSCRIPTEN_KEEPALIVE void engine_set_mode(int value) {
    requestedMode = value < 0 ? 0 : value > 2 ? 2 : value;
    observerMode = requestedMode;
}

EMSCRIPTEN_KEEPALIVE int engine_generate(uint32_t seedHigh, uint32_t seedLow, int depth) {
    if (depth < 1 || depth > 26 || (seedHigh == 0 && seedLow == 0)) return 0;
    if (observerActive) freeEverything();
    observerActive = 1;
    targetDepth = depth;
    observerMode = requestedMode;
    eventSequence = 0;
    checkpointId = 1;
    generationAttempt = 1;
    currentPhase = "clearLevel";
    json.length = 0;
    currentConsole = nullConsole;
    rogue.nextGame = NG_NOTHING;
    rogue.playbackMode = false;
    rogue.playbackFastForward = false;
    rogue.playbackBetweenTurns = false;
    rogue.playbackOmniscience = true;
    initializeGameVariant();
    uint64_t seed = ((uint64_t)seedHigh << 32) | seedLow;
    initializeRogue(seed);
    appendFormat("{\"schemaVersion\":1,\"upstreamCommit\":\"1ba4240b7a928ddf0ffb772717bf1d433cd63804\",\"variant\":\"brogue\",\"seed\":\"%llu\",\"depth\":%d,\"width\":%d,\"height\":%d,\"terrainOrder\":[\"DUNGEON\",\"LIQUID\",\"GAS\",\"SURFACE\"],\"boundary\":\"canonical-first-entry\",\"events\":[",
                 (unsigned long long)seed, depth, DCOLS, DROWS);
    resetPreviousState();
    for (rogue.depthLevel = 1; rogue.depthLevel <= depth; rogue.depthLevel++) {
        startLevel(rogue.depthLevel == 1 ? 1 : rogue.depthLevel - 1, 1);
        engine_observe("firstEntry", "startLevel", "phase", "accepted");
    }
    currentPhase = "firstEntry";
    appendText("],\"checkpoints\":[{\"id\":0,\"state\":");
    appendInitialState();
    appendFormat("},{\"id\":%d,\"state\":", checkpointId);
    appendState(currentPhase, eventSequence - 1);
    appendText("}],\"final\":");
    appendState(currentPhase, eventSequence - 1);
    appendRngState();
    appendCatalog();
    appendText("}");
    return 1;
}

EMSCRIPTEN_KEEPALIVE int engine_rng_vectors(uint32_t seedHigh, uint32_t seedLow, int stream, int count) {
    if (count < 0 || count > 256 || stream < 0 || stream > 1) return 0;
    seedRandomGenerator(((uint64_t)seedHigh << 32) | seedLow);
    rogue.RNG = stream;
    json.length = 0;
    appendFormat("{\"seed\":\"%llu\",\"stream\":%d,\"values\":[",
                 (unsigned long long)(((uint64_t)seedHigh << 32) | seedLow), stream);
    for (int i = 0; i < count; i++) {
        if (i) appendText(",");
        appendFormat("%ld", rand_range(0, 2147483646));
    }
    appendText("],\"state\":[");
    uint32_t state[8];
    engine_rng_state(state);
    int offset = stream * 4;
    for (int i = 0; i < 4; i++) { if (i) appendText(","); appendFormat("%u", state[offset + i]); }
    appendText("]}");
    return 1;
}
