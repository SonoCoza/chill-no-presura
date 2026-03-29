const RED_NUMBERS = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36];
const COLUMN_1 = [1, 4, 7, 10, 13, 16, 19, 22, 25, 28, 31, 34];
const COLUMN_2 = [2, 5, 8, 11, 14, 17, 20, 23, 26, 29, 32, 35];
const COLUMN_3 = [3, 6, 9, 12, 15, 18, 21, 24, 27, 30, 33, 36];

const TOTAL_PAYOUTS = {
  STRAIGHT: 36,
  SPLIT: 18,
  DOZEN: 3,
  COLUMN: 3,
  RED_BLACK: 2,
  ODD_EVEN: 2,
};

function isWinner(betType, betValue, n) {
  switch (betType) {
    case 'STRAIGHT':
      return parseInt(betValue, 10) === n;
    case 'SPLIT':
      return betValue.split('-').map(Number).includes(n);
    case 'DOZEN':
      if (betValue === '1-12') return n >= 1 && n <= 12;
      if (betValue === '13-24') return n >= 13 && n <= 24;
      if (betValue === '25-36') return n >= 25 && n <= 36;
      return false;
    case 'COLUMN':
      if (betValue === 'col1') return COLUMN_1.includes(n);
      if (betValue === 'col2') return COLUMN_2.includes(n);
      if (betValue === 'col3') return COLUMN_3.includes(n);
      return false;
    case 'RED_BLACK':
      if (betValue === 'red') return RED_NUMBERS.includes(n);
      if (betValue === 'black') return !RED_NUMBERS.includes(n) && n !== 0;
      return false;
    case 'ODD_EVEN':
      if (n === 0) return false;
      if (betValue === 'odd') return n % 2 !== 0;
      if (betValue === 'even') return n % 2 === 0;
      return false;
    default:
      return false;
  }
}

function getNumberColor(n) {
  if (n === 0) return 'green';
  return RED_NUMBERS.includes(n) ? 'red' : 'black';
}

module.exports = { RED_NUMBERS, COLUMN_1, COLUMN_2, COLUMN_3, TOTAL_PAYOUTS, isWinner, getNumberColor };
