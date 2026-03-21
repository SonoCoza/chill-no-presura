import { formatDistanceToNow, format, differenceInSeconds } from 'date-fns';
import { it } from 'date-fns/locale';

export function formatCurrency(amount) {
  return new Intl.NumberFormat('it-IT', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount) + ' €';
}

export function formatOdds(odds) {
  return odds.toFixed(2);
}

export function formatRelativeTime(date) {
  return formatDistanceToNow(new Date(date), { addSuffix: true, locale: it });
}

export function formatDate(date) {
  return format(new Date(date), 'dd/MM/yyyy HH:mm', { locale: it });
}

export function formatDateShort(date) {
  return format(new Date(date), 'dd MMM yyyy', { locale: it });
}

export function getCountdown(closeAt) {
  if (!closeAt) return null;
  const now = new Date();
  const close = new Date(closeAt);
  const diff = differenceInSeconds(close, now);
  if (diff <= 0) return { expired: true, text: 'Scaduto' };

  const days = Math.floor(diff / 86400);
  const hours = Math.floor((diff % 86400) / 3600);
  const minutes = Math.floor((diff % 3600) / 60);
  const seconds = diff % 60;

  if (days > 0) return { expired: false, text: `${days}g ${hours}h ${minutes}m` };
  if (hours > 0) return { expired: false, text: `${hours}h ${minutes}m ${seconds}s` };
  return { expired: false, text: `${minutes}m ${seconds}s` };
}

export function getImpliedProbability(odds) {
  if (!odds || odds <= 0) return 0;
  return Math.round((1 / odds) * 100);
}
