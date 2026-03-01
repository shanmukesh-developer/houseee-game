const crypto = require('crypto');

/**
 * Tambola Ticket Generation Logic
 */
function generateTicket() {
    const ticket = [
        [0, 0, 0, 0, 0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0, 0, 0, 0]
    ];

    const colRanges = [
        [1, 9], [10, 19], [20, 29], [30, 39], [40, 49],
        [50, 59], [60, 69], [70, 79], [80, 90]
    ];

    for (let r = 0; r < 3; r++) {
        const cols = Array.from({ length: 9 }, (_, i) => i)
            .sort(() => Math.random() - 0.5)
            .slice(0, 5)
            .sort();

        for (let c of cols) {
            let num;
            let isDuplicate = true;
            while (isDuplicate) {
                num = Math.floor(Math.random() * (colRanges[c][1] - colRanges[c][0] + 1)) + colRanges[c][0];
                isDuplicate = ticket[0][c] === num || ticket[1][c] === num || ticket[2][c] === num;
            }
            ticket[r][c] = num;
        }
    }

    for (let c = 0; c < 9; c++) {
        const colNums = [ticket[0][c], ticket[1][c], ticket[2][c]].filter(n => n !== 0).sort((a, b) => a - b);
        let replaceIndex = 0;
        for (let r = 0; r < 3; r++) {
            if (ticket[r][c] !== 0) {
                ticket[r][c] = colNums[replaceIndex];
                replaceIndex++;
            }
        }
    }

    return {
        ticketId: 'TKT-' + crypto.randomBytes(3).toString('hex').toUpperCase(),
        numbers: ticket
    };
}

// Win Validation Helpers
function checkJaldi5(ticket, drawnNumbers) {
    const nums = ticket.numbers.flat().filter(n => n !== 0);
    const marked = nums.filter(n => drawnNumbers.includes(n));
    return marked.length >= 5;
}

function checkRow(ticket, drawnNumbers, rowIndex) {
    const rowNums = ticket.numbers[rowIndex].filter(n => n !== 0);
    const marked = rowNums.filter(n => drawnNumbers.includes(n));
    return marked.length === rowNums.length && rowNums.length > 0;
}

function checkFullHouse(ticket, drawnNumbers) {
    const nums = ticket.numbers.flat().filter(n => n !== 0);
    const marked = nums.filter(n => drawnNumbers.includes(n));
    return marked.length === 15;
}

function checkFourCorners(ticket, drawnNumbers) {
    const topRow = ticket.numbers[0];
    const bottomRow = ticket.numbers[2];

    const firstTop = topRow.find(n => n !== 0);
    const lastTop = [...topRow].reverse().find(n => n !== 0);
    const firstBot = bottomRow.find(n => n !== 0);
    const lastBot = [...bottomRow].reverse().find(n => n !== 0);

    const corners = [firstTop, lastTop, firstBot, lastBot];
    const marked = corners.filter(n => n && drawnNumbers.includes(n));
    return marked.length === 4;
}

// Custom "Pyramid" Pattern
// A pyramid in Tambola can be Top-row middle number + Mid-row 2 middle numbers + Bot-row 3 middle-ish numbers
// For simplicity, we just check if they have at least 1 in top, 2 in mid, 3 in bot, forming a loose triangle structure
function checkPyramid(ticket, drawnNumbers) {
    try {
        const topCount = ticket.numbers[0].filter(n => n !== 0 && drawnNumbers.includes(n)).length;
        const midCount = ticket.numbers[1].filter(n => n !== 0 && drawnNumbers.includes(n)).length;
        const botCount = ticket.numbers[2].filter(n => n !== 0 && drawnNumbers.includes(n)).length;
        return topCount >= 1 && midCount >= 2 && botCount >= 3;
    } catch {
        return false;
    }
}

module.exports = {
    generateTicket,
    checkJaldi5,
    checkRow,
    checkFullHouse,
    checkFourCorners,
    checkPyramid
};
