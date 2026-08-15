/**
 * Number-to-words and the currency vocabulary, kept clear of everything else.
 *
 * These are pure functions, but they used to live in lib/utils, which imports
 * the client i18n instance — and that instance pulls in react-i18next, which
 * calls React.createContext on import. Any server-side render of a document
 * therefore failed before it began, because the PDF components reach in here
 * for the legal "amount in words" line. Separating them is what lets a document
 * be built outside a browser.
 */

const UNITS = ['', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf', 'dix', 'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize', 'dix-sept', 'dix-huit', 'dix-neuf'];
const TENS = ['', 'dix', 'vingt', 'trente', 'quarante', 'cinquante', 'soixante', 'soixante', 'quatre-vingt', 'quatre-vingt'];

function convertHundreds(n: number): string {
  if (n === 0) return '';

  let result = '';
  const hundreds = Math.floor(n / 100);
  const remainder = n % 100;

  if (hundreds > 0) {
    if (hundreds === 1) {
      result = 'cent';
    } else {
      result = UNITS[hundreds] + ' cent';
    }
    if (remainder === 0 && hundreds > 1) {
      result += 's';
    }
    if (remainder > 0) {
      result += ' ';
    }
  }

  if (remainder > 0) {
    if (remainder < 20) {
      result += UNITS[remainder];
    } else {
      const tensDigit = Math.floor(remainder / 10);
      const unitDigit = remainder % 10;

      if (tensDigit === 7 || tensDigit === 9) {
        // 70-79 uses soixante-dix, 90-99 uses quatre-vingt-dix
        const base = tensDigit === 7 ? 6 : 8;
        const added = tensDigit === 7 ? 10 + unitDigit : 10 + unitDigit;
        result += TENS[base];
        if (added === 11 && tensDigit === 7) {
          result += ' et onze';
        } else {
          result += '-' + UNITS[added];
        }
      } else if (tensDigit === 8) {
        result += TENS[8];
        if (unitDigit === 0) {
          result += 's';
        } else {
          result += '-' + UNITS[unitDigit];
        }
      } else {
        result += TENS[tensDigit];
        if (unitDigit === 1 && tensDigit !== 8) {
          result += ' et un';
        } else if (unitDigit > 0) {
          result += '-' + UNITS[unitDigit];
        }
      }
    }
  }

  return result;
}

function convertThousands(n: number): string {
  if (n === 0) return 'zéro';
  if (n < 0) return 'moins ' + convertThousands(-n);

  let result = '';

  // Billions. Amounts in dinars are two orders of magnitude larger than in
  // euros, so without this branch convertHundreds() was fed a value above 999
  // and indexed past UNITS, printing "undefined" on the invoice.
  const billions = Math.floor(n / 1000000000);
  if (billions > 0) {
    result += billions === 1 ? 'un milliard' : convertThousands(billions) + ' milliards';
    n %= 1000000000;
    if (n > 0) result += ' ';
  }

  // Millions
  const millions = Math.floor(n / 1000000);
  if (millions > 0) {
    if (millions === 1) {
      result += 'un million';
    } else {
      result += convertThousands(millions) + ' millions';
    }
    n %= 1000000;
    if (n > 0) result += ' ';
  }

  // Thousands
  const thousands = Math.floor(n / 1000);
  if (thousands > 0) {
    if (thousands === 1) {
      result += 'mille';
    } else {
      result += convertHundreds(thousands) + ' mille';
    }
    n %= 1000;
    if (n > 0) result += ' ';
  }

  // Hundreds
  if (n > 0) {
    result += convertHundreds(n);
  }

  return result;
}

export const CURRENCY_WORDS: Record<string, { main: string; sub: string }> = {
  EUR: { main: "euro", sub: "centime" },
  USD: { main: "dollar", sub: "cent" },
  GBP: { main: "livre sterling", sub: "penny" },
  DZD: { main: "dinar", sub: "centime" },
  MAD: { main: "dirham", sub: "centime" },
  TND: { main: "dinar", sub: "millime" },
  CAD: { main: "dollar canadien", sub: "cent" },
  CHF: { main: "franc", sub: "centime" },
};

export function numberToFrenchWords(
  amount: number,
  mainUnit: string = "euro",
  subUnit: string = "centime"
): string {
  // Round to cents FIRST, then split. Rounding the fraction on its own lets
  // 1.995 produce 100 cents, which printed as "un euro et cent centimes"
  // instead of rolling over into "deux euros" — on a legal amount-in-words.
  const totalCents = Math.round(Math.abs(amount) * 100);
  const whole = Math.floor(totalCents / 100);
  const fractional = totalCents % 100;
  const negative = amount < 0 && totalCents > 0;

  let result = '';

  if (whole === 0) {
    result = `zéro ${mainUnit}`;
  } else if (whole === 1) {
    result = `un ${mainUnit}`;
  } else {
    result = convertThousands(whole) + ' ' + mainUnit + 's';
  }

  if (fractional > 0) {
    result += ' et ';
    if (fractional === 1) {
      result += `un ${subUnit}`;
    } else {
      result += convertThousands(fractional) + ' ' + subUnit + 's';
    }
  }

  if (negative) result = 'moins ' + result;

  // Capitalize first letter
  return result.charAt(0).toUpperCase() + result.slice(1);
}
