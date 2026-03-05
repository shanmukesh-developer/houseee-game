const LUDO_CONFIG = {
    red: { start: 43, homePath: 100 },
    blue: { start: 4, homePath: 400 },
    green: { start: 17, homePath: 200 },
    yellow: { start: 30, homePath: 300 }
};

const SAFE_SPOTS = [4, 12, 17, 25, 30, 38, 43, 51];

/**
 * 
 * @param {string} userId - id of the player moving
 * @param {string} color  - color of the player moving ('red', 'green', 'yellow', 'blue')
 * @param {number} tokenIndex - 0-3 index of the token
 * @param {number} dice - 1-6 dice value
 * @param {object} room - room document references
 * @returns {object} { success: boolean, extraTurn: boolean, capturedUser: string|null, hasWon: boolean }
 */
const processLudoMove = (userId, color, tokenIndex, dice, room) => {
    const tokens = room.tokens[userId];
    const currentPos = tokens[tokenIndex];

    const config = LUDO_CONFIG[color];
    let newPos = currentPos;
    let moveSuccess = false;

    // 1. If inside base
    if (currentPos === -1) {
        if (dice === 6) {
            newPos = 0; // Relative position 0 is START
            moveSuccess = true;
        } else {
            return { success: false, extraTurn: false, capturedUser: null, hasWon: false };
        }
    }
    // 2. If on main path
    else if (currentPos >= 0 && currentPos <= 50) {
        if (currentPos + dice > 50) {
            // Enters home path
            const excessDice = (currentPos + dice) - 50; // 1 to 6
            if (excessDice <= 6) { // Final cell is 6th step. 1 = 100, 6 = 105.
                newPos = config.homePath + excessDice - 1;
                moveSuccess = true;
                if (newPos === config.homePath + 5) {
                    newPos = 999; // Reached final correctly
                }
            }
        } else {
            // Moves forward on main path
            newPos = currentPos + dice;
            moveSuccess = true;
        }
    }
    // 3. If in home path
    else if (currentPos >= 100 && currentPos < 999) {
        const pathStart = config.homePath;
        const finalCell = pathStart + 5;

        if (currentPos + dice <= finalCell) {
            newPos = currentPos + dice;
            moveSuccess = true;
            if (newPos === finalCell) {
                newPos = 999;
            }
        } else {
            // Overshoot, invalid move
            return { success: false, extraTurn: false, capturedUser: null, hasWon: false };
        }
    }
    // 4. Already completed
    else if (currentPos === 999) {
        return { success: false, extraTurn: false, capturedUser: null, hasWon: false };
    }

    if (!moveSuccess) {
        return { success: false, extraTurn: false, capturedUser: null, hasWon: false };
    }

    // Apply new position temporarily for collision checking
    tokens[tokenIndex] = newPos;

    let extraTurn = false;
    let capturedUser = null;

    if (dice === 6) extraTurn = true;
    if (newPos === 999) extraTurn = true;

    // Collision Detection on Main Path
    if (newPos >= 0 && newPos <= 50) {
        const myGlobal = (config.start + newPos) % 52;
        if (!SAFE_SPOTS.includes(myGlobal)) {
            for (const p of room.players) {
                if (p.id === userId) continue;
                const oppColor = room.colors[p.id];
                const oppTokens = room.tokens[p.id];
                const oppConfig = LUDO_CONFIG[oppColor];

                // Find if opponent is on the identical cell
                for (let i = 0; i < 4; i++) {
                    const oppPos = oppTokens[i];
                    if (oppPos >= 0 && oppPos <= 50) {
                        const oppGlobal = (oppConfig.start + oppPos) % 52;
                        if (oppGlobal === myGlobal) {
                            // Kill opponent
                            oppTokens[i] = -1; // Send back to base
                            capturedUser = p.id;
                            extraTurn = true;
                        }
                    }
                }
            }
        }
    }

    const hasWon = tokens.every(t => t === 999);

    return { success: true, extraTurn, capturedUser, hasWon };
};

/**
 * Validates if the user can move ANY token with the given dice roll.
 */
const canMoveAnyToken = (userId, color, dice, tokens) => {
    const config = LUDO_CONFIG[color];
    for (let i = 0; i < 4; i++) {
        const pos = tokens[i];
        if (pos === -1 && dice === 6) return true;
        if (pos >= 0 && pos <= 50) {
            if (pos + dice > 50) {
                const excessDice = (pos + dice) - 50;
                if (excessDice <= 6) return true;
            } else {
                return true;
            }
        }
        if (pos >= config.homePath && pos < config.homePath + 5) {
            if (pos + dice <= config.homePath + 5) return true;
        }
    }
    return false;
};

module.exports = {
    processLudoMove,
    canMoveAnyToken,
    LUDO_CONFIG,
    SAFE_SPOTS
};
