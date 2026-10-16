/**
 * Converts a dollar amount to English words representation.
 * e.g. 12345.67 → "Twelve Thousand Three Hundred Forty-Five Dollars and Sixty-Seven Cents"
 */
export function numberToWords(amount: number): string {
  if (amount < 0) return `Minus ${numberToWords(Math.abs(amount))}`

  const dollars = Math.floor(amount)
  const cents = Math.round((amount - dollars) * 100)

  const dollarWords = dollars === 0 ? 'Zero' : convertIntegerToWords(dollars)
  const dollarLabel = dollars === 1 ? 'Dollar' : 'Dollars'

  if (cents === 0) {
    return `${dollarWords} ${dollarLabel}`
  }

  const centWords = convertIntegerToWords(cents)
  const centLabel = cents === 1 ? 'Cent' : 'Cents'

  return `${dollarWords} ${dollarLabel} and ${centWords} ${centLabel}`
}

function convertIntegerToWords(num: number): string {
  if (num === 0) return 'Zero'

  const ones = [
    '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight',
    'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen',
    'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen',
  ]
  const tens = [
    '', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy',
    'Eighty', 'Ninety',
  ]
  const scales = ['', 'Thousand', 'Million', 'Billion']

  function convertChunk(n: number): string {
    const parts: string[] = []
    const hundreds = Math.floor(n / 100)
    const remainder = n % 100

    if (hundreds > 0) {
      parts.push(`${ones[hundreds]} Hundred`)
    }

    if (remainder === 0) {
      return parts.join(' ')
    }

    if (remainder < 20) {
      parts.push(ones[remainder])
    } else {
      const tenDigit = Math.floor(remainder / 10)
      const oneDigit = remainder % 10
      parts.push(tens[tenDigit])
      if (oneDigit > 0) {
        parts[parts.length - 1] = `${tens[tenDigit]}-${ones[oneDigit]}`
      }
    }

    return parts.join(' ')
  }

  const chunks: string[] = []
  let scaleIndex = 0
  let remaining = num

  while (remaining > 0) {
    const chunk = remaining % 1000
    if (chunk > 0) {
      const chunkWords = convertChunk(chunk)
      if (scaleIndex > 0) {
        chunks.unshift(`${chunkWords} ${scales[scaleIndex]}`)
      } else {
        chunks.unshift(chunkWords)
      }
    }
    remaining = Math.floor(remaining / 1000)
    scaleIndex++
  }

  return chunks.join(', ')
}