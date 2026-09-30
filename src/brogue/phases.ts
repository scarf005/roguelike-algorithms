export const PHASE_EXPLANATIONS: Record<
  string,
  { title: string; text: string }
> = {
  clearLevel: {
    title: "Fill with granite",
    text:
      "clearLevel() clears the map and fills the dungeon layer with granite. Generation begins with solid rock, not empty rooms.",
  },
  rooms: {
    title: "Attach rooms",
    text:
      "carveDungeon() designs the first room from a depth-adjusted profile. attachRooms() designs rooms and optional hallways, then slides each candidate onto a door site. roomFitsAt() rejects placements outside the map or beside existing floor. The door sites are possibilities, not yet doors.",
  },
  loops: {
    title: "Connect loops",
    text:
      "addLoops(grid, 20) looks for rock with floor on opposite sides. A connection becomes a door site only when its existing path distance is strictly greater than 20, shortening a long detour.",
  },
  terrain: {
    title: "Convert to terrain",
    text:
      "digDungeon() converts the room grid to terrain layers. Door sites have a 60% chance to become doors, otherwise floor. finishWalls(false) outlines the carved space with walls.",
  },
  lakes: {
    title: "Design and fill lakes",
    text:
      "designLakes() makes six successively smaller blobs and tries up to 20 positions for each. lakeDisruptsPassability() rejects a position if dry passable cells become disconnected. fillLakes(), liquidType() and createWreath() fill accepted regions and their shallow edges.",
  },
  decoration: {
    title: "Decorate and repair diagonals",
    text:
      "runAutogenerators(false) adds depth-appropriate terrain and dungeon features without area machines. removeDiagonalOpenings() then repairs diagonal-only openings before machine placement.",
  },
  machines: {
    title: "Analyze chokes and build machines",
    text:
      "analyzeMap(true) identifies choke points. addMachines() uses reward-room history from earlier depths; buildAMachine() selects blueprints, interiors, features, items and monsters. Failed attempts can roll back. At depth 26, the engine also attempts the amulet area.",
  },
  finalArchitecture: {
    title: "Finish architecture",
    text:
      "runAutogenerators(true) adds area machines. cleanUpLakeBoundaries() merges compatible edges. buildABridge() repeatedly looks for eligible spans that shorten a detour, avoiding machines and secret trapdoors. finishDoors() and finishWalls(true) tidy doors and exposed rock.",
  },
  stairsPopulation: {
    title: "Place stairs and populate",
    text:
      "placeStairs() positions the stairs; failure retries dungeon generation. initializeLevel() populates items and monsters and restores entities from other depths. These calls consume RNG and cannot be skipped for an exact entered map.",
  },
  firstEntry: {
    title: "Simulate first entry",
    text:
      "startLevel() restores the ongoing RNG and calls updateEnvironment() 50 times before entry. Gas, liquids and other terrain can change. The final view matches the fresh, sequential first-entry sequence used by Brogue's seed catalog, not an arbitrary played save.",
  },
}

export const phaseTitle = (phase: string) =>
  PHASE_EXPLANATIONS[phase]?.title ?? phase
