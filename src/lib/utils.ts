import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    minimumFractionDigits: 2,
  }).format(value)
}

export function formatNumber(value: number, fractionDigits?: number): string {
  return new Intl.NumberFormat('en-PH', fractionDigits !== undefined ? {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits
  } : undefined).format(value)
}

export function formatDate(dateStr: string | null): string {
  if (!dateStr) return ''
  return new Date(dateStr).toLocaleDateString('en-PH', {
    year: 'numeric', month: 'long', day: 'numeric'
  })
}

export function calcMilkCost(milkPacks: number, price: number): number {
  return milkPacks * price
}

export function calcServiceFee(milkCost: number, feeRate: number): number {
  return milkCost * feeRate
}
