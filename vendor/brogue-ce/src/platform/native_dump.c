/* Source provenance: Brogue CE v1.15.1, commit 1ba4240b7a928ddf0ffb772717bf1d433cd63804; upstream path src/platform/native_dump.c; vendored and modified for this integration (original copyright/AGPL notice retained). */
/*
 * Phase 2 dump-only integration entry point.
 * Origin: Brogue CE src/platform/main.c, commit 1ba4240b7a928ddf0ffb772717bf1d433cd63804.
 * Modified for the native golden reference; Copyright 2012 Brian Walker;
 * this derived file is AGPL-3.0-or-later.
 */
#include <errno.h>
#include <stdio.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>
#include "platform.h"

struct brogueConsole currentConsole;
char dataDirectory[BROGUE_FILENAME_MAX] = ".";
boolean serverMode = false;
boolean nonInteractivePlayback = false;
boolean hasGraphics = false;
enum graphicsModes graphicsMode = TEXT_GRAPHICS;
boolean isCsvFormat = false;
extern struct brogueConsole nullConsole;
extern int engine_generate(uint32_t seed_hi, uint32_t seed_lo, int depth);
extern int engine_rng_vectors(uint32_t seed_hi, uint32_t seed_lo, int stream, int count);
extern const char *engine_result_ptr(void);
extern uint32_t engine_result_len(void);

boolean tryParseUint64(char *str, uint64_t *num) {
    char *end = NULL;
    unsigned long long value;
    if (!str[0]) return false;
    errno = 0;
    value = strtoull(str, &end, 10);
    if (errno == ERANGE || !end || *end || (value == 0 && str[0] != '0')) return false;
    *num = (uint64_t)value;
    return true;
}

boolean tryParseInt(char *str, int lower, int upper, int *value) {
    char *end = NULL;
    long parsed;
    if (!str[0]) return false;
    errno = 0;
    parsed = strtol(str, &end, 10);
    if (errno == ERANGE || !end || *end || parsed < lower || parsed > upper) return false;
    *value = (int)parsed;
    return true;
}

int main(int argc, char **argv) {
    uint64_t seed;
    int value;

    if (argc == 5 && strcmp(argv[1], "--rng") == 0) {
        int stream;
        int count;
        if (!tryParseUint64(argv[2], &seed) || seed == 0 ||
            !tryParseInt(argv[3], 0, 1, &stream) ||
            !tryParseInt(argv[4], 0, 256, &count)) {
            fprintf(stderr, "usage: brogue-dump --rng SEED STREAM COUNT (STREAM 0..1, COUNT 0..256)\n");
            return 2;
        }
        currentConsole = nullConsole;
        if (!engine_rng_vectors((uint32_t)(seed >> 32), (uint32_t)seed, stream, count)) return 1;
        fwrite(engine_result_ptr(), 1, engine_result_len(), stdout);
        fputc('\n', stdout);
        return 0;
    }

    if (argc != 3 || !tryParseUint64(argv[1], &seed) || seed == 0 ||
        !tryParseInt(argv[2], 1, 26, &value)) {
        fprintf(stderr, "usage: brogue-dump SEED DEPTH\n");
        return 2;
    }
    currentConsole = nullConsole;
    if (!engine_generate((uint32_t)(seed >> 32), (uint32_t)seed, value)) return 1;
    fwrite(engine_result_ptr(), 1, engine_result_len(), stdout);
    fputc('\n', stdout);
    return 0;
}
