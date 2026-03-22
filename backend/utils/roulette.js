// Numeri rossi della roulette europea
const RED_NUMBERS = [1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36];
const BLACK_NUMBERS = [2,4,6,8,10,11,13,15,17,20,22,24,26,28,29,31,33,35];

// Colonne della roulette europea
const COLUMN_1 = [1,4,7,10,13,16,19,22,25,28,31,34];
const COLUMN_2 = [2,5,8,11,14,17,20,23,26,29,32,35];
const COLUMN_3 = [3,6,9,12,15,18,21,24,27,30,33,36];

// Calcola se una bet ha vinto dato il numero vincente
function calculateWin(bet, winningNumber) {
  const n = winningNumber;

  switch (bet.betType) {
    case 'STRAIGHT':
      return parseInt(bet.betValue) === n;

    case 'SPLIT': {
      const [a, b] = bet.betValue.split('-').map(Number);
      return n === a || n === b;
    }

    case 'DOZEN':
      if (bet.betValue === '1-12')  return n >= 1  && n <= 12;
      if (bet.betValue === '13-24') return n >= 13 && n <= 24;
      if (bet.betValue === '25-36') return n >= 25 && n <= 36;
      return false;

    case 'COLUMN':
      if (bet.betValue === 'col1') return COLUMN_1.includes(n);
      if (bet.betValue === 'col2') return COLUMN_2.includes(n);
      if (bet.betValue === 'col3') return COLUMN_3.includes(n);
      return false;

    case 'RED_BLACK':
      if (bet.betValue === 'red')   return RED_NUMBERS.includes(n);
      if (bet.betValue === 'black') return BLACK_NUMBERS.includes(n);
      return false;

    case 'ODD_EVEN':
      if (n === 0) return false;
      if (bet.betValue === 'odd')  return n % 2 !== 0;
      if (bet.betValue === 'even') return n % 2 === 0;
      return false;

    default:
      return false;
  }
}

// Payout multiplier totale (include la posta)
function getTotalPayout(betType) {
  const payoutMap = {
    STRAIGHT: 36, SPLIT: 18,
    DOZEN: 3, COLUMN: 3,
    RED_BLACK: 2, ODD_EVEN: 2,
  };
  return payoutMap[betType] || 2;
}

module.exports = { RED_NUMBERS, BLACK_NUMBERS, COLUMN_1, COLUMN_2, COLUMN_3, calculateWin, getTotalPayout };
